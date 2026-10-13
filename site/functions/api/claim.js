// POST /api/claim  { name }  — a signed-in friend claims their Kyber name.
// Identity comes from Cloudflare Access (verified Google email in the header),
// so friends can only claim for themselves.
export async function onRequestPost({ request, env }) {
  const email = request.headers.get('cf-access-authenticated-user-email');
  if (!email) return new Response('no identity (is Access on?)', { status: 401 });
  const { name, color } = await request.json().catch(() => ({}));
  const col = /^#[0-9a-f]{6}$/i.test(color || '') ? color.toLowerCase() : null;
  const clean = (name || '').trim();
  if (!clean) return Response.json({ error: 'name required' }, { status: 400 });
  if (clean.length > 64) return Response.json({ error: 'name too long' }, { status: 400 });

  const data = JSON.parse((await env.STATS.get('roster')) || '{"roster":[]}');
  data.roster = (data.roster || []).filter((x) => x.email !== email);
  data.roster.push({ email, name: clean, color: col, claimedAt: new Date().toISOString() });
  await env.STATS.put('roster', JSON.stringify(data));
  return Response.json({ ok: true, name: clean, color: col });
}

// DELETE /api/claim — stop syncing my gamertag (the user picked the wrong profile).
export async function onRequestDelete({ request, env }) {
  const email = request.headers.get('cf-access-authenticated-user-email');
  if (!email) return new Response('no identity', { status: 401 });
  const data = JSON.parse((await env.STATS.get('roster')) || '{"roster":[]}');
  data.roster = (data.roster || []).filter((x) => x.email !== email);
  await env.STATS.put('roster', JSON.stringify(data));
  return Response.json({ ok: true });
}
