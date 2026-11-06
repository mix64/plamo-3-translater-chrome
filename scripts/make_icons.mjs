// Renders icons/icon.svg into the PNG sizes manifest.json uses. Usage: npm run icons
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ICONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const svg = fs.readFileSync(path.join(ICONS, 'icon.svg'));
const src = `data:image/svg+xml;base64,${svg.toString('base64')}`;

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:transparent"><img src="${src}" width="${size}" height="${size}" style="display:block"></body>`,
  );
  await page.locator('img').evaluate((img) => img.decode());
  await page.screenshot({ path: path.join(ICONS, `icon${size}.png`), omitBackground: true });
  console.log(`icons/icon${size}.png`);
}
await browser.close();
