# Adding Hebrew Font Support to PDF

The current PDF generation shows gibberish because jsPDF's built-in fonts don't support Hebrew characters.

## Solution: Embed a Custom Hebrew Font

### Option 1: Quick Fix with Public CDN Font (Recommended for Testing)

We'll use a publicly available Hebrew font and embed it in the PDF.

**Steps:**

1. Download a Hebrew font (e.g., Assistant, Noto Sans Hebrew)
   - Assistant: https://fonts.google.com/specimen/Assistant
   - Noto Sans Hebrew: https://fonts.google.com/noto/specimen/Noto+Sans+Hebrew

2. Convert TTF to Base64:
   
   **Method A - Online Tool:**
   ```
   Go to: https://products.aspose.app/font/base64
   Upload your .ttf file
   Copy the base64 output
   ```

   **Method B - Command Line (macOS/Linux):**
   ```bash
   base64 -i AssistantRegular.ttf > font-base64.txt
   ```

   **Method C - Node.js:**
   ```javascript
   const fs = require('fs');
   const font = fs.readFileSync('AssistantRegular.ttf', {encoding: 'base64'});
   console.log(font);
   ```

3. Paste the base64 string into `lib/hebrew-font.ts` in the `fontBase64` field

### Option 2: Use Font Subsetter (Smaller File Size)

If the base64 font is too large (>500KB), use a font subsetter:

1. Go to https://everythingfonts.com/subsetter
2. Upload your TTF font
3. Select character ranges:
   - Hebrew: U+0590-05FF
   - Basic Latin (numbers/punctuation): U+0020-007F
   - Latin Extended (if needed): U+00A0-00FF
4. Download the subset font
5. Convert to base64 (see methods above)

### Option 3: Download Pre-Converted Font

For Assistant Regular font, you can use this command:

```bash
# Download font from Google Fonts
curl -o AssistantRegular.ttf "https://github.com/google/fonts/raw/main/ofl/assistant/Assistant-Regular.ttf"

# Convert to base64
base64 -i AssistantRegular.ttf > assistant-font-base64.txt

# The output will be a long base64 string
```

Then copy the contents of `assistant-font-base64.txt` into the `fontBase64` field in `lib/hebrew-font.ts`.

### After Adding the Font

The PDF generator is already updated to use the Hebrew font. Once you add the base64 font string, PDFs will display Hebrew text correctly.

**Test it:**
1. Add the font base64 to `lib/hebrew-font.ts`
2. Generate a receipt PDF
3. Hebrew text should display properly!

## Alternative: HTML to PDF Approach

If embedding fonts is too complex, you can use an HTML-to-PDF library like Puppeteer:

1. Install: `pnpm add puppeteer`
2. Create HTML template with `<meta charset="utf-8">`
3. Use `@font-face` to load Hebrew font
4. Convert HTML → PDF with Puppeteer

This approach handles fonts automatically but requires Node.js runtime.

## Troubleshooting

**Problem:** Still seeing gibberish
- ✅ Check that `fontBase64` is not empty
- ✅ Verify the font file supports Hebrew (download and test locally first)
- ✅ Make sure the base64 string is complete (no truncation)

**Problem:** PDF file size is huge
- ✅ Use a font subsetter to include only Hebrew + Latin characters
- ✅ Use WOFF2 format (smaller than TTF)

**Problem:** Characters still backwards
- ✅ This is expected - jsPDF doesn't support RTL
- ✅ The `reverseText()` function handles this

## Font Licenses

Make sure you have the right to embed the font in PDFs:
- **Open Font License (OFL)** - ✅ OK (Assistant, Noto Sans Hebrew)
- **Apache License** - ✅ OK
- **GPL** - ⚠️ Check terms
- **Commercial fonts** - ❌ May need license

Most Google Fonts are OFL licensed and safe to embed.
