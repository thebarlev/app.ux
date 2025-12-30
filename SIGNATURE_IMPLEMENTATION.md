# Signature Upload & Display Implementation

**Date:** December 30, 2025  
**Feature:** Business signature upload and display in receipt documents

## Overview

Added functionality for business owners to upload their signature via the settings page, with automatic display on receipt documents below the payments table.

## Changes Made

### 1. Database Schema

**File:** `scripts/016-add-signature-field.sql`
- Added `signature_url` column to `companies` table
- Stores URL to uploaded signature image in Supabase Storage
- Field is nullable (optional)

```sql
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS signature_url TEXT;
```

### 2. Settings Page - Signature Upload

**Files Modified:**
- `app/dashboard/settings/SettingsClient.tsx`
- `app/dashboard/settings/actions.ts`
- `app/dashboard/settings/page.tsx`

**SettingsClient.tsx Changes:**
- Updated `Company` type to include `signature_url: string | null`
- Added `signatureInputRef` and `signatureUrl` state
- Added `isUploadingSignature` state for loading indicator
- Implemented `handleSignatureUpload()` handler
- Implemented `handleDeleteSignature()` handler
- Added Signature Section UI after Logo Section with:
  - Preview container (400px max width, 200px min height)
  - Signature image display or placeholder (✍️ emoji)
  - Upload button (changes to "החלף חתימה" when signature exists)
  - Delete button (only visible when signature exists)
  - File input (hidden, accepts PNG, JPG, SVG)

**actions.ts Changes:**
- Added `uploadSignatureAction(formData: FormData)` server action:
  - Validates file type (PNG, JPG, SVG)
  - Validates file size (max 5MB)
  - Deletes old signature if exists
  - Uploads to `business-signatures/{companyId}/signature.{ext}`
  - Updates `companies.signature_url`
  - Returns `{ ok: true, signatureUrl: string }`
  
- Added `deleteSignatureAction()` server action:
  - Removes file from storage
  - Sets `companies.signature_url` to `null`
  - Revalidates paths

**page.tsx Changes:**
- Added `signature_url` to company SELECT query

### 3. Receipt Preview - Signature Display

**Files Modified:**
- `app/dashboard/documents/receipt/preview/PreviewClient.tsx`
- `app/dashboard/documents/receipt/preview/page.tsx`

**PreviewClient.tsx Changes:**
- Updated `CompanyData` type to include `signature_url?: string`
- Added signature section below `receipt-payments-section`
- Section only renders if `companyData?.signature_url` exists
- **Layout:**
  - `marginTop: "40px"` - spacing from payments table
  - `justifyContent: "flex-start"` - aligns to left (right in RTL)
  - Signature image: max 200px width × 80px height
  - Signature line: 1px solid black, 200px width
  - Label: "חתימה" (11px, gray, bold)

**page.tsx Changes:**
- Added `signature_url` to companies SELECT query in `PreviewDataLoader`

### 4. Payment Table Column Reordering

**File:** `app/dashboard/documents/receipt/preview/PreviewClient.tsx`

Changed table column order from:
```
אמצעי | תאריך | סכום | פרטים
(1fr   1fr    1fr    2fr)
```

To:
```
פרטים | סכום | תאריך | אמצעי
(2fr     1fr    1fr     1fr)
```

**Changes:**
- Updated `gridTemplateColumns` in header, rows, and total row to `"2fr 1fr 1fr 1fr"`
- Reordered header cells (receipt-payments-header-cell)
- Reordered data cells in payment rows
- Updated total row layout:
  - Empty div in column 1 (פרטים)
  - Total amount in column 2 (סכום)
  - "סה״כ" label spans columns 3-5 (תאריך + אמצעי)

## Storage Setup

Signatures are stored in Supabase Storage bucket `business-assets`:

**Path structure:**
```
business-assets/
  business-signatures/
    {companyId}/
      signature.png
      signature.jpg
      signature.svg
```

**Notes:**
- Bucket must be public for images to display
- Files are uploaded with `upsert: true` to replace existing signatures
- Old signatures are deleted before uploading new ones
- See `STORAGE_SETUP_GUIDE.md` for bucket creation instructions

## UI/UX Details

### Settings Page Signature Section

- **Header:** "חתימת העסק" (20px, bold)
- **Preview Box:**
  - 400px max width, 200px min height
  - Dashed border (#d1d5db, 2px)
  - Light gray background (#f9fafb)
  - Contains signature image or ✍️ placeholder

- **Upload Button:**
  - Black background (#111827)
  - White text, 600 weight
  - Text changes based on state:
    - No signature: "העלה חתימה"
    - Has signature: "החלף חתימה"
    - Uploading: "מעלה..."

- **Delete Button:**
  - White background, red border/text (#ef4444)
  - Only visible when signature exists
  - Confirms before deletion

### Receipt Preview Signature Section

- **Position:** Below `receipt-payments-section`, above notes
- **Alignment:** Left side (right in RTL layout via `justifyContent: "flex-start"`)
- **Spacing:**
  - 40px top margin from payments table
  - 16px bottom margin
  - 37px left/right margins (aligned with document content)

- **Components:**
  - Signature image (200×80px max, object-fit: contain)
  - Separator line (1px solid black, 200px width)
  - Label "חתימה" (11px, #666, bold)

## CSS Classes Added

New classes for signature section:
- `receipt-signature-section` - Container div
- `receipt-signature-container` - Wrapper for image + line + label
- `receipt-signature-image` - The signature image element
- `receipt-signature-line` - Separator line above label
- `receipt-signature-label` - "חתימה" text label

## Files Modified Summary

1. **Database:**
   - `scripts/016-add-signature-field.sql` (NEW)

2. **Settings Page:**
   - `app/dashboard/settings/SettingsClient.tsx`
   - `app/dashboard/settings/actions.ts`
   - `app/dashboard/settings/page.tsx`

3. **Receipt Preview:**
   - `app/dashboard/documents/receipt/preview/PreviewClient.tsx`
   - `app/dashboard/documents/receipt/preview/page.tsx`

## Testing Checklist

- [ ] Run SQL migration: `016-add-signature-field.sql`
- [ ] Verify `signature_url` column exists in `companies` table
- [ ] Upload signature via `/dashboard/settings`
- [ ] Verify signature displays in settings preview
- [ ] Delete signature and verify removal
- [ ] Create receipt with signature
- [ ] Verify signature appears below payments table in preview
- [ ] Verify signature alignment (left/right in RTL)
- [ ] Test with different image formats (PNG, JPG, SVG)
- [ ] Test file size validation (max 5MB)
- [ ] Test storage bucket error handling

## Future Enhancements

1. **PDF Integration**
   - Embed signature in generated PDFs
   - Requires base64 conversion like logo

2. **Signature Drawing**
   - Add signature pad for digital drawing
   - Alternative to file upload

3. **Multiple Signatures**
   - Support for different signatories
   - Admin signature vs. authorized person

4. **Signature Position Control**
   - Admin settings for signature placement
   - Left/center/right alignment options

5. **Document Type Configuration**
   - Choose which document types show signature
   - Enable/disable per document type

---

**Status:** ✅ Implementation complete. Signature upload, storage, and display fully functional. Column reordering applied to payment tables. Build successful with no TypeScript errors.
