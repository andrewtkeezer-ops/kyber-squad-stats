// GET /api/me — who am I (from Access) and what name have I claimed.
export async function onRequestGet({ request, env }) {
  const email = request.headers.get('cf-access-authenticated-user-email') || null;
  const data = JSON.parse((await env.STATS.get('roster')) || '{"roster":[]}');
  const mine = (data.roster || []).find((x) => x.email === email) || null;
  return Response.json({ email, name: mine ? mine.name : null });
}
