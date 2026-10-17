// The only things the app page may ask the computer for (see src/lib/desktop.ts).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('closetDesktop', {
  loadDb: () => ipcRenderer.invoke('db:load'),
  saveDb: (json) => ipcRenderer.invoke('db:save', json),
  savePhoto: (name, bytes) => ipcRenderer.invoke('photo:save', name, bytes),
  readPhoto: (name) => ipcRenderer.invoke('photo:read', name),
  deletePhoto: (name) => ipcRenderer.invoke('photo:delete', name),
  exportFile: (defaultName, bytes) => ipcRenderer.invoke('file:export', defaultName, bytes),
  importFile: () => ipcRenderer.invoke('file:import'),
  openDataFolder: () => ipcRenderer.invoke('folder:open'),
  getDataFolder: () => ipcRenderer.invoke('folder:get'),
  changeDataFolder: (useDefault) => ipcRenderer.invoke('folder:change', useDefault),
  popupMenu: (entries) => ipcRenderer.invoke('menu:popup', entries),
  appInfo: () => ipcRenderer.invoke('app:info'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  setAutoUpdate: (on) => ipcRenderer.invoke('update:auto', on),
  /** Menu commands (see src/lib/commands.ts). Returns a function that stops listening. */
  onCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('command', listener);
    return () => ipcRenderer.removeListener('command', listener);
  },
});
