-- ═══════════════════════════════════════════════════════════════
-- Migration 015: Spell every machine on file one way
--
-- "RedMax EBZ7500", "Redmax EBZ7500" and "Redmax Ebz7500" are one
-- blower. They were three machines to every screen that groups by
-- name, and no fitment learned on one applied to the others.
--
-- 37 machines across 29 spellings, all of them the same machine
-- typed differently: brand case (echo/Echo, Redmax/RedMax), model
-- code case (Ebz8560/EBZ8560), a catalogue spelling (srm225 →
-- SRM-225), one brand written out in full (SCAG POWER EQUIPMENT),
-- and a handful of equipment types that are the same job written
-- two ways (weedwacker → Trimmer).
--
-- Nothing is merged and no row is deleted — each machine keeps its
-- id, its customer, its serial and its history. Only the make,
-- model and type text changes, and the whole table is copied to
-- _equipment_backup_20260827 first.
--
-- Verified after running: 0 spelling collisions left, 160 rows in
-- and 160 rows out, no id, serial or customer touched.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS _equipment_backup_20260827 AS
  SELECT * FROM equipment;

-- ── brand ─────────────────────────────────────────────────────
UPDATE equipment SET make='Echo'     WHERE make='echo';
UPDATE equipment SET make='Other'    WHERE make='other';
UPDATE equipment SET make='Bluebird' WHERE make='Blue Bird';
UPDATE equipment SET make='RedMax'   WHERE make='Redmax';
UPDATE equipment SET make='Scag'     WHERE make='SCAG POWER EQUIPMENT';

-- ── model, where the app's own catalogue names it ─────────────
UPDATE equipment SET model='SRM-225'  WHERE make='Echo' AND model IN ('srm225','Srm225');
UPDATE equipment SET model='SRM-2620' WHERE make='Echo' AND model='Srm2620';
UPDATE equipment SET model='Lawnaire IV' WHERE make='Ryan' AND model='LAWNAIRE IV';

-- ── model, where it is a bare model code typed in mixed case ──
-- These are printed in upper case on the tag and in every manual.
-- Anything with a space is a name a person wrote ("22 recycler",
-- "TimeMaster 30") and is deliberately left alone.
UPDATE equipment SET model=upper(model)
WHERE model ~ '^[A-Za-z0-9][A-Za-z0-9./-]*$'   -- no spaces: a code, not a name
  AND model ~ '[A-Za-z]' AND model ~ '[0-9]'   -- letters and digits both
  AND length(model) >= 4
  AND model <> upper(model)
  AND NOT (make='Echo' AND upper(model) LIKE 'SRM%');  -- catalogue already named these

-- ── equipment type: the same job, written two ways ────────────
UPDATE equipment SET equipment_type='Trimmer'
  WHERE equipment_type IN ('weedwacker','Weed wacker','String Trimmer');
UPDATE equipment SET equipment_type='Walk-behind Mower' WHERE equipment_type='Walk behind mower';
UPDATE equipment SET equipment_type='Power Rake'        WHERE equipment_type='Power rake';
-- A Wright Stander filed as "Other" is a stand-on mower.
UPDATE equipment SET equipment_type='Stand-on Mower'
  WHERE make='Wright' AND model='WSTN36SFX600E' AND equipment_type='Other';

-- ── the manuals, keyed off the same spelling ──────────────────
-- A manual filed under "Ws36FS600RE" and a machine on file as
-- "WS36FS600RE" are the same machine; the Parts Finder should not
-- have to guess.
UPDATE parts_diagrams pd
SET brand = mm.make, model = mm.model
FROM machine_models mm
WHERE lower(regexp_replace(pd.brand,'[^a-zA-Z0-9]','','g')) = mm.make_key
  AND lower(regexp_replace(pd.model,'[^a-zA-Z0-9]','','g')) = mm.model_key
  AND (pd.brand <> mm.make OR pd.model <> mm.model);
