#!/usr/bin/env node

/**
 * Create a minimal Hebrew font subset for jsPDF
 * This reduces the font size from ~300KB to ~50KB
 * 
 * Required characters:
 * - Hebrew letters (א-ת)
 * - Numbers (0-9)
 * - Common punctuation (.,;:!?-()₪$€)
 * - Latin letters (A-Z, a-z) for company names
 */

const fs = require('fs');
const path = require('path');

console.log('⚠️  Font subsetting requires fonttools (pyftsubset)');
console.log('Install with: pip install fonttools brotli');
console.log('');
console.log('To create a Hebrew subset, run:');
console.log('');
console.log('pyftsubset public/AssistantRegular.ttf \\');
console.log('  --output-file=public/AssistantHebrew.ttf \\');
console.log('  --flavor=woff \\');
console.log('  --unicodes="U+0020-007E,U+0590-05FF,U+20AA" \\');
console.log('  --layout-features="*" \\');
console.log('  --no-hinting');
console.log('');
console.log('This will create a smaller font with:');
console.log('- Hebrew letters (U+0590-05FF)');
console.log('- Basic Latin (U+0020-007E)');
console.log('- Shekel symbol (U+20AA)');
console.log('');
console.log('Alternative: Download a pre-subset Hebrew font like:');
console.log('- Alef (https://fonts.google.com/specimen/Alef) - ~50KB');
console.log('- Rubik (https://fonts.google.com/specimen/Rubik) - ~60KB');
console.log('- Heebo (https://fonts.google.com/specimen/Heebo) - ~70KB');
