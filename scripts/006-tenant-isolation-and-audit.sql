-- =====================================================
-- 006 - TENANT ISOLATION, IMMUTABILITY & AUDIT
-- =====================================================

-- Needed for gen_random_uuid() on some setups
create extension if not exists pgcrypto;

-- =====================================================
-- 1. COMPANY MEMBERS
-- =====================================================
create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'accountant', 'member', 'viewer')),
  invited_by uuid references auth.users(id),
  invited_at timestamptz default now(),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, user_id)
);

create index if not exists idx_company_members_user_id on public.company_members(user_id);
create index if not exists idx_company_members_company_id on public.company_members(company_id);

-- =====================================================
-- 2. CUSTOMERS
-- =====================================================
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  customer_number text,
  external_id text,

  name text not null,
  email text,
  phone text,
  mobile text,

  address_street text,
  address_city text,
  address_zip text,
  address_country text default 'IL',

  customer_type text default 'business'
    check (customer_type in ('individual', 'business', 'government', 'nonprofit')),
  tax_exempt boolean default false,
  payment_terms_days integer default 30,
  credit_limit decimal(12,2),
  currency text default 'ILS',

  status text not null default 'active'
    check (status in ('active', 'inactive', 'blocked')),
  notes text,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),

  unique(company_id, customer_number),
  unique(company_id, external_id)
);

create index if not exists idx_customers_company_id on public.customers(company_id);
create index if not exists idx_customers_external_id on public.customers(company_id, external_id);
create index if not exists idx_customers_name on public.customers(company_id, name);

-- =====================================================
-- 3. DOCUMENT SEQUENCES
-- =====================================================
create table if not exists public.document_sequences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_type text not null
    check (document_type in ('tax_invoice', 'invoice_receipt', 'receipt', 'quote', 'delivery_note', 'credit_invoice')),

  prefix text default '',
  starting_number integer not null default 1,
  current_number integer not null default 0,

  is_locked boolean not null default false,
  locked_at timestamptz,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(company_id, document_type)
);

create index if not exists idx_document_sequences_company on public.document_sequences(company_id);

-- =====================================================
-- 4. ENHANCE DOCUMENTS TABLE (must already exist from 001)
-- =====================================================
alter table public.documents
  add column if not exists customer_id uuid references public.customers(id),
  add column if not exists customer_name text,
  add column if not exists customer_tax_id text,

  add column if not exists subtotal decimal(12,2) default 0,
  add column if not exists vat_rate decimal(5,2) default 18,
  add column if not exists vat_amount decimal(12,2) default 0,
  add column if not exists total_amount decimal(12,2) default 0,
  add column if not exists currency text default 'ILS',
  add column if not exists exchange_rate decimal(10,4) default 1,

  add column if not exists document_status text default 'draft'
    check (document_status in ('draft', 'final', 'cancelled', 'voided')),
  add column if not exists finalized_at timestamptz,
  add column if not exists finalized_by uuid references auth.users(id),

  add column if not exists cancellation_reason text,
  add column if not exists cancelled_by uuid references auth.users(id),
  add column if not exists cancelled_at timestamptz,
  add column if not exists voiding_document_id uuid references public.documents(id),

  add column if not exists content_hash text,
  add column if not exists signed_hash text,
  add column if not exists signature_provider text,
  add column if not exists signature_certificate_id text,
  add column if not exists signed_at timestamptz,
  add column if not exists signed_by uuid references auth.users(id),

  add column if not exists pdf_storage_path text,
  add column if not exists pdf_checksum text,
  add column if not exists pdf_generated_at timestamptz,

  add column if not exists created_by uuid references auth.users(id),
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz default now(),

  add column if not exists internal_notes text,
  add column if not exists customer_notes text;

-- Document number uniqueness scoped to company + type
alter table public.documents drop constraint if exists documents_company_document_number_unique;
alter table public.documents
  add constraint documents_company_document_number_unique
  unique(company_id, document_type, document_number);

create index if not exists idx_documents_customer_id on public.documents(customer_id);
create index if not exists idx_documents_document_status on public.documents(document_status);
create index if not exists idx_documents_finalized_at on public.documents(finalized_at);

-- =====================================================
-- 5. DOCUMENT LINE ITEMS
-- =====================================================
create table if not exists public.document_line_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,

  line_number integer not null,
  description text not null,
  quantity decimal(10,3) not null default 1,
  unit_price decimal(12,2) not null,
  discount_percent decimal(5,2) default 0,
  discount_amount decimal(12,2) default 0,
  line_total decimal(12,2) not null,

  item_code text,
  item_sku text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_line_items_document on public.document_line_items(document_id);
create index if not exists idx_line_items_company on public.document_line_items(company_id);

-- =====================================================
-- 6. DOCUMENT EVENTS
-- =====================================================
create table if not exists public.document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,

  event_type text not null check (event_type in (
    'created', 'updated', 'finalized', 'cancelled', 'voided',
    'signed', 'pdf_generated', 'emailed', 'printed', 'viewed'
  )),
  event_data jsonb default '{}'::jsonb,

  performed_by uuid references auth.users(id),
  performed_at timestamptz not null default now(),

  ip_address inet,
  user_agent text
);

create index if not exists idx_document_events_document on public.document_events(document_id);
create index if not exists idx_document_events_company on public.document_events(company_id);
create index if not exists idx_document_events_performed_at on public.document_events(performed_at);

-- =====================================================
-- 7. HELPER FUNCTION (PUBLIC, not AUTH schema)
-- =====================================================
create or replace function public.user_company_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select cm.company_id
  from public.company_members cm
  where cm.user_id = auth.uid()
  union
  select c.id
  from public.companies c
  where c.auth_user_id = auth.uid()
$$;

-- =====================================================
-- 8. ATOMIC DOCUMENT NUMBER GENERATOR
-- =====================================================
create or replace function public.generate_document_number(
  p_company_id uuid,
  p_document_type text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sequence record;
  v_next_number integer;
  v_document_number text;
begin
  select * into v_sequence
  from public.document_sequences
  where company_id = p_company_id and document_type = p_document_type
  for update;

  if not found then
    insert into public.document_sequences (company_id, document_type, starting_number, current_number, is_locked)
    values (p_company_id, p_document_type, 1, 1, true)
    returning * into v_sequence;

    v_next_number := 1;
  else
    if not v_sequence.is_locked then
      update public.document_sequences
      set is_locked = true, locked_at = now()
      where id = v_sequence.id;
    end if;

    v_next_number := greatest(v_sequence.current_number + 1, v_sequence.starting_number);

    update public.document_sequences
    set current_number = v_next_number, updated_at = now()
    where id = v_sequence.id;
  end if;

  v_document_number := coalesce(v_sequence.prefix, '') || lpad(v_next_number::text, 6, '0');
  return v_document_number;
end;
$$;

-- =====================================================
-- 9. IMMUTABILITY TRIGGER (documents)
-- =====================================================
create or replace function public.enforce_document_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.document_status = 'final' then
    if new.document_status in ('cancelled', 'voided') then
      if new.document_number != old.document_number
         or new.document_type != old.document_type
         or new.issue_date != old.issue_date
         or new.customer_id is distinct from old.customer_id
         or new.customer_name is distinct from old.customer_name
         or new.customer_tax_id is distinct from old.customer_tax_id
         or new.subtotal != old.subtotal
         or new.vat_rate != old.vat_rate
         or new.vat_amount != old.vat_amount
         or new.total_amount != old.total_amount
         or new.amount != old.amount
         or new.currency != old.currency
         or new.content_hash is distinct from old.content_hash
      then
        raise exception 'Cannot modify immutable fields on finalized document';
      end if;

      if new.cancellation_reason is null or new.cancellation_reason = '' then
        raise exception 'Cancellation reason is required';
      end if;

      return new;
    else
      raise exception 'Cannot modify finalized document. Use cancellation or void.';
    end if;
  end if;

  if old.signed_hash is not null then
    raise exception 'Cannot modify signed document';
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_document_immutability on public.documents;
create trigger trigger_document_immutability
  before update on public.documents
  for each row
  execute function public.enforce_document_immutability();

-- =====================================================
-- 10. PREVENT DELETE OF FINAL DOCUMENTS
-- =====================================================
create or replace function public.prevent_final_document_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.document_status = 'final' then
    raise exception 'Cannot delete finalized document. Use cancellation or void.';
  end if;
  return old;
end;
$$;

drop trigger if exists trigger_prevent_final_delete on public.documents;
create trigger trigger_prevent_final_delete
  before delete on public.documents
  for each row
  execute function public.prevent_final_document_delete();

-- =====================================================
-- 11. LINE ITEM IMMUTABILITY
-- =====================================================
create or replace function public.enforce_line_item_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_doc_status text;
begin
  select d.document_status into v_doc_status
  from public.documents d
  where d.id = coalesce(new.document_id, old.document_id);

  if v_doc_status = 'final' then
    raise exception 'Cannot modify line items of finalized document';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trigger_line_item_immutability on public.document_line_items;
create trigger trigger_line_item_immutability
  before insert or update or delete on public.document_line_items
  for each row
  execute function public.enforce_line_item_immutability();

-- =====================================================
-- 12. AUTO-LOG DOCUMENT EVENTS
-- =====================================================
create or replace function public.log_document_event()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.document_events (document_id, company_id, event_type, performed_by, event_data)
    values (new.id, new.company_id, 'created', auth.uid(), jsonb_build_object('status', new.document_status));
  elsif tg_op = 'UPDATE' then
    if old.document_status is distinct from new.document_status then
      insert into public.document_events (document_id, company_id, event_type, performed_by, event_data)
      values (
        new.id,
        new.company_id,
        case new.document_status
          when 'final' then 'finalized'
          when 'cancelled' then 'cancelled'
          when 'voided' then 'voided'
          else 'updated'
        end,
        auth.uid(),
        jsonb_build_object(
          'old_status', old.document_status,
          'new_status', new.document_status,
          'reason', new.cancellation_reason
        )
      );
    end if;

    if old.signed_hash is null and new.signed_hash is not null then
      insert into public.document_events (document_id, company_id, event_type, performed_by, event_data)
      values (new.id, new.company_id, 'signed', auth.uid(), jsonb_build_object('provider', new.signature_provider));
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_log_document_event on public.documents;
create trigger trigger_log_document_event
  after insert or update on public.documents
  for each row
  execute function public.log_document_event();

