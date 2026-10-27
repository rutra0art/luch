'use strict';

const NEW_TAB_URL = new URL('newtab.html', location.href).href;
const INCOGNITO = new URLSearchParams(location.search).has('incognito');
const SEARCH_ENGINES = {
  google: { url: 'https://www.google.com/search?q=', name: 'Google' },
  yandex: { url: 'https://yandex.ru/search/?text=', name: 'Яндекс' },
  duckduckgo: { url: 'https://duckduckgo.com/?q=', name: 'DuckDuckGo' },
  bing: { url: 'https://www.bing.com/search?q=', name: 'Bing' },
};
const DEFAULT_SETTINGS = {
  search: 'google', theme: 'system', restore: true, translateTo: 'ru',
  newTabsTop: true, autohide: false, cmdClickGroups: true, cleanupHours: 0,
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
  if (/^[a-z-]+:/i.test(text) && looksLikeUrl(text)) return text;
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

let spaces = INCOGNITO
  ? [{ id: 1, name: 'Инкогнито', color: '#b18cff' }]
  : store.get('spaces', [{ id: 1, name: 'Пространство', color: SPACE_COLORS[1] }]);
let currentSpace = INCOGNITO ? 1 : store.get('space', spaces[0].id);
if (!spaces.some(s => s.id === currentSpace)) currentSpace = spaces[0].id;
const lastActive = {};

let pinnedData = store.get('pinned', {});
let groups = store.get('groups', []);

// У каждого пространства своя сессия: отдельные cookie, входы и хранилище сайтов
function partitionFor(spaceId) {
  if (INCOGNITO) return 'incognito';
  return spaceId === 1 ? '' : `persist:space-${spaceId}`;
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
    store.set('session', tabs
      .filter(t => !t.pinnedId && t.url !== NEW_TAB_URL)
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
  wv.setAttribute('src', tab.url);
  wv.classList.add('hidden');
  tab.webview = wv;
  tab.loading = true;
  bindWebview(tab, token);
  viewsEl.appendChild(wv);
  return wv;
}

function bindWebview(tab, token) {
  const wv = tab.webview;
  const update = () => {
    renderTabs();
    if (tab.id === activeId) syncChrome();
  };

  wv.addEventListener('did-attach', () => {
    tab.wcId = wv.getWebContentsId();
    if (token) window.luch.tabCreated(token, tab.wcId);
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
    update();
  });
  // Стадии загрузки двигают линию и блик под адресом
  wv.addEventListener('did-start-navigation', (e) => { if (e.isMainFrame && tab.id === activeId) bumpProgress(0.25); });
  wv.addEventListener('dom-ready', () => { if (tab.id === activeId) bumpProgress(0.75); });
  wv.addEventListener('did-frame-finish-load', (e) => { if (!e.isMainFrame && tab.id === activeId) bumpProgress(progress + 0.03); });
  wv.addEventListener('did-navigate', (e) => {
    if (tab.id === activeId) bumpProgress(0.5);
    tab.url = e.url;
    tab.favicon = null;
    if (tab.showOriginal !== e.url) tab.showOriginal = null;
    addHistory(tab.url, tab.title);
    update();
    persist();
  });
  wv.addEventListener('did-navigate-in-page', (e) => {
    if (!e.isMainFrame) return;
    tab.url = e.url;
    addHistory(tab.url, tab.title);
    update();
    persist();
  });
  wv.addEventListener('page-title-updated', (e) => {
    tab.title = e.title;
    updateHistoryTitle(tab.url, e.title);
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

  row.addEventListener('mousedown', (e) => { if (e.button === 0) activateTab(t.id); });
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
      { id: 'rename', label: 'Переименовать группу' },
      { label: 'Цвет', submenu: SPACE_COLORS.map((c, i) => ({ id: 'color:' + c, label: COLOR_NAMES[i], checked: g.color === c })) },
      { type: 'separator' },
      { id: 'ungroup', label: 'Разгруппировать' },
      { id: 'close', label: 'Закрыть все вкладки группы' },
    ]);
    if (choice === 'rename') renameGroup(g, head);
    else if (choice?.startsWith('color:')) { g.color = choice.slice(6); saveGroups(); renderTabs(); }
    else if (choice === 'ungroup') { items.forEach(t => (t.groupId = null)); cleanupGroups(); renderTabs(); persist(); }
    else if (choice === 'close') items.slice().forEach(t => closeTab(t.id));
  });
  bindDrop(head, (data) => {
    if (data.kind === 'tab') moveTabToGroup(data.id, g.id);
    else if (data.kind === 'pinned') unpinToRegular(data.id, g.id);
  });
  const list = el('div', 'group-items' + (g.open ? '' : ' closed'));
  list.style.setProperty('--gcolor', g.color);
  items.forEach(t => list.appendChild(buildTabRow(t)));
  box.append(head, list);
  return box;
}

function cleanupGroups() {
  const used = new Set(tabs.map(t => t.groupId).filter(Boolean));
  const before = groups.length;
  groups = groups.filter(g => used.has(g.id));
  if (groups.length !== before) saveGroups();
}

function newGroupWith(tab, name) {
  const g = {
    id: uid('g'),
    name: name || `Группа ${groups.filter(x => x.spaceId === tab.spaceId).length + 1}`,
    color: SPACE_COLORS[groups.length % SPACE_COLORS.length],
    open: true,
    spaceId: tab.spaceId,
  };
  groups.push(g);
  tab.groupId = g.id;
  saveGroups();
  persist();
  renderTabs();
  return g;
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
  row.addEventListener('mousedown', (e) => { if (e.button === 0) openPinned(item); });
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

pinnedEl.addEventListener('contextmenu', async (e) => {
  if (e.target !== pinnedEl) return;
  e.preventDefault();
  if (await window.luch.menu([{ id: 'new', label: 'Новая папка' }]) === 'new') newFolder();
});

// ---------- Перетаскивание ----------

let dragData = null;
function bindDrag(row, data) {
  row.addEventListener('dragstart', (e) => {
    dragData = data;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    row.classList.add('dragging');
  });
  row.addEventListener('dragend', () => { row.classList.remove('dragging'); dragData = null; });
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

function bindDrop(target, onDrop) {
  target.addEventListener('dragover', (e) => { if (dragData) { e.preventDefault(); e.stopPropagation(); target.classList.add('drop-target'); } });
  target.addEventListener('dragleave', () => target.classList.remove('drop-target'));
  target.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    target.classList.remove('drop-target');
    if (dragData) onDrop(dragData);
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

function toggleFavorite(url, title) {
  const host = hostOf(url);
  let pins = getPins();
  if (pins.some(p => hostOf(p.url) === host)) pins = pins.filter(p => hostOf(p.url) !== host);
  else pins.push({ url: originalUrl(url), title: title || host });
  store.set('pins', pins);
  renderPins();
  syncChrome();
}

// ---------- Пространства (профили) ----------

function spaceColor(s) { return s.color || SPACE_COLORS[(s.id - 1) % SPACE_COLORS.length]; }

function setSpace(id, { activate = true } = {}) {
  currentSpace = id;
  saveSpaces();
  renderSpaces();
  syncExtensions();
  if (!activate) return;
  const list = spaceTabs();
  const target = list.find(t => t.id === lastActive[id]) || list.find(t => !t.pinnedId) || list.find(t => t.webview);
  if (target) activateTab(target.id);
  else createTab();
}

function renderSpaces() {
  $('space-btn').textContent = spaces.find(s => s.id === currentSpace).name;
  const box = $('spaces');
  box.innerHTML = '';
  if (INCOGNITO) return;
  for (const s of spaces) {
    const dot = el('button', 'space-dot' + (s.id === currentSpace ? ' current' : ''));
    dot.style.setProperty('--dot', spaceColor(s));
    dot.title = s.name;
    dot.addEventListener('click', () => { if (s.id !== currentSpace) setSpace(s.id); });
    dot.addEventListener('contextmenu', (e) => { e.preventDefault(); openSpaceEditor(s.id, dot); });
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
  for (const id of ['space-menu', 'space-editor', 'downloads-pop']) $(id).hidden = true;
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
    b.querySelector('.mi-label').textContent = s.name;
  });
  item('<span class="check"></span><svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10"/></svg><span class="mi-label">Новое пространство…</span>',
    () => openSpaceEditor(null));
  menu.appendChild(el('div', 'menu-sep'));
  item('<span class="check"></span><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2"/></svg><span class="mi-label">Настройки пространства</span>',
    () => openSpaceEditor(currentSpace));
  $('space-btn').classList.add('open');
  placePopover(menu, $('space-btn'));
}
$('space-btn').onclick = (e) => { e.stopPropagation(); openSpaceMenu(); };

let editingSpace = null;
let editingColor = null;
function openSpaceEditor(id, anchor = $('space-btn')) {
  if (INCOGNITO) return;
  closePopovers();
  editingSpace = id;
  const s = spaces.find(x => x.id === id);
  editingColor = s ? spaceColor(s) : SPACE_COLORS[spaces.length % SPACE_COLORS.length];
  $('space-editor-title').textContent = s ? 'Настройки пространства' : 'Новое пространство';
  $('space-editor-name').value = s ? s.name : '';
  $('space-save').textContent = s ? 'Сохранить' : 'Создать';
  $('space-delete').hidden = !s || spaces.length < 2;
  const colors = $('space-colors');
  colors.innerHTML = '';
  for (const c of SPACE_COLORS) {
    const b = el('button', 'swatch' + (c === editingColor ? ' selected' : ''));
    b.style.background = c;
    b.onclick = () => {
      editingColor = c;
      for (const x of colors.children) x.classList.toggle('selected', x === b);
    };
    colors.appendChild(b);
  }
  placePopover($('space-editor'), anchor);
  $('space-editor-name').focus();
  $('space-editor-name').select();
}

function saveSpaceEditor() {
  const name = $('space-editor-name').value.trim();
  if (!name) { $('space-editor-name').focus(); return; }
  if (editingSpace === null) {
    const id = Math.max(...spaces.map(s => s.id)) + 1;
    spaces.push({ id, name, color: editingColor });
    closePopovers();
    setSpace(id);
  } else {
    Object.assign(spaces.find(s => s.id === editingSpace), { name, color: editingColor });
    closePopovers();
    saveSpaces();
    renderSpaces();
  }
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
  const fav = !isNew && getPins().some(p => hostOf(p.url) === hostOf(t.url));
  $('btn-pin').disabled = isNew;
  $('btn-pin').classList.toggle('on', fav);
  $('btn-pin').title = fav ? 'Убрать из избранного' : 'В избранное';
  syncTranslate();
  syncNotes();
  syncPageChip();
  document.title = isNew ? 'Луч' : tabTitle(t);
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
  $('cmdbar').hidden = false;
  input.focus();
  input.select();
  renderCommandResults();
}

function closeCommandBar() {
  if ($('cmdbar').hidden) return;
  $('cmdbar').hidden = true;
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
    for (const h of getHistory().filter(h => h.url !== current).slice(0, 6)) {
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
  if (isNew) openDownloads();
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
// Через Google Переводчик: страница открывается в переведённом виде на *.translate.goog

const TR_DETECT = `(() => {
  const text = (document.body ? document.body.innerText : '').slice(0, 4000);
  const letters = text.match(/\\p{L}/gu) || [];
  const cyr = text.match(/[\\u0400-\\u04FF]/g) || [];
  return { lang: document.documentElement.lang || '', letters: letters.length, cyr: cyr.length };
})()`;

function isTranslated(url) {
  try { return new URL(url).hostname.endsWith('.translate.goog'); } catch { return false; }
}

function translateUrl(url) {
  return `https://translate.google.com/translate?sl=auto&tl=${settings().translateTo}&hl=ru&u=` + encodeURIComponent(url);
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

function toggleTranslate(tab = activeTab()) {
  if (!tab?.webview || tab.url === NEW_TAB_URL) return;
  if (isTranslated(tab.url)) {
    tab.showOriginal = originalUrl(tab.url);
    tab.webview.loadURL(tab.showOriginal);
  } else if (/^https?:/.test(tab.url)) {
    tab.webview.loadURL(translateUrl(tab.url));
  }
}

function syncTranslate() {
  const t = activeTab();
  const btn = $('btn-translate');
  const on = Boolean(t && isTranslated(t.url));
  btn.disabled = !t || !/^https?:/.test(t.url);
  btn.classList.toggle('on', on);
  btn.title = on ? 'Показать оригинал' : 'Перевести страницу (⌘⇧Y)';
}

async function autoTranslate(tab) {
  if (!store.get('autoTranslate', false) || !tab.webview || !/^https?:/.test(tab.url)) return;
  if (isTranslated(tab.url) || /(^|\.)google\.[a-z.]+$/.test(hostOf(tab.url))) return;
  if (tab.showOriginal === tab.url) return;
  if (await needsTranslation(tab)) toggleTranslate(tab);
}

$('btn-translate').onclick = () => toggleTranslate();
$('btn-translate').addEventListener('contextmenu', async (e) => {
  e.preventDefault();
  const on = store.get('autoTranslate', false);
  const choice = await window.luch.menu([
    { id: 'now', label: isTranslated(activeTab()?.url) ? 'Показать оригинал' : 'Перевести эту страницу' },
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
  extensions: 'Расширения', skills: 'Скиллы Gemini', translate: 'Перевод', shortcuts: 'Сочетания клавиш', data: 'Данные',
};

async function openSettings(section = 'general') {
  const s = settings();
  $('set-search').value = s.search;
  $('set-theme').value = s.theme;
  $('set-restore').checked = s.restore;
  $('set-new-top').checked = s.newTabsTop;
  $('set-autohide').checked = s.autohide;
  $('set-cmd-groups').checked = s.cmdClickGroups;
  $('set-cleanup').value = String(s.cleanupHours);
  $('set-translate-to').value = s.translateTo;
  $('set-auto-translate').checked = store.get('autoTranslate', false);
  const prefs = await window.luch.prefs();
  $('set-block-ads').checked = prefs.blockAds;
  $('set-block-trackers').checked = prefs.blockTrackers;
  $('set-block-cookies').checked = prefs.blockCookieBanners;
  renderSettingsPins();
  renderSettingsSpaces();
  renderSettingsSkills();
  renderShortcuts();
  showSection(section);
  $('settings').hidden = false;
}

function showSection(name) {
  for (const b of document.querySelectorAll('.settings-nav button')) b.classList.toggle('active', b.dataset.section === name);
  for (const s of document.querySelectorAll('.settings-main section')) s.hidden = s.dataset.section !== name;
  $('settings-title').textContent = SECTION_TITLES[name];
  if (name === 'extensions') renderSettingsExtensions();
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
$('set-open-store').onclick = () => { closeSettings(); createTab('https://chromewebstore.google.com/'); };

const SHORTCUTS = [
  ['Командная строка', '⌘L'], ['Новая вкладка', '⌘T'], ['Закрыть вкладку', '⌘W'], ['Вернуть закрытую вкладку', '⇧⌘T'],
  ['Поиск по вкладкам', '⇧⌘A'], ['Закрепить вкладку', '⌘D'], ['Новая группа с вкладкой', '⌥⌘N'], ['Очистить вкладки', '⇧⌘K'],
  ['Чат с Gemini', '⌘E'], ['Перевести страницу', '⇧⌘Y'], ['Показать или скрыть вкладки', '⌘S'], ['Автоскрытие вкладок', '⌥⌘S'],
  ['Разделить экран', '⇧⌘='], ['Переключить панель', '⌥⌘] / ⌥⌘['], ['Убрать разделение', '⇧⌘−'],
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
$('set-theme').onchange = (e) => { setSetting('theme', e.target.value); window.luch.setTheme(e.target.value); };
$('set-restore').onchange = (e) => setSetting('restore', e.target.checked);
$('set-new-top').onchange = (e) => setSetting('newTabsTop', e.target.checked);
$('set-autohide').onchange = (e) => { setSetting('autohide', e.target.checked); applyAutohide(); };
$('set-cmd-groups').onchange = (e) => setSetting('cmdClickGroups', e.target.checked);
$('set-cleanup').onchange = (e) => setSetting('cleanupHours', Number(e.target.value));
$('set-translate-to').onchange = (e) => setSetting('translateTo', e.target.value);
$('set-auto-translate').onchange = (e) => store.set('autoTranslate', e.target.checked);
$('set-block-ads').onchange = (e) => window.luch.setPrefs({ blockAds: e.target.checked });
$('set-block-trackers').onchange = (e) => window.luch.setPrefs({ blockTrackers: e.target.checked });
$('set-block-cookies').onchange = (e) => window.luch.setPrefs({ blockCookieBanners: e.target.checked });
$('set-space-add').onclick = () => { closeSettings(); openSpaceEditor(null); };

function addPinFromSettings() {
  const input = $('set-pin-url');
  const text = input.value.trim();
  if (!text || !looksLikeUrl(text)) return;
  const url = toUrl(text);
  if (!getPins().some(p => hostOf(p.url) === hostOf(url))) toggleFavorite(url, hostOf(url));
  input.value = '';
  renderSettingsPins();
}
$('set-pin-add').onclick = addPinFromSettings;
$('set-pin-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') addPinFromSettings(); });

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
window.luch.version().then(v => { $('set-version').textContent = `Луч ${v.app} · Chromium ${v.chrome}`; });

// ---------- Кнопки и команды меню ----------

function toggleTabbar() {
  if (settings().autohide) { document.body.classList.toggle('peek'); return; }
  document.body.classList.toggle('collapsed');
  store.set('collapsed', document.body.classList.contains('collapsed'));
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
$('btn-pin').onclick = () => { const t = activeTab(); if (t) toggleFavorite(t.url, tabTitle(t)); };

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
    wv.setZoomLevel(delta === 0 ? 0 : wv.getZoomLevel() + delta);
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
  'group-tab': () => { const t = activeTab(); if (t && !t.pinnedId) renameGroupLater(newGroupWith(t)); },
  'rename-tab': () => { const t = activeTab(); if (t) renameTab(t); },
  'mute-tab': () => { const t = activeTab(); if (t) toggleMute(t); },
  'history': openHistory,
  'downloads': () => { if (settings().autohide) document.body.classList.add('peek'); openDownloads(); },
  'settings': (section) => openSettings(typeof section === 'string' ? section : 'general'),
  'select-space': (i) => { if (spaces[i]) setSpace(spaces[i].id); },
  'select-webcontents': (wcId) => { const t = tabByWc(wcId); if (t) activateTab(t.id); },
  'close-webcontents': (wcId) => { const t = tabByWc(wcId); if (t) closeTab(t.id); },
  'ask-selection': (text) => withPage(`Объясни коротко этот фрагмент со страницы: «${text}»`, true),
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
setSpace(currentSpace);
