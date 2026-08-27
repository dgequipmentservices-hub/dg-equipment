-- ═══════════════════════════════════════════════════════════════
-- Migration 016: Attachments on a machine
--
-- An SRM-225 with a hedge attachment on it is still an SRM-225 —
-- a string trimmer that happens to have a hedge head in the truck.
-- It had been filed under equipment_type 'Hedge Trimmer', which
-- said the machine was something it isn't: it split one model into
-- two on the customer card, and it would have split its fitments
-- in the Parts Finder too.
--
-- The model says what the machine is. This column says what else
-- came with it — a plain list, "Hedge, Edger, Pole saw" — so the
-- shop knows what the customer owns without pretending each head
-- is its own machine.
--
-- Additive. No existing row is rewritten by the ALTER; the two
-- UPDATEs below move one machine's mislabelled type into this
-- column, which is the whole point of adding it.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS attachments TEXT;

COMMENT ON COLUMN equipment.attachments IS
  'Attachment heads that came with this machine — free text list, e.g. "Hedge, Edger". The machine''s own type still comes from its model.';

-- The one SRM-225 filed as a hedge trimmer: it is a trimmer with a
-- hedge attachment, and now it says so in the right place.
UPDATE equipment
   SET attachments = NULLIF(trim(both ', ' FROM coalesce(attachments,'')||', Hedge trimmer'), ''),
       equipment_type = 'Trimmer'
 WHERE make = 'Echo' AND model = 'SRM-225' AND equipment_type = 'Hedge Trimmer';
