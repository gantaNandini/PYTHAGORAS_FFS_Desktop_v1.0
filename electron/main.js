const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged && process.env.ELECTRON_START_URL;
let win = null;
let dirty = false;
let pendingFile = null;       // file passed on the command line / by the OS before the window was ready

/* ── single instance: opening a .pfs while the app runs reuses the window ── */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    const f = fileFromArgs(argv);
    if (f) sendFile(f);
  });
}

function fileFromArgs(argv) {
  return argv.slice(1).find(a => /\.pfs$/i.test(a) && fs.existsSync(a)) || null;
}

function readProject(p) {
  const st = fs.statSync(p);
  if (st.size > 20 * 1024 * 1024) throw new Error('The file is too large to be an analysis file.');
  try { app.addRecentDocument(p); } catch { /* not supported on this platform */ }
  return { path: p, name: path.basename(p), content: fs.readFileSync(p, 'utf8') };
}

/* ── remember window size / position between sessions ── */
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadWindowState() {
  const def = { width: 1360, height: 860 };
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const ok = ['x', 'y', 'width', 'height'].every(k => Number.isFinite(s[k]));
    if (!ok || s.width < 800 || s.height < 560) return def;
    // only reuse the position if the window would still be on a connected display
    const { screen } = require('electron');
    const visible = screen.getAllDisplays().some(d => {
      const b = d.workArea;
      return s.x + 100 < b.x + b.width && s.x + s.width - 100 > b.x && s.y >= b.y - 10 && s.y + 60 < b.y + b.height;
    });
    return { ...def, ...(visible ? { x: s.x, y: s.y } : {}), width: s.width, height: s.height, maximized: !!s.maximized };
  } catch { return def; }
}
function saveWindowState() {
  if (!win || win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return;
  try {
    const maximized = win.isMaximized();
    const b = maximized && prevBounds ? prevBounds : win.getBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized }));
  } catch { /* non-fatal */ }
}
let prevBounds = null;

function sendFile(p) {
  if (!win) { pendingFile = p; return; }
  try { win.webContents.send('file:opened', readProject(p)); }
  catch (e) { dialog.showErrorBox('Cannot open file', String(e.message || e)); }
}

function createWindow() {
  const ws = loadWindowState();
  win = new BrowserWindow({
    width: ws.width, height: ws.height, x: ws.x, y: ws.y, minWidth: 1024, minHeight: 640,
    title: 'PYTHAGORAS FFS',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    backgroundColor: '#E9EDF3',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);           // the app draws its own menu bar
  win.setMenuBarVisibility(false);

  if (isDev) win.loadURL(process.env.ELECTRON_START_URL);
  else win.loadFile(path.join(__dirname, '..', 'build', 'index.html'));

  win.once('ready-to-show', () => { if (ws.maximized) win.maximize(); win.show(); });
  const remember = () => { if (!win.isMaximized() && !win.isFullScreen()) prevBounds = win.getBounds(); };
  win.on('resize', remember);
  win.on('move', remember);
  win.on('close', saveWindowState);
  win.webContents.on('did-finish-load', () => {
    if (pendingFile) { sendFile(pendingFile); pendingFile = null; }
  });

  /* never navigate away from the app; open external links in the browser */
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:') && !url.startsWith('http://localhost')) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });

  win.on('close', e => {
    if (!dirty) return;
    const r = dialog.showMessageBoxSync(win, {
      type: 'warning', buttons: ['Discard changes', 'Cancel'], defaultId: 1, cancelId: 1,
      title: 'PYTHAGORAS FFS', message: 'This analysis has unsaved changes.', detail: 'Close anyway and lose them?',
    });
    if (r === 1) e.preventDefault();
  });
  win.on('closed', () => { win = null; });
}

/* ── IPC ─────────────────────────────────────────────────────────────────── */
ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));

ipcMain.handle('file:read', (_e, p) => {
  if (typeof p !== 'string' || !/\.pfs$/i.test(p)) throw new Error('Not an analysis file.');
  return readProject(p);
});

ipcMain.handle('file:open', async (_e, opts = {}) => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: opts.filters });
  if (r.canceled || !r.filePaths[0]) return null;
  return readProject(r.filePaths[0]);
});

ipcMain.handle('file:save', async (_e, o = {}) => {
  let target = o.path;
  if (!target || o.saveAs) {
    const r = await dialog.showSaveDialog(win, { defaultPath: o.path || o.defaultName, filters: o.filters });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
    if (!/\.pfs$/i.test(target)) target += '.pfs';
  }
  fs.writeFileSync(target, String(o.content), 'utf8');      // throws → renderer shows the error
  try { app.addRecentDocument(target); } catch { /* not supported on this platform */ }
  return { path: target, name: path.basename(target) };
});

ipcMain.handle('print:pdf', async (_e, o = {}) => {
  const r = await dialog.showSaveDialog(win, {
    defaultPath: o.defaultName || 'results.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (r.canceled || !r.filePath) return { path: null };
  const data = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'default' } });
  fs.writeFileSync(r.filePath, data);
  return { path: r.filePath };
});

ipcMain.handle('print:dialog', () => { win.webContents.print({ printBackground: true }); });

ipcMain.handle('dialog:message', (_e, o = {}) =>
  dialog.showMessageBox(win, { type: o.type || 'info', title: o.title || 'PYTHAGORAS FFS', message: o.message || '', buttons: ['OK'] }));

ipcMain.handle('window:command', (_e, cmd) => {
  if (!win) return;
  const wc = win.webContents;
  switch (cmd) {
    case 'zoomIn':    wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 3)); break;
    case 'zoomOut':   wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -3)); break;
    case 'zoomReset': wc.setZoomLevel(0); break;
    case 'fullscreen': win.setFullScreen(!win.isFullScreen()); break;
    case 'quit':      win.close(); break;
    default: break;
  }
});

ipcMain.on('doc:dirty', (_e, d) => { dirty = !!d; });

/* ── lifecycle ───────────────────────────────────────────────────────────── */
app.on('open-file', (e, p) => { e.preventDefault(); sendFile(p); });          // macOS

app.whenReady().then(() => {
  pendingFile = fileFromArgs(process.argv);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
