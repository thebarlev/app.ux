# Receipt Style Module - Architecture Fix Summary

## Problem Fixed
Module not found error when dashboard tried to import from admin-specific route:
```
Can't resolve '@/app/admin/receipt-style/actions'
```

## Solution
Created shared library module that both admin and dashboard can safely import.

## Files Changed

### ✅ Created
- **`/lib/receipt-style.ts`** - Shared server-side module
  - Exports: `getReceiptStyleSettingsPublic()`, `getReceiptStyleSettings()`, `saveReceiptStyleSettings()`, `resetReceiptStyleSettings()`
  - Safe to import from any route (admin or dashboard)
  - Never throws on missing data - returns defaults

### ✅ Updated
- **`/app/dashboard/documents/receipt/preview/page.tsx`**
  - Changed: `@/app/admin/receipt-style/actions` → `@/lib/receipt-style`
  
- **`/app/admin/(app)/receipt-style/actions.ts`**
  - Now re-exports from shared module for backwards compatibility
  - Minimal file - all logic in `/lib/receipt-style.ts`

- **`/lib/pdf-service.ts`**
  - Better error handling: Returns 404 for missing documents (not 500)
  - Added logging for debugging PDF generation
  
- **`/app/api/documents/[documentId]/pdf/route.ts`**
  - Returns 404 status when document not found
  - Better error messages

## Usage

### Dashboard (Preview/PDF)
```typescript
import { getReceiptStyleSettingsPublic } from "@/lib/receipt-style";

const styleSettings = await getReceiptStyleSettingsPublic();
// Always returns valid settings (defaults if DB is empty)
```

### Admin (Settings Management)
```typescript
import { 
  getReceiptStyleSettings,
  saveReceiptStyleSettings,
  resetReceiptStyleSettings 
} from "@/lib/receipt-style";

// Or keep using old path (works via re-export)
import { ... } from "@/app/admin/(app)/receipt-style/actions";
```

## Database Table
```sql
-- Table: receipt_style_settings
-- Migration: scripts/013-receipt-style-settings.sql
```

## Default Values
Located in `/lib/types/receipt-style.ts`:
- Professional Hebrew receipt styling
- Uses design tokens (when available)
- Fallback to safe defaults

## Error Handling

### PDF Generation
- **404**: Document not found
- **500**: Server error (template/rendering issue)
- **Logs**: Check console for `[pdf-service]` and `[PDF API]` messages

### Style Settings
- Always returns defaults if DB query fails
- No authentication required for public getter
- Admin actions verify `system_admins` table

## Testing

### Build
```bash
pnpm build
# ✅ Should compile successfully
```

### Preview
1. Navigate to `/dashboard/documents/receipt/preview`
2. Should load with default style settings
3. Check browser console for `[receipt-style]` logs

### PDF Download
1. GET `/api/documents/[documentId]/pdf`
2. Returns 404 if document doesn't exist
3. Returns PDF buffer if successful

## Architecture Notes

✅ **DO**: Import from `/lib/*` for shared functionality  
❌ **DON'T**: Import from `/app/admin/*` in dashboard routes  
✅ **DO**: Use semantic tokens from design system  
❌ **DON'T**: Export non-function values from "use server" files  

---

**Status**: ✅ Build passing, module resolution fixed, proper 404 handling implemented
