import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { browserName, chromeSpelling, cleanVisited, isInternalPage, pageKey, rememberPages, settingsSearchUrl, visitedPages, VISITED_CAP } from '../extension/src/browser.js';

const b = (...names) => names.map((brand) => ({ brand, version: '1' }));

test('the browser is named from its brands, then its user agent', () => {
  assert.equal(browserName(b('Not)A;Brand', 'Chromium', 'Brave')), 'Brave');
  assert.equal(browserName(b('Chromium', 'Microsoft Edge')), 'Edge');
  assert.equal(browserName(b('Chromium', 'Opera GX', 'Opera')), 'Opera GX');
  assert.equal(browserName(b('Chromium', 'Google Chrome')), 'Chrome');
  assert.equal(browserName(b('Chromium'), 'Mozilla/5.0 ... Chrome/142 Safari/537.36 Vivaldi/7.7'), 'Vivaldi');
  // Dia and Arc say only Chromium: no name rather than a wrong one.
  assert.equal(browserName(b('Chromium'), 'Mozilla/5.0 ... Chrome/142 Safari/537.36'), '');
  assert.equal(browserName(undefined, undefined), '');
});

test('settings search goes through chrome://settings, which other browsers redirect to their own scheme', () => {
  assert.equal(settingsSearchUrl(' keyboard shortcuts '), 'chrome://settings/?search=keyboard%20shortcuts');
  assert.equal(settingsSearchUrl('a&b#c'), 'chrome://settings/?search=a%26b%23c');
});

test('only the browser’s own pages count as internal', () => {
  for (const url of ['brave://rewards/', 'edge://settings/privacy', 'vivaldi://settings/', 'opera://flags', 'chrome://settings/system/shortcuts']) assert.ok(isInternalPage(url), url);
  for (const url of ['https://brave.com/', 'chrome-extension://abc/x.html', 'devtools://devtools/', 'chrome://newtab/', 'brave://newtab/', 'chrome://new-tab-page/', 'about:blank', '']) assert.ok(!isInternalPage(url), url);
});

test('the same page under two schemes is one entry', () => {
  assert.equal(pageKey('brave://settings/shortcuts'), pageKey('chrome://settings/shortcuts/'));
  assert.equal(pageKey('edge://settings/?search=x#y'), 'chrome://settings');
  assert.equal(chromeSpelling('brave://rewards/'), 'chrome://rewards/');
});

test('open and recently closed browser pages are remembered, private ones are not', () => {
  const seen = [
    { url: 'brave://settings/system/shortcuts', title: 'Settings - Shortcuts' },
    { url: 'brave://rewards/', title: 'brave://rewards/' },
    { url: 'brave://wallet/', title: 'Wallet', incognito: true },
    { url: 'https://example.com/', title: 'Example' },
  ];
  const store = rememberPages({}, seen, 1000);
  assert.deepEqual(Object.keys(store).sort(), ['chrome://rewards', 'chrome://settings/system/shortcuts']);
  assert.equal(store['chrome://rewards'].title, '', 'a title that is only the address is not kept');
  // A real title arriving later replaces the empty one; an address-only title never replaces a real one.
  const later = rememberPages(store, [{ url: 'brave://rewards/', title: 'Rewards' }], 2000);
  assert.equal(later['chrome://rewards'].title, 'Rewards');
  assert.equal(rememberPages(later, [{ url: 'brave://rewards/', title: 'brave://rewards/' }], 3000)['chrome://rewards'].title, 'Rewards');
});

test('nothing changed means the same object, so no storage write', () => {
  const store = rememberPages({}, [{ url: 'brave://rewards/', title: 'Rewards' }], 1000);
  assert.equal(rememberPages(store, [{ url: 'brave://rewards/', title: 'Rewards' }], 1000 + 60e3), store);
  assert.equal(rememberPages(store, [{ url: 'https://a.test/' }], 5000), store);
  assert.notEqual(rememberPages(store, [{ url: 'brave://rewards/', title: 'Rewards' }], 1000 + 3600e3), store, 'refreshed once an hour');
});

test('the store keeps only the newest pages', () => {
  const seen = Array.from({ length: VISITED_CAP + 20 }, (_, i) => ({ url: `brave://p${i}/`, title: `P${i}` }));
  let store = {};
  seen.forEach((page, i) => (store = rememberPages(store, [page], i)));
  assert.equal(Object.keys(store).length, VISITED_CAP);
  assert.ok(store['chrome://p169'] && !store['chrome://p0']);
});

test('a malformed store is cleaned, not trusted', () => {
  const raw = {
    'chrome://rewards': { url: 'brave://rewards/', title: 'Rewards', at: 1 },
    'chrome://evil': { url: 'https://evil.test/', title: 'x', at: 1 },
    'chrome://mismatch': { url: 'brave://wallet/', title: 'x', at: 1 },
    'chrome://noat': { url: 'brave://noat/', title: 'x' },
  };
  assert.deepEqual(Object.keys(cleanVisited(raw)), ['chrome://rewards']);
  for (const bad of [null, [], 'x', 3]) assert.deepEqual(cleanVisited(bad), {});
});

test('pages the catalog already lists are not repeated, newest first', () => {
  const store = rememberPages({}, [{ url: 'brave://extensions/', title: 'Extensions' }], 1);
  const more = rememberPages(store, [{ url: 'brave://rewards/', title: 'Rewards' }], 2);
  const both = rememberPages(more, [{ url: 'brave://wallet/', title: 'Wallet' }], 3);
  assert.deepEqual(visitedPages(both, ['chrome://extensions/']).map((p) => p.title), ['Wallet', 'Rewards']);
});

test('the palette wires the settings search row and remembered pages', () => {
  const source = readFileSync(new URL('../extension/src/palette.js', import.meta.url), 'utf8');
  assert.match(source, /items\.push\(settingsSearchItem\(query\)\)/);
  assert.match(source, /state\.scope === 'settings' \? \[settingsSearchItem\(query\)\]/);
  assert.match(source, /\.\.\.PAGES, \.\.\.state\.visited/);
  assert.match(source, /remove\(\['learned', 'visitedPages'\]\)/);
});
