# Accessibility Implementation Guide
## Israeli Standard IS 5568 / WCAG 2.1 AA Compliance

**Last Updated:** January 4, 2026  
**Standards:** IS 5568 Level AA (aligned with WCAG 2.1 AA)  
**Language:** Hebrew (RTL) with English/LTR content support

---

## 📋 Implementation Summary

This document details all accessibility improvements made to ensure compliance with Israeli Standard IS 5568 and WCAG 2.1 Level AA.

### ✅ Completed Improvements

#### 1. **Global Layout & Landmarks** (WCAG 2.4.1, 3.1.1)
- ✅ `<html lang="he" dir="rtl">` set in root layout
- ✅ Skip to main content link (first focusable element)
- ✅ Semantic landmarks: `<header>`, `<nav>`, `<main>`, `<footer>`
- ✅ `id="main-content"` on main content area
- ✅ Meaningful page titles with template support

**Files Modified:**
- `app/layout.tsx` - Added skip link, semantic HTML structure
- `components/layout/AdminDashboardLayout.tsx` - Main landmark with id
- `components/layout/DashboardLayout.tsx` - Main landmark with id

#### 2. **Keyboard Navigation** (WCAG 2.1.1, 2.4.7)
- ✅ Consistent focus-visible rings across all interactive elements
- ✅ All interactive elements are `<button>` or `<a>` (no div onClick)
- ✅ `type="button"` on all non-submit buttons
- ✅ Logical tab order matches visual order
- ✅ Focus traps in modals with Escape key support
- ✅ Mobile menu overlays support Escape key

**Files Modified:**
- `components/ui/button.tsx` - Enhanced focus states, default type="button"
- `components/ui/input.tsx` - Focus-visible ring utilities
- `components/layout/*` - Mobile menu keyboard support
- `components/documents/StartingNumberModal.tsx` - Focus trap & Escape handler

#### 3. **Forms & Validation** (WCAG 3.3.1, 3.3.2, 3.3.3, 4.1.3)
- ✅ Every input has visible `<label htmlFor="...">`
- ✅ Required fields marked with `required` attribute + visual indicator (*)
- ✅ Error messages use `aria-describedby` + unique ids
- ✅ Invalid fields have `aria-invalid="true"`
- ✅ Error messages have `role="alert"` for screen reader announcements
- ✅ Helper text provided for format requirements
- ✅ Password visibility toggle with proper ARIA labels

**Files Modified:**
- `components/registration/step-personal-details.tsx` - Full ARIA implementation
- Form pattern established for all future forms

**Example Pattern:**
```tsx
<label htmlFor="email" className="ui-label">
  כתובת אימייל <span className="text-ui-danger" aria-label="שדה חובה">*</span>
</label>
<input
  id="email"
  type="email"
  required
  aria-required="true"
  aria-invalid={!!errors.email}
  aria-describedby={errors.email ? "email-error" : "email-hint"}
  className={errors.email ? "ui-input-error text-left" : "ui-input text-left"}
  dir="ltr"
/>
{!errors.email && (
  <p id="email-hint" className="text-xs text-ui-text-muted mt-1">
    נשתמש בכתובת זו להתחברות למערכת
  </p>
)}
{errors.email && (
  <p id="email-error" className="text-sm text-ui-danger" role="alert">
    {errors.email}
  </p>
)}
```

#### 4. **Navigation Components** (WCAG 2.4.8, 4.1.2)
- ✅ Nav landmarks have descriptive `aria-label`
- ✅ Current page marked with `aria-current="page"` on links
- ✅ Mobile menu buttons have `aria-expanded` and `aria-controls`
- ✅ Close buttons have descriptive `aria-label` in Hebrew

**Files Modified:**
- `components/layout/AdminDashboardLayout.tsx` - ARIA labels on nav
- `components/layout/DashboardLayout.tsx` - ARIA labels on nav

#### 5. **Stepper / Multi-step Flows** (WCAG 1.3.1, 2.4.8)
- ✅ Wrapped in `<nav aria-label="התקדמות ההרשמה">`
- ✅ Current step marked with `aria-current="step"`
- ✅ Step buttons have descriptive labels including status
- ✅ Clickable steps (backward navigation) have proper focus states
- ✅ Visual labels duplicated in aria-label for screen readers

**Files Modified:**
- `components/registration/step-progress.tsx` - Full accessibility implementation

#### 6. **Modals & Dialogs** (WCAG 2.1.2, 4.1.2)
- ✅ `role="dialog"` and `aria-modal="true"`
- ✅ `aria-labelledby` references modal title
- ✅ `aria-describedby` references modal description
- ✅ Focus moves into modal on open
- ✅ Escape key closes modal
- ✅ Body scroll prevented when modal open
- ✅ Close button has descriptive aria-label

**Files Modified:**
- `components/documents/StartingNumberModal.tsx` - Complete dialog pattern

#### 7. **Dynamic Content** (WCAG 4.1.3)
- ✅ Form errors use `role="alert"` for immediate announcement
- ✅ Loading states use `aria-busy="true"`
- ✅ Live regions for previews (`aria-live="polite"`)
- ✅ Critical errors use `aria-live="assertive"`
- ✅ Spinner icons marked `aria-hidden="true"`

**Pattern Examples:**
```tsx
{/* Error announcement */}
<div className="ui-alert-danger" role="alert" aria-live="assertive">
  {error}
</div>

{/* Loading button */}
<button aria-busy={loading}>
  {loading ? (
    <>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      בודק...
    </>
  ) : "המשך"}
</button>

{/* Live preview */}
<div aria-live="polite">
  תצוגה מקדימה: {startingNumber}, {startingNumber + 1}...
</div>
```

#### 8. **Color & Contrast** (WCAG 1.4.3, 1.4.11)
- ✅ Focus rings use high contrast (blue-600 = #2563eb, ratio 4.5:1+)
- ✅ Error text uses red with sufficient contrast
- ✅ Button states include hover, active, disabled with clear visual differences
- ✅ Never rely on color alone (errors include text + icon)
- ✅ High contrast mode support in CSS

**CSS Enhancements:**
```css
/* High contrast mode support */
@media (prefers-contrast: high) {
  .ui-button { border-width: 3px; }
  .ui-input { border-width: 2px; }
}
```

#### 9. **RTL & Mixed Content** (WCAG 1.3.2)
- ✅ Global `dir="rtl"` on html element
- ✅ LTR content (emails, URLs) use `dir="ltr"` inline
- ✅ Number inputs use `dir="ltr"` for proper display
- ✅ Hebrew UI text properly aligned

**Pattern:**
```tsx
<input
  type="email"
  dir="ltr"  /* Force LTR for email addresses */
  className="ui-input text-left"
/>
```

#### 10. **Reduced Motion** (WCAG 2.3.3)
- ✅ `prefers-reduced-motion` media query support
- ✅ All animations disabled or reduced to minimal duration

**CSS:**
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 🎯 Testing Checklist

### Keyboard Navigation
- [ ] Tab through entire registration flow
- [ ] Verify focus visible on all interactive elements
- [ ] Test skip link (Tab on page load → Enter → focus moves to main)
- [ ] Navigate mobile menu with keyboard (Open → Tab → Close with Escape)
- [ ] Modal: Open → Tab trapped inside → Escape closes

### Screen Reader (VoiceOver / NVDA)
- [ ] Page title announced correctly
- [ ] Skip link announced and functional
- [ ] All form labels read correctly
- [ ] Required fields announced
- [ ] Error messages announced immediately
- [ ] Navigation landmarks identified
- [ ] Current page/step announced
- [ ] Button states (pressed, expanded) announced
- [ ] Loading states announced

### Visual Testing
- [ ] Zoom to 200% - no horizontal scroll (except data tables)
- [ ] Zoom to 400% - content reflows acceptably
- [ ] High contrast mode - borders/focus visible
- [ ] Dark mode - sufficient contrast maintained

### Automated Testing
- [ ] Lighthouse Accessibility score ≥ 95
- [ ] axe DevTools - 0 critical/serious issues
- [ ] WAVE browser extension - no errors

---

## 📝 Code Standards

### Focus States
**Required on all interactive elements:**
```tsx
className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
```

### Button Types
**Always specify type:**
```tsx
<button type="button">  {/* Non-submit */}
<button type="submit">  {/* Form submit */}
```

### Form Fields
**Minimum requirements:**
```tsx
<label htmlFor="fieldId">
  Label Text {isRequired && <span aria-label="שדה חובה">*</span>}
</label>
<input
  id="fieldId"
  type="..."
  required={isRequired}
  aria-required={isRequired}
  aria-invalid={!!error}
  aria-describedby={error ? "fieldId-error" : undefined}
/>
{error && (
  <p id="fieldId-error" role="alert">
    {error}
  </p>
)}
```

### Icons
**Decorative icons:**
```tsx
<Icon className="..." aria-hidden="true" />
```

**Meaningful icons (no text):**
```tsx
<button aria-label="סגור">
  <X className="h-5 w-5" aria-hidden="true" />
</button>
```

---

## 🔧 Quick Reference

| Element | ARIA Requirement | Example |
|---------|------------------|---------|
| Skip Link | href="#main-content" | `<a href="#main-content" className="sr-only focus:not-sr-only">דלג לתוכן</a>` |
| Main Content | id="main-content" | `<main id="main-content">` |
| Navigation | aria-label | `<nav aria-label="ניווט ראשי">` |
| Current Page | aria-current="page" | `<a aria-current="page">` |
| Current Step | aria-current="step" | `<button aria-current="step">` |
| Modal | role="dialog" aria-modal | `<div role="dialog" aria-modal="true" aria-labelledby="...">` |
| Error | role="alert" | `<p role="alert">{error}</p>` |
| Live Region | aria-live="polite/assertive" | `<div aria-live="polite">` |
| Required Field | required aria-required | `<input required aria-required="true">` |
| Invalid Field | aria-invalid | `<input aria-invalid={!!error}>` |
| Field Error | aria-describedby | `<input aria-describedby="field-error">` |
| Loading Button | aria-busy | `<button aria-busy={loading}>` |
| Toggle Button | aria-pressed | `<button aria-pressed={isPressed}>` |
| Expandable | aria-expanded aria-controls | `<button aria-expanded={open} aria-controls="menu">` |

---

## ⚠️ Known Limitations & Follow-ups

### Future Enhancements
1. **Dropdown Components** - Review all custom select/combobox components for proper aria-haspopup, aria-autocomplete patterns
2. **Data Tables** - Add table headers, caption, scope attributes when implemented
3. **Date Pickers** - Ensure keyboard navigation (arrow keys) in calendar widgets
4. **File Uploads** - Add aria-describedby for accepted formats, size limits
5. **Rich Text Editors** - ARIA toolbar pattern if implemented

### Recommended Tools
- **Chrome DevTools** - Lighthouse Accessibility audit
- **axe DevTools** - Browser extension for automated testing
- **WAVE** - Web accessibility evaluation tool
- **VoiceOver (macOS)** - `Cmd+F5` to enable
- **NVDA (Windows)** - Free screen reader

### Browser Testing
- ✅ Safari (macOS) - VoiceOver native support
- ✅ Chrome (macOS/Windows) - axe/Lighthouse
- ✅ Firefox (Windows) - NVDA recommended
- ⚠️ Mobile Safari/Chrome - Touch target size validation pending

---

## 📚 Resources

- [Israeli Standard IS 5568](https://www.gov.il/he/departments/policies/sar_ichud_2014)
- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [MDN ARIA Documentation](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA)
- [WebAIM Screen Reader Testing](https://webaim.org/articles/screenreader_testing/)
- [A11y Project Checklist](https://www.a11yproject.com/checklist/)

---

## 🎓 Developer Training Notes

### Common Mistakes to Avoid
❌ **Never:**
- Remove focus outlines without replacement
- Use `<div onClick>` instead of `<button>`
- Forget `htmlFor` on labels
- Use placeholder as label
- Rely on color alone for meaning
- Use `tabindex` > 0

✅ **Always:**
- Test with keyboard only
- Provide text alternatives
- Use semantic HTML first
- Add ARIA only when semantic HTML insufficient
- Test with screen reader
- Validate contrast ratios

---

**Maintainer:** Development Team  
**Review Cycle:** Quarterly (or per major feature release)  
**Contact:** accessibility@company.com (placeholder)
