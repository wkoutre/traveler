# Traveler Privacy Policy

Last updated: November 20, 2026

Traveler is a Chrome extension that opens a command palette (Cmd+K, or Ctrl+K on Windows and Linux) for searching your tabs, bookmarks, history and Chrome settings and running browser actions.

## What Traveler collects

Nothing.

- No analytics, telemetry or tracking of any kind.
- No servers. The extension makes no network requests of its own. Site icons come from Chrome's local favicon cache. A web search typed into the palette is handed to your browser's default search engine, exactly as if you had typed it in the address bar.
- No accounts. There is nothing to sign up for.

## What Traveler reads

When you open the palette, it reads your open tabs, bookmarks, history, Reading List, recently closed tabs, downloads and installed extensions through Chrome's own APIs, so it can show them as results. That data is read on the spot, shown in the palette and discarded when the palette closes. It is never stored by Traveler, never synced and never sent anywhere.

## What Traveler stores

Kept in `chrome.storage.local`, on this computer only, never synced:

- Your preferences: theme and light or dark appearance.
- Where you last left the palette on screen.
- The per-site permissions you changed from the palette, so a Reset can hand them back to Chrome.
- Browser pages you had open: the address and title of your browser's own pages (such as `brave://rewards` or `chrome://settings/system`) seen open or recently closed, at most 150, so they stay searchable after you close them. Pages in private windows are never recorded. Web pages are never recorded here.
- Learned ranking: the text you typed and the id or address of the result you picked, at most 500 pairs, so the palette can rank your usual picks first. Picks made in a private window are never recorded. The palette command "Clear learned ranking" deletes the record and the remembered browser pages.

Removing the extension removes all of it.

## Permissions

Each permission is used only when you act in the palette:

- `activeTab`, `scripting`: show the palette over the current page when you press the shortcut.
- Optional access to websites: asked for only if you choose it, on browsers that give the shortcut no access to the page (Dia). Used only to show the palette over the page when you press the shortcut; Traveler reads nothing from pages.
- `storage`: your preferences, palette position and learned ranking, as above.
- `tabs`, `tabGroups`: search, switch, close, pin, mute, move and group tabs.
- `bookmarks`, `history`, `readingList`, `sessions`: search and open bookmarks, history, Reading List items and recently closed tabs.
- `downloads`: show the latest download, open the downloads folder, clear the list.
- `favicon`: show site icons from Chrome's local cache.
- `management`: list your other extensions, turn them on or off and open their options.
- `browsingData`: delete cache, cookies, history and similar data, only after you confirm a time range.
- `contentSettings`, `privacy`: read and change per-site permissions and Chrome's privacy switches, only after you confirm.
- `search`: send a web search to your default search engine.

## Changes

Any change to this policy will appear in this file, with an updated date, in the public source repository.

## Contact

Open an issue at https://github.com/wkoutre/traveler/issues.
