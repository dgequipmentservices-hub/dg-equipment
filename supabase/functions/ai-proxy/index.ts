// ai-proxy — server-side wrapper around the Anthropic API.
//
// Previously this had no authentication of any kind: verify_jwt was off, CORS
// was open, and there was no token check in the body. The function URL is
// hardcoded in index.html, which is served publicly, so anyone who viewed
// source could send unlimited requests billed to ANTHROPIC_API_KEY — and pick
// the model, since it was taken straight from the request.
//
// Now it requires the same app JWT the rest of the app uses, and the model is
// chosen here rather than by the caller.
//
// Requires ANTHROPIC_API_KEY and APP_JWT_SECRET.

import Anthropic from 'npm:@anthropic-ai/sdk';
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
const JWT_SECRET = Deno.env.get('APP_JWT_SECRET') || '';

// Callers may not pick the model — that decides the bill.
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS_CAP = 2000;

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (!apiKey) {
    return json({ error: 'AI service not configured — set ANTHROPIC_API_KEY secret' }, 503);
  }
  if (!(await isSignedIn(req))) {
    return json({ error: 'Sign in to use AI features' }, 401);
  }
  try {
    const client = new Anthropic({ apiKey });
    const body = await req.json();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: Math.min(body.max_tokens || 1000, MAX_TOKENS_CAP),
      messages: body.messages,
    });
    return json(response);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
});
