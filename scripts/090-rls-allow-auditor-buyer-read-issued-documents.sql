-- ====================================================
-- 090 - RLS: allow Auditor buyer to read issued documents
-- ====================================================
-- Problem:
-- - Auditor invoices: documents.company_id = issuer (VOW), buyer is different company.
-- - documents_select (072) allows access only via company_id or billing_documents.
-- - Auditor documents are NOT in billing_documents → RLS blocks PDF download.
--
-- Goal:
-- - Extend documents_select and line_items_select to allow access when
--   document is linked in auditor_subscription_charges.issued_invoice_id
--   and the charge's company_id belongs to the user.
--
-- Minimal change: add OR condition only. No refactor.
-- ====================================================

begin;

-- -----------------------
-- documents: SELECT
-- -----------------------
do $$
begin
  if to_regclass('public.documents') is null then
    raise notice 'skip: documents table missing';
    return;
  end if;
  if to_regclass('public.auditor_subscription_charges') is null then
    raise notice 'skip: auditor_subscription_charges table missing';
    return;
  end if;
end $$;

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select
  using (
    company_id in (select public.user_company_ids())
    or exists (
      select 1
      from public.billing_documents bd
      where bd.document_id = public.documents.id
        and bd.buyer_company_id in (select public.user_company_ids())
    )
    or exists (
      select 1
      from public.auditor_subscription_charges auditor_charges
      where auditor_charges.issued_invoice_id = public.documents.id
        and auditor_charges.company_id in (select public.user_company_ids())
    )
  );

-- -----------------------
-- document_line_items: SELECT
-- -----------------------
do $$
begin
  if to_regclass('public.document_line_items') is null then
    raise notice 'skip: document_line_items table missing';
    return;
  end if;
end $$;

drop policy if exists line_items_select on public.document_line_items;
create policy line_items_select on public.document_line_items
  for select
  using (
    company_id in (select public.user_company_ids())
    or exists (
      select 1
      from public.billing_documents bd
      where bd.document_id = public.document_line_items.document_id
        and bd.buyer_company_id in (select public.user_company_ids())
    )
    or exists (
      select 1
      from public.auditor_subscription_charges auditor_charges
      where auditor_charges.issued_invoice_id = public.document_line_items.document_id
        and auditor_charges.company_id in (select public.user_company_ids())
    )
  );

commit;

select pg_notify('pgrst', 'reload schema');
