// Встраивается в страницы вкладок Luch: сочетания клавиш Luch (⌘E, ⌘⇧Y, ⌥⌘= …) работают,
// даже когда фокус на сайте. Список сочетаний — в luch-api.js (KEYS)
(() => {
  const KEYS = new Set([
    'cmd+e', 'cmd+shift+k', 'cmd+shift+c', 'alt+cmd+shift+c', 'cmd+f', 'cmd+s', 'alt+cmd+s', 'alt+cmd+=',
    'alt+cmd+]', 'alt+cmd+[', 'alt+cmd+-', 'cmd+shift+y', 'cmd+shift+s', 'alt+cmd+p', 'alt+cmd+arrowdown', 'alt+cmd+arrowup', 'cmd+shift+a',
    'alt+cmd+shift+n', 'alt+cmd+n', 'alt+cmd+l', 'cmd+y', 'cmd+d', 'cmd+,', 'ctrl+=', 'ctrl+-', 'ctrl+0',
    'ctrl+1', 'ctrl+2', 'ctrl+3', 'ctrl+4', 'ctrl+5', 'ctrl+6', 'ctrl+7', 'ctrl+8', 'ctrl+9',
  ]);
  const keyName = (e) => [e.ctrlKey && 'ctrl', e.altKey && 'alt', e.metaKey && 'cmd', e.shiftKey && 'shift', (e.code.startsWith('Digit') ? e.code.slice(5) : e.code.startsWith('Key') ? e.code.slice(3) : e.code === 'Equal' ? '=' : e.code === 'Minus' ? '-' : e.code === 'BracketLeft' ? '[' : e.code === 'BracketRight' ? ']' : e.code === 'Comma' ? ',' : e.key).toLowerCase()].filter(Boolean).join('+');
  addEventListener('keydown', (e) => {
    const key = keyName(e);
    if (!KEYS.has(key)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    chrome.runtime.sendMessage({ type: 'luch:key', key }).catch(() => {});
  }, true);
  // Щелчок по странице закрывает всплывающие панели Luch (загрузки, меню пространств) —
  // сам интерфейс щелчков внутри вкладки не видит
  addEventListener('mousedown', (e) => {
    if (e.isTrusted) chrome.runtime.sendMessage({ type: 'luch:page-click' }).catch(() => {});
  }, true);
})();
