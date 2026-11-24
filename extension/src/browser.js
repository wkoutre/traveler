// Browser-specific pages without a hand-kept list. Pure, tested in Node.
//
// Browsers give extensions no list of their own internal pages, and an
// extension cannot load one to read it. Two things still work everywhere:
//   1. The settings page's own search: chrome://settings/?search=<text>.
//      Brave, Edge and Opera redirect chrome:// to their own scheme, so this one
//      address reaches every setting a browser has, its own ones included.
//   2. Remembering the internal pages the user has had open (brave://rewards,
//      edge://settings/..., vivaldi://...), with the title the browser gave them.

// The browser's own name, for labels only. Brands come from
// navigator.userAgentData; Vivaldi, Arc and Dia report only "Chromium".
const BRANDS = [
  ['Brave', 'Brave'],
  ['Microsoft Edge', 'Edge'],
  ['Opera GX', 'Opera GX'],
  ['Opera', 'Opera'],
  ['Vivaldi', 'Vivaldi'],
  ['Google Chrome', 'Chrome'],
];
export function browserName(brands = [], ua = '') {
  const names = brands.map((b) => b.brand);
  for (const [brand, name] of BRANDS) if (names.includes(brand)) return name;
  if (/\bEdg\//.test(ua)) return 'Edge';
  if (/\bOPR\//.test(ua)) return 'Opera';
  if (/\bVivaldi\//.test(ua)) return 'Vivaldi';
  return '';
}

export function settingsSearchUrl(text) {
  return `chrome://settings/?search=${encodeURIComponent(text.trim())}`;
}

// Internal pages: the browser's own scheme, never an extension, devtools or web page.
const INTERNAL = /^(chrome|brave|edge|opera|vivaldi|arc|dia):\/\/[a-z0-9-]+/i;
export function isInternalPage(url = '') {
  return INTERNAL.test(url) && !/^chrome:\/\/(newtab|new-tab-page)\b/i.test(url) && !/^[a-z]+:\/\/newtab\b/i.test(url);
}

// chrome://settings/x and brave://settings/x are the same page.
export function pageKey(url = '') {
  return url.replace(/^[a-z]+:\/\//i, 'chrome://').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
}

export const VISITED_CAP = 150;

// Adds the internal pages among `seen` ({ url, title, incognito? }) to the
// store { [key]: { url, title, at } }. Private-window pages are skipped, and
// only the newest VISITED_CAP entries are kept. Returns the same object when
// nothing changed, so callers can skip the write.
export function rememberPages(store = {}, seen = [], now = Date.now()) {
  let next = store;
  for (const page of seen) {
    if (!page?.url || page.incognito || !isInternalPage(page.url)) continue;
    const key = pageKey(page.url);
    const title = (page.title || '').trim();
    const old = next[key];
    // A title that is only the address carries nothing; keep a real one.
    const better = title && title !== page.url ? title : old?.title || '';
    if (old && old.url === page.url && old.title === better && now - old.at < 3600e3) continue;
    if (next === store) next = { ...store };
    next[key] = { url: page.url, title: better, at: now };
  }
  const keys = Object.keys(next);
  if (keys.length > VISITED_CAP) {
    next = Object.fromEntries(
      keys
        .sort((a, b) => next[b].at - next[a].at)
        .slice(0, VISITED_CAP)
        .map((k) => [k, next[k]]),
    );
  }
  return next;
}

// Drops anything malformed a stale or tampered store may hold.
export function cleanVisited(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, v] of Object.entries(raw)) {
    if (v && typeof v.url === 'string' && isInternalPage(v.url) && typeof v.at === 'number' && pageKey(v.url) === key) {
      out[key] = { url: v.url, title: typeof v.title === 'string' ? v.title : '', at: v.at };
    }
  }
  return out;
}

// The remembered pages the catalog does not already list, newest first.
export function visitedPages(store, catalogUrls = []) {
  const known = new Set(catalogUrls.map(pageKey));
  return Object.entries(store)
    .filter(([key]) => !known.has(key))
    .sort((a, b) => b[1].at - a[1].at)
    .map(([, v]) => v);
}

// The chrome:// spelling of a page, for browsers that refuse to open their own scheme from an extension.
export function chromeSpelling(url) {
  return url.replace(/^[a-z]+:\/\//i, 'chrome://');
}
