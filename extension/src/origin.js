// Which tab and window the user meant when the shortcut fired.
//
// Chrome passes the active tab to commands.onCommand. Some Chromium browsers
// (Dia, for one) fire the command without it, which used to send every press
// to the palette's own window and leave that window with no browser window to
// open tabs in. These helpers fill the gap from the last focused normal window.

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

// The tab the command should act on: the one Chrome passed, else the active
// tab of the last focused normal window.
export async function commandTab(tab, api = chrome) {
  if (tab?.id !== undefined && tab.id !== api.tabs?.TAB_ID_NONE) return tab;
  const win = await lastNormalWindow(api);
  return win?.tabs?.find((t) => t.active) ?? null;
}
