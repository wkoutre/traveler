import { toggleOverlay } from './overlay.js';

// The only listener. Nothing else wakes the service worker, and no content
// script is registered, so the extension costs nothing until the shortcut fires.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'open-palette') return;
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

const WINDOW = { width: 680, height: 520 };

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
    const created = await chrome.windows.create({
      url: `${chrome.runtime.getURL('src/palette.html')}?${query}#${token}`,
      type: 'popup',
      focused: true,
      width: WINDOW.width,
      height: WINDOW.height,
      left: Math.round(parent.left + (parent.width - WINDOW.width) / 2),
      top: Math.round(parent.top + Math.max(60, (parent.height - WINDOW.height) * 0.3)),
    });
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
