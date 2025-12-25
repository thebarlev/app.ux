-- =====================================================
-- 007 - RLS POLICIES FOR TENANT ISOLATION
-- =====================================================

-- -----------------------
-- company_members
-- -----------------------
alter table public.company_members enable row level security;

drop policy if exists company_members_select on public.company_members;
create policy company_members_select on public.company_members
  for select
  using (company_id in (select public.user_company_ids()));

drop policy if exists company_members_insert on public.company_members;
create policy company_members_insert on public.company_members
  for insert
  with check (
    company_id in (
      select cm.company_id
      from public.company_members cm
      where cm.user_id = auth.uid() and cm.role in ('owner','admin')
    )
    or
    company_id in (
      select c.id from public.companies c where c.auth_user_id = auth.uid()
    )
  );

drop policy if exists company_members_update on public.company_members;
create policy company_members_update on public.company_members
  for update
  using (
    company_id in (
      select cm.company_id
      from public.company_members cm
      where cm.user_id = auth.uid() and cm.role in ('owner','admin')
    )
  );

drop policy if exists company_members_delete on public.company_members;
create policy company_members_delete on public.company_members
  for delete
  using (
    company_id in (
      select cm.company_id
      from public.company_members cm
      where cm.user_id = auth.uid() and cm.role in ('owner','admin')
    )
  );

-- -----------------------
-- customers
-- -----------------------
alter table public.customers enable row level security;

drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select
  using (company_id in (select public.user_company_ids()));

drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers
  for insert
  with check (company_id in (select public.user_company_ids()));

drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update
  using (company_id in (select public.user_company_ids()));

drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers
  for delete
  using (
    company_id in (select public.user_company_ids())
    and status != 'active'
  );

-- -----------------------
-- document_sequences
-- -----------------------
alter table public.document_sequences enable row level security;

drop policy if exists document_sequences_select on public.document_sequences;
create policy document_sequences_select on public.document_sequences
  for select
  using (company_id in (select public.user_company_ids()));

drop policy if exists document_sequences_insert on public.document_sequences;
create policy document_sequences_insert on public.document_sequences
  for insert
  with check (company_id in (select public.user_company_ids()));

drop policy if exists document_sequences_update on public.document_sequences;
create policy document_sequences_update on public.document_sequences
  for update
  using (company_id in (select public.user_company_ids()) and is_locked = false)
  with check (company_id in (select public.user_company_ids()) and is_locked = false);

-- -----------------------
-- documents (FIXED: no NEW in USING)
-- -----------------------
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select
  using (company_id in (select public.user_company_ids()));

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents
  for insert
  with check (company_id in (select public.user_company_ids()));

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents
  for update
  using (
    company_id in (select public.user_company_ids())
    and document_status in ('draft','final')
  )
  with check (
    company_id in (select public.user_company_ids())
    and (
      document_status = 'draft'
      or document_status in ('cancelled','voided')
    )
  );

drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents
  for delete
  using (
    company_id in (select public.user_company_ids())
    and document_status = 'draft'
  );

-- -----------------------
-- document_line_items
-- -----------------------
alter table public.document_line_items enable row level security;

drop policy if exists line_items_select on public.document_line_items;
create policy line_items_select on public.document_line_items
  for select
  using (company_id in (select public.user_company_ids()));

drop policy if exists line_items_insert on public.document_line_items;
create policy line_items_insert on public.document_line_items
  for insert
  with check (company_id in (select public.user_company_ids()));

drop policy if exists line_items_update on public.document_line_items;
create policy line_items_update on public.document_line_items
  for update
  using (company_id in (select public.user_company_ids()))
  with check (company_id in (select public.user_company_ids()));

drop policy if exists line_items_delete on public.document_line_items;
create policy line_items_delete on public.document_line_items
  for delete
  using (company_id in (select public.user_company_ids()));

-- -----------------------
-- document_events (append-only)
-- -----------------------
alter table public.document_events enable row level security;

drop policy if exists document_events_select on public.document_events;
create policy document_events_select on public.document_events
  for select
  using (company_id in (select public.user_company_ids()));

drop policy if exists document_events_insert on public.document_events;
create policy document_events_insert on public.document_events
  for insert
  with check (company_id in (select public.user_company_ids()));

