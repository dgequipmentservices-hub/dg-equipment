-- ═══════════════════════════════════════════════════════════════
-- Migration 012: Units sold to a customer
--
-- A work order could only ever be about machines already on file.
-- There was nowhere to put a case of 2-stroke oil sold off the
-- shelf, fuel lines for a Redmax that never came in, or a new
-- SRM-225 walking out the door — all of it real money on a real
-- customer's account.
--
-- Supplies and counter parts need no schema: they ride in
-- work_orders.machines_data under a synthetic key, the same way
-- the Quick Sale screen has always written them.
--
-- A unit sold does need two columns. When the customer says yes to
-- "add it to your machines", the sale is the moment that machine
-- joins their fleet, and next spring's service should be able to
-- say we sold it and what they paid. equipment.purchase_date was
-- already here; these record that it came from us, and for how
-- much.
--
-- Additive only. No existing row is rewritten, no column dropped.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS purchased_from_us BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS purchase_price    NUMERIC(10,2);

COMMENT ON COLUMN equipment.purchased_from_us IS
  'True when DG Equipment sold this unit — set by the "Equipment sold" flow on a work order';
COMMENT ON COLUMN equipment.purchase_price IS
  'What the customer paid us for the unit, at the time of sale';

-- Deliberately NOT backfilled: nothing in the existing rows records
-- where a machine came from, and guessing would put wrong data
-- somewhere it would be trusted. Machines sold from here on carry it.
