-- 2026-10-09 — Customer portal.
--
-- Additive only: one new column on customers and three new tables. No
-- existing table, row, policy or grant is changed, and nothing the app or
-- its sign-in uses today is touched.
--
-- Customers never reach these tables (or any table) directly. The `portal`
-- Edge Function holds the service role and answers each customer with only
-- their own rows. So:
--   portal_codes, portal_sessions — service role only (RLS on, no policy,
--                                   no grant), like qbo_tokens in 008.
--   portal_log                    — the app reads it ("Portal activity"),
--                                   so it gets the usual authenticated policy.

-- ── 1. The shop's on/off switch per customer ──────────────────────────
-- Default false = portal allowed. Only a phone or email already on the
-- card can sign in, so "on" exposes nothing new until the customer has
-- that phone or inbox in hand.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS portal_disabled boolean NOT NULL DEFAULT false;

-- ── 2. One-time sign-in codes ─────────────────────────────────────────
-- Email codes are stored only as a salted SHA-256; text codes live at
-- Twilio Verify and the row just counts tries. `unknown` rows record a
-- request for a contact that isn't on file (so rate limits still apply).
CREATE TABLE IF NOT EXISTS portal_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel       text NOT NULL CHECK (channel IN ('sms','email')),
  destination   text NOT NULL,
  customer_ids  uuid[] NOT NULL DEFAULT '{}',
  code_hash     text,
  attempts      integer NOT NULL DEFAULT 0,
  unknown       boolean NOT NULL DEFAULT false,
  ip            text,
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_codes_dest_idx ON portal_codes (destination, created_at DESC);
CREATE INDEX IF NOT EXISTS portal_codes_ip_idx ON portal_codes (ip, created_at DESC);

-- ── 3. Signed-in sessions ─────────────────────────────────────────────
-- Only a hash of the token is kept. customer_ids is a list because one
-- phone can sit on more than one card (a business and its owner).
CREATE TABLE IF NOT EXISTS portal_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_ids  uuid[] NOT NULL,
  token_hash    text NOT NULL UNIQUE,
  channel       text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen     timestamptz,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz
);

-- ── 4. What customers did ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid REFERENCES customers(id) ON DELETE CASCADE,
  event         text NOT NULL,
  detail        jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_log_time_idx ON portal_log (created_at DESC);
CREATE INDEX IF NOT EXISTS portal_log_cust_idx ON portal_log (customer_id, created_at DESC);

-- ── 5. Access ─────────────────────────────────────────────────────────
ALTER TABLE portal_codes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_log      ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON portal_codes, portal_sessions, portal_log FROM anon;
REVOKE ALL ON portal_codes, portal_sessions FROM authenticated;

DROP POLICY IF EXISTS "authenticated_all" ON portal_log;
CREATE POLICY "authenticated_all" ON portal_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, DELETE ON portal_log TO authenticated;
