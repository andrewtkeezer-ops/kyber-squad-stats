// POST /api/claim  { name }  — a signed-in friend claims their Kyber name.
// Identity comes from Cloudflare Access (verified Google email in the header),
// so friends can only claim for themselves.
export async function onRequestPost({ request, env }) {
  const email = request.headers.get('cf-access-authenticated-user-email');
  if (!email) return new Response('no identity (is Access on?)', { status: 401 });
  const { name } = await request.json().catch(() => ({}));
  const clean = (name || '').trim();
  if (!clean) return Response.json({ error: 'name required' }, { status: 400 });
  if (clean.length > 64) return Response.json({ error: 'name too long' }, { status: 400 });

  const data = JSON.parse((await env.STATS.get('roster')) || '{"roster":[]}');
  data.roster = (data.roster || []).filter((x) => x.email !== email);
  data.roster.push({ email, name: clean, claimedAt: new Date().toISOString() });
  await env.STATS.put('roster', JSON.stringify(data));
  return Response.json({ ok: true, name: clean });
}
