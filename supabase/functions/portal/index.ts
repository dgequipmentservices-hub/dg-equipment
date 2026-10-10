// portal — everything the customer portal (portal.html) is allowed to do.
//
// Customers never get a key to the database. The app's own JWT (app-auth)
// unlocks every table under RLS `authenticated_all`, so handing anything
// like it to a customer would hand them every customer's invoices. Instead
// this function holds the service role, and each request is answered with
// only the rows that belong to the signed-in customer, already worked out
// (totals, balances, statement) so the page has nothing to compute or trust.
//
// Sign-in is a one-time code, never a password:
//   - by text, through Twilio Verify, when TWILIO_ACCOUNT_SID,
//     TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SID are set;
//   - by email, through the same Gmail account send-invoice uses
//     (GMAIL_USER / GMAIL_APP_PASSWORD), always.
// Only a phone or email already on a customer card can sign in — there is
// no sign-up. The answer to "send me a code" is the same whether or not the
// number is on file, so the form can't be used to find out who's a customer.
// A code lasts 10 minutes and allows 5 tries; a contact gets at most 5 codes
// an hour. A session is a random token (only its hash is stored) that lasts
// 12 hours, or 90 days with "keep me signed in". Turning a customer's
// portal off in the app (customers.portal_disabled) ends their sessions on
// the very next request.
//
// Everything a customer does lands in portal_log, which the app shows as
// "Portal activity". Service requests and "I sent Zelle" also email the shop.
//
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (injected), GMAIL_USER,
// GMAIL_APP_PASSWORD. Optional: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
// TWILIO_VERIFY_SID. Deploy with verify_jwt off — the function does its own
// auth, and customers have no Supabase JWT to send.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GMAIL_USER = Deno.env.get('GMAIL_USER') || '';
const GMAIL_APP_PASSWORD = (Deno.env.get('GMAIL_APP_PASSWORD') || '').replace(/\s+/g, '');
const TW_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TW_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';
const TW_VERIFY = Deno.env.get('TWILIO_VERIFY_SID') || '';
const SMS_ON = !!(TW_SID && TW_TOKEN && TW_VERIFY);
const EMAIL_ON = !!(GMAIL_USER && GMAIL_APP_PASSWORD);

const SHOP = {
  name: 'DG Equipment Repair & Services',
  owner: 'Danny Gustus',
  phone: '(516) 350-8898',
  phone_digits: '5163508898',
  email: 'dgequipmentservices@gmail.com',
};

const CODE_MINUTES = 10;
const CODE_TRIES = 5;
const CODES_PER_HOUR = 5;
const CODES_PER_IP_HOUR = 15;
const SHORT_SESSION_H = 12;
const LONG_SESSION_D = 90;
const TAX = 0.08625;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-portal-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// ── small helpers ─────────────────────────────────────────────────────
const enc = new TextEncoder();
async function sha256(s: string) {
  const b = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
}
function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomCode() {
  // Uniform 000000–999999 (rejection sampling avoids modulo bias).
  const max = 4294967296 - (4294967296 % 1000000);
  while (true) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0];
    if (n < max) return String(n % 1000000).padStart(6, '0');
  }
}
function digits10(s: unknown) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return d.length === 10 ? d : '';
}
function normEmail(s: unknown) {
  const e = String(s || '').trim().toLowerCase();
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e) ? e : '';
}
// One card can hold "516-555-1234 / 516-555-9876" or two emails.
function phonesOf(c: any) {
  return String(c.phone || '').split(/[\/,;]|\bor\b|\bcell\b|\bhome\b|\bwork\b/i).map(digits10).filter(Boolean);
}
function emailsOf(c: any) {
  return String(c.email || '').split(/[\s,;\/]+/).map(normEmail).filter(Boolean);
}
function maskPhone(d: string) { return '(' + d.slice(0, 3) + ') ···-' + d.slice(6); }
function maskEmail(e: string) { const [u, h] = e.split('@'); return u.slice(0, 1) + '···@' + h; }
function clientIp(req: Request) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || '';
}
function clip(s: unknown, n: number) { return String(s ?? '').slice(0, n); }
function esc(s: unknown) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

async function log(customerId: string | null, event: string, detail: Record<string, unknown> = {}, req?: Request) {
  try {
    await db.from('portal_log').insert({
      customer_id: customerId, event,
      detail: { ...detail, ...(req ? { ip: clientIp(req), ua: clip(req.headers.get('user-agent'), 160) } : {}) },
    });
  } catch (_) { /* logging never blocks the customer */ }
}

async function sendMail(to: string, subject: string, text: string, html?: string) {
  if (!EMAIL_ON) throw new Error('Email is not set up');
  const client = new SMTPClient({
    connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD } },
  });
  try {
    await client.send({ from: `${SHOP.name} <${GMAIL_USER}>`, to, subject, content: text, ...(html ? { html } : {}) });
  } finally {
    try { await client.close(); } catch (_) { /* ignore */ }
  }
}
async function tellShop(subject: string, lines: string[]) {
  if (!EMAIL_ON) return;
  try { await sendMail(GMAIL_USER, subject, lines.join('\n')); } catch (_) { /* best effort */ }
}

async function twilio(path: string, form: Record<string, string>) {
  const r = await fetch(`https://verify.twilio.com/v2/Services/${TW_VERIFY}/${path}`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(TW_SID + ':' + TW_TOKEN), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, d };
}

// ── who can sign in ───────────────────────────────────────────────────
async function matchCustomers(kind: 'phone' | 'email', value: string) {
  const { data } = await db.from('customers').select('id,name,phone,email,portal_disabled');
  return (data || []).filter((c: any) => !c.portal_disabled &&
    (kind === 'phone' ? phonesOf(c).includes(value) : emailsOf(c).includes(value)));
}

function parseContact(raw: unknown): { kind: 'phone' | 'email'; value: string } | null {
  const s = String(raw || '').trim();
  if (s.includes('@')) { const e = normEmail(s); return e ? { kind: 'email', value: e } : null; }
  const d = digits10(s); return d ? { kind: 'phone', value: d } : null;
}

async function start(body: any, req: Request) {
  const c = parseContact(body.contact);
  if (!c) return json({ error: body.contact && String(body.contact).includes('@') ? 'That email doesn’t look right.' : 'Enter a 10-digit cell number.' }, 400);
  if (c.kind === 'phone' && !SMS_ON) return json({ error: 'Text codes aren’t set up yet — use your email instead.', use_email: true }, 400);
  if (c.kind === 'email' && !EMAIL_ON) return json({ error: 'Email codes aren’t set up yet.' }, 503);

  const hourAgo = new Date(Date.now() - 3600e3).toISOString();
  const ip = clientIp(req);
  const [{ count: perDest }, { count: perIp }] = await Promise.all([
    db.from('portal_codes').select('id', { count: 'exact', head: true }).eq('destination', c.value).gte('created_at', hourAgo),
    ip ? db.from('portal_codes').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', hourAgo)
       : Promise.resolve({ count: 0 } as any),
  ]);
  if ((perDest || 0) >= CODES_PER_HOUR || (perIp || 0) >= CODES_PER_IP_HOUR) {
    return json({ error: 'Too many codes asked for. Wait a bit and try again, or call ' + SHOP.phone + '.' }, 429);
  }

  const matches = await matchCustomers(c.kind, c.value);
  const sentTo = c.kind === 'phone' ? maskPhone(c.value) : maskEmail(c.value);
  // Same answer either way — see the header.
  const answer = json({ ok: true, kind: c.kind, sent_to: sentTo });

  const row: Record<string, unknown> = {
    channel: c.kind === 'phone' ? 'sms' : 'email', destination: c.value, ip,
    customer_ids: matches.map((m: any) => m.id),
    expires_at: new Date(Date.now() + CODE_MINUTES * 60e3).toISOString(),
  };
  if (!matches.length) {
    row.unknown = true;
    await db.from('portal_codes').insert(row);
    await log(null, 'unknown_contact', { contact: sentTo }, req);
    return answer;
  }

  if (c.kind === 'phone') {
    const r = await twilio('Verifications', { To: '+1' + c.value, Channel: 'sms' });
    if (!r.ok) {
      await log(matches[0].id, 'code_failed', { channel: 'sms', why: clip((r.d as any).message, 200) }, req);
      return json({ error: 'Couldn’t send the text just now. Try your email, or call ' + SHOP.phone + '.' }, 502);
    }
  } else {
    const code = randomCode();
    const id = crypto.randomUUID();
    row.id = id;
    row.code_hash = await sha256(id + ':' + code);
    try {
      await sendMail(c.value, `Your DG Equipment Repair sign-in code: ${code}`,
        `Your sign-in code is ${code}\n\nIt works for ${CODE_MINUTES} minutes. If you didn’t ask for it, you can ignore this email.\n\n${SHOP.name}\n${SHOP.phone}`,
        `<div style="font-family:Arial,sans-serif;font-size:15px;color:#191c20">
           <p>Your DG Equipment Repair sign-in code is</p>
           <p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:8px 0">${code}</p>
           <p style="color:#565d66">It works for ${CODE_MINUTES} minutes. If you didn’t ask for it, you can ignore this email.</p>
           <p style="color:#565d66">${SHOP.name}<br>${SHOP.phone}</p></div>`);
    } catch (e) {
      await log(matches[0].id, 'code_failed', { channel: 'email', why: clip((e as Error).message, 200) }, req);
      return json({ error: 'Couldn’t send the email just now. Call ' + SHOP.phone + '.' }, 502);
    }
  }
  await db.from('portal_codes').insert(row);
  for (const m of matches) await log(m.id, 'code_sent', { channel: row.channel, to: sentTo }, req);
  return answer;
}

async function verify(body: any, req: Request) {
  const c = parseContact(body.contact);
  const code = String(body.code || '').replace(/\D/g, '');
  if (!c || code.length !== 6) return json({ error: 'Enter the 6-digit code.' }, 400);

  const { data: rows } = await db.from('portal_codes').select('*')
    .eq('destination', c.value).is('used_at', null).gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1);
  const row: any = rows && rows[0];
  if (!row) return json({ error: 'That code has expired. Ask for a new one.', expired: true }, 400);
  if ((row.attempts || 0) >= CODE_TRIES) return json({ error: 'Too many wrong tries. Ask for a new code.', expired: true }, 400);
  await db.from('portal_codes').update({ attempts: (row.attempts || 0) + 1 }).eq('id', row.id);

  let good = false;
  if (!row.unknown) {
    if (row.channel === 'sms') {
      const r = await twilio('VerificationCheck', { To: '+1' + c.value, Code: code });
      good = r.ok && (r.d as any).status === 'approved';
    } else {
      good = (await sha256(row.id + ':' + code)) === row.code_hash;
    }
  }
  const ids: string[] = row.customer_ids || [];
  if (!good) {
    if ((row.attempts || 0) + 1 >= 3) for (const id of ids) await log(id, 'bad_code', { tries: (row.attempts || 0) + 1 }, req);
    return json({ error: 'That code isn’t right. Check the text or email and try again.' }, 400);
  }
  // Re-check access: the shop may have switched it off in the last 10 minutes.
  const { data: still } = await db.from('customers').select('id').in('id', ids).eq('portal_disabled', false);
  const live = (still || []).map((x: any) => x.id);
  if (!live.length) return json({ error: 'Online access is off for this account. Call ' + SHOP.phone + '.' }, 403);

  await db.from('portal_codes').update({ used_at: new Date().toISOString() }).eq('id', row.id);
  const token = randomToken();
  const remember = body.remember !== false;
  const expires = new Date(Date.now() + (remember ? LONG_SESSION_D * 864e5 : SHORT_SESSION_H * 3600e3));
  await db.from('portal_sessions').insert({
    customer_ids: live, token_hash: await sha256(token), expires_at: expires.toISOString(),
    channel: row.channel, user_agent: clip(req.headers.get('user-agent'), 200), last_seen: new Date().toISOString(),
  });
  for (const id of live) await log(id, 'sign_in', { channel: row.channel, remember }, req);
  return json({ ok: true, token, expires_at: expires.toISOString() });
}

async function session(req: Request) {
  const tok = req.headers.get('x-portal-token') || '';
  if (tok.length < 20) return null;
  const { data } = await db.from('portal_sessions').select('*').eq('token_hash', await sha256(tok)).is('revoked_at', null)
    .gte('expires_at', new Date().toISOString()).limit(1);
  const s: any = data && data[0];
  if (!s) return null;
  const { data: ok } = await db.from('customers').select('id').in('id', s.customer_ids || []).eq('portal_disabled', false);
  const ids = (ok || []).map((x: any) => x.id);
  if (!ids.length) return null;
  s.ids = ids;
  return s;
}

// ── money: the app's own rules (index.html "SINGLE SOURCE OF TRUTH") ───
// Ported line for line so the portal can never disagree with the app.
const SM: Record<string, string> = { request: 'Request', new: 'New', 'looked at': 'Looked At', 'parts ordered': 'Parts Ordered', 'parts in': 'Parts In', 'parts received': 'Parts In', done: 'Done', completed: 'Done', invoiced: 'Invoiced', billed: 'Invoiced', unbilled: 'Done', unpaid: 'Done', backlog: 'Backlog' };
function cs(s: any) { return SM[String(s || '').toLowerCase()] || (s || 'New'); }
function laborAmt(l: any) {
  if (!l || l.no_charge) return 0;
  if (l.unit_price != null) return (l.qty || 1) * (l.unit_price || 0);
  return (l.hours || 0) * (l.rate || 0);
}
function md(w: any): Record<string, any> { try { return JSON.parse(w.machines_data || '{}') || {}; } catch { return {}; } }
function adjList(w: any): any[] { try { return JSON.parse(w.adjustments || '[]') || []; } catch { return []; } }
function woSubtotal(w: any) {
  let sub = 0;
  try { Object.values(md(w)).forEach((d: any) => {
    (d.parts || []).forEach((p: any) => { sub += p.qty * p.price; });
    (d.labor || []).forEach((l: any) => { sub += laborAmt(l); });
  }); } catch (_) { /* as the app */ }
  return parseFloat(sub.toFixed(2));
}
function woAdjNet(w: any) {
  let net = 0;
  adjList(w).forEach((a) => { const amt = parseFloat(a.amount || 0); net += a.type === 'discount' ? -amt : amt; });
  return parseFloat(net.toFixed(2));
}
function woParts(w: any, exempt: boolean) {
  const sub = woSubtotal(w);
  const tax = exempt ? 0 : parseFloat((sub * TAX).toFixed(2));
  const cc = w.cc_fee ? parseFloat(((sub + tax) * 0.03).toFixed(2)) : 0;
  const ccTax = (w.cc_fee && !exempt) ? parseFloat((cc * TAX).toFixed(2)) : 0;
  const adj = woAdjNet(w);
  return { sub, tax, cc, ccTax, adj, total: parseFloat((sub + tax + cc + ccTax + adj).toFixed(2)) };
}
function billState(w: any, total: number, paid: number) {
  const s = String(w.invoice_status || '').toLowerCase();
  const billed = s === 'invoiced' || s === 'partial' || s === 'paid' || cs(w.status) === 'Invoiced';
  if (!billed) return 'unbilled';
  if (s === 'paid') return 'paid';
  if (total > 0.01 && paid >= total - 0.01) return 'paid';
  if (paid > 0.01) return 'partial';
  return 'invoiced';
}
function invDate(w: any) {
  if (w.invoiced_at) return new Date(w.invoiced_at);
  return w.scheduled_date ? new Date(w.scheduled_date + 'T12:00:00-04:00') : new Date(w.created_at || Date.now());
}
function pmtDate(p: any) {
  return p.payment_date ? new Date(p.payment_date + 'T12:00:00-04:00') : new Date(p.created_at || 0);
}
const OPEN_LABEL: Record<string, string> = {
  Request: 'Request received', New: 'Scheduled', 'Looked At': 'Looked at', 'Parts Ordered': 'Waiting on parts',
  'Parts In': 'Parts in — finishing up', Done: 'Work done — invoice coming', Backlog: 'On the list',
};

async function data(s: any, req: Request) {
  const ids: string[] = s.ids;
  const [{ data: custs }, { data: wos }, { data: eqs }, { data: rems }, { data: zrow }] = await Promise.all([
    db.from('customers').select('id,name,address,tax_exempt,customer_type').in('id', ids),
    db.from('work_orders').select('id,customer_id,equipment_id,status,problem,scheduled_date,machines_data,extra_equipment_ids,invoice_status,invoice_number,cc_fee,adjustments,invoiced_at,created_at,qbo_payment_link,po_number').in('customer_id', ids),
    db.from('equipment').select('id,customer_id,make,model,serial,equipment_type,year,last_service_date').in('customer_id', ids),
    db.from('maintenance_reminders').select('equipment_id,customer_id,title,next_due_date,active').in('customer_id', ids).eq('active', true),
    db.from('app_settings').select('value').eq('key', 'zelle_to').limit(1),
  ]);
  const woIds = (wos || []).map((w: any) => w.id);
  const { data: pays } = woIds.length
    ? await db.from('payments').select('id,work_order_id,amount,method,payment_date,created_at').in('work_order_id', woIds)
    : { data: [] as any[] };
  // Which invoices have the PDF the shop sent (saved by the app when it builds one).
  const pdfs = new Set<string>();
  for (const id of ids) {
    const { data: files } = await db.storage.from('invoice-pdfs').list(id, { limit: 1000 });
    (files || []).forEach((f: any) => pdfs.add(String(f.name).replace(/\.pdf$/, '')));
  }
  const cMap: Record<string, any> = {}; (custs || []).forEach((c: any) => { cMap[c.id] = c; });
  const eMap: Record<string, any> = {}; (eqs || []).forEach((e: any) => { eMap[e.id] = e; });
  const byWo: Record<string, any[]> = {};
  (pays || []).forEach((p: any) => { (byWo[p.work_order_id] = byWo[p.work_order_id] || []).push(p); });
  const eqName = (e: any) => e ? [e.year, e.make, e.model].filter(Boolean).join(' ').trim() || (e.equipment_type || 'Machine') : '';

  const invoices: any[] = [];
  const open: any[] = [];
  const ledger: any[] = [];
  const now = Date.now();

  for (const w of (wos || [])) {
    const exempt = !!(cMap[w.customer_id] || {}).tax_exempt;
    const m = woParts(w, exempt);
    const plist = (byWo[w.id] || []).slice().sort((a, b) => pmtDate(a).getTime() - pmtDate(b).getTime());
    const paid = parseFloat(plist.reduce((t, p) => t + parseFloat(p.amount || 0), 0).toFixed(2));
    const state = billState(w, m.total, paid);
    const machines = Object.keys(md(w)).map((k) => eMap[k] ? eqName(eMap[k]) : (md(w)[k].label || '')).filter(Boolean);
    if (state === 'unbilled') {
      const st = cs(w.status);
      if (st !== 'Closed' && st !== 'Invoiced' && !String(w.problem || '').startsWith('Parts sale')) {
        open.push({ id: w.id, title: w.problem || 'Service', status: OPEN_LABEL[st] || st, machines, date: (w.scheduled_date || w.created_at || '').slice(0, 10) });
      }
      continue;
    }
    if (m.total === 0) continue;
    const dt = invDate(w);
    const balance = state === 'paid' ? 0 : parseFloat(Math.max(0, m.total - paid).toFixed(2));
    const groups = Object.entries(md(w)).map(([k, d]: [string, any]) => ({
      machine: eMap[k] ? eqName(eMap[k]) : (d.label || (d.saleType ? 'Parts & supplies' : '')),
      serial: eMap[k] && eMap[k].serial ? String(eMap[k].serial).slice(-4) : '',
      labor: (d.labor || []).map((l: any) => ({ desc: l.desc || 'Labor', hours: l.unit_price != null ? null : (l.hours || 0), amount: parseFloat(laborAmt(l).toFixed(2)), no_charge: !!l.no_charge })),
      parts: (d.parts || []).map((p: any) => ({ name: p.name || p.partNum || 'Part', qty: p.qty, amount: parseFloat((p.qty * p.price).toFixed(2)) })),
    })).filter((g) => g.labor.length || g.parts.length);
    const num = w.invoice_number ? String(w.invoice_number) : w.id.slice(0, 6).toUpperCase();
    invoices.push({
      id: w.id, number: num, title: w.problem || 'Service', date: dt.toISOString(), po: w.po_number || '',
      customer: (cMap[w.customer_id] || {}).name || '', machines, groups,
      adjustments: adjList(w).map((a) => ({ note: a.note || (a.type === 'discount' ? 'Discount' : 'Adjustment'), amount: a.type === 'discount' ? -parseFloat(a.amount || 0) : parseFloat(a.amount || 0) })),
      subtotal: m.sub, tax: m.tax, exempt, cc_fee: m.cc + m.ccTax, total: m.total, paid, balance, state,
      payments: plist.map((p) => ({ amount: parseFloat(p.amount || 0), method: p.method || '', date: pmtDate(p).toISOString() })),
      card_link: balance > 0.01 && w.qbo_payment_link ? w.qbo_payment_link : '',
      has_pdf: pdfs.has(w.id),
    });
    // Statement ledger — openStmt's rules.
    ledger.push({ type: 'invoice', id: w.id, date: dt.toISOString(), sort: dt.getTime(), number: num, title: w.problem || 'Service', amount: m.total, paidOff: state === 'paid', amountPaid: paid });
    for (const p of plist) {
      const pd = pmtDate(p);
      ledger.push({ type: 'payment', id: w.id, date: pd.toISOString(), sort: Math.max(pd.getTime(), dt.getTime()) + 1, number: num, method: p.method || '', amount: parseFloat(p.amount || 0) });
    }
    // Marked paid by hand with no (or not enough) payment rows behind it:
    // the app treats it as settled, so the running balance must too.
    const short = parseFloat((m.total - paid).toFixed(2));
    if (state === 'paid' && short >= 0.01) {
      const last = plist.length ? pmtDate(plist[plist.length - 1]) : dt;
      ledger.push({ type: 'payment', id: w.id, date: last.toISOString(), sort: Math.max(last.getTime(), dt.getTime()) + 2, number: num, method: 'Paid in full', amount: short });
    }
  }
  ledger.sort((a, b) => (a.sort - b.sort) || (a.type === 'invoice' && b.type !== 'invoice' ? -1 : b.type === 'invoice' && a.type !== 'invoice' ? 1 : (parseInt(a.number) || 0) - (parseInt(b.number) || 0)));
  // Running balance, invoice by invoice: a few cents overpaid on one invoice
  // is rounding (the app ignores under 5¢), so it never shows as −0.01.
  const per: Record<string, number> = {};
  const owedOf = (v: number) => (v < 0 && v > -0.05 ? 0 : v);
  for (const r of ledger) {
    per[r.id] = (per[r.id] || 0) + (r.type === 'invoice' ? r.amount : -r.amount);
    r.running = parseFloat(Object.values(per).reduce((t, v) => t + owedOf(parseFloat(v.toFixed(2))), 0).toFixed(2));
    delete r.sort;
  }

  const openInv = ledger.filter((r) => r.type === 'invoice' && !r.paidOff);
  const openDue = openInv.reduce((t, r) => t + Math.max(0, parseFloat((r.amount - (r.amountPaid || 0)).toFixed(2))), 0);
  let credit = ledger.filter((r) => r.type === 'invoice').reduce((t, r) => { const over = parseFloat(((r.amountPaid || 0) - r.amount).toFixed(2)); return t + (over >= 0.05 ? over : 0); }, 0);
  credit = parseFloat(credit.toFixed(2));
  const balance = parseFloat(Math.max(0, openDue - credit).toFixed(2));
  const aging = { d30: 0, d60: 0, d90: 0, over: 0 };
  for (const r of openInv) {
    const owed = Math.max(0, parseFloat((r.amount - (r.amountPaid || 0)).toFixed(2)));
    const days = (now - new Date(r.date).getTime()) / 864e5;
    if (days <= 30) aging.d30 += owed; else if (days <= 60) aging.d60 += owed; else if (days <= 90) aging.d90 += owed; else aging.over += owed;
  }
  for (const k of Object.keys(aging) as (keyof typeof aging)[]) aging[k] = parseFloat(aging[k].toFixed(2));

  // Machines with their history and next reminder.
  const machines = (eqs || []).map((e: any) => {
    const hist = invoices.filter((i) => (wos || []).some((w: any) => w.id === i.id && (w.equipment_id === e.id || Object.keys(md(w)).includes(e.id))))
      .map((i) => ({ invoice_id: i.id, number: i.number, title: i.title, date: i.date }))
      .sort((a, b) => b.date.localeCompare(a.date));
    const rem = (rems || []).filter((r: any) => r.equipment_id === e.id && r.next_due_date).sort((a: any, b: any) => a.next_due_date.localeCompare(b.next_due_date))[0];
    return { id: e.id, name: eqName(e), type: e.equipment_type || '', serial: e.serial ? String(e.serial).slice(-4) : '',
      last_service: hist[0] ? hist[0].date : (e.last_service_date || ''), history: hist,
      reminder: rem ? { title: rem.title || 'Service', due: rem.next_due_date } : null };
  }).sort((a: any, b: any) => (b.last_service || '').localeCompare(a.last_service || ''));

  invoices.sort((a, b) => (a.balance > 0.01 ? 0 : 1) - (b.balance > 0.01 ? 0 : 1) || b.date.localeCompare(a.date));

  // "Opened the portal" once per half hour, not on every refresh.
  const last = s.last_seen ? new Date(s.last_seen).getTime() : 0;
  if (now - last > 30 * 60e3) for (const id of ids) await log(id, 'opened', {}, req);
  await db.from('portal_sessions').update({ last_seen: new Date().toISOString() }).eq('id', s.id);

  const first = (custs || [])[0] || {};
  const biz = ['Contractor', 'Commercial'].includes(first.customer_type);
  return json({
    customer: { name: (custs || []).map((c: any) => c.name).join(' & '), greet: biz ? first.name : String(first.name || '').split(' ')[0], address: first.address || '' },
    invoices, open, machines,
    statement: { rows: ledger, balance, credit, aging, as_of: new Date().toISOString() },
    zelle: (zrow && zrow[0] && zrow[0].value) || SHOP.phone_digits,
    shop: SHOP,
  });
}

const LOGGABLE = new Set(['view_invoice', 'open_card', 'view_statement', 'print_statement', 'copy_zelle', 'view_machine']);

async function handle(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const action = String(body.action || '');

  if (action === 'config') return json({ sms: SMS_ON, email: EMAIL_ON, shop: SHOP });
  if (action === 'start') return await start(body, req);
  if (action === 'verify') return await verify(body, req);

  const s = await session(req);
  if (!s) return json({ error: 'Please sign in again.', signed_out: true }, 401);
  const who = s.ids[0];

  if (action === 'data') return await data(s, req);

  if (action === 'log') {
    const ev = String(body.event || '');
    if (!LOGGABLE.has(ev)) return json({ error: 'Unknown event' }, 400);
    await log(who, ev, { ref: clip(body.ref, 60) }, req);
    return json({ ok: true });
  }

  if (action === 'signout') {
    await db.from('portal_sessions').update({ revoked_at: new Date().toISOString() }).eq('id', s.id);
    await log(who, 'sign_out', {}, req);
    return json({ ok: true });
  }

  if (action === 'invoice_pdf') {
    const { data: w } = await db.from('work_orders').select('id,customer_id,invoice_number').eq('id', String(body.invoice_id || '')).in('customer_id', s.ids).limit(1);
    if (!w || !w[0]) return json({ error: 'Invoice not found' }, 404);
    const name = 'INV-' + (w[0].invoice_number || w[0].id.slice(0, 6)) + '.pdf';
    const { data: signed, error } = await db.storage.from('invoice-pdfs').createSignedUrl(`${w[0].customer_id}/${w[0].id}.pdf`, 300, { download: name });
    if (error || !signed) {
      // No saved copy yet (the app saves one when Danny opens or sends the
      // invoice). Tell him once, so he can open it and the button works.
      const { data: c } = await db.from('customers').select('name').eq('id', w[0].customer_id).limit(1);
      await log(w[0].customer_id, 'pdf_requested', { ref: String(w[0].invoice_number || '') }, req);
      await tellShop(`Invoice PDF requested: ${(c && c[0] && c[0].name) || 'Customer'} — #${w[0].invoice_number}`, [
        `${(c && c[0] && c[0].name) || 'A customer'} tapped Download on invoice #${w[0].invoice_number} in the portal, but there’s no saved copy yet.`,
        '', 'Open that invoice in the app once (or send it) and the download will work.',
      ]);
      return json({ error: 'Your invoice is being prepared. Danny’s been notified and it’ll be ready to download shortly.' }, 404);
    }
    await log(w[0].customer_id, 'download_invoice', { ref: String(w[0].invoice_number || '') }, req);
    return json({ ok: true, url: signed.signedUrl, filename: name });
  }

  if (action === 'zelle_sent') {
    const { data: w } = await db.from('work_orders').select('id,customer_id,invoice_number').eq('id', String(body.invoice_id || '')).in('customer_id', s.ids).limit(1);
    if (!w || !w[0]) return json({ error: 'Invoice not found' }, 404);
    const { data: c } = await db.from('customers').select('name').eq('id', w[0].customer_id).limit(1);
    const amt = parseFloat(body.amount || 0);
    await log(w[0].customer_id, 'zelle_sent', { invoice: w[0].invoice_number, amount: amt }, req);
    await tellShop(`Zelle sent: ${(c && c[0] && c[0].name) || 'Customer'} — Invoice ${w[0].invoice_number}`, [
      `${(c && c[0] && c[0].name) || 'A customer'} says they sent $${amt.toFixed(2)} by Zelle for invoice ${w[0].invoice_number}.`,
      '', 'Check your bank, then record the payment in the app (Receive payment → Zelle).',
    ]);
    return json({ ok: true });
  }

  if (action === 'request') {
    const issue = clip(body.issue, 2000).trim();
    const address = clip(body.address, 300).trim();
    if (issue.length < 3) return json({ error: 'Tell us what’s going on.' }, 400);
    if (!address) return json({ error: 'Add the address where the machine is.' }, 400);
    let eq: any = null;
    if (body.equipment_id) {
      const { data: e } = await db.from('equipment').select('id,customer_id,make,model,equipment_type').eq('id', String(body.equipment_id)).in('customer_id', s.ids).limit(1);
      eq = e && e[0];
    }
    const custId = eq ? eq.customer_id : who;
    const { data: c } = await db.from('customers').select('name,phone,email,company').eq('id', custId).limit(1);
    const cust: any = (c && c[0]) || {};

    let photoUrl = '';
    const b64 = String(body.photo || '');
    if (b64.startsWith('data:image/')) {
      const m = b64.match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
      if (m) {
        const bytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
        if (bytes.length <= 6 * 1024 * 1024) {
          const path = `portal/${custId}/${Date.now()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
          const up = await db.storage.from('equipment-photos').upload(path, bytes, { contentType: 'image/' + m[1] });
          if (!up.error) photoUrl = `${SUPABASE_URL}/storage/v1/object/public/equipment-photos/${path}`;
        }
      }
    }
    const machine = eq ? [eq.make, eq.model].filter(Boolean).join(' ') : clip(body.machine, 120);
    const { error } = await db.from('leads').insert({
      name: cust.name || 'Portal customer', business: cust.company || null, phone: cust.phone || null, email: cust.email || null,
      source: 'Portal', status: 'new', customer_id: custId, address, equipment: machine || null,
      equipment_type: eq ? eq.equipment_type : null, complaint: issue,
      notes: 'Sent from the customer portal' + (photoUrl ? '\nPhoto: ' + photoUrl : ''),
    });
    if (error) return json({ error: 'Couldn’t send that just now. Call or text ' + SHOP.phone + '.', detail: clip(error.message, 200) }, 500);
    await log(custId, 'service_request', { machine, address, photo: !!photoUrl }, req);
    await tellShop(`Service request: ${cust.name || 'Customer'}${machine ? ' — ' + machine : ''}`, [
      `${cust.name || 'A customer'} sent a service request from the portal.`, '',
      `Machine: ${machine || '(not picked)'}`, `Location: ${address}`, `Phone: ${cust.phone || '—'}`, '',
      'What’s going on:', issue, ...(photoUrl ? ['', 'Photo: ' + photoUrl] : []), '',
      'It’s in the app under Leads.',
    ]);
    return json({ ok: true });
  }

  return json({ error: 'Unknown action' }, 400);
}

Deno.serve(async (req) => {
  try { return await handle(req); }
  catch (e) { return json({ error: 'Something went wrong. Call or text ' + SHOP.phone + '.', detail: clip((e as Error).message, 200) }, 500); }
});

// Exported for tests (ignored by the edge runtime).
export { woParts, billState, esc };
