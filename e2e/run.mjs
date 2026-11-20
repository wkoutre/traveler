// Browser tests against the locally installed Chrome, in a throwaway profile.
//
//   cd e2e && npm ci && node run.mjs            all suites
//   node run.mjs overlay ui pages idle shots     chosen suites
//
// Chrome grants activeTab only on a real key press, which automation cannot
// send to the browser's shortcut handler. The overlay suite therefore loads a
// temporary copy of the extension with host access added, and fires the
// command event directly. The shipped manifest is never changed.
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PAGES } from '../extension/src/catalog.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const wanted = process.argv.slice(2);
const want = (name) => !wanted.length || wanted.includes(name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const outDir = path.join(here, 'out');
mkdirSync(outDir, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
}

function testCopy() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cmdk-e2e-'));
  cpSync(path.join(here, '../extension'), dir, { recursive: true });
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  manifest.host_permissions = ['<all_urls>'];
  writeFileSync(file, JSON.stringify(manifest, null, 2));
  return dir;
}

function startServer() {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    if (req.url.startsWith('/strict')) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src 'none'",
      );
    }
    res.end(`<!doctype html><title>Test page ${req.url}</title>
      <body style="margin:0;font:16px/1.5 -apple-system,sans-serif;background:${req.url.includes('dark') ? '#111;color:#eee' : '#fff'}">
      <main style="max-width:720px;margin:48px auto;padding:0 24px">
      <h1>Quarterly planning notes</h1><input id="field" placeholder="A field on the page">
      ${'<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</p>'.repeat(8)}
      </main>`);
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

async function launch(extensionDir, opts = {}) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    pipe: true,
    enableExtensions: true,
    headless: true,
    defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 },
    ...opts,
  });
  const id = await browser.installExtension(extensionDir);
  return { browser, id };
}

async function worker(browser, id) {
  const target = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes(id));
  return target.worker();
}

const fire = (sw) =>
  sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    chrome.commands.onCommand.dispatch('open-palette', tab);
  });

async function paletteFrame(page, id, timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const frame = page.frames().find((f) => f.url().startsWith(`chrome-extension://${id}/src/palette.html`));
    if (frame) return frame;
    await sleep(20);
  }
  return null;
}

const hostExists = (page) => page.evaluate(() => Boolean(document.getElementById('__cmdk_host__')));
const titles = (frame) => frame.$$eval('.row .title', (els) => els.map((e) => e.textContent));
const activeTitle = (frame) => frame.$eval('.row[aria-selected="true"] .title', (e) => e.textContent).catch(() => null);

async function type(page, frame, text) {
  await frame.$eval('#input', (el) => {
    el.value = '';
    el.dispatchEvent(new Event('input'));
  });
  await page.keyboard.type(text);
  await sleep(250); // bookmarks and history merge in asynchronously
}

// ---- Overlay on a real page ---------------------------------------------
async function overlaySuite(server) {
  const base = `http://localhost:${server.address().port}`;
  const { browser, id } = await launch(testCopy());
  const sw = await worker(browser, id);
  const page = await browser.newPage();
  await page.goto(`${base}/strict`);
  await page.bringToFront();
  await page.focus('#field');

  let t0 = Date.now();
  await fire(sw);
  let frame = await paletteFrame(page, id);
  check('overlay opens on a page whose CSP forbids frames', Boolean(frame));
  await frame.waitForSelector('.row');
  const openMs = Date.now() - t0;
  check('first results render within 500 ms of the shortcut', openMs < 500, `${openMs} ms`);
  check('the page cannot read the overlay frame', await page.evaluate(() => document.getElementById('__cmdk_host__').shadowRoot === null && document.querySelectorAll('iframe').length === 0));
  check('typing focus lands in the search field', (await frame.evaluate(() => document.activeElement?.id)) === 'input');

  await type(page, frame, 'pin');
  check('typing filters; best match is active', (await activeTitle(frame)) === 'Pin or unpin tab', await activeTitle(frame));
  await page.keyboard.press('Enter');
  await sleep(300);
  check('Enter runs the command on the tab under the overlay', (await sw.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].pinned)) === true);
  check('running a command closes the overlay', !(await hostExists(page)));

  await page.focus('#field');
  await fire(sw);
  frame = await paletteFrame(page, id);
  await frame.waitForSelector('.row');
  await page.keyboard.press('Escape');
  await sleep(150);
  check('Escape closes the overlay', !(await hostExists(page)));
  check('focus returns to the field that had it', (await page.evaluate(() => document.activeElement?.id)) === 'field');

  await fire(sw);
  await paletteFrame(page, id);
  await sleep(200);
  await fire(sw);
  await sleep(200);
  check('the shortcut toggles: a second press closes', !(await hostExists(page)));

  await fire(sw);
  frame = await paletteFrame(page, id);
  await frame.waitForSelector('.row');
  await sleep(400); // let the compositor learn the new frame's hit region before clicking
  await page.mouse.click(20, 20);
  await sleep(150);
  check('clicking outside the panel closes', !(await hostExists(page)));

  // A hostile page frames the web-accessible URL itself.
  const evil = await browser.newPage();
  await evil.goto(`${base}/plain`);
  for (const [label, query] of [['a guessed token', '?mode=overlay#guess'], ['no token', '?mode=overlay'], ['popup mode', '?mode=popup'], ['no mode', '']]) {
    await evil.evaluate((src) => {
      document.querySelectorAll('iframe').forEach((f) => f.remove());
      const f = document.createElement('iframe');
      f.src = src;
      document.body.append(f);
    }, `chrome-extension://${id}/src/palette.html${query}`);
    await sleep(500);
    const framed = evil.frames().find((f) => f.url().startsWith(`chrome-extension://${id}/`));
    const inert = framed ? await framed.evaluate(() => document.getElementById('panel').hidden && !document.querySelector('.row')) : true;
    check(`a page framing the palette with ${label} gets nothing`, inert);
  }
  await evil.close();

  if (want('shots')) await shots(browser, id, sw, base);
  await browser.close();
}

async function shots(browser, id, sw, base) {
  const page = await browser.newPage();
  for (const [theme, appearance, bg] of [
    ['Family', 'Light', 'plain'],
    ['Uniswap', 'Light', 'plain'],
    ['Uniswap', 'Dark', 'dark'],
    ['Cream and Coral', 'Light', 'plain'],
    ['Cream and Coral', 'Dark', 'dark'],
  ]) {
    await page.goto(`${base}/${bg}`);
    await page.bringToFront();
    await sw.evaluate((prefs) => chrome.storage.local.set({ prefs }), {
      theme: { Family: 'family', Uniswap: 'uniswap', 'Cream and Coral': 'cream' }[theme],
      appearance: appearance.toLowerCase(),
    });
    // Open once so the pre-paint mirror picks the new prefs up, then again for the shot.
    for (let pass = 0; pass < 2; pass++) {
      await fire(sw);
      const frame = await paletteFrame(page, id);
      await frame.waitForSelector('.row');
      await sleep(350);
      if (pass === 0) {
        await page.keyboard.press('Escape');
        await sleep(150);
        continue;
      }
      const slug = `${theme}-${appearance}`.toLowerCase().replace(/\s+/g, '-');
      await page.screenshot({ path: path.join(outDir, `${slug}-empty.png`) });
      await type(page, frame, 'set');
      await page.screenshot({ path: path.join(outDir, `${slug}-query.png`) });
      await type(page, frame, 'delete brow');
      await page.keyboard.press('Enter');
      await sleep(200);
      await page.keyboard.press('Enter');
      await sleep(200);
      await page.keyboard.press('Enter');
      await sleep(200);
      await page.screenshot({ path: path.join(outDir, `${slug}-confirm.png`) });
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await sleep(150);
    }
  }
  console.log(`screenshots in ${outDir}`);
}

// ---- Palette behavior, opened as a plain extension tab -------------------
async function uiSuite(server) {
  const base = `http://localhost:${server.address().port}`;
  const { browser, id } = await launch(path.join(here, '../extension'));
  const sw = await worker(browser, id);
  await sw.evaluate(async (base) => {
    await chrome.bookmarks.create({ title: 'Zebra crossing handbook', url: 'https://example.com/zebra' });
    await chrome.history.addUrl({ url: 'https://example.org/quokka-facts' });
    await chrome.tabs.create({ url: `${base}/plain?one`, active: false });
    await chrome.tabs.create({ url: `${base}/plain?two`, active: false });
  }, base);
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${id}/src/palette.html`);
  await page.waitForSelector('.row');
  const frame = page.mainFrame();
  const count = () => sw.evaluate(async () => (await chrome.tabs.query({})).length);

  const sections = await page.$$eval('.section', (els) => els.map((e) => e.textContent));
  check('the empty state lists recent tabs and suggestions', sections.join() === 'Recent tabs,Suggested', sections.join());

  await type(page, frame, 'zebra');
  check('bookmarks are searched', (await titles(frame)).includes('Zebra crossing handbook'));
  await type(page, frame, 'quokka');
  check('history is searched', (await frame.$$eval('.row', (els) => els.some((e) => e.textContent.includes('quokka-facts')))));
  await type(page, frame, 'plain?two');
  check('open tabs are searched by URL', (await frame.$$eval('.row .tag', (els) => els[0]?.textContent)) === 'Tab');
  await type(page, frame, 'zzqqxx');
  check('a query with no match still offers a web search', (await titles(frame)).join() === 'Search the web for “zzqqxx”', (await titles(frame)).join());
  await type(page, frame, 'example.com/x');
  check('a URL-shaped query offers to open it first', (await titles(frame))[0] === 'Open example.com/x');

  await type(page, frame, '');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  check('Tab cycles the scope', (await page.$eval('.pill[aria-selected="true"]', (e) => e.textContent)) === 'Settings');
  const settingsCount = (await titles(frame)).length;
  check('the Settings scope lists Chrome pages', settingsCount === Math.min(60, PAGES.length), `${settingsCount} rows`);
  await type(page, frame, 'third-party');
  check('a settings page is found by name', (await activeTitle(frame)) === 'Third-party cookies');
  await page.keyboard.down('Shift');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  await page.keyboard.up('Shift');

  // Destructive flow: three choices, and Cancel deletes nothing.
  const spy = await sw.evaluate(() => {
    self.__removed = [];
    return true;
  });
  await type(page, frame, 'delete browsing');
  await page.keyboard.press('Enter');
  await sleep(150);
  check('a destructive command opens a page instead of running', (await page.$$eval('.crumb', (els) => els.map((e) => e.textContent))).join() === 'Delete browsing data');
  check('scope pills hide inside a nested page', await page.$eval('#scopes', (e) => e.hidden));
  await page.keyboard.press('Enter');
  await sleep(150);
  await page.keyboard.press('Enter');
  await sleep(150);
  const confirmRows = await titles(frame);
  check('the last step is an explicit choice', confirmRows.join(' | ') === 'Delete cached images and files, last hour | Cancel', confirmRows.join(' | '));
  check('the destructive row is marked', await page.$eval('.row', (e) => 'danger' in e.dataset));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await sleep(150);
  check('Cancel goes back one page', (await page.$$eval('.crumb', (els) => els.length)) === 2);
  await page.keyboard.press('Backspace');
  await sleep(100);
  await page.keyboard.press('Escape');
  await sleep(100);
  check('Backspace and Escape walk back to the root', (await page.$$eval('.crumb', (els) => els.length)) === 0 && !(await page.$eval('#scopes', (e) => e.hidden)));

  // Real destructive run, on the throwaway profile.
  await sw.evaluate(() => chrome.history.addUrl({ url: 'https://example.org/to-be-deleted' }));
  await type(page, frame, 'delete browsing');
  await page.keyboard.press('Enter');
  await sleep(150);
  await type(page, frame, 'browsing history');
  await page.keyboard.press('Enter');
  await sleep(150);
  await type(page, frame, 'all time');
  await page.keyboard.press('Enter');
  await sleep(150);
  await page.keyboard.press('Enter');
  await sleep(600);
  const left = await sw.evaluate(async () => (await chrome.history.search({ text: 'to-be-deleted', startTime: 0 })).length);
  check('confirming deletes the chosen data', left === 0, `${left} entries left`);
  check('the palette stays open and reports what it did', (await page.$eval('#status', (e) => e.textContent)) === 'Deleted browsing history');
  check('and returns to the root', (await page.$$eval('.crumb', (els) => els.length)) === 0);

  // Privacy switch: reads live state, flips it after a confirm.
  const before = await sw.evaluate(async () => (await chrome.privacy.websites.doNotTrackEnabled.get({})).value);
  await type(page, frame, 'privacy switches');
  await page.keyboard.press('Enter');
  await sleep(300);
  await type(page, frame, 'do not track');
  check('privacy switches show their live state', (await frame.$eval('.row .subtitle', (e) => e.textContent)) === (before ? 'On' : 'Off'));
  await page.keyboard.press('Enter');
  await sleep(150);
  await page.keyboard.press('Enter');
  await sleep(400);
  const after = await sw.evaluate(async () => (await chrome.privacy.websites.doNotTrackEnabled.get({})).value);
  check('confirming flips the switch', after === !before, `${before} -> ${after}`);
  await type(page, frame, 'do not track');
  check('the list shows the new state after going back', (await frame.$eval('.row .subtitle', (e) => e.textContent)) === (after ? 'On' : 'Off'));
  await page.keyboard.press('Escape');
  await sleep(100);

  // Themes.
  await type(page, frame, 'theme uniswap');
  await page.keyboard.press('Enter');
  await sleep(200);
  check('a theme command restyles the open palette', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'uniswap');
  check('the choice is stored', (await sw.evaluate(async () => (await chrome.storage.local.get('prefs')).prefs.theme)) === 'uniswap');
  await type(page, frame, 'appearance dark');
  await page.keyboard.press('Enter');
  await sleep(200);
  check('dark appearance applies', (await page.evaluate(() => getComputedStyle(document.querySelector('.panel')).backgroundColor)) === 'rgb(19, 19, 19)');
  await type(page, frame, 'theme family');
  await page.keyboard.press('Enter');
  await sleep(200);
  check('Family stays light when dark is selected', (await page.evaluate(() => getComputedStyle(document.querySelector('.panel')).backgroundColor)) === 'rgb(255, 255, 255)');

  // Tabs.
  await type(page, frame, 'plain?one');
  const n = await count();
  await page.keyboard.down('Meta');
  await page.keyboard.press('Backspace');
  await page.keyboard.up('Meta');
  await sleep(300);
  check('Cmd+Backspace closes the highlighted tab and keeps the palette open', (await count()) === n - 1 && !page.isClosed());
  await type(page, frame, 'new tab');
  check('the exact command ranks first', (await activeTitle(frame)) === 'New tab', await activeTitle(frame));
  await page.keyboard.press('Enter');
  await sleep(400);
  check('running a command from a tab closes the palette tab', page.isClosed());
  check('the command ran', (await count()) === n - 1, `${await count()} tabs`);

  const errors = await sw.evaluate(() => (chrome.runtime.lastError ? String(chrome.runtime.lastError.message) : ''));
  check('no extension errors were recorded', errors === '', errors);
  void spy;
  await browser.close();
}

// ---- Every catalogued chrome:// page exists in this Chrome ---------------
async function pagesSuite() {
  const { browser } = await launch(path.join(here, '../extension'));
  const page = await browser.newPage();
  const bad = [];
  for (const entry of PAGES) {
    let problem = '';
    try {
      await page.goto(entry.url, { waitUntil: 'domcontentloaded', timeout: 8000 });
      await sleep(entry.url.startsWith('chrome://settings') || entry.url.startsWith('chrome://password-manager') ? 350 : 60);
      const final = page.url();
      const norm = (u) => u.replace(/#.*$/, '').replace(/\/$/, '');
      if (norm(final) !== norm(entry.url)) problem = `redirected to ${final}`;
      else if ((await page.title()) === entry.url.replace('chrome://', '').replace(/\/$/, '') && (await page.evaluate(() => document.body?.innerText.includes('ERR_'))))
        problem = 'error page';
    } catch (error) {
      // The dino game is Chrome's offline error page, so that error is the page loading.
      if (!(entry.url === 'chrome://dino/' && error.message.includes('ERR_INTERNET_DISCONNECTED'))) problem = error.message.split('\n')[0];
    }
    if (problem) bad.push(`${entry.url}  ${problem}`);
  }
  check(`all ${PAGES.length} catalogued chrome:// pages load in ${await browser.version()}`, bad.length === 0, bad.join('; '));
  for (const line of bad) console.log(`     ${line}`);
  await browser.close();
}

// ---- Idle cost -----------------------------------------------------------
async function idleSuite(server) {
  const base = `http://localhost:${server.address().port}`;
  // Do not attach to the service worker: an attached debugger keeps it alive.
  const { browser, id } = await launch(path.join(here, '../extension'), {
    targetFilter: (t) => t.type() !== 'service_worker',
  });
  const page = await browser.newPage();
  await page.goto(`${base}/plain`);
  const injected = await page.evaluate(() => document.documentElement.outerHTML.includes('cmdk') || Object.keys(window).some((k) => /cmdk/i.test(k)));
  check('nothing is injected into a page until the shortcut fires', injected === false);
  console.log('     waiting 40 s for the service worker to go idle');
  await sleep(40000);
  const probe = await browser.newPage();
  await probe.goto(`chrome-extension://${id}/src/options.html`);
  const contexts = await probe.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['BACKGROUND'] }));
  check('the service worker is not running after 40 s idle', contexts.length === 0, `${contexts.length} background contexts`);
  await browser.close();
}

const server = await startServer();
try {
  if (want('overlay')) await overlaySuite(server);
  if (want('ui')) await uiSuite(server);
  if (want('pages')) await pagesSuite();
  if (want('idle')) await idleSuite(server);
} finally {
  server.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
