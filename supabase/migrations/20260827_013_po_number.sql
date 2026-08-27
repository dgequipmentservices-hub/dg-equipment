-- ═══════════════════════════════════════════════════════════════
-- Migration 013: Customer PO number on a work order
--
-- Commercial customers hand over a purchase order number when they
-- drop a machine off, and their accounts payable will not pay an
-- invoice that doesn't carry it back. It was being written in the
-- job description, where it prints as prose and never reaches
-- QuickBooks as anything a bookkeeper can match on.
--
-- Additive only. No existing row is rewritten, no column dropped.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS po_number TEXT;

COMMENT ON COLUMN work_orders.po_number IS
  'The customer''s own purchase order number for this job — printed on the invoice and sent to QuickBooks';
