// Relay (TURN) logins for online play (Cloudflare Pages Function at /api/turn).
// Players on different networks often can't connect directly (phone data, school/work Wi-Fi,
// strict routers). A TURN relay passes their traffic along instead. Cloudflare gives 1000 GB a
// month free. Setup (see LAUNCH.md): create a TURN key in Cloudflare (Realtime > TURN Server),
// then add two variables to the Pages project: TURN_KEY_ID and TURN_KEY_TOKEN (encrypt the token).
//   GET /api/turn -> { iceServers: [...], relay: true|false }

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const json = (body) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });
// Without a TURN key: public STUN only (works for most home networks, not the strict ones).
const STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (!env.TURN_KEY_ID || !env.TURN_KEY_TOKEN) return json({ iceServers: STUN, relay: false });
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 86400 }),
    });
    if (!r.ok) return json({ iceServers: STUN, relay: false, error: 'turn ' + r.status });
    const d = await r.json();
    const list = Array.isArray(d.iceServers) ? d.iceServers : [d.iceServers];
    return json({ iceServers: [...STUN, ...list], relay: true });
  } catch (e) {
    return json({ iceServers: STUN, relay: false, error: 'turn fetch failed' });
  }
}
