const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('monkeyModManager', {
  isDesktop: true,
  signInWithGitHub: () => ipcRenderer.invoke('auth:github-sign-in'),
  onAuthToken: (callback) => { const listener = (_event, token) => callback(token); ipcRenderer.on('auth:token', listener); return () => ipcRenderer.removeListener('auth:token', listener); },
  onOpenMod: (callback) => { const listener = (_event, modId) => callback(modId); ipcRenderer.on('mod:open', listener); return () => ipcRenderer.removeListener('mod:open', listener); },
  getGameFolder: () => ipcRenderer.invoke('game:get-folder'),
  chooseGameFolder: () => ipcRenderer.invoke('game:choose-folder'),
  installMod: (mod) => ipcRenderer.invoke('mod:install', mod),
  getInstalledMods: () => ipcRenderer.invoke('mods:get-installed'),
  getDetectedMods: () => ipcRenderer.invoke('mods:get-detected'),
  saveModConfig: (payload) => ipcRenderer.invoke('config:save', payload),
  listConfigFiles: () => ipcRenderer.invoke('config:list-files'),
  readConfigFile: (name) => ipcRenderer.invoke('config:read-file', name),
  writeConfigFile: (payload) => ipcRenderer.invoke('config:write-file', payload),
  installBepInEx: () => ipcRenderer.invoke('bepinex:install')
});
