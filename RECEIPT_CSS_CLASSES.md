# Receipt Preview CSS Class Structure

## Overview
The receipt preview HTML has been enhanced with semantic CSS classes for full design system control from the admin panel.

## Class Naming Convention
All classes follow the pattern: `receipt-{section}-{element}`

## Complete Class Hierarchy

### Document Container
- `receipt-document` - Main A4 container (#receipt-preview)

### Header Section
- `receipt-header` - Header wrapper (2-column grid)
- `receipt-business-section` - Left column (business/creator)
- `receipt-title` - Title wrapper ("קבלה + number")
  - `receipt-title-text` - "קבלה" text
  - `receipt-number` - Receipt number
- `receipt-logo` - Company logo image

### Business Details
- `receipt-business-details` - Business info container
  - `receipt-business-name` - Company name
  - `receipt-business-type` - Business type (עוסק מורשה, etc.)
  - `receipt-business-address` - Address
  - `receipt-business-phone` - Phone number
  - `receipt-business-email` - Email
  - `receipt-business-website` - Website URL

### Customer Section
- `receipt-customer-section` - Right column (customer details)
- `receipt-document-date` - Document date wrapper
  - `receipt-date-label` - "תאריך:" label
  - `receipt-date-value` - Date value
- `receipt-customer-label` - "לכבוד:" label
- `receipt-customer-name` - Customer name
- `receipt-customer-phone` - Customer phone wrapper
  - `receipt-customer-phone-label` - "טלפון:" label
  - `receipt-customer-phone-value` - Phone number
- `receipt-customer-email` - Customer email
- `receipt-customer-address` - Customer address wrapper
  - `receipt-customer-address-street` - Street address
  - `receipt-customer-address-city` - City
  - `receipt-customer-address-zip` - Zip code

### Description Section
- `receipt-description-section` - Description container
  - `receipt-description-label` - "תיאור:" label
  - `receipt-description-text` - Description text

### Payments Section
- `receipt-payments-section` - Payments container
- `receipt-payments-title` - "אמצעי תשלום:" title
- `receipt-payments-empty` - Empty state message
- `receipt-payments-list` - Payments list wrapper
  - `receipt-payment-item` - Individual payment row
    - `receipt-payment-method` - Payment method name
    - `receipt-payment-separator` - "•" separator
    - `receipt-payment-amount` - Payment amount
    - `receipt-payment-bank` - Bank details

### Total Section
- `receipt-total-section` - Total box container
  - `receipt-total-label` - "סה״כ לתשלום:" label
  - `receipt-total-amount` - Total amount value

### Notes Sections
- `receipt-notes-internal` - Internal notes container
  - `receipt-notes-internal-label` - "הערות פנימיות:" label
  - `receipt-notes-internal-text` - Internal notes text
- `receipt-notes-customer` - Customer notes container
  - `receipt-notes-customer-label` - "הערות ללקוח:" label
  - `receipt-notes-customer-text` - Customer notes text

### Footer Section
- `receipt-footer` - Footer container
- `receipt-footer-meta` - Metadata grid (3 columns)
  - `receipt-footer-meta-item` - Individual meta item
    - `receipt-footer-number` - Receipt number field
    - `receipt-footer-issue-date` - Issue date field
    - `receipt-footer-status` - Status field
  - `receipt-footer-meta-label` - Field label
  - `receipt-footer-meta-value` - Field value
- `receipt-footer-signature` - Signature/copyright area
  - `receipt-footer-signature-line1` - First signature line
  - `receipt-footer-signature-line2` - Second signature line (timestamp)
  - `receipt-footer-copyright` - Copyright notice

## Usage in Admin Custom CSS

### Example 1: Change Logo Size
```css
.receipt-logo {
  width: 150px !important;
  height: 150px !important;
  border-radius: 8px;
}
```

### Example 2: Customize Header
```css
.receipt-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white !important;
  padding: 32px !important;
  border-radius: 16px 16px 0 0;
}

.receipt-title-text {
  font-size: 36px !important;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
}
```

### Example 3: Style Total Box
```css
.receipt-total-section {
  background: #4f46e5 !important;
  color: white !important;
  padding: 24px !important;
  border: none !important;
  box-shadow: 0 10px 25px rgba(79, 70, 229, 0.3);
}

.receipt-total-label,
.receipt-total-amount {
  color: white !important;
}
```

### Example 4: Custom Payment Styling
```css
.receipt-payments-section {
  background: #f8fafc;
  border: 2px dashed #cbd5e1;
}

.receipt-payment-item {
  background: white;
  padding: 12px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.receipt-payment-method {
  color: #6366f1 !important;
  font-weight: 700 !important;
}
```

### Example 5: Professional Footer
```css
.receipt-footer {
  background: #1e293b;
  color: #cbd5e1 !important;
  padding: 24px !important;
  border-radius: 0 0 16px 16px;
  margin-left: -32px;
  margin-right: -32px;
  margin-bottom: -32px;
}

.receipt-footer-meta-label {
  color: #94a3b8 !important;
}

.receipt-footer-meta-value {
  color: white !important;
}
```

## Integration with styleSettings

Classes work alongside inline styles from `styleSettings`. Use `!important` in custom CSS to override inline styles when needed.

### Priority Order:
1. Custom CSS (highest priority with `!important`)
2. Inline styles from `styleSettings`
3. Default component styles (lowest priority)

## Best Practices

1. **Use Specific Classes**: Target exact elements (e.g., `.receipt-business-name` instead of `.receipt-business-section div`)
2. **Maintain RTL**: Don't override `direction: rtl` or `text-align: right` for Hebrew text
3. **Test PDF Export**: Ensure custom CSS works with html2pdf.js (avoid complex transforms/animations)
4. **Use HEX Colors**: Stick to HEX format (`#RRGGBB`) for PDF compatibility
5. **Preserve Layout**: Don't break the A4 print layout (210mm × 297mm)

## Notes

- All classes are added to the HTML but don't affect styling by default
- Classes coexist with inline `style` attributes
- Admin can inject custom CSS via `styleSettings.customCss` field
- Classes are semantic and self-documenting for easy maintenance
