const { contextBridge, ipcRenderer } = require('electron');
const { injectBrowserAction } = require('electron-chrome-extensions/browser-action');

// Элемент <browser-action-list> с иконками расширений для панели инструментов
injectBrowserAction();

contextBridge.exposeInMainWorld('luch', {
  onCommand: (fn) => ipcRenderer.on('command', (_e, cmd, ...args) => fn(cmd, ...args)),
  onDownload: (fn) => ipcRenderer.on('download', (_e, info) => fn(info)),
  menu: (items) => ipcRenderer.invoke('menu', items),
  setTheme: (mode) => ipcRenderer.invoke('theme', mode),
  version: () => ipcRenderer.invoke('version'),
  clearData: (what) => ipcRenderer.invoke('clear-data', what),
  prefs: () => ipcRenderer.invoke('prefs'),
  setPrefs: (patch) => ipcRenderer.invoke('set-prefs', patch),
  extensions: () => ipcRenderer.invoke('extensions'),
  uninstallExtension: (id) => ipcRenderer.invoke('uninstall-extension', id),
  downloadAction: (id, action) => ipcRenderer.invoke('download-action', id, action),
  newWindow: (opts) => ipcRenderer.invoke('new-window', opts),
  tabCreated: (token, wcId) => ipcRenderer.send('tab-created', token, wcId),
  tabSelected: (wcId) => ipcRenderer.send('tab-selected', wcId),
});
