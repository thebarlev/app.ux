-- Create receipt_style_settings table for global receipt styling
-- Only one row should exist (system-wide configuration)

create table if not exists public.receipt_style_settings (
  id uuid primary key default gen_random_uuid(),
  settings jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.receipt_style_settings enable row level security;

-- Only system admins can read/write
drop policy if exists receipt_style_admin_select on public.receipt_style_settings;
create policy receipt_style_admin_select on public.receipt_style_settings
  for select
  using (
    exists (
      select 1 from public.system_admins
      where auth_user_id = auth.uid()
    )
  );

drop policy if exists receipt_style_admin_insert on public.receipt_style_settings;
create policy receipt_style_admin_insert on public.receipt_style_settings
  for insert
  with check (
    exists (
      select 1 from public.system_admins
      where auth_user_id = auth.uid()
    )
  );

drop policy if exists receipt_style_admin_update on public.receipt_style_settings;
create policy receipt_style_admin_update on public.receipt_style_settings
  for update
  using (
    exists (
      select 1 from public.system_admins
      where auth_user_id = auth.uid()
    )
  );

-- Insert default settings (will be replaced by admin)
-- This ensures there's always a row to query
insert into public.receipt_style_settings (settings)
values ('{
  "typography": {
    "fontFamily": "Arial, sans-serif",
    "baseFontSize": 14,
    "titleFontSize": 28,
    "subtitleFontSize": 12
  },
  "colors": {
    "background": "#ffffff",
    "text": "#111827",
    "accent": "#111827",
    "headerBackground": "#f3f4f6",
    "headerText": "#111827",
    "tableHeaderBackground": "#f9fafb",
    "tableHeaderText": "#111827",
    "tableRowBorder": "#f3f4f6",
    "totalBoxBackground": "#f9fafb",
    "totalBoxBorder": "#111827"
  },
  "layout": {
    "pagePaddingTop": 20,
    "pagePaddingSide": 20
  },
  "sections": {
    "header": {
      "paddingTop": 24,
      "paddingBottom": 24,
      "alignment": "top"
    },
    "businessColumn": {
      "paddingRight": 0,
      "paddingLeft": 24,
      "textAlign": "right"
    },
    "clientColumn": {
      "paddingRight": 0,
      "textAlign": "right"
    },
    "paymentsTable": {
      "rowPaddingY": 12,
      "rowPaddingX": 12
    },
    "totalBox": {
      "padding": 16,
      "alignAmount": "left"
    }
  },
  "customCss": ""
}'::jsonb)
on conflict do nothing;

-- Create update trigger
create or replace function update_receipt_style_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists receipt_style_settings_updated_at on public.receipt_style_settings;
create trigger receipt_style_settings_updated_at
  before update on public.receipt_style_settings
  for each row
  execute function update_receipt_style_settings_updated_at();
