const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const extractZip = require('extract-zip');

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
async function readSettings() { try { return JSON.parse(await fs.readFile(settingsFile(), 'utf8')); } catch { return {}; } }
async function writeSettings(settings) {
  await fs.mkdir(path.dirname(settingsFile()), { recursive: true });
  await fs.writeFile(settingsFile(), JSON.stringify(settings, null, 2), 'utf8');
}
function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 960, minWidth: 780, minHeight: 600,
    title: 'Monkey Mod Hub V2', backgroundColor: '#0b0e12', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url); return { action: 'deny' }; });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}
ipcMain.handle('game:get-folder', async () => (await readSettings()).gameFolder || null);
ipcMain.handle('game:choose-folder', async () => {
  const current = await readSettings();
  const result = await dialog.showOpenDialog({ title: 'Select your Gorilla Tag game folder', defaultPath: current.gameFolder || undefined, properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return null;
  const gameFolder = result.filePaths[0]; await writeSettings({ ...current, gameFolder }); return gameFolder;
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
      if (ext === '.dll') {
        const pluginDir = path.join(gameFolder, 'BepInEx', 'plugins');
        await fs.mkdir(pluginDir, { recursive: true });
        const installedPath = path.join(pluginDir, safeName);
        await fs.copyFile(tempFile, installedPath);
        return { ok: true, path: installedPath, message: mod.name + ' installed to ' + installedPath };
      }
      await extractZip(tempFile, { dir: gameFolder });
      return { ok: true, path: gameFolder, message: mod.name + ' archive extracted into ' + gameFolder };
    } finally { await fs.rm(tempFile, { force: true }).catch(() => {}); }
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Could not install this mod.' }; }
});
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
