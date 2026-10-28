// window.luch для интерфейса в Chromium: то, что в версии на Electron делал главный процесс
// (меню, загрузки, расширения, перевод, команды меню и сочетания клавиш), здесь — через API Chromium
(() => {
  // Новая вкладка открывается во вкладке-webview, а страницы расширения туда загружать нельзя
  // (изоляция сайтов Chromium), поэтому собираем её в одну страницу data:
  const read = (file) => { const x = new XMLHttpRequest(); x.open('GET', file, false); x.send(); return x.responseText; };
  const newTab = read('newtab.html').replace('<script src="newtab-page.js"></script>', () => '<script>' + read('newtab-page.js') + '</script>');
  window.LUCH_NEWTAB_URL = 'data:text/html;charset=utf-8,' + encodeURIComponent(newTab);

  const commandHandlers = [];
  const downloadHandlers = [];
  const runCommand = (cmd, ...args) => { for (const fn of commandHandlers) fn(cmd, ...args); };
  window.luchRunCommand = runCommand;

  // ---------- Команды меню Chromium (⌘T, ⌘W, ⌘L…) ----------
  // Chromium передаёт их через атрибут документа (см. browser_command_controller.cc)
  document.addEventListener('luch-command', () => {
    const [cmd, arg] = (document.documentElement.dataset.luchCommand || '').split('|');
    if (cmd) runCommand(cmd, arg === undefined ? undefined : Number(arg));
  });

  // ---------- Сочетания клавиш, которых нет в меню Chromium ----------
  // Ловим их и в интерфейсе, и на страницах вкладок (guest-keys.js шлёт их сюда)
  const KEYS = {
    'cmd+e': ['toggle-chat'],
    'cmd+shift+k': ['clean-tabs'],
    'cmd+shift+c': ['copy-url'],
    'alt+cmd+shift+c': ['copy-url-md'],
    'cmd+f': ['find'],
    'cmd+s': ['toggle-tabbar'],
    'alt+cmd+s': ['toggle-autohide'],
    'alt+cmd+=': ['split'],
    'alt+cmd+]': ['split-focus', 1],
    'alt+cmd+[': ['split-focus', -1],
    'alt+cmd+-': ['unsplit'],
    'cmd+shift+y': ['translate'],
    'alt+cmd+arrowdown': ['next-tab', 1],
    'alt+cmd+arrowup': ['next-tab', -1],
    'cmd+shift+a': ['search-tabs'],
    'alt+cmd+shift+n': ['new-group'],
    'alt+cmd+n': ['group-tab'],
    'alt+cmd+l': ['downloads'],
    'cmd+y': ['history'],
    'cmd+d': ['pin-tab'],
    'cmd+,': ['settings'],
    'ctrl+=': ['zoom', 0.5],
    'ctrl+-': ['zoom', -0.5],
    'ctrl+0': ['zoom', 0],
    ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`ctrl+${i + 1}`, ['select-space', i]])),
  };
  window.LUCH_KEYS = KEYS;
  const keyName = (e) => [e.ctrlKey && 'ctrl', e.altKey && 'alt', e.metaKey && 'cmd', e.shiftKey && 'shift', (e.code.startsWith('Digit') ? e.code.slice(5) : e.code === 'Equal' ? '=' : e.code === 'Minus' ? '-' : e.code === 'BracketLeft' ? '[' : e.code === 'BracketRight' ? ']' : e.code === 'Comma' ? ',' : e.key).toLowerCase()].filter(Boolean).join('+');
  document.addEventListener('keydown', (e) => {
    const hit = KEYS[keyName(e)];
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    runCommand(...hit);
  }, true);
  // Сообщения от страниц вкладок получают все окна Luch; выполняет то окно, с которым работают.
  // Пока фокус на странице, document.hasFocus() в окне Luch ложно, поэтому смотрим на окно целиком
  const isActiveWindow = async () => document.hasFocus()
    || (document.activeElement?.tagName === 'WEBVIEW' && (await chrome.windows.getLastFocused()).id === windowId);
  chrome.runtime.onMessage.addListener((msg) => {
    if (!['luch:key', 'luch:page-click', 'luch:open-settings'].includes(msg?.type)) return;
    isActiveWindow().then((active) => {
      if (!active) return;
      if (msg.type === 'luch:key' && KEYS[msg.key]) runCommand(...KEYS[msg.key]);
      if (msg.type === 'luch:page-click') dispatchEvent(new Event('luch-page-click'));
      // «Подключить Пароли Apple…» в списке под полем входа (guest-passwords.js)
      if (msg.type === 'luch:open-settings') runCommand('settings', msg.section === 'passwords' ? 'passwords' : 'general');
    });
  });

  // ---------- Ссылки в новых вкладках и окнах ----------
  window.luchOpenWindow = (e) => {
    const openerId = e.target?.getWebContentsId?.();
    if (e.windowOpenDisposition === 'new_background_tab') {
      e.window.discard();
      runCommand('open-url', e.targetUrl, { background: true, openerId });
    } else {
      // Окно остаётся связанным со страницей (window.opener) — нужно для входа через Google и т. п.
      runCommand('open-url', e.targetUrl, { token: { newWindow: e.window }, openerId });
    }
  };

  // ---------- Контекстные меню интерфейса ----------
  // У страниц Chromium нет системного меню, поэтому рисуем его сами
  let pointer = { x: 0, y: 0 };
  addEventListener('contextmenu', (e) => { pointer = { x: e.clientX, y: e.clientY }; }, true);
  addEventListener('mousedown', (e) => { pointer = { x: e.clientX, y: e.clientY }; }, true);

  const style = document.createElement('style');
  style.textContent = `
    .luch-menu { position: fixed; z-index: 2147483647; min-width: 200px; max-width: 320px; padding: 5px;
      background: var(--popover, #fff); color: var(--text, #222); border: 1px solid var(--border, rgba(0,0,0,.1));
      border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.22); font: 13px -apple-system, BlinkMacSystemFont, sans-serif; }
    .luch-menu .mi { display: flex; align-items: center; gap: 8px; padding: 4px 10px 4px 22px; border-radius: 6px; position: relative; white-space: nowrap; cursor: default; }
    .luch-menu .mi:hover:not(.off), .luch-menu .mi.open { background: var(--accent, #2f86d1); color: #fff; }
    .luch-menu .mi.off { opacity: .4; }
    .luch-menu .mi .check { position: absolute; left: 7px; }
    .luch-menu .mi .arrow { margin-left: auto; padding-left: 14px; opacity: .7; }
    .luch-menu .sep { height: 1px; margin: 4px 6px; background: var(--border, rgba(0,0,0,.1)); }`;
  document.head.appendChild(style);

  let closeOpenMenu = null;
  function menu(items) {
    closeOpenMenu?.();
    return new Promise((resolve) => {
      const roots = [];
      let done = false;
      const finish = (id) => {
        if (done) return;
        done = true;
        for (const r of roots) r.remove();
        removeEventListener('mousedown', outside, true);
        removeEventListener('keydown', onKey, true);
        removeEventListener('blur', cancel);
        closeOpenMenu = null;
        resolve(id ?? null);
      };
      const cancel = () => finish(null);
      const outside = (e) => { if (!roots.some(r => r.contains(e.target))) cancel(); };
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); cancel(); } };

      const build = (list, x, y, level) => {
        const box = document.createElement('div');
        box.className = 'luch-menu';
        for (const it of list) {
          if (it.type === 'separator') { box.appendChild(Object.assign(document.createElement('div'), { className: 'sep' })); continue; }
          const row = document.createElement('div');
          row.className = 'mi' + (it.enabled === false ? ' off' : '');
          if (it.checked) row.appendChild(Object.assign(document.createElement('span'), { className: 'check', textContent: '✓' }));
          row.appendChild(Object.assign(document.createElement('span'), { textContent: it.label }));
          if (it.submenu) {
            row.appendChild(Object.assign(document.createElement('span'), { className: 'arrow', textContent: '›' }));
            row.addEventListener('mouseenter', () => {
              while (roots.length > level + 1) roots.pop().remove();
              for (const r of box.querySelectorAll('.open')) r.classList.remove('open');
              if (it.enabled === false) return;
              row.classList.add('open');
              const rect = row.getBoundingClientRect();
              build(it.submenu, rect.right - 4, rect.top - 5, level + 1);
            });
          } else {
            row.addEventListener('mouseenter', () => { while (roots.length > level + 1) roots.pop().remove(); });
            row.addEventListener('click', () => { if (it.enabled !== false) finish(it.id); });
          }
          box.appendChild(row);
        }
        document.body.appendChild(box);
        roots.push(box);
        // Меню не выходит за края окна
        const r = box.getBoundingClientRect();
        box.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px';
        box.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
      };
      build(items, pointer.x, pointer.y, 0);
      setTimeout(() => {
        addEventListener('mousedown', outside, true);
        addEventListener('keydown', onKey, true);
        addEventListener('blur', cancel);
      });
      closeOpenMenu = cancel;
    });
  }

  // ---------- Загрузки ----------
  const downloadInfo = (d) => ({
    id: d.id,
    name: (d.filename || d.finalUrl || d.url || '').split('/').pop() || 'Файл',
    received: d.bytesReceived || 0,
    total: d.totalBytes || 0,
    state: d.state === 'in_progress' ? (d.paused ? 'interrupted' : 'progressing') : d.state === 'complete' ? 'completed' : 'cancelled',
  });
  // started — загрузка началась в этом сеансе. Остальные события приходят и о старых загрузках:
  // при запуске Chromium помечает недокачанные прошлые загрузки как прерванные
  const pushDownload = async (id, started = false) => {
    const [d] = await chrome.downloads.search({ id });
    if (d) for (const fn of downloadHandlers) fn({ ...downloadInfo(d), started });
  };
  chrome.downloads.onCreated.addListener((d) => pushDownload(d.id, true));
  chrome.downloads.onChanged.addListener((d) => pushDownload(d.id));
  // Пока что-то качается, обновляем прогресс раз в полсекунды
  setInterval(async () => {
    for (const d of await chrome.downloads.search({ state: 'in_progress' })) for (const fn of downloadHandlers) fn(downloadInfo(d));
  }, 500);

  // ---------- Перевод ----------
  async function translateOnline(texts, target, source) {
    const body = new URLSearchParams();
    for (const t of texts) body.append('q', t);
    const res = await fetch(`https://translate.googleapis.com/translate_a/t?client=gtx&sl=${source || 'auto'}&tl=${target}&dt=t&format=text`, { method: 'POST', body });
    if (!res.ok) throw new Error('Google ответил ' + res.status);
    let data = await res.json();
    // Одна строка приходит без внешнего массива
    if (texts.length === 1 && typeof data[0] === 'string') data = [source ? data[0] : data];
    if (!Array.isArray(data) || data.length !== texts.length) throw new Error('неполный ответ переводчика');
    let detected = source || '';
    const translations = data.map((d) => {
      if (Array.isArray(d)) { detected = detected || d[1]; return d[0]; }
      return d;
    });
    return { translations, source: detected };
  }

  // ---------- Импорт из других браузеров ----------
  // Данные читает помощник luch-importer внутри Luch.app (native messaging): ответ приходит частями,
  // в конце — {type: 'done'}
  function importer(request) {
    return new Promise((resolve, reject) => {
      const port = chrome.runtime.connectNative('org.luch.importer');
      const parts = { history: [], bookmarks: [], cookies: [], errors: [], browsers: [] };
      port.onMessage.addListener((msg) => {
        if (msg.type === 'detect') parts.browsers = msg.browsers;
        else if (msg.type === 'error') parts.errors.push(`${msg.label}: ${msg.message}`);
        else if (parts[msg.type]) parts[msg.type].push(...msg.items);
        if (msg.type === 'done') { port.disconnect(); resolve(parts); }
      });
      port.onDisconnect.addListener(() => reject(new Error(chrome.runtime.lastError?.message || 'Помощник импорта завершился')));
      port.postMessage(request);
    });
  }

  // Cookie записываются прямо в хранилище вкладок пространства (persist:space-N)
  async function writeCookies(cookies, partition) {
    const name = String(partition || '').replace(/^persist:/, '');
    if (!name || name === partition) return 0;
    let ok = 0;
    await Promise.all(cookies.map(async (c) => {
      const host = c.host.replace(/^\./, '');
      const details = {
        storeId: 'luch-partition:' + name,
        url: `${c.secure ? 'https' : 'http'}://${host}${c.path}`,
        name: c.name, value: c.value, path: c.path, secure: c.secure, httpOnly: c.httpOnly,
      };
      // Cookie с точкой в начале действует на все поддомены, без неё — только на этот хост
      if (c.host.startsWith('.')) details.domain = c.host;
      if (c.expires) details.expirationDate = c.expires;
      if (c.sameSite && c.sameSite !== 'unspecified') details.sameSite = c.sameSite;
      try { if (await chrome.cookies.set(details)) ok++; } catch {}
    }));
    return ok;
  }

  // ---------- Окно ----------
  let windowId = null;
  chrome.windows.getCurrent().then((w) => { windowId = w.id; });
  let wasFullscreen = false;
  addEventListener('resize', async () => {
    if (windowId === null) return;
    const w = await chrome.windows.get(windowId);
    const full = w.state === 'fullscreen';
    if (full !== wasFullscreen) { wasFullscreen = full; runCommand('fullscreen', full); }
  });

  const prefsDefaults = { blockAds: true, blockTrackers: true, blockCookieBanners: true };

  window.luch = {
    onCommand: (fn) => commandHandlers.push(fn),
    onDownload: (fn) => downloadHandlers.push(fn),
    menu,
    setTheme: async (mode) => {
      if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode;
      else delete document.documentElement.dataset.theme;
    },
    version: async () => ({ app: chrome.runtime.getManifest().version, chrome: (navigator.userAgent.match(/Chrome\/([\d.]+)/) || [])[1] || '' }),
    clearData: async (what) => {
      const types = what === 'cache' ? { cache: true } : { cookies: true, persistentCookies: true, sessionCookies: true };
      await Promise.all([...document.querySelectorAll('webview')].map(wv => new Promise(r => wv.clearData({}, types, r))));
    },
    prefs: async () => ({ ...prefsDefaults, ...(await chrome.storage.local.get('prefs')).prefs }),
    setPrefs: async (patch) => {
      const prefs = { ...prefsDefaults, ...(await chrome.storage.local.get('prefs')).prefs, ...patch };
      await chrome.storage.local.set({ prefs });
      window.luchBlocker?.refresh();
      return prefs;
    },
    extensions: async () => (await chrome.management.getAll())
      .filter(x => x.type === 'extension' && x.id !== chrome.runtime.id && x.installType !== 'development')
      .map(x => ({ id: x.id, name: x.name, version: x.version })),
    uninstallExtension: (id) => chrome.management.uninstall(id, { showConfirmDialog: false }).catch(() => {}),
    downloadAction: async (id, action) => {
      if (action === 'open') chrome.downloads.open(id);
      else if (action === 'show') chrome.downloads.show(id);
      else if (action === 'cancel') chrome.downloads.cancel(id);
    },
    newWindow: (opts = {}) => chrome.windows.create({ url: chrome.runtime.getURL('ui/index.html' + (opts.incognito ? '?incognito' : '')), type: 'popup', width: 1280, height: 820 }),
    tabCreated: () => {},
    tabSelected: () => {},
    importDetect: async () => (await importer({ cmd: 'detect' })).browsers,
    importRun: async ({ browser, profile, what, partition }) => {
      const r = await importer({ cmd: 'read', browser, profile, what });
      const cookies = what.cookies && r.cookies.length ? await writeCookies(r.cookies, partition) : 0;
      if (what.cookies && r.cookies.length && !cookies) r.errors.push('Входы на сайты: не удалось записать cookie');
      return { history: r.history, bookmarks: r.bookmarks, cookies, errors: r.errors };
    },
    setFullscreen: async (on) => {
      if (windowId === null) windowId = (await chrome.windows.getCurrent()).id;
      await chrome.windows.update(windowId, { state: on ? 'fullscreen' : 'normal' });
    },
    translateTexts: (texts, target, source) => translateOnline(texts, target, source).catch((err) => ({ error: err.message })),
    translateDetect: (sample) => translateOnline([String(sample).slice(0, 500)], 'en').then(r => r.source || 'und', () => 'und'),
    translatePrepare: async () => false,
  };
})();
