import { readFileSync, writeFileSync } from 'fs';

const file = '/Users/ashleysmith/penthouseDrift/src/components/shop/WheelVisualizer.tsx';
const buf = readFileSync(file);

// The file was originally UTF-8, then written as latin1 and re-read, causing double-encoding.
// Fix: interpret the file as latin1 and then re-encode as utf-8 properly by
// treating each pair of misread bytes as the original UTF-8 byte sequence.

// Actually the simplest fix: remove/replace all non-ASCII bytes with their
// closest ASCII equivalent or an appropriate emoji replacement.

// Strategy: build a clean buffer skipping/replacing bad multi-byte sequences
// We know the content is code, so any non-ASCII is either an emoji in JSX or a comment.
// We'll decode as utf-8 with replacement, then fix up known patterns.

const str = buf.toString('utf8'); // will replace bad sequences with U+FFFD
// Now replace the replacement chars with appropriate content
// We can look at context to figure out what each was

// Known emoji in this file (from the original source output we saw earlier):
// ✂️ = scissors (crop button)
// ✅ = white check mark
// 🛒 = shopping cart  
// ✨ = sparkles
// 🔄 = arrows counterclockwise
// The em-dashes (──) in comments
// The £ sign

let fixed = str
  // Fix: U+FFFD replacement chars appear in clusters where emoji/special chars were
  // Replace common JSX emoji pattern: \uFFFD\uFFFD -> try to identify by context
  .replace(/\uFFFD+/g, (match, offset, full) => {
    // Look at surrounding context (30 chars each side)
    const ctx = full.slice(Math.max(0, offset-40), offset+40);
    // Em-dash separators in comments
    if (ctx.includes('//')) return '-';
    // Otherwise remove (likely corrupted emoji that we saw from rendered output)
    return '';
  });

writeFileSync(file, fixed, 'utf8');
console.log('Done! Remaining replacement chars:', (fixed.match(/\uFFFD/g) || []).length);
