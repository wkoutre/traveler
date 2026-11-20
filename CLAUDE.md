# cmdk-chrome

A Cmd+K command palette for Chrome: MV3, plain JavaScript, no dependencies, no build step. `README.md` describes behavior; this file is what to know before changing it.

## Layout

- `extension/src/background.js`: the service worker. One listener (`commands.onCommand`). Keep it that way: any other listener, alarm or content script adds idle cost.
- `extension/src/overlay.js`: the function injected into the page. It is serialized by `chrome.scripting`, so it must stay self-contained.
- `extension/src/palette.{html,js,css}`: the UI, shared by the overlay frame, the toolbar popup and a plain tab (`?mode=`).
- `extension/src/catalog.js`: every command and Chrome page, as data.
- `extension/src/fuzzy.js`: the matcher. Pure, tested in Node.
- `extension/src/themes.css`: one token block per theme. `boot.js` applies the theme before first paint.

## Rules

- A command that deletes data, closes many tabs, or changes a setting has `children()` ending in `confirm()` or an explicit choice, never a top-level `run()`. Add its id to `GUARDED`.
- A new permission needs a line in the `evidence` map in `tests/catalog.test.js`; an unused one fails the test.
- Verify a new `chrome://` URL with `node run.mjs pages` in `e2e/`. Chrome renames and removes these between versions.
- Theme values come from the design system's token files. Mark anything the system does not define with an `addition` comment.
- No network requests, no remote code, no `innerHTML` with page or user data.

## Tests

`npm test` for unit tests; `cd e2e && node run.mjs` for the real browser. Write the failing test first for a behavior change.
