-- Seed English defaults for receipt document texts (lang='en')
-- Requires scripts/019-system-texts-bilingual.sql to be applied first.
-- This seeds only the "document/PDF" keys (not the receipt form UI keys).

insert into public.system_texts (key, page, lang, default_value, description)
values
  ('receipt_title', 'receipt', 'en', 'Receipt', 'Receipt document title (EN)'),
  ('receipt_copy_text', 'receipt', 'en', 'True copy of original', 'True copy of original text (EN)'),
  ('receipt_to_label', 'receipt', 'en', 'To:', 'To: label for customer section (EN)'),
  ('receipt_phone_label', 'receipt', 'en', 'Phone:', 'Phone label (EN)'),
  ('receipt_mobile_label', 'receipt', 'en', 'Mobile:', 'Mobile label (EN)'),
  ('receipt_issue_date_label', 'receipt', 'en', 'Issue date:', 'Issue date label (EN)'),
  ('receipt_customer_label', 'receipt', 'en', 'Customer:', 'Customer label (EN)'),
  ('receipt_description_label', 'receipt', 'en', 'Description:', 'Description label (EN)'),
  ('receipt_payment_details_title', 'receipt', 'en', 'Payment details', 'Payment details section title (EN)'),
  ('receipt_payment_method_label', 'receipt', 'en', 'Payment method', 'Payment method column header (EN)'),
  ('receipt_date_label', 'receipt', 'en', 'Date', 'Date column header (EN)'),
  ('receipt_amount_label', 'receipt', 'en', 'Amount', 'Amount column header (EN)'),
  ('receipt_total_label', 'receipt', 'en', 'Total:', 'Total amount label (EN)'),
  ('receipt_internal_notes_label', 'receipt', 'en', 'Internal notes:', 'Internal notes label (EN)'),
  ('receipt_customer_notes_label', 'receipt', 'en', 'Customer notes:', 'Customer notes label (EN)'),
  ('receipt_footer_generated_text', 'receipt', 'en', 'This document was generated digitally', 'Document generated digitally text (EN)'),
  ('receipt_footer_print_date_label', 'receipt', 'en', 'Print date:', 'Print date label (EN)')
on conflict (key, page, lang) do nothing;

