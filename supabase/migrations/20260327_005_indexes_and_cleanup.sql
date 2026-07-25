-- ═══════════════════════════════════════════════════════════════
-- Migration 005: Performance indexes + cleanup
-- ═══════════════════════════════════════════════════════════════

-- Work orders
CREATE INDEX IF NOT EXISTS idx_wo_customer ON work_orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_wo_equipment ON work_orders (equipment_id);
CREATE INDEX IF NOT EXISTS idx_wo_status ON work_orders (status);
CREATE INDEX IF NOT EXISTS idx_wo_invoice_number ON work_orders (invoice_number);
CREATE INDEX IF NOT EXISTS idx_wo_created_at ON work_orders (created_at DESC);

-- Customers
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (name);

-- Equipment
CREATE INDEX IF NOT EXISTS idx_equipment_customer ON equipment (customer_id);

-- Inventory
CREATE INDEX IF NOT EXISTS idx_inventory_name ON inventory (name);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory (category);
CREATE INDEX IF NOT EXISTS idx_inventory_qty ON inventory (qty_on_hand) WHERE qty_on_hand <= COALESCE(min_stock, 0);

-- Inventory transactions
CREATE INDEX IF NOT EXISTS idx_inv_trans_inventory_id ON inventory_transactions (inventory_id);
CREATE INDEX IF NOT EXISTS idx_inv_trans_type ON inventory_transactions (transaction_type);
CREATE INDEX IF NOT EXISTS idx_inv_trans_created_at ON inventory_transactions (created_at DESC);

-- Payments
CREATE INDEX IF NOT EXISTS idx_payments_wo ON payments (work_order_id);

-- Parts on order
CREATE INDEX IF NOT EXISTS idx_parts_on_order_wo ON parts_on_order (work_order_id);
CREATE INDEX IF NOT EXISTS idx_parts_on_order_status ON parts_on_order (status);

-- Maintenance reminders
CREATE INDEX IF NOT EXISTS idx_reminders_customer ON maintenance_reminders (customer_id);
CREATE INDEX IF NOT EXISTS idx_reminders_equipment ON maintenance_reminders (equipment_id);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON maintenance_reminders (next_due_date) WHERE active = true;

-- Leads
CREATE INDEX IF NOT EXISTS idx_leads_followup ON leads (follow_up_date) WHERE status NOT IN ('won','lost');
