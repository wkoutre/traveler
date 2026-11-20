import { toggleOverlay } from './overlay.js';

// The only listener. Nothing else wakes the service worker, and no content
// script is registered, so the extension costs nothing until the shortcut fires.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'open-palette') return;
  if (await openOverlay(tab)) return;
  // chrome:// pages, the Web Store and the PDF viewer cannot be scripted.
  try {
    await chrome.action.openPopup();
  } catch {
    // No focused browser window to anchor the popup to.
  }
});

async function openOverlay(tab) {
  if (!tab?.id) return false;
  try {
    const token = crypto.randomUUID();
    await chrome.storage.session.set({ overlayToken: token });
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
