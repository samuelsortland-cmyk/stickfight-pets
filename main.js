'use strict';
// Electron main process: a transparent, click-through, always-on-top overlay that
// covers the primary display, plus a tray menu, global hotkeys, live cursor
// tracking, a desktop-window tracker so the fighters can stand on your windows,
// and the self-updater.
const { app, BrowserWindow, screen, ipcMain, Tray, Menu, globalShortcut, nativeImage } = require('electron');
const path = require('path');
const { startWindowTracker } = require('./src/windows');
const updater = require('./updater');

const OVERLAY_TITLE = 'StickFight Overlay';
const UPDATE_EVERY_MS = 3 * 60 * 60 * 1000;

if (process.platform === 'linux') {
  // Transparent windows on X11 need these to composite correctly.
  app.commandLine.appendSwitch('enable-transparent-visuals');
  if (process.env.STICKFIGHT_GPU !== '1') app.disableHardwareAcceleration();
}

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let tray = null;
let tracker = null;
let display = null;
let capture = false;
let toolMode = false;
let autoUpdate = true;
let updateTimer = null;
let updating = false;

function send(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

function envInfo() {
  const b = display.bounds;
  const w = display.workArea;
  return {
    width: b.width,
    height: b.height,
    workArea: { x: w.x - b.x, y: w.y - b.y, width: w.width, height: w.height },
    scaleFactor: display.scaleFactor,
    platform: process.platform,
    version: updater.localVersion(),
  };
}

function applyCapture() {
  if (!win || win.isDestroyed()) return;
  win.setIgnoreMouseEvents(!(capture || toolMode), { forward: true });
}

function createWindow() {
  display = screen.getPrimaryDisplay();
  const b = display.bounds;
  win = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    title: OVERLAY_TITLE,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  applyCapture();
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.webContents.on('did-finish-load', () => send('env', envInfo()));
  win.on('page-title-updated', (e) => e.preventDefault());

  // The renderer can't see the mouse while the overlay is click-through, so
  // poll the real cursor and stream it over.
  setInterval(() => {
    if (!display) return;
    const p = screen.getCursorScreenPoint();
    send('cursor', { x: p.x - display.bounds.x, y: p.y - display.bounds.y });
  }, 16);

  tracker = startWindowTracker({
    overlayTitle: OVERLAY_TITLE,
    pid: process.pid,
    onWindows: (list) => {
      const b = display.bounds;
      const k = process.platform === 'win32' ? display.scaleFactor : 1;
      send('windows', list.map((r) => ({
        id: r.id,
        title: r.title || '',
        x: r.x / k - b.x,
        y: r.y / k - b.y,
        w: r.w / k,
        h: r.h / k,
      })));
    },
  });
}

// ---- updates ---------------------------------------------------------------
async function runUpdate(manual) {
  if (updating) return;
  updating = true;
  if (manual) send('update-status', { text: 'Checking for updates…' });
  let res;
  try { res = await updater.checkForUpdates(); } catch (e) { res = { status: 'error', message: 'Update failed: ' + e.message }; }
  updating = false;
  if (res.status === 'updated') {
    send('update-status', { text: `${res.message} Restarting…`, toast: true });
    setTimeout(() => { app.relaunch(); app.exit(0); }, 2500);
  } else if (manual) {
    send('update-status', { text: res.message, toast: res.status === 'error' });
  } else if (res.status === 'latest') {
    // Background checks stay quiet about network errors.
    send('update-status', { text: res.message });
  }
}

function scheduleUpdates() {
  clearInterval(updateTimer);
  if (!autoUpdate) return;
  setTimeout(() => runUpdate(false), 8000);
  updateTimer = setInterval(() => runUpdate(false), UPDATE_EVERY_MS);
}

// ---- commands / tray -------------------------------------------------------
function command(name) {
  if (name === 'hide') {
    if (win.isVisible()) win.hide(); else win.showInactive();
  } else if (name === 'quit') {
    app.quit();
    return;
  } else if (name === 'update') {
    runUpdate(true);
  } else {
    send('command', name);
  }
}

function trayIcon() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  return img.isEmpty() ? img : img.resize({ width: 16, height: 16 });
}

function buildTray() {
  if (!tray) {
    tray = new Tray(trayIcon());
    tray.setToolTip('StickFight Pets');
    tray.on('click', () => command('toggle-panel'));
  }
  const k = 'CommandOrControl+Alt+Shift+';
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `StickFight Pets v${updater.localVersion()}`, enabled: false },
    { type: 'separator' },
    { label: 'Show / hide control panel', accelerator: k + 'U', click: () => command('toggle-panel') },
    { label: 'Fight now', accelerator: k + 'B', click: () => command('brawl') },
    { label: 'Add a fighter', accelerator: k + 'N', click: () => command('add') },
    { label: 'Hide / show pets', accelerator: k + 'H', click: () => command('hide') },
    { label: 'Check for updates', click: () => command('update') },
    { type: 'separator' },
    { label: 'Quit', accelerator: k + 'Q', click: () => command('quit') },
  ]));
}

function registerShortcuts() {
  const k = 'CommandOrControl+Alt+Shift+';
  const map = { B: 'brawl', N: 'add', X: 'remove', P: 'peace', D: 'draw', U: 'toggle-panel', H: 'hide', Q: 'quit' };
  for (const [key, cmd] of Object.entries(map)) {
    try { globalShortcut.register(k + key, () => command(cmd)); } catch (e) { /* taken by another app */ }
  }
}

ipcMain.on('set-capture', (_e, on) => {
  on = !!on;
  if (on === capture) return;
  capture = on;
  applyCapture();
});

// While a sandbox tool (pencil, bomb, ...) is active the overlay takes every
// click, and takes keyboard focus so Esc can switch back to the hand.
ipcMain.on('tool-mode', (_e, on) => {
  toolMode = !!on;
  applyCapture();
  if (!win) return;
  win.setFocusable(toolMode);
  if (toolMode) win.focus(); else win.blur();
});

ipcMain.on('renderer-ready', (_e, opts) => {
  autoUpdate = opts.autoUpdate !== false;
  scheduleUpdates();
});
ipcMain.on('check-updates', () => runUpdate(true));
ipcMain.on('auto-update', (_e, on) => { autoUpdate = !!on; scheduleUpdates(); });
ipcMain.on('hide', () => command('hide'));
ipcMain.on('quit', () => app.quit());

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  // Linux compositors often need a beat before a transparent window can be created.
  setTimeout(() => {
    createWindow();
    buildTray();
    registerShortcuts();
  }, process.platform === 'linux' ? 400 : 0);

  screen.on('display-metrics-changed', () => {
    if (!win) return;
    display = screen.getPrimaryDisplay();
    win.setBounds(display.bounds);
    send('env', envInfo());
  });
});

app.on('second-instance', () => { if (win) { win.showInactive(); send('command', 'toggle-panel'); } });

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (tracker) tracker.stop();
});

app.on('window-all-closed', () => app.quit());
