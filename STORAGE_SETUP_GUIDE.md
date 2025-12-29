# 🪣 Supabase Storage Setup Guide - Business Logos

## ❌ Error: "Bucket not found"

### Root Cause
The Supabase Storage bucket `business-assets` doesn't exist yet in your Supabase project. You must create it before uploading files.

---

## ✅ Solution: Create the Storage Bucket

### Option 1: Via Supabase Dashboard (Recommended - 2 minutes)

#### Step 1: Navigate to Storage
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **"Storage"** in the left sidebar
4. Click **"Create a new bucket"** button

#### Step 2: Configure the Bucket
Fill in the form:

| Field | Value | Why |
|-------|-------|-----|
| **Name** | `business-assets` | Must match code exactly |
| **Public bucket** | ✅ **YES** (checked) | Logos need to be publicly accessible for PDFs |
| **File size limit** | `5242880` (5MB) | Prevents huge uploads |
| **Allowed MIME types** | `image/png,image/jpeg,image/jpg,image/svg+xml` | Only images allowed |

#### Step 3: Click "Create bucket"

**Screenshot reference**:
```
┌─────────────────────────────────────┐
│  Create a new bucket                │
├─────────────────────────────────────┤
│  Name: business-assets              │
│  ☑ Public bucket                    │
│  File size limit: 5242880 (bytes)   │
│  Allowed MIME types:                │
│  image/png,image/jpeg,image/jpg...  │
│                                     │
│  [Cancel]  [Create bucket]          │
└─────────────────────────────────────┘
```

---

### Option 2: Via Supabase CLI (Advanced)

```bash
# Login to Supabase
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Create the bucket
supabase storage create business-assets --public
```

---

## 🔒 Step 2: Set Up Security Policies (RLS)

After creating the bucket, **you MUST set up Row Level Security (RLS) policies** to control who can upload/delete files.

### Open Supabase SQL Editor
1. Go to **SQL Editor** in Supabase Dashboard
2. Create a new query
3. Copy and paste the following SQL:

```sql
-- =====================================================
-- STORAGE RLS POLICIES FOR BUSINESS LOGOS
-- =====================================================

-- Policy 1: Allow authenticated users to upload logo to their own company folder
CREATE POLICY "Users can upload logo to own company folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'business-assets' 
  AND (storage.foldername(name))[1] = 'business-logos'
  AND (storage.foldername(name))[2] IN (
    -- User owns the company directly
    SELECT id::text FROM public.companies WHERE auth_user_id = auth.uid()
    UNION
    -- User is a member of the company (multi-tenant)
    SELECT company_id::text FROM public.company_members WHERE user_id = auth.uid()
  )
);

-- Policy 2: Allow authenticated users to update their company logo
CREATE POLICY "Users can update logo in own company folder"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'business-assets'
  AND (storage.foldername(name))[1] = 'business-logos'
  AND (storage.foldername(name))[2] IN (
    SELECT id::text FROM public.companies WHERE auth_user_id = auth.uid()
    UNION
    SELECT company_id::text FROM public.company_members WHERE user_id = auth.uid()
  )
);

-- Policy 3: Allow authenticated users to delete their company logo
CREATE POLICY "Users can delete logo from own company folder"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'business-assets'
  AND (storage.foldername(name))[1] = 'business-logos'
  AND (storage.foldername(name))[2] IN (
    SELECT id::text FROM public.companies WHERE auth_user_id = auth.uid()
    UNION
    SELECT company_id::text FROM public.company_members WHERE user_id = auth.uid()
  )
);

-- Policy 4: Allow PUBLIC read access to logos (required for PDFs and public display)
CREATE POLICY "Public can view logos"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id = 'business-assets'
  AND (storage.foldername(name))[1] = 'business-logos'
);
```

4. Click **"Run"** to execute the policies

---

## 📂 File Structure in Storage

Your logos will be stored like this:

```
business-assets/                    ← Bucket name
└── business-logos/                 ← Folder for all company logos
    ├── {company-id-1}/            ← Each company has its own folder
    │   └── logo.png               ← Logo file
    ├── {company-id-2}/
    │   └── logo.jpg
    └── {company-id-3}/
        └── logo.svg
```

**Example**:
```
business-assets/business-logos/123e4567-e89b-12d3-a456-426614174000/logo.png
```

---

## 🧪 Test the Setup

### Step 1: Verify Bucket Exists
Run this SQL in Supabase SQL Editor:

```sql
-- Check if bucket exists
SELECT * FROM storage.buckets WHERE name = 'business-assets';

-- Check bucket policies
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY policyname;
```

**Expected result**: 
- 1 row with `name = 'business-assets'` and `public = true`
- 4 policies related to business logos

### Step 2: Test Upload via Settings Page
1. Go to `/dashboard/settings`
2. Click "העלה לוגו"
3. Select an image file (PNG/JPG/SVG, max 5MB)
4. Click upload

**Expected result**: 
- ✅ Logo uploads successfully
- ✅ Preview shows the logo
- ✅ `companies.logo_url` is updated in database

### Step 3: Verify in Supabase Dashboard
1. Go to **Storage** → **business-assets**
2. Navigate to `business-logos/` folder
3. You should see a folder with your company ID
4. Inside, you should see `logo.png` (or `.jpg`, `.svg`)

---

## 💻 Code Reference

### Upload Function (Already Implemented)
File: `/app/dashboard/settings/actions.ts`

```typescript
export async function uploadLogoAction(formData: FormData) {
  const supabase = await createClient();
  const companyId = await getCompanyIdForUser();
  const file = formData.get("logo") as File;

  // Validate file type
  const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];
  if (!validTypes.includes(file.type)) {
    return { ok: false, message: "invalid_file_type" };
  }

  // Upload to storage
  const fileExt = file.name.split(".").pop();
  const fileName = `logo.${fileExt}`;
  const filePath = `business-logos/${companyId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("business-assets")  // ← Bucket name must match!
    .upload(filePath, file, { upsert: true });

  if (uploadError) {
    return { ok: false, message: uploadError.message };
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from("business-assets")
    .getPublicUrl(filePath);

  // Save URL to database
  const { error: updateError } = await supabase
    .from("companies")
    .update({ logo_url: urlData.publicUrl })
    .eq("id", companyId);

  return { ok: true, logoUrl: urlData.publicUrl };
}
```

### Display Logo (Already Implemented)
File: `/app/dashboard/documents/receipt/view/ReceiptViewClient.tsx`

```typescript
{companyDetails?.logoUrl && (
  <div style={{ width: 80, height: 80, overflow: "hidden", borderRadius: 8 }}>
    <img 
      src={companyDetails.logoUrl}  // ← Public URL from database
      alt="Company Logo" 
      style={{ width: "100%", height: "100%", objectFit: "contain" }}
    />
  </div>
)}
```

---

## 🔧 Troubleshooting

### Error: "Bucket not found"
**Cause**: Bucket `business-assets` doesn't exist  
**Fix**: Follow "Option 1" above to create it

### Error: "new row violates row-level security policy"
**Cause**: RLS policies not set up correctly  
**Fix**: Run the SQL policies in Step 2

### Error: "Invalid file type"
**Cause**: Trying to upload non-image file  
**Fix**: Only upload PNG, JPG, or SVG files

### Logo doesn't appear after upload
**Cause**: Browser cache or incorrect URL  
**Fix**: 
1. Check `companies.logo_url` in database - should be a full URL
2. Try opening the URL directly in browser
3. Hard refresh the page (Ctrl+Shift+R)

### Logo appears in settings but not in receipts
**Cause**: Receipt view not fetching company details  
**Fix**: Check that `ReceiptViewClient` receives `companyDetails.logoUrl` prop

---

## 🎯 Production Checklist

Before going live, verify:

- [ ] ✅ Bucket `business-assets` created with `public = true`
- [ ] ✅ All 4 RLS policies are active
- [ ] ✅ File size limit set to 5MB
- [ ] ✅ MIME types restricted to images only
- [ ] ✅ Database column `companies.logo_url` exists (TEXT type)
- [ ] ✅ Upload works without errors
- [ ] ✅ Logo displays in settings page
- [ ] ✅ Logo displays in receipt HTML view
- [ ] ✅ Logo displays in PDF export
- [ ] ✅ Public access works (try URL in incognito)
- [ ] ✅ Multi-tenant isolation works (user can't access other company logos)

---

## 📊 Quick Reference

| Item | Value |
|------|-------|
| **Bucket Name** | `business-assets` |
| **Bucket Visibility** | Public |
| **File Path Pattern** | `business-logos/{company_id}/logo.{ext}` |
| **Max File Size** | 5 MB (5242880 bytes) |
| **Allowed Types** | PNG, JPG, JPEG, SVG |
| **Database Column** | `companies.logo_url` (TEXT) |
| **RLS Policies** | 4 (INSERT, UPDATE, DELETE, SELECT) |

---

## 🚀 Next Steps

1. **Create the bucket** (2 minutes)
2. **Run RLS policies** (1 minute)
3. **Test upload** (1 minute)
4. **Verify logo appears everywhere** (2 minutes)

**Total time**: ~6 minutes

---

## 📞 Still Having Issues?

If you still get "Bucket not found" after creating the bucket:

1. **Double-check the bucket name** - it must be exactly `business-assets` (no spaces, no typos)
2. **Refresh your Supabase client** - restart your dev server (`pnpm dev`)
3. **Check your .env.local** - verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct
4. **Try the debug endpoint**: Create a simple test route to verify connectivity

```typescript
// app/api/test-storage/route.ts
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  
  const { data: buckets, error } = await supabase.storage.listBuckets();
  
  return Response.json({
    buckets: buckets?.map(b => b.name),
    error: error?.message,
  });
}
```

Visit `/api/test-storage` to see if `business-assets` appears in the list.

---

**Ready to upload your logo!** 🎨
