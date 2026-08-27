-- ═══════════════════════════════════════════════════════════════
-- Migration 014: One canonical list of machine makes and models
--
-- The same machine was on file three ways — "RedMax EBZ7500",
-- "Redmax EBZ7500", "Redmax Ebz7500" — because make and model were
-- free text typed from scratch every time. Search normalises, so it
-- still found them, but they showed as three different machines and
-- no fitment learned on one applied to the others.
--
-- This is the list everything canonicalises against from now on.
-- The app ships EQ_DB (its built-in make/model catalogue) and reads
-- it straight from the page, so this table only carries what EQ_DB
-- doesn't know: every machine actually seen in this shop, plus
-- anything typed in later. A machine that matches nothing is added
-- here as it is entered, so the second one to be typed always gets
-- the spelling of the first.
--
-- Additive: creates a new table, touches nothing existing.
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS machine_models (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  make            TEXT NOT NULL,
  model           TEXT NOT NULL DEFAULT '',
  equipment_type  TEXT,
  -- Normalised for matching: lower case, letters and digits only, so
  -- "EBZ-7500", "ebz7500" and "Ebz 7500" are all the same key.
  make_key        TEXT NOT NULL,
  model_key       TEXT NOT NULL DEFAULT '',
  -- Extra spellings that don't normalise to the same key on their own
  -- ("SCAG POWER EQUIPMENT" for Scag). Normalised keys, one per entry.
  aliases         TEXT[] DEFAULT '{}',
  -- catalog = shipped with the app, fleet = seen on a customer's
  -- machine, learned = typed in after this migration
  source          TEXT DEFAULT 'catalog',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (make_key, model_key)
);

CREATE INDEX IF NOT EXISTS idx_machine_models_make ON machine_models (make_key);

COMMENT ON TABLE machine_models IS
  'Canonical machine makes and models. A row with an empty model is the make itself.';

ALTER TABLE machine_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON machine_models;
CREATE POLICY "authenticated_all" ON machine_models
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON machine_models TO authenticated;

-- ── Seed: every machine on a customer's card, spelled once ─────
-- Brand case settled (RedMax, Echo, Bluebird, Scag), model codes in
-- upper case the way they are printed on the tag, and the app's own
-- catalogue spelling where it has one.
INSERT INTO machine_models (make, model, equipment_type, make_key, model_key, source) VALUES
  ('Ariens','911605','Walk-behind Mower','ariens','911605','fleet'),
  ('Ariens','920025','Snowblower','ariens','920025','fleet'),
  ('Ariens','920402','Snowblower','ariens','920402','fleet'),
  ('Ariens','921013','Snowblower','ariens','921013','fleet'),
  ('Ariens','926038','Snowblower','ariens','926038','fleet'),
  ('Ariens','926040','Snowblower','ariens','926040','fleet'),
  ('Ariens','932041','Snowblower','ariens','932041','fleet'),
  ('Ariens','932101','Snowblower','ariens','932101','fleet'),
  ('Ariens','939401','Snowblower','ariens','939401','fleet'),
  ('BCS','','Tiller','bcs','','fleet'),
  ('Bluebird','968999429','Dethatcher','bluebird','968999429','fleet'),
  ('Bluebird','F20-B','Dethatcher','bluebird','f20b','fleet'),
  ('Bobcat','773','Skidsteer','bobcat','773','fleet'),
  ('Boss','N/A','Snow Plow','boss','na','fleet'),
  ('Briggs and Stratton','1697293','Snowblower','briggsandstratton','1697293','fleet'),
  ('Brute (Briggs)','1695725','Snowblower','brutebriggs','1695725','fleet'),
  ('Classen','Tr 20','Power Rake','classen','tr20','fleet'),
  ('Craftsman','247.881700','Snowblower','craftsman','247881700','fleet'),
  ('Craftsman','247.881723','Snowblower','craftsman','247881723','fleet'),
  ('Craftsman','247.883970','Snowblower','craftsman','247883970','fleet'),
  ('Craftsman','31AS68EE791','Snowblower','craftsman','31as68ee791','fleet'),
  ('Craftsman','536.881800','Snowblower','craftsman','536881800','fleet'),
  ('Cub Cadet','31AH54TC756','Snowblower','cubcadet','31ah54tc756','fleet'),
  ('Cub Cadet','31AH5DSA756','Snowblower','cubcadet','31ah5dsa756','fleet'),
  ('Cub Cadet','31AH5DVU756','Snowblower','cubcadet','31ah5dvu756','fleet'),
  ('Cub Cadet','31AM53TR756','Snowblower','cubcadet','31am53tr756','fleet'),
  ('Cub Cadet','31AM63SR756','Snowblower','cubcadet','31am63sr756','fleet'),
  ('Dewalt','','Pressure Washer','dewalt','','fleet'),
  ('Doosan','G25P-5','Other','doosan','g25p5','fleet'),
  ('Echo','PAS-225','Other','echo','pas225','fleet'),
  ('Echo','PAS-2620','Hedge Trimmer','echo','pas2620','fleet'),
  ('Echo','PAS266','Other','echo','pas266','fleet'),
  ('Echo','SCH-2620','Trimmer','echo','sch2620','fleet'),
  ('Exmark','ECS180CKA30000','Walk-behind Mower','exmark','ecs180cka30000','fleet'),
  ('Exmark','ECX160CHN21000','Walk-behind Mower','exmark','ecx160chn21000','fleet'),
  ('Exmark','ECX180CKA21000','Walk-behind Mower','exmark','ecx180cka21000','fleet'),
  ('Honda','HRR2166VKA','Walk-behind Mower','honda','hrr2166vka','fleet'),
  ('Honda','HRR216VKA','Walk-behind Mower','honda','hrr216vka','fleet'),
  ('John Deere','1023','Tractor','johndeere','1023','fleet'),
  ('John Deere','TRS27','Snowblower','johndeere','trs27','fleet'),
  ('Lesco','32"','Walk-behind Mower','lesco','32','fleet'),
  ('McLane','100','Other','mclane','100','fleet'),
  ('MTD','315E640F000','Snowblower','mtd','315e640f000','fleet'),
  ('Murray','620104X4','Other','murray','620104x4','fleet'),
  ('Murray','629118X5A','Snowblower','murray','629118x5a','fleet'),
  ('Murray','N/A','Snowblower','murray','na','fleet'),
  ('N/A','','General / Supplies','na','','fleet'),
  ('Other','','Other','other','','fleet'),
  ('Poulan','P3816','Chainsaw','poulan','p3816','fleet'),
  ('Poulan','PR624ES','Snowblower','poulan','pr624es','fleet'),
  ('RedMax','BCZ230TS','Trimmer','redmax','bcz230ts','fleet'),
  ('RedMax','EB7001','Blower','redmax','eb7001','fleet'),
  ('RedMax','EBZ8560','Blower','redmax','ebz8560','fleet'),
  ('Saber','PR-6RSS','Power Rake','saber','pr6rss','fleet'),
  ('Scag','36 walk behind','Walk-behind Mower','scag','36walkbehind','fleet'),
  ('Scag','SW32-14FS','Walk-behind Mower','scag','sw3214fs','fleet'),
  ('Scag','SW36','Walk-behind Mower','scag','sw36','fleet'),
  ('Scag','SW36A','Walk-behind Mower','scag','sw36a','fleet'),
  ('Scag','SW36A-14FS','Walk-behind Mower','scag','sw36a14fs','fleet'),
  ('Scag','SW36A-15KA','Other','scag','sw36a15ka','fleet'),
  ('Scag','SW36A-16KAI','Walk-behind Mower','scag','sw36a16kai','fleet'),
  ('Stihl','HL91K','Hedge Trimmer','stihl','hl91k','fleet'),
  ('Stihl','HS56','Hedge Trimmer','stihl','hs56','fleet'),
  ('Sure-trac','','Trailer','suretrac','','fleet'),
  ('Toro','20064','Walk-behind Mower','toro','20064','fleet'),
  ('Toro','20373','Walk-behind Mower','toro','20373','fleet'),
  ('Toro','21199','Walk-behind Mower','toro','21199','fleet'),
  ('Toro','21442','Walk-behind Mower','toro','21442','fleet'),
  ('Toro','22 recycler','Walk-behind Mower','toro','22recycler','fleet'),
  ('Toro','22210','Walk-behind Mower','toro','22210','fleet'),
  ('Toro','22215','Walk-behind Mower','toro','22215','fleet'),
  ('Toro','22295','Walk-behind Mower','toro','22295','fleet'),
  ('Toro','38190','Snowblower','toro','38190','fleet'),
  ('Toro','38413','Snowblower','toro','38413','fleet'),
  ('Toro','38451','Snowblower','toro','38451','fleet'),
  ('Toro','38518','Snowblower','toro','38518','fleet'),
  ('Toro','38582','Snowblower','toro','38582','fleet'),
  ('Toro','38589','Snowblower','toro','38589','fleet'),
  ('Toro','38610','Snowblower','toro','38610','fleet'),
  ('Toro','38640','Snowblower','toro','38640','fleet'),
  ('Toro','38741','Snowblower','toro','38741','fleet'),
  ('Toro','38742','Snowblower','toro','38742','fleet'),
  ('Toro','38744','Snowblower','toro','38744','fleet'),
  ('Toro','38838','Snowblower','toro','38838','fleet'),
  ('Toro','39614','Snowblower','toro','39614','fleet'),
  ('Troy-Bilt','31AS62N2711','Snowblower','troybilt','31as62n2711','fleet'),
  ('Troy-Bilt','31AS6BN2711','Snowblower','troybilt','31as6bn2711','fleet'),
  ('Troy-Bilt','31AS6BN2723','Snowblower','troybilt','31as6bn2723','fleet'),
  ('Troy-Bilt','3TBMGSP37T1','Snowblower','troybilt','3tbmgsp37t1','fleet'),
  ('Walker','MTSD','Tractor','walker','mtsd','fleet'),
  ('Wright','Sentar','Stand-on Mower','wright','sentar','fleet'),
  ('Wright','WS36FS541R','Stand-on Mower','wright','ws36fs541r','fleet'),
  ('Wright','WS36FS600RE','Stand-on Mower','wright','ws36fs600re','fleet'),
  ('Wright','WSR36','Stand-on Mower','wright','wsr36','fleet'),
  ('Wright','WSTN36SFS600E','Stand-on Mower','wright','wstn36sfs600e','fleet'),
  ('Wright','WSTN36SFX600E','Other','wright','wstn36sfx600e','fleet'),
  ('Wright','WSTN36SFX600E1B','Stand-on Mower','wright','wstn36sfx600e1b','fleet')
ON CONFLICT (make_key, model_key) DO NOTHING;
-- Wright's stand-on filed under "Other" is a stand-on mower.
UPDATE machine_models SET equipment_type='Stand-on Mower'
 WHERE make_key='wright' AND model_key='wstn36sfx600e';

-- "SCAG POWER EQUIPMENT" doesn't normalise to "scag" on its own.
INSERT INTO machine_models (make, model, equipment_type, make_key, model_key, aliases, source)
VALUES ('Scag','','Walk-behind Mower','scag','',ARRAY['scagpowerequipment'],'catalog')
ON CONFLICT (make_key, model_key) DO UPDATE SET aliases = EXCLUDED.aliases;
