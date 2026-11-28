import { SITE_ACCESS } from './overlay.js';

// Asking for access to websites. Dia never shows the browser's permission
// prompt for this and never answers the request, so a request that has not
// settled after `wait` ms is reported as 'no-prompt' and the caller offers the
// browser's own extension page instead.
export async function requestAccess(api = chrome, wait = 6000) {
  let timer;
  const silent = new Promise((resolve) => {
    timer = setTimeout(() => resolve('no-prompt'), wait);
  });
  const asked = Promise.resolve()
    .then(() => api.permissions.request(SITE_ACCESS))
    .then((granted) => (granted ? 'granted' : 'denied'), () => 'no-prompt');
  try {
    return await Promise.race([asked, silent]);
  } finally {
    clearTimeout(timer);
  }
}

export async function hasAccess(api = chrome) {
  return api.permissions.contains(SITE_ACCESS).catch(() => false);
}

// The browser's page for this extension, where site access can be set by hand.
export function detailsUrl(api = chrome) {
  return `chrome://extensions/?id=${api.runtime.id}`;
}
