-- ====================================================
-- 086 - Get user ID by email (for post-payment user linking)
-- ====================================================
-- Purpose:
-- - When inviteUserByEmail fails (user already exists), we need to link
--   the existing user to the company created during payment processing.
-- - This function allows service_role to resolve user id from email.
-- - Used only in process-indicator-event.ts for lead-flow fallback.
-- ====================================================

begin;

create or replace function public.get_user_id_by_email(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if p_email is null or trim(p_email) = '' then
    return null;
  end if;

  select id into v_user_id
  from auth.users
  where email = lower(trim(p_email))
  limit 1;

  return v_user_id;
end;
$$;

revoke all on function public.get_user_id_by_email(text) from public;
revoke all on function public.get_user_id_by_email(text) from anon;
revoke all on function public.get_user_id_by_email(text) from authenticated;
grant execute on function public.get_user_id_by_email(text) to service_role;

comment on function public.get_user_id_by_email(text) is 'Resolve auth user id by email. Service-role only. Used for auditor post-payment user-company linking when invite fails.';

commit;
