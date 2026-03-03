-- ====================================================
-- 085 - Add processing lock to auditor_billing_events
-- ====================================================
-- Purpose: Prevent double processing when cron runs in parallel.
-- ====================================================

begin;

alter table public.auditor_billing_events
  add column if not exists processing_started_at timestamptz;

alter table public.auditor_billing_events
  drop constraint if exists auditor_billing_events_status_check;

alter table public.auditor_billing_events
  add constraint auditor_billing_events_status_check
  check (status in ('received','processing','ok','error'));

create index if not exists idx_auditor_billing_events_pending
  on public.auditor_billing_events(provider, received_at)
  where status = 'received' and processed_at is null and processing_started_at is null;

-- Atomic claim: returns rows and marks them processing in one transaction
create or replace function public.auditor_billing_events_claim_pending(
  p_provider text,
  p_limit int default 3
)
returns table (provider text, event_id text, payload jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select e.provider, e.event_id, e.payload
    from auditor_billing_events e
    where e.provider = p_provider
      and e.processed_at is null
      and (
        (e.status = 'received' and e.processing_started_at is null)
        or (e.status = 'processing' and e.processing_started_at < now() - interval '10 minutes')
      )
    order by e.received_at
    limit p_limit
    for update skip locked
  loop
    update auditor_billing_events
    set status = 'processing', processing_started_at = now()
    where auditor_billing_events.provider = r.provider and auditor_billing_events.event_id = r.event_id;
    provider := r.provider;
    event_id := r.event_id;
    payload := r.payload;
    return next;
  end loop;
end;
$$;

revoke all on function public.auditor_billing_events_claim_pending(text, int) from public;
grant execute on function public.auditor_billing_events_claim_pending(text, int) to service_role;

commit;
