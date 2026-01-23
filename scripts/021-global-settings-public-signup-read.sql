-- Migration: Allow public read of signup checkbox requirement settings
-- Date: 2026-01-18
-- Description:
--   /register must be able to read whether legal terms / marketing checkboxes are required.
--   global_settings has RLS enabled (admin-only by default), so we allow SELECT for these specific keys only.

begin;

-- Public can read only the signup requirement flags (and nothing else)
drop policy if exists "Public can view signup checkbox requirements" on public.global_settings;
create policy "Public can view signup checkbox requirements" on public.global_settings
  for select
  using (
    setting_key in (
      'require_legal_terms_acceptance_on_signup',
      'require_marketing_acceptance_on_signup'
    )
  );

commit;

-- Ask PostgREST to reload schema cache (Supabase API)
select pg_notify('pgrst', 'reload schema');

