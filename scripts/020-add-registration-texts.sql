-- Migration: Add Registration Checkbox Texts
-- Date: 2025-01-14
-- Description: Adds system texts for registration checkbox labels with HTML support for links

-- Seed registration checkbox texts
-- Note: Uses (key, page, lang) as unique constraint based on bilingual migration
INSERT INTO public.system_texts (key, page, lang, default_value, description) VALUES
  ('registration_legal_terms_text', 'registration', 'he', 'אני מסכים/ה ל<a href="/terms" target="_blank">תנאי השימוש</a>, ל<a href="/privacy" target="_blank">מדיניות הפרטיות</a>, ול<a href="/documents-service" target="_blank">נספח שימוש בשירות הפקת מסמכים דיגיטליים</a>', 'טקסט צ׳קבוקס תנאים משפטיים בהרשמה (תומך HTML)'),
  ('registration_marketing_text', 'registration', 'he', 'אני רוצה לקבל מכם למייל הטבות ומידע שיווקי', 'טקסט צ׳קבוקס שיווק בהרשמה')
ON CONFLICT (key, page, lang) DO NOTHING;
