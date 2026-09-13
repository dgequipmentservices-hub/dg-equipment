// qbo-auth — the OAuth handshake that connects the app to QuickBooks Online.
//
// This function was never in this repo. It existed only as a deployed
// function, with the Intuit client id and client secret written into its
// source as literals, while qbo-push refreshed those same tokens using
// QBO_CLIENT_ID / QBO_CLIENT_SECRET from the environment.
//
// Two copies of one credential is a bug waiting for a quiet afternoon, and on
// 2026-09-13 it collected: the environment pair pointed at a different Intuit
// app than the pair hardcoded here. Intuit ties a refresh token to the client
// that minted it, so every connect succeeded (this file's credentials) and
// every renewal failed with invalid_grant (the other app's). QuickBooks access
// lasts an hour, so the app worked for exactly one hour after each reconnect
// and then died, for roughly six months, with the app reporting nothing more
// useful than "reconnect required".
//
// So there is now one source of truth. Both functions read the same two
// secrets, they cannot drift apart, and no live secret sits in source.
//
// Requires QBO_CLIENT_ID and QBO_CLIENT_SECRET — the Keys & credentials of
// the Intuit app this company file is connected to. Set them together:
//   supabase secrets set QBO_CLIENT_ID=... QBO_CLIENT_SECRET=...
//
// REDIRECT_URI stays a literal: it is this function's own public URL and has
// to match what is registered in the Intuit app exactly.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLIENT_ID = Deno.env.get('QBO_CLIENT_ID') || '';
const CLIENT_SECRET = Deno.env.get('QBO_CLIENT_SECRET') || '';
const REDIRECT_URI = 'https://ddxjszzceaullxheejnq.supabase.co/functions/v1/qbo-auth';
const SU = Deno.env.get('SUPABASE_URL')!;
const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Always charset-qualified: without it the browser rendered this page's own
// source as text, which read as a failed connection even though the tokens
// had been written successfully.
const HTML = { 'Content-Type': 'text/html; charset=utf-8' };

const page = (title: string, body: string, colour: string, selfClose = false) =>
  `<!doctype html><html><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>body{font-family:system-ui,-apple-system,sans-serif;background:#0f0f0f;color:#f0ede8;` +
  `display:flex;align-items:center;justify-content:center;height:100vh;margin:0;` +
  `flex-direction:column;gap:14px;text-align:center;padding:24px}` +
  `h2{margin:0;color:${colour}}p{margin:0;color:#9a948c;font-size:15px;line-height:1.5}</style>` +
  `</head><body><h2>${title}</h2><p>${body}</p>` +
  // The popup was opened by the app with window.open, so it is allowed to
  // close itself. Leaving a dead tab behind is what made a successful connect
  // look like a failure.
  (selfClose ? `<script>setTimeout(function(){try{window.close();}catch(e){}},1400);</script>` : '') +
  `</body></html>`;

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const realmId = url.searchParams.get('realmId');
  const error = url.searchParams.get('error');

  // Refuse clearly rather than sending the string "undefined" to Intuit and
  // getting back an error about the client id that means nothing to anyone.
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return new Response(
      page('Not configured', 'QBO_CLIENT_ID and QBO_CLIENT_SECRET are not set on this project, so QuickBooks cannot be connected.', '#d9534f'),
      { status: 500, headers: HTML },
    );
  }

  if (!code && !error) {
    const authUrl = new URL('https://appcenter.intuit.com/connect/oauth2');
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('scope', 'com.intuit.quickbooks.accounting');
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', 'dg-equipment');
    return Response.redirect(authUrl.toString(), 302);
  }

  if (error) {
    return new Response(
      page('Couldn’t connect', `QuickBooks returned: ${error}. Close this window and try again.`, '#d9534f'),
      { headers: HTML },
    );
  }

  try {
    const basic = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: code!, redirect_uri: REDIRECT_URI })
    });

    const raw = await tokenRes.text();
    let tokens: any = {};
    try { tokens = JSON.parse(raw); } catch { /* reported below */ }

    if (!tokens.access_token) {
      // Logged for the same reason qbo-push logs its refresh failures: an
      // OAuth failure with no trace is what made the last one take a morning.
      // The client id is not secret; the secret is never logged.
      console.error('qbo-auth token exchange failed: ' + JSON.stringify({
        http: tokenRes.status,
        error: tokens.error || null,
        detail: tokens.error_description || raw.slice(0, 200),
        client_id: CLIENT_ID,
      }));
      return new Response(
        page('Couldn’t connect', `QuickBooks refused the sign-in (${tokens.error || tokenRes.status}). Close this window and try again.`, '#d9534f'),
        { headers: HTML },
      );
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const supabase = createClient(SU, SK);
    await supabase.from('qbo_tokens').upsert({
      id: 1, access_token: tokens.access_token, refresh_token: tokens.refresh_token,
      realm_id: realmId, expires_at: expiresAt, updated_at: new Date().toISOString()
    });

    return new Response(
      page('QuickBooks connected', 'You can go back to the app — this window closes itself.', '#3ab87a', true),
      { headers: HTML },
    );
  } catch (e) {
    console.error('qbo-auth error: ' + (e as Error).message);
    return new Response(
      page('Couldn’t connect', `Something went wrong: ${(e as Error).message}`, '#d9534f'),
      { headers: HTML },
    );
  }
});
