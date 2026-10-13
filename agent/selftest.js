// selftest.js — confirm THIS machine reaches Kyber and reads work without login.
//   node selftest.js              -> server browser probe
//   node selftest.js "YourName"   -> also resolve a player + pull stats
// Set KYBER_TOKEN if the no-auth path returns UNAUTHENTICATED.

const { KyberClient, HOST } = require('./lib/kyberClient');
const ok = (s) => `\x1b[32m✓\x1b[0m ${s}`;
const bad = (s) => `\x1b[31m✗\x1b[0m ${s}`;
const info = (s) => `\x1b[36m•\x1b[0m ${s}`;

(async () => {
  const name = process.argv[2];
  const c = new KyberClient();
  console.log(info(`Connecting to ${HOST} (token: ${c.token ? 'set' : 'none'})`));
  try {
    const res = await c.getServers({ page: 0 });
    const servers = res.servers || [];
    console.log(ok(`GetServers works — ${servers.length} server(s)`));
    servers.slice(0, 5).forEach((s) => console.log(`    ${s.name} [${s.playerCount}/${s.maxPlayerCount}]`));
  } catch (e) { console.log(bad(`GetServers: ${e.code || ''} ${e.details || e.message}`)); }

  if (name) {
    try {
      const res = await c.searchUser(name);
      const users = res.users || [];
      console.log(ok(`SearchUser("${name}") — ${users.length} match(es)`));
      users.slice(0, 5).forEach((u) => console.log(`    ${u.username} id=${u.id} persona=${u.personaId || '-'}`));
      if (users[0]) {
        try { const k = await c.getKyberStats(users[0].id);
          console.log(ok(`GetStats(KYBER) — ${Object.keys(k.stats || {}).length} keys`)); }
        catch (e) { console.log(bad(`GetStats(KYBER): ${e.code || ''} ${e.details || e.message}`)); }
      }
    } catch (e) { console.log(bad(`SearchUser: ${e.code || ''} ${e.details || e.message}`)); }
  } else {
    console.log(info('Tip: node selftest.js "YourKyberName" to also test stats.'));
  }
  console.log('\nAll ✓ = reads are public, no token needed.  UNAUTHENTICATED = set KYBER_TOKEN.  timeout/DNS = network/VPN.');
  process.exit(0);
})();
