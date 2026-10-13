// statsDictionary.js
//
// Battlefront II / Frostbite career stats come back from Kyber's API as a flat
// map of obfuscated keys -> float, e.g. { "c_chbf__sax_gatt": 412, ... }.
//
// The hero/class prefixes and the handful of decoded suffixes below are lifted
// from the open-source Kyber launcher (ArmchairDevelopers/Kyber, GPLv3,
// Launcher/lib/features/stats/...). Only a few suffixes are publicly decoded;
// the rest of the raw map is passed through untouched so you can explore and
// map more keys yourself over time.
//
// NOTE: the launcher's own decoder has some copy/paste quirks (it maps both
// "eliminations" and "playtime" to the same suffix). We keep its known-good
// mappings and expose everything raw, rather than inventing suffixes we can't
// verify.

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

// Known decoded suffixes (from the launcher). Add more here as you identify them.
const SUFFIX = {
  playtime: '_sax_gatt',   // seconds (launcher uses this for playtime AND elims)
  rank: '_crax_ghva',      // hero rank
  deaths: '_eax_gatt',
};

function num(map, key) {
  const v = map[key];
  return typeof v === 'number' && isFinite(v) ? v : 0;
}

// Turn the raw stat map into something readable.
function decodeStats(rawMap) {
  const raw = rawMap || {};

  const heroes = HEROES.map((h) => {
    const playtime = num(raw, `${h.prefix}${SUFFIX.playtime}`);
    const deaths = num(raw, `${h.prefix}${SUFFIX.deaths}`);
    const rank = Math.round(num(raw, `${h.prefix}${SUFFIX.rank}`));
    // Launcher maps elims to the same suffix as playtime; treat it as "score/elim proxy".
    const elims = Math.round(playtime);
    return {
      id: h.id, name: h.name, side: h.side,
      rank, playtimeSec: playtime, eliminations: elims, deaths,
      kd: deaths > 0 ? +(elims / deaths).toFixed(2) : elims,
    };
  });

  const classes = CLASSES.map((c) => ({
    id: c.id, name: c.name,
    playtimeSec: num(raw, `${c.prefix}${SUFFIX.playtime}`),
  }));

  const totalHeroPlaytime = heroes.reduce((a, h) => a + h.playtimeSec, 0);
  const totalClassPlaytime = classes.reduce((a, c) => a + c.playtimeSec, 0);

  return {
    heroes,
    classes,
    totals: {
      heroPlaytimeSec: totalHeroPlaytime,
      classPlaytimeSec: totalClassPlaytime,
      rawKeyCount: Object.keys(raw).length,
    },
  };
}

// Compute a readable diff between two raw stat maps (later - earlier),
// keeping only keys that actually changed. Used for "this session" deltas.
function diffStats(earlierRaw, laterRaw) {
  const a = earlierRaw || {};
  const b = laterRaw || {};
  const changed = {};
  for (const k of Object.keys(b)) {
    const delta = (b[k] || 0) - (a[k] || 0);
    if (Math.abs(delta) > 0.0001) changed[k] = delta;
  }
  return {
    decoded: decodeStats(changed),
    changedRaw: changed,
    changedKeyCount: Object.keys(changed).length,
  };
}

module.exports = { HEROES, CLASSES, SUFFIX, decodeStats, diffStats };
