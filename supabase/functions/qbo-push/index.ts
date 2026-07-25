// qbo-push — QuickBooks Online invoice/payment sync.
//
// SECURITY: this function had no authentication. verify_jwt was off, CORS was
// open to *, and the handler checked nothing. Its URL is hardcoded in
// index.html, which is served publicly, so anyone could call:
//   - list_invoices  → read every invoice, customer name, amount and balance
//   - push_invoice / push_payment / update_invoice → write into the books
// It now requires the same app JWT as the rest of the app.
//
// The QBO client secret was also inlined as a literal fallback; it now comes
// from QBO_CLIENT_SECRET only, so the secret is not sitting in source.
//
// Requires QBO_CLIENT_ID, QBO_CLIENT_SECRET, APP_JWT_SECRET.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verify } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

const CLIENT_ID = Deno.env.get('QBO_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('QBO_CLIENT_SECRET')!;
const SU = Deno.env.get('SUPABASE_URL')!;
const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const JWT_SECRET = Deno.env.get('APP_JWT_SECRET') || '';
const QBO_BASE = 'https://quickbooks.api.intuit.com';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

function ok(data: any) { return new Response(JSON.stringify(data), { headers: { ...cors, 'Content-Type': 'application/json' } }); }
function fail(msg: string) { return new Response(JSON.stringify({ error: msg }), { headers: { ...cors, 'Content-Type': 'application/json' } }); }
function disconnected(detail: string) { return new Response(JSON.stringify({ error: 'QuickBooks disconnected — reconnect required.', qbo_disconnected: true, detail }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }); }

async function jwtKey() {
  return await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
  );
}

async function isSignedIn(req: Request) {
  if (!JWT_SECRET) return false;
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  try { await verify(auth.slice(7), await jwtKey()); return true; } catch { return false; }
}

async function refreshTokens(supabase: any, rt: string) {
  const basic = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt })
  });
  const t = await res.json();
  if (t.error === 'invalid_grant' || t.error === 'AuthenticationFailed') throw { qbo_disconnected: true, message: t.error_description || t.error };
  if (!t.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(t));
  await supabase.from('qbo_tokens').update({
    access_token: t.access_token,
    refresh_token: t.refresh_token || rt,
    expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString()
  }).eq('id', 1);
  return { accessToken: t.access_token, refreshToken: t.refresh_token || rt };
}

async function lookupActive(baseUrl: string, h: any, entity: string, field: string, value: string): Promise<string | null> {
  try {
    const q = `SELECT * FROM ${entity} WHERE ${field} = '${value.replace(/'/g, "\\'")}'  MAXRESULTS 1`;
    const r = await fetch(`${baseUrl}/query?query=${encodeURIComponent(q)}&minorversion=73`, { headers: h });
    const d = await r.json();
    const item = d.QueryResponse?.[entity]?.[0];
    if (!item || item.Active === false) return null;
    return item.Id || null;
  } catch { return null; }
}

async function getDefaultTaxCodeId(baseUrl: string, h: any): Promise<string | null> {
  try {
    const q = `SELECT * FROM TaxCode WHERE Active = true MAXRESULTS 10`;
    const r = await fetch(`${baseUrl}/query?query=${encodeURIComponent(q)}&minorversion=73`, { headers: h });
    const d = await r.json();
    const codes = d.QueryResponse?.TaxCode || [];
    const taxable = codes.find((c: any) => c.Name === 'TAX' || c.Taxable === true);
    return taxable?.Id || codes[0]?.Id || null;
  } catch { return null; }
}

async function ensureCustomer(baseUrl: string, h: any, name: string): Promise<string> {
  const q = `SELECT * FROM Customer WHERE DisplayName = '${name.replace(/'/g, "\\'")}'  MAXRESULTS 5`;
  const r = await fetch(`${baseUrl}/query?query=${encodeURIComponent(q)}&minorversion=73`, { headers: h });
  const d = await r.json();
  const customers = d.QueryResponse?.Customer || [];
  const active = customers.find((c: any) => c.Active !== false);
  if (active) return active.Id;
  if (customers.length > 0) {
    const c = customers[0];
    const rr = await fetch(`${baseUrl}/customer?minorversion=73`, { method: 'POST', headers: h, body: JSON.stringify({ Id: c.Id, SyncToken: c.SyncToken, sparse: true, Active: true, DisplayName: c.DisplayName }) });
    const rd = await rr.json();
    if (rd.Customer?.Id) return rd.Customer.Id;
  }
  const nc = await fetch(`${baseUrl}/customer?minorversion=73`, { method: 'POST', headers: h, body: JSON.stringify({ DisplayName: name }) });
  const nd = await nc.json();
  if (!nd.Customer?.Id) throw new Error('Failed to create customer: ' + JSON.stringify(nd).slice(0, 200));
  return nd.Customer.Id;
}

function qboErr(d: any): string {
  try {
    const f = d?.Fault?.Error?.[0];
    if (f) return `${f.Message || ''} ${f.Detail || ''}`.trim();
    if (d?.error) return d.error;
  } catch {}
  return JSON.stringify(d).slice(0, 300);
}

async function ensureItem(baseUrl: string, h: any, name: string): Promise<string | null> {
  const existing = await lookupActive(baseUrl, h, 'Item', 'Name', name);
  if (existing) return existing;
  try {
    const incomeAcct = await lookupActive(baseUrl, h, 'Account', 'Name', 'Sales');
    const body: any = { Name: name, Type: 'Service' };
    if (incomeAcct) body.IncomeAccountRef = { value: incomeAcct };
    const r = await fetch(`${baseUrl}/item?minorversion=73`, { method: 'POST', headers: h, body: JSON.stringify(body) });
    const d = await r.json();
    return d.Item?.Id || null;
  } catch { return null; }
}

async function buildLines(baseUrl: string, h: any, lineItems: any[]) {
  const usesEquipment = lineItems.some((li: any) => li.item_name === 'Equipment');
  const [laborId, stockId, nonStockId, ccFeeId, equipmentId] = await Promise.all([
    lookupActive(baseUrl, h, 'Item', 'Name', 'Labor'),
    lookupActive(baseUrl, h, 'Item', 'Name', 'Parts - Stock'),
    lookupActive(baseUrl, h, 'Item', 'Name', 'Parts - Non-Stock'),
    lookupActive(baseUrl, h, 'Item', 'Name', '3% Processing fee'),
    usesEquipment ? ensureItem(baseUrl, h, 'Equipment') : Promise.resolve(null),
  ]);
  return Promise.all(lineItems.map(async (li: any, i: number) => {
    let itemId: string | null = null;
    if (li.item_name === 'Labor') itemId = laborId;
    else if (li.item_name === 'Parts - Stock') itemId = stockId;
    else if (li.item_name === 'Parts - Non-Stock') itemId = nonStockId;
    else if (li.item_name === '3% Processing fee' || li.item_name === 'Non-Inventory') itemId = ccFeeId;
    else if (li.item_name === 'Equipment') itemId = equipmentId;
    // Safety net: any category not explicitly handled above gets its own
    // real, looked-up-or-created Item rather than an ItemRef with no
    // value — an ItemRef without a value is what let QBO silently fall
    // back to an unrelated Item ("Testt") on the Equipment line before
    // this fix existed.
    if (!itemId) itemId = await ensureItem(baseUrl, h, li.item_name || 'Misc');
    return {
      LineNum: i + 1,
      Description: li.description,
      Amount: parseFloat(Math.abs(li.amount).toFixed(2)),
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        ItemRef: itemId ? { value: itemId, name: li.item_name } : { name: li.item_name },
        Qty: Math.abs(li.qty || 1),
        UnitPrice: parseFloat(Math.abs(li.rate).toFixed(2)),
        TaxCodeRef: { value: li.taxable === false ? 'NON' : 'TAX' }
      }
    };
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method === 'GET') return ok({ ok: true });

  // Every action below reads or writes real accounting data, so the gate goes
  // before the body is even parsed.
  if (!(await isSignedIn(req))) {
    return new Response(JSON.stringify({ error: 'Sign in to use QuickBooks features' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  let body: any;
  try { body = await req.json(); } catch { return fail('Invalid JSON'); }

  const supabase = createClient(SU, SK);
  const { action } = body;

  if (action === 'status') {
    const { data } = await supabase.from('qbo_tokens').select('realm_id,expires_at,updated_at,access_token').eq('id', 1).single();
    const connected = !!(data?.realm_id && data?.access_token);
    const days = data?.updated_at ? (Date.now() - new Date(data.updated_at).getTime()) / 86400000 : 999;
    return ok({ connected, realm_id: data?.realm_id, updated_at: data?.updated_at, expires_at: data?.expires_at, token_warning: days > 85, days_since_auth: Math.round(days) });
  }

  if (action === 'refresh') {
    const { data: tok } = await supabase.from('qbo_tokens').select('*').eq('id', 1).single();
    if (!tok?.refresh_token) return disconnected('No refresh token');
    try {
      await refreshTokens(supabase, tok.refresh_token);
      return ok({ success: true, message: 'Token refreshed' });
    } catch (e: any) {
      if (e?.qbo_disconnected) return disconnected(e.message);
      return fail(e.message);
    }
  }

  const { data: tok } = await supabase.from('qbo_tokens').select('*').eq('id', 1).single();
  if (!tok?.realm_id || !tok?.access_token) return disconnected('No token stored');

  let accessToken = tok.access_token;
  let currentRefreshToken = tok.refresh_token;
  if (new Date(tok.expires_at || 0) < new Date(Date.now() + 10 * 60 * 1000)) {
    try {
      const refreshed = await refreshTokens(supabase, currentRefreshToken);
      accessToken = refreshed.accessToken;
      currentRefreshToken = refreshed.refreshToken;
    } catch (e: any) { if (e.qbo_disconnected) return disconnected(e.message); throw e; }
  }

  const baseUrl = `${QBO_BASE}/v3/company/${tok.realm_id}`;
  let h: any = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' };

  async function qboFetch(url: string, opts: RequestInit = {}): Promise<Response> {
    let r = await fetch(url, { ...opts, headers: { ...h, ...(opts.headers || {}) } });
    if (r.status === 401) {
      const { data: ft } = await supabase.from('qbo_tokens').select('*').eq('id', 1).single();
      const refreshed = await refreshTokens(supabase, ft.refresh_token);
      accessToken = refreshed.accessToken;
      h = { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' };
      r = await fetch(url, { ...opts, headers: { ...h, ...(opts.headers || {}) } });
    }
    return r;
  }

  try {
    if (action === 'list_invoices') {
      const max = Math.min(parseInt(body.max_results) || 50, 200);
      const q = `SELECT * FROM Invoice ORDERBY MetaData.LastUpdatedTime DESC MAXRESULTS ${max}`;
      const r = await qboFetch(`${baseUrl}/query?query=${encodeURIComponent(q)}&minorversion=73`);
      const d = await r.json();
      if (d.Fault) return fail(qboErr(d));
      const invoices = (d.QueryResponse?.Invoice || []).map((inv: any) => ({
        Id: inv.Id, DocNumber: inv.DocNumber, TxnDate: inv.TxnDate, DueDate: inv.DueDate,
        TotalAmt: inv.TotalAmt, Balance: inv.Balance, CustomerName: inv.CustomerRef?.name || '',
        Active: inv.Active !== false, EmailStatus: inv.EmailStatus, LastUpdated: inv.MetaData?.LastUpdatedTime || null
      }));
      return ok({ invoices, count: invoices.length });
    }

    if (action === 'check_invoice') {
      const { qbo_invoice_id } = body;
      const r = await qboFetch(`${baseUrl}/invoice/${qbo_invoice_id}?minorversion=73`);
      const d = await r.json();
      return ok({ invoice: d.Invoice ? { Id: d.Invoice.Id, DocNumber: d.Invoice.DocNumber, Balance: d.Invoice.Balance, status: d.Invoice.EmailStatus, Active: d.Invoice.Active } : null, fault: d.Fault || null });
    }

    if (action === 'push_payment') {
      const { qbo_invoice_id: qboInvId, customer_name, payment } = body;
      if (!qboInvId) return fail('qbo_invoice_id required');
      if (!payment?.amount) return fail('payment.amount required');
      const invCheck = await qboFetch(`${baseUrl}/invoice/${qboInvId}?minorversion=73`);
      const invCheckData = await invCheck.json();
      if (!invCheckData.Invoice?.Id) return fail('Invoice ' + qboInvId + ' not found in QBO: ' + qboErr(invCheckData));
      if (invCheckData.Invoice.Active === false) return fail('Invoice ' + qboInvId + ' is inactive/voided in QBO');
      if (parseFloat(invCheckData.Invoice.Balance || '0') <= 0) {
        return ok({ success: true, skipped: true, reason: 'Invoice balance is $0 — already fully paid in QBO', qbo_invoice_id: qboInvId });
      }
      const custId = await ensureCustomer(baseUrl, h, customer_name || 'Customer');
      const pmtMethodId = await lookupActive(baseUrl, h, 'PaymentMethod', 'Name', payment.method || 'Other');
      const pmtDate = (payment.date || new Date().toISOString()).split('T')[0];
      const pmtAmt = Math.min(parseFloat(parseFloat(payment.amount).toFixed(2)), parseFloat(invCheckData.Invoice.Balance));
      const payload: any = { TotalAmt: pmtAmt, CustomerRef: { value: custId }, TxnDate: pmtDate, Line: [{ Amount: pmtAmt, LinkedTxn: [{ TxnId: String(qboInvId), TxnType: 'Invoice' }] }] };
      if (pmtMethodId) payload.PaymentMethodRef = { value: pmtMethodId };
      if (payment.note) payload.PrivateNote = payment.note;
      const r = await qboFetch(`${baseUrl}/payment?minorversion=73`, { method: 'POST', body: JSON.stringify(payload) });
      const d = await r.json();
      if (!d.Payment?.Id) return fail(qboErr(d));
      return ok({ success: true, qbo_payment_id: d.Payment.Id, amount: d.Payment.TotalAmt });
    }

    if (action === 'push_invoice') {
      const { invoice } = body;
      if (!invoice) return fail('invoice required');
      const custId = await ensureCustomer(baseUrl, h, invoice.customer_name || 'Customer');
      const lines = await buildLines(baseUrl, h, invoice.line_items);

      const invBody: any = {
        DocNumber: invoice.invoice_number.toString(), TxnDate: invoice.date, DueDate: invoice.due_date,
        CustomerRef: { value: custId }, Line: lines, CustomerMemo: { value: invoice.memo || '' },
        AllowOnlineCreditCardPayment: true, AllowOnlineACHPayment: true
      };

      // Override QBO's automated tax calc with the app's exact dollar amount
      // so the invoice total matches the app exactly. AST honors an explicit
      // TotalTax when supplied, instead of recomputing it independently.
      if (typeof invoice.tax_amount === 'number' && invoice.tax_amount > 0) {
        const taxCodeId = await getDefaultTaxCodeId(baseUrl, h);
        if (taxCodeId) {
          invBody.TxnTaxDetail = { TotalTax: parseFloat(invoice.tax_amount.toFixed(2)), TxnTaxCodeRef: { value: taxCodeId } };
        }
      }

      const invR = await qboFetch(`${baseUrl}/invoice?minorversion=73`, { method: 'POST', body: JSON.stringify(invBody) });
      const rawText = await invR.text();
      let invData: any;
      try { invData = JSON.parse(rawText); } catch { return fail('QBO non-JSON: ' + rawText.slice(0, 200)); }
      if (!invData.Invoice?.Id) return fail(qboErr(invData));
      const qboInvId = invData.Invoice.Id;
      const pushedPayments: any[] = [];
      for (const pmt of (invoice.payments || [])) {
        try {
          const pmtMethodId = await lookupActive(baseUrl, h, 'PaymentMethod', 'Name', pmt.method || 'Other');
          const pmtAmt = parseFloat(parseFloat(pmt.amount).toFixed(2));
          const pp: any = { TotalAmt: pmtAmt, CustomerRef: { value: custId }, TxnDate: (pmt.date || new Date().toISOString()).split('T')[0], Line: [{ Amount: pmtAmt, LinkedTxn: [{ TxnId: qboInvId, TxnType: 'Invoice' }] }] };
          if (pmtMethodId) pp.PaymentMethodRef = { value: pmtMethodId };
          if (pmt.note) pp.PrivateNote = pmt.note;
          const pr = await qboFetch(`${baseUrl}/payment?minorversion=73`, { method: 'POST', body: JSON.stringify(pp) });
          const pd = await pr.json();
          if (pd.Payment?.Id) pushedPayments.push({ id: pd.Payment.Id, amount: pmtAmt });
          else pushedPayments.push({ error: qboErr(pd), amount: pmt.amount });
        } catch (pe: any) { pushedPayments.push({ error: pe.message, amount: pmt.amount }); }
      }
      return ok({ success: true, qbo_invoice_id: qboInvId, qbo_total: invData.Invoice.TotalAmt, qbo_doc: invData.Invoice.DocNumber, payment_link: invData.Invoice.InvoiceLink || '', payments_pushed: pushedPayments, debug_sent_lines: lines, debug_sent_taxdetail: invBody.TxnTaxDetail || null, debug_returned_taxdetail: invData.Invoice.TxnTaxDetail || null, debug_returned_lines: invData.Invoice.Line });
    }

    if (action === 'update_invoice') {
      const { qbo_invoice_id: qboInvId, invoice } = body;
      if (!qboInvId) return fail('qbo_invoice_id required');
      if (!invoice) return fail('invoice required');
      const fetchR = await qboFetch(`${baseUrl}/invoice/${qboInvId}?minorversion=73`);
      const fetchD = await fetchR.json();
      if (!fetchD.Invoice?.Id) return fail('Invoice ' + qboInvId + ' not found in QBO: ' + qboErr(fetchD));
      if (fetchD.Invoice.Active === false) return fail('Invoice is voided in QBO — cannot update');
      const syncToken = fetchD.Invoice.SyncToken;
      const custId = await ensureCustomer(baseUrl, h, invoice.customer_name || 'Customer');
      const lines = await buildLines(baseUrl, h, invoice.line_items);
      const updatePayload: any = { Id: String(qboInvId), SyncToken: syncToken, sparse: true, CustomerRef: { value: custId }, Line: lines, CustomerMemo: { value: invoice.memo || '' }, TxnDate: invoice.date, DueDate: invoice.due_date, AllowOnlineCreditCardPayment: true, AllowOnlineACHPayment: true };

      if (typeof invoice.tax_amount === 'number' && invoice.tax_amount > 0) {
        const taxCodeId = await getDefaultTaxCodeId(baseUrl, h);
        if (taxCodeId) {
          updatePayload.TxnTaxDetail = { TotalTax: parseFloat(invoice.tax_amount.toFixed(2)), TxnTaxCodeRef: { value: taxCodeId } };
        }
      }

      const updateR = await qboFetch(`${baseUrl}/invoice?minorversion=73&operation=update`, { method: 'POST', body: JSON.stringify(updatePayload) });
      const updateD = await updateR.json();
      if (!updateD.Invoice?.Id) return fail(qboErr(updateD));
      return ok({ success: true, qbo_invoice_id: updateD.Invoice.Id, qbo_total: updateD.Invoice.TotalAmt, qbo_balance: updateD.Invoice.Balance, qbo_doc: updateD.Invoice.DocNumber, debug_sent_lines: lines, debug_sent_taxdetail: updatePayload.TxnTaxDetail || null, debug_returned_taxdetail: updateD.Invoice.TxnTaxDetail || null, debug_returned_lines: updateD.Invoice.Line });
    }

    if (action === 'get_payment_link') {
      const { qbo_invoice_id: qboInvId } = body;
      if (!qboInvId) return fail('qbo_invoice_id required');
      const r = await qboFetch(`${baseUrl}/invoice/${qboInvId}?minorversion=73`);
      const d = await r.json();
      if (!d.Invoice) return fail('Invoice not found');
      if (d.Invoice.InvoiceLink) return ok({ payment_link: d.Invoice.InvoiceLink });
      const ur = await qboFetch(`${baseUrl}/invoice?minorversion=73`, { method: 'POST', body: JSON.stringify({ Id: d.Invoice.Id, SyncToken: d.Invoice.SyncToken, sparse: true, AllowOnlineCreditCardPayment: true, AllowOnlineACHPayment: true }) });
      const ud = await ur.json();
      return ok({ payment_link: ud.Invoice?.InvoiceLink || '' });
    }

    return fail('Unknown action: ' + action);

  } catch (e: any) {
    if (e?.qbo_disconnected) return disconnected(e.message || 'Token error');
    console.error('qbo-push error:', e.message);
    return fail(e.message || 'Unknown error');
  }
});
