// send-invoice — emails an invoice, with the picture actually attached.
//
// The app used to hand the invoice to the browser and hope. On a phone the
// share sheet could pass it to Gmail; on the shop desktop Windows offers no
// Gmail target at all, and no browser anywhere lets a compose link carry a
// file. So Send opened a draft and left the attaching to a human.
//
// This sends it outright, over Gmail's own SMTP, so the mail arrives from
// dgequipmentservices@gmail.com with INV-1234.jpg on it and lands in the
// shop's Gmail "Sent" folder like anything else typed by hand.
//
// Requires APP_JWT_SECRET (the same session the rest of the app uses),
// GMAIL_USER, and GMAIL_APP_PASSWORD — a Google app password, not the
// account password. Without the last two it answers 503 and says so, and
// the app falls back to opening a draft.

import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { verify } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const JWT_SECRET = Deno.env.get('APP_JWT_SECRET') || '';
const GMAIL_USER = Deno.env.get('GMAIL_USER') || '';
const GMAIL_APP_PASSWORD = (Deno.env.get('GMAIL_APP_PASSWORD') || '').replace(/\s+/g, '');
const FROM_NAME = Deno.env.get('GMAIL_FROM_NAME') || 'DG Equipment Repair & Services';

// Gmail's own ceiling is 25MB on the whole message; an invoice picture runs
// well under 1MB, so anything near this is a mistake worth refusing early.
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

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
  try {
    await verify(auth.slice(7), await jwtKey());
    return true;
  } catch {
    return false;
  }
}

function looksLikeEmail(s: string) {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s);
}

// What went wrong, in words worth reading. Gmail answers SMTP failures with a
// code and a sentence; the code is what tells an app password apart from a
// blocked account, and guessing between them is what made the QuickBooks
// errors so expensive.
function smtpTrouble(e: unknown) {
  const msg = (e instanceof Error ? e.message : String(e)) || 'Unknown error';
  if (/535|5\.7\.8|username and password not accepted|badcredentials/i.test(msg)) {
    return {
      error: 'Gmail refused the app password',
      hint: 'Make a new app password at myaccount.google.com → Security → 2-Step Verification → App passwords, then paste it into the GMAIL_APP_PASSWORD secret.',
      bad_credentials: true,
    };
  }
  if (/534|5\.7\.9|application-specific password required/i.test(msg)) {
    return {
      error: 'Gmail wants an app password, not the account password',
      hint: 'GMAIL_APP_PASSWORD must be a 16-character app password from your Google account.',
      bad_credentials: true,
    };
  }
  if (/550|5\.1\.1|recipient/i.test(msg)) {
    return { error: 'Gmail would not accept that address', hint: 'Check the spelling of the email.' };
  }
  if (/552|5\.3\.4|message size/i.test(msg)) {
    return { error: 'The invoice picture was too big for Gmail' };
  }
  return { error: 'Gmail would not send it', detail: msg };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  if (!(await isSignedIn(req))) return json({ error: 'Sign in again to send invoices' }, 401);

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return json({
      error: 'Email sending is not set up yet',
      hint: 'Add the GMAIL_USER and GMAIL_APP_PASSWORD secrets to this project, then try again.',
      not_configured: true,
    }, 503);
  }

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }

  const to = String(body.to || '').trim();
  const subject = String(body.subject || '').trim().slice(0, 300);
  const text = String(body.body || '').slice(0, 20000);
  const filename = String(body.filename || 'invoice.jpg').replace(/[^\w.\-]/g, '_').slice(0, 80);
  const b64 = String(body.attachment_b64 || '').replace(/^data:[^,]*,/, '').replace(/\s+/g, '');

  if (!looksLikeEmail(to)) return json({ error: 'That does not look like an email address' }, 400);
  if (!subject) return json({ error: 'The email needs a subject' }, 400);
  // 4 base64 characters carry 3 bytes.
  if (b64 && b64.length * 0.75 > MAX_ATTACHMENT_BYTES) {
    return json({ error: 'The invoice picture is too big to email' }, 413);
  }

  const client = new SMTPClient({
    connection: {
      hostname: 'smtp.gmail.com',
      port: 465,
      tls: true,
      auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
    },
  });

  try {
    await client.send({
      from: `${FROM_NAME} <${GMAIL_USER}>`,
      to,
      replyTo: GMAIL_USER,
      subject,
      content: text,
      attachments: b64
        ? [{ filename, encoding: 'base64', content: b64, contentType: 'image/jpeg' }]
        : [],
    });
    return json({ sent: true, to });
  } catch (e) {
    return json(smtpTrouble(e), 502);
  } finally {
    try { await client.close(); } catch { /* the send is what mattered */ }
  }
});
