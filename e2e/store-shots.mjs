// Renders the Chrome Web Store screenshots and promo tile into store-assets/.
// Uses a throwaway profile filled with demo tabs and bookmarks, so no real
// browsing data ever appears in an image.
//
//   cd e2e && npm ci && node store-shots.mjs
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const assets = path.join(here, '../store-assets');
const work = mkdtempSync(path.join(os.tmpdir(), 'traveler-shots-'));
mkdirSync(assets, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Same trick as run.mjs: a temporary copy with host access, so the overlay can
// be opened without a real key press. The shipped manifest is never changed.
const ext = mkdtempSync(path.join(os.tmpdir(), 'traveler-ext-'));
cpSync(path.join(here, '../extension'), ext, { recursive: true });
const manifest = JSON.parse(readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
manifest.host_permissions = ['<all_urls>'];
writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(manifest));

const PAGES = {
  trip: ['Lisbon in four days: an itinerary', 'Where to eat, what to skip, and how to ride tram 28 without the queue.'],
  flights: ['Flights: SFO to LIS, Mar 14', 'Nonstop and one-stop options, sorted by price.'],
  hotel: ['Casa do Largo, Alfama: booking', 'Three nights, breakfast included, check-in from 3 PM.'],
  map: ['Alfama walking map', 'Miradouros, steps and the long way down to the river.'],
  pastry: ['The best pastel de nata in Lisbon', 'Eleven bakeries, ranked by a very patient local.'],
  packing: ['Packing list: spring in Portugal', 'Layers, rain shell, shoes that handle cobblestones.'],
  docs: ['Q2 planning doc', 'Goals, owners and the three things we will not do this quarter.'],
  standup: ['Team standup notes', 'Yesterday, today, blockers.'],
};

const server = http.createServer((req, res) => {
  const key = req.url.slice(1).split('?')[0] || 'trip';
  const [title, lede] = PAGES[key] || PAGES.trip;
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><title>${title}</title>
    <body style="margin:0;font:17px/1.6 -apple-system,'Segoe UI',Inter,sans-serif;background:#fbfaf7;color:#2b2b2b">
    <header style="padding:18px 48px;border-bottom:1px solid #eee;font-weight:700;letter-spacing:-.2px">Field Notes</header>
    <main style="max-width:760px;margin:40px auto;padding:0 24px">
    <h1 style="font-size:40px;line-height:1.15;letter-spacing:-.8px">${title}</h1>
    <p style="font-size:20px;color:#666">${lede}</p>
    ${'<p>Start early, before the day-trippers. The light on the river is best before nine, and the bakeries are already busy. Walk uphill first, so the afternoon is all downhill: every lookout on the way is a good excuse to stop, and every stop is a good excuse for coffee.</p>'.repeat(6)}
    </main>`);
});
// Demo pages are served on port 80 under made-up .example hosts (mapped to
// this machine below), so the screenshots show tidy addresses, not localhost.
// Port 80 needs root or a capability; set SHOTS_PORT to use another.
const PORT = Number(process.env.SHOTS_PORT || 80);
await new Promise((r) => server.listen(PORT, r));
const HOST = { flights: 'flights.example', hotel: 'stays.example', map: 'maps.example', docs: 'docs.example', standup: 'docs.example' };
const url = (key) => `http://${HOST[key] || 'fieldnotes.example'}${PORT === 80 ? '' : `:${PORT}`}/${key}`;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  pipe: true,
  enableExtensions: true,
  headless: true,
  defaultViewport: { width: 1184, height: 660, deviceScaleFactor: 1 },
  args: ['--host-resolver-rules=MAP *.example 127.0.0.1'],
});
const id = await browser.installExtension(ext);
const sw = await (await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes(id))).worker();

await sw.evaluate(async (urls) => {
  const bar = (await chrome.bookmarks.getTree())[0].children[0].id;
  const folder = await chrome.bookmarks.create({ parentId: bar, title: 'Lisbon trip' });
  for (const [k, t] of [
    ['pastry', 'The best pastel de nata in Lisbon'],
    ['map', 'Alfama walking map'],
    ['packing', 'Packing list: spring in Portugal'],
  ]) await chrome.bookmarks.create({ parentId: folder.id, title: t, url: urls[k] });
}, Object.fromEntries(Object.keys(PAGES).map((k) => [k, url(k)])));

// Demo tabs, in two windows, so tab search has something to find.
for (const key of ['flights', 'hotel', 'map', 'docs', 'standup', 'pastry']) {
  const p = await browser.newPage();
  await p.goto(url(key));
}
const page = await browser.newPage();
await page.goto(url('trip'));

async function open(prefs) {
  await sw.evaluate((prefs) => chrome.storage.local.set({ prefs, positionOverlay: null }), prefs);
  for (let pass = 0; pass < 2; pass++) {
    await page.bringToFront();
    await sw.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      chrome.commands.onCommand.dispatch('open-palette', tab);
    });
    let frame;
    for (let i = 0; i < 150 && !frame; i++) {
      frame = page.frames().find((f) => f.url().startsWith(`chrome-extension://${id}/src/palette.html`));
      if (!frame) await sleep(20);
    }
    await frame.waitForSelector('.row');
    await sleep(400);
    if (pass === 1) return frame;
    await page.reload(); // the first open only primes the pre-paint theme mirror
    await sleep(300);
  }
}
async function type(frame, text) {
  await frame.$eval('#input', (el) => {
    el.value = '';
    el.dispatchEvent(new Event('input'));
  });
  await page.keyboard.type(text, { delay: 20 });
  await sleep(500);
}
async function capture(name) {
  const file = path.join(work, `${name}.png`);
  await page.screenshot({ path: file });
  return readFileSync(file).toString('base64');
}

const raw = {};
let frame = await open({ theme: 'daylight', appearance: 'light' });
raw.palette = await capture('palette');
await type(frame, 'lisbon');
raw.tabs = await capture('tabs');
await type(frame, 'passw');
raw.settings = await capture('settings');
await type(frame, 'clear cache');
await page.keyboard.press('Enter');
await sleep(500);
await page.keyboard.press('Enter'); // "Cached images and files": pick a time range, or Cancel
await sleep(500);
raw.safety = await capture('safety');
await page.reload();
await sleep(300);
frame = await open({ theme: 'cream', appearance: 'dark' });
await type(frame, 'theme');
raw.themes = await capture('themes');
await sw.evaluate(() => chrome.storage.local.set({ prefs: { theme: 'daylight', appearance: 'light' } }));

const logo = readFileSync(path.join(here, '../extension/icons/logo.svg'), 'utf8');
const BG = 'background:linear-gradient(135deg,#1f2a44 0%,#2d4a6b 45%,#c4553a 100%)';
const FONT = "font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

const SHOTS = [
  ['screenshot-1-palette', 'palette', 'Everything in Chrome, one keystroke away', 'Press ⌘K on any page. Tabs, bookmarks, history, settings and actions.'],
  ['screenshot-2-tabs', 'tabs', 'Find any tab in any window', 'Type a few letters of a title or address. Bookmarks and history too.'],
  ['screenshot-3-settings', 'settings', 'Every Chrome setting, by name', 'Passwords, privacy, site permissions, extensions: no menus to dig through.'],
  ['screenshot-4-safety', 'safety', 'Destructive actions always ask first', 'Clearing data, closing many tabs or changing a setting needs a second Enter.'],
  ['screenshot-5-themes', 'themes', 'Light, dark and two themes', 'Daylight and Cream and Coral, following your system or your choice.'],
];

const shooter = await browser.newPage();
for (const [file, key, title, sub] of SHOTS) {
  await shooter.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await shooter.setContent(`<body style="margin:0;width:1280px;height:800px;${BG};${FONT};color:#fff;overflow:hidden">
    <div style="position:absolute;left:48px;top:22px;font-size:32px;font-weight:700;letter-spacing:-.4px">${title}</div>
    <div style="position:absolute;left:48px;top:64px;font-size:17px;opacity:.85">${sub}</div>
    <img src="data:image/png;base64,${raw[key]}" style="position:absolute;left:48px;top:108px;width:1184px;height:660px;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.35)">
    </body>`);
  await sleep(200);
  await shooter.screenshot({ path: path.join(assets, `${file}-1280x800.png`) });
}

await shooter.setViewport({ width: 440, height: 280, deviceScaleFactor: 1 });
const kbd = 'display:inline-block;padding:3px 10px;margin:0 4px;border:1px solid rgba(255,255,255,.55);border-radius:7px;background:rgba(255,255,255,.12);font-size:15px;font-weight:600';
await shooter.setContent(`<body style="margin:0;width:440px;height:280px;${BG};${FONT};color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center">
  <div style="display:flex;align-items:center;gap:14px">${logo.replace('width="512" height="512"', 'width="64" height="64"')}<span style="font-size:44px;font-weight:800;letter-spacing:-1px">Traveler</span></div>
  <div style="margin-top:14px;font-size:19px;font-weight:600">Get anywhere in Chrome</div>
  <div style="margin-top:16px"><span style="${kbd}">⌘K</span><span style="${kbd}">tabs</span><span style="${kbd}">bookmarks</span><span style="${kbd}">settings</span></div>
  </body>`);
await sleep(200);
await shooter.screenshot({ path: path.join(assets, 'promo-tile-440x280.png') });

await browser.close();
server.close();
console.log(`Wrote ${SHOTS.length} screenshots and the promo tile to ${assets}`);
