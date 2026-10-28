// Фоновая часть встроенного расширения Luch
const UI_URL = chrome.runtime.getURL('ui/index.html');

// Окно Luch открывается при запуске чуть раньше, чем загружается само расширение, и показывает
// ошибку — перезагружаем такие окна, как только расширение готово
async function reloadUiWindows() {
  const tabs = await chrome.tabs.query({ url: UI_URL + '*' });
  // Нормально загруженное окно называется «Luch», страница ошибки — иначе
  for (const t of tabs) if (t.title !== 'Luch') chrome.tabs.reload(t.id);
}
chrome.runtime.onStartup.addListener(reloadUiWindows);
chrome.runtime.onInstalled.addListener(reloadUiWindows);

// Пароли Apple (apple-passwords.js). Страницы вкладок (guest-passwords.js) могут только узнать
// входы и пароль для своего сайта — адрес берётся из sender.url, его подставляет сам браузер.
// Подключение и отключение — только из окна Luch.
importScripts('apple-passwords.js');

const UI_ORIGIN = chrome.runtime.getURL('');
const PAGE_OPS = {
  logins: (host) => ApplePasswords.logins(host),
  password: (host, msg) => ApplePasswords.password(host, String(msg.user ?? '')),
};
const UI_OPS = {
  status: () => ApplePasswords.status(),
  'request-pin': () => ApplePasswords.requestPin(),
  'confirm-pin': (msg) => ApplePasswords.confirmPin(String(msg.pin ?? '').replace(/\D/g, '')),
  forget: () => ApplePasswords.forget(),
};

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== 'luch:passwords' || sender.id !== chrome.runtime.id) return;
  let run;
  if (sender.url?.startsWith(UI_ORIGIN)) {
    run = UI_OPS[msg.op] && (() => UI_OPS[msg.op](msg));
  } else {
    let url = null;
    try { url = new URL(sender.url); } catch {}
    if (url && /^https?:$/.test(url.protocol) && url.hostname) run = PAGE_OPS[msg.op] && (() => PAGE_OPS[msg.op](url.hostname, msg));
  }
  if (!run) return;
  Promise.resolve().then(run).then(
    (result) => reply({ ok: true, result }),
    (e) => reply({ ok: false, error: e.message }),
  );
  return true;
});
