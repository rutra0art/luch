// Блокировка рекламы, трекеров и cookie-баннеров во вкладках Luch — тот же движок Ghostery,
// что и в версии на Electron. Запросы вкладок отменяются через webview.request,
// рекламные элементы скрываются стилями после загрузки страницы
(() => {
  const { FiltersEngine, Request, adsLists, adsAndTrackingLists, fullLists, parse } = window.LuchAdblocker;
  const DEFAULTS = { blockAds: true, blockTrackers: true, blockCookieBanners: true };
  // Списки фильтров обновляются раз в неделю
  const MAX_AGE = 7 * 24 * 3600 * 1000;
  let engine = null;
  let engineKey = '';

  function listsFor(p) {
    const urls = [];
    if (p.blockAds) urls.push(...adsLists);
    if (p.blockTrackers) urls.push(...adsAndTrackingLists.filter(u => !adsLists.includes(u)));
    if (p.blockCookieBanners) urls.push(...fullLists.filter(u => !adsAndTrackingLists.includes(u)));
    return urls;
  }

  // Готовый движок хранится в IndexedDB, чтобы не скачивать и не разбирать списки при каждом запуске
  const db = new Promise((resolve, reject) => {
    const req = indexedDB.open('luch-blocker', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('engines');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  async function cacheGet(key) {
    const d = await db;
    return new Promise((resolve) => {
      const r = d.transaction('engines').objectStore('engines').get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    });
  }
  async function cachePut(key, value) {
    const d = await db;
    d.transaction('engines', 'readwrite').objectStore('engines').put(value, key);
  }

  async function load() {
    const prefs = { ...DEFAULTS, ...(await chrome.storage.local.get('prefs')).prefs };
    const lists = listsFor(prefs);
    const key = lists.join('|');
    if (!lists.length) { engine = null; engineKey = ''; return; }
    if (key === engineKey && engine) return;
    const cached = await cacheGet(key);
    if (cached && Date.now() - cached.at < MAX_AGE) {
      try {
        engine = FiltersEngine.deserialize(new Uint8Array(cached.data));
        engineKey = key;
        return;
      } catch {}
    }
    try {
      const fresh = await FiltersEngine.fromLists(fetch, lists, { enableCompression: true });
      engine = fresh;
      engineKey = key;
      cachePut(key, { at: Date.now(), data: fresh.serialize().buffer });
    } catch (err) {
      // Нет сети — работаем со старыми списками, если они есть
      if (cached) { engine = FiltersEngine.deserialize(new Uint8Array(cached.data)); engineKey = key; }
      console.warn('Блокировщик: не удалось загрузить списки', err);
    }
  }

  function attach(wv) {
    wv.request.onBeforeRequest.addListener((details) => {
      if (!engine || details.type === 'main_frame') return {};
      const { match, redirect } = engine.match(Request.fromRawDetails({
        url: details.url,
        type: details.type,
        sourceUrl: details.initiator || (wv.getURL ? wv.getURL() : ''),
      }));
      if (redirect) return { redirectUrl: redirect.dataUrl };
      return match ? { cancel: true } : {};
    }, { urls: ['http://*/*', 'https://*/*'] }, ['blocking']);

    // Скрытие рекламных блоков и баннеров на странице
    wv.addEventListener('loadcommit', (e) => {
      if (!engine || !e.isTopLevel || !/^https?:/.test(e.url)) return;
      const { hostname, domain } = parse(e.url);
      const { styles } = engine.getCosmeticsFilters({
        url: e.url, hostname, domain: domain || hostname,
        getBaseRules: true, getInjectionRules: false, getExtendedRules: false,
        getRulesFromHostname: true, getRulesFromDOM: false,
      });
      if (styles) wv.insertCSS({ code: styles });
    });
  }

  window.luchBlocker = { attach, refresh: load, ready: load() };
})();
