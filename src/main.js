const { app, BrowserWindow, Menu, shell, ipcMain, nativeTheme, nativeImage, session, webContents, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const { installChromeWebStore, uninstallExtension } = require('electron-chrome-web-store');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const { adsLists, adsAndTrackingLists, fullLists } = require('@ghostery/adblocker');
const importer = require('./importer');
const translator = require('./translator');

app.setName('Luch');
// Данные остаются в прежней папке «Луч»: вкладки, входы на сайты и настройки не теряются после переименования
// --profile=<папка> запускает Luch с отдельным профилем, например чистым — как при первой установке
const profileArg = process.argv.find(a => a.startsWith('--profile='));
app.setPath('userData', profileArg ? profileArg.slice('--profile='.length) : path.join(app.getPath('appData'), 'Луч'));
app.commandLine.appendSwitch('lang', 'ru');

// Представляемся обычным Chrome: иначе Google не даёт войти в аккаунт во «встроенном браузере»
app.userAgentFallback =
  `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

const extensionsPath = () => path.join(app.getPath('userData'), 'Extensions');
const prefsFile = () => path.join(app.getPath('userData'), 'prefs.json');

// ---------- Настройки главного процесса ----------

const DEFAULT_PREFS = { blockAds: true, blockTrackers: true, blockCookieBanners: true };
let prefs = { ...DEFAULT_PREFS };

function readPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) }; } catch { return { ...DEFAULT_PREFS }; }
}

// ---------- Окна ----------

function createWindow({ incognito = false } = {}) {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 640,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: incognito ? '#141416' : nativeTheme.shouldUseDarkColors ? '#1d2633' : '#f6efdc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Своему интерфейсу разрешаем полноценный preload: он подключает панель расширений
      sandbox: false,
      webviewTag: true,
    },
  });
  win.loadFile(path.join(__dirname, 'ui', 'index.html'), { query: incognito ? { incognito: '1' } : {} });

  // Каждую вкладку регистрируем в системе расширений её сессии
  // Интерфейсу нужно знать о полноэкранном режиме: в нём сайты не подгоняются по ширине
  win.on('enter-full-screen', () => win.webContents.send('command', 'fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('command', 'fullscreen', false));

  win.webContents.on('did-attach-webview', (_e, wc) => {
    ElectronChromeExtensions.fromSession(wc.session)?.addTab(wc, win);
  });
  return win;
}

function hostWindowOf(contents) {
  return BrowserWindow.getAllWindows().find(w => w.webContents.id === contents.hostWebContents?.id)
    || BrowserWindow.getFocusedWindow()
    || BrowserWindow.getAllWindows()[0];
}

function send(cmd, ...args) {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send('command', cmd, ...args);
}

app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;

  // Ссылки с target=_blank и ⌘-клики открываем вкладками, а не новыми окнами
  contents.setWindowOpenHandler(({ url, disposition }) => {
    hostWindowOf(contents)?.webContents.send('command', 'open-url', url, {
      background: disposition === 'background-tab',
      openerId: contents.id,
    });
    return { action: 'deny' };
  });
  contents.on('will-navigate', (e, url) => {
    if (!/^(https?|file|about|data|chrome-extension):/.test(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // Контекстное меню страницы
  contents.on('context-menu', (_ev, params) => {
    const win = hostWindowOf(contents);
    const cmd = (...args) => () => win.webContents.send('command', ...args);
    const items = [];
    if (params.linkURL) {
      items.push(
        { label: 'Открыть ссылку в новой вкладке', click: cmd('open-url', params.linkURL, { background: true, openerId: contents.id }) },
        { label: 'Открыть рядом на разделённом экране', click: cmd('open-split', params.linkURL) },
        { label: 'Копировать адрес ссылки', click: () => clipboard.writeText(params.linkURL) },
        { type: 'separator' },
      );
    }
    if (params.selectionText) {
      const short = params.selectionText.trim().slice(0, 24);
      items.push(
        { label: 'Копировать', role: 'copy' },
        { label: `Спросить Gemini о «${short}${params.selectionText.length > 24 ? '…' : ''}»`, click: cmd('ask-selection', params.selectionText) },
        { type: 'separator' },
      );
    }
    if (params.isEditable) {
      items.push({ label: 'Вырезать', role: 'cut' }, { label: 'Копировать', role: 'copy' }, { label: 'Вставить', role: 'paste' }, { type: 'separator' });
    }
    if (params.mediaType === 'image' && params.srcURL) {
      items.push(
        { label: 'Открыть картинку в новой вкладке', click: cmd('open-url', params.srcURL, { background: true }) },
        { label: 'Сохранить картинку', click: () => contents.downloadURL(params.srcURL) },
        { label: 'Копировать картинку', click: () => contents.copyImageAt(params.x, params.y) },
        { type: 'separator' },
      );
    }
    const nav = contents.navigationHistory;
    items.push(
      { label: 'Назад', enabled: nav.canGoBack(), click: () => nav.goBack() },
      { label: 'Вперёд', enabled: nav.canGoForward(), click: () => nav.goForward() },
      { label: 'Обновить', click: () => contents.reload() },
    );
    const extItems = ElectronChromeExtensions.fromSession(contents.session)?.getContextMenuItems(contents, params) || [];
    if (extItems.length) items.push({ type: 'separator' }, ...extItems);
    items.push({ type: 'separator' }, { label: 'Просмотреть код', click: () => contents.inspectElement(params.x, params.y) });
    Menu.buildFromTemplate(items).popup({ window: win });
  });
});

// ---------- Сессии: у каждого пространства свои cookie, входы и данные ----------

const preparedSessions = new WeakSet();
const knownSessions = new Set();

function setupSession(ses, { incognito = false } = {}) {
  if (preparedSessions.has(ses)) return;
  preparedSessions.add(ses);
  knownSessions.add(ses);
  ses.on('will-download', onDownload);
  applyBlocker(ses);
  if (incognito) return;

  new ElectronChromeExtensions({
    license: 'GPL-3.0',
    session: ses,
    async createTab(details) {
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      const wcId = await requestTab(win, details.url);
      return [webContents.fromId(wcId), win];
    },
    selectTab(wc, win) { win.webContents.send('command', 'select-webcontents', wc.id); },
    removeTab(wc, win) { win.webContents.send('command', 'close-webcontents', wc.id); },
    createWindow() { return createWindow(); },
    removeWindow(win) { win.close(); },
  });

  // Магазин расширений Chrome: кнопка «Установить» работает прямо на chromewebstore.google.com.
  // Папка расширений общая, поэтому установленное доступно во всех пространствах
  installChromeWebStore({ session: ses, extensionsPath: extensionsPath() })
    .catch(err => console.error('Chrome Web Store:', err));
}

// Сессии вкладок создаются лениво — при первом webview с нужным partition
app.on('session-created', (ses) => {
  app.whenReady().then(() => {
    if (ses !== session.defaultSession) setupSession(ses, { incognito: !ses.isPersistent() });
  });
});

// Вкладка, открытая по просьбе расширения: ждём, пока интерфейс создаст её и сообщит id
const pendingTabs = new Map();
function requestTab(win, url) {
  const token = crypto.randomUUID();
  return new Promise((resolve) => {
    pendingTabs.set(token, resolve);
    win.webContents.send('command', 'open-url', url || 'about:blank', { token });
  });
}
ipcMain.on('tab-created', (_e, token, wcId) => {
  pendingTabs.get(token)?.(wcId);
  pendingTabs.delete(token);
});

ipcMain.on('tab-selected', (_e, wcId) => {
  const wc = webContents.fromId(wcId);
  if (wc) ElectronChromeExtensions.fromSession(wc.session)?.selectTab(wc);
});

// ---------- Блокировка рекламы, трекеров и cookie-баннеров ----------

const engines = new Map();
let blocker = null;

function listsFor(p) {
  const urls = [];
  if (p.blockAds) urls.push(...adsLists);
  if (p.blockTrackers) urls.push(...adsAndTrackingLists.filter(u => !adsLists.includes(u)));
  if (p.blockCookieBanners) urls.push(...fullLists.filter(u => !adsAndTrackingLists.includes(u)));
  return urls;
}

async function loadEngine() {
  const lists = listsFor(prefs);
  if (!lists.length) return null;
  const key = lists.join('|');
  if (!engines.has(key)) {
    const cache = path.join(app.getPath('userData'), `adblock-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 10)}.bin`);
    engines.set(key, ElectronBlocker.fromLists(fetch, lists, { enableCompression: true }, {
      path: cache,
      read: fs.promises.readFile,
      write: fs.promises.writeFile,
    }));
  }
  return engines.get(key);
}

function applyBlocker(ses) {
  if (blocker && !blocker.isBlockingEnabled(ses)) blocker.enableBlockingInSession(ses);
}

async function refreshBlocker() {
  const next = await loadEngine().catch((err) => { console.error('Блокировщик:', err); return null; });
  for (const ses of knownSessions) {
    if (blocker && blocker !== next && blocker.isBlockingEnabled(ses)) blocker.disableBlockingInSession(ses);
    if (next && !next.isBlockingEnabled(ses)) next.enableBlockingInSession(ses);
  }
  blocker = next;
}

ipcMain.handle('prefs', () => prefs);
ipcMain.handle('set-prefs', async (_e, patch) => {
  prefs = { ...prefs, ...patch };
  fs.writeFileSync(prefsFile(), JSON.stringify(prefs));
  await refreshBlocker();
  return prefs;
});

// ---------- Загрузки ----------

const downloads = new Map();
let downloadSeq = 1;

function onDownload(_e, item) {
  const id = downloadSeq++;
  downloads.set(id, item);
  const info = () => ({
    id,
    name: item.getFilename(),
    received: item.getReceivedBytes(),
    total: item.getTotalBytes(),
    state: item.getState(),
  });
  const push = () => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send('download', info()); };
  push();
  item.on('updated', push);
  item.once('done', push);
}

ipcMain.handle('download-action', (_e, id, action) => {
  const item = downloads.get(id);
  if (!item) return;
  const file = item.getSavePath();
  if (action === 'open' && file) shell.openPath(file);
  else if (action === 'show' && file) shell.showItemInFolder(file);
  else if (action === 'cancel') item.cancel();
});

// ---------- Расширения: список и удаление ----------

ipcMain.handle('extensions', () => {
  const seen = new Map();
  for (const ses of knownSessions) {
    for (const x of ses.extensions.getAllExtensions()) {
      if (!seen.has(x.id)) seen.set(x.id, { id: x.id, name: x.name, version: x.version });
    }
  }
  return [...seen.values()];
});
ipcMain.handle('uninstall-extension', async (_e, id) => {
  for (const ses of knownSessions) {
    if (!ses.extensions.getExtension(id)) continue;
    try { await uninstallExtension(id, { session: ses, extensionsPath: extensionsPath() }); } catch {}
  }
});

// ---------- Прочее ----------

// Контекстные меню интерфейса (вкладки, папки, пространства)
ipcMain.handle('menu', (e, items) => new Promise((resolve) => {
  const build = (list) => list.map((it) => {
    if (it.type === 'separator') return { type: 'separator' };
    if (it.submenu) return { label: it.label, enabled: it.enabled !== false, submenu: build(it.submenu) };
    return {
      label: it.label,
      enabled: it.enabled !== false,
      type: it.checked !== undefined ? 'checkbox' : 'normal',
      checked: it.checked,
      click: () => resolve(it.id),
    };
  });
  Menu.buildFromTemplate(build(items)).popup({
    window: BrowserWindow.fromWebContents(e.sender),
    callback: () => setTimeout(() => resolve(null), 50),
  });
}));

ipcMain.handle('theme', (_e, mode) => { nativeTheme.themeSource = mode; });
ipcMain.handle('version', () => ({ app: app.getVersion(), chrome: process.versions.chrome }));
ipcMain.handle('clear-data', async (_e, what) => {
  for (const ses of knownSessions) {
    if (what === 'cache') await ses.clearCache();
    else if (what === 'cookies') await ses.clearStorageData({ storages: ['cookies'] });
  }
});
ipcMain.handle('new-window', (_e, opts) => { createWindow(opts); });
// Вступление при первом запуске показывается на весь экран
ipcMain.handle('set-fullscreen', (e, on) => { BrowserWindow.fromWebContents(e.sender)?.setFullScreen(Boolean(on)); });

// Перенос данных из других браузеров
ipcMain.handle('import-detect', () => importer.detect());
ipcMain.handle('import-run', (_e, opts) => importer.runImport(opts));

// Перевод страниц: онлайн через Google, запасной — встроенный перевод macOS
ipcMain.handle('translate-texts', (_e, texts, target, source, engine) => translator.translate(texts, target, source, engine).catch((err) => ({ error: err.message })));
ipcMain.handle('translate-detect', (_e, sample, hint) => translator.detect(sample, hint).catch(() => 'und'));
ipcMain.handle('translate-prepare', (_e, source, target) => translator.prepare(source, target).catch(() => false));
app.on('will-quit', () => translator.stop());

function buildMenu() {
  const item = (label, accelerator, cmd, ...args) => ({ label, accelerator: accelerator || undefined, click: () => send(cmd, ...args) });
  const sep = { type: 'separator' };
  const template = [
    {
      label: 'Luch',
      submenu: [
        { label: 'О программе Luch', role: 'about' },
        sep,
        item('Настройки…', 'CmdOrCtrl+,', 'settings'),
        item('Импорт из другого браузера…', null, 'import'),
        sep,
        { label: 'Скрыть Luch', role: 'hide' },
        { label: 'Скрыть остальные', role: 'hideOthers' },
        { label: 'Показать все', role: 'unhide' },
        sep,
        { label: 'Завершить Luch', role: 'quit' },
      ],
    },
    {
      label: 'Файл',
      submenu: [
        item('Новая вкладка', 'CmdOrCtrl+T', 'new-tab'),
        { label: 'Новое окно', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
        { label: 'Новое окно инкогнито', accelerator: 'CmdOrCtrl+Shift+N', click: () => createWindow({ incognito: true }) },
        item('Вернуть закрытую вкладку', 'CmdOrCtrl+Shift+T', 'reopen-tab'),
        sep,
        item('Командная строка…', 'CmdOrCtrl+L', 'command-bar'),
        item('Чат с Gemini', 'CmdOrCtrl+E', 'toggle-chat'),
        sep,
        item('Закрыть вкладку', 'CmdOrCtrl+W', 'close-tab'),
        item('Очистить вкладки', 'CmdOrCtrl+Shift+K', 'clean-tabs'),
        { label: 'Закрыть окно', accelerator: 'CmdOrCtrl+Shift+W', role: 'close' },
        sep,
        item('Печать…', 'CmdOrCtrl+P', 'print'),
      ],
    },
    {
      label: 'Правка',
      submenu: [
        { label: 'Отменить', role: 'undo' },
        { label: 'Повторить', role: 'redo' },
        sep,
        { label: 'Вырезать', role: 'cut' },
        { label: 'Копировать', role: 'copy' },
        item('Копировать адрес', 'CmdOrCtrl+Shift+C', 'copy-url'),
        item('Копировать адрес как Markdown', 'Alt+CmdOrCtrl+Shift+C', 'copy-url-md'),
        { label: 'Вставить', role: 'paste' },
        { label: 'Выбрать все', role: 'selectAll' },
        sep,
        item('Найти на странице', 'CmdOrCtrl+F', 'find'),
      ],
    },
    {
      label: 'Вид',
      submenu: [
        item('Обновить', 'CmdOrCtrl+R', 'reload'),
        item('Обновить без кэша', 'CmdOrCtrl+Shift+R', 'hard-reload'),
        sep,
        item('Показать или скрыть вкладки', 'CmdOrCtrl+S', 'toggle-tabbar'),
        item('Автоскрытие вкладок', 'Alt+CmdOrCtrl+S', 'toggle-autohide'),
        sep,
        item('Разделить экран', 'Alt+CmdOrCtrl+=', 'split'),
        item('Следующая панель', 'Alt+CmdOrCtrl+]', 'split-focus', 1),
        item('Предыдущая панель', 'Alt+CmdOrCtrl+[', 'split-focus', -1),
        item('Убрать разделение', 'Alt+CmdOrCtrl+-', 'unsplit'),
        sep,
        item('Перевести страницу', 'CmdOrCtrl+Shift+Y', 'translate'),
        sep,
        item('Увеличить', 'CmdOrCtrl+=', 'zoom', 0.5),
        item('Уменьшить', 'CmdOrCtrl+-', 'zoom', -0.5),
        item('Реальный размер', 'CmdOrCtrl+0', 'zoom', 0),
        // Те же действия на ⌘+ (с Shift) и на Control — скрытые пункты, работают как сочетания клавиш
        ...[['CmdOrCtrl+Plus', 0.5], ['Ctrl+=', 0.5], ['Ctrl+Plus', 0.5], ['Ctrl+-', -0.5], ['Ctrl+0', 0]]
          .map(([accelerator, step]) => ({ label: 'Масштаб', accelerator, visible: false, acceleratorWorksWhenHidden: true, click: () => send('zoom', step) })),
        sep,
        item('Инструменты разработчика', 'Alt+CmdOrCtrl+I', 'devtools'),
        { label: 'Полноэкранный режим', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Вкладки',
      submenu: [
        item('Назад', 'CmdOrCtrl+[', 'back'),
        item('Вперёд', 'CmdOrCtrl+]', 'forward'),
        item('Следующая вкладка', 'Alt+CmdOrCtrl+Down', 'next-tab', 1),
        item('Предыдущая вкладка', 'Alt+CmdOrCtrl+Up', 'next-tab', -1),
        { label: 'Следующая вкладка', accelerator: 'Ctrl+Tab', visible: false, acceleratorWorksWhenHidden: true, click: () => send('next-tab', 1) },
        { label: 'Предыдущая вкладка', accelerator: 'Ctrl+Shift+Tab', visible: false, acceleratorWorksWhenHidden: true, click: () => send('next-tab', -1) },
        item('Поиск по вкладкам…', 'CmdOrCtrl+Shift+A', 'search-tabs'),
        sep,
        item('Закрепить или открепить вкладку', 'CmdOrCtrl+D', 'pin-tab'),
        item('Дублировать', null, 'duplicate-tab'),
        item('Новая группа', 'Shift+Alt+CmdOrCtrl+N', 'new-group'),
        item('Новая группа с вкладкой', 'Alt+CmdOrCtrl+N', 'group-tab'),
        item('Переименовать…', null, 'rename-tab'),
        item('Выключить или включить звук', null, 'mute-tab'),
        sep,
        ...Array.from({ length: 9 }, (_, i) => item(`Вкладка ${i + 1}`, `CmdOrCtrl+${i + 1}`, 'select-tab', i)),
      ],
    },
    {
      label: 'История',
      submenu: [
        item('Показать историю', 'CmdOrCtrl+Y', 'history'),
        item('Загрузки', 'Alt+CmdOrCtrl+L', 'downloads'),
      ],
    },
    {
      label: 'Пространства',
      submenu: Array.from({ length: 9 }, (_, i) => item(`Пространство ${i + 1}`, `Ctrl+${i + 1}`, 'select-space', i)),
    },
    {
      label: 'Расширения',
      submenu: [
        item('Магазин расширений Chrome', null, 'open-url', 'https://chromewebstore.google.com/', {}),
        item('Управление расширениями…', null, 'settings', 'extensions'),
      ],
    },
    {
      label: 'Окно',
      submenu: [
        { label: 'Свернуть', role: 'minimize' },
        { label: 'Масштаб', role: 'zoom' },
        sep,
        { label: 'Все окна на передний план', role: 'front' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Иконка в Dock следует теме системы: тёмная с голубой короной, светлая — с золотой
function applyDockIcon() {
  if (!app.dock) return;
  const file = nativeTheme.shouldUseDarkColors ? 'icon-dark.png' : 'icon-light.png';
  app.dock.setIcon(nativeImage.createFromPath(path.join(__dirname, 'assets', file)));
}

app.whenReady().then(() => {
  prefs = readPrefs();
  applyDockIcon();
  nativeTheme.on('updated', applyDockIcon);
  translator.warmUp();
  app.setAboutPanelOptions({ applicationName: 'Luch', applicationVersion: app.getVersion(), iconPath: path.join(__dirname, 'assets', 'icon-dark.png') });
  ElectronChromeExtensions.handleCRXProtocol(session.defaultSession);
  setupSession(session.defaultSession);
  refreshBlocker();
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
