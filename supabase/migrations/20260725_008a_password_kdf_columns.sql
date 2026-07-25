-- ═══════════════════════════════════════════════════════════════
-- Migration 008a: password KDF columns
--
-- Split out of 008 and applied ahead of it. The deployed app-auth function
-- selects these columns on every sign-in, so they have to exist before it
-- runs — without them the select fails, the user lookup comes back empty,
-- and every login returns "Incorrect username or password".
--
-- Additive only. No policy or grant changes: 008_auth_hardening still has
-- to be applied separately, and only once SUPABASE_JWT_SECRET is set.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_salt TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_algo TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_iterations INTEGER;
