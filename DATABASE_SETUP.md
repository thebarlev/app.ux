# Database Setup Instructions

## Issue: PDF Generation Error (500)

The error occurs because the `system_texts` table doesn't exist yet in your Supabase database.

## Solution: Run Database Migration

### Steps:

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com
   - Navigate to your project

2. **Open SQL Editor**
   - Click "SQL Editor" in the left sidebar
   - Click "New query"

3. **Execute Migration Script**
   - Copy the entire contents of: `scripts/010-system-texts-table.sql`
   - Paste into the SQL Editor
   - Click the "Run" button (or press Cmd+Enter)

4. **Verify Success**
   - You should see a success message
   - The query should complete without errors
   - Check that ~20 rows were inserted

5. **Test PDF Generation**
   - Refresh your application
   - Try generating a PDF receipt again
   - It should now work!

## What This Migration Does:

- Creates `system_texts` table for customizable UI text
- Sets up RLS policies (admin-only write, public read)
- Seeds Hebrew text entries for PDF receipts
- Creates indexes for performance
- Adds update timestamp trigger

## Already Completed:

✅ Migration script created
✅ Admin UI for text management built
✅ PDF generator updated to use system texts
✅ Navigation added to admin panel

## Pending:

⚠️ **Database migration not yet executed** ← YOU ARE HERE

## After Migration:

Once the migration is complete, you can:
- Generate PDF receipts with Hebrew text
- Customize all text strings via `/admin/texts`
- Manage system-wide translations
