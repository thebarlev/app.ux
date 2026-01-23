#!/usr/bin/env node
/**
 * Conflict Marker Removal Script
 * Automatically removes git conflict markers from source files
 */

const fs = require('fs');
const path = require('path');

const conflictMarkerPatterns = {
  head: /^<<<<<<< HEAD\n?/gm,
  separator: /^=======\n?/gm,
  tail: /^>>>>>>> \w+\n?/gm,
};

function removeConflictMarkers(content) {
  // Simple strategy: keep HEAD version (before =======), discard incoming (after =======)
  const lines = content.split('\n');
  const result = [];
  let inConflict = false;
  let inHead = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.match(/^<<<<<<< HEAD$/)) {
      inConflict = true;
      inHead = true;
      continue; // Skip the marker
    }
    
    if (line.match(/^=======$/)) {
      if (inConflict) {
        inHead = false; // Now we're in the incoming changes section
      }
      continue; // Skip the marker
    }
    
    if (line.match(/^>>>>>>> /)) {
      inConflict = false;
      inHead = false;
      continue; // Skip the marker
    }
    
    // Keep line if we're in HEAD section or not in conflict
    if (!inConflict || inHead) {
      result.push(line);
    }
  }
  
  return result.join('\n');
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check if file has conflict markers
    if (content.includes('<<<<<<<') || content.includes('=======') || content.includes('>>>>>>>')) {
      console.log(`🔧 Fixing: ${filePath}`);
      const cleaned = removeConflictMarkers(content);
      fs.writeFileSync(filePath, cleaned, 'utf8');
      return true;
    }
  } catch (err) {
    console.error(`❌ Error processing ${filePath}:`, err.message);
  }
  return false;
}

// Process files passed as arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: node remove-conflicts.js <file1> <file2> ...');
  process.exit(1);
}

let fixedCount = 0;
args.forEach(file => {
  if (processFile(file)) {
    fixedCount++;
  }
});

console.log(`\n✅ Fixed ${fixedCount} file(s)`);
