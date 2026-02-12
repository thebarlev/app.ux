-- ====================================================
-- 072 - RLS: allow buyer company to read issued billing documents
-- ====================================================
-- Problem (runtime symptoms):
-- - Paying company can see "חשבונית מס / קבלה" exists (via app flow),
--   but cannot open summary / download PDF due to RLS (document belongs to issuer company).
--
-- Goal:
-- - Keep tenant isolation for writes.
-- - Allow SELECT on:
--   - public.documents
--   - public.document_line_items
-- ...when a document is linked in public.billing_documents to a buyer_company_id
-- that belongs to the current user (public.user_company_ids()).
--
-- Notes:
-- - This only changes SELECT policies (read access).
-- - Requires billing_documents table (script 052).
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
  if to_regclass('public.billing_documents') is null then
    raise notice 'skip: billing_documents table missing';
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
  );

commit;

select pg_notify('pgrst', 'reload schema');

