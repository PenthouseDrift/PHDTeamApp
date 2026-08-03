import { readFileSync, writeFileSync } from 'fs';

const file = '/Users/ashleysmith/penthouseDrift/src/components/shop/WheelVisualizer.tsx';
let src = readFileSync(file, 'utf8');

// Fix merged lines - anywhere a comment runs into actual code
// Pattern: comment text followed immediately by const/let/var/function/return etc.
src = src.replace(
  /(\/\/ [^\n]+?)-{3,}\s+(const |let |var |function |return |if |for |while )/g,
  '$1\n\n  $2'
);

// Fix the specific one we saw
src = src.replace(
  /─Crop handlers \(circular selection\) -+\s*(const handleCropPointerDown)/,
  '\n\n  // ─────────────────────────────────────────────────────────────────────────\n  // Crop handlers (circular selection)\n  // ─────────────────────────────────────────────────────────────────────────\n\n  $1'
);

// Fix PIPELINE OVERVIEW comment lines similarly
src = src.replace(
  /─Composite image:/,
  '\n    // Composite image:'
);
src = src.replace(
  /─Mask image:/,
  '\n    // Mask image:'
);
src = src.replace(
  /─\(white = AI touches/,
  '\n    // (white = AI touches'
);

writeFileSync(file, src, 'utf8');
console.log('Done!');
