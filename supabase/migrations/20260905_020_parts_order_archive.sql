-- Parts on Order never let go of anything. Every line it has ever seen was
-- still on the screen, so a page meant to answer "what am I waiting on"
-- opened onto five months of finished orders and the question got harder to
-- answer, not easier.
--
-- Archiving takes a finished line off the working list without losing it.
-- The row stays exactly where it was: the History tab still finds it, the
-- per-item Orders list on an inventory part still shows what was paid and
-- when, and "Order Again" still works off it. Only the live list skips it.
alter table public.parts_on_order
  add column if not exists archived_at timestamptz;

comment on column public.parts_on_order.archived_at is
  'Set when a finished line is filed away. Null means it belongs on the live Parts on Order list.';

-- Partial index: every read the live screen makes asks for the null side.
create index if not exists parts_on_order_live_idx
  on public.parts_on_order (created_at desc)
  where archived_at is null;

-- The clean slate the owner asked for. Only finished lines are filed away —
-- anything still needed or ordered stays put no matter its age — and the
-- Russo bill scanned in on 2026-05-04 stays on the live list by name.
update public.parts_on_order
   set archived_at = now()
 where archived_at is null
   and status in ('received','installed','cancelled')
   and not (vendor = 'Russo'
            and created_at >= timestamptz '2026-05-04'
            and created_at <  timestamptz '2026-05-05');
