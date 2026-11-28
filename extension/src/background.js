import { openOverlay } from './overlay.js';
import { WINDOW, windowSpot } from './position.js';
import { commandTab } from './origin.js';

// The only listener. Nothing else wakes the service worker, and no content
// script is registered, so the extension costs nothing until the shortcut fires.
chrome.commands.onCommand.addListener(async (command, passed) => {
  if (command !== 'open-palette') return;
  // Dia fires the command without the tab; without one the overlay cannot be
  // injected and the palette window has no browser window to act on.
  const tab = await commandTab(passed);
  const overlay = await openOverlay(tab);
  if (overlay === 'opened') {
    // Dia leaves keyboard focus in its own chrome after the shortcut, so the
    // page (and the palette in it) would not get the keys. Hand it back.
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    return;
  }
  if (overlay === 'closed') return;
  // The browser's own pages, the Web Store and the PDF viewer cannot be
  // scripted, so there the palette gets a small centered window of its own.
  // So does a web page the browser gave this key press no access to (Dia);
  // the window then offers to allow access to websites.
  if (await toggleWindow(tab, overlay === 'no-access')) return;
  try {
    await chrome.action.openPopup();
  } catch {
    // No focused browser window to anchor the popup to.
  }
});

async function toggleWindow(tab, noAccess) {
  try {
    const { paletteWindow } = await chrome.storage.session.get('paletteWindow');
    if (paletteWindow) {
      await chrome.storage.session.remove('paletteWindow');
      // Gone already if it closed itself; then this press opens a new one.
      const closed = await chrome.windows.remove(paletteWindow).then(() => true, () => false);
      if (closed) return true;
    }
    const parent = tab?.windowId ? await chrome.windows.get(tab.windowId) : await chrome.windows.getLastFocused();
    const token = crypto.randomUUID();
    await chrome.storage.session.set({ [`overlay:${token}`]: true });
    const query = new URLSearchParams({
      mode: 'window',
      ...(tab?.id ? { tab: String(tab.id) } : {}),
      ...(noAccess ? { access: 'none' } : {}),
    });
    const { positionWindow } = await chrome.storage.local.get('positionWindow');
    const frame = {
      url: `${chrome.runtime.getURL('src/palette.html')}?${query}#${token}`,
      type: 'popup',
      focused: true,
      width: WINDOW.width,
      height: WINDOW.height,
    };
    // Chrome refuses bounds that are mostly off every screen, which a saved
    // offset becomes once a monitor is unplugged. Then the default spot is used.
    const created = await chrome.windows
      .create({ ...frame, ...windowSpot(parent, positionWindow) })
      .catch(() => chrome.windows.create({ ...frame, ...windowSpot(parent) }));
    await chrome.storage.session.set({ paletteWindow: created.id });
    // Dia creates the window without activating it, despite focused: true.
    await chrome.windows.update(created.id, { focused: true }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
