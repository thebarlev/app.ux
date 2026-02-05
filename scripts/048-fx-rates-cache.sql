-- 048-fx-rates-cache.sql
-- Purpose: Cache representative FX rates (BOI) for mixed-currency payments scenario.
-- Notes:
-- - Global cache (not company-specific)
-- - Used server-side only

create table if not exists public.fx_rates (
  base_currency text not null,
  quote_currency text not null default 'ILS',
  rate numeric not null,
  rate_date date not null,
  source text not null default 'boi',
  created_at timestamptz not null default now(),
  constraint fx_rates_pk primary key (base_currency, quote_currency, rate_date)
);

create index if not exists fx_rates_lookup
  on public.fx_rates (base_currency, quote_currency, rate_date desc);

comment on table public.fx_rates is
  'Global cache of representative FX rates (e.g. USD->ILS) from BOI SDMX JSON API.';

comment on column public.fx_rates.base_currency is 'ISO currency code for base (e.g. USD).';
comment on column public.fx_rates.quote_currency is 'ISO currency code for quote (fixed to ILS).';
comment on column public.fx_rates.rate is 'Representative FX rate: 1 base_currency = rate quote_currency.';
comment on column public.fx_rates.rate_date is 'Published date of the rate (may be earlier than payment date for weekends/holidays).';
comment on column public.fx_rates.source is 'Rate source (boi expected).';
