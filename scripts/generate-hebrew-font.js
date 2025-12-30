const fs = require('fs');
const path = require('path');

const fontPath = path.join(__dirname, '../public/AssistantRegular.ttf');
const outputPath = path.join(__dirname, '../lib/hebrew-font-data.ts');

console.log('Reading font file...');
const fontBuffer = fs.readFileSync(fontPath);
const fontBase64 = fontBuffer.toString('base64');

console.log('Font size:', fontBuffer.length, 'bytes');
console.log('Base64 size:', fontBase64.length, 'characters');

const output = `/**
 * Hebrew Font Data - Assistant Regular
 * Auto-generated from AssistantRegular.ttf
 * License: SIL Open Font License 1.1
 * DO NOT EDIT MANUALLY
 */

export const assistantFontBase64 = "${fontBase64}";

export const hebrewFontConfig = {
  fontName: "Assistant",
  fontStyle: "normal",
  fontBase64: assistantFontBase64,
};
`;

fs.writeFileSync(outputPath, output);
console.log('✅ Font data written to:', outputPath);
console.log('File size:', fs.statSync(outputPath).size, 'bytes');
