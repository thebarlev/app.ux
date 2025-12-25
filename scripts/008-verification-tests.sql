-- =====================================================
-- 008 - VERIFICATION TESTS
-- =====================================================

-- RLS enabled?
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('companies','company_members','customers','documents','document_line_items','document_events','document_sequences')
order by tablename;

-- Company_id columns exist?
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and column_name = 'company_id'
  and table_name in ('customers','documents','document_line_items','document_events','document_sequences','company_members');

-- Function exists?
select routine_schema, routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('user_company_ids','generate_document_number');

