-- ═══════════════════════════════════════════════════════════════
-- DG Equipment Repair & Services — Migration 001
-- Initial schema: core tables
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  customer_type TEXT DEFAULT 'Residential',
  tax_exempt BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  make TEXT,
  model TEXT,
  serial TEXT,
  equipment_type TEXT,
  year TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id),
  equipment_id UUID REFERENCES equipment(id),
  extra_equipment_ids JSONB DEFAULT '[]',
  status TEXT DEFAULT 'New',
  invoice_status TEXT DEFAULT 'unbilled',
  invoice_number INTEGER,
  problem TEXT,
  scheduled_date DATE,
  location TEXT,
  machines_data JSONB DEFAULT '{}',
  urgent BOOLEAN DEFAULT false,
  internal_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  work_order_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
  amount NUMERIC(10,2),
  method TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
