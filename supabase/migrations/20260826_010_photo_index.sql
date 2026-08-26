-- ═══════════════════════════════════════════════════════════════
-- Migration 010: Photo index
--
-- 42 equipment photos are stored and 40 are still attached to a
-- machine or job — almost nothing is lost. The problem is that a
-- photo has exactly one door: open the record that owns it. There
-- are 26 screens in the app and none of them lists photos, so a
-- machine you scanned can't be found again unless you remember
-- which machine it was.
--
-- Photos are referenced from ten columns across eight tables in
-- four different shapes: a single url, a jsonb array, a
-- comma-joined string, and one case of the image itself stored as
-- text in the database. This gives all of them one front door.
--
-- Read-only. Creates no tables and rewrites nothing.
-- ═══════════════════════════════════════════════════════════════

-- security_invoker: the view is read with the caller's own
-- permissions, so RLS on the base tables still applies.
CREATE OR REPLACE VIEW photo_index WITH (security_invoker = on) AS
SELECT
  'equipment'::text AS kind, e.id AS owner_id, e.customer_id,
  e.photo_url AS url,
  COALESCE(NULLIF(TRIM(CONCAT_WS(' ', e.make, e.model)), ''), 'Machine') AS title,
  e.serial AS subtitle, e.created_at AS taken_at
FROM equipment e
WHERE e.photo_url IS NOT NULL AND e.photo_url <> ''

UNION ALL
SELECT 'equipment', e.id, e.customer_id, TRIM(BOTH '"[] ' FROM x),
  COALESCE(NULLIF(TRIM(CONCAT_WS(' ', e.make, e.model)), ''), 'Machine'),
  e.serial, e.created_at
FROM equipment e, LATERAL regexp_split_to_table(e.photos_json, ',') x
WHERE e.photos_json ~ 'https?://' AND TRIM(BOTH '"[] ' FROM x) ~ '^https?://'

UNION ALL
SELECT 'work_order', w.id, w.customer_id, u,
  COALESCE(NULLIF(w.problem, ''), 'Work order'),
  CASE WHEN w.invoice_number IS NOT NULL THEN 'INV-' || w.invoice_number END,
  COALESCE(w.scheduled_date::timestamptz, w.created_at)
FROM work_orders w, LATERAL jsonb_array_elements_text(w.photo_urls) u
WHERE jsonb_typeof(w.photo_urls) = 'array' AND u ~ '^https?://'

UNION ALL
SELECT 'capture', q.id, NULL::uuid, u, 'Quick capture', NULL, q.created_at
FROM quick_captures q, LATERAL jsonb_array_elements_text(q.photo_urls) u
WHERE jsonb_typeof(q.photo_urls) = 'array' AND u ~ '^https?://'

UNION ALL
SELECT 'bill', o.id, o.customer_id, o.invoice_photo_url,
  COALESCE(NULLIF(o.vendor, ''), 'Vendor bill'),
  COALESCE(o.part_name, ''), COALESCE(o.ordered_at, o.created_at)
FROM parts_on_order o
WHERE o.invoice_photo_url IS NOT NULL AND o.invoice_photo_url ~ '^https?://'

UNION ALL
SELECT 'part', i.id, NULL::uuid, i.photo_url,
  COALESCE(NULLIF(i.name, ''), 'Part'), COALESCE(i.part, i.oem), i.created_at
FROM inventory i
WHERE i.photo_url IS NOT NULL AND i.photo_url ~ '^https?://'

UNION ALL
SELECT 'diagram', d.id, NULL::uuid, d.file_url,
  COALESCE(NULLIF(TRIM(CONCAT_WS(' ', d.brand, d.model)), ''), 'Diagram'),
  d.section, d.created_at
FROM parts_diagrams d
WHERE d.file_url IS NOT NULL AND d.file_url ~ '^https?://';

GRANT SELECT ON photo_index TO authenticated;

-- Files in storage nothing points at any more. Reading
-- storage.objects needs privileges the browser role doesn't have, so
-- this is a narrow read-only window onto exactly that question rather
-- than a blanket grant.
CREATE OR REPLACE FUNCTION public.orphan_photos()
RETURNS TABLE (bucket_id text, name text, created_at timestamptz, size bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT o.bucket_id, o.name, o.created_at, (o.metadata->>'size')::bigint
  FROM storage.objects o
  WHERE o.bucket_id IN ('equipment-photos','parts-diagrams','invoice-photos')
    AND NOT EXISTS (SELECT 1 FROM photo_index p WHERE p.url LIKE '%' || o.name)
  ORDER BY o.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.orphan_photos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orphan_photos() TO authenticated;
