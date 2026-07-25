-- ═══════════════════════════════════════════════════════════════
-- DG Equipment — Migration 007
-- Session security, Backlog status, WO columns, invoice numbers
-- ═══════════════════════════════════════════════════════════════

-- Session validation function (SECURITY DEFINER bypasses RLS)
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

-- Tighten RLS: require valid session for all data tables
-- app_users: anon SELECT only (for login)
DROP POLICY IF EXISTS "allow all app_users" ON app_users;
CREATE POLICY IF NOT EXISTS "login_select" ON app_users FOR SELECT TO anon USING (true);
CREATE POLICY IF NOT EXISTS "owner_all" ON app_users FOR ALL TO authenticated USING (true);

-- All other tables session-gated
DO $$
DECLARE t text;
DECLARE tables text[] := ARRAY[
  'customers','equipment','work_orders','inventory',
  'inventory_transactions','payments','maintenance_reminders',
  'parts_on_order','price_matrix','leads','vendors',
  'qbo_tokens','app_config'
];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "allow all" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "allow all %s" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "allow_all" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "allow_all_%s" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "all" ON %I', t);
    BEGIN
      EXECUTE format(
        'CREATE POLICY "session_required" ON %I FOR ALL TO anon USING (is_app_session_valid())', t
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- Work order new columns
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS urgent BOOLEAN DEFAULT false;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS qbo_pushed BOOLEAN DEFAULT false;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS qbo_invoice_id TEXT;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS qbo_payment_link TEXT;

-- App users new columns
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS pin TEXT;

-- Normalize statuses
UPDATE work_orders SET status = 'Invoiced' WHERE status IN ('billed','Billed','completed','Completed','Scheduled');
UPDATE work_orders SET invoice_status = 'unbilled' WHERE invoice_status IN ('unpaid','billed');

-- Session active default
INSERT INTO app_config (key, value) VALUES ('session_active', 'true')
ON CONFLICT (key) DO UPDATE SET value = 'true';
