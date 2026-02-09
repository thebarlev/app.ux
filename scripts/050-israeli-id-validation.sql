-- =====================================================
-- 050 - FORMAL VALIDATION: Israeli ID / Company Number
-- =====================================================
-- Canonical field in this scope: public.companies.registration_number
--
-- Enforcement:
-- - BEFORE INSERT/UPDATE trigger on public.companies
-- - If NEW.registration_number is present (non-empty) and fails checksum -> raise:
--     ERRCODE = 'P0001', MESSAGE = 'INVALID_TAX_ID'
--
-- Notes:
-- - This validates formal checksum only (no registry lookup).
-- - Normalization: trims and removes spaces/hyphens prior to validation.

create or replace function public.is_valid_israeli_id(p_value text)
returns boolean
language plpgsql
immutable
as $$
declare
  v text;
  padded text;
  i int;
  digit int;
  weight int;
  product int;
  s int := 0;
begin
  if p_value is null then
    return false;
  end if;

  -- Remove spaces/hyphens only (UI may format input); reject any other non-digits.
  v := regexp_replace(trim(p_value), '[\\s-]+', '', 'g');
  if v = '' then
    return false;
  end if;
  if v !~ '^[0-9]+$' then
    return false;
  end if;
  if length(v) > 9 then
    return false;
  end if;

  padded := lpad(v, 9, '0');

  for i in 1..9 loop
    digit := substr(padded, i, 1)::int;
    weight := case when (i % 2) = 0 then 2 else 1 end;
    product := digit * weight;
    if product >= 10 then
      product := product - 9;
    end if;
    s := s + product;
  end loop;

  return (s % 10) = 0;
end;
$$;

create or replace function public.enforce_company_registration_number_checksum()
returns trigger
language plpgsql
as $$
declare
  v text;
begin
  v := coalesce(new.registration_number, '');
  v := regexp_replace(trim(v), '[\\s-]+', '', 'g');

  -- Only validate when present (non-empty). Requiredness is enforced by app/UI and/or schema constraints.
  if v <> '' then
    if not public.is_valid_israeli_id(v) then
      raise exception using errcode = 'P0001', message = 'INVALID_TAX_ID';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_enforce_company_registration_number_checksum on public.companies;
create trigger trigger_enforce_company_registration_number_checksum
before insert or update on public.companies
for each row
execute function public.enforce_company_registration_number_checksum();

