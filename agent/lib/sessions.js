// sessions.js — reconstruct discrete play sessions from the snapshot timeline.
//
// Kyber only gives cumulative stats, so we infer "sessions" from WHEN stats
// changed. Walk the snapshots in time order; whenever a snapshot's raw stats
// differ from the previous one, that interval was "active". Consecutive active
// intervals (with gaps shorter than gapMin) are grouped into one session.
//
// This is what lets a friend's solo night show up as its own session even if
// nobody looked at the dashboard for days — as long as the poller was running
// while they played.

const { diffStats } = require('./statsDictionary');

function changed(a, b) {
  const A = a || {}, B = b || {};
  for (const k of Object.keys(B)) {
    if (Math.abs((B[k] || 0) - (A[k] || 0)) > 0.0001) return true;
  }
  return false;
}

// snaps: [{ ts, source, raw }] in chronological order.
// gapMin: minutes of inactivity that ends a session.
function detectSessions(snaps, gapMin = 30) {
  if (!snaps || snaps.length < 2) return [];
  const gapMs = gapMin * 60 * 1000;
  const sessions = [];
  let cur = null;

  for (let i = 1; i < snaps.length; i++) {
    const prev = snaps[i - 1];
    const now = snaps[i];
    const active = changed(prev.raw, now.raw);
    const prevMs = new Date(prev.ts).getTime();
    const nowMs = new Date(now.ts).getTime();

    if (active) {
      if (!cur) {
        cur = { startBaseline: prev, start: prev.ts, end: now.ts, endSnap: now };
      } else if (nowMs - new Date(cur.end).getTime() <= gapMs) {
        cur.end = now.ts; cur.endSnap = now;
      } else {
        sessions.push(cur);
        cur = { startBaseline: prev, start: prev.ts, end: now.ts, endSnap: now };
      }
    }
  }
  if (cur) sessions.push(cur);

  return sessions.map((s) => {
    const delta = diffStats(s.startBaseline.raw, s.endSnap.raw);
    const durMin = Math.round((new Date(s.end) - new Date(s.start)) / 60000);
    return {
      start: s.start, end: s.end, durationMin: durMin,
      source: s.endSnap.source,
      changedKeyCount: delta.changedKeyCount,
      decoded: delta.decoded,
    };
  }).reverse(); // newest first
}

module.exports = { detectSessions };
