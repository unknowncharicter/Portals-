// Global leaderboard client (server: functions/api/leaderboard.js on Cloudflare Pages).
// On the Cloudflare site the API is on the same host; anywhere else (CrazyGames) it's called
// on the Cloudflare site directly. Every call fails quietly: the game works without it.
const host = location.hostname;
// Same host on the Cloudflare site; the Cloudflare site from CrazyGames; nothing when testing locally.
const API = host.endsWith('.pages.dev') ? '/api/leaderboard' : /crazygames|1001juegos/.test(host) ? 'https://fps-portals.pages.dev/api/leaderboard' : null;
let off = !API; // stays off once the server says it isn't set up (no repeated requests)

export function playerId(save) {
  if (!save.playerId) {
    const a = new Uint8Array(10);
    (crypto.getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; }));
    save.playerId = [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return save.playerId;
}

// Same as the server's tag(): how "you" are recognised in the list.
export function myTag(save) {
  const id = playerId(save);
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export async function submitScore(save) {
  if (off) return null;
  try {
    const s = save.stats || {};
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: playerId(save), name: save.look.name, rp: save.rating ?? 800, kills: s.kills || 0, wins: s.wins || 0 }) });
    const j = r.ok ? await r.json() : null;
    if (j && j.configured === false) off = true;
    return j;
  } catch (e) { return null; }
}

let cache = null, cacheT = 0;
export async function fetchBoard(force = false) {
  if (off) return null;
  if (!force && cache && performance.now() - cacheT < 60000) return cache;
  try {
    const r = await fetch(API, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    if (j && j.configured === false) { off = true; return null; }
    if (!j || !Array.isArray(j.rp)) return null;
    cache = j; cacheT = performance.now();
    return j;
  } catch (e) { return null; }
}
