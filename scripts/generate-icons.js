const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const LOGO_PATH = path.join(__dirname, '..', 'public', 'logo.png');
const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');
const BG_COLOR = { r: 26, g: 26, b: 46, alpha: 1 }; // #1a1a2e

fs.mkdirSync(ICONS_DIR, { recursive: true });

async function generateIcon(size, padding, outputName, background = null) {
  const logoSize = Math.floor(size * (1 - padding * 2));

  // Resize logo to fit within the icon with padding
  const resizedLogo = await sharp(LOGO_PATH)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // Regular icons stay transparent so browser light/dark surfaces can show through.
  // Maskable icons keep an opaque brand background because launchers crop them.
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: background || { r: 0, g: 0, b: 0, alpha: 0 },
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

  // Stable launcher icons keep the branded dark background across platforms.
  await generateIcon(192, 0.15, 'icon-192.png', BG_COLOR);
  await generateIcon(512, 0.15, 'icon-512.png', BG_COLOR);

  // In-app navigation can select a background that matches the active theme.
  await generateIcon(192, 0.15, 'icon-light-192.png', { r: 255, g: 255, b: 255, alpha: 1 });
  await generateIcon(192, 0.15, 'icon-dark-192.png', BG_COLOR);

  // Maskable icons - opaque background and extra padding for launcher cropping
  await generateIcon(192, 0.2, 'icon-maskable-192.png', BG_COLOR);
  await generateIcon(512, 0.2, 'icon-maskable-512.png', BG_COLOR);

  console.log('\nDone! Icons saved to public/icons/');
}

main().catch(console.error);
