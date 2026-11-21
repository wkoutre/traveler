// Renders extension/icons/*.png from extension/icons/logo.svg with the locally installed Chrome.
// Run: cd e2e && node make-icons.mjs
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../extension/icons/', import.meta.url));
const logo = readFileSync(`${out}logo.svg`, 'utf8');
const svg = (size) => logo.replace('width="512" height="512"', `width="${size}" height="${size}"`);

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0;background:transparent">${svg(size)}</body>`);
  await page.screenshot({ path: `${out}${size}.png`, omitBackground: true });
}
await browser.close();
