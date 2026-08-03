import { readFileSync, writeFileSync } from 'fs';

const file = '/Users/ashleysmith/penthouseDrift/src/components/shop/WheelVisualizer.tsx';
const buf = readFileSync(file);

// Build a new buffer with only valid UTF-8 sequences
const out = [];
let i = 0;
while (i < buf.length) {
  const b = buf[i];
  if (b <= 0x7F) {
    out.push(b);
    i++;
  } else if (b >= 0xC2 && b <= 0xDF && i+1 < buf.length && (buf[i+1] & 0xC0) === 0x80) {
    out.push(b, buf[i+1]);
    i += 2;
  } else if (b >= 0xE0 && b <= 0xEF && i+2 < buf.length && (buf[i+1] & 0xC0) === 0x80 && (buf[i+2] & 0xC0) === 0x80) {
    out.push(b, buf[i+1], buf[i+2]);
    i += 3;
  } else if (b >= 0xF0 && b <= 0xF4 && i+3 < buf.length && (buf[i+1] & 0xC0) === 0x80 && (buf[i+2] & 0xC0) === 0x80 && (buf[i+3] & 0xC0) === 0x80) {
    out.push(b, buf[i+1], buf[i+2], buf[i+3]);
    i += 4;
  } else {
    // Skip invalid byte
    i++;
  }
}

const clean = Buffer.from(out);
writeFileSync(file, clean);
console.log('Done! Stripped', buf.length - clean.length, 'bytes');
