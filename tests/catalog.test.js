import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAGES, GUARDED, buildCommands, confirm, DATA_TYPES, RANGES } from '../extension/src/catalog.js';
import { ICON_NAMES } from '../extension/src/icons.js';

const commands = buildCommands();
const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url)));

test('every id is unique', () => {
  const ids = [...PAGES, ...commands].map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('every item has a title, a known icon and exactly one way to act', () => {
  for (const item of [...PAGES, ...commands]) {
    assert.ok(item.title, item.id);
    assert.ok(ICON_NAMES.includes(item.icon), `${item.id} icon ${item.icon}`);
    assert.equal(typeof item.run === 'function', typeof item.children !== 'function', item.id);
  }
});

test('every Chrome page is a chrome:// URL', () => {
  for (const page of PAGES) assert.match(page.url, /^chrome:\/\/[a-z-]+\//, page.id);
});

test('guarded commands exist and open a choice page instead of running', () => {
  for (const id of GUARDED) {
    const command = commands.find((c) => c.id === id);
    assert.ok(command, id);
    assert.equal(command.run, undefined, `${id} must not run directly`);
    assert.equal(typeof command.children, 'function', id);
  }
});

test('confirm() offers the action first, marked dangerous, and a cancel that only goes back', () => {
  let ran = false;
  const [yes, no] = confirm('Delete things', 'gone for good', () => (ran = true));
  assert.equal(yes.title, 'Delete things');
  assert.equal(yes.danger, true);
  assert.deepEqual(no.run(), { pop: true });
  assert.equal(ran, false);
});

test('deleting browsing data takes three choices: what, when, confirm', async () => {
  const calls = [];
  globalThis.chrome = { browsingData: { remove: async (...args) => calls.push(args) } };
  const what = await commands.find((c) => c.id === 'data.clear').children();
  assert.equal(what.length, DATA_TYPES.length);
  const when = await what[0].children();
  assert.equal(when.length, RANGES.length);
  const [yes, no] = await when[0].children();
  assert.equal(calls.length, 0, 'nothing is deleted before the confirm row runs');
  no.run();
  assert.equal(calls.length, 0, 'cancel deletes nothing');
  assert.deepEqual(await yes.run(), { reset: true, message: 'Deleted cached images and files' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], { cache: true, cacheStorage: true });
  assert.ok(Date.now() - calls[0][0].since >= 3600e3);
  delete globalThis.chrome;
});

test('"All time" deletes from the epoch', async () => {
  const calls = [];
  globalThis.chrome = { browsingData: { remove: async (...args) => calls.push(args) } };
  const what = await commands.find((c) => c.id === 'data.clear').children();
  const when = await what[2].children();
  const [yes] = await when.at(-1).children();
  await yes.run();
  assert.deepEqual(calls[0], [{ since: 0 }, { history: true }]);
  delete globalThis.chrome;
});

test('the manifest registers no always-on code', () => {
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(Object.keys(manifest.commands), ['open-palette']);
});

test('the manifest holds only permissions the code uses', () => {
  const source = ['background.js', 'catalog.js', 'palette.js', 'options.js']
    .map((f) => readFileSync(new URL(`../extension/src/${f}`, import.meta.url), 'utf8'))
    .join('\n');
  const evidence = {
    activeTab: 'chrome.scripting.executeScript',
    scripting: 'chrome.scripting.',
    storage: 'chrome.storage.',
    tabs: 'chrome.tabs.',
    tabGroups: 'chrome.tabGroups.',
    bookmarks: 'chrome.bookmarks.',
    history: 'chrome.history.',
    sessions: 'chrome.sessions.',
    downloads: 'chrome.downloads.',
    readingList: 'chrome.readingList.',
    favicon: '/_favicon/',
    management: 'chrome.management.',
    browsingData: 'chrome.browsingData.',
    contentSettings: 'chrome.contentSettings',
    privacy: 'chrome.privacy',
  };
  assert.deepEqual([...manifest.permissions].sort(), Object.keys(evidence).sort());
  for (const [permission, needle] of Object.entries(evidence)) assert.ok(source.includes(needle), permission);
});

test('only the palette page is web-accessible', () => {
  assert.deepEqual(manifest.web_accessible_resources.flatMap((r) => r.resources), ['src/palette.html']);
});
