import { toggleOverlay } from './overlay.js';
import { WINDOW, windowSpot } from './position.js';
import { commandTab } from './origin.js';

// The only listener. Nothing else wakes the service worker, and no content
// script is registered, so the extension costs nothing until the shortcut fires.
chrome.commands.onCommand.addListener(async (command, passed) => {
  if (command !== 'open-palette') return;
  // Dia fires the command without the tab; without one the overlay cannot be
  // injected and the palette window has no browser window to act on.
  const tab = await commandTab(passed);
  if (await openOverlay(tab)) return;
  // The browser's own pages, the Web Store and the PDF viewer cannot be
  // scripted, so there the palette gets a small centered window of its own.
  if (await toggleWindow(tab)) return;
  try {
    await chrome.action.openPopup();
  } catch {
    // No focused browser window to anchor the popup to.
  }
});

async function toggleWindow(tab) {
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
    const query = new URLSearchParams({ mode: 'window', ...(tab?.id ? { tab: String(tab.id) } : {}) });
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
    return true;
  } catch {
    return false;
  }
}

async function openOverlay(tab) {
  if (!tab?.id) return false;
  try {
    const token = crypto.randomUUID();
    await chrome.storage.session.set({ [`overlay:${token}`]: true });
    const url = `${chrome.runtime.getURL('src/palette.html')}?mode=overlay#${token}`;
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: toggleOverlay,
      args: [url],
    });
    return injection?.result === 'opened' || injection?.result === 'closed';
  } catch {
    return false;
  }
}
