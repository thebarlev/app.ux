-- Bilingual system_texts: per-language rows (he/en)
-- Run AFTER scripts/010-system-texts-table.sql
-- Safe to run multiple times where possible.

begin;

-- 1) Add lang column (default he) if missing
alter table if exists public.system_texts
  add column if not exists lang text not null default 'he';

-- 2) Constrain lang to supported values
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'system_texts_lang_check'
  ) then
    alter table public.system_texts
      add constraint system_texts_lang_check
      check (lang in ('he','en'));
  end if;
end $$;

-- 3) Drop old unique constraint on key (it was key-only unique)
do $$
declare
  c_name text;
begin
  select conname into c_name
  from pg_constraint
  where conrelid = 'public.system_texts'::regclass
    and contype = 'u'
    and conname = 'system_texts_key_key';

  if c_name is not null then
    execute 'alter table public.system_texts drop constraint ' || quote_ident(c_name);
  end if;
end $$;

-- 4) New uniqueness: key + page + lang
create unique index if not exists system_texts_key_page_lang_uidx
  on public.system_texts(key, page, lang);

-- 5) Helpful index for lookups
create index if not exists idx_system_texts_page_lang on public.system_texts(page, lang);

commit;

-- Ask PostgREST to reload schema cache (Supabase API)
select pg_notify('pgrst', 'reload schema');

