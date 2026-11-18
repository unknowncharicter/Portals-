// Global leaderboard (Cloudflare Pages Function at /api/leaderboard).
// Needs a KV namespace bound as LEADERBOARD (Pages project > Settings > Functions > KV bindings).
//   GET  /api/leaderboard          -> { rp: [...], kills: [...] }  (top 50 each)
//   POST /api/leaderboard {id, name, rp, kills, wins}
// One KV key holds both lists: small, and fine for this size of game.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });
const TOP = 50;
// Public tag for a player id (so the game can find "you" in the list without exposing ids).
export function tag(id) { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

function clean(b) {
  const id = String(b.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 24);
  const name = String(b.name || 'Player').replace(/[^\w \-.]/g, '').trim().slice(0, 14) || 'Player';
  const num = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  if (id.length < 8) return null;
  return { id, name, rp: num(b.rp, 10000), kills: num(b.kills, 1e7), wins: num(b.wins, 1e6), t: Date.now() };
}

function upsert(list, entry, key) {
  const old = list.find(e => e.id === entry.id);
  // Sanity limit: a single match can't add more than this much.
  if (old && key === 'rp' && entry.rp > old.rp + 80) entry = { ...entry, rp: old.rp + 80 };
  if (old && key === 'kills' && entry.kills > old.kills + 200) entry = { ...entry, kills: old.kills + 200 };
  const rest = list.filter(e => e.id !== entry.id);
  rest.push({ id: entry.id, name: entry.name, [key]: entry[key], t: entry.t });
  rest.sort((a, b) => b[key] - a[key] || a.t - b.t);
  return rest.slice(0, TOP);
}

async function load(env) {
  const raw = await env.LEADERBOARD.get('top');
  try { return raw ? JSON.parse(raw) : { rp: [], kills: [] }; } catch { return { rp: [], kills: [] }; }
}

export async function onRequestOptions() { return new Response(null, { headers: CORS }); }

export async function onRequestGet({ env }) {
  if (!env.LEADERBOARD) return json({ configured: false });   // 200 so browsers don't log an error
  const top = await load(env);
  return json({ rp: top.rp.map(({ id, ...e }) => ({ ...e, tag: tag(id) })), kills: top.kills.map(({ id, ...e }) => ({ ...e, tag: tag(id) })) });
}

export async function onRequestPost({ request, env }) {
  if (!env.LEADERBOARD) return json({ configured: false });
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad-request' }, 400); }
  const entry = clean(body || {});
  if (!entry) return json({ error: 'bad-request' }, 400);
  const top = await load(env);
  top.rp = upsert(top.rp, entry, 'rp');
  top.kills = upsert(top.kills, entry, 'kills');
  await env.LEADERBOARD.put('top', JSON.stringify(top));
  return json({ ok: true, rankRp: top.rp.findIndex(e => e.id === entry.id) + 1 || null, rankKills: top.kills.findIndex(e => e.id === entry.id) + 1 || null });
}
