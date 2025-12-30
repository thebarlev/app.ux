-- System Texts Management Table
-- Allows admins to customize all user-facing text strings

-- Create system_texts table
create table if not exists public.system_texts (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  page text not null,
  default_value text not null,
  value text,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.system_texts enable row level security;

-- Admin-only policies
drop policy if exists system_texts_admin_select on public.system_texts;
create policy system_texts_admin_select on public.system_texts
  for select
  using (
    exists (
      select 1 from public.system_admins
      where auth_user_id = auth.uid()
    )
  );

drop policy if exists system_texts_admin_insert on public.system_texts;
create policy system_texts_admin_insert on public.system_texts
  for insert
  with check (
    exists (
      select 1 from public.system_admins
      where auth_user_id = auth.uid()
    )
  );

drop policy if exists system_texts_admin_update on public.system_texts;
create policy system_texts_admin_update on public.system_texts
  for update
  using (
    exists (
      select 1 from public.system_admins
      where auth_user_id = auth.uid()
    )
  );

drop policy if exists system_texts_admin_delete on public.system_texts;
create policy system_texts_admin_delete on public.system_texts
  for delete
  using (
    exists (
      select 1 from public.system_admins
      where auth_user_id = auth.uid()
    )
  );

-- Public read-only policy for all users (to display texts in UI)
drop policy if exists system_texts_public_select on public.system_texts;
create policy system_texts_public_select on public.system_texts
  for select
  using (true);

-- Create function to update timestamp
create or replace function public.update_system_text_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create trigger
drop trigger if exists update_system_text_timestamp on public.system_texts;
create trigger update_system_text_timestamp
  before update on public.system_texts
  for each row
  execute function public.update_system_text_timestamp();

-- Seed initial Hebrew text entries for receipts
insert into public.system_texts (key, page, default_value, description) values
  ('receipt_title', 'receipt', 'קבלה', 'Receipt document title'),
  ('receipt_copy_text', 'receipt', 'העתק נאמן למקור', 'True copy of original text'),
  ('receipt_to_label', 'receipt', 'לכבוד:', 'To: label for customer section'),
  ('receipt_phone_label', 'receipt', 'טלפון:', 'Phone label'),
  ('receipt_mobile_label', 'receipt', 'נייד:', 'Mobile label'),
  ('receipt_issue_date_label', 'receipt', 'תאריך הפקה:', 'Issue date label'),
  ('receipt_customer_label', 'receipt', 'לקוח:', 'Customer label'),
  ('receipt_description_label', 'receipt', 'תיאור:', 'Description label'),
  ('receipt_payment_details_title', 'receipt', 'פרטי תשלום', 'Payment details section title'),
  ('receipt_payment_method_label', 'receipt', 'אמצעי תשלום', 'Payment method column header'),
  ('receipt_date_label', 'receipt', 'תאריך', 'Date column header'),
  ('receipt_amount_label', 'receipt', 'סכום', 'Amount column header'),
  ('receipt_total_label', 'receipt', 'סכום כולל:', 'Total amount label'),
  ('receipt_internal_notes_label', 'receipt', 'הערות פנימיות:', 'Internal notes label'),
  ('receipt_customer_notes_label', 'receipt', 'הערות ללקוח:', 'Customer notes label'),
  ('receipt_footer_generated_text', 'receipt', 'מסמך זה הופק באופן דיגיטלי', 'Document generated digitally text'),
  ('receipt_footer_print_date_label', 'receipt', 'תאריך הדפסה:', 'Print date label'),
  
  -- Business type labels
  ('business_type_osek_patur', 'common', 'עוסק פטור', 'Exempt business type'),
  ('business_type_osek_murshe', 'common', 'עוסק מורשה', 'Licensed business type'),
  ('business_type_ltd', 'common', 'בע״מ', 'Limited company type'),
  ('business_type_partnership', 'common', 'שותפות', 'Partnership type'),
  ('business_type_other', 'common', 'אחר', 'Other business type')
on conflict (key) do nothing;

-- Create index for faster lookups
create index if not exists idx_system_texts_key on public.system_texts(key);
create index if not exists idx_system_texts_page on public.system_texts(page);
