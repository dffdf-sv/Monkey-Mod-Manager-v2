const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
app.setAsDefaultProtocolClient('monkeymodmanager');
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();
let mainWindow = null;
let pendingAuthToken = null;
let pendingModId = null;
function handleAuthDeepLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'monkeymodmanager:') return;
    if (url.hostname === 'auth') {
      const token = url.searchParams.get('token');
      if (!token || token.length > 4096) return;
      pendingAuthToken = token;
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) { mainWindow.webContents.send('auth:token', token); pendingAuthToken = null; }
      return;
    }
    if (url.hostname === 'mod') {
      const modId = decodeURIComponent(url.pathname.replace(/^\/+/, '')).slice(0, 120);
      if (!/^[a-zA-Z0-9_-]+$/.test(modId)) return;
      pendingModId = modId;
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) { mainWindow.webContents.send('mod:open', modId); pendingModId = null; }
      if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
    }
  } catch {}
}
app.on('open-url', (event, value) => { event.preventDefault(); handleAuthDeepLink(value); });
app.on('second-instance', (_event, argv) => { const link = argv.find((arg) => arg.startsWith('monkeymodmanager://')); if (link) handleAuthDeepLink(link); if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
const path = require('node:path');
const fs = require('node:fs/promises');
const extractZip = require('extract-zip');
const { spawn } = require('node:child_process');
const os = require('node:os');

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
async function readSettings() { try { return JSON.parse(await fs.readFile(settingsFile(), 'utf8')); } catch { return {}; } }
async function writeSettings(settings) {
  await fs.mkdir(path.dirname(settingsFile()), { recursive: true });
  await fs.writeFile(settingsFile(), JSON.stringify(settings, null, 2), 'utf8');
}
async function installModArchive(archivePath, gameFolder, pluginDir, modName) {
  const tempRoot = await fs.mkdtemp(path.join(app.getPath('temp'), 'modhub-archive-'));
  const root = path.join(tempRoot, 'root');
  try {
    let archiveCount = 0;
    const unpackArchive = async (source, destination, depth) => {
      if (depth > 8) throw new Error('This ZIP contains too many nested levels (maximum 8).');
      archiveCount += 1;
      if (archiveCount > 100) throw new Error('This ZIP contains too many nested archives (maximum 100).');
      await fs.mkdir(destination, { recursive: true });
      await extractZip(source, { dir: destination });
      const inspect = async (directory) => {
        for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
          const full = path.join(directory, entry.name);
          if (entry.isDirectory()) await inspect(full);
          else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.zip') {
            const nested = path.join(path.dirname(full), path.basename(full, path.extname(full)) + '-extracted');
            await unpackArchive(full, nested, depth + 1);
          }
        }
      };
      await inspect(destination);
    };
    await unpackArchive(archivePath, root, 0);
    const directories = [root], files = [];
    const scan = async (directory) => {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) { directories.push(full); await scan(full); }
        else if (entry.isFile() && path.extname(entry.name).toLowerCase() !== '.zip') files.push(full);
      }
    };
    await scan(root);
    const bepinexDirs = directories.filter(directory => path.basename(directory).toLowerCase() === 'bepinex');
    const pluginRoots = [];
    const configRoots = [];
    for (const directory of bepinexDirs) {
      const plugins = path.join(directory, 'plugins');
      const config = path.join(directory, 'config');
      if (await fs.stat(plugins).then(info => info.isDirectory()).catch(() => false)) pluginRoots.push(plugins);
      if (await fs.stat(config).then(info => info.isDirectory()).catch(() => false)) configRoots.push(config);
    }
    const copyFileSafe = async (source, destination, allowedRoot, backup = false) => {
      const resolvedRoot = path.resolve(allowedRoot), resolved = path.resolve(destination);
      if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) throw new Error('Archive contains an unsafe destination path.');
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      if (backup && await fs.stat(resolved).then(info => info.isFile()).catch(() => false)) {
        await fs.copyFile(resolved, resolved + '.bak');
      }
      await fs.copyFile(source, resolved);
    };
    let copiedDlls = 0, copiedConfigs = 0, copiedFiles = 0;
    const packageDir = bepinexDirs.find(directory => /bepinex/i.test(modName) &&
      (directories.includes(path.join(directory, 'core')) || directories.includes(path.join(directory, 'patchers'))));
    if (packageDir) {
      const targetRoot = path.join(gameFolder, 'BepInEx');
      for (const source of files.filter(file => file.startsWith(packageDir + path.sep))) {
        const relative = path.relative(packageDir, source);
        const destination = path.join(targetRoot, relative);
        await copyFileSafe(source, destination, targetRoot, /\.cfg$/i.test(source));
        copiedFiles += 1;
        if (/\.dll$/i.test(source)) copiedDlls += 1;
        if (/\.cfg$/i.test(source)) copiedConfigs += 1;
      }
    } else {
      if (pluginRoots.length) {
        for (const pluginsRoot of pluginRoots) {
          for (const source of files.filter(file => file.startsWith(pluginsRoot + path.sep))) {
            const relative = path.relative(pluginsRoot, source);
            await copyFileSafe(source, path.join(pluginDir, relative), pluginDir);
            copiedFiles += 1;
            if (/\.dll$/i.test(source)) copiedDlls += 1;
          }
        }
      } else {
        const dlls = files.filter(file => /\.dll$/i.test(file) && !/[/\\]BepInEx[/\\](core|patchers)[/\\]/i.test(file));
        const used = new Set();
        for (const source of dlls) {
          const base = path.basename(source).replace(/[^a-zA-Z0-9._-]/g, '_');
          let candidate = base, suffix = 2;
          while (used.has(candidate.toLowerCase())) {
            const parsed = path.parse(base);
            candidate = parsed.name + '-' + suffix++ + parsed.ext;
          }
          used.add(candidate.toLowerCase());
          await copyFileSafe(source, path.join(pluginDir, candidate), pluginDir);
          copiedFiles += 1; copiedDlls += 1;
        }
      }
      const configRoot = path.join(gameFolder, 'BepInEx', 'config');
      for (const configs of configRoots) {
        for (const source of files.filter(file => file.startsWith(configs + path.sep))) {
          const relative = path.relative(configs, source);
          await copyFileSafe(source, path.join(configRoot, relative), configRoot, /\.cfg$/i.test(source));
          copiedFiles += 1;
          if (/\.cfg$/i.test(source)) copiedConfigs += 1;
        }
      }
    }
    if (!copiedFiles) throw new Error('No installable DLLs or BepInEx files were found in this ZIP. Check that it contains a compiled mod rather than source code.');
    return { copiedFiles, copiedDlls, copiedConfigs };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}
function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 960, minWidth: 780, minHeight: 600,
    title: 'ModHub', icon: path.join(__dirname, '..', 'build', 'icon.png'), backgroundColor: '#0b0e12', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  mainWindow = win;
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('did-finish-load', () => { if (pendingAuthToken) { win.webContents.send('auth:token', pendingAuthToken); pendingAuthToken = null; } if (pendingModId) { win.webContents.send('mod:open', pendingModId); pendingModId = null; } });
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  return win;
}
function isGameFolder(folder) {
  if (!folder) return false;
  const names = require('node:fs').readdirSync(folder, { withFileTypes: true }).map((entry) => entry.name.toLowerCase());
  return names.some((name) => ['gorilla tag.exe', 'gorilla tag.x86_64', 'gorilla tag.app'].includes(name)) ||
    names.includes('gorilla tag_data');
}
async function autoDetectGameFolder(platform = 'Steam') {
  const candidates = [];
  const add = (value) => { if (value && !candidates.includes(value)) candidates.push(value); };
  const home = app.getPath('home');
  if (process.platform === 'win32' && platform === 'Meta') {
    const roots = [process.env['PROGRAMFILES'] && path.join(process.env['PROGRAMFILES'], 'Oculus', 'Software'), process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Oculus', 'Software')].filter(Boolean);
    for (const root of roots) {
      try { for (const entry of await fs.readdir(root, { withFileTypes: true })) if (entry.isDirectory() && /gorilla.*tag|tag.*gorilla/i.test(entry.name)) add(path.join(root, entry.name)); } catch {}
    }
  }
  if (process.platform === 'win32' && platform === 'Steam') {
    for (const base of [
      process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Steam'),
      process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Steam'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Steam'),
      path.join(home, 'Games', 'Steam')
    ]) if (base) add(path.join(base, 'steamapps', 'common', 'Gorilla Tag'));
    const steamRoots = candidates.map((candidate) => path.resolve(candidate, '..', '..', '..'));
    for (const root of steamRoots) {
      try {
        const vdf = await fs.readFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
        for (const match of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
          const library = match[1].replace(/\\\\/g, '\\');
          add(path.join(library, 'steamapps', 'common', 'Gorilla Tag'));
        }
      } catch {}
    }
  } else {
    for (const root of [
      path.join(home, '.steam', 'steam'),
      path.join(home, '.local', 'share', 'Steam'),
      path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam')
    ]) {
      add(path.join(root, 'steamapps', 'common', 'Gorilla Tag'));
      try {
        const vdf = await fs.readFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
        for (const match of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
          const library = match[1].replace(/\\\\/g, '\\');
          add(path.join(library, 'steamapps', 'common', 'Gorilla Tag'));
        }
      } catch {}
    }
  }
  for (const candidate of candidates) {
    try { if (isGameFolder(candidate)) return candidate; } catch {}
  }
  return null;
}
ipcMain.handle('game:get-platform', async () => (await readSettings()).gamePlatform === 'Meta' ? 'Meta' : 'Steam');
ipcMain.handle('game:set-platform', async (_event, platform) => {
  const safePlatform = platform === 'Meta' ? 'Meta' : 'Steam';
  const settings = await readSettings();
  const found = await autoDetectGameFolder(safePlatform);
  const next = { ...settings, gamePlatform: safePlatform, gameFolder: found || null };
  await writeSettings(next);
  return { ok: true, platform: safePlatform, gameFolder: next.gameFolder };
});
ipcMain.handle('game:get-folder', async () => {
  const settings = await readSettings();
  if (settings.gameFolder) {
    try { if (isGameFolder(settings.gameFolder)) return settings.gameFolder; } catch {}
  }
  const found = await autoDetectGameFolder(settings.gamePlatform === 'Meta' ? 'Meta' : 'Steam');
  if (found) { await writeSettings({ ...settings, gameFolder: found }); return found; }
  return settings.gameFolder || null;
});
ipcMain.handle('game:launch', async () => {
  try {
    const settings = await readSettings();
    if (!settings.gameFolder) return { ok:false, message:'Choose your Gorilla Tag game folder first.' };
    const folder = path.resolve(settings.gameFolder);
    if (!isGameFolder(folder)) return { ok:false, message:'The selected folder does not look like Gorilla Tag. Choose the folder containing the game executable.' };
    const names = await fs.readdir(folder);
    const candidates = process.platform === 'win32' ? ['Gorilla Tag.exe'] : process.platform === 'darwin' ? ['Gorilla Tag.app'] : ['Gorilla Tag.x86_64','Gorilla Tag.exe'];
    const executable = candidates.map(name=>path.join(folder,name)).find(name=>names.some(entry=>entry.toLowerCase()===path.basename(name).toLowerCase()));
    if (!executable) return { ok:false, message:'Could not find the Gorilla Tag executable in the selected folder. For Steam, launch it from Steam if this install uses Steam DRM.' };
    if (executable.toLowerCase().endsWith('.app')) { const child=spawn('open',[executable],{detached:true,stdio:'ignore'}); child.unref(); }
    else { const child=spawn(executable,[],{cwd:folder,detached:true,stdio:'ignore'}); child.unref(); }
    return { ok:true, message:'Launching Gorilla Tag…' };
  } catch (error) { return { ok:false, message:error instanceof Error ? error.message : 'Could not launch Gorilla Tag.' }; }
});
ipcMain.handle('mods:toggle-installed', async (_event, requestedName) => {
  try {
    if (typeof requestedName !== 'string' || !requestedName || requestedName.length > 180 || requestedName.includes('..')) throw new Error('Invalid mod name.');
    const settings = await readSettings(); if (!settings.gameFolder) throw new Error('Choose your Gorilla Tag game folder first.');
    const root = path.resolve(settings.gameFolder); const plugins = path.resolve(root,'BepInEx','plugins');
    if (!plugins.startsWith(root + path.sep)) throw new Error('Invalid plugins folder.');
    const entries = await fs.readdir(plugins,{withFileTypes:true}).catch(()=>[]);
    const cleanName = value => String(value).replace(/\.disabled$/i,'').replace(/\.dll$/i,'').toLowerCase();
    const matched = entries.find(entry=>entry.name===requestedName || cleanName(entry.name)===cleanName(requestedName));
    if (!matched) throw new Error('That mod is no longer in the plugins folder. Refresh the installed-mod list.');
    const base = path.resolve(plugins,matched.name); if (!base.startsWith(plugins + path.sep)) throw new Error('Invalid mod path.');
    const paths = [];
    if (matched.isDirectory()) {
      const nested = await fs.readdir(base,{withFileTypes:true});
      for (const entry of nested) if (entry.isFile() && (/\.dll$/i.test(entry.name)||/\.dll\.disabled$/i.test(entry.name))) paths.push(path.join(base,entry.name));
    } else if (matched.isFile() && (/\.dll$/i.test(matched.name)||/\.dll\.disabled$/i.test(matched.name))) paths.push(base);
    if (!paths.length) throw new Error('No DLL files found for this mod. This toggle supports DLL-based BepInEx mods.');
    const disable = paths.some(file=>file.toLowerCase().endsWith('.dll'));
    for (const file of paths) {
      if (disable && file.toLowerCase().endsWith('.dll')) await fs.rename(file,file+'.disabled');
      else if (!disable && file.toLowerCase().endsWith('.dll.disabled')) await fs.rename(file,file.replace(/\.dll\.disabled$/i,'.dll'));
    }
    const label = matched.name.replace(/\.disabled$/i,'');
    return {ok:true,enabled:!disable,message:label+(disable?' disabled.':' enabled.')};
  } catch(error) { return {ok:false,message:error instanceof Error?error.message:'Could not toggle mod.'}; }
});
ipcMain.handle('config:list-files', async () => {
  try {
    const settings = await readSettings();
    if (!settings.gameFolder) return { ok: false, message: 'Gorilla Tag folder is not set.', files: [] };
    const dir = path.join(path.resolve(settings.gameFolder), 'BepInEx', 'config');
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.cfg') || !/^[a-zA-Z0-9_. -]+\.cfg$/i.test(entry.name)) continue;
      const info = await fs.stat(path.join(dir, entry.name)).catch(() => null);
      if (info && info.size <= 2 * 1024 * 1024) files.push({ name: entry.name, size: info.size, modified: info.mtime.toISOString() });
    }
    return { ok: true, files: files.sort((a,b) => a.name.localeCompare(b.name)) };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Could not list config files.', files: [] }; }
});
ipcMain.handle('config:read-file', async (_event, name) => {
  try {
    if (typeof name !== 'string' || !/^[a-zA-Z0-9_. -]+\.cfg$/i.test(name) || name.includes('..')) throw new Error('Invalid config filename.');
    const settings = await readSettings();
    if (!settings.gameFolder) throw new Error('Gorilla Tag folder is not set.');
    const dir = path.resolve(settings.gameFolder, 'BepInEx', 'config');
    const file = path.resolve(dir, name);
    if (!file.startsWith(dir + path.sep)) throw new Error('Invalid config path.');
    const info = await fs.stat(file);
    if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new Error('Config file is too large or not a regular file.');
    return { ok: true, name, content: await fs.readFile(file, 'utf8') };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Could not read config file.' }; }
});
const backupCleanupTimers = new Map();
const scheduleBackupCleanup = (backupPath) => {
  const existing = backupCleanupTimers.get(backupPath);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(async () => {
    backupCleanupTimers.delete(backupPath);
    try { await fs.unlink(backupPath); } catch (error) { if (error.code !== 'ENOENT') console.warn('Could not remove expired config backup:', error.message); }
  }, 2 * 60 * 1000);
  timer.unref?.();
  backupCleanupTimers.set(backupPath, timer);
};

ipcMain.handle('config:write-file', async (_event, payload) => {
  try {
    const name = payload && payload.name;
    const content = payload && payload.content;
    if (typeof name !== 'string' || !/^[a-zA-Z0-9_. -]+\.cfg$/i.test(name) || name.includes('..')) throw new Error('Invalid config filename.');
    if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024) throw new Error('Config content must be under 2 MB.');
    const settings = await readSettings();
    if (!settings.gameFolder) throw new Error('Gorilla Tag folder is not set.');
    const dir = path.resolve(settings.gameFolder, 'BepInEx', 'config');
    const file = path.resolve(dir, name);
    if (!file.startsWith(dir + path.sep)) throw new Error('Invalid config path.');
    await fs.mkdir(dir, { recursive: true });
    try { await fs.copyFile(file, file + '.bak'); scheduleBackupCleanup(file + '.bak'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.writeFile(file, content, 'utf8');
    const savedContent = await fs.readFile(file, 'utf8');
    if (savedContent !== content) throw new Error('The config file could not be verified after saving.');
    return { ok: true, message: 'Saved ' + name + (await fs.stat(file + '.bak').then(() => ' (backup created)').catch(() => '')), path: file };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Could not save config.' }; }
});
ipcMain.handle('app:get-version', () => app.getVersion());
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
function sendAppUpdateStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app:update-status', status);
}
autoUpdater.on('checking-for-update', () => sendAppUpdateStatus({ status: 'checking' }));
autoUpdater.on('update-available', (info) => sendAppUpdateStatus({ status: 'available', version: info.version, releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '' }));
autoUpdater.on('update-not-available', (info) => sendAppUpdateStatus({ status: 'not-available', version: info.version }));
autoUpdater.on('download-progress', (progress) => sendAppUpdateStatus({ status: 'downloading', percent: Math.round(progress.percent), transferred: progress.transferred, total: progress.total }));
autoUpdater.on('update-downloaded', (info) => sendAppUpdateStatus({ status: 'downloaded', version: info.version }));
autoUpdater.on('error', (error) => sendAppUpdateStatus({ status: 'error', message: error && error.message ? error.message : 'App update failed.' }));
ipcMain.handle('app:check-update', async () => {
  try {
    if (!app.isPackaged) return { ok: false, message: 'Built-in updates are available in the installed desktop app, not development mode.' };
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, version: result && result.updateInfo ? result.updateInfo.version : null };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Could not check for app updates.' }; }
});
ipcMain.handle('app:download-update', async () => {
  try {
    if (!app.isPackaged) throw new Error('Built-in updates are available in the installed desktop app, not development mode.');
    await autoUpdater.downloadUpdate();
    return { ok: true, message: 'Downloading update…' };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Could not download app update.' }; }
});
ipcMain.handle('app:install-update', () => {
  if (!app.isPackaged) return { ok: false, message: 'Install the packaged desktop app to use the updater.' };
  autoUpdater.quitAndInstall(false, true);
  return { ok: true, message: 'Restarting to install the update…' };
});
ipcMain.handle('mods:get-installed', async () => (await readSettings()).installedMods || {});
ipcMain.handle('bepinex:has-installed', async () => { const settings = await readSettings(); if (!settings.gameFolder) return false; return fs.stat(path.join(path.resolve(settings.gameFolder), 'BepInEx', 'core', 'BepInEx.dll')).then(() => true).catch(() => false); });
ipcMain.handle('mods:install-from-disk', async () => {
  try {
    let settings = await readSettings();
    if (!settings.gameFolder) {
      const selected = await dialog.showOpenDialog({ title: 'Select your Gorilla Tag game folder', properties: ['openDirectory'] });
      if (selected.canceled || !selected.filePaths[0]) return { ok:false, message:'Installation cancelled. Select your game folder first.' };
      settings = { ...settings, gameFolder:selected.filePaths[0] }; await writeSettings(settings);
    }
    const gameFolder = path.resolve(settings.gameFolder);
    if (!isGameFolder(gameFolder)) throw new Error('The selected folder does not look like Gorilla Tag. Choose the folder containing Gorilla Tag.exe / Gorilla Tag_Data.');
    const picked = await dialog.showOpenDialog({ title:'Choose Gorilla Tag mod files', properties:['openFile','multiSelections'], filters:[{name:'BepInEx mods',extensions:['dll','zip']}] });
    if (picked.canceled || !picked.filePaths.length) return { ok:false, message:'No mod files selected.' };
    const pluginRoot = path.join(gameFolder,'BepInEx','plugins'); await fs.mkdir(pluginRoot,{recursive:true});
    const installed = { ...(settings.installedMods || {}) }; const paths = [];
    for (const source of picked.filePaths) {
      const ext = path.extname(source).toLowerCase(); if (!['.dll','.zip'].includes(ext)) continue;
      const base = path.basename(source,ext).replace(/[^a-zA-Z0-9 _.-]/g,'').trim().slice(0,80) || 'Local Mod';
      const target = path.join(pluginRoot,base); await fs.mkdir(target,{recursive:true});
      if (ext === '.dll') { const destination = path.join(target,path.basename(source).replace(/[^a-zA-Z0-9._-]/g,'_')); await fs.copyFile(source,destination); paths.push(destination); }
      else {
        await fs.rm(target, { recursive: true, force: true });
        await fs.mkdir(target, { recursive: true });
        await installModArchive(source, gameFolder, target, base);
        paths.push(target);
      }
      installed['local:'+base] = 'local';
    }
    await writeSettings({ ...settings, installedMods:installed });
    return { ok:true, paths, message: paths.length + ' mod file(s) installed into ' + pluginRoot + '. Check each mod’s README for required dependencies.' };
  } catch (error) { return { ok:false, message:error instanceof Error ? error.message : 'Could not install local mod files.' }; }
});
ipcMain.handle('config:save', async (_event, payload) => {
  try {
    const settings = await readSettings();
    if (!settings.gameFolder) return { ok: false, message: 'Select your Gorilla Tag game folder first.' };
    const safeName = String(payload && payload.modName || 'Mod').replace(/[^a-zA-Z0-9 _.-]/g, '').trim().slice(0,80) || 'Mod';
    const values = payload && payload.values && typeof payload.values === 'object' ? payload.values : {};
    const lines = Object.entries(values).map(([key,value]) => {
      const safeKey = String(key).replace(/[^a-zA-Z0-9_.-]/g, '_');
      const safeValue = String(value).replace(/[\r\n]/g, ' ').slice(0,500);
      return safeKey + ' = ' + safeValue;
    });
    const configDir = path.join(path.resolve(settings.gameFolder), 'BepInEx', 'config');
    await fs.mkdir(configDir, { recursive: true });
    const configPath = path.join(configDir, 'MonkeyModHub.' + safeName.replace(/\s+/g, '_') + '.cfg');
    await fs.writeFile(configPath, '# Generated by ModHub. Some mods require their own documented config format.\n' + lines.join('\n') + '\n', 'utf8');
    return { ok: true, path: configPath, message: 'Settings saved to ' + configPath };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Could not save settings.' }; }
});
ipcMain.handle('mods:get-detected', async () => {
  const settings = await readSettings(); if (!settings.gameFolder) return [];
  const plugins = path.join(path.resolve(settings.gameFolder), 'BepInEx', 'plugins');
  const entries = await fs.readdir(plugins, { withFileTypes: true }).catch(() => []);
  const detected = [];
  for (const entry of entries) {
    const full = path.join(plugins, entry.name);
    if (entry.isDirectory()) {
      const nested = await fs.readdir(full, { withFileTypes: true }).catch(() => []);
      if (nested.some(item => item.isFile() && /\.dll(?:\.disabled)?$/i.test(item.name))) detected.push(entry.name);
    } else if (entry.isFile() && /\.dll(?:\.disabled)?$/i.test(entry.name)) detected.push(entry.name);
  }
  return [...new Set(detected)];
});
ipcMain.handle('game:choose-folder', async () => {
  const current = await readSettings();
  const result = await dialog.showOpenDialog({ title: 'Select your Gorilla Tag game folder', defaultPath: current.gameFolder || undefined, properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return null;
  const gameFolder = result.filePaths[0]; await writeSettings({ ...current, gameFolder }); return gameFolder;
});
ipcMain.handle('bepinex:install', async () => {
  let tempFile = null;
  try {
    if (process.platform !== 'win32' && process.platform !== 'linux') {
      return { ok: false, message: 'Automatic BepInEx setup currently supports Windows and Linux/Steam Proton. Open the official releases page for macOS packages and instructions.' };
    }
    let settings = await readSettings();
    if (!settings.gameFolder) {
      const selected = await dialog.showOpenDialog({ title: 'Select your Gorilla Tag game folder', properties: ['openDirectory'] });
      if (selected.canceled || !selected.filePaths[0]) return { ok: false, message: 'Installation cancelled. Select your Gorilla Tag folder first.' };
      settings = { ...settings, gameFolder: selected.filePaths[0] };
      await writeSettings(settings);
    }
    const gameFolder = path.resolve(settings.gameFolder);
    const rootEntries = await fs.readdir(gameFolder).catch(() => []);
    const rootNames = rootEntries.map((name) => name.toLowerCase());
    const looksLikeGame = process.platform === 'linux'
      ? rootNames.some((name) => name === 'gorilla tag.x86_64' || name === 'gorilla tag_data' || name === 'gorilla tag.exe')
      : rootNames.some((name) => name === 'gorilla tag.exe' || name === 'gorilla tag_data');
    if (!looksLikeGame) throw new Error('That folder does not look like a Gorilla Tag installation. Choose the game folder containing Gorilla Tag.exe (Windows) or Gorilla Tag.x86_64 (Linux/Proton), plus Gorilla Tag_Data.');
    const existing = await fs.stat(path.join(gameFolder, 'BepInEx')).then(() => true).catch(() => false);
    if (existing) {
      const choice = await dialog.showMessageBox({
        type: 'warning', buttons: ['Update / overwrite', 'Cancel'], defaultId: 1, cancelId: 1,
        title: 'BepInEx is already installed',
        message: 'BepInEx folder already exists.',
        detail: 'This will merge the official BepInEx files into your game folder. Your plugins folder is not deliberately deleted, but back up your mods first.'
      });
      if (choice.response !== 0) return { ok: false, message: 'BepInEx installation cancelled.' };
    }
    const url = 'https://github.com/BepInEx/BepInEx/releases/download/v5.4.23.5/BepInEx_win_x64_5.4.23.5.zip';
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error('Official BepInEx download failed with HTTP ' + response.status + '.');
    if (new URL(response.url).protocol !== 'https:') throw new Error('BepInEx download redirected to an unsafe URL.');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 100 * 1024 * 1024) throw new Error('BepInEx archive was empty or exceeded the 100 MB safety limit.');
    tempFile = path.join(app.getPath('temp'), 'bepinex-win-x64-' + Date.now() + '.zip');
    await fs.writeFile(tempFile, buffer);
    await extractZip(tempFile, { dir: gameFolder });
    return { ok: true, path: gameFolder, message: 'BepInEx 5.4.23.5 installed into ' + gameFolder };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not install BepInEx.' };
  } finally {
    if (tempFile) await fs.rm(tempFile, { force: true }).catch(() => {});
  }
});
ipcMain.handle('mod:install', async (_event, mod) => {
  try {
    const downloadUrl = new URL(String(mod && mod.downloadUrl || ''));
    if (downloadUrl.protocol !== 'https:') throw new Error('Only HTTPS download links are allowed.');
    if (!mod || !mod.name || !mod.version) throw new Error('This mod entry is missing its name or version.');
    let settings = await readSettings();
    if (!settings.gameFolder) {
      const selected = await dialog.showOpenDialog({ title: 'Select your Gorilla Tag game folder', properties: ['openDirectory'] });
      if (selected.canceled || !selected.filePaths[0]) return { ok: false, message: 'Installation cancelled. Select a game folder to install.' };
      settings = { ...settings, gameFolder: selected.filePaths[0] }; await writeSettings(settings);
    }
    const gameFolder = path.resolve(settings.gameFolder);
    const rootEntries = await fs.readdir(gameFolder).catch(() => []);
    const rootNames = rootEntries.map((name) => name.toLowerCase());
    const looksLikeGame = rootNames.some((name) => name === 'gorilla tag.exe' || name === 'gorilla tag.x86_64' || name === 'gorilla tag.app' || name === 'gorilla tag_data');
    if (!looksLikeGame) throw new Error('That folder does not look like a Gorilla Tag installation. Choose the folder containing Gorilla Tag.exe or Gorilla Tag_Data.');
    const response = await fetch(downloadUrl.toString(), { redirect: 'follow', signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error('Download failed with HTTP ' + response.status + '.');
    if (new URL(response.url).protocol !== 'https:') throw new Error('The download redirected to an unsafe URL.');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 180 * 1024 * 1024) throw new Error('Download is empty or too large (180 MB limit).');
    const finalUrl = new URL(response.url);
    const ext = path.extname(finalUrl.pathname).toLowerCase();
    if (['.dll', '.zip'].indexOf(ext) < 0) throw new Error('Only .dll and .zip mod files can be installed by the desktop app.');
    const safeName = path.basename(decodeURIComponent(finalUrl.pathname)).replace(/[^a-zA-Z0-9._-]/g, '_');
    const tempFile = path.join(app.getPath('temp'), 'monkey-mod-' + Date.now() + '-' + safeName);
    await fs.writeFile(tempFile, buffer);
    try {
      const safeModName = String(mod.name).replace(/[^a-zA-Z0-9 _.-]/g, '').trim().slice(0, 80) || 'Mod';
      const pluginDir = path.join(gameFolder, 'BepInEx', 'plugins', safeModName);
      await fs.rm(pluginDir, { recursive: true, force: true });
      await fs.mkdir(pluginDir, { recursive: true });
      if (ext === '.dll') {
        const installedPath = path.join(pluginDir, safeName);
        await fs.copyFile(tempFile, installedPath);
        const latestSettings = await readSettings();
        await writeSettings({ ...latestSettings, installedMods: { ...(latestSettings.installedMods || {}), [String(mod.id)]: String(mod.version) } });
        return { ok: true, path: installedPath, message: mod.name + ' installed to its own folder: ' + pluginDir };
      }
      await extractZip(tempFile, { dir: pluginDir });
      const latestSettings = await readSettings();
      await writeSettings({ ...latestSettings, installedMods: { ...(latestSettings.installedMods || {}), [String(mod.id)]: String(mod.version) } });
      return { ok: true, path: pluginDir, message: mod.name + ' ZIP extracted into its own plugin folder: ' + pluginDir };
    } finally { await fs.rm(tempFile, { force: true }).catch(() => {}); }
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Could not install this mod.' }; }
});
ipcMain.handle('auth:github-sign-in', async () => { await shell.openExternal('https://modhub.duckdns.org/auth/github?desktop=1'); return { ok: true }; });

app.whenReady().then(() => {
  createWindow();
  const link = process.argv.find((arg) => arg.startsWith('monkeymodmanager://'));
  if (link) handleAuthDeepLink(link);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
