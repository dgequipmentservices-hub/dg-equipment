// app-auth — sign-in and password changes for the DG Equipment app.
//
// Replaces the previous version, which authenticated the user and then
// flipped a single global row (app_config.session_active) that every RLS
// policy keyed off. That flag was writable by the anon role, so it granted
// nothing and protected nothing. This version issues a signed JWT instead:
// PostgREST verifies it per request, and migration 008 points every policy
// at `authenticated`.
//
// Passwords were stored as a bare SHA-256 — unsalted and fast. Verification
// still accepts those hashes, but every successful sign-in rewrites the row
// as PBKDF2-SHA256 with a per-user salt, so the old hashes drain away
// without anyone resetting a password.
//
// Deploy: supabase functions deploy app-auth
// Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Supabase injects SUPABASE_URL and the two keys automatically, but NOT the
// JWT secret — it has to be set explicitly:
//   supabase secrets set SUPABASE_JWT_SECRET=<Project Settings > API > JWT Secret>
// Without this guard a missing value would encode as the string "undefined"
// and we would happily sign tokens with it. Sign-in would look fine and every
// subsequent request would fail signature verification, which is a far more
// confusing failure than refusing to start.
// Named APP_JWT_SECRET, not SUPABASE_JWT_SECRET: Supabase reserves the
// SUPABASE_ prefix for its own injected variables and rejects custom secrets
// using it, so a secret set under that name never reaches the function.
// SUPABASE_JWT_SECRET is still read as a fallback in case a future platform
// version injects it.
const JWT_SECRET = Deno.env.get("APP_JWT_SECRET") ||
  Deno.env.get("SUPABASE_JWT_SECRET") || "";
const JWT_SECRET_SOURCE = Deno.env.get("APP_JWT_SECRET")
  ? "APP_JWT_SECRET"
  : (Deno.env.get("SUPABASE_JWT_SECRET") ? "SUPABASE_JWT_SECRET" : "none");

const SESSION_HOURS = 12;
const PBKDF2_ITERATIONS = 210000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

const attempts: Record<string, { count: number; lockUntil: number }> = {};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

const hex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");

async function sha256(s: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

async function pbkdf2(password: string, salt: string, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return hex(bits);
}

// Constant-time compare — a length-independent early return here would leak
// how much of a hash a guess got right.
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function newSalt() {
  return hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

async function jwtKey() {
  return await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}

async function issueToken(user: { id: string; role: string }) {
  const now = Math.floor(Date.now() / 1000);
  return await create(
    { alg: "HS256", typ: "JWT" },
    {
      aud: "authenticated",
      role: "authenticated", // the Postgres role PostgREST will assume
      sub: user.id,
      app_role: user.role, // owner | tech, for the app's own checks
      iat: now,
      exp: now + SESSION_HOURS * 3600,
    },
    await jwtKey(),
  );
}

async function verifyPassword(
  supabase: ReturnType<typeof createClient>,
  user: Record<string, unknown>,
  password: string,
): Promise<boolean> {
  const stored = String(user.password_hash || "");
  if (!stored) return false;

  if (user.password_algo === "pbkdf2") {
    const computed = await pbkdf2(
      password,
      String(user.password_salt),
      Number(user.password_iterations) || PBKDF2_ITERATIONS,
    );
    return safeEqual(computed, stored);
  }

  // Legacy unsalted SHA-256. Verify, then upgrade the row in place.
  if (!safeEqual(await sha256(password), stored)) return false;

  const salt = newSalt();
  await supabase.from("app_users").update({
    password_hash: await pbkdf2(password, salt, PBKDF2_ITERATIONS),
    password_salt: salt,
    password_algo: "pbkdf2",
    password_iterations: PBKDF2_ITERATIONS,
  }).eq("id", user.id as string);

  return true;
}

// Callers proving who they are for privileged actions (changing passwords).
async function requireOwner(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const payload = await verify(auth.slice(7), await jwtKey()) as
      Record<string, unknown>;
    return payload.app_role === "owner" ? payload : null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const body = await req.json();
    const action = body.action || "login";

    // Readiness probe — no credentials, and it reveals only whether the
    // secret is configured, never its value. Used to confirm a deploy is
    // sound before migration 008 makes JWTs mandatory.
    if (action === "health") {
      return json({
        ok: true,
        jwt_secret_configured: JWT_SECRET.length > 0,
        jwt_secret_source: JWT_SECRET_SOURCE,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Set or change a password ──────────────────────────────────────
    // Hashing has to happen here: the salt and iteration count are chosen
    // server-side, and the browser no longer has write access to
    // password_hash (migration 008 revokes the column grant).
    if (action === "set_password") {
      if (!JWT_SECRET) {
        return json({ ok: false, error: "Auth is not fully configured." }, 503);
      }
      const caller = await requireOwner(req);
      if (!caller) return json({ ok: false, error: "Not authorised" }, 403);

      const { user_id, password } = body;
      if (!user_id || !password || String(password).length < 4) {
        return json({ ok: false, error: "Password must be at least 4 characters" }, 400);
      }

      const salt = newSalt();
      const { error } = await supabase.from("app_users").update({
        password_hash: await pbkdf2(password, salt, PBKDF2_ITERATIONS),
        password_salt: salt,
        password_algo: "pbkdf2",
        password_iterations: PBKDF2_ITERATIONS,
      }).eq("id", user_id);

      if (error) return json({ ok: false, error: "Could not update password" }, 500);
      return json({ ok: true });
    }

    // ── Sign in ───────────────────────────────────────────────────────
    const { username, password } = body;
    if (!username || !password) {
      return json({ ok: false, error: "Missing credentials" }, 400);
    }

    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const key = ip + ":" + String(username).toLowerCase();
    const now = Date.now();

    if (attempts[key] && attempts[key].lockUntil > now) {
      const mins = Math.ceil((attempts[key].lockUntil - now) / 60000);
      return json({
        ok: false,
        error: `Too many attempts. Try again in ${mins} minute${mins !== 1 ? "s" : ""}.`,
      }, 429);
    }

    // Fetch by username only — the password is checked in here, so that a
    // slow hash is actually exercised rather than matched in SQL.
    const { data: user } = await supabase
      .from("app_users")
      .select("id, role, display_name, active, password_hash, password_salt, password_algo, password_iterations")
      .eq("username", String(username).toLowerCase().trim())
      .maybeSingle();

    const ok = user ? await verifyPassword(supabase, user, String(password)) : false;

    if (!ok) {
      if (!attempts[key]) attempts[key] = { count: 0, lockUntil: 0 };
      attempts[key].count++;
      if (attempts[key].count >= MAX_ATTEMPTS) {
        attempts[key].lockUntil = now + LOCKOUT_MS;
        attempts[key].count = 0;
        return json({ ok: false, error: "Too many failed attempts. Locked out for 15 minutes." }, 429);
      }
      return json({ ok: false, error: "Incorrect username or password" }, 401);
    }

    if (user!.active === false) {
      return json({ ok: false, error: "Account is inactive" }, 403);
    }

    delete attempts[key];

    // Without the JWT secret we cannot mint a token, so fall back to the old
    // behaviour rather than locking everyone out: flip the legacy
    // session_active flag and return no token. This keeps sign-in working
    // between deploying this function and setting the secret — but it is the
    // insecure path, and migration 008 must NOT be applied while this branch
    // is live, because it removes the flag this depends on.
    if (!JWT_SECRET) {
      console.warn("SUPABASE_JWT_SECRET not set — falling back to legacy session flag");
      await supabase.from("app_config").update({ value: "true" }).eq("key", "session_active");
      return json({
        ok: true,
        role: user!.role,
        display_name: user!.display_name || username,
        user_id: user!.id,
        legacy_session: true,
      });
    }

    return json({
      ok: true,
      role: user!.role,
      display_name: user!.display_name || username,
      user_id: user!.id,
      session_token: await issueToken({ id: user!.id, role: user!.role }),
      expires_in: SESSION_HOURS * 3600,
    });
  } catch (e) {
    console.error("Auth error:", e);
    return json({ ok: false, error: "Server error" }, 500);
  }
});
