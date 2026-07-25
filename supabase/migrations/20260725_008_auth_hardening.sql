-- ═══════════════════════════════════════════════════════════════
-- Migration 008: Real authentication
--
-- Replaces the global "session_active" gate with per-request JWT auth.
--
-- What was wrong
-- ──────────────
-- Every data table was gated on one boolean row: app_config.session_active.
-- Worse, the write_app_config policy let the anon role UPDATE that exact key:
--
--   CREATE POLICY write_app_config ON app_config FOR UPDATE TO anon
--     USING ((key = 'session_active') OR is_app_session_valid());
--
-- The anon key is published in index.html, so anyone could flip the flag on
-- and then read or write every gated table — customers, work_orders,
-- payments, app_users (password hashes), qbo_tokens (QuickBooks OAuth
-- tokens). The gate could be opened by the people it was meant to keep out.
--
-- Several tables had no gate at all: app_settings, invoice_photos,
-- parts_diagrams, prospects and wo_part_costs were USING (true) to public.
--
-- What replaces it
-- ────────────────
-- app-auth now returns a signed JWT with role=authenticated. PostgREST
-- verifies the signature per request, so access is proven by the token
-- rather than by a shared flag that any caller can set. anon keeps no
-- table access at all; the login path never touches the database directly.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. anon loses all table access ────────────────────────────────────
-- Login goes through the app-auth Edge Function (service role), so the
-- browser needs no anon table privileges before it holds a JWT.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- ── 2. Drop every existing policy in public ───────────────────────────
-- Policy names drifted across migrations 006/007 and manual edits, so
-- clear them all rather than guessing at names.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname
           FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ── 2b. storage.objects ───────────────────────────────────────────────
-- A storage policy also called is_app_session_valid(), so the function
-- cannot be dropped until this is replaced. Storage had its own holes
-- besides: "anon upload diagrams" and "anon delete diagrams" let any
-- caller add or destroy files in the parts-diagrams bucket.
--
-- Writes now require a token. Public SELECT policies are deliberately left
-- in place — the app renders photos straight from bucket URLs, and
-- removing read access would break that. Bucket listing is still open;
-- see the README follow-up.
DROP POLICY IF EXISTS "session_read_backups" ON storage.objects;
CREATE POLICY "authenticated_read_backups" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'backups');

DROP POLICY IF EXISTS "anon upload diagrams" ON storage.objects;
CREATE POLICY "authenticated_upload_diagrams" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'parts-diagrams');

DROP POLICY IF EXISTS "anon delete diagrams" ON storage.objects;
CREATE POLICY "authenticated_delete_diagrams" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'parts-diagrams');

DROP POLICY IF EXISTS "auth upload equipment photos" ON storage.objects;
CREATE POLICY "authenticated_upload_equipment_photos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'equipment-photos');

DROP POLICY IF EXISTS "auth delete equipment photos" ON storage.objects;
CREATE POLICY "authenticated_delete_equipment_photos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'equipment-photos');

-- invoice_photos_all was ALL to public. Split it: reads stay open so the
-- app can display them, writes require a token.
DROP POLICY IF EXISTS "invoice_photos_all" ON storage.objects;
CREATE POLICY "public_read_invoice_photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'invoice-photos');
CREATE POLICY "authenticated_write_invoice_photos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'invoice-photos');
CREATE POLICY "authenticated_update_invoice_photos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'invoice-photos');
CREATE POLICY "authenticated_delete_invoice_photos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'invoice-photos');

-- ── 3. The session flag is gone ───────────────────────────────────────
DROP FUNCTION IF EXISTS is_app_session_valid();
DELETE FROM app_config WHERE key = 'session_active';

-- ── 4. Application tables: any holder of a valid JWT ──────────────────
-- Role separation (owner vs tech) stays in the app layer, which is where
-- it already lives. The database's job here is to require a real token.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'customers','equipment','work_orders','wo_line_items','wo_part_costs',
    'payments','inventory','inventory_transactions','parts_on_order',
    'vendors','price_matrix','leads','prospects','maintenance_reminders',
    'job_templates','day_plans','quick_captures','resources',
    'invoice_photos','parts_diagrams','app_settings','backup_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format(
        'CREATE POLICY "authenticated_all" ON %I FOR ALL TO authenticated '
        'USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;

-- ── 5. Reference data: read-only ──────────────────────────────────────
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['oem_xref','rotary_xref'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format(
        'CREATE POLICY "authenticated_read" ON %I FOR SELECT TO authenticated '
        'USING (true)', t);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON %I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;

-- ── 6. qbo_tokens: service role only ──────────────────────────────────
-- Only qbo-auth and qbo-push touch these, and both run with the service
-- role, which bypasses RLS. The browser has no reason to hold QuickBooks
-- OAuth tokens, so it gets no policy and no grant.
ALTER TABLE qbo_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON qbo_tokens FROM authenticated;

-- ── 7. app_config: readable, not writable ─────────────────────────────
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read" ON app_config
  FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON app_config FROM authenticated;

-- ── 8. app_users: no password material leaves the database ────────────
-- RLS is row-level, so column privileges are what keep password_hash and
-- pin out of reach. A signed-in tech can list users; nobody but the
-- service role can read or write credentials. Password changes go through
-- app-auth, which hashes with a per-user salt.
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_read" ON app_users
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_manage" ON app_users
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE ALL ON app_users FROM authenticated;
GRANT SELECT (id, username, role, display_name, active, notes, created_at)
  ON app_users TO authenticated;
GRANT INSERT (username, role, display_name, active, notes)
  ON app_users TO authenticated;
GRANT UPDATE (username, role, display_name, active, notes)
  ON app_users TO authenticated;
GRANT DELETE ON app_users TO authenticated;

-- ── 9. Salted password storage ────────────────────────────────────────
-- Passwords were stored as a bare SHA-256 of the password: unsalted, and
-- fast enough to brute force offline. These columns let app-auth store
-- PBKDF2-SHA256 instead. password_algo NULL means "still legacy sha256";
-- app-auth upgrades each row in place on the owner's next sign-in, so no
-- password resets are needed.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_salt TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_algo TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_iterations INTEGER;

-- ── 10. SECURITY DEFINER functions ────────────────────────────────────
-- Both were callable by anon over /rest/v1/rpc/. Pin their search_path
-- and keep them off the public API.
ALTER FUNCTION public.assign_invoice_number() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
-- Postgres grants EXECUTE on functions to PUBLIC by default, so revoking from
-- anon and authenticated individually is not enough — PUBLIC has to go first
-- or the function stays callable. It is SECURITY DEFINER and writes oem_xref.
REVOKE EXECUTE ON FUNCTION public.load_oem_xref_batch(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.load_oem_xref_batch(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_oem_xref_batch(jsonb) TO service_role;
