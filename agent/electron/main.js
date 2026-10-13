// Electron tray wrapper for the agent. Makes it an installable Windows app that
// runs quietly in the system tray, launches at login, and keeps pushing stats
// to your Cloudflare site. There is no local dashboard — the dashboard is the
// Cloudflare site; this app is just the engine feeding it.

const { app, Tray, Menu, shell, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

process.env.KSS_DATA_DIR = path.join(app.getPath('userData'), 'data');
fs.mkdirSync(process.env.KSS_DATA_DIR, { recursive: true });

// Config lives next to the user's data so it survives updates. If none yet,
// seed it from config.example.json inside the bundle.
const cfgPath = path.join(process.env.KSS_DATA_DIR, 'config.json');
process.env.KSS_CONFIG = cfgPath;
if (!fs.existsSync(cfgPath)) {
  try { fs.copyFileSync(path.join(__dirname, '..', 'config.example.json'), cfgPath); } catch {}
}

let tray = null;
let agent = null;
let last = 'starting…';

function readSite() {
  try { return JSON.parse(fs.readFileSync(cfgPath, 'utf8')).siteBase || ''; } catch { return ''; }
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: `Status: ${last}`, enabled: false },
    { type: 'separator' },
    { label: 'Open stats site', click: () => { const u = readSite(); if (u) shell.openExternal(u); } },
    { label: 'Open config file', click: () => shell.openPath(cfgPath) },
    { label: 'Push now', click: () => runOnce() },
    { type: 'separator' },
    { label: 'Quit (stops recording)', click: () => app.quit() },
  ]);
}

async function runOnce() {
  try { await agent.cycle(); last = `pushed ${new Date().toLocaleTimeString()}`; }
  catch (e) { last = `error: ${e.message}`; }
  if (tray) tray.setContextMenu(buildMenu());
}

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.whenReady().then(() => {
    try { app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] }); } catch {}
    if (app.dock) app.dock.hide();

    let img = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
    if (img.isEmpty()) img = nativeImage.createEmpty();
    tray = new Tray(img);
    tray.setToolTip('Kyber Squad Agent');
    tray.setContextMenu(buildMenu());

    agent = require('../index.js');
    const cfg = (() => { try { return JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { return {}; } })();
    if (!cfg.siteBase || !cfg.ingestSecret || /paste/.test(cfg.ingestSecret || '')) {
      dialog.showMessageBox({
        type: 'info', title: 'Kyber Squad Agent',
        message: 'Finish setup first',
        detail: 'Edit the config file (tray → Open config file) with your Cloudflare site URL and ingest secret, then choose "Push now". See the README.',
      });
    }
    runOnce();
    const pollMs = Number(cfg.pollMs || 90000);
    setInterval(runOnce, pollMs);
  });
  app.on('window-all-closed', () => {}); // tray app, stay alive
}
