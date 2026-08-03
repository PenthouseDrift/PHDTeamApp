import { readFileSync, writeFileSync } from 'fs';

const file = '/Users/ashleysmith/penthouseDrift/src/components/shop/WheelVisualizer.tsx';
let src = readFileSync(file, 'utf8');

// Fix line 491: garbled emoji inside div (was 📸 camera)
src = src.replace(
  /flex items-center justify-center text-4xl shadow-md border border-zinc-700\/50"\>"[^<]*<\/div>/,
  'flex items-center justify-center text-4xl shadow-md border border-zinc-700/50">📸</div>'
);

// Fix line 690: garbled emoji before "Regenerate AI Photo" (was 🔄)  
src = src.replace(
  /"[^"]*\s*Regenerate AI Photo/,
  '🔄 Regenerate AI Photo'
);

writeFileSync(file, src, 'utf8');
console.log('Done!');
