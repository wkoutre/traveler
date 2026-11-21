// The command catalog. Everything the palette can do that is not a live
// search result (a tab, bookmark or history entry) is declared here.
//
// An item is { id, kind, title, subtitle?, keywords?, icon, run?, children? }.
// run(ctx) performs the command; returning { keep: true, message } leaves the
// palette open, { pop: true } goes back one page and { reset: true } goes back
// to the root. children(ctx) returns the items of a nested page. A command
// that destroys data or weakens a setting never has run() at the top level:
// it has children() that end in an explicit choice (see confirm()).

// ---- Chrome pages -------------------------------------------------------
// [url, title, keywords]. e2e/run.mjs loads every URL in the real browser.
// Pages that Chrome only serves after "internal debugging pages" is switched
// on in chrome://chrome-urls are left out.
const SETTINGS = [
  ['chrome://settings/', 'Settings', 'preferences options'],
  ['chrome://settings/people', 'You and Google', 'sync account sign in google services'],
  ['chrome://settings/manageProfile', 'Customize profile', 'name avatar theme color'],
  ['chrome://settings/autofill', 'Autofill and passwords', 'forms'],
  ['chrome://password-manager/passwords', 'Password Manager', 'logins credentials passkeys'],
  ['chrome://password-manager/checkup', 'Password Checkup', 'compromised weak reused'],
  ['chrome://password-manager/settings', 'Password Manager settings', 'export import auto sign-in'],
  ['chrome://settings/payments', 'Payment methods', 'credit cards wallet'],
  ['chrome://settings/contactInfo', 'Addresses and contact info', 'autofill shipping'],
  ['chrome://settings/privacy', 'Privacy and security', ''],
  ['chrome://settings/clearBrowserData', 'Delete browsing data', 'clear cache cookies history'],
  ['chrome://settings/cookies', 'Third-party cookies', 'tracking'],
  ['chrome://settings/security', 'Security', 'safe browsing https dns'],
  ['chrome://settings/safetyCheck', 'Safety Check', 'updates passwords'],
  ['chrome://settings/content', 'Site settings', 'permissions'],
  ['chrome://settings/content/all', 'All sites: permissions and data', 'storage cookies per site'],
  ['chrome://settings/content/location', 'Site settings: Location', 'geolocation permission'],
  ['chrome://settings/content/camera', 'Site settings: Camera', 'video permission'],
  ['chrome://settings/content/microphone', 'Site settings: Microphone', 'audio permission'],
  ['chrome://settings/content/notifications', 'Site settings: Notifications', 'push alerts permission'],
  ['chrome://settings/content/javascript', 'Site settings: JavaScript', 'scripts permission'],
  ['chrome://settings/content/images', 'Site settings: Images', 'permission'],
  ['chrome://settings/content/popups', 'Site settings: Pop-ups and redirects', 'popup permission'],
  ['chrome://settings/content/sound', 'Site settings: Sound', 'mute audio permission'],
  ['chrome://settings/content/automaticDownloads', 'Site settings: Automatic downloads', 'permission'],
  ['chrome://settings/content/clipboard', 'Site settings: Clipboard', 'copy paste permission'],
  ['chrome://settings/content/pdfDocuments', 'Site settings: PDF documents', 'download open'],
  ['chrome://settings/handlers', 'Protocol handlers', 'mailto default apps'],
  ['chrome://settings/performance', 'Performance', 'memory saver energy battery'],
  ['chrome://settings/appearance', 'Appearance', 'theme toolbar home button bookmarks bar font size zoom'],
  ['chrome://settings/fonts', 'Customize fonts', 'typeface size'],
  ['chrome://settings/search', 'Search engine', 'default google'],
  ['chrome://settings/searchEngines', 'Manage search engines and site search', 'shortcuts keywords'],
  ['chrome://settings/defaultBrowser', 'Default browser', ''],
  ['chrome://settings/onStartup', 'On startup', 'continue where you left off new tab'],
  ['chrome://settings/languages', 'Languages', 'spell check translate'],
  ['chrome://settings/downloads', 'Downloads settings', 'location ask where to save'],
  ['chrome://settings/accessibility', 'Accessibility', 'captions caret focus'],
  ['chrome://settings/system', 'System', 'hardware acceleration proxy background apps'],
  ['chrome://settings/reset', 'Reset settings', 'restore defaults'],
  ['chrome://settings/help', 'About Chrome', 'version update'],
];

const BROWSER = [
  ['chrome://history/', 'History', 'visited'],
  ['chrome://history/syncedTabs', 'Tabs from other devices', 'synced phone'],
  ['chrome://downloads/', 'Downloads', 'files'],
  ['chrome://bookmarks/', 'Bookmark Manager', 'favorites'],
  ['chrome://extensions/', 'Extensions', 'add-ons plugins'],
  ['chrome://extensions/shortcuts', 'Extension keyboard shortcuts', 'hotkeys keybindings'],
  ['chrome://flags/', 'Experiments (flags)', 'experimental features'],
  ['chrome://version/', 'Version', 'build profile path command line'],
  ['chrome://whats-new/', "What's New", 'release notes'],
  ['chrome://new-tab-page/', 'New Tab page', 'newtab'],
  ['chrome://management/', 'Managed by your organization', 'policy admin'],
  ['chrome://policy/', 'Policies', 'enterprise managed'],
  ['chrome://chrome-urls/', 'All Chrome URLs', 'about internal pages'],
];

const DIAGNOSTICS = [
  ['chrome://inspect/', 'Inspect devices and targets', 'devtools remote debugging service workers'],
  ['chrome://gpu/', 'GPU internals', 'graphics hardware acceleration'],
  ['chrome://net-internals/', 'Net internals', 'dns sockets hsts proxy'],
  ['chrome://net-export/', 'Net export', 'network log capture'],
  ['chrome://components/', 'Components', 'widevine updates'],
  ['chrome://crashes/', 'Crashes', 'crash reports'],
  ['chrome://system/', 'About System', 'diagnostics'],
  ['chrome://sync-internals/', 'Sync internals', ''],
  ['chrome://signin-internals/', 'Sign-in internals', 'accounts tokens'],
  ['chrome://site-engagement/', 'Site engagement', 'scores'],
  ['chrome://media-internals/', 'Media internals', 'audio video players'],
  ['chrome://media-engagement/', 'Media engagement', 'autoplay'],
  ['chrome://webrtc-internals/', 'WebRTC internals', 'calls peer connection'],
  ['chrome://serviceworker-internals/', 'Service worker internals', ''],
  ['chrome://process-internals/', 'Process internals', 'site isolation frames'],
  ['chrome://quota-internals/', 'Quota internals', 'storage disk usage'],
  ['chrome://predictors/', 'Predictors', 'autocomplete preload'],
  ['chrome://accessibility/', 'Accessibility internals', 'screen reader tree'],
  ['chrome://bluetooth-internals/', 'Bluetooth internals', 'devices'],
  ['chrome://usb-internals/', 'USB internals', 'devices'],
  ['chrome://device-log/', 'Device log', 'usb bluetooth hid'],
  ['chrome://histograms/', 'Histograms', 'metrics'],
  ['chrome://translate-internals/', 'Translate internals', 'language detection'],
  ['chrome://autofill-internals/', 'Autofill internals', 'forms log'],
  ['chrome://password-manager-internals/', 'Password Manager internals', 'log'],
  ['chrome://prefs-internals/', 'Prefs internals', 'profile preferences json'],
  ['chrome://credits/', 'Credits', 'open source licenses'],
  ['chrome://terms/', 'Terms of Service', ''],
  ['chrome://dino/', 'Dino game', 'offline'],
];

function pages(rows, section) {
  return rows.map(([url, title, keywords]) => ({
    id: `page:${url}`,
    kind: 'page',
    section,
    title,
    subtitle: url,
    keywords: `${keywords} chrome ${section.toLowerCase()}`,
    icon: 'gear',
    url,
    run: () => openTab({ url }),
  }));
}

export const PAGES = [
  ...pages(SETTINGS, 'Settings'),
  ...pages(BROWSER, 'Chrome'),
  ...pages(DIAGNOSTICS, 'Diagnostics'),
];

// ---- Helpers ------------------------------------------------------------

// When the palette runs in its own window, new tabs belong in the browser
// window the shortcut was pressed in, not next to the palette.
let homeWindowId;
export function setHomeWindow(id) {
  homeWindowId = id;
}
export function openTab(props = {}) {
  return chrome.tabs.create(homeWindowId === undefined ? props : { windowId: homeWindowId, ...props });
}

const keep = (message) => ({ keep: true, message });

// The last step of every destructive command: an explicit choice. `title`
// is the whole sentence, verb first ("Delete browsing history, last hour").
export function confirm(title, subtitle, run) {
  return [
    { id: 'confirm:yes', kind: 'action', title, subtitle, icon: 'check', danger: true, run },
    { id: 'confirm:no', kind: 'action', title: 'Cancel', icon: 'close', run: () => ({ pop: true }) },
  ];
}

function action(id, title, icon, keywords, rest) {
  return { id, kind: 'action', title, icon, keywords, ...rest };
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// ---- Tabs and windows ---------------------------------------------------

const GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];

function tabCommands() {
  return [
    action('tab.new', 'New tab', 'tab', 'open create', { run: () => openTab({}) }),
    action('tab.close', 'Close tab', 'close', 'remove', { run: (c) => chrome.tabs.remove(c.tab.id) }),
    action('tab.reopen', 'Reopen closed tab', 'undo', 'restore undo close', {
      run: () => chrome.sessions.restore(),
    }),
    action('tab.duplicate', 'Duplicate tab', 'tab', 'clone copy', {
      run: (c) => chrome.tabs.duplicate(c.tab.id),
    }),
    action('tab.pin', 'Pin or unpin tab', 'tab', 'toggle pinned', {
      run: (c) => chrome.tabs.update(c.tab.id, { pinned: !c.tab.pinned }),
    }),
    action('tab.mute', 'Mute or unmute tab', 'tab', 'toggle sound audio silence', {
      run: (c) => chrome.tabs.update(c.tab.id, { muted: !c.tab.mutedInfo?.muted }),
    }),
    action('tab.reload', 'Reload tab', 'undo', 'refresh', { run: (c) => chrome.tabs.reload(c.tab.id) }),
    action('tab.hardReload', 'Hard reload tab', 'undo', 'refresh bypass cache force', {
      run: (c) => chrome.tabs.reload(c.tab.id, { bypassCache: true }),
    }),
    action('tab.back', 'Go back', 'chevron', 'history previous', { run: (c) => chrome.tabs.goBack(c.tab.id) }),
    action('tab.forward', 'Go forward', 'chevron', 'history next', {
      run: (c) => chrome.tabs.goForward(c.tab.id),
    }),
    action('tab.copyUrl', 'Copy tab URL', 'bolt', 'link address clipboard', {
      run: async (c) => {
        await copy(c.tab.url);
        return keep('Copied URL');
      },
    }),
    action('tab.copyMarkdown', 'Copy tab as Markdown link', 'bolt', 'link md clipboard title', {
      run: async (c) => {
        await copy(`[${c.tab.title}](${c.tab.url})`);
        return keep('Copied Markdown link');
      },
    }),
    action('tab.bookmark', 'Bookmark tab', 'bookmark', 'save favorite add', {
      run: async (c) => {
        await chrome.bookmarks.create({ title: c.tab.title, url: c.tab.url });
        return keep('Bookmarked in Other Bookmarks');
      },
    }),
    action('tab.readLater', 'Add tab to Reading List', 'book', 'read later save', {
      run: async (c) => {
        await chrome.readingList.addEntry({ title: c.tab.title, url: c.tab.url, hasBeenRead: false });
        return keep('Added to Reading List');
      },
    }),
    action('tab.toWindow', 'Move tab to a new window', 'window', 'detach pop out tear off', {
      run: (c) => chrome.windows.create({ tabId: c.tab.id }),
    }),
    action('tab.zoomIn', 'Zoom in', 'search', 'bigger larger magnify', { run: (c) => zoom(c, 0.1) }),
    action('tab.zoomOut', 'Zoom out', 'search', 'smaller', { run: (c) => zoom(c, -0.1) }),
    action('tab.zoomReset', 'Reset zoom', 'search', 'actual size 100%', {
      run: async (c) => {
        await chrome.tabs.setZoom(c.tab.id, 0);
        return keep('Zoom reset');
      },
    }),
    action('tabs.closeOthers', 'Close other tabs', 'close', 'only this', {
      children: async (c) => {
        const others = (await chrome.tabs.query({ windowId: c.tab.windowId })).filter((t) => t.id !== c.tab.id && !t.pinned);
        return confirm(`Close ${others.length} other tabs`, 'Pinned tabs stay open', () =>
          chrome.tabs.remove(others.map((t) => t.id)),
        );
      },
    }),
    action('tabs.closeRight', 'Close tabs to the right', 'close', '', {
      children: async (c) => {
        const right = (await chrome.tabs.query({ windowId: c.tab.windowId })).filter((t) => t.index > c.tab.index);
        return confirm(`Close ${right.length} tabs to the right`, '', () => chrome.tabs.remove(right.map((t) => t.id)));
      },
    }),
    action('tabs.closeDuplicates', 'Close duplicate tabs', 'close', 'dedupe same url', {
      children: async () => {
        const seen = new Set();
        const dupes = [];
        for (const t of await chrome.tabs.query({})) {
          if (seen.has(t.url) && !t.active && !t.pinned) dupes.push(t.id);
          seen.add(t.url);
        }
        return confirm(`Close ${dupes.length} duplicate ${dupes.length === 1 ? 'tab' : 'tabs'}`, 'Active and pinned tabs stay open', () =>
          chrome.tabs.remove(dupes),
        );
      },
    }),
    action('tabs.discard', 'Free memory: discard background tabs', 'bolt', 'sleep suspend unload ram', {
      run: async () => {
        const tabs = await chrome.tabs.query({ active: false, discarded: false });
        let count = 0;
        for (const t of tabs) {
          try {
            await chrome.tabs.discard(t.id);
            count++;
          } catch {
            // Some tabs (playing audio, devtools open) refuse to discard.
          }
        }
        return keep(`Discarded ${count} ${count === 1 ? 'tab' : 'tabs'}`);
      },
    }),
    action('group.add', 'Add tab to a group', 'layers', 'tab group move', {
      children: async (c) => {
        const groups = await chrome.tabGroups.query({ windowId: c.tab.windowId });
        return [
          action('group.new', 'New group', 'layers', '', { run: () => chrome.tabs.group({ tabIds: c.tab.id }) }),
          ...groups.map((g) =>
            action(`group.to:${g.id}`, g.title || `Untitled ${g.color} group`, 'layers', g.color, {
              subtitle: g.color,
              run: () => chrome.tabs.group({ tabIds: c.tab.id, groupId: g.id }),
            }),
          ),
        ];
      },
    }),
    action('group.remove', 'Remove tab from its group', 'layers', 'ungroup', {
      run: (c) => chrome.tabs.ungroup(c.tab.id),
    }),
    action('group.collapseAll', 'Collapse all tab groups', 'layers', 'fold', { run: () => setCollapsed(true) }),
    action('group.expandAll', 'Expand all tab groups', 'layers', 'unfold', { run: () => setCollapsed(false) }),
    action('group.byDomain', 'Group tabs by site', 'layers', 'organize domain sort', {
      run: async (c) => {
        const tabs = (await chrome.tabs.query({ windowId: c.tab.windowId, pinned: false })).filter(
          (t) => t.groupId === -1,
        );
        const bySite = new Map();
        for (const t of tabs) {
          const host = hostOf(t.url).replace(/^www\./, '');
          if (!host) continue;
          bySite.set(host, [...(bySite.get(host) || []), t.id]);
        }
        let made = 0;
        for (const [host, ids] of bySite) {
          if (ids.length < 2) continue;
          const groupId = await chrome.tabs.group({ tabIds: ids });
          await chrome.tabGroups.update(groupId, { title: host, color: GROUP_COLORS[made % GROUP_COLORS.length] });
          made++;
        }
        return keep(`Made ${made} ${made === 1 ? 'group' : 'groups'}`);
      },
    }),
    action('win.new', 'New window', 'window', 'open', { run: () => chrome.windows.create({}) }),
    action('win.incognito', 'New Incognito window', 'window', 'private', {
      run: () => chrome.windows.create({ incognito: true }),
    }),
    action('win.merge', 'Merge all windows into this one', 'window', 'combine gather tabs', {
      run: async (c) => {
        const tabs = (await chrome.tabs.query({ windowType: 'normal' })).filter((t) => t.windowId !== c.tab.windowId);
        if (tabs.length) await chrome.tabs.move(tabs.map((t) => t.id), { windowId: c.tab.windowId, index: -1 });
        return keep(`Moved ${tabs.length} ${tabs.length === 1 ? 'tab' : 'tabs'}`);
      },
    }),
    action('win.fullscreen', 'Toggle full screen', 'window', 'fullscreen maximize', {
      run: async (c) => {
        const win = await chrome.windows.get(c.tab.windowId);
        await chrome.windows.update(win.id, { state: win.state === 'fullscreen' ? 'normal' : 'fullscreen' });
      },
    }),
    action('win.minimize', 'Minimize window', 'window', 'hide dock', {
      run: (c) => chrome.windows.update(c.tab.windowId, { state: 'minimized' }),
    }),
    action('win.close', 'Close window', 'close', 'quit', {
      children: async (c) => {
        const count = (await chrome.tabs.query({ windowId: c.tab.windowId })).length;
        return confirm(`Close this window and its ${count} tabs`, '', () => chrome.windows.remove(c.tab.windowId));
      },
    }),
  ];
}

async function zoom(c, delta) {
  const current = await chrome.tabs.getZoom(c.tab.id);
  const next = Math.min(5, Math.max(0.25, Math.round((current + delta) * 100) / 100));
  await chrome.tabs.setZoom(c.tab.id, next);
  return keep(`Zoom ${Math.round(next * 100)}%`);
}

async function setCollapsed(collapsed) {
  const groups = await chrome.tabGroups.query({});
  await Promise.all(groups.map((g) => chrome.tabGroups.update(g.id, { collapsed })));
  return keep(`${collapsed ? 'Collapsed' : 'Expanded'} ${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`);
}

// ---- Downloads ----------------------------------------------------------

function downloadCommands() {
  return [
    action('dl.showLast', 'Show latest download in Finder', 'download', 'reveal file recent', {
      run: async () => {
        const [last] = await chrome.downloads.search({ limit: 1, orderBy: ['-startTime'] });
        if (!last) return keep('No downloads yet');
        chrome.downloads.show(last.id);
      },
    }),
    action('dl.folder', 'Open downloads folder', 'download', 'finder directory', {
      run: () => chrome.downloads.showDefaultFolder(),
    }),
    action('dl.clear', 'Clear downloads list', 'trash', 'erase remove', {
      children: () =>
        confirm('Clear the downloads list', 'Files on disk are kept', async () => {
          await chrome.downloads.erase({});
          return { reset: true, message: 'Downloads list cleared' };
        }),
    }),
  ];
}

// ---- Destructive groups: browsing data, extensions, privacy, site settings

export const DATA_TYPES = [
  ['cache', 'Cached images and files', { cache: true, cacheStorage: true }],
  ['cookies', 'Cookies and site data', { cookies: true, localStorage: true, indexedDB: true, serviceWorkers: true }],
  ['history', 'Browsing history', { history: true }],
  ['downloads', 'Download history', { downloads: true }],
  ['formData', 'Autofill form data', { formData: true }],
];

export const RANGES = [
  ['Last hour', 3600e3],
  ['Last 24 hours', 24 * 3600e3],
  ['Last 7 days', 7 * 24 * 3600e3],
  ['Last 4 weeks', 28 * 24 * 3600e3],
  ['All time', null],
];

function browsingDataCommand() {
  return action('data.clear', 'Delete browsing data', 'trash', 'clear cache cookies history wipe', {
    children: () =>
      DATA_TYPES.map(([key, title, types]) =>
        action(`data.${key}`, title, 'trash', '', {
          children: () =>
            RANGES.map(([label, ms]) =>
              action(`data.${key}.${label}`, label, 'clock', '', {
                children: () =>
                  confirm(`Delete ${title.toLowerCase()}, ${label.toLowerCase()}`, 'This cannot be undone', async () => {
                    await chrome.browsingData.remove({ since: ms === null ? 0 : Date.now() - ms }, types);
                    return { reset: true, message: `Deleted ${title.toLowerCase()}` };
                  }),
              }),
            ),
        }),
      ),
  });
}

function extensionsCommand() {
  return action('ext.manage', 'Manage extensions', 'puzzle', 'enable disable add-ons toggle', {
    children: async () => {
      const all = (await chrome.management.getAll()).filter((e) => e.type === 'extension' && e.id !== chrome.runtime.id);
      all.sort((a, b) => a.name.localeCompare(b.name));
      return all.map((ext) =>
        action(`ext:${ext.id}`, ext.name, 'puzzle', ext.enabled ? 'on enabled' : 'off disabled', {
          subtitle: ext.enabled ? 'On' : 'Off',
          children: () => [
            ...(ext.mayDisable
              ? [
                  action('ext.toggle', ext.enabled ? `Turn off ${ext.name}` : `Turn on ${ext.name}`, 'check', '', {
                    danger: ext.enabled,
                    run: async () => {
                      await chrome.management.setEnabled(ext.id, !ext.enabled);
                      return { pop: true, message: `${ext.name} is ${ext.enabled ? 'off' : 'on'}` };
                    },
                  }),
                ]
              : []),
            ...(ext.optionsUrl && ext.enabled
              ? [action('ext.options', 'Open its options', 'gear', '', { run: () => openTab({ url: ext.optionsUrl }) })]
              : []),
            action('ext.details', 'Open its details page', 'gear', '', {
              run: () => openTab({ url: `chrome://extensions/?id=${ext.id}` }),
            }),
            { id: 'confirm:no', kind: 'action', title: 'Cancel', icon: 'close', run: () => ({ pop: true }) },
          ],
        }),
      );
    },
  });
}

// [namespace, key, title]. Read live from chrome.privacy; a key Chrome does
// not expose on this platform is skipped at run time.
export const PRIVACY_SETTINGS = [
  ['websites', 'doNotTrackEnabled', 'Send "Do Not Track" requests'],
  ['websites', 'hyperlinkAuditingEnabled', 'Hyperlink auditing pings'],
  ['websites', 'referrersEnabled', 'Send referrer headers'],
  ['websites', 'topicsEnabled', 'Ad topics'],
  ['websites', 'fledgeEnabled', 'Site-suggested ads'],
  ['websites', 'adMeasurementEnabled', 'Ad measurement'],
  ['websites', 'relatedWebsiteSetsEnabled', 'Related website sets'],
  ['services', 'safeBrowsingEnabled', 'Safe Browsing'],
  ['services', 'passwordSavingEnabled', 'Offer to save passwords'],
  ['services', 'autofillAddressEnabled', 'Autofill addresses'],
  ['services', 'autofillCreditCardEnabled', 'Autofill payment methods'],
  ['services', 'searchSuggestEnabled', 'Search suggestions'],
  ['services', 'spellingServiceEnabled', 'Enhanced spell check'],
  ['services', 'translationServiceEnabled', 'Offer to translate pages'],
  ['services', 'alternateErrorPagesEnabled', 'Suggestions for navigation errors'],
  ['network', 'networkPredictionEnabled', 'Preload pages'],
];

// Chrome keeps a value an extension sets until that extension clears it, and
// shows the setting as controlled by the extension meanwhile. So when the
// switch is already ours, let go first; set again only if the user's own
// value is not the one wanted.
export async function flipPrivacy(setting) {
  const { value, levelOfControl } = await setting.get({});
  const target = !value;
  if (levelOfControl === 'controlled_by_this_extension') {
    await setting.clear({});
    if ((await setting.get({})).value === target) return target;
  }
  await setting.set({ value: target });
  return target;
}

function privacyCommand() {
  return action('privacy.toggles', 'Privacy switches', 'shield', 'do not track safe browsing autofill preload toggle', {
    children: async () => {
      const rows = [];
      for (const [ns, key, title] of PRIVACY_SETTINGS) {
        const setting = chrome.privacy?.[ns]?.[key];
        if (!setting) continue;
        const { value, levelOfControl } = await setting.get({});
        const ours = levelOfControl === 'controlled_by_this_extension';
        const locked = !ours && levelOfControl !== 'controllable_by_this_extension';
        rows.push(
          action(`privacy.${key}`, title, 'shield', value ? 'on' : 'off', {
            subtitle: `${value ? 'On' : 'Off'}${locked ? ' · managed elsewhere' : ours ? ' · set by Cmd+K' : ''}`,
            children: () =>
              locked
                ? [action('privacy.locked', 'This switch is controlled by policy or another extension', 'close', '', { run: () => ({ pop: true }) })]
                : confirm(`Turn ${value ? 'off' : 'on'}: ${title}`, '', async () => {
                    const now = await flipPrivacy(setting);
                    return { pop: true, message: `${title} is ${now ? 'on' : 'off'}` };
                  }),
          }),
        );
      }
      return rows;
    },
  });
}

// [contentSettings key, title, allowed values]
export const SITE_SETTINGS = [
  ['javascript', 'JavaScript', ['allow', 'block']],
  ['images', 'Images', ['allow', 'block']],
  ['cookies', 'Cookies', ['allow', 'session_only', 'block']],
  ['popups', 'Pop-ups and redirects', ['allow', 'block']],
  ['notifications', 'Notifications', ['allow', 'ask', 'block']],
  ['location', 'Location', ['allow', 'ask', 'block']],
  ['camera', 'Camera', ['allow', 'ask', 'block']],
  ['microphone', 'Microphone', ['allow', 'ask', 'block']],
  ['automaticDownloads', 'Automatic downloads', ['allow', 'ask', 'block']],
  ['clipboard', 'Clipboard', ['allow', 'ask', 'block']],
];

// chrome.contentSettings can only clear every rule of a type at once, and
// cannot list the rules an extension holds. The rules set from the palette
// are therefore recorded, so one can be dropped and the rest put back.
async function siteRules() {
  return (await chrome.storage.local.get('siteRules')).siteRules || {};
}

export async function heldSiteRule(type, pattern) {
  return (await siteRules())[type]?.[pattern];
}

export async function setSiteRule(type, pattern, value) {
  await chrome.contentSettings[type].set({ primaryPattern: pattern, setting: value });
  const rules = await siteRules();
  rules[type] = { ...rules[type], [pattern]: value };
  await chrome.storage.local.set({ siteRules: rules });
}

export async function resetSiteRule(type, pattern) {
  const rules = await siteRules();
  const { [pattern]: dropped, ...rest } = rules[type] || {};
  await chrome.contentSettings[type].clear({});
  for (const [p, value] of Object.entries(rest)) {
    await chrome.contentSettings[type].set({ primaryPattern: p, setting: value });
  }
  rules[type] = rest;
  await chrome.storage.local.set({ siteRules: rules });
}

const VALUE_LABEL = { allow: 'Allow', block: 'Block', ask: 'Ask', session_only: 'Clear on exit' };

function siteSettingsCommand() {
  return action('site.permissions', 'Site permissions for this site', 'shield', 'javascript camera microphone location notifications cookies allow block', {
    children: async (c) => {
      let origin;
      try {
        const url = new URL(c.tab.url);
        if (!/^https?:$/.test(url.protocol)) throw new Error('not a site');
        origin = url;
      } catch {
        return [action('site.none', 'This page is not a website', 'close', '', { run: () => ({ pop: true }) })];
      }
      const pattern = `${origin.protocol}//${origin.hostname}/*`;
      const rows = [];
      for (const [key, title, values] of SITE_SETTINGS) {
        const setting = chrome.contentSettings?.[key];
        if (!setting) continue;
        const { setting: current } = await setting.get({ primaryUrl: c.tab.url });
        const held = await heldSiteRule(key, pattern);
        rows.push(
          action(`site.${key}`, title, 'shield', current, {
            subtitle: `${VALUE_LABEL[current] || current} on ${origin.hostname}${held ? ' · set by Cmd+K' : ''}`,
            children: () => [
              ...values
                .filter((v) => v !== current)
                .map((v) =>
                  action(`site.${key}.${v}`, `${VALUE_LABEL[v]} ${title.toLowerCase()} on ${origin.hostname}`, 'check', '', {
                    danger: v === 'allow',
                    run: async () => {
                      await setSiteRule(key, pattern, v);
                      return { pop: true, message: `${title}: ${VALUE_LABEL[v]}` };
                    },
                  }),
                ),
              ...(held
                ? [
                    action(`site.${key}.reset`, `Reset ${title.toLowerCase()} on ${origin.hostname} to Chrome's setting`, 'undo', '', {
                      run: async () => {
                        await resetSiteRule(key, pattern);
                        return { pop: true, message: `${title}: reset` };
                      },
                    }),
                  ]
                : []),
              { id: 'confirm:no', kind: 'action', title: 'Cancel', icon: 'close', run: () => ({ pop: true }) },
            ],
          }),
        );
      }
      return rows;
    },
  });
}

// ---- The palette itself -------------------------------------------------

export const THEMES = [
  ['family', 'Family'],
  ['uniswap', 'Uniswap'],
  ['cream', 'Cream and Coral'],
];

export const APPEARANCES = [
  ['system', 'Match system'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

function paletteCommands() {
  return [
    ...THEMES.map(([id, name]) =>
      action(`theme.${id}`, `Theme: ${name}`, 'palette', 'appearance skin colors design', {
        run: (c) => c.setPrefs({ theme: id }, `Theme: ${name}`),
      }),
    ),
    ...APPEARANCES.map(([id, name]) =>
      action(`appearance.${id}`, `Appearance: ${name}`, 'palette', 'dark mode light mode theme', {
        run: (c) => c.setPrefs({ appearance: id }, `Appearance: ${name}`),
      }),
    ),
    action('palette.resetPosition', 'Reset palette position', 'palette', 'center move drag placement location default', {
      subtitle: 'Drag the search row, or hold Option and drag anywhere, to move it',
      run: (c) => c.resetPosition(),
    }),
    action('palette.clearLearned', 'Clear learned ranking', 'palette', 'forget reset history picks frequent recent order memory', {
      subtitle: 'The palette ranks what you pick often for the same typing higher',
      children: (c) =>
        confirm('Clear learned ranking', 'Results go back to plain text order', () => c.clearLearned()),
    }),
    action('palette.options', 'Cmd+K options', 'gear', 'settings preferences palette', {
      run: () => chrome.runtime.openOptionsPage(),
    }),
    action('palette.shortcut', 'Change the palette shortcut', 'gear', 'keyboard hotkey rebind cmd+k key', {
      run: () => openTab({ url: 'chrome://extensions/shortcuts' }),
    }),
  ];
}

export function buildCommands() {
  return [
    ...tabCommands(),
    ...downloadCommands(),
    browsingDataCommand(),
    extensionsCommand(),
    privacyCommand(),
    siteSettingsCommand(),
    ...paletteCommands(),
  ];
}

// Ids of the commands that can destroy data or weaken a setting. tests check
// that none of them exposes run() without a choice step first.
export const GUARDED = [
  'tabs.closeOthers',
  'tabs.closeRight',
  'tabs.closeDuplicates',
  'win.close',
  'dl.clear',
  'data.clear',
  'ext.manage',
  'privacy.toggles',
  'site.permissions',
  'palette.clearLearned',
];
