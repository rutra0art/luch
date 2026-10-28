// Встраивается в страницы вкладок Luch: под полем входа показывает входы из Паролей Apple
// и заполняет логин и пароль по выбору пользователя. Сами пароли хранит macOS, Luch их
// запрашивает у помощника Apple только в момент выбора (background.js, apple-passwords.js).
(() => {
  if (!/^https?:$/.test(location.protocol)) return;

  const ask = (op, extra) => chrome.runtime.sendMessage({ type: 'luch:passwords', op, ...extra })
    .then((r) => (r?.ok ? r.result : Promise.reject(new Error(r?.error || 'нет ответа'))));

  const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const textLike = (el) => el instanceof HTMLInputElement && ['text', 'email', 'tel', ''].includes(el.type) && !el.readOnly && !el.disabled;
  const isPassword = (el) => el instanceof HTMLInputElement && el.type === 'password' && !el.readOnly && !el.disabled;
  const USER_HINT = /user|login|email|e-mail|mail|phone|account|логин|почт|телефон/i;

  // Поле пароля и поле логина для того поля, где стоит курсор
  function fieldsFor(input) {
    const scope = input.form || document;
    const inputs = [...scope.querySelectorAll('input')].filter(visible);
    const password = isPassword(input) ? input : inputs.find(isPassword);
    if (!password) {
      // Первый шаг входа без поля пароля (Google, Apple ID): только явное поле логина
      const auto = (input.autocomplete || '').split(/\s+/);
      return textLike(input) && (auto.includes('username') || auto.includes('email')) ? { user: input, password: null } : null;
    }
    if (password.autocomplete === 'new-password') return null;
    const before = inputs.slice(0, inputs.indexOf(password)).filter(textLike);
    const user = !isPassword(input) ? input
      : before.reverse().find((el) => USER_HINT.test(`${el.name} ${el.id} ${el.autocomplete} ${el.placeholder} ${el.type}`)) || before[0] || null;
    return { user, password };
  }

  // Значение ставится через стандартный сеттер и событие input — так его видят React, Vue и т. п.
  function setValue(el, value) {
    if (!el) return;
    el.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---------- Список под полем ----------
  const host = document.createElement('luch-passwords');
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    :host { all: initial; position: fixed; z-index: 2147483647; }
    .box { min-width: 240px; max-width: 360px; padding: 4px; border-radius: 10px; background: #fff; color: #1d1d1f;
      box-shadow: 0 0 0 .5px rgba(0,0,0,.18), 0 8px 24px rgba(0,0,0,.18); font: 13px -apple-system, system-ui, sans-serif; }
    .row { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 6px; cursor: default; }
    .row.active { background: #0a84ff; color: #fff; }
    .row svg { flex: none; width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; opacity: .7; }
    .text { min-width: 0; }
    .name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .sub { font-size: 11px; opacity: .6; }
    .row.active .sub { opacity: .85; }
    @media (prefers-color-scheme: dark) {
      .box { background: #2c2c2e; color: #f5f5f7; box-shadow: 0 0 0 .5px rgba(255,255,255,.15), 0 8px 24px rgba(0,0,0,.5); }
    }
  </style><div class="box"></div>`;
  const box = root.querySelector('.box');
  const KEY_ICON = '<svg viewBox="0 0 16 16"><circle cx="5.5" cy="10.5" r="3"/><path d="M7.6 8.4 13 3m-2 2 1.5 1.5M9.5 6.5 11 8"/></svg>';

  let field = null;
  let items = [];
  let active = 0;

  function hide() {
    host.remove();
    field = null;
    items = [];
  }

  function place() {
    if (!field || !field.isConnected) return hide();
    const r = field.getBoundingClientRect();
    host.style.left = `${Math.max(4, Math.min(r.left, innerWidth - 250))}px`;
    const below = r.bottom + 4;
    host.style.top = `${below + box.offsetHeight > innerHeight && r.top > box.offsetHeight + 4 ? r.top - box.offsetHeight - 4 : below}px`;
  }

  function render() {
    box.replaceChildren(...items.map((item, i) => {
      const row = document.createElement('div');
      row.className = 'row' + (i === active ? ' active' : '');
      row.innerHTML = `${KEY_ICON}<div class="text"><div class="name"></div><div class="sub"></div></div>`;
      row.querySelector('.name').textContent = item.title;
      row.querySelector('.sub').textContent = item.sub;
      row.addEventListener('mousemove', () => { if (active !== i) { active = i; render(); } });
      // Нажатие только настоящее: скрипт страницы не может выбрать вход за пользователя
      row.addEventListener('mousedown', (e) => { e.preventDefault(); if (e.isTrusted) choose(i); });
      return row;
    }));
  }

  function show(input, list) {
    field = input;
    items = list;
    active = 0;
    render();
    if (!host.isConnected) document.documentElement.appendChild(host);
    place();
  }

  async function choose(i) {
    const item = items[i];
    const target = field;
    hide();
    if (!item || !target) return;
    if (item.connect) {
      chrome.runtime.sendMessage({ type: 'luch:open-settings', section: 'passwords' }).catch(() => {});
      return;
    }
    let entry = null;
    try { entry = await ask('password', { user: item.user }); } catch {}
    if (!entry) return;
    const fields = fieldsFor(target) || { user: target, password: null };
    if (fields.user) setValue(fields.user, entry.user);
    if (fields.password) setValue(fields.password, entry.password);
  }

  // ---------- Когда показывать ----------
  let cache = null; // { at, logins | error }
  async function loginsForPage() {
    if (cache && Date.now() - cache.at < 30000) return cache;
    try { cache = { at: Date.now(), logins: await ask('logins') }; }
    catch (e) { cache = { at: Date.now(), error: e.message }; }
    return cache;
  }

  async function offer(input) {
    if (!fieldsFor(input)) return;
    const { logins, error } = await loginsForPage();
    if (document.activeElement !== input) return;
    if (logins?.length) {
      const typed = isPassword(input) ? '' : input.value.trim().toLowerCase();
      const list = logins.filter((l) => !typed || l.user.toLowerCase().includes(typed));
      if (!list.length) return hide();
      show(input, list.map((l) => ({ user: l.user, title: l.user || 'Без имени пользователя', sub: 'Пароли Apple' })));
    } else if (error && /не подключены/.test(error)) {
      // Помощник есть, но Luch ещё не подключён — один пункт, ведущий в настройки
      show(input, [{ connect: true, title: 'Подключить Пароли Apple…', sub: 'Вход на сайты с паролями из iCloud' }]);
    }
  }

  addEventListener('focusin', (e) => {
    const t = e.composedPath()[0];
    if (t instanceof HTMLInputElement && (isPassword(t) || textLike(t))) offer(t);
  }, true);
  addEventListener('focusout', (e) => { if (e.composedPath()[0] === field) setTimeout(() => { if (document.activeElement !== field) hide(); }, 150); }, true);
  addEventListener('input', (e) => { if (e.isTrusted && e.composedPath()[0] === field && !isPassword(field)) offer(field); }, true);
  addEventListener('scroll', () => field && place(), true);
  addEventListener('resize', () => field && place());
  addEventListener('keydown', (e) => {
    if (!field || e.composedPath()[0] !== field || !e.isTrusted) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      active = (active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      render();
    } else if (e.key === 'Enter') {
      choose(active);
    } else if (e.key === 'Escape') {
      hide();
    } else {
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
})();
