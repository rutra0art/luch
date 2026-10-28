// Сквозные тесты интерфейса Luch. Запуск: сначала Luch с портом отладки
//   npx electron . --remote-debugging-port=9333
// затем npm run test:e2e. Тесты сохраняют localStorage и вкладки и восстанавливают их в конце.
const list = await (await fetch(`http://localhost:${process.env.LUCH_PORT || 9333}/json`)).json();
const page = list.find(p => p.type === 'page' && p.url.includes('/ui/index.html'));
if (!page) { console.error('Luch не запущен с --remote-debugging-port=9333'); process.exit(2); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
let seq = 0;
const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); waiting.get(d.id)?.(d); waiting.delete(d.id); };
async function run(expression) {
  const id = ++seq;
  const d = await new Promise((resolve) => {
    waiting.set(id, resolve);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
  if (d.result.exceptionDetails) throw new Error(d.result.exceptionDetails.exception?.description || 'ошибка в интерфейсе');
  return d.result.result.value;
}

const results = [];
async function check(name, body) {
  try {
    const v = await run(`(async () => { ${body} })()`);
    results.push([v === true, name, v === true ? '' : JSON.stringify(v)]);
  } catch (e) {
    results.push([false, name, e.message.split('\n')[0]]);
  }
}

// Снимок состояния и сборщик ошибок интерфейса
await run(`window.__e2e = { ls: JSON.stringify(Object.fromEntries(Object.entries(localStorage))), tabIds: tabs.map(t => t.id), active: activeId, errors: [] };
  window.addEventListener('error', e => window.__e2e.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', e => window.__e2e.errors.push(String(e.reason))); true`);

await check('адрес или поиск', `return toUrl('example.com') === 'https://example.com' && toUrl('localhost:3000') === 'https://localhost:3000'
  && toUrl('как дела').startsWith(engine().url) && toUrl('https://a.b/c') === 'https://a.b/c';`);
await check('адрес из Google Переводчика', `return originalUrl('https://en-wikipedia-org.translate.goog/wiki/URL?_x_tr_sl=auto&_x_tr_tl=ru') === 'https://en.wikipedia.org/wiki/URL';`);
await check('создание, закрытие и возврат вкладки', `const n = tabs.length; const t = createTab('about:blank', { activate: false, load: false });
  const ok1 = tabs.length === n + 1; t.url = 'https://example.org/'; closeTab(t.id); const ok2 = tabs.length === n;
  commands['reopen-tab'](); const back = tabs.find(x => x.url === 'https://example.org/'); if (back) closeTab(back.id, { remember: false });
  return ok1 && ok2 && Boolean(back);`);
await check('закрепление и открепление', `const t = createTab('https://example.net/', { activate: false, load: false }); pinTab(t);
  const id = t.pinnedId; const pinned = pinnedList().some(x => x.id === id); unpinItem(id);
  const unpinned = !pinnedList().some(x => x.id === id) && !t.pinnedId; closeTab(t.id, { remember: false }); return pinned && unpinned;`);
await check('папка закреплённых', `const f = { id: 'e2e-f', type: 'folder', name: 'E2E', open: true, items: [] }; pinnedList().push(f);
  const t = createTab('https://example.com/e2e', { activate: false, load: false }); pinTab(t, f); const inFolder = f.items.length === 1;
  unpinToRegular(f.items[0].id); pinnedList().splice(pinnedList().indexOf(f), 1); savePinned();
  const tt = tabs.find(x => x.url === 'https://example.com/e2e'); if (tt) closeTab(tt.id, { remember: false }); return inFolder;`);
await check('пустая группа и перенос вкладки в неё', `const g = createGroup(currentSpace, 'E2E'); renderTabs();
  const shown = [...document.querySelectorAll('.gname')].some(e => e.textContent === 'E2E');
  const t = createTab('https://example.com/g', { activate: false, load: false }); moveTabToGroup(t.id, g.id); const inGroup = t.groupId === g.id;
  deleteGroup(g); const ungrouped = t.groupId === null && !groups.includes(g); closeTab(t.id, { remember: false }); return shown && inGroup && ungrouped;`);
await check('избранное: не больше трёх плиток', `const before = store.get('pins');
  store.set('pins', [{ url: 'https://a.com/', title: 'a' }, { url: 'https://b.com/', title: 'b' }, { url: 'https://c.com/', title: 'c' }]);
  toggleFavorite('https://d.com/', 'd'); const ok = getPins().length === 3 && pinnedList().some(x => x.url === 'https://d.com/');
  pinnedData[currentSpace] = pinnedList().filter(x => x.url !== 'https://d.com/'); savePinned(); store.set('pins', before); renderTabs(); return ok;`);
await check('пространство: создание и удаление', `const n = spaces.length; const id = Math.max(...spaces.map(s => s.id)) + 1; const prev = currentSpace;
  spaces.push({ id, name: 'E2E', color: '#2f86d1' }); setSpace(id);
  const switched = currentSpace === id && document.getElementById('space-btn').textContent === 'E2E';
  deleteSpace(id); setSpace(prev); return switched && spaces.length === n;`);
await check('командная строка: подсказки и закрытие', `openCommandBar('all', { text: '' }); document.getElementById('cmd-input').value = 'example.com'; renderCommandResults();
  const first = cmdItems[0] && cmdItems[0].sub === 'Открыть сайт'; closeCommandBar(); await new Promise(r => setTimeout(r, 350));
  return first && document.getElementById('cmdbar').hidden;`);
await check('разделение экрана', `const a = activeTab(); const b = createTab('about:blank', { activate: false }); splitWith(b.id);
  const ok = Boolean(split && split.a === a.id && split.b === b.id); unsplit(); closeTab(b.id, { remember: false }); activateTab(a.id);
  return ok && split === null;`);
await check('история без повторов подряд', `const h = store.get('history', []); addHistory('https://e2e.test/', 'E2E'); addHistory('https://e2e.test/', 'E2E');
  const ok = getHistory().filter(x => x.url === 'https://e2e.test/').length === 1; store.set('history', h); return ok;`);
await check('все разделы настроек открываются', `await openSettings('general');
  for (const s of Object.keys(SECTION_TITLES)) { showSection(s); if (document.querySelector('.settings-main section[data-section="' + s + '"]').hidden) return s; }
  closeSettings(); return true;`);
await check('перевод: названия не переводятся, меню группируется', `const names = new Set(['Apple', 'Watch']);
  const units = buildUnits([{ i: 0, t: 'Store' }, { i: 1, t: 'Home' }, { i: 2, t: 'A long sentence that should be translated separately from the menu' }]);
  return isProtected('Apple', names) && isProtected('iPad', names) && !isProtected('Home', names) && units.length === 2 && units[0].text === 'Store\\nHome';`);
await check('перевод: скрипты для страницы без синтаксических ошибок', `for (const src of [TR_DETECT, TR_COLLECT, TR_RESTORE, PAGE_NAMES, trApply([])]) new Function('return ' + src);
  return true;`);
await check('нет ошибок интерфейса во время тестов', `return window.__e2e.errors.length === 0 || window.__e2e.errors;`);

// Восстанавливаем состояние пользователя
await run(`(() => { const s = window.__e2e; const ls = JSON.parse(s.ls); localStorage.clear(); for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
  for (const t of tabs.slice()) if (!s.tabIds.includes(t.id)) closeTab(t.id, { remember: false });
  pinnedData = store.get('pinned', {}); groups = store.get('groups', []); spaces = store.get('spaces', spaces);
  if (tabs.some(t => t.id === s.active)) activateTab(s.active); renderSpaces(); renderTabs(); return true; })()`);

let failed = 0;
for (const [ok, name, info] of results) {
  console.log(`${ok ? '✔' : '✖'} ${name}${ok ? '' : ' — ' + info}`);
  if (!ok) failed++;
}
console.log(`\n${results.length - failed} из ${results.length} проходят`);
ws.close();
process.exit(failed ? 1 : 0);
