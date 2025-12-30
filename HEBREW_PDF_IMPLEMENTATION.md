# Hebrew PDF Support - Implementation Summary

## Problem
PDF files were displaying Hebrew text as gibberish/unreadable characters because jsPDF's built-in fonts (helvetica, courier) don't support Hebrew Unicode characters.

## Solution
Embedded a custom Unicode Hebrew font (Assistant Regular from Google Fonts) directly into the PDF generation library.

## Files Created/Modified

### 1. Font Files
- **public/AssistantRegular.ttf** - Downloaded Hebrew font (297KB)
- **lib/hebrew-font-data.ts** - Base64-encoded font data (387KB)
- **scripts/generate-hebrew-font.js** - Script to convert TTF to base64

### 2. Updated Files
- **lib/pdf-generator.ts**
  - Added `registerHebrewFont()` function
  - Changed all fonts from "courier" to "Assistant"
  - Made `generateReceiptPDF()` async
  - Integrated with text management system
  
- **app/api/receipts/[id]/pdf/route.ts**
  - Added `await` to `generateReceiptPDF()` call

### 3. Documentation
- **HEBREW_FONT_SETUP.md** - Instructions for adding custom fonts
- **lib/hebrew-font.ts** - Template for future font additions

## How It Works

1. **Font Registration**: On first PDF generation, the font is loaded from base64 and registered with jsPDF:
   ```typescript
   doc.addFileToVFS("Assistant.ttf", hebrewFontConfig.fontBase64);
   doc.addFont("Assistant.ttf", "Assistant", "normal");
   ```

2. **Font Usage**: All text rendering uses the Assistant font:
   ```typescript
   doc.setFont("Assistant", "bold");
   doc.text(reverseText(hebrewText), x, y);
   ```

3. **RTL Text Handling**: Hebrew text is still reversed for proper RTL display (jsPDF limitation):
   ```typescript
   const reverseText = (text: string): string => {
     const hasHebrew = /[\u0590-\u05FF]/.test(text);
     if (!hasHebrew) return text;
     return text.split('').reverse().join('');
   };
   ```

## Font Details
- **Name**: Assistant Regular
- **Source**: Google Fonts (OFL 1.1 License)
- **Size**: 297KB (TTF), 396KB (base64)
- **Support**: Hebrew + Latin characters
- **URL**: https://fonts.google.com/specimen/Assistant

## Testing

### Build Status
✅ Build successful (`pnpm build`)

### Next Steps for Testing
1. Navigate to `/dashboard/documents/receipt`
2. Create a new receipt with Hebrew customer name
3. Finalize the receipt
4. Click "הפקה + הקצאת מספר" to generate PDF
5. Download and open the PDF
6. **Verify**: Hebrew text should be readable (not gibberish)

## Text Management Integration

All PDF labels are now loaded from the `system_texts` table:
- `receipt_title` → "קבלה"
- `receipt_to_label` → "לכבוד:"
- `receipt_phone_label` → "טלפון:"
- etc.

Admins can customize these texts via `/admin/texts` page.

## Performance Considerations

- **Font Loading**: Font is registered once per process (cached with `fontRegistered` flag)
- **Base64 Size**: 396KB added to bundle (acceptable for OFL licensed font)
- **PDF Generation**: Async function (doesn't block other operations)

## Alternative Approaches (Not Used)

1. **HTML to PDF (Puppeteer)**: Would work but requires heavy Node.js runtime
2. **Font Subsetting**: Could reduce size but adds complexity
3. **CDN Font Loading**: Not supported by jsPDF

## Troubleshooting

### If text still appears as gibberish:
1. Check that `lib/hebrew-font-data.ts` exists and is not empty
2. Verify the font is registered (check console logs for "[PDF] Hebrew font registered")
3. Ensure all `doc.setFont()` calls use "Assistant" not "courier" or "helvetica"

### If build fails:
1. Check that `hebrew-font-data.ts` is valid TypeScript
2. Run `node scripts/generate-hebrew-font.js` to regenerate the font file

### If PDF file size is too large:
1. Consider using a font subsetter to include only Hebrew + basic Latin
2. Tools: https://everythingfonts.com/subsetter

## Font License

**Assistant Regular**
- License: SIL Open Font License 1.1
- ✅ Commercial use allowed
- ✅ Embedding in PDFs allowed
- ✅ Modification allowed
- ❌ Must include copyright notice

## Future Enhancements

1. **Bold/Italic Support**: Add Assistant-Bold.ttf and Assistant-Italic.ttf
2. **Multiple Fonts**: Support different fonts for different document types
3. **Font Caching**: Store fonts in Redis/CDN for faster loading
4. **BiDi Library**: Use proper BiDirectional text library instead of manual reversal
5. **Font Subsetting**: Automatically subset fonts during build

## Commands Reference

### Generate Font Data
```bash
# Download font
curl -L -o public/AssistantRegular.ttf "https://github.com/google/fonts/raw/main/ofl/assistant/Assistant-Regular.ttf"

# Convert to base64
node scripts/generate-hebrew-font.js
```

### Test PDF Generation
```bash
# Build
pnpm build

# Run dev server
pnpm dev

# Navigate to: http://localhost:3000/dashboard/documents/receipt
```

## Status
✅ **Fully Implemented**  
✅ **Build Successful**  
⏳ **Awaiting User Testing**

---

**Implementation Date**: December 29, 2025  
**Build**: Successful  
**Font**: Assistant Regular (Google Fonts)
