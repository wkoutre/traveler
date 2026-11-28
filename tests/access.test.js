import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAccess, hasAccess, detailsUrl } from '../extension/src/access.js';

const api = (request, contains = async () => false) => ({
  runtime: { id: 'abc' },
  permissions: { request, contains },
});

test('a granted request reports granted, a refused one denied', async () => {
  assert.equal(await requestAccess(api(async () => true), 50), 'granted');
  assert.equal(await requestAccess(api(async () => false), 50), 'denied');
});

test('asks for websites only', async () => {
  let asked;
  await requestAccess(api(async (p) => ((asked = p), true)), 50);
  assert.deepEqual(asked, { origins: ['http://*/*', 'https://*/*'] });
});

test('a request the browser never answers (Dia shows no prompt) reports no-prompt', async () => {
  const started = Date.now();
  assert.equal(await requestAccess(api(() => new Promise(() => {})), 50), 'no-prompt');
  assert.ok(Date.now() - started < 1000);
});

test('a request that throws also sends the user to the manual route', async () => {
  assert.equal(await requestAccess(api(async () => { throw new Error('nope'); }), 50), 'no-prompt');
});

test('access and the extension page', async () => {
  assert.equal(await hasAccess(api(null, async () => true)), true);
  assert.equal(await hasAccess(api(null, async () => { throw new Error('x'); })), false);
  assert.equal(detailsUrl(api(null)), 'chrome://extensions/?id=abc');
});
