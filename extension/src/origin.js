// Which tab and window the user meant when the shortcut fired.
//
// Chrome, Brave, Edge, Opera and Vivaldi pass the active tab to
// commands.onCommand. Dia fires the command without it, which used to send
// every press to the palette's own window and leave that window with no
// browser window to open tabs in. These helpers fill the gap, and do not rely
// on the browser reporting its windows as type "normal" (Dia and Arc draw
// their own window chrome, so that is not a safe assumption).

// The browser window the user was last in, never the palette's own popup.
export async function lastNormalWindow(api = chrome) {
  try {
    const win = await api.windows.getLastFocused({ populate: true, windowTypes: ['normal'] });
    if (win?.type && win.type !== 'normal') return null;
    return win ?? null;
  } catch {
    return null;
  }
}

// The palette's own pages are never the tab a command is about.
function isPalette(tab, api) {
  const own = api.runtime?.getURL?.('src/palette.html');
  return Boolean(own && tab?.url?.startsWith(own));
}

// The tab the command should act on: the one the browser passed, else the
// active tab of the last focused normal window, else the most recently used
// active tab in any window.
export async function commandTab(tab, api = chrome) {
  if (tab?.id !== undefined && tab.id !== api.tabs?.TAB_ID_NONE) return tab;
  const win = await lastNormalWindow(api);
  const inWindow = win?.tabs?.find((t) => t.active && !isPalette(t, api));
  if (inWindow) return inWindow;
  try {
    const active = (await api.tabs.query({ active: true })).filter((t) => !isPalette(t, api));
    return active.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] ?? null;
  } catch {
    return null;
  }
}
