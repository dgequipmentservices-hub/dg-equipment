-- ═══════════════════════════════════════════════════════════════
-- Migration 006: RLS security — session-gated access
-- ═══════════════════════════════════════════════════════════════

-- Session validation function (SECURITY DEFINER bypasses RLS on app_config)
CREATE OR REPLACE FUNCTION is_app_session_valid()
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_config 
    WHERE key = 'session_active' 
    AND value = 'true'
  );
$$;

-- app_users: anon SELECT only (for login), owners get full access
CREATE POLICY "login_select" ON app_users FOR SELECT TO anon USING (true);
CREATE POLICY "owner_all" ON app_users FOR ALL TO authenticated USING (true);

-- All other tables require valid session
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'customers','equipment','work_orders','inventory',
    'inventory_transactions','payments','maintenance_reminders',
    'parts_on_order','price_matrix','leads','vendors',
    'qbo_tokens','app_config'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE POLICY "session_required" ON %I FOR ALL TO anon USING (is_app_session_valid())',
      t
    );
  END LOOP;
END $$;
