-- Count Mode counts by brand: two parts on the same shelf can be Stens 2 and
-- Rotary 3. The qty_<brand> columns only hold one number per brand for the
-- whole business, so they cannot say where those two Stens are. qty_by_brand
-- carries the breakdown per location:
--   {"truck": {"Stens": 2, "Rotary": 3}, "shop": {"Stens": 1}}
-- The qty_<brand> columns stay in sync for the brands that have one, so the
-- inventory list, merges, and everything else keep reading what they read now.
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS qty_by_brand JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Seed the parts that were already counted by brand. Only rows whose stock all
-- sits at one location can be placed with certainty, which today is every one
-- of them; anything else stays empty and gets filled by the next count.
UPDATE inventory i
SET qty_by_brand = jsonb_build_object(
  CASE
    WHEN COALESCE(qty_truck,0)  > 0 THEN 'truck'
    WHEN COALESCE(qty_shop,0)   > 0 THEN 'shop'
    WHEN COALESCE(qty_garage,0) > 0 THEN 'garage'
    ELSE 'unknown'
  END,
  jsonb_strip_nulls(jsonb_build_object(
    'OEM',      NULLIF(COALESCE(qty_oem,0),0),
    'Stens',    NULLIF(COALESCE(qty_stens,0),0),
    'Rotary',   NULLIF(COALESCE(qty_rotary,0),0),
    'Wright',   NULLIF(COALESCE(qty_wright,0),0),
    'Scag',     NULLIF(COALESCE(qty_scag,0),0),
    'RedMax',   NULLIF(COALESCE(qty_redmax,0),0),
    'Echo',     NULLIF(COALESCE(qty_echo,0),0),
    'Toro',     NULLIF(COALESCE(qty_toro,0),0),
    'Kawasaki', NULLIF(COALESCE(qty_kawasaki,0),0),
    'Briggs',   NULLIF(COALESCE(qty_briggs,0),0),
    'Honda',    NULLIF(COALESCE(qty_honda,0),0)
  ))
)
WHERE i.qty_by_brand = '{}'::jsonb
  AND (COALESCE(qty_oem,0) + COALESCE(qty_stens,0) + COALESCE(qty_rotary,0)
     + COALESCE(qty_wright,0) + COALESCE(qty_scag,0) + COALESCE(qty_redmax,0)
     + COALESCE(qty_echo,0) + COALESCE(qty_toro,0) + COALESCE(qty_kawasaki,0)
     + COALESCE(qty_briggs,0) + COALESCE(qty_honda,0)) > 0
  AND ((COALESCE(qty_truck,0)  > 0)::int
     + (COALESCE(qty_shop,0)   > 0)::int
     + (COALESCE(qty_garage,0) > 0)::int
     + (COALESCE(qty_unknown,0)> 0)::int) = 1;

NOTIFY pgrst, 'reload schema';
