import { readFileSync, writeFileSync } from 'fs';

const file = '/Users/ashleysmith/penthouseDrift/src/components/shop/WheelVisualizer.tsx';
let src = readFileSync(file, 'utf8');

// Fix garbled characters left over from encoding corruption:
// â" -> — (em dash, but in code context safer to use -)
// â' -> → (right arrow)
// â... -> ✅ (check mark)
// â -> (junk, remove or replace with -)
// Ã¢ -> â (double-encoded, but let's just clean to ASCII)

// Strategy: replace all occurrences of garbled multi-byte sequences
// These appear as: â followed by various chars (â", â', â...)

src = src
  // em dash variants: â" â€" 
  .replace(/â[""]/g, '-')
  .replace(/â€"/g, '-')
  // right arrow: â' â†'
  .replace(/â[''→]/g, '->')
  .replace(/â€™/g, "'")
  // Isolated â followed by non-ASCII junk
  .replace(/â[^a-zA-Z0-9\s<>="'`{}()\[\].,;:!?@#$%^&*+\-_\/\\|~]/g, '')
  // Leftover isolated â
  .replace(/â/g, '')
  // Ã‚Â£ -> £ (double-encoded pound sign)
  .replace(/Ã‚Â£/g, '£')
  // ÃÂ£ -> £  
  .replace(/ÃÂ£/g, '£')
  // Any remaining Ã sequences
  .replace(/Ã[^a-zA-Z]/g, '')
  .replace(/Ã/g, '');

writeFileSync(file, src, 'utf8');
console.log('Done!');
