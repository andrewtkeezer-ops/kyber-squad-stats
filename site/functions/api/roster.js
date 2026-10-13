// GET /api/roster — the agent pulls the claimed-names list. Secret-protected
// (same Access *Bypass* path treatment as /api/ingest).
export async function onRequestGet({ request, env }) {
  const secret = request.headers.get('x-kss-secret') || '';
  if (!env.KSS_INGEST_SECRET || secret !== env.KSS_INGEST_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const r = await env.STATS.get('roster');
  return new Response(r || '{"roster":[]}', {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
