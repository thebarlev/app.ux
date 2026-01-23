-- ====================================================
-- 035 - Seed mandatory “computerized document” mark (HE/EN)
-- ====================================================
-- Requirement: The PDF must include the words "מסמך ממוחשב" / "Computerized document".
-- This seeds a system_texts key for receipt/page templates.

insert into public.system_texts (key, page, lang, default_value, description)
values
  ('document_computerized_mark', 'receipt', 'he', 'מסמך ממוחשב', 'Mandatory mark for computerized document (HE)'),
  ('document_computerized_mark', 'receipt', 'en', 'Computerized document', 'Mandatory mark for computerized document (EN)')
on conflict (key, page, lang) do nothing;

