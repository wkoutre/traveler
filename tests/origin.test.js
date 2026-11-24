import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commandTab, lastNormalWindow } from '../extension/src/origin.js';

const active = { id: 11, windowId: 3, active: true };
function fakeApi(win, { fail = false } = {}) {
  const asked = [];
  return {
    asked,
    tabs: { TAB_ID_NONE: -1 },
    windows: {
      getLastFocused: async (opts) => {
        asked.push(opts);
        if (fail) throw new Error('no window');
        return win;
      },
    },
  };
}

test('the tab Chrome passes with the command is used as is', async () => {
  const api = fakeApi({ type: 'normal', tabs: [active] });
  const passed = { id: 5, windowId: 1 };
  assert.equal(await commandTab(passed, api), passed);
  assert.equal(api.asked.length, 0, 'no lookup when the tab came with the command');
});

test('a command fired without a tab (Dia) acts on the active tab of the last normal window', async () => {
  const api = fakeApi({ id: 3, type: 'normal', tabs: [{ id: 10, active: false }, active] });
  assert.equal(await commandTab(undefined, api), active);
  assert.equal(await commandTab({ id: -1 }, api), active, 'TAB_ID_NONE counts as no tab');
  // The palette's own popup must never be picked as the window to act on.
  assert.deepEqual(api.asked[0], { populate: true, windowTypes: ['normal'] });
});

test('no window, or a lookup that throws, means no tab rather than an error', async () => {
  assert.equal(await commandTab(undefined, fakeApi(undefined)), null);
  assert.equal(await commandTab(undefined, fakeApi(null, { fail: true })), null);
  assert.equal(await lastNormalWindow(fakeApi({ type: 'popup', tabs: [active] })), null);
});

test('the service worker and the palette window both fall back through commandTab', () => {
  const read = (f) => readFileSync(new URL(`../extension/src/${f}`, import.meta.url), 'utf8');
  assert.match(read('background.js'), /const tab = await commandTab\(passed\)/);
  assert.match(read('palette.js'), /\?\? \(await commandTab\(null\)\)/);
});
