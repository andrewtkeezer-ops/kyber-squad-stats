# Kyber Squad Stats — site update (v8.1)

## What to copy
- `site/public/index.html`  → replaces the old one
- `site/public/plates/empire.jpg`, `site/public/plates/rebel.jpg` → new folder (background art; swap for clean plates later, same filenames)

## Then
1. Agent: add `"fourskinner83"` (and the other pilot when you have it) to `extraNames` in `agent/config.json` on the desktop. Restart the agent.
2. Before first commit: delete the `[[kv_namespaces]]` placeholder block in `site/wrangler.toml`; bind the `STATS` KV namespace in the Pages dashboard instead.
3. Pages env var `KSS_INGEST_SECRET` must equal `ingestSecret` in the agent's `config.json`.
4. Pages build settings: root dir `site`, no build command, output `public`.

## What's new since v5
- Rebuilt to the approved rail + holotable layout; Rebellion and Empire skins with faction lighting (Rebel flicker / Empire pulse)
- Component kit (tiles, panels, bars, sparkline, gauge, heatmap, segmented control, filters, podium, table)
- Pages: Overview, Leaderboard (career / this week, podium, trends), Player Card, Sessions (records + "when the squad plays" heatmap), Rivalry, Live Servers (filters), Your profile
- Hash routing (#leaderboard, #player/<id>, #sessions …), boot sequence, sliding nav, pointer orbit on the holotable, hover/press feedback, reduced-motion fallback
- Win rate is shown from demo data only; in live mode it reads "—" until that stat key is decoded
