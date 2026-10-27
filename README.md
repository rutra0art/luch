# Luch

A minimal Chromium-based browser for macOS with a Russian interface, built on Electron.

## Features

- **Spaces** that work like profiles: each one has its own logins, cookies and site data. Switch with ⌃1…⌃9.
- **Sidebar tabs**: favorite tiles, pinned tabs and folders, tab groups, drag and drop, unloaded tabs restored from the last session.
- **Command bar** (⌘L): open sites, search, ask Gemini, jump to open tabs, pinned tabs and history, run skills with `/`.
- **Gemini chat** (⌘E) in a full-height side panel, signed in with a regular Google account (no API keys), with page-aware skills.
- **Translation** of whole pages through Google Translate, manual or automatic.
- **Chrome extensions** installed straight from the Chrome Web Store, with toolbar icons.
- **Ad, tracker and cookie-banner blocking** (EasyList and uBlock Origin filters).
- Split view, auto-hiding sidebar, incognito windows, history, downloads, find in page, per-site notes.

## Run

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm start
```

On macOS you can also double-click `Запустить Луч.command`.

## License

Luch uses [electron-chrome-extensions](https://github.com/samuelmaddock/electron-browser-shell), which is distributed under GPL-3.0, so Luch is licensed under GPL-3.0 as well.
