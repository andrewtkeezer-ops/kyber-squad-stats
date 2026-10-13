// Public landing page for Kyber Squad Stats. No Access on this Worker.
export default { async fetch(request, env) { return env.ASSETS.fetch(request); } };
