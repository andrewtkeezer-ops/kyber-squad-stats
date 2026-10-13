// GET /api/data — the latest squad blob for the dashboard. Behind Access, so
// only signed-in friends reach it.
export async function onRequestGet({ env }) {
  const blob = await env.STATS.get('blob');
  return new Response(blob || '{"players":[],"servers":[],"updatedAt":null}', {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
