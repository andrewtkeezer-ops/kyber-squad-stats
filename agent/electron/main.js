// Kyber Squad Agent — Windows tray app.
// The dashboard is the Cloudflare site; this app is the engine that feeds it.
// It runs hidden in the tray, starts at login, shows green/red for the last push,
// and updates itself from GitHub Releases.

const { app, Tray, Menu, shell, nativeImage, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(app.getPath('userData'), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.KSS_DATA_DIR = DATA_DIR;
const cfgPath = path.join(DATA_DIR, 'config.json');
process.env.KSS_CONFIG = cfgPath;
const logPath = path.join(DATA_DIR, 'agent.log');

// ---- log to file as well as console -------------------------------------------------
const logStream = fs.createWriteStream(logPath, { flags: 'a' });
for (const m of ['log', 'warn', 'error']) {
  const orig = console[m].bind(console);
  console[m] = (...a) => { const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); try { logStream.write(`${new Date().toISOString()} ${line}\n`); } catch {} orig(...a); };
}

const icons = {};
function icon(name) {
  if (!icons[name]) {
    const p = path.join(__dirname, 'tray', `tray-${name}-32.png`);
    let img = nativeImage.createFromPath(p);
    if (img.isEmpty()) img = nativeImage.createEmpty();
    icons[name] = img;
  }
  return icons[name];
}

let tray = null, agent = null, updater = null;
const state = { status: 'idle', text: 'starting…', lastPush: null, lastError: null, players: 0, updateReady: null };

function readCfg() { try { return JSON.parse(fs.readFileSync(cfgPath, 'utf8').replace(/^﻿/, '')); } catch { return {}; } }
function configured() { const c = readCfg(); return !!(c.siteBase && c.ingestSecret && !/paste/.test(c.ingestSecret)); }

function render() {
  if (!tray) return;
  tray.setImage(icon(state.status));
  const site = readCfg().siteBase || '';
  const when = state.lastPush ? state.lastPush.toLocaleTimeString() : 'never';
  tray.setToolTip(`Kyber Squad Agent — ${state.text}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Kyber Squad Agent v${app.getVersion()}`, enabled: false },
    { label: state.status === 'ok' ? `● Last push ${when} · ${state.players} pilots` : state.status === 'err' ? `● Problem: ${state.lastError || 'see log'}` : `● ${state.text}`, enabled: false },
    { type: 'separator' },
    ...(state.updateReady ? [{ label: `Restart to update to v${state.updateReady}`, click: () => updater.quitAndInstall() }, { type: 'separator' }] : []),
    { label: 'Open stats site', enabled: !!site, click: () => shell.openExternal(site) },
    { label: 'Push now', click: () => runOnce() },
    { type: 'separator' },
    { label: 'Import config.json…', click: importConfig },
    { label: 'Open config file', click: () => shell.openPath(cfgPath) },
    { label: 'Open log', click: () => shell.openPath(logPath) },
    { label: 'Check for updates', click: () => checkUpdates(true) },
    { type: 'checkbox', label: 'Start when I log in', checked: app.getLoginItemSettings().openAtLogin, click: (mi) => app.setLoginItemSettings({ openAtLogin: mi.checked, args: ['--hidden'] }) },
    { type: 'separator' },
    { label: 'Quit (stops recording)', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

function setState(patch) { Object.assign(state, patch); render(); }

async function runOnce() {
  if (!agent) return;
  try { await agent.tick(); } catch (e) { setState({ status: 'err', text: e.message, lastError: e.message }); }
}

async function importConfig() {
  const r = await dialog.showOpenDialog({ title: 'Choose your config.json', filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return;
  try {
    JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8').replace(/^﻿/, ''));
    fs.copyFileSync(r.filePaths[0], cfgPath);
    new Notification({ title: 'Kyber Squad Agent', body: 'Config imported. Pushing now.' }).show();
    runOnce();
  } catch (e) { dialog.showErrorBox('Not a valid config.json', e.message); }
}

function checkUpdates(manual) {
  if (!updater) return;
  updater.checkForUpdates().then((r) => {
    if (manual && !(r && r.updateInfo && r.updateInfo.version !== app.getVersion())) {
      new Notification({ title: 'Kyber Squad Agent', body: `You're on the latest version (v${app.getVersion()}).` }).show();
    }
  }).catch((e) => { if (manual) dialog.showErrorBox('Update check failed', e.message); else console.warn('update check failed:', e.message); });
}

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => { if (tray) tray.popUpContextMenu(); });
  app.whenReady().then(() => {
    try { app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] }); } catch {}
    tray = new Tray(icon('idle'));
    tray.on('click', () => tray.popUpContextMenu());
    render();

    // the agent reports every cycle through its event emitter
    agent = require('../index.js');
    agent.events.on('push', (info) => setState({ status: 'ok', text: `pushed ${info.players} pilots`, lastPush: new Date(), players: info.players, lastError: null }));
    agent.events.on('skip', (info) => setState({ status: 'ok', text: `no change (${info.players} pilots)`, players: info.players }));
    agent.events.on('error', (msg) => setState({ status: 'err', text: msg, lastError: msg }));

    if (!configured()) {
      setState({ status: 'idle', text: 'needs config' });
      dialog.showMessageBox({ type: 'info', title: 'Kyber Squad Agent', message: 'Import your config.json to start', detail: 'Right-click the crystal in the tray → "Import config.json…" and pick the config.json from your kyber-squad-stats\\agent folder. The agent starts pushing immediately.' });
    }
    agent.cycle();

    // auto-update from GitHub Releases
    try {
      const { autoUpdater } = require('electron-updater');
      updater = autoUpdater; updater.autoDownload = true; updater.autoInstallOnAppQuit = true; updater.logger = console;
      updater.on('update-downloaded', (info) => { setState({ updateReady: info.version }); new Notification({ title: 'Kyber Squad Agent', body: `v${info.version} downloaded — right-click the tray icon to restart and update.` }).show(); });
      checkUpdates(false);
      setInterval(() => checkUpdates(false), 6 * 60 * 60 * 1000);
    } catch (e) { console.warn('updater unavailable:', e.message); }
  });
  app.on('window-all-closed', () => {}); // tray app: stay alive
}
