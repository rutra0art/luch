# Luch on Chromium

The Luch interface (the same `index.html`, `app.js` and `style.css` as the Electron version) running inside a real Chromium 159, so that Google sign-in works.

## How it works

- `extension/` — a built-in extension that holds the whole Luch UI (`extension/ui/`). Luch opens it in its own window at startup; every tab is a Chromium `<webview>`.
  - `ui/webview-electron.js` gives Chromium's `<webview>` the Electron webview API the UI was written for (`did-navigate`, `page-title-updated`, `executeJavaScript`, `loadURL`, …).
  - `ui/luch-api.js` implements `window.luch` — what the Electron main process used to do: context menus, downloads, extensions list, translation, menu commands and shortcuts.
  - `ui/guest-keys.js` is injected into web pages so Luch shortcuts (⌘E, ⌘⇧Y, ⌥⌘=, …) also work while a page has focus; `ui/guest-swipe.js` adds two-finger trackpad swipes for back and forward with an edge arrow, as in Chrome.
  - `ui/blocker.js` blocks ads, trackers and cookie banners in every tab with the same Ghostery engine as the Electron version (`ui/adblocker.js` is built by `npm run build:adblocker`).
  - Import from other browsers: `native/importer.swift` (built by `npm run build:importer` into `luch-importer`, bundled into `Luch.app/Contents/Resources`) reads bookmarks, history and cookies of Chrome, Arc, Dia, Edge, Brave, Yandex, Vivaldi, Opera, Chromium and Firefox; Luch talks to it through native messaging (`org.luch.importer`).
  - `ui/space-theme.js` — space themes: 1–3 colour dots on a pad (position = hue and lightness), colour rows (vivid, pastel, deep, grey), auto/light/dark mode, a saturation wave and a grain dial; the window background and the new tab follow the theme of the current space.
  - Private spaces keep cookies, logins and site data in memory only (a `<webview>` partition without `persist:`), are not written to history and are not restored at startup; the space menu can wipe them at once.
  - `ui/page-shot.js` — page screenshots (⇧⌘S or the page context menu): the visible part, the whole page (scrolled and stitched, fixed headers hidden after the first frame, up to 32000 px) or an area selected with the mouse; saved to Downloads as PNG and copied. "Save as PDF" uses Chromium's print dialog.
  - Picture-in-picture: ⌥⌘P opens the main video of the page in a floating window (see the guest view change below).
  - Updates: Luch checks the latest GitHub release (`version_name` in `extension/manifest.json` is the Luch version), downloads the DMG in the background and hands it to the helper (`native/importer.swift`, `update` command), which checks the SHA-256 from the release, verifies the app's signature and puts it next to the running one; a detached process swaps them when Luch quits ("Restart now" quits and relaunches at once).
  - The DNS section of the settings sets Chromium's DNS-over-HTTPS server (presets or your own `https://…/dns-query` address).
  - Apple Passwords: `apple-passwords.js` (in the background service worker) talks to macOS's `PasswordManagerBrowserExtensionHelper` — the helper behind Apple's iCloud Passwords extension for Chrome — over native messaging (`com.apple.passwordmanager`). Pairing uses the six-digit code macOS shows (SRP, RFC 5054), then requests are AES-GCM encrypted; the protocol follows [apw](https://github.com/bendews/apw) (GPL-3.0). The session key lives in `chrome.storage.session` only, so the code is asked again after Luch restarts, as in Apple's extension. `ui/guest-passwords.js` shows the site's accounts under login fields and fills the chosen one; the site is taken from the message sender, never from the page.
- `luch-chromium.patch` — changes to the Chromium source tree:
  - product name and bundle id `Luch` / `org.luch.Luch`, profile folder `~/Library/Application Support/Luch`, Russian strings say "Luch";
  - the built-in extension is bundled into `Luch.app/Contents/Resources/luch-extension`, loaded at startup and opened as the Luch window;
  - `<webview>` and `settingsPrivate` (for the DNS setting) are allowed for the built-in extension only (by its fixed id);
  - `chrome.cookies.set` accepts `storeId: "luch-partition:<name>"` from the built-in extension, so imported logins land in the storage of a Luch space (`<webview partition="persist:<name>">`);
  - `<webview>` guests pass picture-in-picture requests to the embedder's window (`components/guest_view/browser/guest_view_base.cc`); without this `requestPictureInPicture()` in a tab never resolved;
  - the `org.luch.importer` native messaging host is found inside `Luch.app` without installing anything, and the `com.apple.passwordmanager` host description is written with the built-in extension allowed;
  - the Luch window has no system title bar: the UI goes under it, the window buttons sit in the sidebar header, and `-webkit-app-region: drag` areas move the window, like `titleBarStyle: 'hiddenInset'` in Electron (`chrome/browser/ui/luch_window.h`);
  - when the built-in extension's version changes, its old service worker registration is removed before the new one is registered — it is loaded from a folder, not updated like a store extension, so otherwise the old `background.js` would keep running (bump `version` in `extension/manifest.json` whenever `background.js` or its imports change);
  - in a Luch window, Chromium menu commands and reserved shortcuts (⌘T, ⌘W, ⌘L, ⌘R, ⌘1…⌘9, …) are passed to the Luch UI; ⌘N / ⌘⇧N open new Luch windows.

The app icon is an Icon Composer icon (`icon/AppIcon.icon`, light and dark variants made from `../src/assets/icon-*.png`), compiled with `xcrun actool AppIcon.icon --compile out --platform macosx --app-icon AppIcon --minimum-deployment-target 12.0` into the `Assets.car` that goes to `chrome/app/theme/chromium/mac/`. Build with `dcheck_always_on = false` in `args.gn`, like regular Chrome.

## Develop without rebuilding

```bash
LUCH_EXTENSION_DIR=/path/to/luch/chromium/extension ~/chromium/src/out/Release/Luch.app/Contents/MacOS/Luch
```

Luch then loads the UI straight from this folder: edit a file and reload the window (⌘⌥R in DevTools, or restart).

UI tests: start Luch with `--remote-debugging-port=9335`, then `LUCH_PORT=9335 npm run test:e2e`.

## Build

```bash
cd ~/chromium/src
git apply /path/to/luch/chromium/luch-chromium.patch
rsync -a --delete /path/to/luch/chromium/extension/ chrome/browser/resources/luch_extension/
mkdir -p chrome/browser/resources/luch_extension_bin && cp /path/to/luch/chromium/native/luch-importer chrome/browser/resources/luch_extension_bin/
gn gen out/Release
autoninja -C out/Release chrome
open out/Release/Luch.app
```

## Not ported yet

Offline macOS translation.
