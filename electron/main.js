/* global __dirname, Buffer */
// The desktop shell: one window that shows the app (built into ../dist by `expo export`) and
// keeps the closet on this computer, in the closet folder:
//   closet.json   everything except pictures
//   photos/       the pictures
// The closet folder is <user data>/closet unless the user picked another one (Profile → Closet
// file → Change folder), which is remembered in <user data>/settings.json.
// <user data> is ~/Library/Application Support/Closet on a Mac, %APPDATA%\Closet on Windows.
const { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } = require('electron');
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { promisify } = require('node:util');

const VERSION = require('../package.json').version;
// New versions are published as GitHub releases here (see README → Publishing an update).
const UPDATE_REPO = 'dklos14-cell/closet-desktop';

app.setName('Closet'); // same data folder whether run from source or installed

const APP_DIR = path.join(__dirname, '..', 'dist');
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_DATA_DIR = path.join(app.getPath('userData'), 'closet');

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

// CLOSET_DATA_DIR (for testing) wins over the folder picked in the app.
const DATA_DIR = process.env.CLOSET_DATA_DIR || readSettings().dataDir || DEFAULT_DATA_DIR;
const DB_FILE = path.join(DATA_DIR, 'closet.json');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');

// app://closet/...  the app's own files.  photo://local/<name>  a picture from the photos folder.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'photo', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

// Only one window may write the closet file at a time.
if (!app.requestSingleInstanceLock()) app.quit();

/** A bare file name (no folders), so nothing outside the photos folder can be touched. */
function photoPath(name) {
  const base = path.basename(String(name));
  if (!base || base !== name || base.startsWith('.')) throw new Error(`Bad photo name: ${name}`);
  return path.join(PHOTO_DIR, base);
}

function serveApp(request) {
  const { pathname } = new URL(request.url);
  let file = path.join(APP_DIR, decodeURIComponent(pathname));
  // Every screen (/closet, /outfits/edit, …) is the same single page.
  if (!file.startsWith(APP_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(APP_DIR, 'index.html');
  }
  return net.fetch(pathToFileURL(file).toString());
}

async function servePhoto(request) {
  try {
    const name = decodeURIComponent(new URL(request.url).pathname.slice(1));
    const bytes = await fs.promises.readFile(photoPath(name));
    const type = name.endsWith('.webp') ? 'image/webp' : name.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
    return new Response(bytes, {
      headers: { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=31536000' },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

/** Writes a file so that a crash halfway can never leave a broken one behind. */
async function writeSafely(file, data) {
  const tmp = `${file}.tmp`;
  await fs.promises.writeFile(tmp, data);
  await fs.promises.rename(tmp, file);
}

let saving = Promise.resolve();

function registerIpc() {
  ipcMain.handle('db:load', async () => {
    try {
      return await fs.promises.readFile(DB_FILE, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return null; // first start: a new, empty closet
      throw e;
    }
  });

  ipcMain.handle('db:save', (_event, json) => {
    // Saves happen one after another, in order. Yesterday's version is kept as closet.json.bak.
    saving = saving.then(async () => {
      try {
        const stat = await fs.promises.stat(DB_FILE);
        if (Date.now() - stat.mtimeMs > 24 * 60 * 60 * 1000 || !fs.existsSync(`${DB_FILE}.bak`)) {
          await fs.promises.copyFile(DB_FILE, `${DB_FILE}.bak`);
        }
      } catch {
        // No closet file yet.
      }
      await writeSafely(DB_FILE, json);
    });
    return saving;
  });

  ipcMain.handle('photo:save', (_event, name, bytes) => writeSafely(photoPath(name), Buffer.from(bytes)));
  ipcMain.handle('photo:read', (_event, name) => fs.promises.readFile(photoPath(name)));
  ipcMain.handle('photo:delete', (_event, name) => fs.promises.rm(photoPath(name), { force: true }));

  ipcMain.handle('file:export', async (event, defaultName, bytes) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export closet',
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters: [{ name: 'Closet file', extensions: ['zip'] }],
    });
    if (canceled || !filePath) return null;
    await writeSafely(filePath, Buffer.from(bytes));
    return filePath;
  });

  ipcMain.handle('file:import', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Import a closet',
      properties: ['openFile'],
      filters: [{ name: 'Closet file', extensions: ['zip'] }],
    });
    if (canceled || filePaths.length === 0) return null;
    return fs.promises.readFile(filePaths[0]);
  });

  ipcMain.handle('folder:open', () => shell.openPath(DATA_DIR));

  // A right-click menu. Resolves with the chosen entry's id, or null if it was closed.
  ipcMain.handle('menu:popup', (event, entries) => {
    return new Promise((resolve) => {
      const build = (list) =>
        list.map((e) =>
          e.separator
            ? { type: 'separator' }
            : e.submenu
              ? { label: e.label, submenu: build(e.submenu) }
              : {
                  label: e.label,
                  enabled: e.enabled !== false,
                  ...(e.checked === undefined ? {} : { type: 'checkbox', checked: e.checked }),
                  click: () => resolve(e.id),
                },
        );
      Menu.buildFromTemplate(build(entries)).popup({
        window: BrowserWindow.fromWebContents(event.sender),
        // Closing also fires when an entry was clicked; that click has already answered by then.
        callback: () => setTimeout(() => resolve(null), 100),
      });
    });
  });

  ipcMain.handle('app:info', () => ({ version: VERSION, autoUpdate: readSettings().autoUpdate !== false }));
  ipcMain.handle('update:check', (event) => checkForUpdates(BrowserWindow.fromWebContents(event.sender), false));
  ipcMain.handle('update:auto', async (_event, on) => {
    const settings = readSettings();
    settings.autoUpdate = !!on;
    await writeSafely(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  });

  ipcMain.handle('folder:get', () => ({
    path: DATA_DIR,
    isDefault: DATA_DIR === DEFAULT_DATA_DIR,
    canChange: !process.env.CLOSET_DATA_DIR,
  }));

  ipcMain.handle('folder:change', async (event, useDefault) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    let target = DEFAULT_DATA_DIR;
    if (!useDefault) {
      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: 'Choose where to keep your closet',
        buttonLabel: 'Keep closet here',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (canceled || filePaths.length === 0) return false;
      // A folder that already holds a closet is used as it is; otherwise a "Closet" folder is made in it.
      target = fs.existsSync(path.join(filePaths[0], 'closet.json')) ? filePaths[0] : path.join(filePaths[0], 'Closet');
    }
    if (path.resolve(target) === path.resolve(DATA_DIR)) return false;
    if (path.resolve(target).startsWith(path.resolve(DATA_DIR) + path.sep)) {
      throw new Error('Pick a folder outside the current closet folder.');
    }

    if (fs.existsSync(path.join(target, 'closet.json'))) {
      // Someone's closet is already there (e.g. copied from another computer): open that one.
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Open that closet', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        message: 'This folder already has a closet in it.',
        detail: `Open the closet in\n${target}\ninstead? Your current closet stays where it is:\n${DATA_DIR}`,
      });
      if (response !== 0) return false;
    } else {
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Move closet', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        message: 'Move your closet?',
        detail: `Your closet and all its photos move from\n${DATA_DIR}\nto\n${target}\n\nCloset restarts when it's done.`,
      });
      if (response !== 0) return false;
      await saving; // finish any save in progress first
      // Copy everything, and only remove the old folder's files once the copy is complete.
      await fs.promises.mkdir(target, { recursive: true });
      await fs.promises.cp(DATA_DIR, target, { recursive: true, errorOnExist: false, force: true });
      const copied = fs.existsSync(path.join(target, 'closet.json')) || !fs.existsSync(DB_FILE);
      if (!copied) throw new Error('Copying the closet failed; nothing was moved.');
      for (const name of ['closet.json', 'closet.json.bak', 'photos']) {
        await fs.promises.rm(path.join(DATA_DIR, name), { recursive: true, force: true });
      }
    }

    const settings = readSettings();
    if (target === DEFAULT_DATA_DIR) delete settings.dataDir;
    else settings.dataDir = target;
    await writeSafely(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    app.relaunch();
    app.exit(0);
    return true;
  });
}

// --- Updates ----------------------------------------------------------------------------------
// Check: ask GitHub for the newest release and compare its version with this one.
// Install: download that release's installer, then
//   Mac      copy the new Closet.app over this one and restart (if that fails: open the .dmg),
//   Windows  run the installer silently; it closes Closet, installs, and opens it again.
// The closet itself is in the data folder, so updating never touches it.

/** "v1.2.0" → [1, 2, 0] */
const versionParts = (v) => String(v).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
function isNewer(latest, current) {
  const a = versionParts(latest);
  const b = versionParts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

/** The release file for this computer: the .dmg (Mac) or Setup .exe (Windows), else the zip. */
function pickAsset(assets) {
  const mac = process.platform === 'darwin';
  const ends = (ext) => assets.find((a) => a.name.toLowerCase().endsWith(ext));
  const zip = assets.find((a) => a.name.toLowerCase().endsWith('.zip') && a.name.toLowerCase().includes(mac ? 'mac' : 'windows'));
  return (mac ? ends('.dmg') : ends('.exe')) ?? zip ?? null;
}

let updating = false;

/** quiet: the automatic check when Closet opens; only speaks up if there is a new version. */
async function checkForUpdates(win, quiet) {
  if (updating) return;
  let release;
  try {
    const res = await net.fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Closet-app' },
    });
    if (res.status === 404) throw new Error('No new versions have been published yet.');
    if (!res.ok) throw new Error(`GitHub answered ${res.status}. Try again later.`);
    release = await res.json();
  } catch (e) {
    if (!quiet) {
      const offline = !(e instanceof Error) || !/published|GitHub/.test(e.message);
      await dialog.showMessageBox(win, {
        type: 'info',
        message: "Couldn't check for updates",
        detail: offline ? `${e.message}\n\nCheck your internet connection and try again.` : e.message,
      });
    }
    return;
  }
  const latest = String(release.tag_name ?? release.name ?? '').replace(/^v/i, '');
  if (!isNewer(latest, VERSION)) {
    if (!quiet) await dialog.showMessageBox(win, { type: 'info', message: "You're up to date", detail: `Closet ${VERSION} is the newest version.` });
    return;
  }
  const asset = pickAsset(release.assets ?? []);
  const notes = String(release.body ?? '').trim().slice(0, 1200);
  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    buttons: asset ? ['Update now', 'Later'] : ['Open download page', 'Later'],
    defaultId: 0,
    cancelId: 1,
    message: `Closet ${latest} is available`,
    detail: `You have ${VERSION}.${notes ? `\n\nWhat's new:\n${notes}` : ''}\n\nYour closet stays as it is.`,
  });
  if (response !== 0) return;
  if (!asset) return shell.openExternal(release.html_url);
  updating = true;
  try {
    const file = await download(asset, win);
    await install(file, win);
  } catch (e) {
    await dialog.showMessageBox(win, {
      type: 'warning',
      message: 'The update could not be installed',
      detail: `${e.message}\n\nYou can download it yourself from the release page instead.`,
    });
    shell.openExternal(release.html_url);
  } finally {
    updating = false;
    if (!win.isDestroyed()) {
      win.setProgressBar(-1);
      win.setTitle('Closet');
    }
  }
}

/** Downloads a release file into a temporary folder, showing progress on the Dock / taskbar icon. */
async function download(asset, win) {
  const dir = path.join(app.getPath('temp'), 'closet-update');
  await fs.promises.rm(dir, { recursive: true, force: true });
  await fs.promises.mkdir(dir, { recursive: true });
  const file = path.join(dir, path.basename(asset.name));
  const res = await net.fetch(asset.browser_download_url, { headers: { 'User-Agent': 'Closet-app' } });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}).`);
  const total = Number(res.headers.get('content-length')) || asset.size || 0;
  const out = fs.createWriteStream(file);
  let done = 0;
  let shown = -1;
  for await (const chunk of res.body) {
    done += chunk.length;
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    const pct = total ? Math.floor((done / total) * 100) : 0;
    if (pct !== shown && !win.isDestroyed()) {
      shown = pct;
      win.setProgressBar(total ? done / total : 2); // 2 = "busy" without a percentage
      win.setTitle(`Closet: downloading update ${total ? `${pct}%` : `${Math.round(done / 1e6)} MB`}`);
    }
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  if (total && done < total) throw new Error('The download was incomplete.');
  return file;
}

const run = promisify(execFile);

async function install(file, win) {
  if (process.platform === 'win32' && file.toLowerCase().endsWith('.exe')) {
    // Silent install over the old version; --force-run opens Closet again when it's done.
    spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
    app.quit();
    return;
  }
  if (process.platform === 'darwin' && file.toLowerCase().endsWith('.dmg') && app.isPackaged) {
    // This app: …/Closet.app/Contents/MacOS/Closet → …/Closet.app
    const bundle = path.resolve(process.execPath, '..', '..', '..');
    const mount = path.join(path.dirname(file), 'mount');
    await fs.promises.mkdir(mount, { recursive: true });
    try {
      await run('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, file]);
      const appName = (await fs.promises.readdir(mount)).find((n) => n.endsWith('.app'));
      if (!appName) throw new Error('No app found in the download.');
      // Copy next to the old app first, then swap, so a failure never leaves you without Closet.
      const fresh = `${bundle}.new`;
      const old = `${bundle}.old`;
      await fs.promises.rm(fresh, { recursive: true, force: true });
      await fs.promises.rm(old, { recursive: true, force: true });
      await run('ditto', [path.join(mount, appName), fresh]);
      await fs.promises.rename(bundle, old);
      await fs.promises.rename(fresh, bundle);
      await fs.promises.rm(old, { recursive: true, force: true });
    } catch (e) {
      // Usually: no permission to change the Applications folder. Fall back to the installer.
      await run('hdiutil', ['detach', mount, '-force']).catch(() => {});
      return openInstaller(file, win, e);
    }
    await run('hdiutil', ['detach', mount, '-force']).catch(() => {});
    await dialog.showMessageBox(win, { type: 'info', message: 'Update installed', detail: 'Closet restarts now.' });
    app.relaunch();
    app.exit(0);
    return;
  }
  return openInstaller(file, win);
}

/** The manual way: open the downloaded installer and say what to do. */
async function openInstaller(file, win, why) {
  const mac = process.platform === 'darwin';
  await shell.openPath(file);
  await dialog.showMessageBox(win, {
    type: 'info',
    message: 'Finish the update',
    detail:
      (why ? `Closet couldn't replace itself (${why.message}).\n\n` : '') +
      (mac
        ? 'The installer is open. Quit Closet (⌘Q), drag Closet into Applications, choose Replace, then open Closet again.'
        : 'The installer is open. Follow its steps; Closet closes and the new version is installed.') +
      '\n\nYour closet stays as it is.',
  });
}

/** Sends a menu command (see src/lib/commands.ts) to the window. */
function send(command) {
  return (_item, win) => {
    const target = win ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    target?.webContents.send('command', command);
  };
}

function buildMenu() {
  const mac = process.platform === 'darwin';
  const go = (label, accelerator, command) => ({ label, accelerator, click: send(command) });
  const template = [
    ...(mac
      ? [
          {
            label: 'Closet',
            submenu: [
              { role: 'about' },
              { label: 'Check for Updates…', click: (_i, win) => checkForUpdates(win ?? BrowserWindow.getAllWindows()[0], false) },
              { type: 'separator' },
              go('Settings…', 'CmdOrCtrl+,', 'go:profile'),
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        go('Add Clothes…', 'CmdOrCtrl+N', 'new-item'),
        go('New Outfit', 'CmdOrCtrl+Shift+N', 'new-outfit'),
        go('Pick an Outfit for Me', 'CmdOrCtrl+Shift+P', 'pick-outfit'),
        { type: 'separator' },
        go('Save', 'CmdOrCtrl+S', 'save'),
        { type: 'separator' },
        go('Export Closet…', 'CmdOrCtrl+E', 'export'),
        go('Import a Closet…', 'CmdOrCtrl+Shift+I', 'import'),
        go('Show Closet Folder', undefined, 'show-folder'),
        ...(mac ? [] : [{ type: 'separator' }, go('Settings', 'Ctrl+,', 'go:profile'), { role: 'quit' }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        // Undo/Redo go to the app: the cut-out editor and text boxes each handle them.
        go('Undo', 'CmdOrCtrl+Z', 'undo'),
        go('Redo', mac ? 'Cmd+Shift+Z' : 'Ctrl+Y', 'redo'),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        go('Find in Closet', 'CmdOrCtrl+F', 'find'),
      ],
    },
    {
      label: 'View',
      submenu: [
        // Zoom the photo or outfit being edited (not the whole window).
        go('Zoom In', 'CmdOrCtrl+=', 'zoom-in'),
        go('Zoom Out', 'CmdOrCtrl+-', 'zoom-out'),
        go('Fit', 'CmdOrCtrl+0', 'zoom-fit'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'reload', accelerator: 'CmdOrCtrl+Shift+R' },
        { role: 'toggleDevTools', accelerator: mac ? 'Alt+Cmd+I' : 'Ctrl+Shift+J' },
      ],
    },
    {
      label: 'Go',
      submenu: [
        go('Today', 'CmdOrCtrl+1', 'go:index'),
        go('Closet', 'CmdOrCtrl+2', 'go:closet'),
        go('Outfits', 'CmdOrCtrl+3', 'go:outfits'),
        go('Favorites', 'CmdOrCtrl+4', 'go:favorites'),
        go('Calendar', 'CmdOrCtrl+5', 'go:calendar'),
        go('Stats', 'CmdOrCtrl+6', 'go:stats'),
        go('Tags', 'CmdOrCtrl+7', 'go:tags'),
        go('Profile', 'CmdOrCtrl+8', 'go:profile'),
        { type: 'separator' },
        { label: 'Back', accelerator: 'CmdOrCtrl+[', click: (_i, win) => win?.webContents.navigationHistory.goBack() },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        go('Keyboard Shortcuts', 'CmdOrCtrl+/', 'shortcuts'),
        ...(mac ? [] : [{ label: 'Check for Updates…', click: (_i, win) => checkForUpdates(win ?? BrowserWindow.getAllWindows()[0], false) }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 380,
    minHeight: 600,
    title: 'Closet',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  // Links to other websites open in the normal browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://')) event.preventDefault();
  });
  win.loadURL('app://closet/');
  return win;
}

app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  protocol.handle('app', serveApp);
  protocol.handle('photo', servePhoto);
  registerIpc();
  buildMenu();
  const win = createWindow();
  // Look for a new version a little after opening (can be turned off in Profile → Updates).
  if (app.isPackaged && readSettings().autoUpdate !== false) {
    setTimeout(() => !win.isDestroyed() && checkForUpdates(win, true), 8000);
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
