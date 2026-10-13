// snapshots.js — local snapshot history on the PC, used to detect sessions.
// Lives on the agent machine only; the Cloudflare site never sees raw history,
// just the computed blob the agent pushes.

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.KSS_DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'snapshots.json');

function ensure() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function read() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; } }
function write(o) { ensure(); fs.writeFileSync(FILE, JSON.stringify(o)); }

function add(userId, source, raw) {
  const all = read();
  if (!all[userId]) all[userId] = [];
  all[userId].push({ ts: new Date().toISOString(), source, raw });
  if (all[userId].length > 1000) all[userId] = all[userId].slice(-1000);
  write(all);
}
function history(userId) { return read()[userId] || []; }

module.exports = { add, history, DATA_DIR };
