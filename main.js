const { app, BrowserWindow, Tray, Menu, globalShortcut, screen, desktopCapturer, ipcMain, clipboard, nativeImage, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const SELFTEST = process.argv.includes('--selftest');
app.setAppUserModelId('com.ayush.tito');   // Windows shows this app as "Tito" (not "electron.app.Electron") in notifications
if (SELFTEST && process.env.TITO_SHOTS) app.setPath('userData', path.join(process.env.TITO_SHOTS, 'userdata'));

const store = require('./src/store');
const ai = require('./src/ai');
const engine = require('./src/engine');
const models = require('./src/models');
const packs = require('./src/packs');
const memory = require('./src/memory');
const pdf = require('./src/pdf');
const dock = require('./src/dock');
const { LANGS } = require('./src/translate');
const { PROVIDERS, detectKey, publicList } = require('./src/providers');

const ASSETS = path.join(__dirname, 'assets');
const PRELOAD = path.join(__dirname, 'preload.js');
const page = (n) => path.join(__dirname, 'renderer', n);
const LAUNCHED_AT_LOGIN = process.argv.includes('--hidden');

let tray = null, overlayWin = null, settingsWin = null, toastWin = null;
let overlayOpening = false, quitting = false;

// `electron . --set-key=<provider>` (key in $TITO_KEY): stores an encrypted API key, makes it the active provider, exits.
const setKeyArg = process.argv.find((a) => a.startsWith('--set-key='));
if (setKeyArg) {
  app.whenReady().then(() => {
    const provider = setKeyArg.split('=')[1];
    store.load(); store.setKey(provider, process.env.TITO_KEY || ''); store.save({ provider });
    console.log(`key saved for ${provider}`); app.exit(0);
  });
} else {
// ------------------------------------------------------------------ single instance
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', (_e, argv) => {   // opening Tito again (desktop or Start menu icon) shows the app; the hidden login start stays quiet
  if (argv.includes('--hidden')) return;
  openSettings('home');
});

// ------------------------------------------------------------------ windows
const baseWeb = () => ({ preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false });

function ensureOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) return overlayWin;
  overlayWin = new BrowserWindow({
    show: false, frame: false, transparent: false, backgroundColor: '#1b1530',
    alwaysOnTop: true, skipTaskbar: true, resizable: false, movable: false, minimizable: false,
    maximizable: false, fullscreenable: false, hasShadow: false, webPreferences: baseWeb(),
  });
  overlayWin.setMenuBarVisibility(false);
  if (SELFTEST) overlayWin.setIgnoreMouseEvents(true);   // the test drives the overlay itself; stray real input must not interfere
  overlayWin.loadFile(page('overlay.html'));
  overlayWin.on('blur', () => { if (!SELFTEST && overlayWin.isVisible()) closeOverlay(); });
  overlayWin.on('closed', () => { overlayWin = null; });
  return overlayWin;
}

async function summon() {
  if (overlayOpening) return;
  if (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) { closeOverlay(); return; }
  overlayOpening = true;
  dock.onSummon();                      // the dock steps aside while you circle something, so two Titos never overlap
  try {
    hideToast();
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    if (SELFTEST && process.env.TITO_TEST_IMAGE) {          // self-test: use a prepared picture instead of the real screen
      const buf = fs.readFileSync(process.env.TITO_TEST_IMAGE); const win = ensureOverlay(); win.setBounds(display.bounds);
      if (win.webContents.isLoading()) await new Promise((r) => win.webContents.once('did-finish-load', r));
      win.webContents.send('overlay:open', { image: 'data:image/jpeg;base64,' + buf.toString('base64'), settings: store.publicSettings() }); return;
    }
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) },
    });
    const src = sources.find((s) => s.display_id === String(display.id)) || sources[0];
    if (!src) throw new Error('no screen source');
    const jpg = src.thumbnail.toJPEG(88);
    const win = ensureOverlay();
    win.setBounds(display.bounds);
    const payload = { image: 'data:image/jpeg;base64,' + jpg.toString('base64'), settings: store.publicSettings() };
    if (win.webContents.isLoading()) await new Promise((r) => win.webContents.once('did-finish-load', r));
    win.webContents.send('overlay:open', payload);   // renderer decodes, then calls overlay:ready
  } catch (e) {
    console.error('summon failed', e);
    showToast({ state: 'error', text: 'Could not capture the screen. Please try again.' });
  } finally { overlayOpening = false; }
}

function closeOverlay() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  overlayWin.hide();
  overlayWin.webContents.send('overlay:closed');
  dock.onOverlayClosed();
}

// ------------------------------------------------------------------ updates (installed builds only; picks up the newest GitHub release)
let updateState = 'idle';
function setupUpdates() {
  if (!app.isPackaged || SELFTEST) return;
  let autoUpdater; try { ({ autoUpdater } = require('electron-updater')); } catch { return; }
  autoUpdater.autoDownload = true; autoUpdater.autoInstallOnAppQuit = true; autoUpdater.logger = null;
  autoUpdater.on('update-available', () => { updateState = 'downloading'; });
  autoUpdater.on('update-not-available', () => { updateState = 'idle'; });
  autoUpdater.on('error', () => { updateState = 'idle'; });
  autoUpdater.on('update-downloaded', (i) => { updateState = 'ready'; showToast({ state: 'greeting', text: `Tito ${i.version} is ready. It installs the next time you quit Tito.` }); refreshTray(); });
  const check = () => { try { autoUpdater.checkForUpdates().catch(() => {}); } catch { /* offline */ } };
  check(); setInterval(check, 6 * 3600 * 1000);
  ipcMain.on('app:installUpdate', () => { quitting = true; autoUpdater.quitAndInstall(); });
}

function openSettings(tab = 'home') {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show(); settingsWin.focus(); settingsWin.webContents.send('win:tab', tab); return settingsWin;
  }
  settingsWin = new BrowserWindow({
    width: 980, height: 700, minWidth: 820, minHeight: 600, show: false, title: 'Tito',
    backgroundColor: '#fff3ea', icon: path.join(ASSETS, 'icon.png'), autoHideMenuBar: true, webPreferences: baseWeb(),
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(page('settings.html'), { query: { tab } });
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => { settingsWin = null; });
  return settingsWin;
}

function showToast({ state = 'greeting', text }) {
  hideToast();
  const wa = screen.getPrimaryDisplay().workArea;
  const w = 320, h = 270;
  toastWin = new BrowserWindow({
    width: w, height: h, x: wa.x + wa.width - w - 12, y: wa.y + wa.height - h - 8,
    show: false, frame: false, transparent: true, resizable: false, movable: false, focusable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, webPreferences: baseWeb(),
  });
  toastWin.setAlwaysOnTop(true, 'screen-saver');
  toastWin.loadFile(page('toast.html'), { query: { state, text: text || '' } });
  toastWin.once('ready-to-show', () => toastWin && toastWin.showInactive());
  toastWin.on('closed', () => { toastWin = null; });
}
function hideToast() { if (toastWin && !toastWin.isDestroyed()) toastWin.close(); toastWin = null; }

// ------------------------------------------------------------------ hotkey / login / tray
let hotkeyNow = '';
function registerHotkey(accel) {       // only swaps this one shortcut: the dock's shortcuts stay registered
  if (hotkeyNow) globalShortcut.unregister(hotkeyNow);
  try { const ok = globalShortcut.register(accel, summon); hotkeyNow = ok ? accel : ''; return ok; } catch { hotkeyNow = ''; return false; }
}

function applyLogin(on) {
  const opts = app.isPackaged
    ? { openAtLogin: on, args: ['--hidden'] }
    : { openAtLogin: on, path: process.execPath, args: [app.getAppPath(), '--hidden'] };
  try { app.setLoginItemSettings(opts); } catch (e) { console.error('login item', e); }
}

const prettyKey = (a) => a.replace('CommandOrControl', 'Ctrl').replace(/\+/g, ' + ');

function buildTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(ASSETS, 'tray.png')));
  tray.setToolTip('Tito');
  const refresh = () => {
    const s = store.get();
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: `Circle something  (${prettyKey(s.hotkey)})`, click: () => summon() },
      { type: 'separator' },
      { label: 'Tito Dock  (Ctrl + Shift + D)', click: () => dock.toggleDock() },
      { label: 'Quiz me  (Ctrl + Shift + K)', click: () => dock.openPanel('study') },
      { label: 'Open Tito', click: () => openSettings('home') },
      { label: 'Notebook', click: () => openSettings('notebook') },
      { label: 'Settings', click: () => openSettings('settings') },
      { type: 'separator' },
      ...(updateState === 'ready' ? [{ label: 'Restart to update Tito', click: () => ipcMain.emit('app:installUpdate') }, { type: 'separator' }] : []),
      { label: 'Start with Windows', type: 'checkbox', checked: s.openAtLogin, click: (i) => { store.save({ openAtLogin: i.checked }); applyLogin(i.checked); } },
      { label: 'Quit Tito', click: () => { quitting = true; app.quit(); } },
    ]));
  };
  refresh();
  tray.on('click', () => summon());
  tray.on('double-click', () => openSettings('home'));
  return refresh;
}
let refreshTray = () => {};

// ------------------------------------------------------------------ IPC
const handle = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => { try { return await fn(...a); } catch (e) { return { ok: false, message: String(e.message || e) }; } });

handle('settings:get', () => store.publicSettings());
handle('settings:save', (patch) => {
  const before = store.get();
  if (patch.shortcuts) { const failed = dock.tryShortcuts(patch.shortcuts); if (failed.length) return { ok: false, message: 'That shortcut is already used by another app. Try a different one.' }; }
  if (patch.hotkey && patch.hotkey !== before.hotkey) {
    if (!registerHotkey(patch.hotkey)) { registerHotkey(before.hotkey); return { ok: false, message: 'That shortcut is already used by another app. Try a different one.' }; }
  }
  store.save(patch);
  if ('dockOn' in patch || 'clipWatch' in patch) dock.applySettings();
  if ('openAtLogin' in patch) applyLogin(patch.openAtLogin);
  refreshTray();
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('settings:changed', store.publicSettings());
  return { ok: true, settings: store.publicSettings() };
});
handle('settings:setKey', ({ provider, key }) => { store.setKey(provider, (key || '').trim()); return { ok: true, settings: store.publicSettings() }; });

handle('ai:providers', () => publicList());
handle('ai:detectKey', (key) => detectKey(key));
handle('ai:test', async (provider) => {
  const s = store.get(); const p = provider || s.provider;
  try { const r = await ai.test({ settings: s, provider: p, apiKey: store.getKey(p), cache: store.modelCache }); return { ok: true, message: r.answer, model: r.model }; }
  catch (e) { return { ok: false, code: e.code, message: e.message }; }
});
// find (and prove with a tiny image) the best model the provider offers today
handle('ai:autopick', async (provider) => {
  const key = store.getKey(provider);
  if (!key) return { ok: false, message: 'Save a key first.' };
  const r = await models.discover(provider, key, { cache: store.modelCache, force: true, custom: store.get().custom });
  return { ok: true, ranked: r.ranked, verified: r.verified, best: r.ranked[0] || '' };
});
handle('ai:models', (provider) => { const c = store.modelCache.get(provider) || {}; return { ranked: c.ranked || PROVIDERS[provider].fallback, at: c.at || 0, pinned: store.get().models[provider] || '' }; });
ipcMain.handle('ai:ask', async (e, { images, turns, override, task }) => {
  try { return await engine.ask({ images, turns, override, task, onWait: (secs) => { if (!e.sender.isDestroyed()) e.sender.send('ai:wait', secs); } }); }
  catch (err) { return { ok: false, message: String(err.message || err) }; }
});
handle('ai:status', () => engine.status());
// ---- offline packs (downloaded once, kept on this PC)
handle('packs:status', () => ({ ...packs.status(), busy: { llm: packs.isDownloading('llm'), hi: packs.isDownloading('hi') } }));
ipcMain.handle('packs:download', async (e, id) => {
  const send = (p) => { if (!e.sender.isDestroyed()) e.sender.send('packs:progress', { id, pct: p }); };
  try { await packs.download(id, send); return { ok: true }; } catch (err) { return { ok: false, message: String(err.message || err) }; }
});
handle('packs:remove', (id) => { packs.remove(id); return { ok: true }; });
handle('translate:langs', () => LANGS);

// ---- memory
handle('memory:forget', () => { memory.forget(store); return { ok: true, settings: store.publicSettings() }; });

// ---- PDF
handle('pdf:save', async (entry) => {
  const parent = BrowserWindow.getFocusedWindow();
  const r = await pdf.save([{ ...entry, ts: Date.now() }], 'Tito answer', `tito-${pdf.safeName(entry.title)}.pdf`, parent && parent !== overlayWin ? parent : null);
  if (r.ok && !process.env.TITO_SELFTEST_PDF) shell.showItemInFolder(r.path);
  return r;
});
handle('pdf:notebook', async () => {
  const items = store.listHistory().slice(0, 100);
  if (!items.length) return { ok: false, message: 'The notebook is empty.' };
  const r = await pdf.save(items, 'Tito notebook', 'tito-notebook.pdf', settingsWin && !settingsWin.isDestroyed() ? settingsWin : null);
  if (r.ok && !process.env.TITO_SELFTEST_PDF) shell.showItemInFolder(r.path);
  return r;
});


handle('history:list', () => store.listHistory());
handle('history:add', (entry) => store.addHistory(entry));
handle('history:remove', (id) => { store.removeHistory(id); return true; });
handle('history:clear', () => { store.clearHistory(); return true; });
handle('history:export', async () => {
  const items = store.listHistory();
  const r = await dialog.showSaveDialog({ defaultPath: 'tito-notebook.md', filters: [{ name: 'Markdown', extensions: ['md'] }] });
  if (r.canceled || !r.filePath) return { ok: false };
  const md = '# Tito notebook\n\n' + items.map((i) => `## ${i.title}\n_${new Date(i.ts).toLocaleString()}_\n\n${i.answer}\n`).join('\n');
  fs.writeFileSync(r.filePath, md);
  return { ok: true, path: r.filePath };
});

handle('ocr:run', async (b64) => ({ ok: true, text: await require('./src/ocr').recognize(b64) }));
handle('clip:text', (t) => { dock.ignoreClip(t); clipboard.writeText(String(t)); return true; });
handle('clip:image', (dataUrl) => { clipboard.writeImage(nativeImage.createFromDataURL(dataUrl)); return true; });
handle('share:save', (dataUrl) => {
  const dir = path.join(app.getPath('pictures'), 'Tito'); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `tito-${Date.now()}.png`);
  fs.writeFileSync(f, nativeImage.createFromDataURL(dataUrl).toPNG());
  return { ok: true, path: f };
});
handle('open:external', (url) => { if (/^https:\/\//i.test(url)) { shell.openExternal(url); return true; } return false; });
handle('open:folder', (p) => { shell.showItemInFolder(p); return true; });
handle('win:open', (tab) => { openSettings(tab); return true; });
handle('app:info', () => ({ version: app.getVersion(), hotkeyPretty: prettyKey(store.get().hotkey), packaged: app.isPackaged }));

dock.registerCards();
ipcMain.on('overlay:ready', () => {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.show(); overlayWin.focus();
});
ipcMain.on('overlay:close', () => closeOverlay());
ipcMain.on('app:summon', () => setTimeout(summon, 180));   // lets the settings window lose focus first
ipcMain.on('toast:done', () => hideToast());
ipcMain.on('toast:click', () => { hideToast(); summon(); });

// ------------------------------------------------------------------ lifecycle
app.whenReady().then(async () => {
  const s = store.load();
  packs.init(app.getPath('userData'));
  const firstRun = !fs.existsSync(path.join(app.getPath('userData'), 'settings.json'));
  if (firstRun) store.save({});
  refreshTray = buildTray();
  if (!SELFTEST) applyLogin(s.openAtLogin);

  const ok = registerHotkey(s.hotkey);
  if (!ok) showToast({ state: 'error', text: `${prettyKey(s.hotkey)} is already used by another app. Pick a new shortcut in Settings.` });
  else if (s.greetOnStart && !SELFTEST) showToast({ state: 'greeting', text: `Tito is awake. Press ${prettyKey(s.hotkey)} and circle anything on your screen.` });

  if (!LAUNCHED_AT_LOGIN && !SELFTEST) openSettings('home');
  setupUpdates();
  ensureOverlay();                       // pre-load so the hotkey feels instant
  if (!SELFTEST || process.env.TITO_DOCK_TEST) dock.init({ summon, openSettings });   // the self-test never opens the dock on the real desktop
  if (SELFTEST) require('./src/selftest').run({ summon, openSettings, showToast, closeOverlay, getOverlay: () => overlayWin, getSettings: () => settingsWin, getToast: () => toastWin });
});

app.on('window-all-closed', (e) => { if (!quitting) e.preventDefault?.(); });   // live in the tray
app.on('will-quit', () => globalShortcut.unregisterAll());
}
