-- ═══════════════════════════════════════════════════════════════
-- Migration 011: Separate purchase notes from part notes
--
-- Where a part was bought is a different fact from what the part is,
-- and they were sharing one notes box. A bill-created part filled it
-- with "Added from Russo Power Equipment #699101", which pushed out
-- anything worth writing about the part itself.
--
-- Additive. Nothing is rewritten.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS purchase_notes TEXT;

COMMENT ON COLUMN inventory.purchase_notes IS
  'Where and when this part was bought — vendor, bill number, date. Kept apart from notes, which is about the part itself.';
COMMENT ON COLUMN inventory.notes IS
  'Notes about the part itself — what it fits, what to watch for. Purchase history lives in purchase_notes.';
