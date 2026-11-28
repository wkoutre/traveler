import { THEMES, APPEARANCES, openTab, themeId } from './catalog.js';
import { detailsUrl, hasAccess, requestAccess } from './access.js';
import { SITE_ACCESS } from './overlay.js';

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem('prefs') || '{}');
  } catch {
    return {};
  }
}

function apply(prefs) {
  const root = document.documentElement;
  root.dataset.theme = themeId(prefs.theme);
  const appearance = prefs.appearance || 'system';
  const dark = appearance === 'dark' || (appearance === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.mode = dark ? 'dark' : 'light';
}

async function save(patch) {
  const prefs = { ...readPrefs(), ...patch };
  localStorage.setItem('prefs', JSON.stringify(prefs));
  await chrome.storage.local.set({ prefs });
  apply(prefs);
  render(prefs);
}

function group(el, options, key, current) {
  el.replaceChildren(
    ...options.map(([id, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(id === current));
      button.addEventListener('click', () => save({ [key]: id }));
      return button;
    }),
  );
}

function render(prefs) {
  group(document.getElementById('themes'), THEMES, 'theme', themeId(prefs.theme));
  group(document.getElementById('appearances'), APPEARANCES, 'appearance', prefs.appearance || 'system');
}

async function start() {
  const { prefs = {} } = await chrome.storage.local.get('prefs');
  localStorage.setItem('prefs', JSON.stringify(prefs));
  apply(prefs);
  render(prefs);
  const commands = await chrome.commands.getAll();
  const shortcut = commands.find((c) => c.name === 'open-palette')?.shortcut;
  if (shortcut) document.getElementById('shortcut').textContent = shortcut;
  document.getElementById('change-shortcut').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
}

// Some browsers (Dia) give the shortcut no access to the page, so the palette
// opens in a window there until Traveler is allowed on websites. Chrome never needs this.
const $ = (id) => document.getElementById(id);

async function renderAccess(message) {
  const allowed = await hasAccess();
  $('access-status').textContent =
    message ||
    (allowed
      ? 'Allowed. On browsers that give the shortcut no access to the page, the palette still opens over it.'
      : 'Not needed in Chrome. If the palette opens in its own window on websites, allow Traveler on websites here.');
  $('access-allow').hidden = allowed;
  $('access-remove').hidden = !allowed;
  if (allowed) $('access-manual').hidden = true;
}

function wireAccess() {
  $('access-allow').addEventListener('click', async () => {
    $('access-status').textContent = 'Waiting for the browser’s prompt…';
    const result = await requestAccess();
    if (result === 'no-prompt') $('access-manual').hidden = false;
    await renderAccess(
      result === 'granted'
        ? 'Allowed. Press the shortcut on any website and the palette opens over the page.'
        : result === 'denied'
          ? 'Not allowed. The palette keeps opening in its own window on websites.'
          : '',
    );
  });
  $('access-remove').addEventListener('click', async () => {
    await chrome.permissions.remove(SITE_ACCESS).catch(() => {});
    await renderAccess();
  });
  $('access-details').addEventListener('click', () => openTab({ url: detailsUrl() }));
  chrome.permissions.onAdded?.addListener(() => renderAccess());
  renderAccess();
}

wireAccess();
start();
