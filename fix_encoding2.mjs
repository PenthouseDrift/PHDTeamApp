import { readFileSync, writeFileSync } from 'fs';

const file = '/Users/ashleysmith/penthouseDrift/src/components/shop/WheelVisualizer.tsx';
const buf = readFileSync(file);

// Show context around problem areas
const spots = [1840, 2896, 7188, 9968, 12291, 22645, 25736, 30000, 30655, 32160, 32590, 33014, 34349];
for (const s of spots) {
  const slice = buf.slice(Math.max(0, s-5), s+20);
  const hex = [...slice].map(b => b.toString(16).padStart(2,'0')).join(' ');
  const ascii = [...slice].map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join('');
  console.log(`@${s}: ${hex}  |  ${ascii}`);
}
