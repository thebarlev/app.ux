# Dashboard Design Tokens Migration - Status Report

**Date:** January 5, 2026  
**Task:** Verify and update all Dashboard components to use new design tokens

## ✅ Files Updated (Design Tokens Applied)

### Core Pages
1. **[app/dashboard/not-found.tsx](app/dashboard/not-found.tsx)** ✅
   - Removed: `color: "#111827"`, `background: "#111827"`
   - Applied: `text-fg`, `bg-primary`, `text-primary-fg`
   - Status: COMPLETE

2. **[app/dashboard/error.tsx](app/dashboard/error.tsx)** ✅
   - Removed: Inline styles with hex colors
   - Applied: `text-fg`, `text-muted-fg`, `bg-primary`, `bg-secondary`
   - Status: COMPLETE

3. **[app/dashboard/documents/page.tsx](app/dashboard/documents/page.tsx)** ✅
   - Removed: `bg-white/5`, `text-white/70`, `border-white/10`
   - Applied: `bg-card`, `text-card-fg`, `text-muted-fg`, `border-border`
   - Status: COMPLETE

4. **[app/dashboard/documents/new/page.tsx](app/dashboard/documents/new/page.tsx)** ✅
   - Removed: `text-white`, `bg-white/5`, `bg-blue-500/20`, `bg-gray-500/20`
   - Applied: `text-fg`, `bg-card`, `bg-primary/20`, `text-muted-fg`
   - Status: COMPLETE

## ⚠️ Files Requiring Updates (Hardcoded Colors Found)

### Settings Module
5. **[app/dashboard/settings/SettingsClient.tsx](app/dashboard/settings/SettingsClient.tsx)** ⚠️
   - Issues:
     - `text-slate-900`, `text-slate-600` (20+ instances)
     - `className="bg-white text-slate-900"`
     - `border: "1px solid #e5e7eb"`
     - Inline style objects with hex colors
   - Action Required: Full refactor to design tokens
   - Priority: HIGH (user-facing settings page)

6. **[app/dashboard/settings/page.tsx](app/dashboard/settings/page.tsx)** ⚠️
   - Issues:
     - `color: "#6b7280"`, `color: "#dc2626"`
     - Inline hex colors in style objects
   - Action Required: Update to tokens

### Customers Module
7. **[app/dashboard/customers/CustomersListClient.tsx](app/dashboard/customers/CustomersListClient.tsx)** ⚠️
   - Issues:
     - `background: "#111827"`, `border: "1px solid #d1d5db"`
     - `background: "#f9fafb"`, `background: "#3b82f6"`, `background: "#ef4444"`
     - Extensive inline styles with hex colors
   - Action Required: Refactor table to use design tokens
   - Priority: HIGH (main customers list)

8. **[app/dashboard/customers/CustomerFormClient.tsx](app/dashboard/customers/CustomerFormClient.tsx)** ⚠️
   - Issues:
     - `backgroundColor: '#1e293b'`, `borderColor: '#334155'`
     - Old dark theme hex colors
   - Action Required: Update to new tokens

### Reports Module
9. **[app/dashboard/reports/ReportCard.tsx](app/dashboard/reports/ReportCard.tsx)** ⚠️
   - Issues:
     - `text-white`, `bg-slate-700`, `text-slate-300`
     - `ui-card-dark`, `ui-text-dark` (old UI classes)
     - `hover:border-slate-600`
   - Action Required: Update to new token system
   - Priority: MEDIUM

### Preview/PDF Components  
10. **[app/dashboard/documents/receipt/preview/PreviewClient.tsx](app/dashboard/documents/receipt/preview/PreviewClient.tsx)** ⚠️
    - Issues:
      - CSS Variables defined inline with hex colors (lines 390-404)
      - `background: "#F5F6F7"`, `background: "#fee"`, `border: "2px solid #f00"`
      - Many hex color definitions for template rendering
    - Action Required: CHECK if these are for PDF template rendering (may be intentional)
    - Priority: LOW (might be template-specific, not UI)

## 📊 Summary Statistics

- **Total Dashboard Files:** 50
- **Files Checked:** 10
- **Files Updated:** 4
- **Files Needing Update:** 6
- **Completion:** ~40% of critical UI files

## 🎯 Priority Actions

### HIGH Priority (User-Facing UI)
1. ✅ Fix `SettingsClient.tsx` - Main settings page
2. ✅ Fix `CustomersListClient.tsx` - Main customers list
3. ✅ Fix `CustomerFormClient.tsx` - Customer edit form

### MEDIUM Priority
4. ✅ Fix `ReportCard.tsx` - Reports dashboard
5. ✅ Fix `settings/page.tsx` - Settings wrapper

### LOW Priority (Review Only)
6. ⚠️ Check `PreviewClient.tsx` - May be intentional for PDF rendering

## 🔍 Known Issues

### Hardcoded Color Patterns Found
- `text-slate-*` → Should use `text-fg`, `text-muted-fg`
- `bg-white` → Should use `bg-bg`, `bg-card`
- `text-white` → Should use `text-fg` (with appropriate background)
- Inline `style={{ color: "#..." }}` → Should use Tailwind classes with tokens
- `border: "1px solid #..."` → Should use `border border-border`

### Old UI Classes Still in Use
- `ui-card-dark` → Should use `bg-card text-card-fg border border-border`
- `ui-text-dark` → Should use `text-card-fg`
- `ui-text-dark-muted` → Should use `text-muted-fg`
- `ui-button-dark` → Should use `bg-primary text-primary-fg`

## ✅ Design Token Reference (For Updates)

### Backgrounds
- Page: `bg-bg`
- Cards: `bg-card`
- Muted areas: `bg-muted`
- Inputs: `bg-input`

### Text
- Primary: `text-fg`
- Card text: `text-card-fg`
- Muted: `text-muted-fg`
- Inputs: `text-input-fg`
- Placeholder: `placeholder:text-placeholder`

### Buttons
- Primary: `bg-primary text-primary-fg hover:bg-primary-hover`
- Secondary: `bg-secondary text-secondary-fg border border-border`
- Danger: `bg-danger text-danger-fg`

### Borders
- Standard: `border-border`
- Focus: `focus:ring-2 focus:ring-ring`

### Tables
- Header: `bg-table-header text-table-header-fg`
- Row hover: `hover:bg-table-row-hover`
- Stripe: `bg-table-stripe`

## 📝 Next Steps

1. ✅ **Update SettingsClient.tsx** - Convert all inline styles and slate colors
2. ✅ **Update CustomersListClient.tsx** - Refactor table with tokens
3. ✅ **Update CustomerFormClient.tsx** - Replace dark theme hex colors
4. ✅ **Update ReportCard.tsx** - Remove old UI classes
5. ⚠️ **Review PreviewClient.tsx** - Determine if colors are for PDF template
6. ✅ **Run build test** - Ensure all changes compile
7. ✅ **Visual QA** - Check actual rendering in browser

## 🚀 Expected Outcome

After completion:
- ❌ No `text-white`, `bg-black`, `gray-*`, `slate-*`, `blue-*` classes
- ❌ No hex colors in JSX or inline styles
- ❌ No old `ui-*-dark` classes
- ✅ All colors via semantic design tokens
- ✅ Consistent styling across Dashboard
- ✅ Easy theme updates by changing CSS variables only

---

**Status:** IN PROGRESS  
**Last Updated:** January 5, 2026, 21:45  
**Remaining Work:** 6 high-priority files
