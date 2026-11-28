import test from 'node:test';
import assert from 'node:assert/strict';
import { openOverlay, lacksAccess } from '../extension/src/overlay.js';

// Chrome's own wording for each refusal.
const NO_GRANT = 'Cannot access contents of the page. Extension manifest must request permission to access the respective host.';
const NO_GRANT_URL = 'Cannot access contents of url "https://a.test/". Extension manifest must request permission to access this host.';
const GALLERY = 'The extensions gallery cannot be scripted.';
const BROWSER_PAGE = 'Cannot access a chrome:// URL';

function fakeApi(inject) {
  const stored = {};
  return {
    stored,
    runtime: { getURL: (p) => `chrome-extension://abc/${p}` },
    storage: { session: { set: async (o) => Object.assign(stored, o) } },
    scripting: { executeScript: inject },
  };
}

test('a page the overlay opens or closes on reports that', async () => {
  for (const result of ['opened', 'closed']) {
    const api = fakeApi(async () => [{ result }]);
    assert.equal(await openOverlay({ id: 1, url: 'https://a.test/' }, api), result);
  }
});

test('the overlay frame carries a one-time token stored for this press', async () => {
  let args;
  const api = fakeApi(async (opts) => {
    args = opts;
    return [{ result: 'opened' }];
  });
  await openOverlay({ id: 7, url: 'https://a.test/' }, api);
  const token = args.args[0].split('#')[1];
  assert.equal(api.stored[`overlay:${token}`], true);
  assert.equal(args.target.tabId, 7);
});

test('a web page the key press got no access to (Dia) is told apart from one that cannot be scripted', async () => {
  const refuse = (message) => fakeApi(async () => {
    throw new Error(message);
  });
  assert.equal(await openOverlay({ id: 1, url: 'https://a.test/' }, refuse(NO_GRANT)), 'no-access');
  assert.equal(await openOverlay({ id: 1, url: 'http://a.test/x' }, refuse(NO_GRANT_URL)), 'no-access');
  // Allowing website access cannot help on these, so they never offer it.
  assert.equal(await openOverlay({ id: 1, url: 'https://chromewebstore.google.com/' }, refuse(GALLERY)), 'failed');
  assert.equal(await openOverlay({ id: 1, url: 'chrome://settings/' }, refuse(BROWSER_PAGE)), 'failed');
  assert.equal(await openOverlay({ id: 1, url: 'chrome://settings/' }, refuse(NO_GRANT)), 'failed');
});

test('no tab, or a script that did not run, is a plain failure', async () => {
  assert.equal(await openOverlay(null, fakeApi(async () => [{ result: 'opened' }])), 'failed');
  assert.equal(await openOverlay({ id: 1, url: 'https://a.test/' }, fakeApi(async () => [{ result: 'failed' }])), 'failed');
  assert.equal(lacksAccess(new Error(NO_GRANT), {}), false, 'a tab without a known address is not offered access');
});
