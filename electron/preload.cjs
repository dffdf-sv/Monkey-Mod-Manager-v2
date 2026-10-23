const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('monkeyModManager', {
  isDesktop: true,
  getGameFolder: () => ipcRenderer.invoke('game:get-folder'),
  chooseGameFolder: () => ipcRenderer.invoke('game:choose-folder'),
  installMod: (mod) => ipcRenderer.invoke('mod:install', mod)
});
