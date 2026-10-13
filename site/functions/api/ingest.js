// POST /api/ingest  — the PC agent pushes the latest squad blob here.
// Protected by a shared secret (x-kss-secret). Add an Access *Bypass* policy
// for this path so the agent isn't redirected to Google login.
export async function onRequestPost({ request, env }) {
  const secret = request.headers.get('x-kss-secret') || '';
  if (!env.KSS_INGEST_SECRET || secret !== env.KSS_INGEST_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const body = await request.text();
  if (body.length > 2_000_000) return new Response('too large', { status: 413 });
  await env.STATS.put('blob', body);
  return Response.json({ ok: true, bytes: body.length });
}
