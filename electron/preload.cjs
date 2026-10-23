const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('monkeyModManager', {
  isDesktop: true,
  getGameFolder: () => ipcRenderer.invoke('game:get-folder'),
  chooseGameFolder: () => ipcRenderer.invoke('game:choose-folder'),
  installMod: (mod) => ipcRenderer.invoke('mod:install', mod),
  getInstalledMods: () => ipcRenderer.invoke('mods:get-installed'),
  getDetectedMods: () => ipcRenderer.invoke('mods:get-detected'),
  installBepInEx: () => ipcRenderer.invoke('bepinex:install')
});
