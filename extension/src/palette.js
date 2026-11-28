import { rank } from './fuzzy.js';
import { arrange, cleanStore, emptyStore, keyOf, record } from './learn.js';
import { PAGES, buildCommands, openTab, searchWeb, setHomeWindow, themeId } from './catalog.js';
import { icon } from './icons.js';
import { commandTab } from './origin.js';
import { SITE_ACCESS, openOverlay } from './overlay.js';
import { browserName, chromeSpelling, cleanVisited, rememberPages, settingsSearchUrl, visitedPages } from './browser.js';
import { clampPanel, panelFractions, panelSpot, windowOffset, windowSpot } from './position.js';

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
// The browser's own name (Brave, Edge, ...), for labels; empty when it does not say.
const BROWSER_NAME = browserName(navigator.userAgentData?.brands, navigator.userAgent) || (navigator.brave ? 'Brave' : '');
const KIND_LABEL = {
  tab: 'Tab',
  closed: 'Recently closed',
  action: 'Action',
  page: BROWSER_NAME || 'Browser',
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
  visited: [], // internal pages (brave://, edge://, ...) seen open, see browser.js
  commands: buildCommands(),
  access: null, // the "allow access to websites" row, when this browser needs it
  searchSeq: 0,
};

// ---- Opening and closing ------------------------------------------------

// palette.html is web-accessible so the overlay can frame it, which also lets
// any page frame it or open it in a tab. It renders in three cases only:
//   overlay  the URL carries a one-time token the service worker stored for this key press
//   window   the same token, and it is not framed
//   popup    it is the toolbar popup (top-level, and not a tab)
//   tab      a developer or test set `devTab` in session storage, which pages cannot reach
async function authorized() {
  if (surface === 'overlay' || surface === 'window') {
    if (surface === 'window' && window.top !== window) return false;
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
  if (surface === 'overlay') window.parent.postMessage('traveler:close', '*');
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
    run: () => openTab({ url }),
    ...extra,
  };
}

// A browser page remembered from an earlier visit. Some browsers may refuse
// to open their own scheme from an extension; chrome:// redirects there.
function visitedItem(page) {
  return {
    id: `visited:${page.url}`,
    kind: 'page',
    section: 'Visited',
    tag: 'Visited',
    title: page.title || prettyUrl(page.url),
    subtitle: page.url,
    keywords: `${page.url} ${BROWSER_NAME.toLowerCase()} browser page settings`,
    icon: 'gear',
    url: page.url,
    run: () => openInternal(page.url),
  };
}

async function openInternal(url) {
  try {
    await openTab({ url });
  } catch (error) {
    if (url.startsWith('chrome://')) throw error;
    await openTab({ url: chromeSpelling(url) });
  }
}

// "Search Brave settings for …": the browser's own settings search finds every
// setting it has, including ones only that browser offers.
function settingsSearchItem(query) {
  return {
    id: 'settings:search',
    kind: 'page',
    title: `Search ${BROWSER_NAME || 'browser'} settings for “${query}”`,
    icon: 'gear',
    run: () => openTab({ url: settingsSearchUrl(query) }),
  };
}

function prettyUrl(url = '') {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

// In its own window the palette acts on the tab the shortcut was pressed in,
// which the service worker passes along, and never lists itself.
const originTabId = Number(new URLSearchParams(location.search).get('tab')) || null;
let ownTabId = null;
// Set by the service worker when the shortcut opened this window on a web page
// only because the browser gave the key press no access to it (Dia does not
// grant activeTab to shortcuts). Allowing access to websites fixes that for good.
const noAccess = surface === 'window' && new URLSearchParams(location.search).get('access') === 'none';
let asking = false;

async function accessItem(tab) {
  if (!noAccess || !/^https?:/.test(tab?.url || '')) return null;
  if (await chrome.permissions.contains(SITE_ACCESS).catch(() => false)) return null;
  const where = BROWSER_NAME || 'This browser';
  return {
    id: 'traveler.siteAccess',
    kind: 'action',
    section: 'Open over the page',
    tag: 'Allow',
    title: 'Open Traveler over the page, not in a window',
    subtitle: `${where} keeps the shortcut out of pages. Allow websites once.`,
    keywords: 'allow access websites overlay window permission inside page',
    icon: 'shield',
    run: allowSiteAccess,
  };
}

async function allowSiteAccess() {
  // The browser's permission prompt takes focus; the window must outlive it.
  asking = true;
  let granted = false;
  try {
    granted = await chrome.permissions.request(SITE_ACCESS);
  } finally {
    asking = false;
  }
  if (!granted) {
    window.focus();
    return { keep: true, message: 'Not allowed. Traveler keeps opening in a window on websites here.' };
  }
  state.access = null;
  await chrome.storage.session.remove('paletteWindow');
  // Move to the page right away; every later press opens there directly.
  const tab = state.tab?.id ? await chrome.tabs.get(state.tab.id).catch(() => null) : null;
  if (tab) {
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    await openOverlay(tab);
  }
}

async function activeTab() {
  if (surface !== 'window') return (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  ownTabId ??= (await chrome.tabs.getCurrent())?.id ?? null;
  // Without a tab from the service worker (or once it closed), fall back to the
  // browser window the user was last in, so tabs never open next to the palette.
  const origin = (originTabId ? await chrome.tabs.get(originTabId).catch(() => null) : null) ?? (await commandTab(null));
  if (origin) setHomeWindow(origin.windowId);
  return origin;
}

async function loadContext() {
  const [active, tabs, closed, reading, saved] = await Promise.all([
    activeTab(),
    chrome.tabs.query({}),
    chrome.sessions.getRecentlyClosed({ maxResults: 25 }).catch(() => []),
    chrome.readingList.query({}).catch(() => []),
    chrome.storage.local.get(['learned', 'visitedPages']).catch(() => ({})),
  ]);
  learned = cleanStore(saved.learned);
  learnedLoaded = true;
  state.tab = active || null;
  state.access = await accessItem(state.tab);
  state.tabs = tabs
    .filter((t) => !(surface === 'tab' && t.url === location.href) && t.id !== ownTabId)
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
  // Remember the browser's own pages that are open or recently closed, so they
  // stay searchable later. Private windows are never recorded.
  const before = cleanVisited(saved.visitedPages);
  const visited = rememberPages(before, [...tabs, ...closed.map((s) => s.tab).filter(Boolean)]);
  if (visited !== before) chrome.storage.local.set({ visitedPages: visited }).catch(() => {});
  // A page that is open or in Recently closed already has a row of its own.
  const listed = [...PAGES.map((p) => p.url), ...tabs.map((t) => t.url), ...closed.map((s) => s.tab?.url)].filter(Boolean);
  state.visited = visitedPages(visited, listed).map(visitedItem);
}

function localItems() {
  return [...(state.access ? [state.access] : []), ...state.tabs, ...state.commands, ...PAGES, ...state.visited, ...state.closed, ...state.reading];
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
    items.push({ id: 'web:open', kind: 'web', title: `Open ${query}`, icon: 'globe', run: () => openTab({ url }) });
  }
  items.push({
    id: 'web:search',
    kind: 'web',
    title: `Search the web for “${query}”`,
    icon: 'search',
    run: () => searchWeb(query),
  });
  items.push(settingsSearchItem(query));
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
  const web = (state.scope === 'all' ? webItems(query) : state.scope === 'settings' ? [settingsSearchItem(query)] : []).map((item) => ({ item, positions: [] }));
  // A typed address is most likely meant literally, so "Open" leads; the web search trails.
  const head = web.filter((r) => r.item.id === 'web:open');
  const tail = web.filter((r) => r.item.id !== 'web:open');
  const learnedOrder = (rows) => arrange(dedupe(rows), learned, query, Date.now());
  setRows([...head, ...learnedOrder(localRows), ...tail]);
  // Bookmarks and history come from Chrome's own indexes, asynchronously.
  remoteItems(query).then((remote) => {
    if (seq !== state.searchSeq) return;
    const activeId = state.rows[state.active]?.item.id;
    const merged = learnedOrder([...localRows, ...rank(query, remote, bias)].sort((a, b) => b.score - a.score));
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
      ...(state.access ? [{ item: state.access, positions: [], section: state.access.section }] : []),
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
  else if (!state.stack.length) tag.textContent = item.current ? 'Current tab' : item.tag || KIND_LABEL[item.kind] || '';

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

// ---- Position -----------------------------------------------------------

// The panel moves inside the overlay's frame, and the palette's own window
// moves as a whole. The browser places the toolbar popup, so that one stays put.
const movable = surface !== 'popup';
let savedPanel = null; // { x, y } as fractions of the viewport, or null for the default spot
const own = { id: null, last: null, parent: null, quietUntil: 0 };

function placePanel(spot) {
  if (!spot) {
    delete els.scrim.dataset.placed;
    for (const name of ['left', 'top', 'max-height']) els.panel.style.removeProperty(name);
    return;
  }
  els.scrim.dataset.placed = '';
  els.panel.style.left = `${spot.left}px`;
  els.panel.style.top = `${spot.top}px`;
  // Placed low, the panel gets shorter instead of running off the bottom.
  els.panel.style.maxHeight = `min(520px, calc(100% - ${spot.top + 16}px))`;
}

async function restorePanel() {
  ({ positionOverlay: savedPanel = null } = await chrome.storage.local.get('positionOverlay'));
  placePanel(panelSpot(savedPanel, innerWidth, innerHeight));
  window.addEventListener('resize', () => placePanel(panelSpot(savedPanel, innerWidth, innerHeight)));
}

// The window can also be moved by its title bar, which the page never sees as
// a pointer, so its position is read from the bounds-changed event. The
// listener lives in this page and goes away with it.
async function watchWindow() {
  const current = await chrome.windows.getCurrent();
  own.id = current.id;
  own.last = { left: current.left, top: current.top };
  chrome.windows.onBoundsChanged.addListener((changed) => {
    if (changed.id === own.id) rememberWindow(changed);
  });
}

async function parentWindow() {
  if (!state.tab) return null;
  return (own.parent ??= await chrome.windows.get(state.tab.windowId).catch(() => null));
}

async function rememberWindow(bounds) {
  if (!own.last || (bounds.left === own.last.left && bounds.top === own.last.top)) return;
  own.last = { left: bounds.left, top: bounds.top };
  if (Date.now() < own.quietUntil) return;
  const parent = await parentWindow();
  // own.last, not bounds: a newer move may have landed while the parent was looked up.
  if (parent) await chrome.storage.local.set({ positionWindow: windowOffset(parent, own.last) });
}

async function resetPosition() {
  if (surface === 'window') {
    const parent = await parentWindow();
    if (parent && own.id) {
      // Moving back is not a new position to remember.
      own.quietUntil = Date.now() + 500;
      await chrome.windows.update(own.id, windowSpot(parent));
    }
  } else if (movable) {
    savedPanel = null;
    placePanel(null);
  }
  await chrome.storage.local.remove(['positionOverlay', 'positionWindow']);
  return { keep: true, message: 'Palette position reset' };
}

// Two ways to grab it: the search row outside the text field, or anywhere with Option held.
function wireDrag() {
  if (!movable) return;
  const root = document.documentElement;
  let drag = null;
  let frame = 0;

  els.panel.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    const onGrip = Boolean(event.target.closest('.search')) && event.target !== els.input;
    if (!event.altKey && !onGrip) return;
    if (surface === 'window' && !own.last) return;
    // With Option held, the press must not reach the row, pill or field under it.
    if (event.altKey) event.preventDefault();
    const box = els.panel.getBoundingClientRect();
    drag = {
      pointer: event.pointerId,
      // Screen coordinates for the window, which moves under the pointer; client ones for the panel.
      from: surface === 'window' ? { x: event.screenX, y: event.screenY } : { x: event.clientX, y: event.clientY },
      base: surface === 'window' ? { ...own.last } : { left: box.left, top: box.top },
      spot: null,
    };
    els.panel.setPointerCapture(event.pointerId);
  });

  els.panel.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const dx = (surface === 'window' ? event.screenX : event.clientX) - drag.from.x;
    const dy = (surface === 'window' ? event.screenY : event.clientY) - drag.from.y;
    // A press that barely moves is a click, not a drag.
    if (!drag.spot && Math.abs(dx) + Math.abs(dy) < 4) return;
    root.dataset.dragging = '';
    const target = { left: drag.base.left + dx, top: drag.base.top + dy };
    if (surface === 'window') {
      drag.spot = { left: Math.round(target.left), top: Math.round(target.top) };
      cancelAnimationFrame(frame);
      const spot = drag.spot;
      frame = requestAnimationFrame(() => chrome.windows.update(own.id, spot).catch(() => {}));
    } else {
      drag.spot = clampPanel(target, innerWidth, innerHeight);
      placePanel(drag.spot);
    }
  });

  const end = async (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const { spot } = drag;
    drag = null;
    delete root.dataset.dragging;
    els.input.focus();
    if (!spot) return;
    // The release after a drag is not a click on whatever is under it.
    const swallow = (click) => click.stopPropagation();
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }));
    if (surface === 'window') {
      cancelAnimationFrame(frame);
      const moved = await chrome.windows.update(own.id, spot).catch(() => null);
      if (moved) await rememberWindow(moved);
    } else {
      savedPanel = panelFractions(spot, innerWidth, innerHeight);
      await chrome.storage.local.set({ positionOverlay: savedPanel });
    }
  };
  els.panel.addEventListener('pointerup', end);
  els.panel.addEventListener('pointercancel', end);
}

// ---- Learned ranking ------------------------------------------------------

// What was picked for which typed text (learn.js). Only palette pages write
// it, each saving the whole record, so this copy must match storage first:
// nothing is recorded until it has loaded, and it follows writes made by a
// palette open in another tab, including a clear.
let learned = emptyStore();
let learnedLoaded = false;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.learned) learned = cleanStore(changes.learned.newValue);
});

// Remembers a pick made from the root list. The write is sent before the row
// runs, because running it can tear this page down. Returns how to take it back.
// Without a known tab there is no telling whether the window is private, so
// nothing is recorded then either.
function learn(item) {
  const before = learned;
  if (!learnedLoaded || state.stack.length || !state.tab || state.tab.incognito) return () => {};
  learned = record(before, els.input.value, keyOf(item), Date.now());
  if (learned === before) return () => {};
  const save = (store) => chrome.storage.local.set({ learned: store }).catch(() => {});
  save(learned);
  return () => {
    learned = before;
    save(before);
  };
}

async function clearLearned() {
  learned = emptyStore();
  await chrome.storage.local.remove(['learned', 'visitedPages']);
  return { reset: true, message: 'Learned ranking and remembered pages cleared' };
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
  resetPosition,
  clearLearned,
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
  root.dataset.theme = themeId(prefs.theme);
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
    return false;
  }
  state.stack.push({ title: item.title, items, source: item });
  els.input.value = '';
  renderCrumbs();
  renderScopes();
  refresh();
  return true;
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
  if (item.children) {
    const unlearn = learn(item);
    if (!(await pushPage(item))) unlearn();
    return;
  }
  if (item.kind === 'action' && !state.tab && /^(tab|tabs|group|win|site)\./.test(item.id)) {
    say('No active tab');
    return;
  }
  const unlearn = learn(item);
  let result;
  try {
    result = await item.run(ctx);
  } catch (error) {
    unlearn();
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
  window.addEventListener('focus', () => els.input.focus({ preventScroll: true }));
}

// Typing must land in the field the moment the palette shows. Some browsers
// (Dia) activate the palette's window or frame a beat after it loads, or not
// at all, so keep asking until the field really has the keyboard.
function focusField(deadline = performance.now() + 1500) {
  window.focus();
  els.input.focus({ preventScroll: true });
  if (document.hasFocus() && document.activeElement === els.input) return;
  if (performance.now() < deadline) requestAnimationFrame(() => focusField(deadline));
}

async function start() {
  if (!(await authorized())) {
    // Never leave an inert full-page frame over the tab.
    if (surface === 'overlay') close();
    return;
  }
  // Like Spotlight, the palette's own window goes away when focus leaves it.
  if (surface === 'window') window.addEventListener('blur', () => asking || close());
  $('search-icon').append(icon('search'));
  wire();
  wireDrag();
  if (surface === 'window') await watchWindow();
  else if (movable) await restorePanel();
  renderScopes();
  els.panel.hidden = false;
  focusField();
  if (surface === 'window' && own.id) chrome.windows.update(own.id, { focused: true }).catch(() => {});
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
