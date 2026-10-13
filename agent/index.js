// index.js — the PC agent. Runs on the always-on desktop.
//
// Each cycle: read config (hot-reloaded, so adding a friend never needs a
// restart) → pull roster from the site + extraNames → resolve names → pull
// stats → snapshot locally → detect sessions → build the squad blob → push to
// the site ONLY if a player's stats changed (or every 15 min for server
// freshness), which keeps Cloudflare KV comfortably inside its free tier.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { KyberClient } = require('./lib/kyberClient');
const { decodeStats } = require('./lib/statsDictionary');
const { detectSessions } = require('./lib/sessions');
const snaps = require('./lib/snapshots');

process.on('uncaughtException', (e) => console.error('uncaught:', e && e.message));
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e && (e.message || e)));

const CONFIG_PATHS = [
  process.env.KSS_CONFIG,
  process.env.KSS_DATA_DIR && path.join(process.env.KSS_DATA_DIR, 'config.json'),
  path.join(__dirname, 'config.json'),
].filter(Boolean);

function loadConfig() {
  for (const c of CONFIG_PATHS) {
    try {
      // tolerate a UTF-8 BOM (PowerShell's -Encoding UTF8 adds one)
      const txt = fs.readFileSync(c, 'utf8').replace(/^﻿/, '');
      const cfg = JSON.parse(txt);
      cfg._path = c;
      return cfg;
    } catch (e) {
      if (fs.existsSync(c)) console.warn(`config ${c} could not be parsed: ${e.message}`);
    }
  }
  return {};
}
function settings() {
  const cfg = loadConfig();
  return {
    siteBase: (process.env.KSS_SITE_BASE || cfg.siteBase || '').replace(/\/$/, ''),
    secret: process.env.KSS_INGEST_SECRET || cfg.ingestSecret || '',
    pollMs: Math.max(60000, Number(process.env.KSS_POLL_MS || cfg.pollMs || 180000)),
    sessionGap: Number(process.env.KSS_SESSION_GAP_MIN || cfg.sessionGapMin || 30),
    extraNames: Array.isArray(cfg.extraNames) ? cfg.extraNames.filter(Boolean) : [],
    forcePushMin: Number(cfg.forcePushMin || 15),
  };
}

const client = new KyberClient();
let lastSig = '', lastPushAt = 0;

async function siteGet(base, secret, p) {
  const r = await fetch(`${base}${p}`, { headers: { 'x-kss-secret': secret } });
  if (!r.ok) throw new Error(`${p} -> ${r.status}`);
  return r.json();
}
async function sitePost(base, secret, p, body) {
  const r = await fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kss-secret': secret }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${p} -> ${r.status} ${await r.text().catch(() => '')}`);
  return r.json().catch(() => ({}));
}

async function getRoster(s) {
  let claimed = [];
  if (s.siteBase) {
    try { claimed = (await siteGet(s.siteBase, s.secret, '/api/roster')).roster || []; }
    catch (e) { console.warn('roster fetch failed:', e.message); }
  }
  const byName = new Map();
  for (const n of s.extraNames) byName.set(n.toLowerCase(), { email: null, name: n });
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

async function buildBlob(s) {
  const roster = await getRoster(s);
  const players = [];
  const sigParts = [];
  for (const entry of roster) {
    try {
      const u = await resolve(entry.name);
      if (!u) { players.push({ name: entry.name, email: entry.email, resolved: false }); continue; }
      const { source, raw } = await pullRaw(u);
      snaps.add(u.id, source, raw);
      const sessions = detectSessions(snaps.history(u.id), s.sessionGap).slice(0, 12);
      const stats = decodeStats(raw);
      sigParts.push(u.id + ':' + stats.career.kills + ':' + stats.career.deaths + ':' + stats.career.score + ':' + stats.career.playtimeSec + ':' + sessions.length);
      players.push({ name: entry.name, email: entry.email, resolved: true, username: u.username, id: u.id, source, stats, sessions });
    } catch (e) {
      players.push({ name: entry.name, email: entry.email, resolved: false, error: e.code || e.message });
    }
  }
  let servers = [];
  try {
    const r = await client.getServers({ page: 0 });
    servers = (r.servers || []).map((x) => ({
      id: x.id || x.serverId || null, name: x.name, official: !!x.official, players: x.playerCount, maxPlayers: x.maxPlayerCount,
      requiresPassword: !!x.requiresPassword,
      map: x.levelSetup?.mapName || x.levelSetup?.map || '', mode: x.levelSetup?.modeName || x.levelSetup?.mode || '',
      mods: (x.mods || []).map((m) => m.name),
    })).sort((a, b) => b.players - a.players);
  } catch (e) { servers = { error: e.code || e.message }; }
  return { blob: { agentVersion: 3, updatedAt: new Date().toISOString(), players, servers }, sig: sigParts.join('|') };
}

async function tick() {
  const s = settings();
  try {
    const { blob, sig } = await buildBlob(s);
    const stale = Date.now() - lastPushAt > s.forcePushMin * 60000;
    if (!s.siteBase) {
      fs.mkdirSync(snaps.DATA_DIR, { recursive: true });
      fs.writeFileSync(path.join(snaps.DATA_DIR, 'last-blob.json'), JSON.stringify(blob, null, 2));
      console.log(`[${new Date().toLocaleTimeString()}] no siteBase configured; wrote data/last-blob.json (${blob.players.length} players)`);
    } else if (sig !== lastSig || stale) {
      const changed = sig !== lastSig;
      const res = await sitePost(s.siteBase, s.secret, '/api/ingest', blob);
      lastSig = sig; lastPushAt = Date.now();
      try { fs.mkdirSync(snaps.DATA_DIR, { recursive: true }); fs.writeFileSync(path.join(snaps.DATA_DIR, 'last-blob.json'), JSON.stringify(blob, null, 2)); } catch {}
      const names = blob.players.map((p) => `${p.name}${p.resolved ? '' : '(unresolved:' + (p.error || 'no match') + ')'}${p.stats ? ' kd=' + p.stats.career.kd : ''}`).join(', ');
      console.log(`[${new Date().toLocaleTimeString()}] pushed ${changed ? '(changed)' : '(refresh)'}: ${blob.players.length} players [${names}], ${Array.isArray(blob.servers) ? blob.servers.length : 0} servers -> site replied ${JSON.stringify(res)}`);
      // read back what the site now serves, so a mismatch is visible immediately
      try {
        const back = await (await fetch(`${s.siteBase}/api/data`, { cache: 'no-store' })).json();
        const bn = (back.players || []).map((p) => p.name).join(', ');
        const same = back.updatedAt === blob.updatedAt;
        console.log(`   site /api/data now: ${(back.players || []).length} players [${bn}] updatedAt=${back.updatedAt} ${same ? 'OK (matches this push)' : '!! MISMATCH — site is serving a different blob'}`);
      } catch (e) { console.log(`   read-back failed: ${e.message}`); }
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] no change — skipped push (${blob.players.length} players)`);
    }
  } catch (e) {
    console.error(`[${new Date().toLocaleTimeString()}] cycle error:`, e.message);
  }
}
let loopTimer = null;
async function cycle() { await tick(); loopTimer = setTimeout(cycle, settings().pollMs); }

function main() {
  const s = settings();
  console.log(`Kyber agent starting. site=${s.siteBase || '(none)'} poll=${Math.round(s.pollMs / 1000)}s token=${client.token ? 'set' : 'none'} names=${s.extraNames.length} (config: ${loadConfig()._path || 'none found'})`);
  cycle();
}

if (require.main === module) main();
module.exports = { cycle, tick, buildBlob, settings };
