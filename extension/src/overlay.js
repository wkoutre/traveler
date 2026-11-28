// Injected into the active tab when the shortcut fires. It must be
// self-contained: chrome.scripting serializes this one function.
export function toggleOverlay(url) {
  // State lives on the isolated world's global, which the page cannot reach.
  // The element id is only a label; a page that plants the same id changes nothing.
  const ID = '__traveler_host__';
  try {
    const open = globalThis.__travelerOpen;
    if (open) {
      const stillShown = open.host.isConnected;
      open.close();
      // If the page removed the overlay itself, this press is a fresh open, not a toggle.
      if (stillShown) return 'closed';
    }
    const previous = document.activeElement;
    const host = document.createElement('div');
    host.id = ID;
    host.style.cssText =
      'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;display:block!important;';
    // Closed shadow root: the page cannot read the frame URL, which carries a one-time token.
    const root = host.attachShadow({ mode: 'closed' });
    const frame = document.createElement('iframe');
    frame.src = url;
    frame.allow = 'clipboard-write';
    frame.title = 'Command palette';
    frame.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;border:0;margin:0;padding:0;background:transparent;color-scheme:light;display:block;';
    root.appendChild(frame);
    const onMessage = (event) => {
      if (event.source === frame.contentWindow && event.data === 'traveler:close') close();
    };
    function close() {
      window.removeEventListener('message', onMessage);
      globalThis.__travelerOpen = null;
      host.remove();
      if (previous && typeof previous.focus === 'function') previous.focus({ preventScroll: true });
    }
    globalThis.__travelerOpen = { host, close };
    window.addEventListener('message', onMessage);
    document.documentElement.appendChild(host);
    frame.addEventListener('load', () => frame.focus());
    frame.focus();
    return 'opened';
  } catch {
    globalThis.__travelerOpen?.close();
    return 'failed';
  }
}

// Websites the palette may be injected into without a key press granting
// activeTab. Optional: requested only on browsers whose shortcut grants nothing.
export const SITE_ACCESS = { origins: ['http://*/*', 'https://*/*'] };

// Injects the palette into `tab`. Returns 'opened', 'closed', 'no-access'
// (the browser gave this key press no access to the page, as Dia does) or
// 'failed' (the page cannot be scripted at all: browser pages, the Web Store).
export async function openOverlay(tab, api = chrome) {
  if (!tab?.id) return 'failed';
  try {
    const token = crypto.randomUUID();
    await api.storage.session.set({ [`overlay:${token}`]: true });
    const url = `${api.runtime.getURL('src/palette.html')}?mode=overlay#${token}`;
    const [injection] = await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: toggleOverlay,
      args: [url],
    });
    const result = injection?.result;
    return result === 'opened' || result === 'closed' ? result : 'failed';
  } catch (error) {
    return lacksAccess(error, tab) ? 'no-access' : 'failed';
  }
}

// Chrome's refusal when the extension holds no access to the page, as opposed
// to a page no extension may script. Only a web page can be fixed by access.
export function lacksAccess(error, tab) {
  return /^https?:/.test(tab?.url || '') && /must request permission|Cannot access contents of (the page|url)/i.test(String(error?.message || error));
}
