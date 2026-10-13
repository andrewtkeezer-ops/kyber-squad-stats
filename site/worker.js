import * as ingest from './functions/api/ingest.js';
import * as data from './functions/api/data.js';
import * as roster from './functions/api/roster.js';
import * as claim from './functions/api/claim.js';
import * as me from './functions/api/me.js';

const routes = { '/api/ingest': ingest, '/api/data': data, '/api/roster': roster, '/api/claim': claim, '/api/me': me };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const mod = routes[url.pathname];
    if (mod) {
      const h = request.method === 'POST' ? mod.onRequestPost : request.method === 'GET' ? mod.onRequestGet : null;
      if (!h) return new Response('method not allowed', { status: 405 });
      return h({ request, env, ctx });
    }
    return env.ASSETS.fetch(request);
  }
};
