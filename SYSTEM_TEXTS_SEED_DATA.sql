-- Additional System Texts for Receipt Form UI
-- Run this after 010-system-texts-table.sql

INSERT INTO public.system_texts (key, page, default_value, description) VALUES
  -- Payment Methods
  ('payment_method_bank_transfer', 'receipt', 'העברה בנקאית', 'Bank transfer payment method'),
  ('payment_method_bit', 'receipt', 'Bit', 'Bit payment method'),
  ('payment_method_paybox', 'receipt', 'PayBox', 'PayBox payment method'),
  ('payment_method_credit_card', 'receipt', 'כרטיס אשראי', 'Credit card payment method'),
  ('payment_method_cash', 'receipt', 'מזומן', 'Cash payment method'),
  ('payment_method_check', 'receipt', 'צ׳ק', 'Check payment method'),
  ('payment_method_paypal', 'receipt', 'PayPal', 'PayPal payment method'),
  ('payment_method_payoneer', 'receipt', 'Payoneer', 'Payoneer payment method'),
  ('payment_method_google_pay', 'receipt', 'Google Pay', 'Google Pay payment method'),
  ('payment_method_apple_pay', 'receipt', 'Apple Pay', 'Apple Pay payment method'),
  ('payment_method_bitcoin', 'receipt', 'ביטקוין', 'Bitcoin payment method'),
  ('payment_method_ethereum', 'receipt', 'אתריום', 'Ethereum payment method'),
  ('payment_method_buyme_voucher', 'receipt', 'שובר BuyME', 'BuyME voucher payment method'),
  ('payment_method_gift_voucher', 'receipt', 'שובר מתנה', 'Gift voucher payment method'),
  ('payment_method_cash_equivalent', 'receipt', 'שווה כסף', 'Cash equivalent payment method'),
  ('payment_method_vcheck', 'receipt', 'V-CHECK', 'V-CHECK payment method'),
  ('payment_method_colu', 'receipt', 'Colu', 'Colu payment method'),
  ('payment_method_tax_deduction', 'receipt', 'ניכוי במקור', 'Tax deduction at source'),
  ('payment_method_employee_deduction', 'receipt', 'ניכוי חלק עובד טל״א', 'Employee deduction (social security)'),
  ('payment_method_other_deduction', 'receipt', 'ניכוי אחר', 'Other deduction'),

  -- Form Labels & Headings
  ('receipt_form_title', 'receipt', 'קבלה', 'Receipt form title'),
  ('receipt_form_company_default', 'receipt', 'העסק שלי', 'Default company name placeholder'),
  ('receipt_form_settings_button', 'receipt', 'הגדרות', 'Settings button'),
  ('receipt_form_settings_title', 'receipt', 'הגדרות', 'Settings panel title'),
  ('receipt_form_language_label', 'receipt', 'שפה', 'Language setting label'),
  ('receipt_form_language_hebrew', 'receipt', 'עברית', 'Hebrew language option'),
  ('receipt_form_language_english', 'receipt', 'אנגלית', 'English language option'),
  ('receipt_form_default_currency_label', 'receipt', 'מטבע ברירת מחדל', 'Default currency label'),
  ('receipt_form_allowed_currencies_label', 'receipt', 'מותרים:', 'Allowed currencies prefix'),
  ('receipt_form_round_totals_label', 'receipt', 'עיגול סכומים', 'Round totals label'),
  ('receipt_form_round_totals_description', 'receipt', 'לעגל את הסכום הסופי למטבע שלם (ללא אגורות)', 'Round totals checkbox description'),
  ('receipt_form_settings_note', 'receipt', 'הערה: כרגע אלו ברירות מחדל מקומיות למסך (כמו שביקשת). בהמשך נחבר להגדרות חברה ב־DB.', 'Settings panel note about local defaults'),
  
  -- Document Details Section
  ('receipt_form_document_details_title', 'receipt', 'פרטי המסמך', 'Document details section title'),
  ('receipt_form_customer_name_label', 'receipt', 'שם לקוח', 'Customer name field label'),
  ('receipt_form_customer_name_placeholder', 'receipt', 'התחל להקליד שם לקוח...', 'Customer name input placeholder'),
  ('receipt_form_document_date_label', 'receipt', 'תאריך מסמך', 'Document date field label'),
  ('receipt_form_description_label', 'receipt', 'תיאור', 'Description field label'),
  ('receipt_form_description_placeholder', 'receipt', 'לדוגמה: שירותי עיצוב', 'Description placeholder example'),

  -- Payments Section
  ('receipt_form_payments_title', 'receipt', 'פירוט תקבולים', 'Payments breakdown section title'),
  ('receipt_form_payments_subtitle', 'receipt', 'איך שילמו לך? אם שילמו לך בכמה צורות תשלום, אפשר לבחור כמה סוגי תקבולים.', 'Payments section subtitle/help text'),
  ('receipt_form_payment_method_column', 'receipt', 'אמצעי', 'Payment method column header'),
  ('receipt_form_payment_date_column', 'receipt', 'תאריך', 'Payment date column header'),
  ('receipt_form_payment_amount_column', 'receipt', 'סכום', 'Payment amount column header'),
  ('receipt_form_payment_currency_column', 'receipt', 'מטבע', 'Payment currency column header'),
  ('receipt_form_payment_details_column', 'receipt', 'פרטים (אופציונלי)', 'Payment details column header (optional)'),
  ('receipt_form_payment_method_select_default', 'receipt', 'בחר…', 'Payment method select default option'),
  ('receipt_form_payment_bank_placeholder', 'receipt', 'בנק', 'Bank name field placeholder'),
  ('receipt_form_payment_branch_placeholder', 'receipt', 'סניף', 'Branch number field placeholder'),
  ('receipt_form_payment_account_placeholder', 'receipt', 'חשבון', 'Account number field placeholder'),
  ('receipt_form_payment_delete_button', 'receipt', 'מחק', 'Delete payment row button'),
  ('receipt_form_add_payment_button', 'receipt', 'הוספת תקבול +', 'Add payment row button'),
  ('receipt_form_total_paid_label', 'receipt', 'סה״כ שולם', 'Total paid label'),
  ('receipt_form_round_totals_note', 'receipt', 'כולל עיגול לסכום סופי (ללא אגורות).', 'Note about rounding when enabled'),

  -- Notes Section
  ('receipt_form_notes_title', 'receipt', 'הערות', 'Notes section title'),
  ('receipt_form_notes_on_document_label', 'receipt', 'הערות שיופיעו במסמך', 'Notes that appear on document label'),
  ('receipt_form_notes_footer_label', 'receipt', 'הערות בתחתית המסמך', 'Footer notes label'),

  -- Action Buttons
  ('receipt_form_preview_button', 'receipt', '📄 תצוגה מקדימה (טאב חדש)', 'Preview button text (new tab)'),
  ('receipt_form_save_draft_button', 'receipt', 'שמירת טיוטה', 'Save draft button'),
  ('receipt_form_save_draft_button_saving', 'receipt', 'שומר...', 'Save draft button (saving state)'),
  ('receipt_form_issue_button', 'receipt', 'הפקה + הקצאת מספר', 'Issue and assign number button'),
  ('receipt_form_issue_button_processing', 'receipt', 'מפיק...', 'Issue button (processing state)'),
  ('receipt_form_sequence_not_locked_tooltip', 'receipt', 'נדרש לבחור מספר התחלתי', 'Tooltip when sequence not locked'),

  -- Error & Success Messages
  ('receipt_form_error_save_draft', 'receipt', 'שגיאה בשמירת הטיוטה', 'Error saving draft'),
  ('receipt_form_error_sequence_required', 'receipt', 'נדרש לבחור מספר התחלתי לפני הפקת מסמכים', 'Error: starting number required'),
  ('receipt_form_error_save_before_issue', 'receipt', 'יש לשמור את הטיוטה ולהפיק מהרשימה', 'Error: save draft before issuing'),
  ('receipt_form_error_issue_document', 'receipt', 'שגיאה בהפקת המסמך', 'Error issuing document'),
  ('receipt_form_error_pdf_download', 'receipt', 'שגיאה בהורדת PDF:', 'Error downloading PDF prefix'),
  ('receipt_form_customer_added_success', 'receipt', 'הלקוח "{name}" נוסף בהצלחה ללקוחות שמורים', 'Customer added successfully message'),
  ('receipt_form_customer_name_saved', 'receipt', 'שם הלקוח נשמר למסמך זה בלבד (לא נוסף ללקוחות)', 'Customer name saved for this document only'),
  
  -- System Notes Footer
  ('receipt_form_system_notes_title', 'receipt', '📌 הערות מערכת', 'System notes section title')

ON CONFLICT (key) DO NOTHING;

-- Create indexes if not already exist
CREATE INDEX IF NOT EXISTS idx_system_texts_page_receipt ON public.system_texts(page) WHERE page = 'receipt';
