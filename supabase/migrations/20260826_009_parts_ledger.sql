-- ═══════════════════════════════════════════════════════════════
-- Migration 009: Parts ledger
--
-- Every stock movement becomes a row in inventory_transactions —
-- used on a job, received off a vendor bill, counted, returned.
-- Today only hand counts are ever written (154 rows, 0 tied to a
-- job), so "what did I use on Maroney's, and do I need to order
-- another" is unanswerable. This adds the columns that make the
-- ledger answer it.
--
-- Additive only. No existing row is rewritten and no column is
-- dropped — the qty_* columns on inventory stay exactly as they
-- are and keep working until a later migration retires them.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Ledger columns ─────────────────────────────────────────
-- inventory_transactions already carries inventory_id, work_order_id,
-- location, qty_before/after/change and a type. What it can't do is
-- say who the job was for, which machine it went on, or what the
-- part cost at the time — so the feed can't show a customer and the
-- part history can't explain a price change.
ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS customer_id  UUID REFERENCES customers(id),
  ADD COLUMN IF NOT EXISTS equipment_id UUID REFERENCES equipment(id),
  ADD COLUMN IF NOT EXISTS unit_cost    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS unit_sell    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS brand        TEXT,
  ADD COLUMN IF NOT EXISTS part_number  TEXT,
  ADD COLUMN IF NOT EXISTS vendor       TEXT,
  ADD COLUMN IF NOT EXISTS source_ref   TEXT,
  ADD COLUMN IF NOT EXISTS photo_url    TEXT,
  ADD COLUMN IF NOT EXISTS source       TEXT;

COMMENT ON COLUMN inventory_transactions.source IS
  'How the line got here: job | bill | count | manual | backfill';
COMMENT ON COLUMN inventory_transactions.source_ref IS
  'Vendor bill number, or another human-readable reference for the movement';
COMMENT ON COLUMN inventory_transactions.unit_cost IS
  'Cost per unit at the moment of the movement — this is what gives a price a paper trail';

-- transaction_type values in use: used, returned, received,
-- count_adjustment, sold. Left as free text to match what is
-- already stored rather than forcing a rewrite of 154 rows.

-- ── 2. Reading the ledger fast ────────────────────────────────
-- The feed is "newest first across everything", the part history is
-- "newest first for one part", and the job view is "everything for
-- this work order". One index each.
CREATE INDEX IF NOT EXISTS idx_invtx_created
  ON inventory_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invtx_item_created
  ON inventory_transactions (inventory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invtx_wo
  ON inventory_transactions (work_order_id)
  WHERE work_order_id IS NOT NULL;

-- ── 3. Stock locations as rows, not columns ───────────────────
-- One number is what's needed today. But a truck is coming, and
-- "DG1 / DG2 / DG SHOP" as fixed qty_* columns would mean a schema
-- change every time a vehicle is added. Rows cost nothing now and
-- make that a data entry later.
CREATE TABLE IF NOT EXISTS stock_locations (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  label       TEXT,
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO stock_locations (code, label, description, sort_order, active)
VALUES
  ('DG SHOP', 'Shop',  'The shop',        1, true),
  ('DG1',     'DG1',   '2018 Silverado',  2, false),
  ('DG2',     'DG2',   'Second truck',    3, false)
ON CONFLICT (code) DO NOTHING;

-- ── 4. Two brands of the same part ────────────────────────────
-- The shop stocks (for example) a Rotary belt and a Stens belt that
-- fit the same machine. Those are two parts with two counts, not one
-- part with a brand breakdown — a shared interchange_id links them so
-- looking up either one shows the other and its stock.
--
-- Deliberately NOT backfilled: which brand is on which part hasn't
-- been logged yet, and guessing would put wrong data somewhere it
-- would be trusted. Vendor bills name the brand, so scanning them
-- fills this in as a by-product of ordering.
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS interchange_id UUID;

CREATE INDEX IF NOT EXISTS idx_inventory_interchange
  ON inventory (interchange_id)
  WHERE interchange_id IS NOT NULL;

COMMENT ON COLUMN inventory.interchange_id IS
  'Parts sharing this id are the same part in different brands — separate counts, cross-referenced';

-- ── 5. RLS, matching migration 008 ────────────────────────────
-- Same shape as every other application table: authenticated does
-- everything, anon does nothing.
ALTER TABLE stock_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all" ON stock_locations;
CREATE POLICY "authenticated_all" ON stock_locations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON stock_locations TO authenticated;
