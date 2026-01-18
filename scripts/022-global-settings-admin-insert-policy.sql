-- Migration: Allow system admins to INSERT into global_settings (needed for upsert)
-- Date: 2026-01-18
-- Description:
--   SettingsPanel uses upsert() to ensure rows exist.
--   global_settings has RLS enabled; existing policies allow SELECT + UPDATE for system admins,
--   but INSERT was not allowed, causing: "new row violates row-level security policy".

begin;

drop policy if exists "System admins can insert global settings" on public.global_settings;
create policy "System admins can insert global settings" on public.global_settings
  for insert
  with check (
    exists (
      select 1 from public.system_admins
      where system_admins.auth_user_id = auth.uid()
    )
  );

commit;

-- Ask PostgREST to reload schema cache (Supabase API)
select pg_notify('pgrst', 'reload schema');

