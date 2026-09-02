-- Invoice numbers mean "this was billed", and nothing else.
--
-- trg_invoice_number stamped a number on EVERY work order at INSERT. A job
-- that had only been written down carried an invoice number, so:
--
--   * a brand-new empty job (INV 1408, Mike Maroney) sat on the Invoices
--     screen as a bill owing money;
--   * "Create Invoice" in the client was gated on `if (!w.invoice_number)`,
--     which was never true, so it skipped the branch that writes the billing
--     state — the invoice printed and then read as "no inv" everywhere
--     (INV 1400, Cipriano);
--   * numbers were burned on jobs that were never billed.
--
-- Worse, there were two allocators fighting: this trigger's sequence, and a
-- max(invoice_number)+1 loop in the client. They had already come apart —
-- the sequence sat at 1408 while 1409 was live — so the next work order
-- inserted would have failed on work_orders_invoice_number_unique.
--
-- One allocator now, firing at the one moment a number means something.

-- 1. The sequence has to be ahead of every number already handed out,
--    including the ones the client allocated behind its back.
SELECT setval(
  'invoice_number_seq',
  GREATEST((SELECT COALESCE(MAX(invoice_number), 1321) FROM work_orders),
           (SELECT last_value FROM invoice_number_seq)),
  true
);

-- 2. A number is issued when a job becomes billed — not when it is created.
--    An existing number is never reissued or overwritten, so a row that
--    already carries one keeps it, and un-billing (Convert back to WO,
--    Delete Invoice) still clears it.
CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.invoice_number IS NULL
     AND (NEW.invoice_status IN ('invoiced', 'partial', 'paid')
          OR NEW.status IN ('Invoiced', 'Closed')) THEN
    NEW.invoice_number := nextval('invoice_number_seq');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_invoice_number ON work_orders;
CREATE TRIGGER trg_invoice_number
  BEFORE INSERT OR UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_number();

-- 3. Rows where the two status columns had already drifted apart. The app
--    reads invoice_status as the authority, so `status` is the one to bring
--    into line: a job that is invoiced, part-paid or paid is Invoiced.
--    (Closed is a later stage and is left alone.)
UPDATE work_orders
   SET status = 'Invoiced'
 WHERE invoice_status IN ('invoiced', 'partial', 'paid')
   AND status NOT IN ('Invoiced', 'Closed');

-- 4. INV-1400 (Cipriano Landscaping). The invoice was created and sent; the
--    client's dead branch meant no billing state was ever written, so it
--    read as "no inv" while showing a $1,023 total. It has real work logged
--    and a number already issued.
UPDATE work_orders
   SET status = 'Invoiced',
       invoice_status = 'invoiced',
       invoiced_at = COALESCE(invoiced_at, updated_at, now())
 WHERE invoice_number = 1400
   AND invoice_status = 'unbilled';
