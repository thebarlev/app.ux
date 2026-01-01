# Template System - User Selection & Admin Gallery

## System Architecture

### Admin Panel (`/admin/templates`)
- **Gallery View**: Cards with thumbnails, name, active/inactive toggle
- **Full CRUD**: Create, edit, duplicate, delete templates
- **Thumbnail Management**: Upload/set thumbnail URLs for preview
- **Global vs Company**: System admins can create global templates

### User Panel (`/dashboard/templates`)
- **Selection Only**: Users can only choose from available templates
- **No Editing**: No access to HTML/CSS editing
- **One Active Template**: Only one template selected at a time
- **Change Anytime**: Users can switch templates whenever needed

## Database Changes

### Migration Script: `016-add-template-selection.sql`

```sql
-- Add thumbnail_url to templates
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add selected_template_id to companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS selected_template_id UUID 
  REFERENCES public.templates(id) ON DELETE SET NULL;
```

## File Changes

### 1. Admin Templates Gallery
**File**: `app/admin/templates/TemplatesClient.tsx`
- Changed from table to **card grid layout**
- Shows thumbnail image or placeholder icon
- Hover overlay with quick actions (Edit, Duplicate)
- Active/Inactive badge on each card
- Delete dialog for company templates (global templates cannot be deleted)

### 2. User Template Selection
**Files Created**:
- `app/dashboard/templates/page.tsx` - Server component with auth
- `app/dashboard/templates/actions.ts` - Server actions for selection
- `app/dashboard/templates/TemplateSelectionClient.tsx` - Selection UI

**Features**:
- Grid of available templates (company + global)
- Click to select a template
- Visual indicator for currently selected template
- Thumbnail preview for each option
- Info card explaining selection rules

### 3. Server Actions

#### Admin Actions (`/admin/templates/actions.ts`)
- Added `thumbnailUrl` field to `CreateTemplatePayload`
- Updated `createTemplateAction` to accept `thumbnailUrl`
- Updated `updateTemplateAction` to accept `thumbnailUrl`

#### User Actions (`/dashboard/templates/actions.ts`)
- `getAvailableTemplatesAction()` - Fetch active templates (company + global)
- `getSelectedTemplateAction()` - Get current company's selected template
- `setSelectedTemplateAction(templateId)` - Update company's selection

## Usage Flow

### Admin Workflow
1. Navigate to `/admin/templates`
2. See gallery of all templates with thumbnails
3. Click "New Template" to create
4. Upload/set thumbnail URL (optional)
5. Toggle active/inactive status
6. Edit HTML/CSS in editor page

### User Workflow
1. Navigate to `/dashboard/templates`
2. See grid of available templates
3. Click any template card to select it
4. Selection saves immediately
5. Selected template is highlighted with checkmark
6. Change selection anytime (no restrictions)

## Template Selection Logic

### Database Query (User)
```typescript
// Get templates for user's company OR global templates
.from("templates")
.eq("is_active", true)
.or(`company_id.eq.${companyId},company_id.is.null`)
.eq("document_type", "receipt")
```

### Selection Update
```typescript
// Update company's selected template
.from("companies")
.update({ selected_template_id: templateId })
.eq("id", companyId)
```

## UI Components Used

### Admin Gallery
- `Card`, `CardHeader`, `CardContent`, `CardFooter`
- `Badge` for status indicators
- `AlertDialog` for delete confirmation
- `Button` with icon variants

### User Selection
- `Card` with hover effects
- `Check` icon for selected state
- `FileCode` placeholder icon
- `Badge` for template type (Global/Company)

## Permissions & Security

### Admin Panel
- Only system_admins can access `/admin/templates`
- Can edit company-specific templates
- Cannot edit global templates (company_id IS NULL)
- Can toggle active/inactive status
- Can delete company templates only

### User Panel
- All authenticated company users can access `/dashboard/templates`
- Can only SELECT from active templates
- Cannot edit HTML/CSS
- Cannot delete templates
- Selection stored in `companies.selected_template_id`

## Next Steps

1. **Run Migration**: Execute `016-add-template-selection.sql` in Supabase
2. **Add Thumbnails**: Upload template screenshots to storage
3. **Test Selection**: Verify users can select templates
4. **PDF Generation**: Update PDF service to use selected template

## Thumbnail Recommendations

### Size
- **Aspect Ratio**: 16:9 (video format)
- **Dimensions**: 800x450px or 1200x675px
- **Format**: PNG or JPG
- **Max Size**: 500KB per image

### Storage
- Store in Supabase Storage bucket: `business-assets/template-thumbnails/`
- Public access for thumbnails
- URL format: `https://{project}.supabase.co/storage/v1/object/public/business-assets/template-thumbnails/{template-id}.png`

### Generation
Consider auto-generating thumbnails using:
- Playwright screenshot of rendered template
- First page of PDF preview
- Manual upload via admin UI

## Database Schema

### templates
```sql
- id (uuid, PK)
- company_id (uuid, NULL for global)
- name (text)
- description (text, nullable)
- document_type (text: receipt, invoice, etc.)
- html_template (text)
- css (text, nullable)
- thumbnail_url (text, nullable) ← NEW
- is_default (boolean)
- is_active (boolean)
- created_by (uuid)
- created_at (timestamp)
- updated_at (timestamp)
```

### companies
```sql
- id (uuid, PK)
- selected_template_id (uuid, FK to templates) ← NEW
- ... other fields
```

## Status

✅ Database migration script created  
✅ Admin gallery UI implemented  
✅ User selection UI implemented  
✅ Server actions for selection  
✅ Type definitions updated  
⏳ Migration needs to be run  
⏳ Thumbnails need to be added  
⏳ PDF generator integration pending  

