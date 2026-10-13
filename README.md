# Kyber Squad Stats

A private stats site for your Star Wars Battlefront II friend group on
[Kyber](https://kyber.gg/) — leaderboard, play sessions, and a live server browser.

It has two parts:

```
  ┌─────────────────────────┐        push stats         ┌──────────────────────────┐
  │  AGENT  (your always-on  │  ───────────────────────► │  SITE  (Cloudflare Pages) │
  │  desktop)                │   HTTPS + secret          │  + Functions + KV         │
  │  polls Kyber's API,      │                           │  shows the dashboard,     │
  │  detects play sessions,  │  ◄─────────────────────── │  gated by Google login    │
  │  pushes a stats blob     │     pulls friend roster   │  (Cloudflare Access)      │
  └─────────────────────────┘                           └──────────────────────────┘
          runs on ONE machine                     friends open the URL from anywhere
```

- **`agent/`** — a small Node app that runs on your always-on machine. It does all the
  Kyber talking and pushes results up to the site. Installable as a tray app.
- **`site/`** — a Cloudflare Pages site (free) that displays whatever the agent pushed,
  behind a Google sign-in so only invited friends can see it.

Everything here runs on **free tiers** (Cloudflare Pages, Functions, KV, Access ≤50 users).

---

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ on the machine that will run the agent.
- A free [Cloudflare](https://dash.cloudflare.com/sign-up) account.
- The Wrangler CLI (`npm i -g wrangler`) and `wrangler login` once.

---

## Part A — Deploy the site (once, ~10 min)

From the `site/` folder:

**1. Create the KV namespace** (stores the stats blob + the claimed-names roster):

```
cd site
npx wrangler kv namespace create STATS
```

Copy the `id` it prints into `wrangler.toml` (replace `PASTE_KV_NAMESPACE_ID_HERE`).

**2. Set the ingest secret** (a long random string the agent uses to push data):

```
npx wrangler pages secret put KSS_INGEST_SECRET
```

Paste a long random string when prompted. Save the same string — the agent needs it.

**3. Deploy:**

```
npx wrangler pages deploy public
```

This gives you a URL like `https://kyber-squad-stats.pages.dev`. In the Cloudflare
dashboard → your Pages project → **Settings → Functions → KV namespace bindings**, add a
binding named **`STATS`** pointing at the namespace from step 1. (Re-deploy if you added
it after the first deploy.)

**4. Turn on Google login + invite friends (Cloudflare Access):**

In the dashboard → **Zero Trust → Access → Applications → Add a self-hosted app**:
- Application domain: your `*.pages.dev` hostname.
- Add **Google** as a login method (Zero Trust → Settings → Authentication → add Google —
  this is where your "Google Cloud" OAuth client goes; or just use the one-time-PIN email
  option if you'd rather skip Google setup).
- Add a policy: **Allow**, with a rule of **Emails** = your 4–6 friends' Gmail addresses.
- **Important:** add a second application (or a path rule) for `/api/ingest` and
  `/api/roster` with a **Bypass** policy, so the agent (which has no Google login) can
  reach those two endpoints. They're still protected by your ingest secret.

That's the site. It'll say "no data yet" until the agent runs.

---

## Part B — Run the agent (on your always-on machine)

> This must run on the machine that stays on — your **desktop**. (See the note at the
> bottom about moving these files there.)

**1. Check it can reach Kyber (do this first):**

```
cd agent
npm install
npm run selftest
```

or `node selftest.js "YourExactKyberName"` to also test stats. Expected: all ✓. If you
see `UNAUTHENTICATED`, reads need a token — set `KYBER_TOKEN` (ask me, I'll help find it).
If you see a timeout/DNS error, the machine can't reach Kyber (VPN/firewall).

**2. Configure it:** copy `agent/config.example.json` to `agent/config.json` and fill in:

```json
{
  "siteBase": "https://kyber-squad-stats.pages.dev",
  "ingestSecret": "the-same-secret-from-Part-A-step-2",
  "pollMs": 90000,
  "sessionGapMin": 30,
  "extraNames": ["YourKyberName"]
}
```

`extraNames` are always-tracked names (handy for yourself). Your friends add themselves
from the site, so you don't need to list them here.

**3. Run it:**

```
npm start
```

Leave it running. It pushes to the site every ~90 seconds. Done.

### Make it a real installed app (recommended)

```
cd agent
npm run dist
```

Produces `agent/dist/Kyber Squad Agent Setup 0.1.0.exe`. Installing it gives you a
**system-tray** app that launches at login and quietly keeps the site fed — no terminal,
no window. First run: open the tray menu → *Open config file*, fill in `siteBase` +
`ingestSecret`, then *Push now*. (Unsigned app → Windows SmartScreen will warn once;
*More info → Run anyway*.)

---

## How your friends join

1. You send them the `*.pages.dev` URL.
2. They open it, sign in with Google (they must be on your Access allow-list — add their
   email in Zero Trust → Access → your app → policy).
3. On the **You** tab they type their exact Kyber / in-game name and hit **Claim my name**.
4. Within a couple of minutes the agent picks them up and their stats appear on the
   Leaderboard — including nights they play without you, as long as the agent's running.

No one connects or authorizes a Kyber/EA account — stats are looked up by in-game name.

---

## Honest limits

- **"Sessions," not matches.** Kyber only exposes cumulative career stats, so the agent
  reconstructs play sessions by diffing snapshots over time. It's not a literal per-match
  scoreboard (that would need hosting a Kyber server — a bigger future project).
- **Partial stat decoding.** Battlefront's stat keys are obfuscated; only a handful are
  publicly decoded (hero/class playtime, rank, deaths — from the open-source launcher).
  The app shows those and keeps the full raw payload so more can be mapped over time in
  `agent/lib/statsDictionary.js`.
- **The agent must be running** while someone plays for that session to be recorded. If
  the desktop is off, the site stays up but data goes stale until it's back.

## Credit

Built on the open-source [Kyber project](https://github.com/ArmchairDevelopers/Kyber)
(GPLv3) — the `.proto` files and stat-key mappings come from there.
