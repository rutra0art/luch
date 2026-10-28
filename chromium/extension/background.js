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
