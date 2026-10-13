# update-v4 — reconciled build (2026-10-13)

Merges the v8.1 front end (left-rail design from the mobile chat) with the v3 agent
(new stat decoder + hot-reload config + push-on-change) from the desktop chat.

## site/public/
- index.html — v8.1 (Overview, Leaderboard, Rivalry, Player Card, Sessions, Live Servers, You;
  Empire/Rebellion themes; reads /api/data, /api/me, /api/claim; demo fallback).
- plates/empire.jpg, plates/rebel.jpg — referenced as files (page is 91 KB, not 395 KB).
- If an older site/public/img/ folder exists from update-v3, it is unused and can be deleted.

## agent/
- lib/statsDictionary.js — decoder with CONFIRMED keys: career kills (c___k_gatt), deaths
  (c___d_gatt), K/D, score, rank; per class/hero playtime (_sax_gatt), kills (_kax_gatt),
  score (_csax_gatt), rank (_crax_ghva). Fixes two wrong mappings in the official launcher.
- index.js — config.json hot-reloads every cycle (add a friend, save, no restart); tolerates a
  UTF-8 BOM; pushes to the site only when a player's stats changed, plus a refresh every
  forcePushMin (15) minutes — keeps Cloudflare KV far inside the free tier.
- lib/kyberClient.js — correct gRPC host api-rpc.prod.kyber.gg + the launcher's headers.
- config.example.json — new defaults (pollMs 180000, forcePushMin 15).
- Your existing agent/config.json is NOT touched.

## Deployment reality (supersedes the handoff note)
- The site is deployed as a Cloudflare WORKER with static assets (site/wrangler.toml has
  [assets] + the real KV namespace id). It is NOT a Pages project.
  DO NOT delete the [[kv_namespaces]] block — the Worker needs it; deleting it breaks /api/*.
- Pushing to GitHub (andrewtkeezer-ops/kyber-squad-stats) auto-deploys via Workers Builds.
- The agent is already live with siteBase set and pushing; after this update restart it once.
