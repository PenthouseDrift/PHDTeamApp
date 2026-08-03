import { readFileSync, writeFileSync } from 'fs';

const file = '/Users/ashleysmith/penthouseDrift/src/components/shop/WheelVisualizer.tsx';
let src = readFileSync(file, 'utf8');

// Fix remaining garbled sequences
src = src
  // Â£ -> £
  .replace(/Â£/g, '£')
  // ð"¸ (garbled 📸 camera emoji) -> 📸
  .replace(/ð[^\x00-\x7F]*/g, (m) => {
    // Just remove/replace garbled emoji with text equivalents based on context
    return '';
  })
  // ï¸ (garbled ✂️ scissors) -> ✂
  .replace(/ï[^\x00-\x7F]*/g, '')
  // Any remaining non-ASCII non-UTF8 looking chars
  ;

// Now fix specific lines we know about:
src = src
  // Line 674 button: "ï¸ Crop" -> "✂ Crop" 
  .replace(/\s*Crop\s*&amp; Return to Car/, '✅ Crop &amp; Return to Car')
  // Remove any ï\uFFFD or similar sequences
  .replace(/[\uFFFD]/g, '');

writeFileSync(file, src, 'utf8');
console.log('Done!');
