/**
 * Hebrew Font Support for jsPDF
 * 
 * This file contains the base64-encoded Noto Sans Hebrew Regular font
 * which will be embedded into PDFs to properly display Hebrew text.
 * 
 * Font: Noto Sans Hebrew Regular
 * License: SIL Open Font License 1.1
 * Source: Google Fonts
 */

// Note: In production, you should download the actual font file and convert it to base64
// For now, we'll provide instructions to add your own font

/**
 * To add a custom Hebrew font:
 * 
 * 1. Download a Hebrew TTF font (e.g., Assistant, Noto Sans Hebrew, Open Sans Hebrew)
 * 2. Convert to base64 using one of these methods:
 *    
 *    Option A - Online tool:
 *    - Go to: https://products.aspose.app/font/base64
 *    - Upload your .ttf file
 *    - Copy the base64 string
 *    
 *    Option B - Command line:
 *    - Run: base64 -i YourFont.ttf -o font-base64.txt
 *    - Copy the contents
 *    
 *    Option C - Node.js:
 *    - const fs = require('fs');
 *    - const font = fs.readFileSync('YourFont.ttf', 'base64');
 *    - console.log(font);
 * 
 * 3. Paste the base64 string below
 * 4. Update the fontName to match your font
 */

export const hebrewFontConfig = {
  fontName: "AssistantRegular",
  fontStyle: "normal",
  // Replace this with your actual font base64 string
  // This is a placeholder - you MUST replace it with a real font
  fontBase64: "",
};

/**
 * Alternative: Use a smaller subset font
 * If the base64 string is too large, you can use a font subsetter like:
 * - https://everythingfonts.com/subsetter
 * - Include only Hebrew Unicode range: U+0590-05FF
 * - Include basic Latin for numbers: U+0020-007F
 * This will significantly reduce file size
 */
