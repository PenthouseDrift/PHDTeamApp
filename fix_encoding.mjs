import { readFileSync, writeFileSync } from 'fs';

const file = '/Users/ashleysmith/penthouseDrift/src/components/shop/WheelVisualizer.tsx';
const buf = readFileSync(file);

// Decode as latin1 (every byte maps 1:1 to a unicode codepoint)
let str = buf.toString('latin1');

// Replace Windows-1252 curly quotes/dashes/etc with ASCII equivalents
str = str
  .replace(/\x93/g, '"')
  .replace(/\x94/g, '"')
  .replace(/\x91/g, "'")
  .replace(/\x92/g, "'")
  .replace(/\x96/g, '-')
  .replace(/\x97/g, '--')
  .replace(/\x85/g, '...')
  .replace(/\x80/g, '')
  .replace(/\x9f/g, '')
  .replace(/\x9c/g, '')
  .replace(/\x86/g, '')
  .replace(/\x87/g, '')
  .replace(/\xbf/g, '')
  .replace(/\xbd/g, '');

writeFileSync(file, str, 'utf8');
console.log('Done! New length:', str.length);
