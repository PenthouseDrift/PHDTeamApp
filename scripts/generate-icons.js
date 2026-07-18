const fs = require('fs');
const path = require('path');

// Minimal valid 1x1 PNG (placeholder)
const minimalPNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const iconsDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });
fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), minimalPNG);
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), minimalPNG);
console.log('Placeholder icons created');
