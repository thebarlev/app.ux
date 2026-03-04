-- ====================================================
-- 096 - Auditor: auditor_invoice_documents + RLS for issuer visibility
-- ====================================================
-- Problem:
-- - documents.company_id = customer (for payer RLS)
-- - Issuer company (4ae68334...) cannot see auditor invoices
--
-- Solution:
-- 1. Create auditor_invoice_documents (document_id, issuer_company_id, buyer_company_id, charge_id)
-- 2. RPC inserts into it when issuing
-- 3. RLS allows documents/document_line_items when issuer or buyer in user_company_ids()
-- ====================================================

begin;

-- -----------------------
-- 1. auditor_invoice_documents table
-- -----------------------
create table if not exists public.auditor_invoice_documents (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete restrict,
  issuer_company_id uuid not null references public.companies(id) on delete restrict,
  buyer_company_id uuid not null references public.companies(id) on delete restrict,
  charge_id uuid not null references public.auditor_subscription_charges(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (document_id)
);

create index if not exists idx_auditor_invoice_documents_issuer on public.auditor_invoice_documents(issuer_company_id);
create index if not exists idx_auditor_invoice_documents_buyer on public.auditor_invoice_documents(buyer_company_id);
create index if not exists idx_auditor_invoice_documents_charge on public.auditor_invoice_documents(charge_id);

alter table public.auditor_invoice_documents enable row level security;

-- Service role only for writes; SELECT via RLS
create policy auditor_invoice_documents_select on public.auditor_invoice_documents
  for select
  using (
    issuer_company_id in (select public.user_company_ids())
    or buyer_company_id in (select public.user_company_ids())
  );

-- -----------------------
-- 2. Backfill existing auditor invoices (issuer = 4ae68334...)
-- -----------------------
insert into public.auditor_invoice_documents (document_id, issuer_company_id, buyer_company_id, charge_id)
select
  c.issued_invoice_id,
  '4ae68334-15a0-4fa3-a9ba-fd77deccc95d'::uuid,
  c.company_id,
  c.id
from public.auditor_subscription_charges c
where c.issued_invoice_id is not null
  and not exists (select 1 from public.auditor_invoice_documents aid where aid.document_id = c.issued_invoice_id);

-- -----------------------
-- 3. Update documents RLS
-- -----------------------
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select
  using (
    company_id in (select public.user_company_ids())
    or exists (
      select 1 from public.billing_documents bd
      where bd.document_id = public.documents.id
        and bd.buyer_company_id in (select public.user_company_ids())
    )
    or exists (
      select 1 from public.auditor_invoice_documents aid
      where aid.document_id = public.documents.id
        and (aid.issuer_company_id in (select public.user_company_ids())
             or aid.buyer_company_id in (select public.user_company_ids()))
    )
  );

-- -----------------------
-- 4. Update document_line_items RLS
-- -----------------------
drop policy if exists line_items_select on public.document_line_items;
create policy line_items_select on public.document_line_items
  for select
  using (
    company_id in (select public.user_company_ids())
    or exists (
      select 1 from public.billing_documents bd
      where bd.document_id = public.document_line_items.document_id
        and bd.buyer_company_id in (select public.user_company_ids())
    )
    or exists (
      select 1 from public.auditor_invoice_documents aid
      where aid.document_id = public.document_line_items.document_id
        and (aid.issuer_company_id in (select public.user_company_ids())
             or aid.buyer_company_id in (select public.user_company_ids()))
    )
  );

commit;

select pg_notify('pgrst', 'reload schema');
