-- ====================================================
-- 032 - Companies: books region + tax officer notification metadata
-- ====================================================
-- Purpose: store metadata only (no operational logic).

begin;

alter table public.companies
  add column if not exists books_region text not null default 'IL',
  add column if not exists notified_tax_officer_at timestamptz,
  add column if not exists notified_tax_officer_notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'companies_books_region_check'
  ) then
    alter table public.companies
      add constraint companies_books_region_check
      check (books_region in ('IL','OTHER'));
  end if;
end $$;

commit;

select pg_notify('pgrst', 'reload schema');

