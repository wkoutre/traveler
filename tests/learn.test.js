import test from 'node:test';
import assert from 'node:assert/strict';
import { rank } from '../extension/src/fuzzy.js';
import {
  HALF_LIFE,
  PROMOTE,
  CAP,
  MAX_ENTRIES,
  MAX_QUERY,
  emptyStore,
  cleanStore,
  normalize,
  keyOf,
  record,
  evidence,
  arrange,
} from '../extension/src/learn.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 20);

const page = (id, title) => ({ id, kind: 'page', title });
const SETTINGS = [page('p.settings', 'Settings'), page('p.site', 'Site settings'), page('p.appearance', 'Settings: Appearance')];

const order = (query, items, store, now = T0) => arrange(rank(query, items), store, query, now).map((r) => r.item.title);
const pick = (store, query, item, now = T0) => record(store, query, keyOf(item), now);

test('with nothing learned the order is the text order', () => {
  assert.deepEqual(order('set', SETTINGS, emptyStore()), ['Settings', 'Settings: Appearance', 'Site settings']);
});

test('one pick moves a result up but cannot take first place', () => {
  const store = pick(emptyStore(), 'set', SETTINGS[1]);
  assert.deepEqual(order('set', SETTINGS, store), ['Settings', 'Site settings', 'Settings: Appearance']);
});

test('one pick cannot take first place even from an exact tie', () => {
  const store = pick(emptyStore(), 'set', SETTINGS[2]);
  assert.equal(order('set', SETTINGS, store)[0], 'Settings');
});

test('two picks for the same typing put the result first', () => {
  let store = pick(emptyStore(), 'set', SETTINGS[2]);
  store = pick(store, 'set', SETTINGS[2], T0 + 1000);
  assert.deepEqual(order('set', SETTINGS, store, T0 + 2000), ['Settings: Appearance', 'Settings', 'Site settings']);
});

test('typing is compared without case or extra spaces', () => {
  let store = pick(emptyStore(), '  Set ', SETTINGS[1]);
  store = pick(store, 'SET', SETTINGS[1]);
  assert.equal(order('set', SETTINGS, store)[0], 'Site settings');
  assert.equal(normalize('  Two   Words '), 'two words');
});

test('switching to another result takes two picks, and demotes the old one', () => {
  let store = emptyStore();
  for (let i = 0; i < 5; i++) store = pick(store, 'set', SETTINGS[1], T0 + i);
  assert.equal(order('set', SETTINGS, store)[0], 'Site settings');
  store = pick(store, 'set', SETTINGS[2], T0 + 10);
  assert.equal(order('set', SETTINGS, store)[0], 'Site settings', 'one pick of the rival is not enough');
  store = pick(store, 'set', SETTINGS[2], T0 + 20);
  assert.equal(order('set', SETTINGS, store)[0], 'Settings: Appearance');
});

test('a pick fades: half its weight every half-life', () => {
  let store = pick(emptyStore(), 'set', SETTINGS[1]);
  store = pick(store, 'set', SETTINGS[1]);
  const at = (days) => evidence(store, 'set', T0 + days * DAY).direct.get('p.site');
  assert.equal(at(0), 2);
  assert.ok(Math.abs(at(HALF_LIFE / DAY) - 1) < 1e-9);
  assert.equal(order('set', SETTINGS, store, T0 + 10 * DAY)[0], 'Site settings', 'still first after ten days');
  assert.equal(order('set', SETTINGS, store, T0 + HALF_LIFE)[0], 'Settings', 'no longer first after a half-life unused');
});

test('a clock that moved backwards does not inflate a weight', () => {
  const store = pick(emptyStore(), 'set', SETTINGS[1]);
  assert.equal(evidence(store, 'set', T0 - 400 * DAY).direct.get('p.site'), 1);
});

test('weights are capped, so an old habit can still be replaced', () => {
  let store = emptyStore();
  for (let i = 0; i < 50; i++) store = pick(store, 'set', SETTINGS[1], T0 + i);
  assert.equal(evidence(store, 'set', T0 + 49).direct.get('p.site'), CAP);
});

test('a pick counts in part while typing toward, or past, the same text', () => {
  let store = pick(emptyStore(), 'sett', SETTINGS[2]);
  store = pick(store, 'sett', SETTINGS[2]);
  const direct = (query) => evidence(store, query, T0).direct.get('p.appearance') || 0;
  assert.equal(direct('sett'), 2);
  assert.equal(direct('set'), 1.5);
  assert.equal(direct('se'), 1);
  assert.equal(direct('settin'), 2 * (4 / 6));
  assert.equal(direct('site'), 0, 'unrelated typing gets nothing');
  assert.ok(direct('set') >= PROMOTE && direct('se') < PROMOTE);
});

test('overall use is a small bonus that never beats a clearly better text match', () => {
  const items = [page('p.a', 'Passwords'), page('p.b', 'Payment methods')];
  let store = emptyStore();
  for (let i = 0; i < 10; i++) store = pick(store, 'methods', items[1], T0 + i);
  // Equal text matches for "p": the habitual one would win the tie, but the best text match keeps first place.
  assert.deepEqual(order('pass', items, store), ['Passwords']);
  const rows = arrange(rank('pa', items), store, 'pa', T0);
  assert.equal(rows[0].item.title, 'Passwords');
});

test('promoted results are ordered by how strongly they were learned', () => {
  let store = emptyStore();
  for (let i = 0; i < 2; i++) store = pick(store, 'se', SETTINGS[2], T0 + i);
  for (let i = 0; i < 4; i++) store = pick(store, 'set', SETTINGS[1], T0 + 10 + i);
  // For "set": Site settings has 4 direct; Appearance has 2 * (2/3) = 1.33 from "se". Both promoted.
  assert.deepEqual(order('set', SETTINGS, store, T0 + 20), ['Site settings', 'Settings: Appearance', 'Settings']);
});

test('pages opened by address are learned by address, whatever kind of row shows them', () => {
  const tab = { id: 'tab:7', kind: 'tab', title: 'Pull requests', keywords: 'https://github.com/pulls' };
  const visit = { id: 'history:99', kind: 'history', title: 'Pull requests', keywords: 'https://github.com/pulls' };
  assert.equal(keyOf(tab), 'url:https://github.com/pulls');
  assert.equal(keyOf(tab), keyOf(visit));
  assert.equal(keyOf(page('p.x', 'X')), 'p.x');
  assert.equal(keyOf({ id: 'tabs.pin', kind: 'action', title: 'Pin' }), 'tabs.pin');
});

test('rows that are not a stable thing are never learned', () => {
  assert.equal(keyOf({ id: 'web:search', kind: 'web', title: 'Search the web' }), null);
  assert.equal(keyOf({ id: 'confirm:yes', kind: 'action', title: 'Delete' }), null);
  assert.equal(keyOf({ id: 'closed:1', kind: 'closed', title: 'No address' }), null);
  const store = emptyStore();
  assert.equal(record(store, 'q', null, T0), store);
  assert.equal(record(store, '   ', 'p.x', T0), store);
});

test('recording does not change the store it was given', () => {
  const before = pick(emptyStore(), 'set', SETTINGS[1]);
  const copy = structuredClone(before);
  pick(before, 'set', SETTINGS[2], T0 + 5);
  assert.deepEqual(before, copy);
});

test('long typing is cut to a fixed length', () => {
  const store = record(emptyStore(), 'x'.repeat(500), 'p.x', T0);
  assert.deepEqual(Object.keys(store.q), ['x'.repeat(MAX_QUERY)]);
});

test('the record is capped; the weakest entries go first', () => {
  let store = emptyStore();
  store = record(store, 'keep', 'p.keep', T0);
  store = record(store, 'keep', 'p.keep', T0 + 1);
  for (let i = 0; i < MAX_ENTRIES + 20; i++) store = record(store, `q${i}`, `p.${i}`, T0 + 2 + i);
  const count = Object.values(store.q).reduce((n, entries) => n + Object.keys(entries).length, 0);
  assert.equal(count, MAX_ENTRIES);
  assert.ok(store.q.keep, 'the twice-picked entry survives');
  assert.equal(store.q.q0, undefined, 'the oldest single pick is dropped');
});

test('entries that have faded to nothing are dropped on the next pick', () => {
  let store = record(emptyStore(), 'old', 'p.old', T0);
  store = record(store, 'new', 'p.new', T0 + 400 * DAY);
  assert.deepEqual(Object.keys(store.q), ['new']);
});

test('a damaged or foreign saved value is cleaned, never trusted', () => {
  assert.deepEqual(cleanStore(undefined), emptyStore());
  assert.deepEqual(cleanStore('nope'), emptyStore());
  assert.deepEqual(cleanStore({ v: 99, q: { a: { k: [1, T0] } } }), emptyStore());
  const cleaned = cleanStore({
    v: 1,
    q: {
      good: { 'p.a': [2, T0], bad: ['x', T0], worse: [1], inf: [Infinity, T0], neg: [-1, T0] },
      empty: { bad: [NaN, T0] },
      notAnObject: 5,
    },
  });
  assert.deepEqual(cleaned, { v: 1, q: { good: { 'p.a': [2, T0] } } });
  assert.equal(cleanStore({ v: 1, q: { a: { k: [1e9, T0] } } }).q.a.k[0], CAP);
});

test('arranging keeps every row and its highlight positions', () => {
  const store = pick(pick(emptyStore(), 'set', SETTINGS[2]), 'set', SETTINGS[2]);
  const ranked = rank('set', SETTINGS);
  const rows = arrange(ranked, store, 'set', T0);
  assert.equal(rows.length, ranked.length);
  for (const row of rows) assert.deepEqual(row.positions, ranked.find((r) => r.item === row.item).positions);
});

test('arranging does not reorder or mutate its input', () => {
  const ranked = rank('set', SETTINGS);
  const before = ranked.map((r) => ({ title: r.item.title, score: r.score }));
  arrange(ranked, pick(pick(emptyStore(), 'set', SETTINGS[2]), 'set', SETTINGS[2]), 'set', T0);
  assert.deepEqual(ranked.map((r) => ({ title: r.item.title, score: r.score })), before);
});
