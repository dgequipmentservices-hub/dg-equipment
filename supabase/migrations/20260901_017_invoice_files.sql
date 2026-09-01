-- ═══════════════════════════════════════════════════════════════
-- Migration 017: Keep the invoice itself, not a picture of one page
--
-- Parts on Order could read a photographed counter slip, and what
-- it kept afterwards was the photo squeezed to 1200px and shoved
-- into invoice_photos.photo_data as a base64 string. That is the
-- wrong place for a file: the row is megabytes of text, a PDF
-- cannot go in it at all, and none of the 53 parts on order had
-- an invoice_photo_url pointing back at the bill they came from —
-- the scan never wrote one.
--
-- So the file goes to the invoice-photos bucket, and this row
-- becomes the record of the scan: where the file is, what the
-- bill said it was, and which parts came off it. photo_data stops
-- being required so a stored file can stand on its own; the three
-- existing base64 rows keep working and still render.
--
-- Additive. Nothing is rewritten or dropped.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE invoice_photos
  ADD COLUMN IF NOT EXISTS file_url    TEXT,
  ADD COLUMN IF NOT EXISTS file_name   TEXT,
  ADD COLUMN IF NOT EXISTS bill_number TEXT,
  ADD COLUMN IF NOT EXISTS bill_date   DATE,
  ADD COLUMN IF NOT EXISTS line_count  INTEGER,
  ADD COLUMN IF NOT EXISTS batch_id    TEXT;

-- A scan that filed its file has nothing to put in photo_data.
ALTER TABLE invoice_photos
  ALTER COLUMN photo_data DROP NOT NULL;

COMMENT ON COLUMN invoice_photos.file_url IS
  'Public URL of the invoice in the invoice-photos bucket — the image or PDF exactly as it arrived. Older rows kept the image inline in photo_data instead.';
COMMENT ON COLUMN invoice_photos.batch_id IS
  'Matches parts_on_order.invoice_photo_batch: every part read off this bill in one scan.';
COMMENT ON COLUMN invoice_photos.line_count IS
  'How many part lines the reader found on the bill.';

-- The Invoices tab lists newest first; the batch ties a bill to its parts.
CREATE INDEX IF NOT EXISTS idx_invoice_photos_created  ON invoice_photos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_photos_batch    ON invoice_photos(batch_id);
CREATE INDEX IF NOT EXISTS idx_parts_on_order_batch    ON parts_on_order(invoice_photo_batch);
