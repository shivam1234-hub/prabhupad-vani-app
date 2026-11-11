'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const { startServer } = require('./lib/server');
const { DownloadManager } = require('./lib/downloads');

// Startup safety net: a startup failure must never leave a windowless process
// holding the single-instance lock (every later launch would silently do
// nothing). Log to userData/startup.log and tell the user.
function startupLog(...parts) {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'startup.log'),
      `[${new Date().toISOString()}] ${parts.map(String).join(' ')}\n`);
  } catch { /* best-effort */ }
}
function fatal(where, err) {
  startupLog('FATAL', where, err && err.stack ? err.stack : err);
  try {
    dialog.showErrorBox(`${app.getName()} could not start`,
      `${where}: ${err && err.message ? err.message : err}\n\nDetails: ${path.join(app.getPath('userData'), 'startup.log')}`);
  } catch { /* no UI */ }
}
process.on('uncaughtException', (err) => fatal('Unexpected error', err));
process.on('unhandledRejection', (err) => fatal('Unexpected error', err));

// The Expo web export. `npm run build` writes it here; see README.md.
const WEB_DIR = path.join(__dirname, 'web');

// Where Vanisource and its CDN live. Requests to anything else are refused
// outright, so a compromised page can't quietly phone somewhere new.
const ALLOWED_HOSTS = [
  'vanisource.org',
  'www.vanisource.org',
  'vanipedia.org',
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'i.ytimg.com',
  's.ytimg.com',
  'yt3.ggpht.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];
/** Vanisource serves the MP3s off buckets whose names vary, so match by suffix too. */
const ALLOWED_HOST_SUFFIXES = ['.amazonaws.com', '.archive.org', '.googlevideo.com', '.ytimg.com'];

let mainWindow = null;
let downloads = null;
let server = null;
let origin = '';

// Development only: a throwaway profile for automated UI runs.
if (!app.isPackaged && process.env.PV_USERDATA) app.setPath('userData', process.env.PV_USERDATA);
const userData = app.getPath('userData');
const AUDIO_DIR = path.join(userData, 'audio');
const REGISTRY_PATH = path.join(userData, 'downloads.json');
const WINDOW_STATE_PATH = path.join(userData, 'window-state.json');

// ---------------------------------------------------------------------------
// Window

function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(WINDOW_STATE_PATH, 'utf8'));
    if (typeof s.width === 'number' && typeof s.height === 'number') return s;
  } catch {}
  return { width: 1360, height: 860 };
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  const state = { ...win.getNormalBounds(), maximized: win.isMaximized() };
  fs.writeFileSync(WINDOW_STATE_PATH, JSON.stringify(state), 'utf8');
}

function createWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    // The desktop layout (sidebar + two-pane lecture page) needs room; below
    // ~1100px the sidebar folds to an icon rail on its own.
    minWidth: 1000,
    minHeight: 640,
    title: 'Prabhupada Vani',
    // Matches the app's own background so the window doesn't flash white
    // while the 4 MB bundle parses.
    backgroundColor: '#0a0d1a',
    show: false,
    autoHideMenuBar: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload needs require(); the renderer stays sandboxed by contextIsolation
      spellcheck: false,
      // Chromium pauses timers and media in occluded windows, which would stall
      // playback the moment the app is minimised behind another window.
      backgroundThrottling: false,
    },
  });

  if (state.maximized) mainWindow.maximize();

  // Never stay invisible: show after 4 s even if ready-to-show never fires.
  const reveal = () => { if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show(); };
  setTimeout(() => { if (!process.env.YT_SHOTS_HIDDEN) reveal(); }, 4000);
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => { startupLog('did-fail-load', code, desc, url); reveal(); });
  mainWindow.webContents.on('render-process-gone', (_e, d) => { startupLog('render-process-gone', JSON.stringify(d)); reveal(); });
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Keep in-app navigation inside the app; send real links to the browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(origin)) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  let saveTimer = null;
  const queueSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveWindowState(mainWindow), 400);
  };
  mainWindow.on('resize', queueSave);
  mainWindow.on('move', queueSave);
  mainWindow.on('close', () => {
    clearTimeout(saveTimer);
    saveWindowState(mainWindow);
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.loadURL(origin);

  // Development-only UI automation (screenshots). Never active in a packaged
  // build: PV_AUTOMATION names a script that drives the window.
  if (!app.isPackaged && process.env.PV_AUTOMATION) {
    mainWindow.webContents.once('did-finish-load', () => {
      const run = require(path.resolve(process.env.PV_AUTOMATION));
      Promise.resolve(run({ win: mainWindow, origin, app }))
        .catch((e) => console.error('[automation]', e))
        .finally(() => { if (!process.env.PV_KEEP_OPEN) app.quit(); });
    });
  }
}

// ---------------------------------------------------------------------------
// Network policy

function configureSession() {
  const ses = session.defaultSession;

  // Note: deliberately no CORS header rewriting here. Vanisource's edge already
  // sends `Access-Control-Allow-Origin: *` on every response, so the renderer's
  // fetch in hooks/useTranscript.ts works from a loopback origin as-is. Adding
  // our own copy of that header would give Chromium two of them, which it
  // rejects as an invalid CORS response — the same trap that makes the mobile
  // build's `&origin=*` parameter web-only-harmful.

  ses.webRequest.onBeforeRequest((details, callback) => {
    const { url } = details;
    if (url.startsWith(origin) || url.startsWith('devtools:') || url.startsWith('blob:') || url.startsWith('data:')) {
      callback({});
      return;
    }
    let host;
    try {
      host = new URL(url).hostname;
    } catch {
      callback({ cancel: true });
      return;
    }
    const ok = ALLOWED_HOSTS.includes(host) || ALLOWED_HOST_SUFFIXES.some((s) => host.endsWith(s));
    callback({ cancel: !ok });
  });

  // Nothing here needs a camera, a microphone or your location.
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
}

// ---------------------------------------------------------------------------
// Menu

function buildMenu() {
  const send = (command) => () => mainWindow?.webContents.send('app:command', command);

  const template = [
    {
      label: '&File',
      submenu: [
        {
          label: 'Open Downloads Folder',
          click: () => shell.openPath(AUDIO_DIR),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    { role: 'editMenu', label: '&Edit' },
    {
      // Every accelerator here is modifier-based on purpose. A menu accelerator
      // outranks the web page, so binding bare Space or the arrow keys would
      // make them unusable for typing in the search box and for scrolling the
      // transcript. The renderer binds those bare keys itself (see
      // contexts/AudioContext.web.tsx), where it can tell whether a text field
      // has focus and stay out of the way when one does.
      label: '&Playback',
      submenu: [
        { label: 'Play / Pause\tSpace', accelerator: 'CommandOrControl+P', click: send('playPause') },
        { label: 'Back 15 Seconds\tLeft', accelerator: 'CommandOrControl+Left', click: send('back15') },
        { label: 'Forward 15 Seconds\tRight', accelerator: 'CommandOrControl+Right', click: send('forward15') },
        { type: 'separator' },
        { label: 'Speed Up', accelerator: 'CommandOrControl+Shift+Right', click: send('speedUp') },
        { label: 'Slow Down', accelerator: 'CommandOrControl+Shift+Left', click: send('speedDown') },
        { label: 'Normal Speed', accelerator: 'CommandOrControl+0', click: send('speedReset') },
        { type: 'separator' },
        { label: 'Stop', accelerator: 'CommandOrControl+.', click: send('stop') },
      ],
    },
    {
      label: '&View',
      submenu: [
        // Reload and DevTools are for development only; a packaged build
        // shows zoom and full screen.
        ...(app.isPackaged ? [] : [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }]),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '&Help',
      submenu: [
        {
          label: 'Vanisource.org',
          click: () => shell.openExternal('https://vanisource.org'),
        },
        {
          label: 'About Prabhupada Vani',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Prabhupada Vani',
              message: 'Prabhupada Vani',
              detail:
                `Version ${app.getVersion()}\n\n` +
                'Lectures, conversations and letters of Srila Prabhupada,\n' +
                'sourced from vanisource.org.',
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// IPC

function registerIpc() {
  ipcMain.on('desktop:version', (event) => { event.returnValue = app.getVersion(); });

  ipcMain.handle('downloads:getState', () => ({
    registry: downloads.publicRegistry(),
    progress: downloads.progress,
  }));
  ipcMain.handle('downloads:download', (_e, id, url) => downloads.downloadRecording(id, url));
  ipcMain.handle('downloads:batch', (_e, items) => downloads.downloadBatch(items));
  ipcMain.handle('downloads:cancel', (_e, id) => downloads.cancelDownload(id));
  ipcMain.handle('downloads:delete', (_e, id) => downloads.deleteDownload(id));
  ipcMain.handle('downloads:deleteAll', () => downloads.deleteAll());
  ipcMain.handle('downloads:readTranscript', async (_e, id) => {
    // Guard against a renderer-supplied id escaping the audio folder.
    if (typeof id !== 'string' || !id || /[\\/]|^\.\.?$/.test(id)) return null;
    try {
      const raw = await fsp.readFile(path.join(AUDIO_DIR, id, 'transcript.json'), 'utf8');
      return JSON.parse(raw)?.wikitext ?? null;
    } catch {
      return null;
    }
  });

  ipcMain.handle('downloads:openFolder', async () => {
    await fsp.mkdir(AUDIO_DIR, { recursive: true }).catch(() => {});
    shell.openPath(AUDIO_DIR);
  });

  // Backs the Alert.alert polyfill in utils/webAlert.web.ts. Takes the button
  // labels React Native was given and returns the index of the one pressed, so
  // the polyfill can call that button's onPress and nothing else has to change.
  ipcMain.handle('dialog:show', async (_e, opts = {}) => {
    const buttons = Array.isArray(opts.buttons) && opts.buttons.length > 0
      ? opts.buttons.map(String)
      : ['OK'];

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: opts.destructive ? 'warning' : (buttons.length > 1 ? 'question' : 'info'),
      title: opts.title || 'Prabhupada Vani',
      message: opts.title || opts.message || '',
      detail: opts.title ? (opts.message ?? '') : '',
      buttons,
      defaultId: clampIndex(opts.defaultId, buttons.length, 0),
      cancelId: clampIndex(opts.cancelId, buttons.length, buttons.length - 1),
      noLink: true,
    });
    return response;
  });
}

/** Keep a renderer-supplied button index inside the range the dialog actually has. */
function clampIndex(value, length, fallback) {
  return Number.isInteger(value) && value >= 0 && value < length ? value : fallback;
}

// ---------------------------------------------------------------------------
// Boot

// The office network intercepts TLS. For LOCAL testing only, PV_IGNORE_CERT=1
// lets an unpackaged run reach vanisource; a packaged build never honours it.
if (!app.isPackaged && process.env.PV_IGNORE_CERT === '1') {
  app.commandLine.appendSwitch('ignore-certificate-errors');
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    startupLog('start', app.getVersion(), process.platform, process.arch, app.getPath('exe'));
    if (!fs.existsSync(path.join(WEB_DIR, 'index.html'))) {
      dialog.showErrorBox(
        'Web bundle missing',
        `No Expo web export found at:\n${WEB_DIR}\n\n` +
          'Run "npm run build" in the desktop folder (or "npm run desktop:build" ' +
          'in the project root) to produce it, then start the app again.',
      );
      app.quit();
      return;
    }

    ({ server, origin } = await startServer({ webDir: WEB_DIR, audioDir: AUDIO_DIR }));

    downloads = new DownloadManager({ audioDir: AUDIO_DIR, registryPath: REGISTRY_PATH });
    downloads.audioBaseUrl = origin;
    downloads.on('registry', (registry) => mainWindow?.webContents.send('downloads:registry', registry));
    downloads.on('progress', (progress) => mainWindow?.webContents.send('downloads:progress', progress));
    await downloads.load();

    // macOS ignores BrowserWindow's `icon` and takes the Dock icon from the
    // .app bundle, which an unpackaged `electron .` run does not have — so a
    // dev run would otherwise show Electron's own logo. Windows has no such
    // problem: it uses the `icon` below, and the packaged .exe embeds
    // build/icon.ico.
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(path.join(__dirname, 'build', 'icon.png'));
    }

    configureSession();
    registerIpc();
    buildMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    server?.close();
    app.quit();
  });
}
