/* global __dirname, Buffer */
// The desktop shell: one window that shows the app (built into ../dist by `expo export`) and
// keeps the closet on this computer, in the closet folder:
//   closet.json   everything except pictures
//   photos/       the pictures
// The closet folder is <user data>/closet unless the user picked another one (Profile → Closet
// file → Change folder), which is remembered in <user data>/settings.json.
// <user data> is ~/Library/Application Support/Closet on a Mac, %APPDATA%\Closet on Windows.
const { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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
              { label: 'Check for Updates…', click: send('check-updates') },
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
        ...(mac ? [] : [{ label: 'Check for Updates…', click: send('check-updates') }]),
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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
