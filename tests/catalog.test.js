import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAGES, GUARDED, buildCommands, confirm, DATA_TYPES, RANGES, flipPrivacy, setSiteRule, resetSiteRule, heldSiteRule } from '../extension/src/catalog.js';
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

test('closing duplicate tabs asks first and keeps active and pinned tabs', async () => {
  const removed = [];
  globalThis.chrome = {
    tabs: {
      query: async () => [
        { id: 1, url: 'https://a.test/', active: false, pinned: false },
        { id: 2, url: 'https://a.test/', active: false, pinned: false },
        { id: 3, url: 'https://a.test/', active: true, pinned: false },
        { id: 4, url: 'https://a.test/', active: false, pinned: true },
        { id: 5, url: 'https://b.test/', active: false, pinned: false },
      ],
      remove: async (ids) => removed.push(...ids),
    },
  };
  const [yes, no] = await commands.find((c) => c.id === 'tabs.closeDuplicates').children();
  assert.equal(yes.title, 'Close 1 duplicate tab');
  no.run();
  assert.deepEqual(removed, []);
  await yes.run();
  assert.deepEqual(removed, [2]);
  delete globalThis.chrome;
});

// A fake chrome.types.ChromeSetting: the extension's value overrides the
// user's until cleared, as Chrome documents.
function fakeSetting(userValue) {
  let own;
  return {
    calls: [],
    async get() {
      return own === undefined
        ? { value: userValue, levelOfControl: 'controllable_by_this_extension' }
        : { value: own, levelOfControl: 'controlled_by_this_extension' };
    },
    async set({ value }) {
      this.calls.push(`set:${value}`);
      own = value;
    },
    async clear() {
      this.calls.push('clear');
      own = undefined;
    },
  };
}

test('flipping a privacy switch back to the user\'s own value releases control', async () => {
  const setting = fakeSetting(false);
  await flipPrivacy(setting);
  assert.deepEqual(await setting.get(), { value: true, levelOfControl: 'controlled_by_this_extension' });
  await flipPrivacy(setting);
  assert.deepEqual(await setting.get(), { value: false, levelOfControl: 'controllable_by_this_extension' });
  assert.deepEqual(setting.calls, ['set:true', 'clear']);
});

test('flipping keeps control only when the user\'s own value differs from the target', async () => {
  const setting = fakeSetting(true);
  await setting.set({ value: true }); // held by the extension at the same value the user has
  setting.calls.length = 0;
  await flipPrivacy(setting);
  assert.equal((await setting.get()).value, false);
  assert.deepEqual(setting.calls, ['clear', 'set:false']);
});

function fakeSiteChrome() {
  const rules = {}; // type -> pattern -> setting, as held by the extension
  const store = {};
  const api = (type) => ({
    set: async ({ primaryPattern, setting }) => ((rules[type] ??= {})[primaryPattern] = setting),
    clear: async () => (rules[type] = {}),
  });
  return {
    rules,
    chrome: {
      contentSettings: { javascript: api('javascript'), images: api('images') },
      storage: { local: { get: async (k) => ({ [k]: store[k] }), set: async (o) => Object.assign(store, o) } },
    },
  };
}

test('resetting a site permission drops that one rule and keeps the others', async () => {
  const fake = fakeSiteChrome();
  globalThis.chrome = fake.chrome;
  await setSiteRule('javascript', 'https://a.test/*', 'block');
  await setSiteRule('javascript', 'https://b.test/*', 'block');
  await setSiteRule('images', 'https://a.test/*', 'block');
  assert.equal(await heldSiteRule('javascript', 'https://a.test/*'), 'block');
  await resetSiteRule('javascript', 'https://a.test/*');
  assert.deepEqual(fake.rules, {
    javascript: { 'https://b.test/*': 'block' },
    images: { 'https://a.test/*': 'block' },
  });
  assert.equal(await heldSiteRule('javascript', 'https://a.test/*'), undefined);
  delete globalThis.chrome;
});
