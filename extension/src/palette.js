import { rank } from './fuzzy.js';
import { PAGES, buildCommands } from './catalog.js';
import { icon } from './icons.js';

const surface = document.documentElement.dataset.surface || 'tab';
const $ = (id) => document.getElementById(id);
const els = {
  scrim: $('scrim'),
  panel: $('panel'),
  input: $('input'),
  list: $('list'),
  scopes: $('scopes'),
  crumbs: $('crumbs'),
  status: $('status'),
};

const SCOPES = [
  ['all', 'All'],
  ['tabs', 'Tabs'],
  ['actions', 'Actions'],
  ['settings', 'Settings'],
  ['bookmarks', 'Bookmarks'],
  ['history', 'History'],
];
const SCOPE_KINDS = {
  tabs: ['tab', 'closed'],
  actions: ['action'],
  settings: ['page'],
  bookmarks: ['bookmark', 'reading'],
  history: ['history', 'closed'],
};
const KIND_LABEL = {
  tab: 'Tab',
  closed: 'Recently closed',
  action: 'Action',
  page: 'Chrome',
  bookmark: 'Bookmark',
  reading: 'Reading List',
  history: 'History',
  web: 'Web',
};
// Small nudges so an open tab outranks a history entry with the same text.
const KIND_BIAS = { tab: 30, action: 18, page: 14, closed: 6, bookmark: 4, reading: 2, history: 0 };
const MAX_ROWS = 60;

const state = {
  scope: 'all',
  stack: [], // nested pages: { title, items }
  rows: [], // rendered rows: { item, positions }
  active: 0,
  tab: null,
  tabs: [],
  closed: [],
  reading: [],
  commands: buildCommands(),
  searchSeq: 0,
};

// ---- Opening and closing ------------------------------------------------

// palette.html is web-accessible so the overlay can frame it, which also lets
// any page frame it or open it in a tab. It renders in three cases only:
//   overlay  the URL carries a one-time token the service worker stored for this key press
//   popup    it is the toolbar popup (top-level, and not a tab)
//   tab      a developer or test set `devTab` in session storage, which pages cannot reach
async function authorized() {
  if (surface === 'overlay') {
    const key = `overlay:${location.hash.slice(1)}`;
    history.replaceState(null, '', location.pathname + location.search);
    if (key === 'overlay:') return false;
    const stored = await chrome.storage.session.get(key);
    if (stored[key] !== true) return false;
    await chrome.storage.session.remove(key);
    return true;
  }
  if (window.top !== window) return false;
  const tab = await chrome.tabs.getCurrent();
  if (surface === 'popup' && !tab) return true;
  const { devTab } = await chrome.storage.session.get('devTab');
  return devTab === true;
}

function close() {
  if (surface === 'overlay') window.parent.postMessage('cmdk:close', '*');
  else window.close();
}

// ---- Data ---------------------------------------------------------------

function faviconFor(url) {
  return `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(url)}&size=32`;
}

function tabItem(t) {
  return {
    id: `tab:${t.id}`,
    kind: 'tab',
    title: t.title || t.url || 'Untitled',
    subtitle: prettyUrl(t.url),
    keywords: t.url,
    favicon: t.url,
    tabId: t.id,
    current: t.id === state.tab?.id,
    run: async () => {
      await chrome.tabs.update(t.id, { active: true });
      await chrome.windows.update(t.windowId, { focused: true });
    },
  };
}

function urlItem(kind, id, title, url, extra = {}) {
  return {
    id,
    kind,
    title: title || url,
    subtitle: prettyUrl(url),
    keywords: url,
    favicon: url,
    run: () => chrome.tabs.create({ url }),
    ...extra,
  };
}

function prettyUrl(url = '') {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

async function loadContext() {
  const [[active], tabs, closed, reading] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    chrome.tabs.query({}),
    chrome.sessions.getRecentlyClosed({ maxResults: 25 }).catch(() => []),
    chrome.readingList.query({}).catch(() => []),
  ]);
  state.tab = active || null;
  state.tabs = tabs
    .filter((t) => !(surface === 'tab' && t.url === location.href))
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))
    .map(tabItem);
  state.closed = closed
    .filter((s) => s.tab?.url)
    .map((s) =>
      urlItem('closed', `closed:${s.tab.sessionId}`, s.tab.title, s.tab.url, {
        run: () => chrome.sessions.restore(s.tab.sessionId),
      }),
    );
  state.reading = reading.map((r) => urlItem('reading', `reading:${r.url}`, r.title, r.url));
}

function localItems() {
  return [...state.tabs, ...state.commands, ...PAGES, ...state.closed, ...state.reading];
}

function inScope(item) {
  return state.scope === 'all' || SCOPE_KINDS[state.scope].includes(item.kind);
}

async function remoteItems(query) {
  const wantBookmarks = state.scope === 'all' || state.scope === 'bookmarks';
  const wantHistory = state.scope === 'all' || state.scope === 'history';
  const [bookmarks, visits] = await Promise.all([
    wantBookmarks ? chrome.bookmarks.search(query).catch(() => []) : [],
    wantHistory ? chrome.history.search({ text: query, maxResults: 30, startTime: 0 }).catch(() => []) : [],
  ]);
  return [
    ...bookmarks.filter((b) => b.url).slice(0, 30).map((b) => urlItem('bookmark', `bookmark:${b.id}`, b.title, b.url)),
    ...visits.map((v) => urlItem('history', `history:${v.id}`, v.title, v.url)),
  ];
}

function webItems(query) {
  const items = [];
  const looksLikeUrl = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(query) || /^https?:\/\//.test(query);
  if (looksLikeUrl) {
    const url = /^https?:\/\//.test(query) ? query : `https://${query}`;
    items.push({ id: 'web:open', kind: 'web', title: `Open ${query}`, icon: 'globe', run: () => chrome.tabs.create({ url }) });
  }
  items.push({
    id: 'web:search',
    kind: 'web',
    title: `Search the web for “${query}”`,
    icon: 'search',
    run: () => chrome.tabs.create({ url: `https://www.google.com/search?q=${encodeURIComponent(query)}` }),
  });
  return items;
}

// ---- Search -------------------------------------------------------------

function dedupe(rows) {
  const seen = new Set();
  const openUrls = new Set(state.tabs.map((t) => t.keywords));
  return rows.filter(({ item }) => {
    // An open tab already represents its URL; hide the history or bookmark twin.
    if ((item.kind === 'history' || item.kind === 'bookmark') && openUrls.has(item.keywords)) return false;
    const key = item.kind === 'tab' || item.kind === 'action' || item.kind === 'page' ? item.id : item.keywords || item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function refresh() {
  const query = els.input.value.trim();
  const seq = ++state.searchSeq;
  const page = state.stack.at(-1);
  if (page) {
    setRows(rank(query, page.items));
    return;
  }
  const local = localItems().filter(inScope);
  if (!query) {
    setRows(emptyRows(local));
    return;
  }
  const bias = (item) => KIND_BIAS[item.kind] || 0;
  const localRows = rank(query, local, bias);
  const web = state.scope === 'all' ? webItems(query).map((item) => ({ item, positions: [] })) : [];
  // A typed address is most likely meant literally, so "Open" leads; the web search trails.
  const head = web.filter((r) => r.item.id === 'web:open');
  const tail = web.filter((r) => r.item.id !== 'web:open');
  setRows([...head, ...dedupe(localRows), ...tail]);
  // Bookmarks and history come from Chrome's own indexes, asynchronously.
  remoteItems(query).then((remote) => {
    if (seq !== state.searchSeq) return;
    const activeId = state.rows[state.active]?.item.id;
    const merged = dedupe([...localRows, ...rank(query, remote, bias)].sort((a, b) => b.score - a.score));
    setRows([...head, ...merged, ...tail], activeId);
  });
}

function emptyRows(local) {
  if (state.scope === 'all') {
    const tabs = state.tabs.filter((t) => !t.current).slice(0, 6);
    const starter = ['tab.reopen', 'tab.copyUrl', 'tab.pin', 'group.add', 'data.clear', 'site.permissions'];
    const suggested = starter.map((id) => state.commands.find((c) => c.id === id)).filter(Boolean);
    const settings = PAGES.slice(0, 1);
    return [
      ...tabs.map((item) => ({ item, positions: [], section: 'Recent tabs' })),
      ...suggested.map((item) => ({ item, positions: [], section: 'Suggested' })),
      ...settings.map((item) => ({ item, positions: [], section: 'Suggested' })),
    ];
  }
  return local.map((item) => ({ item, positions: [], section: item.section }));
}

// ---- Rendering ----------------------------------------------------------

function setRows(rows, keepActiveId) {
  state.rows = rows.slice(0, MAX_ROWS);
  const kept = keepActiveId ? state.rows.findIndex((r) => r.item.id === keepActiveId) : -1;
  state.active = kept >= 0 ? kept : 0;
  render();
}

function highlight(text, positions) {
  const frag = document.createDocumentFragment();
  if (!positions.length) {
    frag.append(text);
    return frag;
  }
  const marks = new Set(positions);
  let run = '';
  let marked = false;
  const flush = () => {
    if (!run) return;
    if (marked) {
      const mark = document.createElement('mark');
      mark.textContent = run;
      frag.append(mark);
    } else frag.append(run);
    run = '';
  };
  for (let i = 0; i < text.length; i++) {
    const isMark = marks.has(i);
    if (isMark !== marked) flush();
    marked = isMark;
    run += text[i];
  }
  flush();
  return frag;
}

function rowElement(row, index) {
  const { item, positions } = row;
  const el = document.createElement('div');
  el.className = 'row';
  el.id = `row-${index}`;
  el.setAttribute('role', 'option');
  el.dataset.index = index;
  if (item.danger) el.dataset.danger = '';

  const lead = document.createElement('span');
  lead.className = 'lead';
  if (item.favicon) {
    const img = document.createElement('img');
    img.src = faviconFor(item.favicon);
    img.alt = '';
    img.width = 16;
    img.height = 16;
    lead.append(img);
  } else lead.append(icon(item.icon));

  const text = document.createElement('span');
  text.className = 'text';
  const title = document.createElement('span');
  title.className = 'title';
  title.append(highlight(item.title, positions));
  text.append(title);
  if (item.subtitle) {
    const sub = document.createElement('span');
    sub.className = 'subtitle';
    sub.textContent = item.subtitle;
    text.append(sub);
  }

  const tag = document.createElement('span');
  tag.className = 'tag';
  if (item.children) tag.append(icon('chevron'));
  else if (!state.stack.length) tag.textContent = item.current ? 'Current tab' : KIND_LABEL[item.kind] || '';

  el.append(lead, text, tag);
  return el;
}

function render() {
  els.list.replaceChildren();
  if (!state.rows.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = state.stack.length ? 'Nothing here' : 'No matches';
    els.list.append(empty);
    els.input.removeAttribute('aria-activedescendant');
    return;
  }
  let section;
  state.rows.forEach((row, index) => {
    if (row.section && row.section !== section) {
      section = row.section;
      const label = document.createElement('div');
      label.className = 'section';
      label.textContent = section;
      els.list.append(label);
    }
    els.list.append(rowElement(row, index));
  });
  setActive(state.active, false);
}

function setActive(index, scroll = true) {
  const count = state.rows.length;
  if (!count) return;
  state.active = (index + count) % count;
  for (const el of els.list.querySelectorAll('.row[aria-selected="true"]')) el.removeAttribute('aria-selected');
  const el = $(`row-${state.active}`);
  if (!el) return;
  el.setAttribute('aria-selected', 'true');
  els.input.setAttribute('aria-activedescendant', el.id);
  if (scroll) el.scrollIntoView({ block: 'nearest' });
  else if (state.active === 0) els.list.scrollTop = 0;
}

function renderScopes() {
  els.scopes.replaceChildren(
    ...SCOPES.map(([id, label]) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'pill';
      pill.textContent = label;
      pill.tabIndex = -1;
      pill.setAttribute('role', 'tab');
      pill.setAttribute('aria-selected', String(id === state.scope));
      pill.addEventListener('click', () => setScope(id));
      return pill;
    }),
  );
  els.scopes.hidden = state.stack.length > 0;
  $('hint-scope').hidden = state.stack.length > 0;
  $('hint-back').hidden = state.stack.length === 0;
}

function renderCrumbs() {
  els.crumbs.replaceChildren(
    ...state.stack.map((page) => {
      const crumb = document.createElement('span');
      crumb.className = 'crumb';
      crumb.textContent = page.title;
      return crumb;
    }),
  );
  els.input.placeholder = state.stack.length ? 'Filter' : 'Search tabs, settings and commands';
}

function setScope(id) {
  state.scope = id;
  renderScopes();
  refresh();
  els.input.focus();
}

let statusTimer;
function say(message) {
  els.status.textContent = message || '';
  clearTimeout(statusTimer);
  if (message) statusTimer = setTimeout(() => (els.status.textContent = ''), 2600);
}

// ---- Running ------------------------------------------------------------

const ctx = {
  get tab() {
    return state.tab;
  },
  async setPrefs(patch, message) {
    const prefs = { ...readPrefs(), ...patch };
    localStorage.setItem('prefs', JSON.stringify(prefs));
    await chrome.storage.local.set({ prefs });
    applyPrefs(prefs);
    return { keep: true, message };
  },
};

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem('prefs') || '{}');
  } catch {
    return {};
  }
}

function applyPrefs(prefs) {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme || 'family';
  const appearance = prefs.appearance || 'system';
  const dark = appearance === 'dark' || (appearance === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.mode = dark ? 'dark' : 'light';
}

async function pushPage(item) {
  let items;
  try {
    items = await item.children(ctx);
  } catch (error) {
    say(`Could not open: ${error.message}`);
    return;
  }
  state.stack.push({ title: item.title, items, source: item });
  els.input.value = '';
  renderCrumbs();
  renderScopes();
  refresh();
}

async function popPage(message) {
  state.stack.pop();
  // Rebuild the parent so it shows the state the child just changed.
  const parent = state.stack.at(-1);
  if (parent?.source?.children) {
    try {
      parent.items = await parent.source.children(ctx);
    } catch {
      // Keep the stale list rather than an empty page.
    }
  }
  els.input.value = '';
  renderCrumbs();
  renderScopes();
  refresh();
  say(message);
}

async function runRow(row) {
  if (!row) return;
  const { item } = row;
  if (item.children) return pushPage(item);
  if (item.kind === 'action' && !state.tab && /^(tab|tabs|group|win|site)\./.test(item.id)) {
    say('No active tab');
    return;
  }
  let result;
  try {
    result = await item.run(ctx);
  } catch (error) {
    say(error?.message || 'That did not work');
    return;
  }
  if (result?.pop) return popPage(result.message);
  if (result?.reset) {
    state.stack = [];
    els.input.value = '';
    renderCrumbs();
    renderScopes();
    await loadContext();
    refresh();
    say(result.message);
    return;
  }
  if (result?.keep) {
    await loadContext();
    refresh();
    say(result.message);
    return;
  }
  close();
}

async function closeTabRow(row) {
  if (row?.item.kind !== 'tab') return;
  await chrome.tabs.remove(row.item.tabId);
  const index = state.active;
  await loadContext();
  refresh();
  setActive(Math.min(index, state.rows.length - 1));
  say('Tab closed');
}

// ---- Input --------------------------------------------------------------

function onKeydown(event) {
  const mod = event.metaKey || event.ctrlKey;
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      setActive(state.active + 1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      setActive(state.active - 1);
      break;
    case 'n':
    case 'p':
      if (!event.ctrlKey) return;
      event.preventDefault();
      setActive(state.active + (event.key === 'n' ? 1 : -1));
      break;
    case 'Enter':
      event.preventDefault();
      runRow(state.rows[state.active]);
      break;
    case 'Escape':
      event.preventDefault();
      if (state.stack.length) popPage();
      else close();
      break;
    case 'Tab': {
      event.preventDefault();
      if (state.stack.length) break;
      const at = SCOPES.findIndex(([id]) => id === state.scope);
      const next = (at + (event.shiftKey ? -1 : 1) + SCOPES.length) % SCOPES.length;
      setScope(SCOPES[next][0]);
      break;
    }
    case 'Backspace':
      if (mod) {
        event.preventDefault();
        closeTabRow(state.rows[state.active]);
      } else if (!els.input.value && state.stack.length) {
        event.preventDefault();
        popPage();
      }
      break;
    default:
  }
}

function wire() {
  els.input.addEventListener('input', refresh);
  document.addEventListener('keydown', onKeydown);
  els.list.addEventListener('mousemove', (event) => {
    const row = event.target.closest('.row');
    if (row && Number(row.dataset.index) !== state.active) setActive(Number(row.dataset.index), false);
  });
  els.list.addEventListener('click', (event) => {
    const row = event.target.closest('.row');
    if (row) runRow(state.rows[Number(row.dataset.index)]);
  });
  els.scrim.addEventListener('mousedown', (event) => {
    if (event.target === els.scrim) close();
    else if (event.target !== els.input) {
      // Keep typing focus in the field when a row or pill is clicked.
      event.preventDefault();
    }
  });
  window.addEventListener('focus', () => els.input.focus());
}

async function start() {
  if (!(await authorized())) {
    // Never leave an inert full-page frame over the tab.
    if (surface === 'overlay') close();
    return;
  }
  $('search-icon').append(icon('search'));
  wire();
  renderScopes();
  els.panel.hidden = false;
  els.input.focus();
  await loadContext();
  // Show the shortcut as it is bound now, since it can be changed in Chrome.
  const bound = (await chrome.commands.getAll()).find((c) => c.name === 'open-palette')?.shortcut;
  const shortcut = state.commands.find((c) => c.id === 'palette.shortcut');
  if (shortcut) shortcut.subtitle = bound ? `Now ${bound}` : 'Not set';
  refresh();
  // Storage is the source of truth; localStorage is only the pre-paint mirror.
  const { prefs } = await chrome.storage.local.get('prefs');
  if (prefs) {
    localStorage.setItem('prefs', JSON.stringify(prefs));
    applyPrefs(prefs);
  }
}

start();
