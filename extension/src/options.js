import { THEMES, APPEARANCES } from './catalog.js';

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem('prefs') || '{}');
  } catch {
    return {};
  }
}

function apply(prefs) {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme || 'family';
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
  group(document.getElementById('themes'), THEMES, 'theme', prefs.theme || 'family');
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

start();
