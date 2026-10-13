// statsDictionary.js — decode Battlefront II / Frostbite stat keys from Kyber.
//
// Keys look like  c_<scope>__<metric>_gatt  (counters) or  ..._ghva (ranks).
// Scope prefixes come from the open-source Kyber launcher. The metric meanings
// below were CONFIRMED by arithmetic on a real 254-key map (per-class values
// sum exactly to the career value), which also showed two launcher mappings
// were wrong (it used playtime as "eliminations" and a float as "deaths").
//
//   _sax_gatt   playtime, seconds        (cta 2398 + cts 1100 = ca 3498)
//   _kax_gatt   kills                    (cta 33 + cts 21 = c___k_gatt 54)
//   _csax_gatt  score / XP               (cta 27358 + cts 16345 = score 43703)
//   _crax_ghva  rank of that class/hero
//   c___k_gatt  career kills · c___d_gatt career deaths · c___ka_gatt kills+assists
//   rank / score / experience            career top-level keys
//
// Anything not listed here is left raw and never presented as a fact.

const HEROES = [
  { id: 'bobaFett', name: 'Boba Fett', prefix: 'c_chbf_', side: 'dark' },
  { id: 'bossk', name: 'Bossk', prefix: 'c_chbo_', side: 'dark' },
  { id: 'darthVader', name: 'Darth Vader', prefix: 'c_chdv_', side: 'dark' },
  { id: 'emperor', name: 'Emperor Palpatine', prefix: 'c_chem_', side: 'dark' },
  { id: 'grievous', name: 'General Grievous', prefix: 'c_chgr_', side: 'dark' },
  { id: 'iden', name: 'Iden Versio', prefix: 'c_cgid_', side: 'dark' },
  { id: 'kyloRen', name: 'Kylo Ren', prefix: 'c_chkr_', side: 'dark' },
  { id: 'maul', name: 'Darth Maul', prefix: 'c_chma_', side: 'dark' },
  { id: 'phasma', name: 'Captain Phasma', prefix: 'c_chph_', side: 'dark' },
  { id: 'dooku', name: 'Count Dooku', prefix: 'c_chdo_', side: 'dark' },
  { id: 'bb9E', name: 'BB-9E', prefix: 'c_ch9e_', side: 'dark' },
  { id: 'chewbacca', name: 'Chewbacca', prefix: 'c_chch_', side: 'light' },
  { id: 'hanSolo', name: 'Han Solo', prefix: 'c_chhs_', side: 'light' },
  { id: 'lando', name: 'Lando Calrissian', prefix: 'c_chla_', side: 'light' },
  { id: 'leia', name: 'Leia Organa', prefix: 'c_chle_', side: 'light' },
  { id: 'luke', name: 'Luke Skywalker', prefix: 'c_chlu_', side: 'light' },
  { id: 'rey', name: 'Rey', prefix: 'c_chre_', side: 'light' },
  { id: 'yoda', name: 'Yoda', prefix: 'c_chyo_', side: 'light' },
  { id: 'finn', name: 'Finn', prefix: 'c_chfi_', side: 'light' },
  { id: 'obiWan', name: 'Obi-Wan Kenobi', prefix: 'c_chob_', side: 'light' },
  { id: 'anakin', name: 'Anakin Skywalker', prefix: 'c_chan_', side: 'light' },
  { id: 'bb8', name: 'BB-8', prefix: 'c_chbb_', side: 'light' },
];

const CLASSES = [
  { id: 'assault', name: 'Assault', prefix: 'c_cta_' },
  { id: 'heavy', name: 'Heavy', prefix: 'c_cth_' },
  { id: 'officer', name: 'Officer', prefix: 'c_cto_' },
  { id: 'specialist', name: 'Specialist', prefix: 'c_cts_' },
  { id: 'aerial', name: 'Aerial', prefix: 'c_chspallair_' },
  { id: 'enforcer', name: 'Enforcer', prefix: 'c_chspallenf_' },
  { id: 'infiltrator', name: 'Infiltrator', prefix: 'c_chspallinf_' },
];

const SUFFIX = { playtime: '_sax_gatt', kills: '_kax_gatt', score: '_csax_gatt', rank: '_crax_ghva' };
const CAREER = {
  kills: 'c___k_gatt', deaths: 'c___d_gatt', killsAssists: 'c___ka_gatt',
  score: 'score', xp: 'experience', rank: 'rank', playtime: 'c_ca__sax_gatt',
  vehiclesDestroyed: 'c___vdx_gatt',
};

const num = (m, k) => { const v = m[k]; return typeof v === 'number' && isFinite(v) ? v : 0; };
const kdOf = (k, d) => (d > 0 ? +(k / d).toFixed(2) : (k > 0 ? k : 0));

function scoped(raw, prefix) {
  const playtimeSec = num(raw, prefix + SUFFIX.playtime);
  const kills = Math.round(num(raw, prefix + SUFFIX.kills));
  return { playtimeSec, kills, score: Math.round(num(raw, prefix + SUFFIX.score)), rank: Math.round(num(raw, prefix + SUFFIX.rank)) };
}

function decodeStats(rawMap) {
  const raw = rawMap || {};
  const kills = Math.round(num(raw, CAREER.kills));
  const deaths = Math.round(num(raw, CAREER.deaths));
  const career = {
    kills, deaths, kd: kdOf(kills, deaths),
    killsAssists: Math.round(num(raw, CAREER.killsAssists)),
    score: Math.round(num(raw, CAREER.score)) || Math.round(num(raw, CAREER.xp)),
    rank: Math.round(num(raw, CAREER.rank)),
    playtimeSec: num(raw, CAREER.playtime),
    vehiclesDestroyed: Math.round(num(raw, CAREER.vehiclesDestroyed)),
  };
  const heroes = HEROES.map((h) => ({ id: h.id, name: h.name, side: h.side, ...scoped(raw, h.prefix) }));
  const classes = CLASSES.map((c) => ({ id: c.id, name: c.name, ...scoped(raw, c.prefix) }));
  const heroPlaytimeSec = heroes.reduce((a, h) => a + h.playtimeSec, 0);
  const classPlaytimeSec = classes.reduce((a, c) => a + c.playtimeSec, 0);
  return {
    career, heroes, classes,
    totals: { heroPlaytimeSec, classPlaytimeSec, rawKeyCount: Object.keys(raw).length },
  };
}

// Diff two raw maps (later − earlier) and decode the delta: what happened in between.
function diffStats(earlierRaw, laterRaw) {
  const a = earlierRaw || {}, b = laterRaw || {};
  const changed = {};
  for (const k of Object.keys(b)) {
    const d = (b[k] || 0) - (a[k] || 0);
    if (Math.abs(d) > 0.0001) changed[k] = d;
  }
  return { decoded: decodeStats(changed), changedRaw: changed, changedKeyCount: Object.keys(changed).length };
}

module.exports = { HEROES, CLASSES, SUFFIX, CAREER, decodeStats, diffStats };
