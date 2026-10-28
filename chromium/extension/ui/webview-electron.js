// Вкладки Luch в Chromium — элементы <webview>. Интерфейс написан под <webview> из Electron,
// поэтому здесь каждый webview получает такие же методы и события, как в Electron:
// did-start-loading, did-navigate, page-title-updated, executeJavaScript, loadURL и т. д.
(() => {
  let nextId = 1;

  function emit(wv, type, props = {}) {
    const e = new Event(type);
    Object.assign(e, props);
    wv.dispatchEvent(e);
  }

  // Заголовок и значок сайта: у <webview> в Chromium нет событий для них, читаем со страницы
  const META = `(() => {
    const links = [...document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')];
    const best = links.find(l => /icon/.test(l.rel) && !/apple/.test(l.rel)) || links[0];
    return { title: document.title, icon: best ? best.href : (location.protocol.startsWith('http') ? location.origin + '/favicon.ico' : '') };
  })()`;

  function upgrade(wv) {
    if (wv.__luch) return wv;
    const s = wv.__luch = { id: nextId++, url: wv.getAttribute('src') || '', title: '', icon: '', zoom: 1, attached: false, loading: false, navigating: false };

    const refresh = () => {
      if (!wv.isConnected) return;
      wv.executeJavaScript(META).then((m) => {
        if (!m) return;
        if (m.title && m.title !== s.title) { s.title = m.title; emit(wv, 'page-title-updated', { title: m.title }); }
        if (m.icon && m.icon !== s.icon) { s.icon = m.icon; emit(wv, 'page-favicon-updated', { favicons: [m.icon] }); }
      }, () => {});
    };

    wv.addEventListener('loadstart', (e) => {
      if (!e.isTopLevel) return;
      if (!s.attached) { s.attached = true; emit(wv, 'did-attach'); }
      s.navigating = true;
      emit(wv, 'did-start-navigation', { isMainFrame: true, url: e.url });
      if (!s.loading) { s.loading = true; emit(wv, 'did-start-loading'); }
    });
    wv.addEventListener('loadcommit', (e) => {
      if (!e.isTopLevel) return;
      s.url = e.url;
      // Переход внутри страницы (якорь, history.pushState) приходит без loadstart
      if (s.navigating) emit(wv, 'did-navigate', { url: e.url });
      else emit(wv, 'did-navigate-in-page', { url: e.url, isMainFrame: true });
      s.navigating = false;
      setTimeout(refresh, 300);
    });
    wv.addEventListener('contentload', () => { emit(wv, 'dom-ready'); refresh(); });
    wv.addEventListener('loadstop', () => {
      s.navigating = false;
      if (s.loading) { s.loading = false; emit(wv, 'did-stop-loading'); }
      refresh();
    });
    wv.addEventListener('loadabort', (e) => {
      if (!e.isTopLevel) return;
      emit(wv, 'did-fail-load', { isMainFrame: true, errorCode: e.code, errorDescription: e.reason, validatedURL: e.url });
      if (s.loading) { s.loading = false; s.navigating = false; emit(wv, 'did-stop-loading'); }
    });
    wv.addEventListener('consolemessage', (e) => emit(wv, 'console-message', { message: e.message, level: e.level }));
    wv.addEventListener('audiostatechanged', (e) => emit(wv, e.audible ? 'media-started-playing' : 'media-paused'));
    wv.addEventListener('zoomchange', (e) => { s.zoom = e.newZoomFactor; });
    wv.addEventListener('findupdate', (e) => {
      if (e.finalUpdate) emit(wv, 'found-in-page', { result: { matches: e.numberOfMatches, activeMatchOrdinal: e.activeMatchOrdinal } });
    });
    wv.addEventListener('close', () => emit(wv, 'close'));

    // Ссылки target=_blank и window.open — новая вкладка Luch (окно-попап сохраняет связь со страницей)
    wv.addEventListener('newwindow', (e) => {
      e.preventDefault();
      window.luchOpenWindow?.(e);
    });

    // Разрешения страниц: загрузки, полноэкранный режим и указатель — сразу; камера, микрофон и геопозиция — по вопросу
    wv.addEventListener('permissionrequest', (e) => {
      const p = e.permission;
      if (p === 'download' || p === 'fullscreen' || p === 'pointerLock') { e.request.allow(); return; }
      if (p === 'media' || p === 'geolocation') {
        e.preventDefault();
        const what = p === 'media' ? 'камере и микрофону' : 'геопозиции';
        let host = '';
        try { host = new URL(e.url || s.url).host; } catch {}
        setTimeout(() => (confirm(`Разрешить сайту ${host} доступ к ${what}?`) ? e.request.allow() : e.request.deny()));
        return;
      }
      e.request.deny();
    });

    // alert/confirm/prompt со страницы показываем окнами интерфейса
    wv.addEventListener('dialog', (e) => {
      e.preventDefault();
      setTimeout(() => {
        if (e.messageType === 'alert') { alert(e.messageText); e.dialog.ok(); }
        else if (e.messageType === 'confirm') { confirm(e.messageText) ? e.dialog.ok() : e.dialog.cancel(); }
        else { const v = prompt(e.messageText, e.defaultPromptText); v === null ? e.dialog.cancel() : e.dialog.ok(v); }
      });
    });

    // Блокировщик рекламы и трекеров (blocker.js)
    window.luchBlocker?.attach(wv);

    // Сочетания клавиш Luch и свайпы двумя пальцами (назад/вперёд) работают и на страницах сайтов
    wv.addContentScripts([{ name: 'luch-keys', matches: ['<all_urls>'], js: { files: ['ui/guest-keys.js', 'ui/guest-swipe.js'] }, run_at: 'document_start' }]);
    // Входы из Паролей Apple под полями логина и пароля, во всех фреймах — формы входа часто во фрейме
    wv.addContentScripts([{ name: 'luch-passwords', matches: ['http://*/*', 'https://*/*'], js: { files: ['ui/guest-passwords.js'] }, all_frames: true, run_at: 'document_idle' }]);

    // Пункты Luch в контекстном меню страницы (остальное — стандартное меню Chromium)
    const menuItems = [
      ['link-tab', 'Открыть ссылку в новой вкладке Luch', ['link']],
      ['link-split', 'Открыть рядом на разделённом экране', ['link']],
      ['ask', 'Спросить Gemini о «%s»', ['selection']],
      ['image-tab', 'Открыть картинку в новой вкладке', ['image']],
      ['shot', 'Снимок страницы…', ['page']],
    ];
    for (const [id, title, contexts] of menuItems) wv.contextMenus.create({ id, title, contexts });
    wv.contextMenus.onClicked.addListener((info) => {
      const run = window.luchRunCommand;
      if (!run) return;
      if (info.menuItemId === 'link-tab') run('open-url', info.linkUrl, { background: true, openerId: s.id });
      else if (info.menuItemId === 'link-split') run('open-split', info.linkUrl);
      else if (info.menuItemId === 'ask') run('ask-selection', info.selectionText);
      else if (info.menuItemId === 'image-tab') run('open-url', info.srcUrl, { background: true });
      else if (info.menuItemId === 'shot') run('screenshot');
    });

    // Пока вкладка видна, обновляем заголовок: сайты меняют его без перезагрузки (счётчики писем и т. п.)
    setInterval(() => { if (s.attached && !wv.classList.contains('hidden') && document.visibilityState === 'visible') refresh(); }, 2000);

    Object.assign(wv, {
      executeJavaScript(code) {
        return new Promise((resolve, reject) => {
          wv.executeScript({ code }, (res) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            // Скрипт не встроился (страница ещё грузится или это страница ошибки) — как в Electron, это ошибка
            else if (!res || !res.length) reject(new Error('Страница недоступна для скрипта'));
            else resolve(res[0]);
          });
        });
      },
      loadURL(url) { s.url = url; wv.src = url; return Promise.resolve(); },
      getURL() { return s.url || wv.src; },
      getTitle() { return s.title; },
      getWebContentsId() { return s.id; },
      goBack() { wv.back(); },
      goForward() { wv.forward(); },
      reloadIgnoringCache() { wv.executeScript({ code: 'location.reload()' }); },
      setZoomFactor(f) { s.zoom = f; wv.setZoom(f); },
      getZoomFactor() { return s.zoom; },
      setZoomLevel(level) { wv.setZoomFactor(Math.pow(1.2, level)); },
      getZoomLevel() { return Math.log(s.zoom) / Math.log(1.2); },
      setVisualZoomLevelLimits() {},
      findInPage(text, opts = {}) { wv.find(text, { backward: opts.forward === false, matchCase: Boolean(opts.matchCase) }); },
      stopFindInPage(action) { wv.stopFinding(action === 'keepSelection' ? 'keep' : action === 'activateSelection' ? 'activate' : 'clear'); },
      openDevTools() { alert('Инструменты разработчика для страницы: щёлкните по странице правой кнопкой и выберите «Просмотреть код».'); },
    });
    return wv;
  }

  // Новые webview получают методы сразу при создании, а уже стоящие в разметке — при загрузке скрипта
  const create = Document.prototype.createElement;
  document.createElement = function (name, opts) {
    const el = create.call(this, name, opts);
    return String(name).toLowerCase() === 'webview' ? upgrade(el) : el;
  };
  for (const wv of document.querySelectorAll('webview')) upgrade(wv);
  window.upgradeWebview = upgrade;
})();
