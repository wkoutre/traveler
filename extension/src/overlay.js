// Injected into the active tab when the shortcut fires. It must be
// self-contained: chrome.scripting serializes this one function.
export function toggleOverlay(url) {
  const ID = '__cmdk_host__';
  try {
    const existing = document.getElementById(ID);
    if (existing) {
      existing.__cmdkClose?.();
      return 'closed';
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
      if (event.source === frame.contentWindow && event.data === 'cmdk:close') close();
    };
    function close() {
      window.removeEventListener('message', onMessage);
      host.remove();
      if (previous && typeof previous.focus === 'function') previous.focus({ preventScroll: true });
    }
    host.__cmdkClose = close;
    window.addEventListener('message', onMessage);
    document.documentElement.appendChild(host);
    frame.addEventListener('load', () => frame.focus());
    frame.focus();
    return 'opened';
  } catch {
    return 'failed';
  }
}
