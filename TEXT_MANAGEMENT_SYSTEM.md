# System Text Management - Implementation Guide

## Overview
Complete text management system allowing admins to customize all user-facing strings in the application.

## Components Created

### 1. Database Schema
**File:** `scripts/010-system-texts-table.sql`

Creates `system_texts` table with:
- `key` (unique identifier)
- `page` (module/page grouping)
- `default_value` (original text)
- `value` (customized text, nullable)
- `description` (optional explanation)

**RLS Policies:**
- Admins: Full CRUD access
- All users: Read-only (to display texts)

**Initial Seed Data:**
- All receipt PDF labels pre-populated
- Business type labels
- Ready to use immediately

### 2. Helper Functions
**File:** `lib/system-texts.ts`

**Functions:**
```typescript
// Get single text
await getSystemText(key: string, fallback?: string): Promise<string>

// Get multiple texts efficiently
await getSystemTexts(keys: string[]): Promise<Record<string, string>>

// Get all texts for a page
await getPageTexts(page: string): Promise<Record<string, string>>

// Clear cache after updates
clearTextCache(key?: string): void
```

**Features:**
- In-memory caching (5 minute TTL)
- Automatic fallback to default_value
- Returns custom value if set
- Console warnings for missing keys

### 3. Server Actions
**File:** `app/admin/texts/actions.ts`

**Actions:**
- `getAllTextsAction()` - Get all texts grouped by page
- `updateTextAction(id, value)` - Update text value
- `resetTextAction(id)` - Reset to default
- `createTextAction(payload)` - Create new text entry
- `deleteTextAction(id)` - Delete text entry

**Security:**
- All actions verify admin role via `system_admins` table
- Auto-clears cache after updates
- Revalidates `/admin/texts` path

### 4. Admin UI
**Files:**
- `app/admin/texts/page.tsx` - Server component with auth
- `app/admin/texts/TextsManagementClient.tsx` - Client UI

**Features:**
- RTL Hebrew interface
- Grouped by page/module
- Inline editing with textarea
- Shows both default and custom values
- Create new text entries
- Reset to default
- Delete entries
- Real-time updates

**Access:** `/admin/texts` (admin only)

### 5. PDF Integration
**File:** `lib/pdf-generator.ts`

**Updated to use getSystemText:**
```typescript
// Before
doc.text(reverseText("קבלה"), x, y);

// After
const title = await getSystemText("receipt_title", "קבלה");
doc.text(reverseText(title), x, y);
```

**All PDF labels now customizable:**
- Receipt title, copy text
- Customer labels (To:, Phone:, Mobile:)
- Payment table headers
- Total amount label
- Notes labels
- Footer text

## Usage Examples

### Example 1: Using in a Server Component
```typescript
import { getSystemText } from "@/lib/system-texts";

export default async function MyPage() {
  const welcomeText = await getSystemText("welcome_message", "Welcome!");
  
  return <h1>{welcomeText}</h1>;
}
```

### Example 2: Using Multiple Texts
```typescript
import { getSystemTexts } from "@/lib/system-texts";

export default async function FormPage() {
  const texts = await getSystemTexts([
    "form_name_label",
    "form_email_label",
    "form_submit_button"
  ]);
  
  return (
    <form>
      <label>{texts.form_name_label}</label>
      <input type="text" />
      
      <label>{texts.form_email_label}</label>
      <input type="email" />
      
      <button>{texts.form_submit_button}</button>
    </form>
  );
}
```

### Example 3: Using in Client Component
```typescript
"use client";

import { useEffect, useState } from "react";
import { getSystemText } from "@/lib/system-texts";

export function MyClientComponent() {
  const [text, setText] = useState("Loading...");
  
  useEffect(() => {
    getSystemText("my_key", "Default").then(setText);
  }, []);
  
  return <p>{text}</p>;
}
```

### Example 4: Adding New Texts via UI
1. Navigate to `/admin/texts`
2. Click "+ הוסף טקסט חדש"
3. Fill in:
   - Key: `invoice_footer_text`
   - Page: `invoice`
   - Default Value: `תודה על העסקה`
   - Description: `Footer text for invoices`
4. Click "שמור"
5. Use in code:
   ```typescript
   const footerText = await getSystemText("invoice_footer_text");
   ```

## Setup Instructions

### 1. Run Database Migration
```bash
# Connect to Supabase and run:
psql $DATABASE_URL -f scripts/010-system-texts-table.sql
```

### 2. Verify Admin Access
Make sure you have a record in `system_admins` table:
```sql
SELECT * FROM system_admins WHERE auth_user_id = auth.uid();
```

### 3. Access Admin Panel
1. Login as admin user
2. Navigate to `/admin/texts`
3. You should see pre-seeded receipt texts

### 4. Customize Texts
- Click "ערוך" next to any text
- Modify the value
- Click "שמור"
- Changes are immediate (cache cleared automatically)

## Best Practices

### 1. Key Naming Convention
```
{page}_{element}_{type}
```
Examples:
- `receipt_title` - Main receipt title
- `receipt_phone_label` - Phone label
- `form_submit_button` - Submit button text
- `error_not_found` - Not found error message

### 2. Page Grouping
Group related texts by module:
- `receipt` - Receipt document
- `invoice` - Invoice document
- `form` - Form labels
- `error` - Error messages
- `common` - Shared across app
- `dashboard` - Dashboard UI

### 3. Always Provide Fallback
```typescript
// Good - has fallback
const text = await getSystemText("my_key", "Default Text");

// Less ideal - no fallback
const text = await getSystemText("my_key");
```

### 4. Use getSystemTexts for Multiple
```typescript
// Good - single query
const texts = await getSystemTexts(["key1", "key2", "key3"]);

// Bad - multiple queries
const text1 = await getSystemText("key1");
const text2 = await getSystemText("key2");
const text3 = await getSystemText("key3");
```

### 5. Cache Behavior
- Texts are cached for 5 minutes
- Cache is cleared on update/reset/delete
- Cache is per-process (not shared across instances)
- Consider Redis for production multi-instance setup

## Migration Guide

### Converting Hardcoded Strings

**Before:**
```typescript
export function MyComponent() {
  return <h1>Welcome to the Dashboard</h1>;
}
```

**After:**
```typescript
export async function MyComponent() {
  const title = await getSystemText("dashboard_welcome_title", "Welcome to the Dashboard");
  return <h1>{title}</h1>;
}
```

### For Client Components

**Before:**
```typescript
"use client";
export function MyForm() {
  return <button>Submit</button>;
}
```

**After:**
```typescript
"use client";
import { useEffect, useState } from "react";
import { getSystemText } from "@/lib/system-texts";

export function MyForm() {
  const [buttonText, setButtonText] = useState("Submit");
  
  useEffect(() => {
    getSystemText("form_submit_button", "Submit").then(setButtonText);
  }, []);
  
  return <button>{buttonText}</button>;
}
```

## Security Notes

1. **Admin Only:** Only users in `system_admins` table can modify texts
2. **Public Read:** All users can read texts (required for display)
3. **RLS Enforced:** Row Level Security policies prevent unauthorized access
4. **No Client Mutations:** All updates go through server actions
5. **Cache Invalidation:** Automatic cache clearing prevents stale data

## Performance Considerations

1. **Caching:** 5-minute TTL reduces database queries
2. **Batch Queries:** Use `getSystemTexts()` for multiple keys
3. **Server Components:** Prefer server components for text fetching
4. **Database Indexes:** Key and page columns are indexed

## Troubleshooting

### Text Not Updating
1. Check cache - wait 5 minutes or restart server
2. Verify RLS policies allow your user to read
3. Check console for errors

### "Not Authorized" Error
1. Verify you're logged in as admin
2. Check `system_admins` table has your `auth_user_id`
3. Ensure RLS policies are applied

### Missing Text Shows Key
1. Add the text entry via admin UI
2. Check for typos in key name
3. Provide fallback parameter

## Future Enhancements

- [ ] Multi-language support (locale-based)
- [ ] Redis caching for production
- [ ] Import/Export functionality
- [ ] Version history and rollback
- [ ] Bulk edit interface
- [ ] Search and filter in admin UI
- [ ] Preview changes before saving
- [ ] Audit log of text changes

## Database Schema Reference

```sql
CREATE TABLE system_texts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  page TEXT NOT NULL,
  default_value TEXT NOT NULL,
  value TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_system_texts_key ON system_texts(key);
CREATE INDEX idx_system_texts_page ON system_texts(page);
```

## API Reference

### getSystemText
```typescript
async function getSystemText(
  key: string,
  fallback?: string
): Promise<string>
```
Returns custom value if set, otherwise default_value, otherwise fallback, otherwise key.

### getSystemTexts
```typescript
async function getSystemTexts(
  keys: string[]
): Promise<Record<string, string>>
```
Efficiently fetch multiple texts in one query.

### getPageTexts
```typescript
async function getPageTexts(
  page: string
): Promise<Record<string, string>>
```
Get all texts for a specific page/module.

### clearTextCache
```typescript
function clearTextCache(key?: string): void
```
Clear cache for specific key or entire cache.

---

**Status:** ✅ Fully Implemented
**Last Updated:** December 29, 2025
