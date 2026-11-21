# Cmd+K for Chrome

A command palette for Google Chrome. Press Cmd+K on any page to search open tabs, bookmarks, history and recently closed tabs, open any Chrome settings page, and run browser actions without leaving the keyboard.

It is a Manifest V3 extension written in plain JavaScript, with no dependencies and no build step.

## Install

1. Open `chrome://extensions` and turn on Developer mode.
2. Choose "Load unpacked" and select the `extension/` folder.
3. Press Cmd+K. To use a different shortcut, or if Chrome did not assign this one because another extension holds it, set it at `chrome://extensions/shortcuts` (the palette's "Change the palette shortcut" command opens that page). Chrome gives extensions no way to set their own shortcut.

## Use

| Key | Does |
|---|---|
| Cmd+K | Open or close the palette |
| Up, Down, Ctrl+N, Ctrl+P | Move |
| Enter | Run the highlighted row, or open its page of choices |
| Tab, Shift+Tab | Switch scope: All, Tabs, Actions, Settings, Bookmarks, History |
| Cmd+Backspace | Close the highlighted tab |
| Backspace on an empty field, Esc | Go back one page; Esc at the root closes |
| Drag the search row, or Option-drag anywhere | Move the palette |

On pages the browser does not let extensions touch (`chrome://` pages, the Web Store, the PDF viewer) the palette opens in a small window of its own, centered over the browser window, instead of an overlay. That window closes on Esc, on a second press of the shortcut, or when it loses focus. Clicking the toolbar icon opens the same palette as a popup.

The palette opens where you last left it. The overlay remembers its place as a share of the page, so it stays put when the browser is resized; the palette's own window remembers its offset from the browser window, and dragging its title bar counts too. The command "Reset palette position" puts both back in the center. The toolbar popup is placed by the browser and does not move.

## Learned ranking

The palette remembers which result you pick for what you typed, and ranks it higher the next time. The rules, all in `extension/src/learn.js`:

- **Two picks to lead.** The first pick for some typed text moves that result up, but the best text match keeps first place. The second pick puts it first.
- **A changed habit wins after two picks.** Each pick halves the other results learned for the same text.
- **It carries over while you type.** A pick for "sett" counts in part for "set" and "settin", by the share of characters in common.
- **Exact typing wins.** A result picked twice for exactly what you typed leads one that only carried over from other typing, so "sett" and "settings" can each keep a different first result.
- **It fades.** A pick loses half its weight every 30 days, so a result picked twice and then left alone gives up first place after about three weeks.
- **Overall use counts a little.** A result you pick often, whatever you typed, gets a small bonus that never beats a clearly better text match.

Pages are learned by address, so an open tab, a bookmark and a history entry for the same address share what was learned. The record holds the text you typed and the id or address of what you picked, at most 500 pairs, in the browser profile on this machine. Picks made from a private window are not recorded, nor are web searches, steps inside a command's page of choices, or a pick made when the palette cannot tell which tab it was opened from. The command "Clear learned ranking" deletes the record. Deleting browsing data, from the palette or in the browser, leaves the record in place; clear it separately.

## What it reaches

- **Tabs and windows:** switch, close, pin, mute, duplicate, reload, move to a new window, zoom, close others or duplicates, discard background tabs, merge windows.
- **Tab groups:** add to a group, ungroup, collapse or expand all, group by site.
- **Chrome pages:** every settings section and the internal pages listed in `extension/src/catalog.js`.
- **Bookmarks, history, Reading List, recently closed tabs:** search and open.
- **Downloads:** show the latest file, open the folder, clear the list.
- **Extensions:** turn others on or off, open their options.
- **Privacy switches and per-site permissions:** read the live value and change it.
- **Web search:** when nothing else fits, search the web with the browser's default search engine. The extension asks the browser to run the search and never learns which engine it is.
- **Browsing data:** delete cache, cookies, history, download history or form data for a chosen time range.

Chrome has no extension API for menu-only features (Always Show Bookmarks Bar, Task Manager, Print, DevTools). Those are not reachable yet.

## Cost while idle

No content script is registered and the extension has no host permissions. The service worker has one listener, for the shortcut, and Chrome stops it when idle. The palette is injected into the current tab only when the shortcut fires, using the access `activeTab` grants for that key press.

## Safety

- Commands that delete data, close many tabs, or change a privacy, site or extension setting never run from the first Enter. Each ends in a page with an explicit choice and a Cancel row.
- The palette page is web-accessible so the overlay can frame it, which means any page can also frame it or open it in a tab. It stays blank unless it is the overlay with a one-time token the service worker stored for that key press, the palette's own window with the same kind of token, or the toolbar popup. The overlay frame sits in a closed shadow root so the page cannot read its URL. A page can still detect that the extension is installed.
- A privacy switch or site permission changed from the palette is marked "set by Cmd+K". Flipping a switch back, or choosing Reset on a site permission, hands the setting back to Chrome instead of leaving the extension in control of it.
- The extension makes no network requests of its own. A web search is run by the browser, with the engine set in its settings. Site icons come from Chrome's local favicon cache.

## Themes

Family (default, light only), Uniswap and Cream and Coral, each with tokens copied from the design system's own files. Switch from the palette ("Theme: …", "Appearance: …") or the options page. To add a theme, add one token block to `extension/src/themes.css`, one entry to `THEMES` in `catalog.js`, and its id to the list in `boot.js`; `npm test` fails if a token is missing.

The themes name their fonts (Inter, Basel Grotesk) but ship no font files, so each falls back to the system font where the named one is not installed.

## Develop

```sh
npm test                      # unit tests, Node only
cd e2e && npm ci && node run.mjs   # browser tests against the installed Chrome
```

The browser tests start Chrome with a throwaway profile. Suites: `overlay`, `ui`, `window` (the fallback window on a `chrome://` page), `pages` (loads every catalogued `chrome://` URL), `idle` (waits 40 seconds, then checks the service worker has stopped) and `shots` (theme screenshots in `e2e/out/`). Pass suite names to run a subset.

Chrome grants `activeTab` only on a real key press, which automation cannot send to the shortcut handler. The overlay suite therefore loads a temporary copy of the extension with host access added and fires the command event directly; pressing the real shortcut is a manual check.
