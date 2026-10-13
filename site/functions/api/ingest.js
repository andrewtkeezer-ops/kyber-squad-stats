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
  // Only accept blobs from the current agent. An old agent process (e.g. the
  // tray build left running from an early install) must not overwrite good data.
  let parsed = null;
  try { parsed = JSON.parse(body); } catch { return new Response('bad json', { status: 400 }); }
  if (!parsed || parsed.agentVersion !== 3) {
    return Response.json({ ok: false, rejected: 'old agent — update and restart the agent' }, { status: 409 });
  }
  await env.STATS.put('blob', body);
  return Response.json({ ok: true, bytes: body.length, players: (parsed.players || []).length });
}
