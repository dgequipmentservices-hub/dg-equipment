-- 2026-10-09 — Keep the invoice PDF the shop sends, for the customer portal.
--
-- Whenever the app builds an invoice PDF (sending it, or preparing a
-- customer's portal), it saves that exact file here as
-- <customer_id>/<work_order_id>.pdf, replacing the last copy. The portal's
-- "Download invoice" hands out this file and nothing else.
--
-- Private bucket: no public read. The app (authenticated) writes and reads
-- it; customers only ever get a short-lived signed link, made by the
-- `portal` Edge Function after it checks the invoice is theirs.
-- Additive: a new bucket and policies scoped to it.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('invoice-pdfs', 'invoice-pdfs', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "authenticated_read_invoice_pdfs" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'invoice-pdfs');
CREATE POLICY "authenticated_write_invoice_pdfs" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'invoice-pdfs');
CREATE POLICY "authenticated_update_invoice_pdfs" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'invoice-pdfs') WITH CHECK (bucket_id = 'invoice-pdfs');
CREATE POLICY "authenticated_delete_invoice_pdfs" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'invoice-pdfs');
