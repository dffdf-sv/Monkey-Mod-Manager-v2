import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = process.cwd();
const source = path.join(root, 'public', 'image.jpg');
const outputDir = path.join(root, 'build');
await fs.mkdir(outputDir, { recursive: true });

const png = await sharp(source)
  .resize(512, 512, {
    fit: 'contain',
    background: { r: 11, g: 14, b: 18, alpha: 1 }
  })
  .png()
  .toBuffer();

await fs.writeFile(path.join(outputDir, 'icon.png'), png);
const icoPng = await sharp(png).resize(256, 256).png().toBuffer();
await fs.writeFile(path.join(outputDir, 'icon.ico'), await pngToIco([icoPng]));
console.log('Generated build/icon.png and build/icon.ico from public/image.jpg');
