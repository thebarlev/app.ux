-- Add document language support (he/en) for generated documents (receipts, etc.)
-- Safe to run multiple times.

alter table if exists public.documents
  add column if not exists language text not null default 'he';

-- Optional constraint to keep values clean (will be created only if not exists)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_language_check'
  ) then
    alter table public.documents
      add constraint documents_language_check
      check (language in ('he', 'en'));
  end if;
end $$;

-- Ask PostgREST to reload schema cache (Supabase API)
-- If this fails in your environment, you can ignore and just wait/restart.
select pg_notify('pgrst', 'reload schema');

