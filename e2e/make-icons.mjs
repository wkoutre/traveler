// Renders extension/icons/*.png from the SVG below with the locally installed Chrome.
// Run: cd e2e && node make-icons.mjs
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../extension/icons/', import.meta.url));
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="30" fill="#171717"/>
  <g fill="none" stroke="#ffffff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">
    <path d="M40 34v60M40 68l44-34M58 56l28 38"/>
  </g>
</svg>`;

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
