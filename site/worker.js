import * as ingest from './functions/api/ingest.js';
import * as data from './functions/api/data.js';
import * as roster from './functions/api/roster.js';
import * as claim from './functions/api/claim.js';
import * as me from './functions/api/me.js';
import * as invites from './functions/api/invites.js';

const routes = { '/api/ingest': ingest, '/api/data': data, '/api/roster': roster, '/api/claim': claim, '/api/me': me, '/api/invites': invites };
// The agent reaches these with its shared secret (and an Access service token); no human identity involved.
const AGENT_PATHS = new Set(['/api/ingest', '/api/roster']);

const notInvited = (email) => new Response(`<!doctype html><meta charset="utf-8"><title>Not on the squad list</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#07080c;color:#f2f4f8;font:16px/1.5 system-ui,sans-serif;text-align:center">
<div style="max-width:420px;padding:32px"><div style="font-family:ui-monospace,monospace;letter-spacing:.3em;font-size:11px;color:#ff2d3f">ACCESS DENIED</div>
<h1 style="font-size:28px;margin:12px 0">You're not on the squad list yet.</h1>
<p style="color:#a9b0bf">You signed in as <b style="color:#f2f4f8">${email}</b>. Ask Andrew to invite this address, then reload.</p>
<p style="font-size:12px;color:#6b7384"><a href="/cdn-cgi/access/logout" style="color:#a9b0bf">Sign in with a different account</a></p></div></body>`,
  { status: 403, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // The landing page lives at / (public); the app lives at /app (behind Access).
    if (url.pathname === '/app' || url.pathname === '/app/') {
      const r = await env.ASSETS.fetch(new Request(new URL('/app.html', url).toString(), request));
      return new Response(r.body, r);
    }
    const mod = routes[url.pathname];
    const PUBLIC = url.pathname === '/' || url.pathname === '/index.html' || url.pathname.startsWith('/plates/') || url.pathname.startsWith('/ships/');
    if (!AGENT_PATHS.has(url.pathname) && !PUBLIC) {
      // Everyone else must be a signed-in, invited human. With Access on, the header is always present;
      // if Access is off (local/dev) there's no header and we don't gate.
      const email = request.headers.get('cf-access-authenticated-user-email');
      if (email && !(await invites.isInvited(env, email))) return notInvited(email);
    }
    if (mod) {
      const h = request.method === 'POST' ? mod.onRequestPost : request.method === 'GET' ? mod.onRequestGet : request.method === 'DELETE' ? mod.onRequestDelete : null;
      if (!h) return new Response('method not allowed', { status: 405 });
      return h({ request, env, ctx });
    }
    return env.ASSETS.fetch(request);
  }
};
