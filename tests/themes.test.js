import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEMES } from '../extension/src/catalog.js';

const read = (f) => readFileSync(new URL(`../extension/src/${f}`, import.meta.url), 'utf8');
const themes = read('themes.css');

function block(selector) {
  const at = themes.indexOf(`${selector} {`);
  assert.notEqual(at, -1, `missing block ${selector}`);
  return themes.slice(at, themes.indexOf('}', at));
}
const declared = (css) => new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
const used = new Set(
  [...(read('palette.css') + read('options.css')).matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]),
);

test('every theme defines every token the stylesheets use', () => {
  for (const [id] of THEMES) {
    const tokens = declared(block(`:root[data-theme='${id}']`));
    for (const name of used) assert.ok(tokens.has(name), `${id} is missing ${name}`);
  }
});

test('every theme defines the same token set', () => {
  const [first, ...rest] = THEMES.map(([id]) => declared(block(`:root[data-theme='${id}']`)));
  for (const tokens of rest) assert.deepEqual([...tokens].sort(), [...first].sort());
});

test('dark blocks only override tokens the light block defines', () => {
  for (const id of ['uniswap', 'cream']) {
    const light = declared(block(`:root[data-theme='${id}']`));
    for (const name of declared(block(`:root[data-theme='${id}'][data-mode='dark']`))) {
      assert.ok(light.has(name), `${id} dark sets unknown ${name}`);
    }
  }
});

test('Family has no dark block, because the system defines none', () => {
  assert.equal(themes.includes(`:root[data-theme='family'][data-mode='dark']`), false);
});

test('boot.js knows every theme id', () => {
  const boot = read('boot.js');
  for (const [id] of THEMES) assert.ok(boot.includes(`'${id}'`), id);
});
