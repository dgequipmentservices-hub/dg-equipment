-- ═══════════════════════════════════════════════════════════════
-- Migration 019: Backup copies were public; new tables no longer are
--
-- What was wrong
-- ──────────────
-- Three snapshot tables sat in `public` with RLS off and the full
-- set of table grants — SELECT, INSERT, UPDATE, DELETE, TRUNCATE —
-- held by `anon`:
--
--   _equipment_backup_20260827     160 rows  customer_id, serial, notes, purchase_price
--   _price_backup_20260816         289 rows  part cost and sell price
--   _price_matrix_backup_20260816   41 rows  markup and margin percentages
--
-- The anon key ships in index.html, so anyone with the app's URL
-- could read what the shop pays and charges, read the customer
-- equipment list, and truncate all three. Supabase's linter flagged
-- it as rls_disabled_in_public on 31 Aug 2026.
--
-- How they got that way
-- ────────────────────
-- Migration 008 revoked anon's grants on the tables that existed in
-- July. It could not revoke them on tables that did not exist yet,
-- and the project still carried Supabase's stock default:
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES
--     TO anon, authenticated, service_role;
--
-- So every table created since July was born with full anon access.
-- The app's own tables survived that because each one gets RLS and an
-- authenticated_all policy, which shuts anon out whatever the grant
-- says. A bare `CREATE TABLE ... AS SELECT` snapshot gets neither —
-- 015 made one that way, and the 20260816 pair were made by hand.
-- The grant was the constant; RLS was what varied.
--
-- What this does
-- ──────────────
-- Locks the three snapshots, clears anon's remaining grants, and
-- changes the default so the next snapshot is not born public.
-- Nothing is dropped: the snapshots stay readable from the SQL editor
-- and to the service role. Neither index.html nor any Edge Function
-- references them, so no application behaviour changes.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. The three snapshots: service role only ─────────────────────────
-- Same shape as qbo_tokens in 008 — RLS on with no policy, and no
-- grant to either browser role. Nothing reaches these over PostgREST;
-- the service role bypasses RLS, so the data is still there when the
-- owner wants it.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    '_equipment_backup_20260827',
    '_price_backup_20260816',
    '_price_matrix_backup_20260816'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- ── 2. anon's leftover grants across public ───────────────────────────
-- machine_models, stock_locations and the photo_index view also
-- inherited the stock default. RLS and security_invoker were already
-- keeping anon out of all three; this removes the grant behind them so
-- the block does not depend on a single layer.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- ── 3. New objects are not born public ────────────────────────────────
-- The fix for the class of bug, not just today's three tables. anon
-- holds no table access by design since 008 — the browser signs in
-- through the app-auth Edge Function and works from a JWT thereafter,
-- and the login path never touches a table directly — so anon needs
-- nothing from a table created in future.
--
-- authenticated's defaults are deliberately left alone: every table the
-- app uses needs them, and a signed-in tech is not the threat here.
-- A future table still needs its own RLS and policy; this only means
-- forgetting that no longer exposes it to the whole internet.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- Default privileges are per-owner, and supabase_admin keeps a second set
-- of them. postgres is not a member of supabase_admin on this project, so
-- that set cannot be changed from here — the statements below raise
-- "permission denied to change default privileges" and are skipped rather
-- than allowed to fail the migration. It does not leave a gap in practice:
-- every table in public, the three snapshots included, was created by
-- postgres and carries postgres as the grantor, so the postgres defaults
-- are the ones that actually apply.
DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon';
EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
  RAISE NOTICE 'supabase_admin default privileges not alterable from this role; postgres defaults set';
END $$;

-- ── Deliberately not changed ──────────────────────────────────────────
-- qbo_tokens        RLS on, no policy — flagged INFO, but that is 008's
--                   intent: only the service role should hold QuickBooks
--                   OAuth tokens.
-- orphan_photos()   SECURITY DEFINER, EXECUTE to authenticated — flagged
--                   WARN. 010 made it definer on purpose: it is the one
--                   narrow read-only window onto storage.objects, in place
--                   of a blanket grant. anon cannot call it.
-- pg_trgm           Installed in public — flagged WARN. Moving an
--                   extension relocates the operators the inventory and
--                   xref indexes are built on; not worth doing alongside
--                   a security fix.
