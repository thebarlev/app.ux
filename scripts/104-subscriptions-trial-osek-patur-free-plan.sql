-- ====================================================
-- 104 - Subscriptions: NEW osek_patur companies start on free_patur
-- ====================================================
-- Purpose:
-- - Keep existing subscription logic untouched for non-osek_patur signups
-- - For NEW companies with business_type='osek_patur', create trial subscription with:
--   plan_id = 'free_patur' and a snapshot documents limit (default 50, configurable via global_settings)
-- Notes:
-- - NO backfill: applies only on NEW inserts to companies
-- - Uses subscription snapshot as enforcement source (finalize_document_with_period_guard)
-- ====================================================

begin;

create or replace function public.create_trial_subscription_for_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id text := 'free';
  v_plan_name text := 'Free';
  v_docs_limit integer := 10;
  v_setting text := null;
begin
  if new.business_type = 'osek_patur' then
    v_plan_id := 'free_patur';
    v_plan_name := 'Free (Osek Patur)';

    select gs.setting_value into v_setting
    from public.global_settings gs
    where gs.setting_key = 'osek_patur_free_documents_limit'
    limit 1;

    v_docs_limit := coalesce(nullif(trim(v_setting), '')::int, 50);
  else
    -- Default: existing free plan values from plans catalog
    select p.name, p.documents_per_month
      into v_plan_name, v_docs_limit
    from public.plans p
    where p.id = 'free';

    v_plan_id := 'free';
    v_docs_limit := coalesce(v_docs_limit, 10);
    v_plan_name := coalesce(v_plan_name, 'Free');
  end if;

  insert into public.subscriptions (
    company_id,
    plan_id,
    plan_snapshot_name,
    plan_snapshot_price,
    plan_snapshot_documents_limit,
    plan_snapshot_overage_unit_price,
    plan_snapshot_currency,
    plan_snapshot_billing_period,
    plan_snapshot_created_at,
    status,
    trial_starts_at,
    trial_ends_at,
    current_period_start,
    current_period_end
  ) values (
    new.id,
    v_plan_id,
    v_plan_name,
    0,
    v_docs_limit,
    0,
    'ILS',
    'month',
    now(),
    'trial',
    now(),
    now() + interval '1 year',
    null,
    null
  )
  on conflict (company_id) do nothing;

  return new;
end;
$$;

commit;

select pg_notify('pgrst', 'reload schema');

