const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const LOGO_PATH = path.join(__dirname, '..', 'public', 'logo.png');
const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');
const BG_COLOR = { r: 26, g: 26, b: 46, alpha: 1 }; // #1a1a2e

fs.mkdirSync(ICONS_DIR, { recursive: true });

async function generateIcon(size, padding, outputName) {
  const logoSize = Math.floor(size * (1 - padding * 2));

  // Resize logo to fit within the icon with padding
  const resizedLogo = await sharp(LOGO_PATH)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // Create background and composite logo centered
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG_COLOR,
    },
  })
    .composite([
      {
        input: resizedLogo,
        gravity: 'center',
      },
    ])
    .png()
    .toFile(path.join(ICONS_DIR, outputName));

  console.log(`✓ ${outputName} (${size}x${size})`);
}

async function main() {
  console.log('Generating PWA icons from logo...\n');

  // Regular icons - logo takes up ~70% of the space
  await generateIcon(192, 0.15, 'icon-192.png');
  await generateIcon(512, 0.15, 'icon-512.png');

  // Maskable icons - need more padding (safe zone is inner 80%, so 10% padding each side)
  await generateIcon(192, 0.2, 'icon-maskable-192.png');
  await generateIcon(512, 0.2, 'icon-maskable-512.png');

  console.log('\nDone! Icons saved to public/icons/');
}

main().catch(console.error);
