'use strict';

const NEW_TAB_URL = window.LUCH_NEWTAB_URL || new URL('newtab.html', location.href).href;
const INCOGNITO = new URLSearchParams(location.search).has('incognito');
const SEARCH_ENGINES = {
  google: { url: 'https://www.google.com/search?q=', name: 'Google' },
  yandex: { url: 'https://yandex.ru/search/?text=', name: 'Яндекс' },
  duckduckgo: { url: 'https://duckduckgo.com/?q=', name: 'DuckDuckGo' },
  bing: { url: 'https://www.bing.com/search?q=', name: 'Bing' },
};
const DEFAULT_SETTINGS = {
  search: 'google', theme: 'system', restore: true, translateTo: 'ru',
  newTabsTop: true, autohide: false, cmdClickGroups: true, cleanupHours: 0, autoFit: true, translateEngine: 'online',
  autoUpdate: true,
};
const DEFAULT_PINS = [
  { url: 'https://mail.google.com/', title: 'Gmail' },
  { url: 'https://www.youtube.com/', title: 'YouTube' },
  { url: 'https://ru.wikipedia.org/', title: 'Википедия' },
];
const DEFAULT_SKILLS = [
  { id: 's1', name: 'Пересказ', prompt: 'Кратко перескажи эту страницу на русском: главное по пунктам, в конце — вывод одним предложением.' },
  { id: 's2', name: 'Ответ', prompt: 'Помоги ответить на это: составь вдумчивый и очень краткий ответ или комментарий. В конце задай уточняющий вопрос о том, что требует внимания.' },
  { id: 's3', name: 'Объясни проще', prompt: 'Объясни содержание этой страницы простыми словами, как для новичка.' },
  { id: 's4', name: 'Главное', prompt: 'Выпиши 5 самых важных фактов или цифр с этой страницы.' },
];
const SPACE_COLORS = ['#d9506a', '#2f86d1', '#3fa66b', '#e0a63a', '#9b6ad6', '#8892a2'];
const COLOR_NAMES = ['Красный', 'Синий', 'Зелёный', 'Жёлтый', 'Фиолетовый', 'Серый'];

const ICON = {
  chev: '<svg class="chev" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3"/></svg>',
  folder: '<svg class="ficon" viewBox="0 0 16 16"><path d="M1.5 4.2c0-.9.7-1.7 1.6-1.7h3.2l1.5 1.6h5.1c.9 0 1.6.7 1.6 1.6v6.6c0 .9-.7 1.7-1.6 1.7H3.1c-.9 0-1.6-.8-1.6-1.7z"/></svg>',
  close: '<svg viewBox="0 0 10 10"><path d="M2 2l6 6M8 2l-6 6"/></svg>',
  minus: '<svg viewBox="0 0 10 10"><path d="M2 5h6"/></svg>',
  speaker: '<svg class="badge" viewBox="0 0 16 16"><path d="M3 6h2.5L9 3v10L5.5 10H3zM11.5 5.5a3.5 3.5 0 0 1 0 5"/></svg>',
  muted: '<svg class="badge" viewBox="0 0 16 16"><path d="M3 6h2.5L9 3v10L5.5 10H3zM11 6l3 4M14 6l-3 4"/></svg>',
  split: '<svg class="badge" viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="M8 3v10"/></svg>',
  search: '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>',
  sparkle: '<svg viewBox="0 0 16 16"><path d="M8 1.5c.5 3.3 3.2 6 6.5 6.5-3.3.5-6 3.2-6.5 6.5-.5-3.3-3.2-6-6.5-6.5 3.3-.5 6-3.2 6.5-6.5z"/></svg>',
  globe: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></svg>',
  tab: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="M2 6h12"/></svg>',
  slash: '<svg viewBox="0 0 16 16"><path d="M10.5 2.5l-5 11"/></svg>',
};

const $ = (id) => document.getElementById(id);
const tabsEl = $('tabs');
const pinsEl = $('pins');
const pinnedEl = $('pinned');
const viewsEl = $('views');

// ---------- Хранилище ----------
// В окне инкогнито всё, кроме общих настроек, живёт только в памяти

const SHARED_KEYS = new Set(['settings', 'pins', 'skills', 'notes', 'collapsed', 'autoTranslate']);
const memory = new Map();
const store = {
  get(key, fallback) {
    if (INCOGNITO && !SHARED_KEYS.has(key)) return memory.has(key) ? memory.get(key) : fallback;
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    if (INCOGNITO && !SHARED_KEYS.has(key)) { memory.set(key, value); return; }
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};

function settings() { return { ...DEFAULT_SETTINGS, ...store.get('settings', {}) }; }
function setSetting(key, value) { store.set('settings', { ...settings(), [key]: value }); }
function engine() { return SEARCH_ENGINES[settings().search] || SEARCH_ENGINES.google; }
function searchUrl(text) { return engine().url + encodeURIComponent(text); }
function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ---------- Адреса ----------

function looksLikeUrl(text) {
  return /^(https?|file|about|data|chrome-extension):/i.test(text)
    || (!/\s/.test(text) && (/^localhost(:\d+)?(\/|$)/.test(text) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(text)));
}

function toUrl(input) {
  const text = input.trim();
  if (!text) return NEW_TAB_URL;
  // Готовый адрес со схемой; «localhost:3000» схемой не считается — это хост с портом
  if (/^(https?|file|chrome-extension):\/\//i.test(text) || /^(about|data):/i.test(text)) return text;
  if (looksLikeUrl(text)) return 'https://' + text;
  return searchUrl(text);
}

// Адрес страницы без обёртки Google Переводчика (example-com.translate.goog → example.com)
function originalUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('.translate.goog')) return url;
    const host = u.hostname.slice(0, -'.translate.goog'.length)
      .replace(/--/g, '\0').replace(/-/g, '.').replace(/\0/g, '-');
    for (const k of [...u.searchParams.keys()]) if (k.startsWith('_x_tr_')) u.searchParams.delete(k);
    return `https://${host}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return url;
  }
}

function hostOf(url) {
  try { return new URL(originalUrl(url)).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function faviconFor(url) {
  const host = hostOf(url);
  return host ? `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(host)}` : null;
}

function letterFor(url) { return (hostOf(url)[0] || '•').toUpperCase(); }

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ---------- Состояние ----------

let tabs = [];
let activeId = null;
let nextId = 1;
const closedStack = [];
let split = null; // { a, b } — id вкладок на разделённом экране
let dragData = null; // что сейчас перетаскивают: { kind: 'tab' | 'pinned', id } или { kind: 'favorite', url }
let renderPending = false;
let dragActive = false;
function clearDragging() { dragActive = false; document.body.classList.remove('dragging'); }

let spaces = INCOGNITO
  ? [{ id: 1, name: 'Инкогнито', color: '#b18cff' }]
  : store.get('spaces', [{ id: 1, name: 'Пространство', color: SPACE_COLORS[1] }]);
let currentSpace = INCOGNITO ? 1 : store.get('space', spaces[0].id);
if (!spaces.some(s => s.id === currentSpace)) currentSpace = spaces[0].id;
const lastActive = {};

let pinnedData = store.get('pinned', {});
let groups = store.get('groups', []);

// У каждого пространства своя сессия: отдельные cookie, входы и хранилище сайтов.
// Закрытое пространство хранит их только в памяти — всё стирается при выходе из Luch
function isPrivateSpace(spaceId) { return Boolean(spaces.find(s => s.id === spaceId)?.private); }
function partitionFor(spaceId) {
  if (INCOGNITO) return 'incognito';
  if (isPrivateSpace(spaceId)) return `private-space-${spaceId}`;
  return `persist:space-${spaceId}`;
}

function saveSpaces() {
  store.set('spaces', spaces);
  store.set('space', currentSpace);
}
function savePinned() { store.set('pinned', pinnedData); }
function saveGroups() { store.set('groups', groups); }

let persistTimer = null;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    // Вкладки закрытых пространств не восстанавливаются при следующем запуске
    store.set('session', tabs
      .filter(t => !t.pinnedId && t.url !== NEW_TAB_URL && !isPrivateSpace(t.spaceId))
      .map(t => ({ url: t.url, title: t.title, spaceId: t.spaceId, groupId: t.groupId || null, customTitle: t.customTitle || null })));
  }, 300);
}

// ---------- Вкладки ----------

function spaceTabs() { return tabs.filter(t => t.spaceId === currentSpace); }
function regularTabs() { return spaceTabs().filter(t => !t.pinnedId); }
function activeTab() { return tabs.find(t => t.id === activeId); }
function tabByWc(wcId) { return tabs.find(t => t.wcId === wcId); }
function tabTitle(t) {
  if (t.customTitle) return t.customTitle;
  if (t.pinnedId) { const p = findPinned(t.pinnedId); if (p?.item.title) return p.item.title; }
  return t.title || hostOf(t.url) || 'Новая вкладка';
}

function createTab(url = NEW_TAB_URL, opts = {}) {
  const {
    activate = true, spaceId = currentSpace, title, groupId = null, pinnedId = null,
    load = true, after = null, customTitle = null, token = null,
  } = opts;
  const tab = {
    id: nextId++, webview: null, wcId: null, url, spaceId, groupId, pinnedId, customTitle,
    title: title || (url === NEW_TAB_URL ? 'Новая вкладка' : hostOf(url)),
    favicon: null, loading: false, lastUsed: Date.now(), muted: false, audible: false,
  };
  // Новая вкладка встаёт после указанной, наверх или в конец списка
  if (after && tabs.includes(after)) tabs.splice(tabs.indexOf(after) + 1, 0, tab);
  else if (settings().newTabsTop && !pinnedId) tabs.unshift(tab);
  else tabs.push(tab);
  if (load || activate) ensureWebview(tab, token);
  if (activate) activateTab(tab.id);
  else renderTabs();
  persist();
  return tab;
}

function ensureWebview(tab, token = null) {
  if (tab.webview) return tab.webview;
  const wv = document.createElement('webview');
  const partition = partitionFor(tab.spaceId);
  if (partition) wv.setAttribute('partition', partition);
  wv.setAttribute('allowpopups', '');
  const popup = token?.newWindow;
  if (!popup) wv.setAttribute('src', tab.url);
  wv.classList.add('hidden');
  tab.webview = wv;
  tab.loading = true;
  bindWebview(tab, token);
  viewsEl.appendChild(wv);
  if (popup) popup.attach(wv);
  return wv;
}

function bindWebview(tab, token) {
  const wv = tab.webview;
  const update = () => {
    renderTabs();
    if (tab.id === activeId) syncChrome();
  };

  wv.addEventListener('dom-ready', () => { try { wv.setVisualZoomLevelLimits(1, 3); } catch {} }, { once: true });
  wv.addEventListener('did-attach', () => {
    tab.wcId = wv.getWebContentsId();
    if (token && !token.newWindow) window.luch.tabCreated(token, tab.wcId);
    if (tab.id === activeId) { window.luch.tabSelected(tab.wcId); syncExtensions(); }
  });
  wv.addEventListener('did-start-loading', () => {
    tab.loading = true;
    if (tab.id === activeId) setLoading(true);
    update();
  });
  wv.addEventListener('did-stop-loading', () => {
    tab.loading = false;
    if (tab.id === activeId) setLoading(false);
    autoTranslate(tab);
    autoFit(tab);
    update();
  });
  // Стадии загрузки двигают линию и блик под адресом
  wv.addEventListener('did-start-navigation', (e) => { if (e.isMainFrame && tab.id === activeId) bumpProgress(0.25); });
  wv.addEventListener('dom-ready', () => {
    if (tab.id === activeId) bumpProgress(0.75);
    if (wv.getURL() === NEW_TAB_URL) syncNewTabTheme(wv);
  });
  wv.addEventListener('did-frame-finish-load', (e) => { if (!e.isMainFrame && tab.id === activeId) bumpProgress(progress + 0.03); });
  wv.addEventListener('did-navigate', (e) => {
    if (tab.id === activeId) bumpProgress(0.5);
    tab.url = e.url;
    tab.favicon = null;
    // Другой сайт — заново узнаём, нужна ли ему подгонка
    if (hostOf(e.url) !== tab.fitHost) { tab.minWidth = 0; tab.fitHost = hostOf(e.url); }
    if (tab.showOriginal !== e.url) tab.showOriginal = null;
    stopTranslation(tab);
    if (!isPrivateSpace(tab.spaceId)) addHistory(tab.url, tab.title);
    update();
    persist();
  });
  wv.addEventListener('did-navigate-in-page', (e) => {
    if (!e.isMainFrame) return;
    tab.url = e.url;
    if (!isPrivateSpace(tab.spaceId)) addHistory(tab.url, tab.title);
    update();
    persist();
  });
  wv.addEventListener('page-title-updated', (e) => {
    tab.title = e.title;
    if (!isPrivateSpace(tab.spaceId)) updateHistoryTitle(tab.url, e.title);
    update();
    persist();
  });
  wv.addEventListener('page-favicon-updated', (e) => { tab.favicon = e.favicons[0] || null; update(); });
  wv.addEventListener('media-started-playing', () => { tab.audible = true; renderTabs(); });
  wv.addEventListener('media-paused', () => { tab.audible = false; renderTabs(); });
  wv.addEventListener('did-fail-load', (e) => {
    if (e.isMainFrame && e.errorCode !== -3) {
      tab.title = 'Не удалось открыть страницу';
      update();
    }
  });
  wv.addEventListener('focus', () => {
    // На разделённом экране активной становится панель, в которую щёлкнули
    if (split && (split.a === tab.id || split.b === tab.id) && activeId !== tab.id) {
      activeId = tab.id;
      tab.lastUsed = Date.now();
      layoutViews();
      renderTabs();
      syncChrome();
    }
  });
  wv.addEventListener('console-message', (e) => {
    if (wv.getURL() !== NEW_TAB_URL) return;
    if (e.message.startsWith('luch:ask:')) sendToGemini(e.message.slice('luch:ask:'.length), true);
    else if (e.message.startsWith('luch:search:')) wv.loadURL(searchUrl(e.message.slice('luch:search:'.length)));
  });
  wv.addEventListener('found-in-page', (e) => {
    const r = e.result;
    $('find-count').textContent = r.matches ? `${r.activeMatchOrdinal} из ${r.matches}` : 'Нет совпадений';
  });
}

function activateTab(id) {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;
  if (tab.spaceId !== currentSpace) setSpace(tab.spaceId, { activate: false });
  ensureWebview(tab);
  activeId = id;
  tab.lastUsed = Date.now();
  lastActive[currentSpace] = id;
  layoutViews();
  renderTabs();
  syncChrome();
  setLoading(tab.loading, true);
  if (tab.wcId) window.luch.tabSelected(tab.wcId);
  syncExtensions();
  tab.webview.focus();
}

function layoutViews() {
  if (typeof refitVisible === 'function') refitVisible(200);
  const inSplit = split && (split.a === activeId || split.b === activeId);
  for (const t of tabs) {
    if (!t.webview) continue;
    const visible = inSplit ? (t.id === split.a || t.id === split.b) : t.id === activeId;
    t.webview.classList.toggle('hidden', !visible);
    t.webview.classList.toggle('split-a', Boolean(inSplit && t.id === split.a));
    t.webview.classList.toggle('split-b', Boolean(inSplit && t.id === split.b));
    t.webview.classList.toggle('split-focus', Boolean(inSplit && t.id === activeId));
  }
  $('split-divider').hidden = !inSplit;
}

function closeTab(id, { remember = true } = {}) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx < 0) return;
  const [tab] = tabs.splice(idx, 1);
  clearInterval(tab.trTimer);
  if (remember && tab.url !== NEW_TAB_URL) closedStack.push({ url: tab.url, spaceId: tab.spaceId });
  if (tab.webview) tab.webview.remove();
  let next = null;
  if (split && (split.a === id || split.b === id)) {
    next = split.a === id ? split.b : split.a;
    split = null;
  }
  cleanupGroups();
  persist();
  if (id !== activeId) { layoutViews(); renderTabs(); return; }
  if (next && tabs.some(t => t.id === next)) { activateTab(next); return; }
  const rest = spaceTabs();
  if (!rest.some(t => !t.pinnedId || t.webview)) { createTab(); return; }
  const after = tabs.slice(idx).find(t => t.spaceId === currentSpace && !t.pinnedId);
  activateTab((after || rest.filter(t => !t.pinnedId || t.webview).pop()).id);
}

function openUrl(url) {
  const t = activeTab();
  if (t?.webview) t.webview.loadURL(url);
  else createTab(url);
}

// ---------- Отрисовка колонки ----------

function renderTabs() {
  // Пока что-то перетаскивают, список не трогаем — перерисуем после броска
  if (dragData) { renderPending = true; return; }
  renderPins();
  renderPinned();
  tabsEl.innerHTML = '';
  const shownGroups = new Set();
  for (const t of regularTabs()) {
    if (t.groupId) {
      if (shownGroups.has(t.groupId)) continue;
      shownGroups.add(t.groupId);
      const g = groups.find(x => x.id === t.groupId);
      if (g) { tabsEl.appendChild(buildGroup(g)); continue; }
    }
    tabsEl.appendChild(buildTabRow(t));
  }
  // Пустые группы тоже показываем — в них можно перетащить вкладки позже
  for (const g of groups) {
    if (g.spaceId === currentSpace && !shownGroups.has(g.id)) tabsEl.appendChild(buildGroup(g));
  }
  syncPageChip();
}

function faviconEl(t, url = t?.url) {
  const fav = el('div', 'favicon');
  if (t?.loading && url !== NEW_TAB_URL) { fav.className = 'favicon loading'; return fav; }
  if (url === NEW_TAB_URL) { fav.className = 'favicon plain'; return fav; }
  const src = t?.favicon || faviconFor(url);
  if (src) {
    const img = el('img');
    img.src = src;
    img.onerror = () => { img.remove(); fav.textContent = letterFor(url); };
    fav.appendChild(img);
  } else {
    fav.textContent = letterFor(url);
  }
  return fav;
}

function buildTabRow(t) {
  const row = el('div', 'tab' + (t.id === activeId ? ' active' : '') + (t.webview ? '' : ' unloaded'));
  row.dataset.id = t.id;
  row.title = tabTitle(t) + (t.url !== NEW_TAB_URL ? '\n' + hostOf(t.url) : '');
  row.draggable = true;
  row.appendChild(faviconEl(t));
  row.appendChild(el('div', 'title', tabTitle(t)));
  if (split && (split.a === t.id || split.b === t.id)) row.insertAdjacentHTML('beforeend', ICON.split);
  if (t.audible || t.muted) {
    const b = el('span');
    b.innerHTML = t.muted ? ICON.muted : ICON.speaker;
    b.title = t.muted ? 'Включить звук' : 'Выключить звук';
    b.addEventListener('mousedown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => { e.stopPropagation(); toggleMute(t); });
    row.appendChild(b);
  }
  const close = el('button', 'close');
  close.title = 'Закрыть вкладку';
  close.innerHTML = ICON.close;
  close.addEventListener('mousedown', (e) => e.stopPropagation());
  close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(t.id); });
  row.appendChild(close);

  // Активируем по щелчку, а не по нажатию: иначе перерисовка списка обрывает перетаскивание
  row.addEventListener('click', () => activateTab(t.id));
  row.addEventListener('auxclick', (e) => { if (e.button === 1) closeTab(t.id); });
  row.addEventListener('dblclick', () => renameTab(t, row));
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); tabMenu(t, row); });
  bindDrag(row, { kind: 'tab', id: t.id });
  return row;
}

function buildGroup(g) {
  const box = el('div');
  const items = regularTabs().filter(t => t.groupId === g.id);
  const head = el('div', 'group-head' + (g.open ? '' : ' closed'));
  head.innerHTML = ICON.chev;
  const dot = el('span', 'gdot');
  dot.style.background = g.color;
  head.append(dot, el('span', 'gname', g.name), el('span', 'count', String(items.length)));
  head.addEventListener('click', () => { g.open = !g.open; saveGroups(); renderTabs(); });
  head.addEventListener('dblclick', () => renameGroup(g, head));
  head.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    const choice = await window.luch.menu([
      { id: 'new-tab', label: 'Новая вкладка в группе' },
      { id: 'rename', label: 'Переименовать группу' },
      { label: 'Цвет', submenu: SPACE_COLORS.map((c, i) => ({ id: 'color:' + c, label: COLOR_NAMES[i], checked: g.color === c })) },
      { type: 'separator' },
      { id: 'new-group', label: 'Новая группа' },
      { type: 'separator' },
      { id: 'ungroup', label: 'Разгруппировать (вкладки останутся)', enabled: items.length > 0 },
      { id: 'close', label: 'Закрыть все вкладки группы', enabled: items.length > 0 },
      { id: 'delete', label: 'Удалить группу' },
    ]);
    if (choice === 'new-tab') newTabInGroup(g);
    else if (choice === 'rename') renameGroup(g, head);
    else if (choice?.startsWith('color:')) { g.color = choice.slice(6); saveGroups(); renderTabs(); }
    else if (choice === 'new-group') newGroup();
    else if (choice === 'ungroup' || choice === 'delete') deleteGroup(g, { closeTabs: false });
    else if (choice === 'close') items.slice().forEach(t => closeTab(t.id));
  });
  bindDrop(head, (data) => {
    if (data.kind === 'tab') moveTabToGroup(data.id, g.id);
    else if (data.kind === 'pinned') unpinToRegular(data.id, g.id);
  });
  const list = el('div', 'group-items' + (g.open ? '' : ' closed'));
  list.style.setProperty('--gcolor', g.color);
  items.forEach(t => list.appendChild(buildTabRow(t)));
  if (!items.length) {
    const hint = el('div', 'group-empty', 'Перетащите сюда вкладки');
    bindDrop(hint, (data) => {
      if (data.kind === 'tab') moveTabToGroup(data.id, g.id);
      else if (data.kind === 'pinned') unpinToRegular(data.id, g.id);
    });
    list.appendChild(hint);
  }
  box.append(head, list);
  return box;
}

// Группы живут сами по себе, даже пустые; убираем только группы удалённых пространств
function cleanupGroups() {
  const before = groups.length;
  groups = groups.filter(g => spaces.some(s => s.id === g.spaceId));
  if (groups.length !== before) saveGroups();
}

function createGroup(spaceId = currentSpace, name) {
  const g = {
    id: uid('g'),
    name: name || `Группа ${groups.filter(x => x.spaceId === spaceId).length + 1}`,
    color: SPACE_COLORS[groups.length % SPACE_COLORS.length],
    open: true,
    spaceId,
  };
  groups.push(g);
  saveGroups();
  return g;
}

// Пустая группа без ссылок: сразу предлагаем ввести название
function newGroup() {
  const g = createGroup();
  renderTabs();
  renameGroupLater(g);
  return g;
}

function newGroupWith(tab, name) {
  const g = createGroup(tab.spaceId, name);
  tab.groupId = g.id;
  persist();
  renderTabs();
  return g;
}

function newTabInGroup(g) {
  const last = [...tabs].reverse().find(x => x.groupId === g.id);
  g.open = true;
  saveGroups();
  createTab(NEW_TAB_URL, { groupId: g.id, after: last || null, spaceId: g.spaceId });
}

function deleteGroup(g, { closeTabs = false } = {}) {
  for (const t of tabs.filter(x => x.groupId === g.id)) {
    if (closeTabs) closeTab(t.id); else t.groupId = null;
  }
  groups = groups.filter(x => x !== g);
  saveGroups();
  persist();
  renderTabs();
}

function moveTabToGroup(tabId, groupId) {
  const t = tabs.find(x => x.id === tabId);
  if (!t || t.pinnedId) return;
  t.groupId = groupId;
  // Ставим вкладку в конец группы, чтобы группа не разрывалась
  const last = [...tabs].reverse().find(x => x.groupId === groupId && x !== t);
  if (last) { tabs.splice(tabs.indexOf(t), 1); tabs.splice(tabs.indexOf(last) + 1, 0, t); }
  cleanupGroups();
  renderTabs();
  persist();
}

// ---------- Закреплённые вкладки и папки ----------

function pinnedList(spaceId = currentSpace) {
  if (!pinnedData[spaceId]) pinnedData[spaceId] = [];
  return pinnedData[spaceId];
}

function findPinned(id) {
  for (const list of Object.values(pinnedData)) {
    for (const item of list) {
      if (item.id === id) return { item, list, folder: null };
      if (item.type === 'folder') {
        const inner = item.items.find(x => x.id === id);
        if (inner) return { item: inner, list: item.items, folder: item };
      }
    }
  }
  return null;
}

function liveTabFor(itemId) { return tabs.find(t => t.pinnedId === itemId); }

function renderPinned() {
  pinnedEl.innerHTML = '';
  for (const item of pinnedList()) {
    pinnedEl.appendChild(item.type === 'folder' ? buildFolder(item) : buildPinnedRow(item));
  }
}

function buildPinnedRow(item) {
  const live = liveTabFor(item.id);
  const row = el('div', 'tab' + (live && live.id === activeId ? ' active' : '') + (live?.webview ? '' : ' unloaded'));
  row.title = item.title + '\n' + hostOf(item.url);
  row.draggable = true;
  row.appendChild(faviconEl(live, live?.url || item.url));
  row.appendChild(el('div', 'title', item.title || hostOf(item.url)));
  if (live) {
    // У открытой закреплённой вкладки кнопка «−» выгружает её, но оставляет в списке
    const close = el('button', 'close');
    close.title = 'Выгрузить вкладку';
    close.innerHTML = ICON.minus;
    close.addEventListener('mousedown', (e) => e.stopPropagation());
    close.addEventListener('click', (e) => { e.stopPropagation(); closeTab(live.id, { remember: false }); });
    row.appendChild(close);
  }
  row.addEventListener('click', () => openPinned(item));
  row.addEventListener('dblclick', () => renamePinned(item, row));
  row.addEventListener('contextmenu', (e) => { e.preventDefault(); pinnedMenu(item, row); });
  bindDrag(row, { kind: 'pinned', id: item.id });
  return row;
}

function buildFolder(folder) {
  const box = el('div');
  const head = el('div', 'folder-head' + (folder.open ? '' : ' closed'));
  head.innerHTML = ICON.chev + ICON.folder;
  head.appendChild(el('span', 'fname', folder.name));
  head.addEventListener('click', () => { folder.open = !folder.open; savePinned(); renderPinned(); });
  head.addEventListener('dblclick', () => renameFolder(folder, head));
  head.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    const choice = await window.luch.menu([
      { id: 'rename', label: 'Переименовать папку' },
      { id: 'open-all', label: 'Открыть все вкладки' },
      { type: 'separator' },
      { id: 'new', label: 'Новая папка' },
      { id: 'delete', label: 'Удалить папку (вкладки останутся закреплёнными)' },
    ]);
    if (choice === 'rename') renameFolder(folder, head);
    else if (choice === 'open-all') folder.items.forEach(it => liveTabFor(it.id) || createTab(it.url, { pinnedId: it.id, activate: false, title: it.title }));
    else if (choice === 'new') newFolder();
    else if (choice === 'delete') {
      const list = pinnedList();
      list.splice(list.indexOf(folder), 1, ...folder.items);
      savePinned();
      renderTabs();
    }
  });
  bindDrop(head, (data) => movePinnedInto(data, folder));
  const list = el('div', 'folder-items' + (folder.open ? '' : ' closed'));
  folder.items.forEach(it => list.appendChild(buildPinnedRow(it)));
  box.append(head, list);
  return box;
}

function openPinned(item) {
  const live = liveTabFor(item.id);
  if (live) activateTab(live.id);
  else createTab(item.url, { pinnedId: item.id, title: item.title });
}

function pinTab(tab, folder = null) {
  if (!tab || tab.url === NEW_TAB_URL) return;
  if (tab.pinnedId) { unpinItem(tab.pinnedId); return; }
  const item = { id: uid('p'), type: 'tab', url: originalUrl(tab.url), title: tabTitle(tab) };
  (folder ? folder.items : pinnedList(tab.spaceId)).push(item);
  tab.pinnedId = item.id;
  tab.groupId = null;
  tab.customTitle = null;
  if (split && (split.a === tab.id || split.b === tab.id)) split = null;
  cleanupGroups();
  savePinned();
  persist();
  layoutViews();
  renderTabs();
}

function unpinItem(itemId) {
  const found = findPinned(itemId);
  if (!found) return null;
  found.list.splice(found.list.indexOf(found.item), 1);
  const live = liveTabFor(itemId);
  if (live) live.pinnedId = null;
  savePinned();
  persist();
  renderTabs();
  return found.item;
}

function unpinToRegular(itemId, groupId = null) {
  const live = liveTabFor(itemId);
  const item = unpinItem(itemId);
  if (!item) return;
  const tab = live || createTab(item.url, { activate: false, load: false, title: item.title });
  if (groupId) moveTabToGroup(tab.id, groupId);
}

function newFolder() {
  const folder = { id: uid('f'), type: 'folder', name: 'Новая папка', open: true, items: [] };
  pinnedList().push(folder);
  savePinned();
  renderTabs();
  const head = [...pinnedEl.querySelectorAll('.folder-head')].pop();
  if (head) renameFolder(folder, head);
}

function movePinnedInto(data, folder) {
  if (data.kind === 'tab') {
    pinTab(tabs.find(t => t.id === data.id), folder);
  } else if (data.kind === 'pinned') {
    const found = findPinned(data.id);
    if (!found || found.folder === folder) return;
    found.list.splice(found.list.indexOf(found.item), 1);
    folder.items.push(found.item);
    savePinned();
    renderTabs();
  }
}

async function pinnedMenu(item, row) {
  const live = liveTabFor(item.id);
  const folders = pinnedList().filter(x => x.type === 'folder');
  const found = findPinned(item.id);
  const moved = Boolean(live && originalUrl(live.url) !== item.url);
  const targets = [
    ...(found?.folder ? [{ id: 'folder:root', label: 'Вне папки' }] : []),
    ...folders.filter(f => f !== found?.folder).map(f => ({ id: 'folder:' + f.id, label: f.name })),
  ];
  const choice = await window.luch.menu([
    { id: 'rename', label: 'Переименовать…' },
    { id: 'reset', label: 'Вернуться к закреплённому адресу', enabled: moved },
    { id: 'update', label: 'Закрепить текущий адрес', enabled: moved },
    { id: 'copy', label: 'Копировать ссылку' },
    { type: 'separator' },
    ...(targets.length ? [{ label: 'Переместить в папку', submenu: targets }] : []),
    { id: 'new-folder', label: 'Новая папка' },
    { type: 'separator' },
    { id: 'unpin', label: 'Открепить' },
    { id: 'unload', label: 'Выгрузить вкладку', enabled: Boolean(live) },
  ]);
  if (choice === 'rename') renamePinned(item, row);
  else if (choice === 'reset') live.webview?.loadURL(item.url);
  else if (choice === 'update') { item.url = originalUrl(live.url); savePinned(); }
  else if (choice === 'copy') navigator.clipboard.writeText(item.url);
  else if (choice === 'new-folder') newFolder();
  else if (choice === 'unpin') unpinToRegular(item.id);
  else if (choice === 'unload' && live) closeTab(live.id, { remember: false });
  else if (choice?.startsWith('folder:')) {
    found.list.splice(found.list.indexOf(item), 1);
    if (choice === 'folder:root') pinnedList().push(item);
    else folders.find(f => 'folder:' + f.id === choice).items.push(item);
    savePinned();
    renderTabs();
  }
}

// Правый клик по пустому месту колонки: создать вкладку, группу или папку
async function sidebarMenu(e) {
  e.preventDefault();
  const choice = await window.luch.menu([
    { id: 'tab', label: 'Новая вкладка' },
    { id: 'group', label: 'Новая группа вкладок' },
    { id: 'folder', label: 'Новая папка для закреплённых' },
  ]);
  if (choice === 'tab') createTab();
  else if (choice === 'group') newGroup();
  else if (choice === 'folder') newFolder();
}
tabsEl.addEventListener('contextmenu', (e) => { if (e.target === tabsEl) sidebarMenu(e); });
$('tabbar').addEventListener('contextmenu', (e) => {
  if (e.target === $('tabbar') || e.target.classList.contains('tabbar-head') || e.target.classList.contains('tabbar-foot')) sidebarMenu(e);
});
$('btn-new').addEventListener('contextmenu', sidebarMenu);

pinnedEl.addEventListener('contextmenu', async (e) => {
  if (e.target !== pinnedEl) return;
  e.preventDefault();
  if (await window.luch.menu([{ id: 'new', label: 'Новая папка' }]) === 'new') newFolder();
});

// ---------- Перетаскивание ----------

function bindDrag(row, data) {
  row.addEventListener('dragstart', (e) => {
    dragData = data;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    // Разметку меняем уже после старта переноса: Chromium отменяет перетаскивание,
    // если в dragstart сдвинуть элементы под курсором (а пустые зоны для броска при этом раскрываются)
    dragActive = true;
    setTimeout(() => {
      if (!dragActive) return;
      row.classList.add('dragging');
      document.body.classList.add('dragging');
    }, 0);
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    clearDragging();
    dragData = null;
    if (renderPending) { renderPending = false; renderTabs(); }
  });
  if (data.kind !== 'tab') return;
  // Бросок на обычную вкладку ставит перетаскиваемую перед ней
  row.addEventListener('dragover', (e) => { if (dragData?.kind === 'tab') { e.preventDefault(); e.stopPropagation(); row.classList.add('drop-before'); } });
  row.addEventListener('dragleave', () => row.classList.remove('drop-before'));
  row.addEventListener('drop', (e) => {
    row.classList.remove('drop-before');
    if (dragData?.kind !== 'tab') return;
    e.preventDefault();
    e.stopPropagation();
    const target = tabs.find(t => t.id === data.id);
    const moved = tabs.find(t => t.id === dragData.id);
    if (!target || !moved || moved === target) return;
    tabs.splice(tabs.indexOf(moved), 1);
    tabs.splice(tabs.indexOf(target), 0, moved);
    moved.groupId = target.groupId;
    cleanupGroups();
    renderTabs();
    persist();
  });
}

// Зоны для вкладок и закреплённых; плитку избранного сюда не бросают — она убирается
function bindDrop(target, onDrop) {
  const accepts = () => dragData && dragData.kind !== 'favorite';
  target.addEventListener('dragover', (e) => { if (accepts()) { e.preventDefault(); e.stopPropagation(); target.classList.add('drop-target'); } });
  target.addEventListener('dragleave', () => target.classList.remove('drop-target'));
  target.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    target.classList.remove('drop-target');
    if (accepts()) onDrop(dragData);
  });
}

// Перетаскивание в зону закреплённых закрепляет вкладку, обратно — открепляет
bindDrop(pinnedEl, (data) => {
  if (data.kind === 'tab') pinTab(tabs.find(t => t.id === data.id));
  else if (data.kind === 'pinned') {
    const found = findPinned(data.id);
    if (found?.folder) { found.list.splice(found.list.indexOf(found.item), 1); pinnedList().push(found.item); savePinned(); renderTabs(); }
  }
});
bindDrop(tabsEl, (data) => {
  if (data.kind === 'pinned') unpinToRegular(data.id);
  else if (data.kind === 'tab') {
    const t = tabs.find(x => x.id === data.id);
    if (t?.groupId) { t.groupId = null; cleanupGroups(); renderTabs(); persist(); }
  }
});

// ---------- Меню вкладки ----------

async function tabMenu(t, row) {
  const isNew = t.url === NEW_TAB_URL;
  const others = spaces.filter(s => s.id !== t.spaceId);
  const spaceGroups = groups.filter(g => g.spaceId === t.spaceId && g.id !== t.groupId);
  const folders = pinnedList(t.spaceId).filter(x => x.type === 'folder');
  const inSplit = split && (split.a === t.id || split.b === t.id);
  const choice = await window.luch.menu([
    { id: 'reload', label: 'Обновить' },
    { id: 'duplicate', label: 'Дублировать', enabled: !isNew },
    { id: 'copy', label: 'Копировать ссылку', enabled: !isNew },
    { id: 'rename', label: 'Переименовать…' },
    { id: 'mute', label: t.muted ? 'Включить звук сайта' : 'Выключить звук сайта', enabled: Boolean(t.webview) },
    { type: 'separator' },
    { id: 'pin', label: 'Закрепить', enabled: !isNew },
    ...(folders.length ? [{ label: 'Закрепить в папку', enabled: !isNew, submenu: folders.map(f => ({ id: 'pinf:' + f.id, label: f.name })) }] : []),
    { id: 'group', label: 'Новая группа с вкладкой' },
    ...(spaceGroups.length ? [{ label: 'Переместить в группу', submenu: spaceGroups.map(g => ({ id: 'grp:' + g.id, label: g.name })) }] : []),
    ...(t.groupId ? [{ id: 'ungroup', label: 'Убрать из группы' }] : []),
    { id: 'split', label: inSplit ? 'Убрать разделение экрана' : 'Открыть рядом с текущей', enabled: Boolean(inSplit || t.id !== activeId) },
    ...(others.length ? [{ label: 'Переместить в пространство', submenu: others.map(s => ({ id: 'move:' + s.id, label: s.name })) }] : []),
    { type: 'separator' },
    { id: 'close', label: 'Закрыть вкладку' },
    { id: 'close-others', label: 'Закрыть остальные вкладки' },
    { id: 'close-below', label: 'Закрыть вкладки ниже' },
  ]);
  if (!choice) return;
  if (choice === 'reload') t.webview ? t.webview.reload() : activateTab(t.id);
  else if (choice === 'duplicate') createTab(t.url, { after: t, groupId: t.groupId });
  else if (choice === 'copy') navigator.clipboard.writeText(originalUrl(t.url));
  else if (choice === 'rename') renameTab(t, row);
  else if (choice === 'mute') toggleMute(t);
  else if (choice === 'pin') pinTab(t);
  else if (choice.startsWith('pinf:')) pinTab(t, folders.find(f => 'pinf:' + f.id === choice));
  else if (choice === 'group') renameGroupLater(newGroupWith(t));
  else if (choice.startsWith('grp:')) moveTabToGroup(t.id, choice.slice(4));
  else if (choice === 'ungroup') { t.groupId = null; cleanupGroups(); renderTabs(); persist(); }
  else if (choice === 'split') inSplit ? unsplit() : splitWith(t.id);
  else if (choice === 'close') closeTab(t.id);
  else if (choice === 'close-others') regularTabs().filter(o => o.id !== t.id).forEach(o => closeTab(o.id));
  else if (choice === 'close-below') { const list = regularTabs(); list.slice(list.indexOf(t) + 1).forEach(o => closeTab(o.id)); }
  else if (choice.startsWith('move:')) {
    // У другого пространства своя сессия, поэтому страница откроется там заново
    const url = t.url;
    closeTab(t.id, { remember: false });
    createTab(url, { spaceId: Number(choice.slice(5)), activate: false, load: false });
  }
}

function toggleMute(t) {
  if (!t.webview) return;
  t.muted = !t.muted;
  t.webview.setAudioMuted(t.muted);
  renderTabs();
}

// ---------- Переименование ----------

function inlineRename(anchor, value, onSave) {
  const pop = $('rename-pop');
  const input = $('rename-input');
  closePopovers();
  input.value = value;
  placePopover(pop, anchor);
  input.focus();
  input.select();
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    pop.hidden = true;
    if (save) onSave(input.value.trim());
  };
  input.onkeydown = (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  };
  input.onblur = () => finish(true);
}

function renameTab(t, row = tabsEl.querySelector(`.tab[data-id="${t.id}"]`)) {
  if (t.pinnedId) { const p = findPinned(t.pinnedId); if (p) renamePinned(p.item, row || $('address-wrap')); return; }
  inlineRename(row || $('address-wrap'), tabTitle(t), (name) => {
    t.customTitle = name || null;
    renderTabs();
    syncChrome();
    persist();
  });
}
function renamePinned(item, row) {
  inlineRename(row, item.title, (name) => { item.title = name || hostOf(item.url); savePinned(); renderTabs(); });
}
function renameFolder(folder, head) {
  inlineRename(head, folder.name, (name) => { if (name) folder.name = name; savePinned(); renderTabs(); });
}
function renameGroup(g, head) {
  inlineRename(head, g.name, (name) => { if (name) g.name = name; saveGroups(); renderTabs(); });
}
function renameGroupLater(g) {
  setTimeout(() => {
    const head = [...tabsEl.querySelectorAll('.group-head')].find(h => h.querySelector('.gname')?.textContent === g.name);
    if (head) renameGroup(g, head);
  }, 30);
}

// ---------- Избранное (плитки) ----------

function getPins() { return store.get('pins', DEFAULT_PINS); }

function renderPins() {
  const current = hostOf(activeTab()?.url || '');
  pinsEl.innerHTML = '';
  for (const p of getPins()) {
    const b = el('button', 'pin' + (current && hostOf(p.url) === current ? ' current' : ''));
    const img = el('img');
    img.src = faviconFor(p.url);
    img.onerror = () => img.replaceWith(el('span', 'letter', letterFor(p.url)));
    b.appendChild(img);
    b.addEventListener('click', () => {
      const existing = spaceTabs().find(t => hostOf(t.url) === hostOf(p.url) && !t.pinnedId);
      if (existing) activateTab(existing.id);
      else if (activeTab()?.url === NEW_TAB_URL) openUrl(p.url);
      else createTab(p.url);
    });
    // Плитку можно перетащить: внутри ряда — поменять местами, за его пределы — убрать из избранного
    b.draggable = true;
    b.addEventListener('dragstart', (e) => {
      $('pin-tip').hidden = true;
      dragData = { kind: 'favorite', url: p.url, droppedInPins: false };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/uri-list', p.url);
      setTimeout(() => b.classList.add('dragged'), 0);
    });
    b.addEventListener('dragend', () => {
      b.classList.remove('dragged');
      document.body.classList.remove('fav-removing');
      const drag = dragData;
      dragData = null;
      clearDragging();
      if (renderPending) { renderPending = false; renderTabs(); }
      if (drag?.kind === 'favorite' && !drag.droppedInPins) {
        toggleFavorite(drag.url);
        showNotice(`«${p.title || hostOf(p.url)}» убрано из избранного`, { done: true });
      }
    });
    b.addEventListener('mouseenter', () => showPinTip(b, p));
    b.addEventListener('mouseleave', () => ($('pin-tip').hidden = true));
    b.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      $('pin-tip').hidden = true;
      const choice = await window.luch.menu([
        { id: 'open', label: 'Открыть в новой вкладке' },
        { id: 'copy', label: 'Копировать ссылку' },
        { type: 'separator' },
        { id: 'unpin', label: 'Убрать из избранного' },
      ]);
      if (choice === 'open') createTab(p.url);
      else if (choice === 'copy') navigator.clipboard.writeText(p.url);
      else if (choice === 'unpin') toggleFavorite(p.url);
    });
    pinsEl.appendChild(b);
  }
}

function showPinTip(anchor, p) {
  const tip = $('pin-tip');
  $('pin-tip-title').textContent = p.title;
  $('pin-tip-host').textContent = hostOf(p.url);
  const r = anchor.getBoundingClientRect();
  tip.style.left = Math.min(r.right + 6, innerWidth - 270) + 'px';
  tip.style.top = r.top + 'px';
  tip.hidden = false;
}

// Квадратных плиток избранного всегда не больше трёх; остальное закрепляется в списке ниже
const MAX_FAVORITES = 3;

function toggleFavorite(url, title) {
  const host = hostOf(url);
  let pins = getPins();
  if (pins.some(p => hostOf(p.url) === host)) pins = pins.filter(p => hostOf(p.url) !== host);
  else if (pins.length >= MAX_FAVORITES) { pinUrl(url, title || host); return; }
  else pins.push({ url: originalUrl(url), title: title || host });
  store.set('pins', pins);
  renderPins();
  syncChrome();
}

function pinUrl(url, title) {
  url = originalUrl(url);
  const all = pinnedList().flatMap(x => x.type === 'folder' ? x.items : [x]);
  if (all.some(x => x.url === url)) return;
  pinnedList().push({ id: uid('p'), type: 'tab', url, title: title || hostOf(url) });
  savePinned();
  renderTabs();
}

// Если плиток накопилось больше трёх (из старых версий), лишние переезжают в закреплённые
function trimFavorites() {
  const pins = getPins();
  if (pins.length <= MAX_FAVORITES) return;
  for (const p of pins.slice(MAX_FAVORITES)) pinUrl(p.url, p.title);
  store.set('pins', pins.slice(0, MAX_FAVORITES));
}

// В избранное сайты попадают только перетаскиванием: вкладкой из колонки или ссылкой со страницы
function droppedUrl(e) {
  const uri = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
  const url = (uri || '').split('\n').map(x => x.trim()).find(x => x && !x.startsWith('#'));
  return url && /^https?:/i.test(url) ? url : null;
}

function addFavoriteFromDrop(e) {
  if (dragData?.kind === 'tab') {
    const t = tabs.find(x => x.id === dragData.id);
    if (t && /^https?:/.test(t.url)) return { url: originalUrl(t.url), title: tabTitle(t) };
  } else if (dragData?.kind === 'pinned') {
    const found = findPinned(dragData.id);
    if (found) return { url: found.item.url, title: found.item.title };
  } else {
    const url = droppedUrl(e);
    if (url) return { url: originalUrl(url), title: hostOf(url) };
  }
  return null;
}

function canDropFavorite(e) {
  return Boolean(dragData) || [...e.dataTransfer.types].some(t => t === 'text/uri-list' || t === 'text/plain');
}

// Плитку несут за пределы ряда — подсказываем, что она будет убрана
document.addEventListener('dragover', (e) => {
  if (dragData?.kind !== 'favorite') return;
  document.body.classList.toggle('fav-removing', !pinsEl.contains(e.target));
  e.preventDefault();
  e.dataTransfer.dropEffect = pinsEl.contains(e.target) ? 'move' : 'none';
});

pinsEl.addEventListener('dragover', (e) => {
  if (!canDropFavorite(e)) return;
  e.preventDefault();
  // Вкладки и плитки Luch разрешают только перемещение, ссылки со страниц — копирование;
  // если эффект не совпадёт с разрешённым, Chromium не даст отпустить
  e.dataTransfer.dropEffect = dragData ? 'move' : 'copy';
  pinsEl.classList.add('drop-target');
});
pinsEl.addEventListener('dragleave', (e) => { if (!pinsEl.contains(e.relatedTarget)) pinsEl.classList.remove('drop-target'); });
pinsEl.addEventListener('drop', (e) => {
  e.preventDefault();
  pinsEl.classList.remove('drop-target');
  clearDragging();
  // Плитку отпустили внутри ряда — ставим на место той, над которой отпустили
  if (dragData?.kind === 'favorite') {
    dragData.droppedInPins = true;
    const pins = getPins();
    const from = pins.findIndex(p => p.url === dragData.url);
    const over = [...pinsEl.children].indexOf(e.target.closest('.pin'));
    if (from >= 0 && over >= 0 && over !== from) {
      pins.splice(over, 0, pins.splice(from, 1)[0]);
      store.set('pins', pins);
      renderPins();
    }
    return;
  }
  const fav = addFavoriteFromDrop(e);
  if (!fav || getPins().some(p => hostOf(p.url) === hostOf(fav.url))) return;
  if (getPins().length >= MAX_FAVORITES && dragData?.kind === 'tab') pinTab(tabs.find(x => x.id === dragData.id));
  else toggleFavorite(fav.url, fav.title);
});
// Пока что-то тащат, пустая сетка избранного показывает место для броска
const markDragging = () => {
  dragActive = true;
  setTimeout(() => { if (dragActive) document.body.classList.add('dragging'); }, 0);
};
// Перенос ушёл за пределы окна или отменён — прячем раскрытые зоны
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) clearDragging(); });
document.addEventListener('dragenter', markDragging);
document.addEventListener('dragend', clearDragging);
document.addEventListener('drop', clearDragging);
pinsEl.addEventListener('dragenter', markDragging);

// ---------- Пространства (профили) ----------

function spaceColor(s) {
  if (s.theme) return LuchTheme.primary(s.theme);
  return s.color || SPACE_COLORS[(s.id - 1) % SPACE_COLORS.length];
}

// Фон окна и режим (светлый/тёмный) по теме текущего пространства
function applySpaceTheme() {
  LuchTheme.apply(INCOGNITO ? null : spaces.find(s => s.id === currentSpace)?.theme || null);
  for (const t of tabs) if (t.webview && t.url === NEW_TAB_URL) syncNewTabTheme(t.webview);
}

// Новая вкладка открыта во вкладке-webview и сама видит только тему системы — передаём ей тему окна
function syncNewTabTheme(wv) {
  const theme = document.documentElement.dataset.theme;
  const code = theme
    ? `document.documentElement.dataset.theme = ${JSON.stringify(theme)}`
    : 'delete document.documentElement.dataset.theme';
  wv.executeJavaScript(code).catch(() => {});
}

function setSpace(id, { activate = true } = {}) {
  currentSpace = id;
  saveSpaces();
  renderSpaces();
  applySpaceTheme();
  syncExtensions();
  if (!activate) return;
  const list = spaceTabs();
  const target = list.find(t => t.id === lastActive[id]) || list.find(t => !t.pinnedId) || list.find(t => t.webview);
  if (target) activateTab(target.id);
  else createTab();
}

function renderSpaces() {
  $('space-btn').textContent = spaces.find(s => s.id === currentSpace).name;
  $('space-btn').classList.toggle('private', isPrivateSpace(currentSpace));
  const box = $('spaces');
  box.innerHTML = '';
  if (INCOGNITO) return;
  for (const s of spaces) {
    const dot = el('button', 'space-dot' + (s.id === currentSpace ? ' current' : '') + (s.private ? ' private' : ''));
    dot.style.setProperty('--dot', spaceColor(s));
    dot.title = s.private ? `${s.name} — закрытое` : s.name;
    dot.addEventListener('click', () => { if (s.id !== currentSpace) setSpace(s.id); });
    dot.addEventListener('contextmenu', (e) => { e.preventDefault(); openSpaceEditor(s.id, dot, { focusTheme: true }); });
    box.appendChild(dot);
  }
}

function placePopover(pop, anchor) {
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  pop.style.top = (r.bottom + 6 + h > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
}

function closePopovers() {
  // Закрыли редактор без сохранения — убираем предпросмотр темы
  if (!$('space-editor').hidden) applySpaceTheme();
  for (const id of ['space-menu', 'space-editor', 'downloads-pop', 'shot-menu']) $(id).hidden = true;
  $('space-btn').classList.remove('open');
}

// Список пространств по щелчку на название, как в Dia
function openSpaceMenu() {
  const menu = $('space-menu');
  if (!menu.hidden) { closePopovers(); return; }
  closePopovers();
  if (INCOGNITO) return;
  menu.innerHTML = '';
  const item = (html, onClick) => {
    const b = el('button', 'menu-item');
    b.innerHTML = html;
    b.onclick = () => { closePopovers(); onClick(); };
    menu.appendChild(b);
    return b;
  };
  spaces.forEach((s, i) => {
    const b = item(`<span class="check">${s.id === currentSpace ? '✓' : ''}</span><span class="dot"></span><span class="mi-label"></span><span class="shortcut">${i < 9 ? '⌃' + (i + 1) : ''}</span>`,
      () => setSpace(s.id));
    b.querySelector('.dot').style.background = spaceColor(s);
    b.querySelector('.mi-label').textContent = s.private ? `${s.name} · закрытое` : s.name;
  });
  item('<span class="check"></span><svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg><span class="mi-label">Новое пространство…</span>',
    () => openSpaceEditor(null));
  menu.appendChild(el('div', 'menu-sep'));
  item('<span class="check"></span><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/><circle cx="6" cy="6.5" r="1"/><circle cx="10" cy="6.5" r="1"/><circle cx="6.5" cy="10" r="1"/></svg><span class="mi-label">Изменить тему…</span>',
    () => openSpaceEditor(currentSpace, $('space-btn'), { focusTheme: true }));
  item('<span class="check"></span><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2"/></svg><span class="mi-label">Настройки пространства</span>',
    () => openSpaceEditor(currentSpace));
  if (isPrivateSpace(currentSpace)) {
    item('<span class="check"></span><svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5"/></svg><span class="mi-label">Стереть данные сейчас</span>',
      () => wipePrivateSpace(currentSpace));
  }
  $('space-btn').classList.add('open');
  placePopover(menu, $('space-btn'));
}
$('space-btn').onclick = (e) => { e.stopPropagation(); openSpaceMenu(); };
// Правый щелчок по названию — то же меню: там переименование и тема
$('space-btn').addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); openSpaceMenu(); });

let editingSpace = null;
let editingTheme = null;
function openSpaceEditor(id, anchor = $('space-btn'), { focusTheme = false } = {}) {
  if (INCOGNITO) return;
  closePopovers();
  editingSpace = id;
  const s = spaces.find(x => x.id === id);
  editingTheme = s?.theme || LuchTheme.defaultTheme(s ? spaceColor(s) : SPACE_COLORS[spaces.length % SPACE_COLORS.length]);
  $('space-editor-title').textContent = !s ? 'Новое пространство' : focusTheme ? `Тема пространства «${s.name}»` : 'Настройки пространства';
  $('space-editor-name').value = s ? s.name : '';
  $('space-editor-private').checked = Boolean(s?.private);
  $('space-save').textContent = s ? 'Сохранить' : 'Создать';
  $('space-delete').hidden = !s || spaces.length < 2;
  // Тема: точки цветов, режим, насыщенность и зернистость; окно сразу показывает результат
  LuchTheme.picker($('space-theme'), editingTheme, (t) => { editingTheme = t; LuchTheme.apply(t); });
  LuchTheme.apply(editingTheme);
  placePopover($('space-editor'), anchor);
  // Открыли «Изменить тему…» — фокус на главной точке, а не на названии
  if (focusTheme) $('space-theme').querySelector('.tp-dot')?.focus();
  else {
    $('space-editor-name').focus();
    $('space-editor-name').select();
  }
}

function saveSpaceEditor() {
  const name = $('space-editor-name').value.trim();
  if (!name) { $('space-editor-name').focus(); return; }
  const isPrivate = $('space-editor-private').checked;
  if (editingSpace === null) {
    const id = Math.max(...spaces.map(s => s.id)) + 1;
    spaces.push({ id, name, theme: editingTheme, private: isPrivate });
    closePopovers();
    setSpace(id);
  } else {
    const s = spaces.find(x => x.id === editingSpace);
    const changed = Boolean(s.private) !== isPrivate;
    Object.assign(s, { name, theme: editingTheme, private: isPrivate });
    closePopovers();
    saveSpaces();
    renderSpaces();
    // Хранилище сменилось — вкладки пространства открываются заново уже в нём
    if (changed) reopenSpaceTabs(s.id);
  }
}

function reopenSpaceTabs(spaceId) {
  for (const t of tabs.filter(t => t.spaceId === spaceId && t.webview)) {
    t.webview.remove();
    t.webview = null;
    t.wcId = null;
  }
  const active = activeTab();
  if (active?.spaceId === spaceId) { ensureWebview(active); activateTab(active.id); }
  renderTabs();
  persist();
}

// Стирает cookie, входы и данные сайтов закрытого пространства, не дожидаясь выхода из Luch
async function wipePrivateSpace(spaceId) {
  if (!isPrivateSpace(spaceId)) return;
  const all = { appcache: true, cache: true, cookies: true, sessionCookies: true, persistentCookies: true,
    fileSystems: true, indexedDB: true, localStorage: true, webSQL: true };
  let wv = tabs.find(t => t.spaceId === spaceId && t.webview)?.webview;
  let temp = null;
  if (!wv) {
    // Ни одной открытой вкладки — стираем через временную пустую страницу в том же хранилище
    temp = document.createElement('webview');
    temp.setAttribute('partition', partitionFor(spaceId));
    temp.setAttribute('src', 'about:blank');
    temp.classList.add('hidden');
    viewsEl.appendChild(temp);
    await new Promise(r => temp.addEventListener('loadstop', r, { once: true }));
    wv = temp;
  }
  await new Promise(r => wv.clearData({ since: 0 }, all, r));
  temp?.remove();
  for (const t of tabs.filter(t => t.spaceId === spaceId && t.webview)) t.webview.reload();
  showNotice('Данные закрытого пространства стёрты', { done: true });
}
$('space-save').onclick = saveSpaceEditor;
$('space-cancel').onclick = closePopovers;
$('space-editor-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveSpaceEditor();
  if (e.key === 'Escape') closePopovers();
});
$('space-delete').onclick = () => {
  const s = spaces.find(x => x.id === editingSpace);
  if (!s || !confirm(`Удалить пространство «${s.name}» вместе с его вкладками?`)) return;
  closePopovers();
  deleteSpace(s.id);
};

function deleteSpace(id) {
  for (const t of tabs.filter(t => t.spaceId === id)) if (t.webview) t.webview.remove();
  if (split && tabs.some(t => t.spaceId === id && (t.id === split.a || t.id === split.b))) split = null;
  tabs = tabs.filter(t => t.spaceId !== id);
  groups = groups.filter(g => g.spaceId !== id);
  delete pinnedData[id];
  spaces = spaces.filter(s => s.id !== id);
  savePinned();
  saveGroups();
  persist();
  if (id === currentSpace) setSpace(spaces[0].id);
  else { saveSpaces(); renderSpaces(); }
}

document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.popover, #space-btn, #btn-downloads')) closePopovers();
  if (!$('cmdbar').hidden && !e.target.closest('#cmdbar, #address-wrap')) closeCommandBar();
});
window.addEventListener('blur', closePopovers);
// Щелчок по странице сайта не доходит до интерфейса: о нём сообщает guest-keys.js,
// а переход во вкладку с клавиатуры виден по фокусу
addEventListener('luch-page-click', closePopovers);
document.addEventListener('focusin', (e) => { if (e.target.tagName === 'WEBVIEW') closePopovers(); });
$('btn-add-space').onclick = () => openSpaceEditor(null, $('btn-add-space'));

// ---------- Панель инструментов ----------

function syncChrome() {
  const t = activeTab();
  if (!t) return;
  let canBack = false, canForward = false;
  try { canBack = t.webview.canGoBack(); canForward = t.webview.canGoForward(); } catch {}
  $('btn-back').disabled = !canBack;
  $('btn-forward').disabled = !canForward;
  renderAddressDisplay(t);
  const isNew = t.url === NEW_TAB_URL;
  syncTranslate();
  syncNotes();
  syncPageChip();
  document.title = isNew ? 'Luch' : tabTitle(t);
}

// Адрес показываем как «сайт / заголовок», как в Dia
function renderAddressDisplay(t) {
  const box = $('address-display');
  box.innerHTML = '';
  if (!t || t.url === NEW_TAB_URL) {
    box.appendChild(el('span', 'placeholder', 'Поиск или адрес сайта'));
    return;
  }
  box.appendChild(el('span', 'host', hostOf(t.url) || t.url));
  const title = tabTitle(t);
  if (title && title !== hostOf(t.url)) box.append(el('span', 'sep', '/'), el('span', 'page', title));
}

// Индикатор загрузки как в Dia: линия под адресом и блик идут за прогрессом загрузки.
// Точного процента webview не сообщает, поэтому прогресс собирается из стадий
// (начало, ответ сервера, DOM готов, загрузка завершена) и плавно подтягивается между ними
let loadDoneTimer = null;
let trickleTimer = null;
let progress = 0;

function setProgress(p, instant = false) {
  const wrap = $('address-wrap');
  progress = Math.max(0, Math.min(1, p));
  if (instant) { wrap.classList.add('reset'); void wrap.offsetWidth; }
  wrap.style.setProperty('--p', progress.toFixed(3));
  if (instant) { void wrap.offsetWidth; wrap.classList.remove('reset'); }
}

function bumpProgress(stage) {
  if (!$('address-wrap').classList.contains('loading')) return;
  if (stage > progress) setProgress(stage);
}

function setLoading(on, instant = false) {
  const wrap = $('address-wrap');
  $('btn-reload').classList.toggle('loading', on);
  $('btn-reload').title = on ? 'Остановить' : 'Обновить (⌘R)';
  clearTimeout(loadDoneTimer);
  clearInterval(trickleTimer);
  if (on) {
    if (!wrap.classList.contains('loading')) {
      wrap.classList.remove('done');
      setProgress(0, true);
      wrap.classList.add('loading');
      requestAnimationFrame(() => bumpProgress(0.12));
    }
    // Между стадиями прогресс медленно ползёт вперёд, но не дальше 90%
    trickleTimer = setInterval(() => bumpProgress(progress + (0.9 - progress) * 0.06), 250);
  } else if (wrap.classList.contains('loading')) {
    wrap.classList.remove('loading');
    if (instant) { setProgress(0, true); return; }
    wrap.classList.add('done');
    setProgress(1);
    loadDoneTimer = setTimeout(() => { wrap.classList.remove('done'); setProgress(0, true); }, 750);
  }
}

$('address-wrap').addEventListener('click', () => openCommandBar());
$('btn-back').onclick = () => activeTab()?.webview?.goBack();
$('btn-forward').onclick = () => activeTab()?.webview?.goForward();
$('btn-reload').onclick = () => {
  const t = activeTab();
  if (!t?.webview) return;
  if (t.loading) t.webview.stop(); else t.webview.reload();
};

// Иконки расширений показывают состояние для текущей вкладки и пространства
function syncExtensions() {
  const list = $('ext-actions');
  if (INCOGNITO) { list.hidden = true; return; }
  const partition = partitionFor(currentSpace);
  if (partition) list.setAttribute('partition', partition); else list.removeAttribute('partition');
  const t = activeTab();
  if (t?.wcId) list.setAttribute('tab', String(t.wcId));
}

// ---------- Командная строка (⌘L) ----------

let cmdMode = 'all';
let cmdNewTab = false;
let cmdItems = [];
let cmdIndex = 0;

function openCommandBar(mode = 'all', { newTab = false, text = null } = {}) {
  cmdMode = mode;
  cmdNewTab = newTab;
  const input = $('cmd-input');
  const t = activeTab();
  $('cmd-mode').hidden = mode !== 'tabs';
  $('cmd-mode').textContent = 'Вкладки';
  input.placeholder = mode === 'tabs' ? 'Поиск по открытым вкладкам…' : 'Поиск, адрес или вопрос к Gemini…';
  input.value = text ?? (mode === 'all' && !newTab && t && t.url !== NEW_TAB_URL ? originalUrl(t.url) : '');
  const bar = $('cmdbar');
  clearTimeout(cmdCloseTimer);
  bar.classList.remove('instant');
  $('address-wrap').classList.add('cmd-open');
  const wasOpen = !bar.hidden && bar.classList.contains('open');
  bar.hidden = false;
  placeCommandBar();
  // Сначала показываем строку прозрачной, на следующем кадре включаем анимацию открытия
  if (!wasOpen) { bar.classList.remove('open'); requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('open'))); }
  input.focus();
  input.select();
  renderCommandResults();
}

// Строка ложится ровно на поле адреса: та же ширина, тот же левый край и верх
function placeCommandBar() {
  const bar = $('cmdbar');
  if (bar.hidden) return;
  const wrap = $('address-wrap').getBoundingClientRect();
  const main = $('main').getBoundingClientRect();
  bar.style.left = (wrap.left - main.left) + 'px';
  bar.style.top = (wrap.top - main.top) + 'px';
  bar.style.width = wrap.width + 'px';
}
window.addEventListener('resize', placeCommandBar);

let cmdCloseTimer = null;
function closeCommandBar() {
  const bar = $('cmdbar');
  if (bar.hidden || bar.classList.contains('instant')) return;
  // Обратная анимация: список уезжает под поле, поле светлеет, потом прячем строку
  bar.classList.remove('open');
  bar.classList.add('instant');
  // Текст строки исчезает и адрес появляется в одном кадре — без паузы и без наслоения
  $('address-wrap').classList.remove('cmd-open');
  clearTimeout(cmdCloseTimer);
  cmdCloseTimer = setTimeout(() => { bar.hidden = true; bar.classList.remove('instant'); }, 200);
  activeTab()?.webview?.focus();
}

function matches(q, ...fields) {
  const s = fields.join(' ').toLowerCase();
  return q.split(/\s+/).every(w => s.includes(w));
}

function renderCommandResults() {
  const q = $('cmd-input').value.trim();
  const ql = q.toLowerCase();
  const t = activeTab();
  const current = t && t.url !== NEW_TAB_URL ? originalUrl(t.url) : '';
  // Пока в строке стоит адрес текущей страницы, показываем подсказки как для пустого запроса
  const typed = q && q !== current;
  const items = [];

  if (cmdMode === 'tabs') {
    for (const x of tabs) {
      if (x.url === NEW_TAB_URL || (q && !matches(ql, tabTitle(x), x.url))) continue;
      const space = spaces.find(s => s.id === x.spaceId);
      items.push({ section: 'Открытые вкладки', icon: faviconFor(x.url), title: tabTitle(x), sub: spaces.length > 1 ? space?.name : hostOf(x.url), run: () => activateTab(x.id) });
    }
  } else if (q.startsWith('/')) {
    const sq = q.slice(1).toLowerCase();
    for (const s of getSkills().filter(s => s.name.toLowerCase().includes(sq))) {
      items.push({ section: 'Скиллы Gemini', svg: ICON.slash, title: '/' + s.name, sub: 'с текстом этой страницы', run: () => runSkill(s) });
    }
  } else if (typed) {
    if (looksLikeUrl(q)) {
      items.push({ section: 'Перейти', svg: ICON.globe, title: q, sub: 'Открыть сайт', run: (nt) => go(toUrl(q), nt) });
      items.push({ section: 'Перейти', svg: ICON.search, title: `Искать «${q}»`, sub: engine().name, run: (nt) => go(searchUrl(q), nt) });
    } else {
      items.push({ section: 'Перейти', svg: ICON.search, title: q, sub: `Искать в ${engine().name}`, run: (nt) => go(searchUrl(q), nt) });
      items.push({ section: 'Перейти', svg: ICON.sparkle, title: q, sub: 'Спросить Gemini', run: () => sendToGemini(q, true) });
    }
    const seen = new Set();
    let n = 0;
    for (const x of tabs) {
      if (n >= 4 || x.url === NEW_TAB_URL || !matches(ql, tabTitle(x), x.url)) continue;
      seen.add(originalUrl(x.url));
      n++;
      items.push({ section: 'Открытые вкладки', icon: faviconFor(x.url), title: tabTitle(x), sub: hostOf(x.url), run: () => activateTab(x.id) });
    }
    for (const list of Object.values(pinnedData)) {
      for (const it of list.flatMap(x => x.type === 'folder' ? x.items : [x])) {
        if (seen.has(it.url) || !matches(ql, it.title, it.url)) continue;
        seen.add(it.url);
        items.push({ section: 'Закреплённые', icon: faviconFor(it.url), title: it.title, sub: hostOf(it.url), run: () => openPinned(it) });
      }
    }
    n = 0;
    for (const h of getHistory()) {
      if (n >= 6) break;
      if (seen.has(h.url) || !matches(ql, h.title || '', h.url)) continue;
      seen.add(h.url);
      n++;
      items.push({ section: 'История', icon: faviconFor(h.url), title: h.title || h.url, sub: hostOf(h.url), run: (nt) => go(h.url, nt) });
    }
  } else {
    if (current) {
      items.push({ section: 'Эта страница', svg: ICON.tab, title: 'Копировать адрес', sub: hostOf(current), run: () => navigator.clipboard.writeText(current) });
      items.push({ section: 'Эта страница', svg: ICON.sparkle, title: 'Пересказать страницу', sub: 'Gemini', run: () => runSkill(getSkills()[0] || DEFAULT_SKILLS[0]) });
    }
    // Недавние без повторов: одна и та же страница в истории встречается много раз
    const seenRecent = new Set();
    for (const h of getHistory()) {
      if (seenRecent.size >= 6) break;
      const key = hostOf(h.url) + '|' + (h.title || h.url);
      if (h.url === current || seenRecent.has(key)) continue;
      seenRecent.add(key);
      items.push({ section: 'Недавние', icon: faviconFor(h.url), title: h.title || h.url, sub: hostOf(h.url), run: (nt) => go(h.url, nt) });
    }
  }

  cmdItems = items;
  cmdIndex = 0;
  const box = $('cmd-results');
  box.innerHTML = '';
  let lastSection = null;
  items.forEach((it, i) => {
    if (it.section !== lastSection) { box.appendChild(el('div', 'cmd-section', it.section)); lastSection = it.section; }
    const b = el('button', 'cmd-item' + (i === 0 ? ' selected' : ''));
    b.style.setProperty('--i', Math.min(i, 10));
    const ic = el('span', 'ci-icon');
    if (it.icon) { const img = el('img'); img.src = it.icon; img.onerror = () => (ic.innerHTML = ICON.globe); ic.appendChild(img); }
    else ic.innerHTML = it.svg || ICON.globe;
    b.append(ic, el('span', 'ci-title', it.title), el('span', 'ci-sub', it.sub || ''));
    b.addEventListener('mouseenter', () => selectCmd(i));
    b.addEventListener('click', (e) => runCmd(i, e.metaKey));
    box.appendChild(b);
  });
}

function selectCmd(i) {
  const rows = $('cmd-results').querySelectorAll('.cmd-item');
  if (!rows.length) return;
  cmdIndex = (i + rows.length) % rows.length;
  rows.forEach((r, k) => r.classList.toggle('selected', k === cmdIndex));
  rows[cmdIndex].scrollIntoView({ block: 'nearest' });
}

function runCmd(i, newTab) {
  const q = $('cmd-input').value.trim();
  const t = activeTab();
  const current = t && t.url !== NEW_TAB_URL ? originalUrl(t.url) : '';
  const it = cmdItems[i];
  closeCommandBar();
  // Enter без изменений адреса просто закрывает строку
  if (cmdMode === 'all' && q && q === current && i === 0) return;
  if (it) it.run(newTab || cmdNewTab);
  else if (q) go(toUrl(q), newTab || cmdNewTab);
}

function go(url, newTab) {
  if (newTab) createTab(url);
  else openUrl(url);
}

$('cmd-input').addEventListener('input', renderCommandResults);
// Щелчок по странице не доходит до интерфейса браузера, поэтому закрываем строку, когда поле теряет фокус
// (если фокус ушёл не на сам список подсказок)
$('cmd-input').addEventListener('blur', () => {
  setTimeout(() => { if (!$('cmdbar').contains(document.activeElement)) closeCommandBar(); }, 120);
});
$('cmd-input').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); selectCmd(cmdIndex + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); selectCmd(cmdIndex - 1); }
  else if (e.key === 'Enter') { e.preventDefault(); runCmd(cmdIndex, e.metaKey); }
  else if (e.key === 'Escape') { e.preventDefault(); closeCommandBar(); }
});
$('cmd-go').onclick = () => runCmd(cmdIndex, false);

// ---------- История ----------

function getHistory() { return store.get('history', []); }

function addHistory(url, title) {
  if (INCOGNITO || !/^https?:/.test(url)) return;
  url = originalUrl(url);
  const list = getHistory();
  if (list[0]?.url === url) return;
  list.unshift({ url, title: title || '', ts: Date.now() });
  if (list.length > 5000) list.length = 5000;
  store.set('history', list);
}

function updateHistoryTitle(url, title) {
  if (INCOGNITO) return;
  const list = getHistory();
  if (list[0] && list[0].url === originalUrl(url)) { list[0].title = title; store.set('history', list); }
}

function openHistory() {
  closeCommandBar();
  $('history').hidden = false;
  $('history-search').value = '';
  renderHistory();
  $('history-search').focus();
}

function renderHistory() {
  const q = $('history-search').value.trim().toLowerCase();
  const box = $('history-list');
  box.innerHTML = '';
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 864e5).toDateString();
  let lastDay = null;
  let count = 0;
  for (const h of getHistory()) {
    if (q && !matches(q, h.title || '', h.url)) continue;
    if (++count > 600) break;
    const d = new Date(h.ts);
    const day = d.toDateString();
    if (day !== lastDay) {
      lastDay = day;
      box.appendChild(el('div', 'h-day', day === today ? 'Сегодня' : day === yesterday ? 'Вчера' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })));
    }
    const row = el('div', 'h-row');
    const img = el('img');
    img.src = faviconFor(h.url);
    row.append(img, el('span', 'h-title', h.title || h.url), el('span', 'h-host', hostOf(h.url)), el('span', 'h-time', d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })));
    row.addEventListener('click', () => { $('history').hidden = true; createTab(h.url); });
    box.appendChild(row);
  }
  if (!count) box.appendChild(el('p', 'note', q ? 'Ничего не найдено' : 'История пуста'));
}

$('history-search').addEventListener('input', renderHistory);
$('history-clear').onclick = () => {
  if (!confirm('Удалить всю историю?')) return;
  store.set('history', []);
  renderHistory();
};

// ---------- Загрузки ----------

const downloads = new Map();

window.luch.onDownload((info) => {
  const isNew = !downloads.has(info.id);
  downloads.set(info.id, info);
  $('btn-downloads').classList.toggle('active', [...downloads.values()].some(d => d.state === 'progressing'));
  // Сама открывается только для только что начатой загрузки, не для оставшихся с прошлого запуска
  if (isNew && info.started) openDownloads();
  else if (!$('downloads-pop').hidden) renderDownloads();
});

function formatBytes(n) {
  if (!n) return '0 Б';
  const u = ['Б', 'КБ', 'МБ', 'ГБ'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return (n / 1024 ** i).toFixed(i ? 1 : 0) + ' ' + u[i];
}

function renderDownloads() {
  const box = $('downloads-list');
  box.innerHTML = '';
  const list = [...downloads.values()].reverse();
  if (!list.length) { box.appendChild(el('div', 'dl-empty', 'Загрузок пока нет')); return; }
  for (const d of list) {
    const row = el('div', 'dl');
    const body = el('div', 'dl-body');
    body.appendChild(el('div', 'dl-name', d.name));
    if (d.state === 'progressing') {
      const p = el('progress');
      p.max = d.total || 1;
      p.value = d.received;
      body.append(p, el('div', 'dl-sub', `${formatBytes(d.received)} из ${d.total ? formatBytes(d.total) : '?'}`));
    } else {
      body.appendChild(el('div', 'dl-sub', d.state === 'completed' ? formatBytes(d.total || d.received) : d.state === 'cancelled' ? 'Отменено' : 'Ошибка'));
    }
    row.appendChild(body);
    const action = el('button', 'pill', d.state === 'progressing' ? 'Отмена' : 'В Finder');
    action.onclick = (e) => { e.stopPropagation(); window.luch.downloadAction(d.id, d.state === 'progressing' ? 'cancel' : 'show'); };
    row.appendChild(action);
    if (d.state === 'completed') row.addEventListener('click', () => window.luch.downloadAction(d.id, 'open'));
    box.appendChild(row);
  }
}

function openDownloads() {
  closePopovers();
  renderDownloads();
  placePopover($('downloads-pop'), $('btn-downloads'));
}
$('btn-downloads').onclick = (e) => {
  e.stopPropagation();
  if ($('downloads-pop').hidden) openDownloads(); else closePopovers();
};

// ---------- Снимки страницы (page-shot.js) ----------

function openShotMenu() {
  const t = activeTab();
  if (!t?.webview || t.url === NEW_TAB_URL) return;
  const menu = $('shot-menu');
  closePopovers();
  menu.innerHTML = '';
  for (const [mode, label] of [['visible', 'Видимая часть'], ['full', 'Вся страница'], ['area', 'Выделить область…'], ['pdf', 'Сохранить как PDF…']]) {
    const b = el('button', 'menu-item');
    b.innerHTML = '<span class="mi-label"></span>';
    b.querySelector('.mi-label').textContent = label;
    b.onclick = () => { closePopovers(); takeScreenshot(mode); };
    menu.appendChild(b);
  }
  placePopover(menu, $('address-wrap'));
}

async function takeScreenshot(mode) {
  const t = activeTab();
  if (!t?.webview || t.url === NEW_TAB_URL) return;
  const wv = t.webview;
  // PDF — через печать Chromium: там есть «Сохранить как PDF»
  if (mode === 'pdf') { wv.print(); return; }
  try {
    if (mode === 'full') showNotice('Снимаю всю страницу…');
    if (mode === 'area') showNotice('Выделите область мышью; Esc — отмена');
    const result = mode === 'full' ? await LuchShot.full(wv) : mode === 'area' ? await LuchShot.area(wv) : await LuchShot.visible(wv);
    if (!result) return;
    const blob = result.blob || result;
    await saveShot(blob, t, result.cut);
  } catch (e) {
    showNotice(`Снимок не получился: ${e.message}`);
  }
}

async function saveShot(blob, t, cut) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} в ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`;
  const host = (hostOf(t.url) || 'страница').replace(/[\\/:*?"<>|]/g, '');
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({ url, filename: `Снимок ${host} ${stamp}.png` });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  let copied = false;
  try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); copied = true; } catch {}
  const where = copied ? 'сохранён в «Загрузки» и скопирован' : 'сохранён в «Загрузки»';
  showNotice(cut ? `Снимок ${where}. Страница очень длинная — снят только верх` : `Снимок ${where}`, { done: true });
}

// ---------- Картинка в картинке ----------

// Включает картинку в картинке для самого крупного видео на странице, а если она уже открыта — закрывает.
// Скрипт из Luch считается действием пользователя, поэтому браузер разрешает запрос
function togglePictureInPicture() {
  const t = activeTab();
  if (!t?.webview) return;
  t.webview.executeJavaScript(`(() => {
    if (document.pictureInPictureElement) { document.exitPictureInPicture().catch(() => {}); return 'exit'; }
    const videos = [...document.querySelectorAll('video')].filter(v => v.readyState > 0 && !v.disablePictureInPicture);
    const area = (v) => { const r = v.getBoundingClientRect(); return r.width * r.height; };
    const video = videos.find(v => !v.paused) || videos.sort((a, b) => area(b) - area(a))[0];
    if (!video) return 'none';
    video.requestPictureInPicture().catch(() => {});
    return 'enter';
  })()`).then((r) => {
    if (r === 'none') showNotice('На странице нет видео для картинки в картинке');
  }, () => {});
}

// ---------- Поиск на странице ----------

function openFind() {
  $('findbar').hidden = false;
  $('find-input').focus();
  $('find-input').select();
}
function closeFind() {
  $('findbar').hidden = true;
  $('find-count').textContent = '';
  activeTab()?.webview?.stopFindInPage('clearSelection');
}
function runFind(forward = true, findNext = true) {
  const text = $('find-input').value;
  const wv = activeTab()?.webview;
  if (!wv) return;
  if (!text) { wv.stopFindInPage('clearSelection'); $('find-count').textContent = ''; return; }
  wv.findInPage(text, { forward, findNext });
}
$('find-input').addEventListener('input', () => runFind(true, false));
$('find-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runFind(!e.shiftKey, true);
  if (e.key === 'Escape') closeFind();
});
$('find-next').onclick = () => runFind(true, true);
$('find-prev').onclick = () => runFind(false, true);
$('find-close').onclick = closeFind;

// ---------- Чат с Gemini ----------
// gemini.google.com в отдельной панели: вход обычным Google-аккаунтом, без ключей API

const GEMINI_URL = 'https://gemini.google.com/app';
const gemini = $('gemini');
let geminiReady = null;

function toggleChat(force) {
  const chat = $('chat');
  chat.hidden = force === undefined ? !chat.hidden : !force;
  $('btn-chat').classList.toggle('on', !chat.hidden);
  refitVisible(200);
  if (!chat.hidden) { loadGemini(); syncNotes(); syncPageChip(); }
}

function showPane(name) {
  for (const b of document.querySelectorAll('.seg')) b.classList.toggle('active', b.dataset.pane === name);
  $('pane-ai').hidden = name !== 'ai';
  $('pane-notes').hidden = name !== 'notes';
  if (name === 'ai') loadGemini();
  else syncNotes();
}
for (const b of document.querySelectorAll('.seg')) b.onclick = () => showPane(b.dataset.pane);

function loadGemini() {
  if (!geminiReady) {
    geminiReady = new Promise((resolve) => gemini.addEventListener('did-stop-loading', resolve, { once: true }));
    gemini.src = GEMINI_URL;
  }
  return geminiReady;
}

// Вставляет текст в поле ввода Gemini и, если нужно, отправляет его
const geminiFill = (text, send) => `(() => {
  const ed = document.querySelector('rich-textarea .ql-editor, div.ql-editor[contenteditable], [contenteditable="true"][role="textbox"], textarea');
  if (!ed) return false;
  ed.focus();
  if (ed.tagName === 'TEXTAREA') {
    ed.value = ${JSON.stringify(text)};
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    document.execCommand('selectAll');
    document.execCommand('insertText', false, ${JSON.stringify(text)});
  }
  if (${send}) setTimeout(() => {
    const b = document.querySelector('button.send-button, button[aria-label*="Send" i], button[aria-label*="Отправ" i]');
    if (b && !b.disabled && b.getAttribute('aria-disabled') !== 'true') b.click();
  }, 400);
  return true;
})()`;

async function sendToGemini(text, send = true) {
  toggleChat(true);
  showPane('ai');
  await loadGemini();
  for (let i = 0; i < 10; i++) {
    try {
      if (await gemini.executeJavaScript(geminiFill(text, send))) { gemini.focus(); return; }
    } catch {}
    await new Promise(r => setTimeout(r, 700));
  }
  // Поле не нашлось (например, ещё не выполнен вход) — оставляем текст в буфере обмена
  navigator.clipboard.writeText(text);
  alert('Войдите в Gemini в панели чата. Текст запроса скопирован — вставьте его сочетанием ⌘V.');
}

async function pageText(tab) {
  if (!tab?.webview) return '';
  try {
    const text = await tab.webview.executeJavaScript('document.body ? document.body.innerText : ""');
    return String(text).replace(/\n{3,}/g, '\n\n').slice(0, 15000);
  } catch {
    return '';
  }
}

async function withPage(prompt, send) {
  const t = activeTab();
  if (!t || t.url === NEW_TAB_URL) { sendToGemini(prompt, send); return; }
  const text = await pageText(t);
  sendToGemini(`${prompt}\n\nСтраница: «${tabTitle(t)}» (${originalUrl(t.url)})\n\n${text}`, send);
}

function getSkills() { return store.get('skills', DEFAULT_SKILLS); }
function runSkill(skill) { withPage(skill.prompt, true); }

function renderSkillsRow() {
  const row = $('skills-row');
  row.innerHTML = '';
  for (const s of getSkills()) {
    const b = el('button', 'skill', '/' + s.name);
    b.title = s.prompt;
    b.onclick = () => runSkill(s);
    row.appendChild(b);
  }
}

function syncPageChip() {
  if ($('chat').hidden) return;
  const t = activeTab();
  const isNew = !t || t.url === NEW_TAB_URL;
  $('chat-page').hidden = isNew;
  if (isNew) return;
  $('chat-page-title').textContent = tabTitle(t);
  $('chat-page-host').textContent = hostOf(t.url);
  $('chat-page-icon').src = t.favicon || faviconFor(t.url) || '';
}

$('chat-page').onclick = () => withPage('Ответь на мой вопрос по этой странице. Вопрос: ', false);
$('ai-home').onclick = () => { loadGemini(); gemini.loadURL(GEMINI_URL); };
$('chat-close').onclick = () => toggleChat(false);
$('btn-chat').onclick = () => toggleChat();

// ---------- Заметки ----------

function syncNotes() {
  if ($('chat').hidden || $('pane-notes').hidden) return;
  const t = activeTab();
  const isNew = !t || t.url === NEW_TAB_URL;
  $('notes-title').textContent = isNew ? 'Новая вкладка' : tabTitle(t);
  const host = isNew ? '' : hostOf(t.url);
  const notes = $('side-notes');
  if (document.activeElement !== notes || notes.dataset.host !== host) {
    notes.dataset.host = host;
    notes.disabled = !host;
    notes.value = host ? store.get('notes', {})[host] || '' : '';
  }
}
$('side-notes').addEventListener('input', (e) => {
  const host = e.target.dataset.host;
  if (!host) return;
  const notes = store.get('notes', {});
  notes[host] = e.target.value;
  store.set('notes', notes);
});

// ---------- Перевод страниц ----------
// Перевод подменяет текст прямо на странице — вёрстка и вход на сайт сохраняются.
// Переводит Google онлайн (отправляется только текст); без интернета — встроенный перевод macOS.

const TR_DETECT = `(() => {
  const text = (document.body ? document.body.innerText : '').slice(0, 4000);
  const letters = text.match(/\\p{L}/gu) || [];
  const cyr = text.match(/[\\u0400-\\u04FF]/g) || [];
  return { lang: document.documentElement.lang || '', letters: letters.length, cyr: cyr.length };
})()`;

// Собирает ещё не переведённые текстовые узлы страницы и запоминает оригиналы
const TR_COLLECT = `(() => {
  const L = window.__luchTr || (window.__luchTr = { nodes: [], orig: [], applied: [], seen: new WeakSet() });
  const skip = /^(SCRIPT|STYLE|NOSCRIPT|CODE|PRE|TEXTAREA|SVG|KBD|SAMP|VAR)$/;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const t = n.nodeValue.trim();
      if (t.length < 2 || !/\\p{L}/u.test(t) || L.seen.has(n)) return NodeFilter.FILTER_REJECT;
      for (let p = n.parentElement; p; p = p.parentElement) {
        // translate="no" на всей странице (html/body) не учитываем: перевод включил сам пользователь;
        // на отдельных элементах (код, названия) — соблюдаем
        const noTranslate = p.getAttribute('translate') === 'no' && p !== document.documentElement && p !== document.body;
        if (skip.test(p.tagName) || p.isContentEditable || noTranslate) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const out = [];
  // Сайт мог сам вернуть оригинальный текст в уже переведённый узел (перерисовка после загрузки) —
  // такие узлы переводим заново
  L.nodes.forEach((node, i) => {
    if (L.applied[i] !== undefined && node.isConnected && node.nodeValue !== L.applied[i]) {
      L.orig[i] = node.nodeValue;
      L.applied[i] = undefined;
      const t = node.nodeValue.trim();
      if (t.length > 1) out.push({ i, t });
    }
  });
  let n;
  while ((n = walker.nextNode()) && out.length < 3000) {
    L.seen.add(n);
    out.push({ i: L.nodes.length, t: n.nodeValue.trim() });
    L.nodes.push(n);
    L.orig.push(n.nodeValue);
  }
  return out;
})()`;

const trApply = (items) => `(() => {
  const L = window.__luchTr;
  if (!L) return;
  L.shrunk = L.shrunk || new Map();
  const list = ${JSON.stringify(items)};
  // Запоминаем высоту коротких блоков (заголовки, кнопки, меню) до замены текста
  const blocks = new Map();
  for (const { i } of list) {
    const el = L.nodes[i] && L.nodes[i].parentElement;
    if (!el || blocks.has(el) || L.shrunk.has(el)) continue;
    if ((el.textContent || '').length > 140) continue;
    blocks.set(el, el.getBoundingClientRect().height);
  }
  for (const { i, t } of list) {
    const n = L.nodes[i], o = L.orig[i];
    if (n && n.isConnected) { n.nodeValue = o.replace(o.trim(), t); L.applied[i] = n.nodeValue; }
  }
  // Русский текст длиннее английского: если блок вырос и может наехать на соседей,
  // немного уменьшаем шрифт (не больше чем на 25%), пока текст не влезет в прежнюю высоту
  for (const [el, before] of blocks) {
    if (!before) continue;
    let h = el.getBoundingClientRect().height;
    if (h <= before + 2) continue;
    const original = el.style.fontSize;
    const base = parseFloat(getComputedStyle(el).fontSize);
    let size = base;
    while (h > before + 2 && size > base * 0.75) {
      size = Math.max(base * 0.75, size * 0.92);
      el.style.fontSize = size + 'px';
      h = el.getBoundingClientRect().height;
    }
    L.shrunk.set(el, original);
  }
})()`;

const TR_RESTORE = `(() => {
  const L = window.__luchTr;
  if (L) {
    L.nodes.forEach((n, i) => { if (n.isConnected) n.nodeValue = L.orig[i]; });
    if (L.shrunk) L.shrunk.forEach((size, el) => { el.style.fontSize = size; });
  }
  window.__luchTr = null;
})()`;

// Названия языков в двух падежах: «с английского» и «на английский»
const LANG_FROM = {
  en: 'английского', ru: 'русского', uk: 'украинского', kk: 'казахского', de: 'немецкого', fr: 'французского',
  es: 'испанского', it: 'итальянского', pt: 'португальского', zh: 'китайского', ja: 'японского', ko: 'корейского',
  tr: 'турецкого', pl: 'польского', nl: 'нидерландского', ar: 'арабского', hi: 'хинди', th: 'тайского', vi: 'вьетнамского',
  id: 'индонезийского', hr: 'хорватского', lv: 'латышского', lt: 'литовского', et: 'эстонского', cs: 'чешского',
};
const LANG_TO = {
  en: 'английский', ru: 'русский', uk: 'украинский', kk: 'казахский', de: 'немецкий', fr: 'французский',
  es: 'испанский', it: 'итальянский', pt: 'португальский', zh: 'китайский', ja: 'японский', ko: 'корейский',
};
const langFrom = (code) => LANG_FROM[code] || `языка «${code}»`;
const langTo = (code) => LANG_TO[code] || `язык «${code}»`;

// Язык всей страницы: сначала атрибут lang, иначе определяем по большому куску текста
async function pageLanguage(tab) {
  const d = await tab.webview.executeJavaScript(`({ lang: (document.documentElement.lang || '').toLowerCase(), sample: (document.body ? document.body.innerText : '').slice(0, 6000) })`);
  const code = d.lang.split(/[-_]/)[0];
  if (/^[a-z]{2,3}$/.test(code)) return code;
  return window.luch.translateDetect(d.sample, '');
}

function chunk(items) {
  const out = [];
  let cur = [], size = 0;
  for (const it of items) {
    if (cur.length && (cur.length >= 60 || size + it.t.length > 5000)) { out.push(cur); cur = []; size = 0; }
    cur.push(it);
    size += it.t.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

async function needsTranslation(tab) {
  try {
    const d = await tab.webview.executeJavaScript(TR_DETECT);
    const tl = settings().translateTo;
    if (new RegExp('^' + tl + '\\b', 'i').test(d.lang)) return false;
    // Для кириллических языков дополнительно смотрим на долю кириллицы в тексте
    if (['ru', 'uk', 'kk'].includes(tl)) return d.letters > 40 && d.cyr / d.letters < 0.3;
    return d.letters > 40 && Boolean(d.lang);
  } catch {
    return false;
  }
}

// Переводит текст, который ещё не переводили; возвращает false, если перевод невозможен
// Имена на странице: слова с большой буквы посреди предложения (Apple, Watch, Vision, Mac)
// и название сайта из адреса. Пункты меню только из таких слов не переводим
const PAGE_NAMES = `(() => {
  // Слово — название, если посреди предложения оно с большой буквы хотя бы дважды
  // и так пишется чаще, чем со строчной («Watch» у Apple — да, «Home» в меню — нет)
  const cap = new Map(), low = new Map();
  const text = (document.body ? document.body.innerText : '').slice(0, 60000);
  for (const sentence of text.split(/[.!?\\n]+/)) {
    const words = sentence.trim().split(/\\s+/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i].replace(/^[^\\p{L}\\d]+|[^\\p{L}\\d+]+$/gu, '');
      if (!w) continue;
      if (/^\\p{Ll}/u.test(w)) low.set(w, (low.get(w) || 0) + 1);
      else if (i > 0 && /^\\p{Lu}[\\p{L}\\d+-]*$/u.test(w)) cap.set(w, (cap.get(w) || 0) + 1);
    }
  }
  const names = [...cap].filter(([w, n]) => n >= 2 && n > (low.get(w.toLowerCase()) || 0)).map(([w]) => w);
  const host = location.hostname.replace(/^www\\./, '').split('.')[0];
  if (host) names.push(host[0].toUpperCase() + host.slice(1));
  return names;
})()`;

// Слово выглядит как название продукта: iPad, AirPods, M6, 4K
const productLike = (w) => /\p{Ll}\p{Lu}/u.test(w) || /\d/.test(w);
const isShort = (t) => t.length <= 40 && t.split(/\s+/).length <= 4;

function isProtected(text, names) {
  const words = text.split(/\s+/).map(w => w.replace(/^[^\p{L}\d]+|[^\p{L}\d+]+$/gu, '')).filter(Boolean);
  return isShort(text) && words.length > 0 && words.every(w => names.has(w) || productLike(w));
}

// Короткие соседние пункты (меню, кнопки) отправляем одним блоком через перенос строки,
// чтобы переводчик видел смысл: «Home» в меню — «Главная», а не «Дом»
function buildUnits(items) {
  const units = [];
  let group = [];
  const flush = () => {
    if (group.length === 1) units.push({ items: group, text: group[0].t });
    else if (group.length) units.push({ items: group, text: group.map(it => it.t).join('\n') });
    group = [];
  };
  for (const it of items) {
    if (isShort(it.t) && !it.t.includes('\n')) {
      group.push(it);
      if (group.length >= 25) flush();
    } else {
      flush();
      units.push({ items: [it], text: it.t });
    }
  }
  flush();
  return units;
}

async function translateNodes(tab, { auto = false } = {}) {
  const url = tab.url;
  const tl = settings().translateTo;
  if (!tab.trSource || tab.trSourceUrl !== url) {
    tab.trSource = await pageLanguage(tab);
    tab.trSourceUrl = url;
    // В немецком все существительные с большой буквы — там по регистру имена не отличить
    tab.trNames = new Set(tab.trSource === 'de' ? [] : await tab.webview.executeJavaScript(PAGE_NAMES).catch(() => []));
  }
  const source = tab.trSource;
  if (source === tl) return false;
  const names = tab.trNames || new Set();
  const items = (await tab.webview.executeJavaScript(TR_COLLECT)).filter(it => !isProtected(it.t, names));
  const engine = settings().translateEngine;
  const doBatch = async (batch) => {
    if (tab.url !== url || !tab.webview) return false;
    const units = buildUnits(batch);
    const call = () => window.luch.translateTexts(units.map(u => u.text), tl, source, engine);
    let res = await call();
    if (res.error === 'not-installed') {
      // Языковой пакет не скачан: при ручном переводе предлагаем скачать через системный диалог macOS
      if (auto) return false;
      if (!confirm(`Чтобы переводить с ${langFrom(res.source)} на ${langTo(tl)}, macOS нужно один раз скачать языковой пакет. Скачать сейчас?`)) return false;
      showNotice(`Скачивается языковой пакет: ${LANG_TO[res.source] || res.source} → ${langTo(tl)}… Подтвердите загрузку в окне macOS.`);
      const ok = await window.luch.translatePrepare(res.source, tl);
      showNotice(ok ? 'Языковой пакет скачан, переводим страницу' : 'Языковой пакет не скачан', { done: true });
      if (!ok) return false;
      res = await call();
    }
    if (res.error === 'unsupported') {
      if (!auto) alert(`Встроенный перевод macOS пока не умеет переводить с ${langFrom(res.source)} на ${langTo(tl)}.`);
      return false;
    }
    if (res.error) {
      if (!auto) alert('Не удалось перевести страницу: ' + res.error);
      return false;
    }
    // Раскладываем перевод блоков обратно по пунктам; если строки не совпали по числу —
    // переводим такой блок по одному пункту
    const applied = [];
    for (let k = 0; k < units.length; k++) {
      const u = units[k];
      const out = String(res.translations[k] ?? '');
      if (u.items.length === 1) { applied.push({ i: u.items[0].i, t: out }); continue; }
      const parts = out.split('\n');
      if (parts.length === u.items.length) {
        u.items.forEach((it, j) => applied.push({ i: it.i, t: parts[j].trim() || it.t }));
      } else {
        const single = await window.luch.translateTexts(u.items.map(it => it.t), tl, source, engine);
        if (!single.error) u.items.forEach((it, j) => applied.push({ i: it.i, t: single.translations[j] }));
      }
    }
    await tab.webview.executeJavaScript(trApply(applied));
    return true;
  };

  // Первую часть переводим отдельно: если не хватает языкового пакета, вопрос о загрузке будет один.
  // Остальные части онлайн отправляем по 4 одновременно — так длинные страницы переводятся быстрее
  const batches = chunk(items);
  if (!batches.length) return true;
  if (!(await doBatch(batches[0]))) return false;
  const queue = batches.slice(1);
  let ok = true;
  const worker = async () => {
    while (ok && queue.length) {
      if (!(await doBatch(queue.shift()))) ok = false;
    }
  };
  await Promise.all(Array.from({ length: engine === 'online' ? 4 : 1 }, worker));
  return ok;
}

// Сайты, которые пользователь перевёл: их страницы переводятся сами до «Показать оригинал»
const translateHosts = new Set();

async function translateTab(tab, { auto = false } = {}) {
  if (!tab?.webview || !/^https?:/.test(tab.url) || tab.translating) return;
  tab.translating = true;
  syncTranslate();
  try {
    if (await translateNodes(tab, { auto })) {
      tab.translated = true;
      translateHosts.add(hostOf(tab.url));
      // Сайты подгружают текст по ходу прокрутки — переводим новые куски
      clearInterval(tab.trTimer);
      tab.trTimer = setInterval(() => {
        if (!tab.translated || !tab.webview || tab.translating) return;
        tab.translating = true;
        translateNodes(tab, { auto: true }).catch(() => {}).finally(() => { tab.translating = false; });
      }, 1500);
    }
  } catch {}
  tab.translating = false;
  syncTranslate();
}

function stopTranslation(tab) {
  clearInterval(tab.trTimer);
  tab.trTimer = null;
  tab.translated = false;
}

async function restoreTab(tab) {
  stopTranslation(tab);
  translateHosts.delete(hostOf(tab.url));
  try { await tab.webview.executeJavaScript(TR_RESTORE); } catch {}
  tab.showOriginal = tab.url;
  syncTranslate();
}

function toggleTranslate(tab = activeTab()) {
  if (!tab?.webview || tab.url === NEW_TAB_URL) return;
  if (tab.translated) restoreTab(tab);
  else translateTab(tab);
}

function syncTranslate() {
  const t = activeTab();
  const btn = $('btn-translate');
  btn.disabled = !t || !/^https?:/.test(t.url);
  btn.classList.toggle('on', Boolean(t?.translated));
  btn.classList.toggle('busy', Boolean(t?.translating));
  btn.title = t?.translating ? 'Перевожу…' : t?.translated ? 'Показать оригинал' : 'Перевести страницу (⌘⇧Y)';
}

async function autoTranslate(tab) {
  if (!tab.webview || !/^https?:/.test(tab.url)) return;
  if (tab.translated || tab.translating || tab.showOriginal === tab.url) return;
  const siteOn = translateHosts.has(hostOf(tab.url));
  if (!siteOn && !store.get('autoTranslate', false)) return;
  if (await needsTranslation(tab)) translateTab(tab, { auto: true });
}

$('btn-translate').onclick = () => toggleTranslate();
$('btn-translate').addEventListener('contextmenu', async (e) => {
  e.preventDefault();
  const on = store.get('autoTranslate', false);
  const choice = await window.luch.menu([
    { id: 'now', label: activeTab()?.translated ? 'Показать оригинал' : 'Перевести эту страницу' },
    { type: 'separator' },
    { id: 'auto', label: 'Переводить автоматически', checked: on },
  ]);
  if (choice === 'now') toggleTranslate();
  else if (choice === 'auto') {
    store.set('autoTranslate', !on);
    if (!on) autoTranslate(activeTab());
  }
});

// ---------- Разделённый экран ----------

function splitWith(otherId) {
  const cur = activeTab();
  if (!cur || otherId === activeId) return;
  split = { a: activeId, b: otherId };
  activateTab(otherId);
}

function splitNew(url = NEW_TAB_URL) {
  const cur = activeTab();
  if (!cur) return;
  const b = createTab(url, { activate: false, after: cur.pinnedId ? null : cur, spaceId: cur.spaceId });
  split = { a: cur.id, b: b.id };
  activateTab(b.id);
  if (url === NEW_TAB_URL) openCommandBar('all', { text: '' });
}

function unsplit() {
  split = null;
  layoutViews();
  renderTabs();
}

function splitFocus() {
  if (!split || (split.a !== activeId && split.b !== activeId)) return;
  activateTab(activeId === split.a ? split.b : split.a);
}

// ---------- Автоскрытие колонки ----------

let peekTimer = null;
function applyAutohide() {
  document.body.classList.toggle('autohide', settings().autohide);
  document.body.classList.remove('peek');
}
$('hot-zone').addEventListener('mouseenter', () => { clearTimeout(peekTimer); document.body.classList.add('peek'); });
$('tabbar').addEventListener('mouseenter', () => clearTimeout(peekTimer));
$('tabbar').addEventListener('mouseleave', () => {
  if (!document.body.classList.contains('autohide')) return;
  peekTimer = setTimeout(() => {
    if (!document.querySelector('.popover:not([hidden])')) document.body.classList.remove('peek');
  }, 300);
});

// ---------- Автоочистка вкладок ----------

setInterval(() => {
  const hours = Number(settings().cleanupHours);
  if (!hours) return;
  const limit = Date.now() - hours * 3600e3;
  for (const t of tabs.slice()) {
    if (t.pinnedId || t.id === activeId || t.lastUsed > limit) continue;
    if (split && (split.a === t.id || split.b === t.id)) continue;
    closeTab(t.id);
  }
}, 10 * 60e3);

// ---------- Настройки ----------

const SECTION_TITLES = {
  general: 'Основные', tabs: 'Вкладки', privacy: 'Конфиденциальность', spaces: 'Пространства',
  extensions: 'Расширения', skills: 'Скиллы Gemini', translate: 'Перевод', dns: 'DNS', passwords: 'Пароли Apple',
  shortcuts: 'Сочетания клавиш', import: 'Импорт', data: 'Данные',
};

async function openSettings(section = 'general') {
  const s = settings();
  $('set-search').value = s.search;
  $('set-theme').value = s.theme;
  $('set-restore').checked = s.restore;
  $('set-auto-update').checked = s.autoUpdate;
  $('set-version').textContent = LUCH_VERSION;
  $('set-new-top').checked = s.newTabsTop;
  $('set-auto-fit').checked = s.autoFit;
  $('set-autohide').checked = s.autohide;
  $('set-cmd-groups').checked = s.cmdClickGroups;
  $('set-cleanup').value = String(s.cleanupHours);
  $('set-translate-to').value = s.translateTo;
  $('set-translate-engine').value = s.translateEngine;
  $('set-auto-translate').checked = store.get('autoTranslate', false);
  const prefs = await window.luch.prefs();
  $('set-block-ads').checked = prefs.blockAds;
  $('set-block-trackers').checked = prefs.blockTrackers;
  $('set-block-cookies').checked = prefs.blockCookieBanners;
  renderSettingsPins();
  renderSettingsSpaces();
  renderSettingsSkills();
  renderShortcuts();
  loadDnsSettings();
  showSection(section);
  $('settings').hidden = false;
}

function showSection(name) {
  for (const b of document.querySelectorAll('.settings-nav button')) b.classList.toggle('active', b.dataset.section === name);
  for (const s of document.querySelectorAll('.settings-main section')) s.hidden = s.dataset.section !== name;
  $('settings-title').textContent = SECTION_TITLES[name];
  if (name === 'extensions') renderSettingsExtensions();
  if (name === 'passwords') loadPasswordsSettings();
}
for (const b of document.querySelectorAll('.settings-nav button')) b.onclick = () => showSection(b.dataset.section);

function listRow(iconUrl, name, sub, actions) {
  const row = el('div', 'list-row');
  if (iconUrl) { const img = el('img'); img.src = iconUrl; row.appendChild(img); }
  const n = el('div', 'name', name + ' ');
  if (sub) n.appendChild(el('span', 'sub', sub));
  row.appendChild(n);
  for (const [label, fn, cls] of actions) {
    const b = el('button', 'pill' + (cls ? ' ' + cls : ''), label);
    b.onclick = fn;
    row.appendChild(b);
  }
  return row;
}

function renderSettingsPins() {
  const box = $('set-pins');
  box.innerHTML = '';
  for (const p of getPins()) {
    box.appendChild(listRow(faviconFor(p.url), p.title, hostOf(p.url), [['Убрать', () => { toggleFavorite(p.url); renderSettingsPins(); }]]));
  }
  if (!box.children.length) box.appendChild(el('p', 'note', 'Пока ничего нет'));
}

function renderSettingsSpaces() {
  const box = $('set-spaces');
  box.innerHTML = '';
  for (const s of spaces) {
    const row = listRow(null, s.name, s.id === currentSpace ? 'текущее' : '', [
      ['Тема', () => { closeSettings(); if (s.id !== currentSpace) setSpace(s.id); openSpaceEditor(s.id, $('space-btn'), { focusTheme: true }); }],
      ['Изменить', () => { closeSettings(); openSpaceEditor(s.id); }],
    ]);
    const dot = el('span', 'dot');
    dot.style.background = spaceColor(s);
    row.prepend(dot);
    box.appendChild(row);
  }
}

function renderSettingsSkills() {
  const box = $('set-skills');
  box.innerHTML = '';
  const skills = getSkills();
  const save = () => { store.set('skills', skills); renderSkillsRow(); };
  for (const s of skills) {
    const wrap = el('div', 'skill-edit');
    const top = el('div', 'row-top');
    const name = el('input');
    name.value = s.name;
    name.placeholder = 'Название';
    name.oninput = () => { s.name = name.value.trim() || 'Скилл'; save(); };
    const del = el('button', 'pill danger', 'Удалить');
    del.onclick = () => { skills.splice(skills.indexOf(s), 1); save(); renderSettingsSkills(); };
    top.append(el('span', null, '/'), name, del);
    const prompt = el('textarea');
    prompt.value = s.prompt;
    prompt.placeholder = 'Что должен сделать Gemini с открытой страницей';
    prompt.oninput = () => { s.prompt = prompt.value; save(); };
    wrap.append(top, prompt);
    box.appendChild(wrap);
  }
}
$('set-skill-add').onclick = () => {
  const skills = getSkills();
  skills.push({ id: uid('s'), name: 'Новый скилл', prompt: '' });
  store.set('skills', skills);
  renderSettingsSkills();
  renderSkillsRow();
};

async function renderSettingsExtensions() {
  const box = $('set-extensions');
  box.innerHTML = '';
  const list = await window.luch.extensions();
  for (const x of list) {
    box.appendChild(listRow(null, x.name, 'версия ' + x.version, [
      ['Удалить', async () => {
        if (!confirm(`Удалить расширение «${x.name}»?`)) return;
        await window.luch.uninstallExtension(x.id);
        renderSettingsExtensions();
      }, 'danger'],
    ]));
  }
  if (!list.length) box.appendChild(el('p', 'note', 'Расширения пока не установлены.'));
}
// ---------- DNS ----------
// Защищённый DNS (DNS-over-HTTPS) — общая настройка Chromium: меняем её через settingsPrivate

const DNS_PRESETS = {
  cloudflare: 'https://chrome.cloudflare-dns.com/dns-query',
  google: 'https://dns.google/dns-query{?dns}',
  quad9: 'https://dns.quad9.net/dns-query',
  adguard: 'https://dns.adguard-dns.com/dns-query',
  yandex: 'https://common.dot.dns.yandex.net/dns-query',
  comss: 'https://dns.comss.one/dns-query',
};

function dnsStatus(text, error = false) {
  $('set-dns-status').textContent = text;
  $('set-dns-status').classList.toggle('error', error);
}

async function loadDnsSettings() {
  if (!chrome.settingsPrivate) {
    $('set-dns-mode').disabled = true;
    dnsStatus('Настройка DNS доступна только в Luch на Chromium.', true);
    return;
  }
  const [mode, templates] = await Promise.all([
    chrome.settingsPrivate.getPref('dns_over_https.mode'),
    chrome.settingsPrivate.getPref('dns_over_https.templates'),
  ]);
  const tpl = String(templates.value || '').trim();
  let choice = 'system';
  if (mode.value === 'automatic') choice = 'automatic';
  else if (mode.value === 'secure') choice = Object.keys(DNS_PRESETS).find(k => DNS_PRESETS[k] === tpl) || 'custom';
  $('set-dns-mode').value = choice;
  $('set-dns-custom').value = choice === 'custom' ? tpl : '';
  $('set-dns-custom-row').hidden = choice !== 'custom';
  dnsStatus(mode.value === 'secure' ? `Сейчас: ${tpl}` : '');
}

async function saveDns() {
  const choice = $('set-dns-mode').value;
  $('set-dns-custom-row').hidden = choice !== 'custom';
  let mode = 'off', templates = '';
  if (choice === 'automatic') mode = 'automatic';
  else if (DNS_PRESETS[choice]) { mode = 'secure'; templates = DNS_PRESETS[choice]; }
  else if (choice === 'custom') {
    templates = $('set-dns-custom').value.trim();
    if (!templates) { $('set-dns-custom').focus(); dnsStatus('Впишите адрес сервера DNS-over-HTTPS.'); return; }
    if (!templates.split(/\s+/).every(u => /^https:\/\/[^\s/]+\.[^\s/]+\/\S*$/.test(u))) {
      dnsStatus('Адрес должен начинаться с https:// и вести к серверу DNS-over-HTTPS, например https://dns.example.com/dns-query', true);
      return;
    }
    mode = 'secure';
  }
  // Сначала адрес, потом режим: Chromium проверяет, что для режима «secure» адрес задан
  const ok = await chrome.settingsPrivate.setPref('dns_over_https.templates', templates)
    && await chrome.settingsPrivate.setPref('dns_over_https.mode', mode);
  if (!ok) { dnsStatus('Chromium не принял этот адрес. Проверьте, что это сервер DNS-over-HTTPS.', true); return; }
  dnsStatus(mode === 'secure' ? `Сохранено: ${templates}` : mode === 'automatic' ? 'Сохранено' : 'Используется DNS из настроек macOS');
}

$('set-dns-mode').addEventListener('change', saveDns);
$('set-dns-custom').addEventListener('change', saveDns);

// Пароли Apple: подключение к помощнику macOS по шестизначному коду (background.js)
const applePasswords = (op, extra) => chrome.runtime.sendMessage({ type: 'luch:passwords', op, ...extra })
  .then((r) => (r?.ok ? r.result : Promise.reject(new Error(r?.error || 'Фоновая часть Luch не ответила'))));

function passwordsView(state, text, error = false) {
  $('set-pw-status').textContent = text;
  $('set-pw-status').classList.toggle('error', error);
  $('set-pw-connect-row').hidden = state !== 'connect';
  $('set-pw-pin-row').hidden = state !== 'pin';
  $('set-pw-disconnect-row').hidden = state !== 'paired';
}

async function loadPasswordsSettings() {
  passwordsView('', 'Проверяю…');
  try {
    const s = await applePasswords('status');
    if (!s.available) passwordsView('', `Помощник паролей Apple недоступен: ${s.error}`, true);
    else if (s.paired) passwordsView('paired', 'Подключено. Входы появляются под полями логина и пароля на сайтах.');
    else passwordsView('connect', 'Не подключено.');
  } catch (e) {
    passwordsView('', e.message, true);
  }
}

$('set-pw-connect').onclick = async () => {
  passwordsView('', 'Жду окно macOS с кодом…');
  try {
    await applePasswords('request-pin');
    $('set-pw-pin').value = '';
    passwordsView('pin', 'Введите шестизначный код из окна macOS.');
    $('set-pw-pin').focus();
  } catch (e) {
    passwordsView('connect', e.message, true);
  }
};

$('set-pw-pin').addEventListener('input', async () => {
  const pin = $('set-pw-pin').value.replace(/\D/g, '');
  $('set-pw-pin').value = pin;
  if (pin.length !== 6) return;
  passwordsView('', 'Проверяю код…');
  try {
    await applePasswords('confirm-pin', { pin });
    passwordsView('paired', 'Подключено. Входы появляются под полями логина и пароля на сайтах.');
  } catch (e) {
    passwordsView('connect', e.message, true);
  }
});

$('set-pw-disconnect').onclick = async () => {
  await applePasswords('forget').catch(() => {});
  loadPasswordsSettings();
};

$('set-open-store').onclick = () => { closeSettings(); createTab('https://chromewebstore.google.com/'); };

const SHORTCUTS = [
  ['Командная строка', '⌘L'], ['Новая вкладка', '⌘T'], ['Закрыть вкладку', '⌘W'], ['Вернуть закрытую вкладку', '⇧⌘T'],
  ['Поиск по вкладкам', '⇧⌘A'], ['Закрепить вкладку', '⌘D'], ['Новая группа с вкладкой', '⌥⌘N'], ['Очистить вкладки', '⇧⌘K'],
  ['Чат с Gemini', '⌘E'], ['Перевести страницу', '⇧⌘Y'], ['Снимок страницы', '⇧⌘S'], ['Картинка в картинке', '⌥⌘P'], ['Показать или скрыть вкладки', '⌘S'], ['Автоскрытие вкладок', '⌥⌘S'],
  ['Разделить экран', '⌥⌘='], ['Переключить панель', '⌥⌘] / ⌥⌘['], ['Убрать разделение', '⌥⌘−'],
  ['Масштаб: больше / меньше / 100%', '⌘+ / ⌘− / ⌘0 (или ⌃)'],
  ['Копировать адрес', '⇧⌘C'], ['Копировать как Markdown', '⌥⇧⌘C'], ['Найти на странице', '⌘F'],
  ['История', '⌘Y'], ['Загрузки', '⌥⌘L'], ['Окно инкогнито', '⇧⌘N'], ['Пространство 1…9', '⌃1…⌃9'], ['Вкладка 1…9', '⌘1…⌘9'],
];
function renderShortcuts() {
  const box = $('set-shortcuts');
  box.innerHTML = '';
  for (const [name, keys] of SHORTCUTS) {
    const row = el('div', 'sc-row');
    row.append(el('span', null, name), el('kbd', null, keys));
    box.appendChild(row);
  }
}

$('set-search').onchange = (e) => setSetting('search', e.target.value);
$('set-theme').onchange = (e) => { setSetting('theme', e.target.value); applySpaceTheme(); };
$('set-restore').onchange = (e) => setSetting('restore', e.target.checked);
$('set-auto-update').onchange = (e) => setSetting('autoUpdate', e.target.checked);

// ---------- Обновления Luch ----------
// Новая версия — последний релиз на GitHub. Образ скачивают загрузки Chromium, а ставит помощник
// Luch (native/importer.swift): сверяет SHA-256 из релиза, меняет приложение и перезапускает Luch
const LUCH_VERSION = chrome.runtime.getManifest().version_name || chrome.runtime.getManifest().version;
const RELEASES_API = 'https://api.github.com/repos/rutra0art/luch/releases/latest';
const RELEASE_FILES = 'https://github.com/rutra0art/luch/releases/download/';
let pendingUpdate = null; // { version, url, sha256, name }

function isNewer(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

function updateStatus(text, error = false) {
  $('set-update-status').textContent = text;
  $('set-update-status').classList.toggle('error', error);
}

async function checkForUpdate() {
  const r = await fetch(RELEASES_API, { headers: { accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`GitHub ответил ${r.status}`);
  const release = await r.json();
  const version = String(release.tag_name || '').replace(/^v/, '');
  const asset = (release.assets || []).find(a => /arm64\.dmg$/.test(a.name) && a.browser_download_url?.startsWith(RELEASE_FILES));
  const sha256 = /^sha256:([0-9a-f]{64})$/.exec(asset?.digest || '')?.[1];
  pendingUpdate = isNewer(version, LUCH_VERSION) && asset && sha256
    ? { version, url: asset.browser_download_url, sha256, name: asset.name } : null;
  $('update-badge').hidden = !pendingUpdate;
  if (pendingUpdate) $('update-badge').textContent = `Обновить Luch до ${version}`;
  $('set-update-row').hidden = !pendingUpdate;
  return pendingUpdate;
}

function waitForDownload(id) {
  return new Promise((resolve, reject) => {
    const done = () => chrome.downloads.onChanged.removeListener(onChange);
    const check = async () => {
      const [d] = await chrome.downloads.search({ id });
      if (d?.state === 'complete') { done(); resolve(d); }
      else if (d?.state === 'interrupted') { done(); reject(new Error('Загрузка прервалась')); }
    };
    const onChange = (delta) => { if (delta.id === id) check(); };
    chrome.downloads.onChanged.addListener(onChange);
    check();
  });
}

function installWithHelper(dmg, sha256) {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connectNative('org.luch.importer');
    port.onMessage.addListener((m) => {
      if (m.type === 'update') resolve();
      else if (m.type === 'error') reject(new Error(m.message));
    });
    port.onDisconnect.addListener(() => reject(new Error(chrome.runtime.lastError?.message || 'Помощник Luch завершился')));
    port.postMessage({ cmd: 'update', dmg, sha256 });
  });
}

async function installUpdate() {
  const u = pendingUpdate;
  if (!u) return;
  $('set-update-install').disabled = true;
  try {
    updateStatus(`Скачиваю Luch ${u.version}…`);
    const id = await chrome.downloads.download({ url: u.url, filename: `Luch-update/${u.name}`, conflictAction: 'overwrite', saveAs: false });
    const item = await waitForDownload(id);
    updateStatus('Проверяю и устанавливаю…');
    await installWithHelper(item.filename, u.sha256);
    updateStatus('Luch перезапускается — вкладки восстановятся.');
  } catch (e) {
    updateStatus(`Не удалось обновить: ${e.message}`, true);
    $('set-update-install').disabled = false;
  }
}

$('set-update-check').onclick = async () => {
  updateStatus('Проверяю…');
  try {
    const u = await checkForUpdate();
    updateStatus(u ? `Доступна версия ${u.version}. Luch перезапустится, вкладки восстановятся.` : 'У вас последняя версия.');
  } catch (e) {
    updateStatus(`Не удалось проверить: ${e.message}`, true);
  }
};
$('set-update-install').onclick = installUpdate;
$('update-badge').onclick = () => {
  openSettings('general');
  updateStatus(`Доступна версия ${pendingUpdate.version}. Luch перезапустится, вкладки восстановятся.`);
};

// Проверка через минуту после запуска и затем раз в шесть часов
if (!INCOGNITO) {
  const autoCheck = () => { if (settings().autoUpdate) checkForUpdate().catch(() => {}); };
  setTimeout(autoCheck, 60 * 1000);
  setInterval(autoCheck, 6 * 60 * 60 * 1000);
}
$('set-new-top').onchange = (e) => setSetting('newTabsTop', e.target.checked);
$('set-auto-fit').onchange = (e) => { setSetting('autoFit', e.target.checked); for (const t of tabs) if (t.webview) autoFit(t); };
$('set-autohide').onchange = (e) => { setSetting('autohide', e.target.checked); applyAutohide(); };
$('set-cmd-groups').onchange = (e) => setSetting('cmdClickGroups', e.target.checked);
$('set-cleanup').onchange = (e) => setSetting('cleanupHours', Number(e.target.value));
$('set-translate-to').onchange = (e) => setSetting('translateTo', e.target.value);
$('set-translate-engine').onchange = (e) => setSetting('translateEngine', e.target.value);
$('set-auto-translate').onchange = (e) => store.set('autoTranslate', e.target.checked);
$('set-block-ads').onchange = (e) => window.luch.setPrefs({ blockAds: e.target.checked });
$('set-block-trackers').onchange = (e) => window.luch.setPrefs({ blockTrackers: e.target.checked });
$('set-block-cookies').onchange = (e) => window.luch.setPrefs({ blockCookieBanners: e.target.checked });
$('set-space-add').onclick = () => { closeSettings(); openSpaceEditor(null); };


for (const b of document.querySelectorAll('[data-clear]')) {
  b.onclick = async () => {
    const what = b.dataset.clear;
    const ask = {
      cache: 'Очистить кэш страниц?',
      cookies: 'Удалить все cookie? Вы выйдете из всех сайтов во всех пространствах.',
      history: 'Удалить всю историю?',
      notes: 'Удалить все заметки к сайтам?',
    }[what];
    if (!confirm(ask)) return;
    if (what === 'notes') store.set('notes', {});
    else if (what === 'history') store.set('history', []);
    else await window.luch.clearData(what);
    const label = b.textContent;
    b.textContent = 'Готово';
    setTimeout(() => (b.textContent = label), 1500);
  };
}

function closeSettings() { $('settings').hidden = true; }
for (const b of document.querySelectorAll('.sheet-close')) b.onclick = () => (b.closest('.overlay').hidden = true);
for (const o of document.querySelectorAll('.overlay')) o.addEventListener('mousedown', (e) => { if (e.target === o) o.hidden = true; });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  for (const o of document.querySelectorAll('.overlay')) o.hidden = true;
  closePopovers();
});
$('btn-settings').onclick = () => openSettings();
window.luch.version().then(v => { $('set-version').textContent = `Luch ${v.app} · Chromium ${v.chrome}`; });

// ---------- Первое открытие и перенос из других браузеров ----------

const W_WHAT = { bookmarks: 'Закладки', history: 'История', cookies: 'Входы на сайты' };

let welcomeBrowsers = [];

async function showWelcome({ skipIntro = false } = {}) {
  const w = $('welcome');
  closeSettings();
  w.hidden = false;
  w.classList.remove('leaving', 'step2');
  $('w-import').hidden = true;
  $('w-progress').hidden = true;
  // Вступление идёт на весь экран; к импорту переходим только по кнопке «Начать»
  if (!skipIntro) window.luch.setFullscreen(true);
  welcomeBrowsers = await window.luch.importDetect().catch(() => []);
  renderImportBrowsers(welcomeBrowsers);
  if (skipIntro) openImportStep();
}

function openImportStep() {
  $('welcome').classList.add('step2');
  if (welcomeBrowsers.length) $('w-import').hidden = false;
  else finishWelcome();
}

function renderImportBrowsers(browsers) {
  const box = $('w-browsers');
  box.innerHTML = '';
  if (!browsers.length) { box.appendChild(el('div', 'w-empty', 'Других браузеров на этом Mac не найдено.')); return; }
  for (const b of browsers) {
    const row = el('label', 'w-browser on');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.browser = b.id;
    cb.onchange = () => row.classList.toggle('on', cb.checked);
    row.append(cb, el('span', 'w-bname', b.name));
    // Если у браузера несколько профилей — даём выбрать нужный
    const sel = el('select');
    for (const p of b.profiles) { const o = el('option', null, p.name); o.value = p.id; sel.appendChild(o); }
    sel.hidden = b.profiles.length < 2;
    row.appendChild(sel);
    row.dataset.name = b.name;
    box.appendChild(row);
  }
}

function finishWelcome() {
  store.set('onboarded', true);
  window.luch.setFullscreen(false);
  const w = $('welcome');
  w.classList.add('leaving');
  setTimeout(() => { w.hidden = true; w.classList.remove('leaving'); }, 600);
}

async function runImports() {
  const what = { bookmarks: $('w-bookmarks').checked, history: $('w-history').checked, cookies: $('w-cookies').checked };
  const picked = [...$('w-browsers').querySelectorAll('.w-browser')]
    .filter(row => row.querySelector('input').checked)
    .map(row => ({ id: row.querySelector('input').dataset.browser, name: row.dataset.name, profile: row.querySelector('select').value }));
  if (!picked.length || !Object.values(what).some(Boolean)) { finishWelcome(); return; }

  $('w-import').hidden = true;
  $('w-progress').hidden = false;
  $('w-done').hidden = true;
  $('w-progress-title').textContent = 'Переносим данные…';
  const log = $('w-log');
  log.innerHTML = '';
  let total = { history: 0, bookmarks: 0, cookies: 0 };

  // Браузеры переносим по очереди: macOS спрашивает доступ к ключу каждого отдельно
  for (const b of picked) {
    const line = el('div', 'w-line');
    line.append(el('span', 'w-spin'), el('span', null, b.name));
    log.appendChild(line);
    try {
      const r = await window.luch.importRun({ browser: b.id, profile: b.profile, what, partition: partitionFor(currentSpace) });
      mergeImportedHistory(r.history);
      addImportedBookmarks(b.name, r.bookmarks);
      total.history += r.history.length;
      total.bookmarks += r.bookmarks.length;
      total.cookies += r.cookies;
      line.firstChild.replaceWith(el('span', 'w-ok', '✓'));
      const parts = [];
      if (what.bookmarks) parts.push(`закладок: ${r.bookmarks.length}`);
      if (what.history) parts.push(`история: ${r.history.length}`);
      if (what.cookies) parts.push(`входов: ${r.cookies}`);
      line.appendChild(el('span', null, '— ' + parts.join(', ')));
      for (const err of r.errors) line.appendChild(el('span', 'w-err', err));
    } catch (err) {
      line.firstChild.replaceWith(el('span', 'w-err', '✕'));
      line.appendChild(el('span', 'w-err', String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')));
    }
  }
  $('w-progress-title').textContent = 'Готово';
  $('w-done').hidden = false;
  $('w-done').focus();
}

function mergeImportedHistory(items) {
  if (!items?.length) return;
  const seen = new Set();
  const merged = [...getHistory(), ...items]
    .sort((a, b) => b.ts - a.ts)
    .filter(h => !seen.has(h.url) && seen.add(h.url))
    .slice(0, 5000);
  store.set('history', merged);
}

// Закладки каждого браузера ложатся в свою папку среди закреплённых (свёрнутую, чтобы не мешала)
function addImportedBookmarks(browserName, items) {
  if (!items?.length) return;
  const folder = { id: uid('f'), type: 'folder', name: `Закладки · ${browserName}`, open: false, items: [] };
  const seen = new Set();
  for (const b of items) {
    if (seen.has(b.url)) continue;
    seen.add(b.url);
    folder.items.push({ id: uid('p'), type: 'tab', url: b.url, title: b.title });
  }
  pinnedList().push(folder);
  savePinned();
  renderTabs();
}

$('w-go').onclick = runImports;
$('w-skip').onclick = finishWelcome;
$('w-done').onclick = finishWelcome;
$('w-start').onclick = openImportStep;
$('set-import').onclick = () => showWelcome({ skipIntro: true });

// ---------- Кнопки и команды меню ----------

function toggleTabbar() {
  if (settings().autohide) { document.body.classList.toggle('peek'); return; }
  document.body.classList.toggle('collapsed');
  store.set('collapsed', document.body.classList.contains('collapsed'));
  refitVisible(280); // после анимации колонки
}

function openFromPage(url, opts = {}) {
  if (opts.token) { createTab(url, { token: opts.token }); return; }
  if (!opts.background) { createTab(url); return; }
  // ⌘-клик: вкладка открывается в фоне и собирается в группу с исходной
  const opener = opts.openerId ? tabByWc(opts.openerId) : null;
  if (!opener || opener.pinnedId || !settings().cmdClickGroups) {
    createTab(url, { activate: false, after: opener && !opener.pinnedId ? opener : null, spaceId: opener?.spaceId ?? currentSpace });
    return;
  }
  if (!opener.groupId) newGroupWith(opener, tabTitle(opener).slice(0, 24));
  const last = [...tabs].reverse().find(x => x.groupId === opener.groupId) || opener;
  createTab(url, { activate: false, after: last, groupId: opener.groupId, spaceId: opener.spaceId });
}

// Очистка: закрываем все обычные вкладки пространства, закреплённые остаются
function cleanTabs() {
  const list = regularTabs();
  if (!list.length) return;
  split = null;
  for (const t of list) if (t.id !== activeId) closeTab(t.id);
  const t = activeTab();
  if (t && !t.pinnedId) closeTab(t.id);
}

$('btn-collapse').onclick = toggleTabbar;
$('btn-new').onclick = () => createTab();

// ---------- Подгонка ширины сайта под окно ----------
// Некоторые сайты задают минимальную ширину (Chrome Web Store — 1280 px) и не помещаются,
// когда рядом колонка вкладок. В оконном режиме уменьшаем масштаб ровно настолько, чтобы сайт влез.

let isFullscreen = false;
const MIN_FIT = 0.5;

async function autoFit(tab) {
  const wv = tab?.webview;
  if (!wv || !tab.wcId || tab.userZoom || !/^https?:/.test(tab.url)) return;
  const off = !settings().autoFit || isFullscreen;
  if (off) {
    if (tab.fitted) { tab.fitted = false; wv.setZoomFactor(1); }
    return;
  }
  const avail = wv.clientWidth;
  if (!avail) return;
  const measure = () => wv.executeJavaScript('({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth })');
  let size;
  try {
    // Страница уже уменьшена, а нужная ей ширина неизвестна — на мгновение возвращаем 100% и меряем
    if (!tab.minWidth && wv.getZoomFactor() < 0.99) {
      wv.setZoomFactor(1);
      await new Promise(r => setTimeout(r, 120));
    }
    size = await measure();
  } catch { return; }
  // Ширина, которая нужна сайту в CSS-пикселях; запоминаем максимум, чтобы при расширении окна вернуть масштаб
  if (size.s > size.c + 2) tab.minWidth = Math.max(tab.minWidth || 0, size.s);
  if (!tab.minWidth) {
    if (tab.fitted) { tab.fitted = false; wv.setZoomFactor(1); }
    return;
  }
  const factor = Math.max(MIN_FIT, Math.min(1, avail / tab.minWidth));
  if (Math.abs(factor - wv.getZoomFactor()) < 0.01) return;
  tab.fitted = factor < 1;
  wv.setZoomFactor(factor);
}

// Перепроверяем видимые вкладки, когда меняется место под страницу (окно, колонка, чат, разделение)
let fitTimer = null;
function refitVisible(delay = 150) {
  clearTimeout(fitTimer);
  fitTimer = setTimeout(() => {
    for (const t of tabs) if (t.webview && !t.webview.classList.contains('hidden')) autoFit(t);
  }, delay);
}
new ResizeObserver(() => refitVisible()).observe(viewsEl);
window.addEventListener('resize', () => refitVisible());

// Плашка справа сверху: висит, пока идёт долгое действие, и гаснет после него
let noticeTimer = null;
function showNotice(text, { done = false } = {}) {
  const el = $('notice');
  $('notice-text').textContent = text;
  el.classList.toggle('done', done);
  el.hidden = false;
  clearTimeout(noticeTimer);
  if (done) noticeTimer = setTimeout(() => (el.hidden = true), 3000);
}

let zoomToastTimer = null;
function showZoomToast(percent) {
  const el = $('zoom-toast');
  el.textContent = percent + '%';
  el.hidden = false;
  clearTimeout(zoomToastTimer);
  zoomToastTimer = setTimeout(() => (el.hidden = true), 1200);
}

// Открытые закреплённые вкладки по порядку — для переключения ⌥⌘↑/↓
function pinnedOrder() {
  return pinnedList().flatMap(x => x.type === 'folder' ? x.items : [x]).map(it => liveTabFor(it.id)).filter(Boolean);
}

const commands = {
  'new-tab': () => createTab(),
  'open-url': (url, opts = {}) => openFromPage(url, opts),
  'open-split': (url) => splitNew(url),
  'close-tab': () => {
    const t = activeTab();
    // Закреплённую вкладку ⌘W выгружает, но не открепляет
    if (t) closeTab(t.id, { remember: !t.pinnedId });
  },
  'reopen-tab': () => {
    const item = closedStack.pop();
    if (item) createTab(item.url, { spaceId: spaces.some(s => s.id === item.spaceId) ? item.spaceId : currentSpace });
  },
  'command-bar': () => openCommandBar(),
  'search-tabs': () => openCommandBar('tabs'),
  'toggle-chat': () => toggleChat(),
  'clean-tabs': cleanTabs,
  'print': () => activeTab()?.webview?.print(),
  'copy-url': () => { const t = activeTab(); if (t && t.url !== NEW_TAB_URL) navigator.clipboard.writeText(originalUrl(t.url)); },
  'copy-url-md': () => { const t = activeTab(); if (t && t.url !== NEW_TAB_URL) navigator.clipboard.writeText(`[${tabTitle(t)}](${originalUrl(t.url)})`); },
  'find': openFind,
  'reload': () => activeTab()?.webview?.reload(),
  'hard-reload': () => activeTab()?.webview?.reloadIgnoringCache(),
  'toggle-tabbar': toggleTabbar,
  'toggle-autohide': () => { setSetting('autohide', !settings().autohide); applyAutohide(); },
  'split': () => {
    if (split && (split.a === activeId || split.b === activeId)) splitFocus();
    else splitNew();
  },
  'split-focus': () => splitFocus(),
  'unsplit': unsplit,
  'translate': () => toggleTranslate(),
  'zoom': (delta) => {
    const wv = activeTab()?.webview;
    if (!wv) return;
    // Уровень 0 = 100%; шаг 0.5 ≈ 10%. Ограничиваем от 25% до 500%, как в Chrome
    const level = delta === 0 ? 0 : Math.max(-7.5, Math.min(8.8, wv.getZoomLevel() + delta));
    const t = activeTab();
    // Ручной масштаб важнее подгонки; ⌘0 возвращает автоматический режим
    t.userZoom = delta !== 0;
    wv.setZoomLevel(level);
    showZoomToast(Math.round(Math.pow(1.2, level) * 100));
    if (delta === 0) { t.fitted = false; autoFit(t); }
  },
  'devtools': () => activeTab()?.webview?.openDevTools(),
  'back': () => activeTab()?.webview?.goBack(),
  'forward': () => activeTab()?.webview?.goForward(),
  'next-tab': (dir) => {
    const list = [...pinnedOrder(), ...regularTabs()];
    if (!list.length) return;
    const idx = list.findIndex(t => t.id === activeId);
    activateTab(list[(idx + dir + list.length) % list.length].id);
  },
  'select-tab': (i) => {
    const list = regularTabs();
    const t = i === 8 ? list[list.length - 1] : list[i];
    if (t) activateTab(t.id);
  },
  'pin-tab': () => pinTab(activeTab()),
  'duplicate-tab': () => { const t = activeTab(); if (t && t.url !== NEW_TAB_URL) createTab(t.url, { after: t.pinnedId ? null : t, groupId: t.groupId }); },
  'new-group': () => newGroup(),
  'import': () => showWelcome({ skipIntro: true }),
  'group-tab': () => { const t = activeTab(); if (t && !t.pinnedId) renameGroupLater(newGroupWith(t)); },
  'rename-tab': () => { const t = activeTab(); if (t) renameTab(t); },
  'mute-tab': () => { const t = activeTab(); if (t) toggleMute(t); },
  'history': openHistory,
  'downloads': () => { if (settings().autohide) document.body.classList.add('peek'); openDownloads(); },
  'settings': (section) => openSettings(typeof section === 'string' ? section : 'general'),
  'fullscreen': (on) => {
    isFullscreen = on;
    for (const t of tabs) if (t.webview) autoFit(t);
  },
  'select-space': (i) => { if (spaces[i]) setSpace(spaces[i].id); },
  'select-webcontents': (wcId) => { const t = tabByWc(wcId); if (t) activateTab(t.id); },
  'close-webcontents': (wcId) => { const t = tabByWc(wcId); if (t) closeTab(t.id); },
  'ask-selection': (text) => withPage(`Объясни коротко этот фрагмент со страницы: «${text}»`, true),
  'screenshot': (mode) => (typeof mode === 'string' ? takeScreenshot(mode) : openShotMenu()),
  'pip': () => togglePictureInPicture(),
};
window.luch.onCommand((cmd, ...args) => commands[cmd]?.(...args));

// ---------- Запуск ----------

if (INCOGNITO) {
  document.body.classList.add('incognito');
  $('incognito-badge').hidden = false;
  $('btn-add-space').hidden = true;
}
if (store.get('collapsed', false)) document.body.classList.add('collapsed');
applyAutohide();
window.luch.setTheme(settings().theme);
// Тема пространства в режиме «авто» следует за системой
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applySpaceTheme);
renderSpaces();
renderSkillsRow();
syncExtensions();
if (!INCOGNITO && settings().restore) {
  // Вкладки прошлого сеанса восстанавливаются выгруженными и загружаются при открытии
  const known = new Set(groups.map(g => g.id));
  const restored = store.get('session', []).map(s => ({
    id: nextId++, webview: null, wcId: null, url: s.url, title: s.title || hostOf(s.url),
    spaceId: spaces.some(x => x.id === s.spaceId) ? s.spaceId : currentSpace,
    groupId: known.has(s.groupId) ? s.groupId : null, pinnedId: null, customTitle: s.customTitle || null,
    favicon: null, loading: false, lastUsed: Date.now(), muted: false, audible: false,
  }));
  tabs.push(...restored);
} else if (!INCOGNITO) {
  store.set('session', []);
}
cleanupGroups();
trimFavorites();
setSpace(currentSpace);
if (!INCOGNITO && !store.get('onboarded', false)) showWelcome();
