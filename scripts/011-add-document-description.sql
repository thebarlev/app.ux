-- Add document_description column to documents table
-- This column stores the receipt/invoice description (e.g., "ספטמבר", "עבודה חודש ינואר")

alter table public.documents
  add column if not exists document_description text;

-- Add comment for documentation
comment on column public.documents.document_description is 'Description or title of the document (e.g., month name, service description)';

-- Create index for faster searches by description
create index if not exists idx_documents_description on public.documents(document_description);

-- Verify the column was added
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'documents'
  and column_name = 'document_description';
