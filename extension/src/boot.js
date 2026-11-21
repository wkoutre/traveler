// Runs before first paint so the palette never flashes the wrong theme.
// localStorage mirrors chrome.storage.local because it can be read synchronously.
(function () {
  var root = document.documentElement;
  var prefs = {};
  try {
    prefs = JSON.parse(localStorage.getItem('prefs') || '{}');
  } catch (e) {}
  var theme = ['daylight', 'cream'].indexOf(prefs.theme) >= 0 ? prefs.theme : 'daylight';
  var appearance = prefs.appearance === 'light' || prefs.appearance === 'dark' ? prefs.appearance : 'system';
  var dark = appearance === 'dark' || (appearance === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = theme;
  root.dataset.mode = dark ? 'dark' : 'light';
  var mode = new URLSearchParams(location.search).get('mode');
  if (mode) root.dataset.surface = mode;
})();
