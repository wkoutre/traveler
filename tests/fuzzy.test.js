import test from 'node:test';
import assert from 'node:assert/strict';
import { matchToken, matchText, rank, tokenize } from '../extension/src/fuzzy.js';

const items = (...titles) => titles.map((title) => ({ title }));
const titles = (rows) => rows.map((r) => r.item.title);

test('an empty query keeps every item in its original order', () => {
  assert.deepEqual(titles(rank('  ', items('b', 'a'))), ['b', 'a']);
});

test('items that do not contain every token are dropped', () => {
  assert.deepEqual(titles(rank('close tab', items('Close tab', 'Close window', 'New tab'))), ['Close tab']);
});

test('tokens match in any order', () => {
  assert.deepEqual(titles(rank('tab close', items('Close tab'))), ['Close tab']);
});

test('a word-start match outranks a mid-word match', () => {
  assert.deepEqual(titles(rank('set', items('Reset zoom', 'Settings'))), ['Settings', 'Reset zoom']);
});

test('a contiguous match outranks a scattered subsequence', () => {
  assert.deepEqual(titles(rank('dow', items('Duplicate window', 'Downloads'))), ['Downloads', 'Duplicate window']);
});

test('a subsequence still matches', () => {
  assert.ok(matchToken('bkm', 'Bookmark Manager'));
  assert.equal(matchToken('zzz', 'Bookmark Manager'), null);
});

test('matching ignores case and reports title positions', () => {
  const hit = matchText(tokenize('PASS'), 'Password Manager');
  assert.deepEqual(hit.positions, [0, 1, 2, 3]);
});

test('a keyword match finds the item but scores below a title match and highlights nothing', () => {
  const rows = rank('cache', [
    { title: 'Delete browsing data', keywords: 'clear cache cookies' },
    { title: 'Cached images and files' },
  ]);
  assert.deepEqual(titles(rows), ['Cached images and files', 'Delete browsing data']);
  assert.deepEqual(rows[1].positions, []);
});

test('bias breaks ties between kinds', () => {
  const rows = rank('git', [
    { title: 'GitHub', kind: 'history' },
    { title: 'GitHub', kind: 'tab' },
  ], (item) => (item.kind === 'tab' ? 30 : 0));
  assert.equal(rows[0].item.kind, 'tab');
});

test('regex characters in the query are treated as text', () => {
  assert.deepEqual(titles(rank('a.b(', items('a.b(c', 'axb'))), ['a.b(c']);
});

test('a scattered subsequence across the URL or keywords is not a match', () => {
  const rows = rank('book', [
    { title: 'about:blank', subtitle: 'about:blank', keywords: 'about:blank' },
    { title: 'Change the shortcut', keywords: 'keyboard hotkey rebind' },
    { title: 'Bookmark tab' },
  ]);
  assert.deepEqual(titles(rows), ['Bookmark tab']);
});

test('a subsequence spread thinly across a long title is not a match', () => {
  assert.equal(matchToken('book', 'Bluetooth on the desktop dock'), null);
  assert.ok(matchToken('gh', 'GitHub'));
  assert.ok(matchToken('bkm', 'Bookmark Manager'));
});

test('each token may match a different field', () => {
  const rows = rank('github pulls', [{ title: 'Pull requests', subtitle: 'github.com/pulls' }]);
  assert.equal(rows.length, 1);
});
