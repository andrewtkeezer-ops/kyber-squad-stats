# Kyber Squad Stats

A private, Star Wars-styled stats site for a Battlefront II friend group playing on
[Kyber](https://kyber.gg/): live squad standings, head-to-head rivalries, play sessions,
a weekly "Wrapped", a live server browser with one-click join, and a holotable where each
pilot is a kyber crystal in the colour they chose.

Everything runs on free tiers: Cloudflare Workers + KV + Access, GitHub Actions for
releases, and one always-on Windows PC running a small tray app.

```
 ┌────────────────────────┐   stats blob (HTTPS + secret   ┌────────────────────────────┐
 │  TRAY APP  (agent/)    │   + Access service token)      │  SITE  (site/)             │
 │  on one always-on PC   │ ─────────────────────────────► │  Cloudflare Worker + KV    │
 │  polls Kyber's gRPC    │                                │  dashboard + /api/*        │
 │  API, decodes stats,   │ ◄───────────────────────────── │  behind Cloudflare Access  │
 │  detects sessions      │   roster (who claimed what)    │  (Google sign-in)          │
 └────────────────────────┘                                └────────────────────────────┘
                                                                        ▲
                                                 ┌──────────────────────┴───────────┐
                                                 │  LANDING  (landing/)             │
                                                 │  public Worker: faction toggle,  │
                                                 │  flying fleet, "Sign in" button  │
                                                 └──────────────────────────────────┘
```

## What's in the repo

| Folder | What it is | Deploys to |
|---|---|---|
| `site/` | The app: single-file front end (`public/index.html`), Worker router, `/api/*` handlers, KV | Cloudflare Worker (Workers Builds, path `site`, `npx wrangler deploy`) |
| `landing/` | Public landing page with the faction toggle and fleet | A second Cloudflare Worker (path `landing`) |
| `agent/` | Node + Electron tray app that feeds the site | Windows installer built by GitHub Actions on version bump |
| `.github/workflows/release.yml` | Builds `KyberSquadAgent-Setup-<version>.exe` and publishes a GitHub Release | — |

## How the data works

- Kyber's API is open source ([ArmchairDevelopers/Kyber](https://github.com/ArmchairDevelopers/Kyber), GPL-3.0).
  The agent talks gRPC to `api-rpc.prod.kyber.gg:443`; reads need no token.
- **Stats only accrue on servers marked OFFICIAL.** Community servers never change the numbers.
- Stat keys are Frostbite counters. The decoded ones (confirmed by arithmetic across several
  players) live in `agent/lib/statsDictionary.js`: kills, deaths, score, rank, play time,
  damage, headshots, vehicles destroyed, per-class and per-hero time/kills, per-weapon
  eliminations. Derived: K/D, kills per hour, score per minute.
- **There is no win rate.** Kyber records no match outcomes, so none is shown.
- Sessions are reconstructed from snapshots: a burst of stat changes separated by
  `sessionGapMin` of quiet is one session, and its kills/deaths are the deltas.
- The agent pushes only when a player's stats change (plus a refresh every `forcePushMin`
  minutes), which keeps KV writes far inside the free tier.

## Access model

- Cloudflare Access protects the whole `site/` Worker. The login method is Google only,
  with instant authentication, so visitors go straight to Google's account picker.
- Two Access policies: **Allow** for login method = Google (humans), and **Service Auth**
  for a service token (the tray app).
- The Worker then checks every signed-in email against an invite list in KV (plus the
  `ADMIN_EMAILS` variable). Not invited → a "not on the squad list" page.
- Admins (the `ADMIN_EMAILS` list in `site/wrangler.toml`) get an **Admin** tab to invite or
  remove Gmail addresses. The invite link is just the site URL.
- Each invited user claims their own Kyber gamertag and picks a crystal colour on the
  **You** tab; the agent picks that up on its next cycle.

## Setting it up yourself

1. **Cloudflare Worker for the site.** Workers & Pages → import this repo → root path
   `site`, deploy command `npx wrangler deploy`. Create a KV namespace, bind it as `STATS`,
   and put its id in `site/wrangler.toml`. Add a secret `KSS_INGEST_SECRET` (any long
   random string) and set `ADMIN_EMAILS` in `site/wrangler.toml` to your Gmail.
2. **Cloudflare Access.** In Zero Trust add Google as an identity provider (Google OAuth
   client with redirect URI `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`).
   Create a self-hosted application whose destination is the site Worker; policies as
   above; authentication = Google only + instant auth. Create a service token for the agent.
3. **Landing Worker.** Import the repo again with root path `landing`. No Access on it.
   Point the sign-in button in `landing/public/index.html` at your site URL.
4. **Agent.** Install the latest `KyberSquadAgent-Setup-*.exe` from Releases on the
   always-on PC. Copy `agent/config.example.json` to `config.json`, fill in `siteBase`,
   `ingestSecret`, the service token, and the squad's Kyber names, then tray → **Import
   config.json…**. The crystal turns green on the first successful push.

To ship an agent change, bump `version` in `agent/package.json` and push; Actions builds and
publishes the release, and installed apps update themselves (check on launch and every six
hours, "Restart to update" in the tray menu).

## Front end notes

- One file, no build step: `site/public/index.html`. Data comes from `/api/data`; with no
  data it renders a demo squad so the UI can be worked on anywhere.
- Art assets (background plates, ship sprites, faction crests, the crystal sprite) are in
  `site/public/plates` and `site/public/ships`. The crystal is a luminance sprite that the
  page tints to each pilot's colour.
- Ships carry a heading; the page rotates or mirrors each sprite to fly nose-first along its
  path, and fighters fire faction-coloured bolts.
- Live Servers' JOIN uses Kyber's launcher scheme: `kl://join_server?server_id=<id>`.

## Local development

```
cd agent && npm install && npm run selftest   # talks to Kyber, prints a sample
npm start                                     # run the agent in a console
npm run app                                   # run the tray app from source
cd ../site && npx wrangler dev                 # the site locally (no Access locally)
```

`agent/config.json` and `agent/data/` are gitignored; never commit secrets.

## Not affiliated

Built on the open-source Kyber API. Not affiliated with EA, DICE, Lucasfilm or Kyber.
