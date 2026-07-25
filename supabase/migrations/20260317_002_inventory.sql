-- ═══════════════════════════════════════════════════════════════
-- Migration 002: Inventory, parts on order, vendors
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  item_type TEXT DEFAULT 'Stock',
  qty_on_hand NUMERIC DEFAULT 0,
  min_stock NUMERIC DEFAULT 0,
  cost NUMERIC(10,2) DEFAULT 0,
  sell_price NUMERIC(10,2) DEFAULT 0,
  sell NUMERIC(10,2) DEFAULT 0,
  sold_qty NUMERIC DEFAULT 0,
  oem TEXT,
  part TEXT,
  stens_num TEXT,
  rotary_num TEXT,
  cross_refs TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_id UUID REFERENCES inventory(id),
  transaction_type TEXT,
  qty NUMERIC,
  cost NUMERIC(10,2),
  sell NUMERIC(10,2),
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parts_on_order (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  work_order_id UUID REFERENCES work_orders(id),
  inventory_id UUID REFERENCES inventory(id),
  name TEXT,
  part_number TEXT,
  qty INTEGER DEFAULT 1,
  cost NUMERIC(10,2),
  sell NUMERIC(10,2),
  status TEXT DEFAULT 'Needed',
  vendor TEXT,
  ordered_date DATE,
  received_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  website TEXT,
  account_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts_on_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
