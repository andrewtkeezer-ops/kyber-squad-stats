// /api/invites — the squad allowlist, managed from the Admin screen.
// GET  (admin)  -> { invites:[{email,addedAt,addedBy}], admins:[...] }
// POST (admin)  { email }  -> add
// DELETE (admin) { email } -> remove
// Admins are the comma-separated ADMIN_EMAILS variable on the Worker.
export const norm = (e) => (e || '').trim().toLowerCase();
export function admins(env) { return (env.ADMIN_EMAILS || '').split(',').map(norm).filter(Boolean); }
export async function readInvites(env) {
  try { return JSON.parse((await env.STATS.get('invites')) || '{"invites":[]}'); } catch { return { invites: [] }; }
}
export async function isInvited(env, email) {
  const e = norm(email); if (!e) return false;
  if (admins(env).includes(e)) return true;
  const data = await readInvites(env);
  return (data.invites || []).some((x) => norm(x.email) === e);
}
function who(request) { return norm(request.headers.get('cf-access-authenticated-user-email')); }
function guard(request, env) {
  const me = who(request);
  if (!me) return new Response('no identity', { status: 401 });
  if (!admins(env).includes(me)) return new Response('admins only', { status: 403 });
  return null;
}
export async function onRequestGet({ request, env }) {
  const g = guard(request, env); if (g) return g;
  const data = await readInvites(env);
  const roster = JSON.parse((await env.STATS.get('roster')) || '{"roster":[]}').roster || [];
  const claimed = Object.fromEntries(roster.map((r) => [norm(r.email), r.name]));
  return Response.json({ admins: admins(env), invites: (data.invites || []).map((x) => ({ ...x, claimedName: claimed[norm(x.email)] || null })) });
}
export async function onRequestPost({ request, env }) {
  const g = guard(request, env); if (g) return g;
  const { email } = await request.json().catch(() => ({}));
  const e = norm(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return Response.json({ error: 'enter a valid email' }, { status: 400 });
  const data = await readInvites(env);
  if (!(data.invites || []).some((x) => norm(x.email) === e)) {
    data.invites = [...(data.invites || []), { email: e, addedAt: new Date().toISOString(), addedBy: who(request) }];
    await env.STATS.put('invites', JSON.stringify(data));
  }
  return Response.json({ ok: true });
}
export async function onRequestDelete({ request, env }) {
  const g = guard(request, env); if (g) return g;
  const { email } = await request.json().catch(() => ({}));
  const e = norm(email);
  const data = await readInvites(env);
  data.invites = (data.invites || []).filter((x) => norm(x.email) !== e);
  await env.STATS.put('invites', JSON.stringify(data));
  // also drop their roster claim so the agent stops tracking them
  const r = JSON.parse((await env.STATS.get('roster')) || '{"roster":[]}');
  r.roster = (r.roster || []).filter((x) => norm(x.email) !== e);
  await env.STATS.put('roster', JSON.stringify(r));
  return Response.json({ ok: true });
}
