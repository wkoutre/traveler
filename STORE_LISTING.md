# Chrome Web Store submission

Everything that goes into the Chrome Web Store dashboard for Traveler. For the step-by-step first upload, with the local path of every file, see [README: First Chrome Web Store upload](README.md#first-chrome-web-store-upload). Package: `dist/traveler-<version>.zip`, built by `./release.sh` (CI builds and submits it on every release; see README "Release").

Store search weighs the name most, then the summary, then the description. Name and summary come from `extension/manifest.json` (`name`, `description`); the rest is edited in the dashboard. Keep other products' names out of all three (the store's keyword-spam policy).

## Store listing tab

- **Name** (75 max, 63 used): Traveler: Command Palette for Chrome Tabs, Bookmarks & Settings
- **Summary** (132 max, 129 used): Press Cmd+K to search tabs, bookmarks, history and every Chrome setting, and run browser actions. Free, open source, no tracking.
- **Description:**

  > Traveler gets you anywhere in Chrome from the keyboard. Press Cmd+K (Ctrl+K on Windows and Linux) on any page, type a few letters, press Enter.
  >
  > WHAT YOU CAN DO
  > • Switch to any open tab, in any window, by typing part of its title or address.
  > • Search and open bookmarks, history, your Reading List and recently closed tabs.
  > • Jump straight to any Chrome settings page: passwords, privacy, site settings, extensions, downloads, flags and more.
  > • Run browser actions: close, pin, mute, duplicate or reload tabs, move a tab to a new window, close duplicates, merge windows, group tabs by site.
  > • Turn other extensions on or off and open their options.
  > • Flip privacy switches and per-site permissions (camera, location, notifications...) for the page you're on.
  > • Clear cache, cookies or history for a time range you choose.
  > • Search the web with your default search engine.
  >
  > LEARNS WHAT YOU PICK
  > Pick the same result twice for the same typing and it comes first next time. Habits fade after a few weeks; "Clear learned ranking" forgets everything.
  >
  > SAFE BY DEFAULT
  > Anything that deletes data, closes many tabs or changes a setting asks first, with a Cancel row. Settings changed from Traveler can be handed back to Chrome in one step.
  >
  > PRIVATE AND LIGHT
  > No servers, no analytics, no account, no network requests of its own. No content scripts run on your pages: Traveler wakes only when you press the shortcut and costs nothing while idle. Everything it remembers stays on your computer.
  >
  > FREE AND OPEN SOURCE
  > MIT licensed. Read every line at github.com/wkoutre/traveler. Traveler is part of a small suite of keyboard-first Chrome extensions, with Keyline for Gmail.
  >
  > Found a bug or want a command? Open an issue at github.com/wkoutre/traveler/issues.
  >
  > Tip: if Cmd+K is already taken by another extension, set your own shortcut at chrome://extensions/shortcuts (or run "Change the palette shortcut" from the palette).

- **Category:** Productivity: Tools (Workflow & Planning also fits).
- **Language:** English
- **Icon:** `extension/icons/128.png`
- **Screenshots** (1280×800, in `store-assets/`, made from a throwaway profile with demo tabs and bookmarks):
  1. `screenshot-1-palette-1280x800.png`: "Everything in Chrome, one keystroke away"
  2. `screenshot-2-tabs-1280x800.png`: "Find any tab in any window"
  3. `screenshot-3-settings-1280x800.png`: "Every Chrome setting, by name"
  4. `screenshot-4-safety-1280x800.png`: "Destructive actions always ask first"
  5. `screenshot-5-themes-1280x800.png`: "Light, dark and two themes"
- **Small promo tile** (440×280): `store-assets/promo-tile-440x280.png`
- **Homepage URL:** https://github.com/wkoutre/traveler
- **Support URL:** https://github.com/wkoutre/traveler/issues

## Privacy tab

- **Single purpose:** A keyboard command palette for navigating and controlling the browser: find tabs, bookmarks, history and settings pages, and run browser actions.
- **Permission justifications:**
  - `activeTab`: Show the palette over the current page, only when the user presses the shortcut.
  - `scripting`: Insert the palette frame into the current page after the shortcut press that granted activeTab.
  - Optional host access (`http://*/*`, `https://*/*`): never requested on Chrome. Some Chromium browsers grant activeTab to no keyboard shortcut; there the user can allow it from the palette so the palette opens over the current page instead of in a separate window. Used only to insert the palette frame after the shortcut.
  - `storage`: Save the user's theme, the palette's position and the learned result ranking, locally.
  - `tabs`: List, search, switch to, close, pin, mute, duplicate, reload and move the user's tabs from the palette.
  - `tabGroups`: Add tabs to groups, ungroup, collapse or expand groups, and group tabs by site.
  - `bookmarks`: Search and open the user's bookmarks.
  - `history`: Search and open browsing history, and delete it when the user confirms.
  - `sessions`: List and reopen recently closed tabs and windows.
  - `downloads`: Show the latest download, open the downloads folder and clear the download list.
  - `readingList`: Search and open Reading List items.
  - `favicon`: Show site icons next to results from Chrome's local favicon cache.
  - `management`: List other installed extensions, turn them on or off and open their options pages, when the user picks one.
  - `browsingData`: Delete cache, cookies, history, download history or form data for a time range, only after the user confirms.
  - `contentSettings`: Read and change per-site permissions (camera, microphone, location, notifications and more) for the current site, only after the user confirms.
  - `privacy`: Read and change Chrome's privacy switches, only after the user confirms, and hand them back to Chrome on request.
  - `search`: Run a web search with the user's default search engine.
- **Remote code:** No, I am not using remote code.
- **Data usage:** collects no user data. Certify all three disclosures (not sold, not used for unrelated purposes, not used for creditworthiness).
- **Privacy policy URL:** https://github.com/wkoutre/traveler/blob/main/PRIVACY.md

## Distribution tab

- Public, all regions, free.
