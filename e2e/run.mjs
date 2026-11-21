// Browser tests against the locally installed Chrome, in a throwaway profile.
//
//   cd e2e && npm ci && node run.mjs            all suites
//   node run.mjs overlay ui window pages idle shots     chosen suites
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

const rect = (frame) =>
  frame.$eval('#panel', (el) => {
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width) };
  });
const center = (frame, selector) =>
  frame.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
async function drag(page, from, dx, dy, steps = 4) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps });
  await page.mouse.up();
  await sleep(150);
}
const stored = (sw, key) => sw.evaluate(async (key) => (await chrome.storage.local.get(key))[key] ?? null, key);

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

  // A saved position is where the overlay opens, and dragging there saves the new one.
  await sw.evaluate(() => chrome.storage.local.set({ positionOverlay: { x: 0.3, y: 0.5 } }));
  await fire(sw);
  frame = await paletteFrame(page, id);
  await frame.waitForSelector('.row');
  await sleep(400);
  let placed = await rect(frame);
  check('the overlay opens where it was left', placed.left === 64 && placed.top === 400, JSON.stringify(placed));
  await drag(page, await center(frame, '#search-icon'), 200, -150);
  const dragged = await rect(frame);
  check('dragging the search row moves the overlay panel', dragged.left === 264 && dragged.top === 250, JSON.stringify(dragged));
  const savedOverlay = await stored(sw, 'positionOverlay');
  check('and the new position is saved', Math.abs(savedOverlay.x - (264 + 320) / 1280) < 0.002 && Math.abs(savedOverlay.y - 250 / 800) < 0.002, JSON.stringify(savedOverlay));
  check('a drag does not close the overlay', await hostExists(page));
  await page.screenshot({ path: path.join(outDir, 'overlay-moved.png') });
  await page.keyboard.press('Escape');
  await sleep(150);
  await sw.evaluate(() => chrome.storage.local.remove('positionOverlay'));

  // A second key press elsewhere used to invalidate the first token and strand an inert frame.
  const stolen = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    chrome.commands.onCommand.dispatch('open-palette', tab);
    // Take the token away before the frame can redeem it.
    for (let i = 0; i < 2000; i++) {
      const keys = Object.keys(await chrome.storage.session.get(null)).filter((k) => k.startsWith('overlay:'));
      if (keys.length) {
        await chrome.storage.session.remove(keys);
        return true;
      }
    }
    return false;
  });
  check('test setup: the token was removed before use', stolen);
  await sleep(600);
  check('an overlay whose token is not valid removes itself', !(await hostExists(page)));

  // A page plants an element with the overlay's id.
  await page.evaluate(() => {
    const fake = document.createElement('div');
    fake.id = '__cmdk_host__';
    document.body.append(fake);
  });
  await fire(sw);
  frame = await paletteFrame(page, id);
  check('a page-planted element with the overlay id does not block opening', Boolean(frame));
  await frame.waitForSelector('.row');
  await page.keyboard.press('Escape');
  await sleep(150);
  check('and closing still works', !(await paletteFrame(page, id, 200)));

  // A page (or a framework re-rendering <html>) removes the overlay element itself.
  await fire(sw);
  await paletteFrame(page, id);
  await sleep(200);
  await page.evaluate(() => document.querySelectorAll('#__cmdk_host__').forEach((el) => el.remove()));
  await sleep(100);
  await fire(sw);
  frame = await paletteFrame(page, id, 1000);
  check('after the page removes the overlay, the next press opens it again', Boolean(frame));
  if (frame) {
    await frame.waitForSelector('.row');
    await page.keyboard.press('Escape');
    await sleep(150);
  }

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
  const [opened] = await Promise.all([
    new Promise((resolve) => browser.once('targetcreated', (t) => resolve(t.page()))),
    evil.evaluate((src) => void window.open(src), `chrome-extension://${id}/src/palette.html`),
  ]);
  await sleep(600);
  check('a page opening the palette in a new tab gets nothing', await opened.evaluate(() => document.getElementById('panel').hidden && !document.querySelector('.row')));
  await opened.close();
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
  // The plain-tab surface only renders with this flag, which web pages cannot set.
  await sw.evaluate(() => chrome.storage.session.set({ devTab: true }));
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
  check('the list shows the new state, marked as set by the palette', (await frame.$eval('.row .subtitle', (e) => e.textContent)) === `${after ? 'On' : 'Off'} · set by Cmd+K`);
  await page.keyboard.press('Enter');
  await sleep(150);
  await page.keyboard.press('Enter');
  await sleep(400);
  const restored = await sw.evaluate(() => chrome.privacy.websites.doNotTrackEnabled.get({}));
  check('flipping it back releases control to the user', restored.value === before && restored.levelOfControl === 'controllable_by_this_extension', JSON.stringify(restored));
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

  // Position.
  await type(page, frame, '');
  const home = await rect(frame);
  check('with nothing saved the panel is centered near the top', home.left === 320 && home.top === 112, JSON.stringify(home));
  await drag(page, await center(frame, '#search-icon'), 120, 90);
  let at = await rect(frame);
  check('dragging the search row moves the panel', at.left === home.left + 120 && at.top === home.top + 90, JSON.stringify(at));
  check('typing focus stays in the field after a drag', (await page.evaluate(() => document.activeElement?.id)) === 'input');
  await drag(page, await center(frame, '.footer'), 60, 60);
  check('a plain drag elsewhere does not move it', JSON.stringify(await rect(frame)) === JSON.stringify(at));
  await page.keyboard.down('Alt');
  await drag(page, await center(frame, '.row'), -200, 40);
  await page.keyboard.up('Alt');
  const optioned = await rect(frame);
  check('holding Option drags it from anywhere', optioned.left === at.left - 200 && optioned.top === at.top + 40, JSON.stringify(optioned));
  check('an Option-drag that starts on a row does not run the row', !page.isClosed() && (await page.$$eval('.crumb', (els) => els.length)) === 0);
  await drag(page, await center(frame, '#search-icon'), -3000, 3000);
  at = await rect(frame);
  check('it cannot be dragged off the screen', at.left === 8 && at.top === 800 - 220, JSON.stringify(at));
  await drag(page, await center(frame, '#search-icon'), 400, -300);
  at = await rect(frame);
  await page.reload();
  await page.waitForSelector('.row');
  await sleep(400); // the enter animation shifts the panel a few pixels while it runs
  check('it reopens where it was left', JSON.stringify(await rect(frame)) === JSON.stringify(at), `${JSON.stringify(await rect(frame))} vs ${JSON.stringify(at)}`);
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 2 });
  await sleep(200);
  const shrunk = await rect(frame);
  check('it stays on screen when the viewport shrinks', shrunk.left >= 8 && shrunk.left + shrunk.width <= 900 - 8 && shrunk.top <= 600 - 220, JSON.stringify(shrunk));
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
  await sleep(200);
  await type(page, frame, 'reset palette position');
  check('there is a command to reset it', (await activeTitle(frame)) === 'Reset palette position', await activeTitle(frame));
  await page.keyboard.press('Enter');
  await sleep(250);
  check('the reset command centers the open palette', JSON.stringify(await rect(frame)) === JSON.stringify(home), JSON.stringify(await rect(frame)));
  check('and forgets the saved position', (await stored(sw, 'positionOverlay')) === null);
  check('and reports it', (await page.$eval('#status', (e) => e.textContent)) === 'Palette position reset');

  // Learned ranking. These commands open a page of choices, so the palette stays open.
  const pickSecond = async () => {
    await type(page, frame, 'close tabs');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await sleep(200);
    await page.keyboard.press('Escape');
    await sleep(200);
  };
  await type(page, frame, 'close tabs');
  const plain = await titles(frame);
  const [first, second] = plain;
  check('test setup: the query has two different results', Boolean(first && second && first !== second), plain.slice(0, 3).join(' | '));
  await pickSecond();
  await type(page, frame, 'close tabs');
  check('one pick does not change which result is first', (await titles(frame))[0] === first, (await titles(frame)).slice(0, 3).join(' | '));
  const saved = await stored(sw, 'learned');
  check('the pick is saved under what was typed', Object.keys(saved?.q?.['close tabs'] || {}).length === 1, JSON.stringify(saved));
  await pickSecond();
  await type(page, frame, 'close tabs');
  check('two picks for the same typing put that result first', (await titles(frame))[0] === second, `${(await titles(frame)).slice(0, 3).join(' | ')}; plain order ${plain.slice(0, 3).join(' | ')}`);
  await type(page, frame, 'close tab');
  check('and it leads while typing toward the same text', (await titles(frame))[0] === second, (await titles(frame)).slice(0, 3).join(' | '));
  // Another open palette saves a pick, then clears the record, while this one stays open.
  await sw.evaluate(async () => {
    const { learned } = await chrome.storage.local.get('learned');
    learned.q.elsewhere = { 'p.elsewhere': [1, Date.now()] };
    await chrome.storage.local.set({ learned });
  });
  await sleep(150);
  await pickSecond();
  const both = await stored(sw, 'learned');
  check('a pick does not overwrite what another open palette saved', Boolean(both?.q?.elsewhere && both?.q?.['close tabs']), JSON.stringify(both));
  await sw.evaluate(() => chrome.storage.local.remove('learned'));
  await sleep(150);
  await pickSecond();
  const afterClear = await stored(sw, 'learned');
  check('a pick does not bring back a record cleared elsewhere', JSON.stringify(Object.keys(afterClear?.q || {})) === '["close tabs"]' && afterClear.q['close tabs'][Object.keys(afterClear.q['close tabs'])[0]][0] === 1, JSON.stringify(afterClear));
  await pickSecond();
  await page.reload();
  await page.waitForSelector('.row');
  await type(page, frame, 'close tabs');
  check('what was learned survives reopening the palette', (await titles(frame))[0] === second, (await titles(frame)).slice(0, 3).join(' | '));
  await type(page, frame, 'clear learned ranking');
  check('there is a command to clear it', (await activeTitle(frame)) === 'Clear learned ranking', await activeTitle(frame));
  await page.keyboard.press('Enter');
  await sleep(200);
  check('clearing asks first', (await titles(frame)).join(' | ') === 'Clear learned ranking | Cancel', (await titles(frame)).join(' | '));
  await page.keyboard.press('Enter');
  await sleep(300);
  check('confirming deletes the record', (await stored(sw, 'learned')) === null, JSON.stringify(await stored(sw, 'learned')));
  check('and reports it', (await page.$eval('#status', (e) => e.textContent)) === 'Learned ranking cleared');
  await type(page, frame, 'close tabs');
  check('and results go back to the plain order', (await titles(frame)).join() === plain.join(), (await titles(frame)).slice(0, 3).join(' | '));

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
  // The palette tab closes itself on key down, so the key-up can find its target gone.
  await page.keyboard.press('Enter').catch((error) => {
    if (!/Target closed/.test(error.message)) throw error;
  });
  await sleep(400);
  check('running a command from a tab closes the palette tab', page.isClosed());
  check('the command ran', (await count()) === n - 1, `${await count()} tabs`);

  // Web search, from a fresh palette tab since the last one closed itself.
  const searcher = await browser.newPage();
  await searcher.goto(`chrome-extension://${id}/src/palette.html`);
  await searcher.waitForSelector('.row');
  await type(searcher, searcher.mainFrame(), 'zzqqxx wombat');
  await searcher.keyboard.press('Enter').catch((error) => {
    if (!/Target closed/.test(error.message)) throw error;
  });
  await sleep(1500);
  const found = await sw.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    // The engine may redirect (Google sends automated browsers to a check page
    // that carries the original address encoded), so compare decoded text.
    const plain = (t) => {
      try {
        return decodeURIComponent(decodeURIComponent(t.pendingUrl || t.url || ''));
      } catch {
        return t.pendingUrl || t.url || '';
      }
    };
    const hit = tabs.find((t) => /zzqqxx[+ ]wombat/.test(plain(t)));
    return hit ? { url: plain(hit), active: hit.active } : { urls: tabs.map(plain) };
  });
  check('the web search row opens a search for the typed text in a new tab', Boolean(found.url), JSON.stringify(found));
  // The throwaway profile's default engine is Google, and Chrome adds this tag to the
  // Google searches it builds. It says nothing about other engines. This check and
  // the one above need the network: the tab really loads the engine.
  check('and, with Google as the default engine, the address carries the tag Chrome adds', /sourceid=chrome/.test(found.url || ''), JSON.stringify(found));
  check('and shows that tab', found.active === true, JSON.stringify(found));
  check('and closes the palette', searcher.isClosed());

  const errors = await sw.evaluate(() => (chrome.runtime.lastError ? String(chrome.runtime.lastError.message) : ''));
  check('no extension errors were recorded', errors === '', errors);
  void spy;
  await browser.close();
}

// ---- Pages that cannot be scripted: a centered window ---------------------
async function windowSuite() {
  // The shipped manifest, unmodified: injection into chrome:// fails for real.
  // Headless Chrome's default screen is 800x600, too small to move a 680x520 window around in.
  const { browser, id } = await launch(path.join(here, '../extension'), { args: ['--screen-info={1920x1200}'] });
  const sw = await worker(browser, id);
  const page = await browser.newPage();
  await page.goto('chrome://version/');
  await page.bringToFront();
  const paletteTarget = (timeout = 3000) =>
    browser.waitForTarget((t) => t.url().startsWith(`chrome-extension://${id}/src/palette.html?mode=window`), { timeout }).catch(() => null);
  const windows = () => sw.evaluate(async () => (await chrome.windows.getAll({ populate: true })).map((w) => ({ id: w.id, type: w.type, left: w.left, top: w.top, width: w.width, height: w.height, focused: w.focused, urls: w.tabs.map((t) => t.url) })));

  await fire(sw);
  let target = await paletteTarget();
  check('on a page that cannot be scripted, the palette opens in its own window', Boolean(target));
  if (!target) return browser.close();
  const palette = await target.page();
  await palette.waitForSelector('.row');
  await palette.screenshot({ path: path.join(outDir, 'window-surface.png') });
  const all = await windows();
  const pop = all.find((w) => w.type === 'popup');
  const main = all.find((w) => w.urls.includes('chrome://version/'));
  check('it is a popup-type window', Boolean(pop));
  const offCenter = Math.abs(pop.left + pop.width / 2 - (main.left + main.width / 2));
  check('it is centered horizontally over the browser window', offCenter <= 2, `${offCenter}px off; popup ${JSON.stringify(pop)} main ${JSON.stringify({ left: main.left, top: main.top, width: main.width, height: main.height })}`);
  check('it sits in the upper part of the browser window', pop.top >= main.top && pop.top < main.top + main.height / 2);
  check('it is not the toolbar popup', (await palette.evaluate(() => document.documentElement.dataset.surface)) === 'window');
  check('the palette window itself is not listed as a tab', !(await titles(palette.mainFrame())).includes('Cmd+K'));

  await type(palette, palette.mainFrame(), 'pin');
  await palette.keyboard.press('Enter').catch(() => {});
  await sleep(400);
  const pinned = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'chrome://version/' }))[0].pinned);
  check('commands act on the tab the shortcut was pressed in', pinned === true);
  check('running a command closes the window', (await windows()).every((w) => w.type !== 'popup'));

  await fire(sw);
  target = await paletteTarget();
  const second = await target.page();
  await second.waitForSelector('.row');
  await type(second, second.mainFrame(), 'new tab');
  const before = (await windows()).find((w) => w.urls.includes('chrome://version/')).urls.length;
  await second.keyboard.press('Enter').catch(() => {});
  await sleep(500);
  const after = (await windows()).find((w) => w.urls.includes('chrome://version/'));
  check('a new tab opens in the browser window, not the palette window', after.urls.length === before + 1, `${before} -> ${after.urls.length}`);

  await page.bringToFront();
  await fire(sw);
  target = await paletteTarget();
  await (await target.page()).waitForSelector('.row');
  await fire(sw);
  await sleep(400);
  check('the shortcut toggles: a second press closes the window', (await windows()).every((w) => w.type !== 'popup'));

  await fire(sw);
  target = await paletteTarget();
  const third = await target.page();
  await third.waitForSelector('.row');
  await third.keyboard.press('Escape').catch(() => {});
  await sleep(400);
  check('Escape closes the window', (await windows()).every((w) => w.type !== 'popup'));

  // Position: the window remembers its offset from the browser window.
  const bounds = async () => {
    const all = await windows();
    return { pop: all.find((w) => w.type === 'popup'), main: all.find((w) => w.urls.includes('chrome://version/')) };
  };
  await sw.evaluate(() => chrome.storage.local.set({ positionWindow: { dx: 40, dy: 300 } }));
  await fire(sw);
  target = await paletteTarget();
  const fourth = await target.page();
  await fourth.waitForSelector('.row');
  let b = await bounds();
  check('the window opens at its saved offset from the browser window', b.pop.left === b.main.left + 40 && b.pop.top === b.main.top + 300, JSON.stringify(b.pop));
  // What dragging the title bar does: the window moves without the page seeing a pointer.
  await sw.evaluate((id, left, top) => chrome.windows.update(id, { left, top }), b.pop.id, b.pop.left + 60, b.pop.top - 100);
  await sleep(500);
  check('moving the window by its title bar saves the new offset', JSON.stringify(await stored(sw, 'positionWindow')) === JSON.stringify({ dx: 100, dy: 200 }), JSON.stringify(await stored(sw, 'positionWindow')));
  b = await bounds();
  await drag(fourth, await center(fourth.mainFrame(), '#search-icon'), 40, 30, 1);
  await sleep(500);
  const after2 = await bounds();
  check('dragging the search row moves the window itself', after2.pop.left === b.pop.left + 40 && after2.pop.top === b.pop.top + 30, `${JSON.stringify(b.pop)} -> ${JSON.stringify(after2.pop)}`);
  check('and saves that offset', JSON.stringify(await stored(sw, 'positionWindow')) === JSON.stringify({ dx: 140, dy: 230 }), JSON.stringify(await stored(sw, 'positionWindow')));
  check('a drag does not close the window', (await windows()).some((w) => w.type === 'popup'));
  await type(fourth, fourth.mainFrame(), 'reset palette position');
  await fourth.keyboard.press('Enter');
  await sleep(500);
  b = await bounds();
  const off = Math.abs(b.pop.left + b.pop.width / 2 - (b.main.left + b.main.width / 2));
  check('the reset command centers the open window', off <= 2 && b.pop.top < b.main.top + b.main.height / 2, JSON.stringify(b.pop));
  check('and forgets the saved offset', (await stored(sw, 'positionWindow')) === null);
  await fourth.keyboard.press('Escape').catch(() => {});
  await sleep(400);

  // A saved offset that no screen can show must not stop the palette opening.
  await sw.evaluate(() => chrome.storage.local.set({ positionWindow: { dx: 90000, dy: 90000 } }));
  await fire(sw);
  target = await paletteTarget();
  check('a saved offset far off every screen still opens the window', Boolean(target));
  if (target) {
    const fifth = await target.page();
    await fifth.waitForSelector('.row');
    b = await bounds();
    const drift = Math.abs(b.pop.left + b.pop.width / 2 - (b.main.left + b.main.width / 2));
    check('and falls back to the centered spot', drift <= 2, JSON.stringify({ left: b.pop.left, top: b.pop.top }));
    await fifth.keyboard.press('Escape').catch(() => {});
    await sleep(400);
  }
  await sw.evaluate(() => chrome.storage.local.remove('positionWindow'));

  const stray = await browser.newPage();
  await stray.goto(`chrome-extension://${id}/src/palette.html?mode=window#guess`);
  await sleep(400);
  check('the window surface without a valid token renders nothing', await stray.evaluate(() => document.getElementById('panel').hidden && !document.querySelector('.row')));
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
  if (want('window')) await windowSuite();
  if (want('pages')) await pagesSuite();
  if (want('idle')) await idleSuite(server);
} finally {
  server.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
