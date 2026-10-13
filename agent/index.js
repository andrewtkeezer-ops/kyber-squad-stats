// index.js — the PC agent. Runs on Andrew's always-on desktop.
//
// Every cycle it:
//   1. pulls the roster (friends' Kyber names) from the Cloudflare site,
//      merged with any names in config.extraNames
//   2. resolves each name -> Kyber user id (SearchUser)
//   3. pulls each one's stats (GetStats), saves a local snapshot
//   4. pulls the live server list
//   5. builds a compact "squad blob" (leaderboard + detected sessions + servers)
//   6. pushes the blob up to the site (/api/ingest), which stores it in KV
//
// The Cloudflare site then just displays whatever the agent last pushed.

const fs = require('fs');
const path = require('path');
const { KyberClient } = require('./lib/kyberClient');
const { decodeStats } = require('./lib/statsDictionary');
const { detectSessions } = require('./lib/sessions');
const snaps = require('./lib/snapshots');

// An always-on agent must survive transient network hiccups (a dropped gRPC
// socket, a reset by a proxy/VPN) without dying. Log and keep running.
process.on('uncaughtException', (e) => console.error('uncaught:', e && e.message));
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e && (e.message || e)));

function loadConfig() {
  const envDir = process.env.KSS_DATA_DIR;
  const candidates = [
    process.env.KSS_CONFIG,
    envDir && path.join(envDir, 'config.json'),
    path.join(__dirname, 'config.json'),
  ].filter(Boolean);
  for (const c of candidates) {
    try { return JSON.parse(fs.readFileSync(c, 'utf8')); } catch {}
  }
  return {};
}

const cfg = loadConfig();
const SITE_BASE   = (process.env.KSS_SITE_BASE || cfg.siteBase || '').replace(/\/$/, '');
const SECRET      = process.env.KSS_INGEST_SECRET || cfg.ingestSecret || '';
const POLL_MS     = Number(process.env.KSS_POLL_MS || cfg.pollMs || 90 * 1000);
const SESSION_GAP = Number(process.env.KSS_SESSION_GAP_MIN || cfg.sessionGapMin || 30);
const EXTRA_NAMES = cfg.extraNames || []; // names to always track, even if not claimed

const client = new KyberClient(); // uses KYBER_TOKEN env if reads require auth

async function siteGet(pathname) {
  const r = await fetch(`${SITE_BASE}${pathname}`, { headers: { 'x-kss-secret': SECRET } });
  if (!r.ok) throw new Error(`${pathname} -> ${r.status}`);
  return r.json();
}
async function sitePost(pathname, body) {
  const r = await fetch(`${SITE_BASE}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-kss-secret': SECRET },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${pathname} -> ${r.status} ${await r.text().catch(() => '')}`);
  return r.json().catch(() => ({}));
}

// roster entries: { email, name } (email null for config.extraNames)
async function getRoster() {
  let claimed = [];
  if (SITE_BASE) {
    try { claimed = (await siteGet('/api/roster')).roster || []; }
    catch (e) { console.warn('roster fetch failed:', e.message); }
  }
  const byName = new Map();
  for (const n of EXTRA_NAMES) byName.set(n.toLowerCase(), { email: null, name: n });
  for (const c of claimed) if (c.name) byName.set(c.name.toLowerCase(), { email: c.email || null, name: c.name });
  return [...byName.values()];
}

async function resolve(name) {
  const r = await client.searchUser(name);
  const users = r.users || [];
  return users.find((u) => u.username?.toLowerCase() === name.toLowerCase()) || users[0] || null;
}

async function pullRaw(user) {
  try {
    const k = await client.getKyberStats(user.id);
    if (k?.stats && Object.keys(k.stats).length) return { source: 'KYBER', raw: k.stats };
  } catch {}
  if (user.personaId) {
    const ea = await client.getEaStats(user.personaId);
    return { source: 'EA_PC', raw: (ea && ea.stats) || {} };
  }
  return { source: 'KYBER', raw: {} };
}

async function buildBlob() {
  const roster = await getRoster();
  const players = [];

  for (const entry of roster) {
    try {
      const u = await resolve(entry.name);
      if (!u) { players.push({ name: entry.name, email: entry.email, resolved: false }); continue; }
      const { source, raw } = await pullRaw(u);
      snaps.add(u.id, source, raw);
      const sessions = detectSessions(snaps.history(u.id), SESSION_GAP).slice(0, 10);
      players.push({
        name: entry.name, email: entry.email, resolved: true,
        username: u.username, id: u.id, source,
        stats: decodeStats(raw),
        sessions,
      });
    } catch (e) {
      players.push({ name: entry.name, email: entry.email, resolved: false, error: e.code || e.message });
    }
  }

  let servers = [];
  try {
    const r = await client.getServers({ page: 0 });
    servers = (r.servers || []).map((s) => ({
      name: s.name, official: s.official, players: s.playerCount, maxPlayers: s.maxPlayerCount,
      requiresPassword: s.requiresPassword,
      map: s.levelSetup?.mapName || s.levelSetup?.map || '',
      mode: s.levelSetup?.modeName || s.levelSetup?.mode || '',
      mods: (s.mods || []).map((m) => m.name),
    })).sort((a, b) => b.players - a.players);
  } catch (e) {
    servers = { error: e.code || e.message };
  }

  return { updatedAt: new Date().toISOString(), players, servers };
}

async function cycle() {
  try {
    const blob = await buildBlob();
    if (SITE_BASE) {
      await sitePost('/api/ingest', blob);
      console.log(`[${new Date().toLocaleTimeString()}] pushed: ${blob.players.length} players, ` +
        `${Array.isArray(blob.servers) ? blob.servers.length : 0} servers`);
    } else {
      // no site configured yet — write locally so you can inspect the output
      fs.mkdirSync(snaps.DATA_DIR, { recursive: true });
      fs.writeFileSync(path.join(snaps.DATA_DIR, 'last-blob.json'), JSON.stringify(blob, null, 2));
      console.log('No siteBase configured; wrote data/last-blob.json');
    }
  } catch (e) {
    console.error('cycle error:', e.message);
  }
}

async function main() {
  console.log(`Kyber agent starting. site=${SITE_BASE || '(none)'} poll=${Math.round(POLL_MS / 1000)}s token=${client.token ? 'set' : 'none'}`);
  await cycle();
  setInterval(cycle, POLL_MS);
}

if (require.main === module) main();
module.exports = { cycle, buildBlob };
