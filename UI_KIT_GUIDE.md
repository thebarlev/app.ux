# UI Kit Guide - Complete Reference

## 🎯 Design Rules

**⚠️ IMPORTANT: Kit-First Approach**
- **DO NOT** write Tailwind classes directly in pages/components
- **ALWAYS** use UI Kit components and utilities
- **ALWAYS** build/update components in the Kit first, then apply to pages
- All form fields, buttons, sections, and layouts must come from the Kit

## 📐 Layout System

### Container
- **Max width**: 1100px (including outer padding)
- **Centered**: `mx-auto`
- **Padding**: 50px on both sides

**Usage:**
```tsx
<div className="ui-container">
  {/* Page content */}
</div>
```

### Form Grid
- **Columns**: Up to 3 per row (responsive: 1 on mobile, 2 on tablet, 3 on desktop)
- **Gap**: 50px horizontal and vertical
- **Field max width**: 300px

**Usage:**
```tsx
<div className="ui-form-grid">
  <FieldWrapper label="שדה 1"><Input /></FieldWrapper>
  <FieldWrapper label="שדה 2"><Input /></FieldWrapper>
  <FieldWrapper label="שדה 3"><Input /></FieldWrapper>
</div>
```

### Section Gap
- **Spacing**: 50px between sections

**Usage:**
```tsx
<div className="ui-section-gap">
  <FormSection title="סקשן 1">...</FormSection>
  <FormSection title="סקשן 2">...</FormSection>
</div>
```

### Page Header
- **Title**: Aligned right, 50px margin bottom
- **No background container** for header

**Usage:**
```tsx
<div className="ui-page-header">
  <h1 className="ui-page-title">כותרת עמוד</h1>
</div>
```

## 🎨 Design Tokens

### Application Base
```css
--bg: #F5FBF9           /* Main background */
--fg: #19183B           /* Main text color */
--card: #EDF1F5         /* Card/surface background */
--card-fg: #19183B      /* Card text color */
--muted: none           /* Muted backgrounds (removed) */
--muted-fg: #708993     /* Muted text */
--border: #ffffff       /* Standard borders (white) */
--ring: #708993         /* Focus rings */
```

### Buttons
```css
--primary: #1D868F          /* Primary button */
--primary-fg: #FFFFFF       /* Primary text */
--primary-hover: #19183B    /* Primary hover state */
--secondary: #F5FBF9        /* Secondary button */
--secondary-fg: #1D868F     /* Secondary text */
--secondary-border: #1D868F /* Secondary border */
--danger: #9B0003           /* Danger/delete actions */
--danger-fg: #FFFFFF        /* Danger text */
```

### Forms
```css
--input: #F5FBF9            /* Input background (white) */
--input-fg: #19183B         /* Input text */
--placeholder: #97B2BD      /* Placeholder text */
```

### Sidebar
```css
--sidebar-bg: #19183B           /* Dark background */
--sidebar-fg: #EDF1F5          /* Light text */
--sidebar-muted-fg: #EDF1F5    /* Muted text */
--sidebar-muted-bg: #1D868F    /* Muted background */
--sidebar-hover: #1D868F       /* Hover state */
--sidebar-active: #1D868F      /* Active item */
--sidebar-active-fg: #FFFFFF   /* Active text */
--sidebar-ring: #EDF1F5        /* Focus ring */
```

### Tables
```css
--table-header-bg: #19183B      /* Header background */
--table-header-fg: #FFFFFF      /* Header text */
--table-row-hover: #A1C2BD      /* Row hover */
--table-stripe: #EDF1F5         /* Striped rows */
--table-positive: #1D868F       /* Positive values */
--table-negative: #9B0003        /* Negative values */
```

### Layout
```css
--radius: 5px                   /* Border radius (all components) */
```

## 🧩 UI Kit Components

### 1. Container
**File:** `app/globals.css` (utility class)

**Usage:**
```tsx
<div className="ui-container">
  {/* Content max-width 1100px, centered, 50px padding */}
</div>
```

### 2. PageHeader
**File:** `app/globals.css` (utility class)

**Usage:**
```tsx
<div className="ui-page-header">
  <h1 className="ui-page-title">כותרת עמוד</h1>
  <p className="ui-page-subtitle">תיאור עמוד</p>
</div>
```

### 3. FormSection
**File:** `components/ui/form-section.tsx`

**Props:**
- `title: string` - Section title
- `description?: string` - Optional description
- `children: React.ReactNode` - Form fields

**Styling:**
- Background: `#1A8299`
- Border radius: `20px`
- Padding: `50px` right, `30px` left, `30px` top (RTL)
- Title aligned right with consistent spacing

**Usage:**
```tsx
<FormSection title="פרטי לקוח" description="מידע בסיסי">
  <div className="ui-form-grid">
    <FieldWrapper label="שם"><Input /></FieldWrapper>
    <FieldWrapper label="אימייל"><Input /></FieldWrapper>
  </div>
</FormSection>
```

### 4. FormGrid
**File:** `app/globals.css` (utility class)

**Usage:**
```tsx
<div className="ui-form-grid">
  {/* Up to 3 fields per row, 50px gaps */}
</div>
```

### 5. Input
**File:** `components/ui/input.tsx`

**Styling:**
- Height: `50px`
- Background: White
- Border: White (no colored border)
- Border radius: `5px`
- Text: `#19183B`
- Placeholder: `#97B2BD`
- Focus: Ring only (no colored outline)
- Max width: `300px`

**Usage:**
```tsx
<Input
  id="name"
  type="text"
  placeholder="הזן שם"
/>
```

### 6. Label
**File:** `components/ui/label.tsx`

**Styling:**
- Font size: `20px`
- Font weight: `400` (regular)
- Alignment: Right (RTL)
- Margin bottom: `25px` (spacing to field below)

**Usage:**
```tsx
<Label htmlFor="name">שם מלא</Label>
```

### 7. Select
**File:** `components/ui/select.tsx`

**Styling:**
- Same as Input (50px height, white background, 5px radius)
- Max width: `300px`

**Usage:**
```tsx
<Select value={value} onValueChange={setValue}>
  <SelectTrigger>
    <SelectValue placeholder="בחר..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">אפשרות 1</SelectItem>
  </SelectContent>
</Select>
```

### 8. Textarea
**File:** `components/ui/textarea.tsx`

**Styling:**
- Same as Input (white background, 5px radius)
- Min height: `100px`
- Max width: `300px`

**Usage:**
```tsx
<Textarea
  id="notes"
  placeholder="הזן הערות..."
/>
```

### 9. Button
**File:** `components/ui/button.tsx`

**Props:**
- `variant?: "primary" | "secondary" | "danger" | "ghost" | "link"`
- `size?: "default" | "sm" | "icon"`
- `loading?: boolean` - Shows spinner
- `disabled?: boolean`

**Styling:**
- Border radius: `5px`
- Default height: `50px`
- Aligned to left (RTL)

**Usage:**
```tsx
<Button variant="primary" loading={isLoading}>
  שמירה
</Button>
```

### 10. FormActions
**File:** `components/ui/form-actions.tsx`

**Props:**
- `primaryLabel: string` - Primary button text
- `secondaryLabel?: string` - Secondary button text (optional)
- `onPrimaryClick?: () => void` - Primary button handler (optional if using form)
- `onSecondaryClick?: () => void` - Secondary button handler
- `primaryType?: "button" | "submit" | "reset"` - Default: "button"
- `primaryLoading?: boolean` - Primary button loading state
- `secondaryLoading?: boolean` - Secondary button loading state
- `primaryDisabled?: boolean` - Primary button disabled state
- `secondaryDisabled?: boolean` - Secondary button disabled state
- `primaryIcon?: React.ReactNode` - Primary button icon
- `secondaryIcon?: React.ReactNode` - Secondary button icon

**Styling:**
- Buttons aligned to left (RTL)
- Primary button on top
- Secondary button below (stacked)
- Both buttons 50px height
- 5px border radius

**Usage:**
```tsx
<FormActions
  primaryLabel="שמירה"
  secondaryLabel="ביטול"
  primaryType="submit"
  onSecondaryClick={() => router.push("/back")}
  primaryLoading={isSaving}
  primaryIcon={<Save className="h-4 w-4" />}
/>
```

### 11. FieldWrapper
**File:** `components/ui/field-wrapper.tsx`

**Props:**
- `label: string` - Field label
- `required?: boolean` - Show required indicator (*)
- `error?: string | null` - Error message
- `hint?: string` - Helper text
- `id?: string` - Field ID (for label association)

**Usage:**
```tsx
<FieldWrapper label="שם לקוח" required error={errors.name} id="name">
  <Input id="name" />
</FieldWrapper>
```

### 12. Card
**File:** `components/ui/card.tsx`

**Components:**
- `Card` - Container
- `CardHeader` - Header section
- `CardTitle` - Title
- `CardDescription` - Description
- `CardContent` - Content area
- `CardFooter` - Footer section

**Usage:**
```tsx
<Card>
  <CardHeader>
    <CardTitle>כותרת</CardTitle>
    <CardDescription>תיאור</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

### 13. Modal
**File:** `components/ui/alert-dialog.tsx` or custom modal

**Usage:**
```tsx
<AlertDialog>
  <AlertDialogTrigger>פתח</AlertDialogTrigger>
  <AlertDialogContent>
    {/* Modal content */}
  </AlertDialogContent>
</AlertDialog>
```

## 📝 Typography

### Page Title
- **Class:** `ui-page-title`
- **Size:** `text-2xl`
- **Weight:** `font-bold`
- **Alignment:** Right (RTL)
- **Color:** `text-fg` (#19183B)

### Page Subtitle
- **Class:** `ui-page-subtitle`
- **Size:** `text-sm`
- **Color:** `text-muted-fg` (#708993)
- **Alignment:** Right (RTL)

### Body Text
- **Font:** Heebo (global)
- **Color:** `#19183B` (default)
- **Size:** `14px` (base)

## 🎨 Color Usage

### Backgrounds
- **Page background:** `#EDF1F5` (body)
- **Card background:** `#EDF1F5` (`bg-card`)
- **Input background:** White (`bg-white`)
- **Section background:** `#1A8299` (FormSection)

### Text Colors
- **Primary text:** `#19183B` (`text-fg`)
- **Muted text:** `#708993` (`text-muted-fg`)
- **Placeholder:** `#97B2BD` (`text-placeholder`)

### Borders
- **Standard borders:** White (`border-white`)
- **No colored borders** on inputs/selects

## 📋 Complete Example: Customer Form

```tsx
import { FormSection } from "@/components/ui/form-section"
import { FormActions } from "@/components/ui/form-actions"
import { Input } from "@/components/ui/input"
import { FieldWrapper } from "@/components/ui/field-wrapper"
import { Button } from "@/components/ui/button"

export default function CustomerForm() {
  return (
    <div className="ui-container py-8" dir="rtl">
      {/* Page Header */}
      <div className="ui-page-header">
        <h1 className="ui-page-title">לקוח חדש</h1>
      </div>

      {/* Form */}
      <form className="ui-section-gap">
        {/* Section 1 */}
        <FormSection title="פרטי לקוח">
          <div className="ui-form-grid">
            <FieldWrapper label="שם העסק" required id="name">
              <Input id="name" name="name" />
            </FieldWrapper>
            <FieldWrapper label="מספר עוסק" id="tax_id">
              <Input id="tax_id" name="tax_id" />
            </FieldWrapper>
            <FieldWrapper label="עיסוק" id="profession">
              <Input id="profession" name="profession" />
            </FieldWrapper>
          </div>
        </FormSection>

        {/* Section 2 */}
        <FormSection title="פרטי התקשרות">
          <div className="ui-form-grid">
            <FieldWrapper label="טלפון" id="phone">
              <Input id="phone" name="phone" />
            </FieldWrapper>
            <FieldWrapper label="דוא״ל" id="email">
              <Input id="email" name="email" type="email" />
            </FieldWrapper>
          </div>
        </FormSection>

        {/* Actions */}
        <FormActions
          primaryLabel="שמירה"
          secondaryLabel="ביטול"
          primaryType="submit"
          onSecondaryClick={() => router.push("/back")}
        />
      </form>
    </div>
  )
}
```

## ⚠️ Rules & Guidelines

### DO ✅
- Use UI Kit components for all forms, buttons, sections
- Use utility classes (`ui-container`, `ui-form-grid`, `ui-section-gap`)
- Use design tokens via Tailwind (`bg-card`, `text-fg`, etc.)
- Follow the 50px spacing system
- Use FormSection for all form sections
- Use FormActions for action buttons
- Keep max field width at 300px

### DON'T ❌
- **DO NOT** write Tailwind classes directly in pages
- **DO NOT** use inline styles
- **DO NOT** create custom form layouts outside the Kit
- **DO NOT** use hardcoded colors
- **DO NOT** use border-radius other than 5px
- **DO NOT** use field heights other than 50px
- **DO NOT** skip the Kit components

## 🔄 Migration Checklist

When updating a page to use the new UI Kit:

1. ✅ Replace container with `ui-container`
2. ✅ Add page header with `ui-page-header` and `ui-page-title`
3. ✅ Replace form sections with `FormSection` component
4. ✅ Replace form grids with `ui-form-grid`
5. ✅ Replace action buttons with `FormActions`
6. ✅ Update Input/Select/Textarea to use Kit components
7. ✅ Update Label to use Kit component
8. ✅ Remove all inline Tailwind classes
9. ✅ Remove all hardcoded colors
10. ✅ Test responsive behavior (mobile/tablet/desktop)

## 📚 Reference Implementation

See `app/dashboard/customers/new/page.tsx` and `app/dashboard/customers/CustomerFormClient.tsx` for a complete reference implementation.

---

**Last Updated:** January 2026  
**Version:** 2.0 (Kit-First Design System)
