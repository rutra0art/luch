# Luch

A minimal Chromium-based browser for macOS with a Russian interface, built on Electron.

## Features

- **Spaces** that work like profiles: each one has its own logins, cookies and site data. Switch with ⌃1…⌃9.
- **Sidebar tabs**: favorite tiles, pinned tabs and folders, tab groups, drag and drop, unloaded tabs restored from the last session.
- **Command bar** (⌘L): open sites, search, ask Gemini, jump to open tabs, pinned tabs and history, run skills with `/`.
- **Gemini chat** (⌘E) in a full-height side panel, signed in with a regular Google account (no API keys), with page-aware skills.
- **In-place page translation**: online through Google (no key), with macOS on-device translation as an offline fallback. Brand names are kept, menus are translated in context, and the whole site keeps translating as you browse.
- **First-run intro and import** from Chrome, Arc, Dia, Edge, Brave, Yandex, Opera, Vivaldi and Firefox: bookmarks, history and site logins (cookies), several browsers at once.
- **Chrome extensions** installed straight from the Chrome Web Store, with toolbar icons.
- **Ad, tracker and cookie-banner blocking** (EasyList and uBlock Origin filters).
- Split view, auto-hiding sidebar, incognito windows, history, downloads, find in page, per-site notes, auto-fit of wide sites, theme-aware Eclipse icon.

A version built on a real Chromium, where Google sign-in works, lives in [`chromium/`](chromium/README.md).

## Run

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm start
```

On macOS you can also double-click `Запустить Luch.command`.

Run with a clean profile (first-run experience): `npx electron . --profile=/tmp/luch-fresh`.

## Tests

```bash
npm test          # unit tests
npm run test:e2e  # UI tests against a running Luch started with --remote-debugging-port=9333
```

## License

Luch uses [electron-chrome-extensions](https://github.com/samuelmaddock/electron-browser-shell), which is distributed under GPL-3.0, so Luch is licensed under GPL-3.0 as well.
