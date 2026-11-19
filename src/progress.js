// XP & levels, daily reward streak, daily challenges, lifetime stats and the cosmetics catalogue.
// Everything lives in the save object (see save.js).

export const XP = { match: 25, kill: 25, portalKill: 40, headshot: 10, round: 30, win: 100 };

// XP needed to go from `level` to `level + 1`.
export const xpForLevel = (level) => 100 + 50 * level;

export function levelInfo(xp) {
  let level = 1, left = xp;
  while (left >= xpForLevel(level)) { left -= xpForLevel(level); level++; }
  return { level, into: left, need: xpForLevel(level) };
}

// ---------- Cosmetics ----------
// level: unlocks for free at that level. price: costs coins.
export const GUN_SKINS = [
  { id: 'default', name: 'Factory',  price: 0 },
  { id: 'jungle',  name: 'Jungle',   price: 200, color: '#4f7a3a' },
  { id: 'ice',     name: 'Ice',      price: 250, color: '#a8ecff', emissive: '#0a2a3a' },
  { id: 'ruby',    name: 'Ruby',     price: 250, color: '#e0304a', emissive: '#300008' },
  { id: 'gold',    name: 'Gold',     price: 400, color: '#ffcc33', emissive: '#3a2400' },
  { id: 'neon',    name: 'Neon',     price: 450, color: 'portal', emissive: 'portal' },
  { id: 'void',    name: 'Void',     price: 600, color: '#1a0d2e', emissive: '#40108a' },
  { id: 'rainbow', name: 'Rainbow',  level: 10, color: 'rainbow' },
  // Exclusive: one per week, the reward for finishing all three weekly challenges.
  { id: 'lava',    name: 'Lava',     weekly: true, color: '#ff5a1f', emissive: '#7a1800' },
  { id: 'galaxy',  name: 'Galaxy',   weekly: true, color: '#4a2aa8', emissive: '#2a0f7a' },
  { id: 'frost',   name: 'Frost',    weekly: true, color: '#d8f4ff', emissive: '#2a5a7a' },
  { id: 'toxic',   name: 'Toxic',    weekly: true, color: '#8cff3a', emissive: '#205a00' },
  { id: 'chrome',  name: 'Chrome',   weekly: true, color: '#e8ecf4', emissive: '#1a1e28' },
  { id: 'cyber',   name: 'Cyber',    weekly: true, color: '#ff3ad8', emissive: '#5a0050' },
];
const WEEKLY_SKINS = GUN_SKINS.filter(s => s.weekly);

export const KILL_FX = [
  { id: 'sparks',   name: 'Sparks',   price: 0 },
  { id: 'confetti', name: 'Confetti', price: 200 },
  { id: 'pixels',   name: 'Pixels',   price: 250 },
  { id: 'ghost',    name: 'Ghost',    price: 300 },
  { id: 'vortex',   name: 'Vortex',   level: 5 },
];

export function owns(save, item) {
  if (item.weekly) return (save.owned || []).includes(item.id);
  if (!item.price && !item.level) return true;
  if (item.level && levelInfo(save.xp || 0).level >= item.level) return true;
  return (save.owned || []).includes(item.id);
}

// ---------- Daily reward ----------
const STREAK_REWARDS = [50, 75, 100, 125, 150, 200, 300];
const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const yesterdayKey = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); };

export function dailyReward(save) {
  const dr = save.dailyReward || { last: null, streak: 0 };
  const today = dayKey();
  const canClaim = dr.last !== today;
  const nextStreak = canClaim ? (dr.last === yesterdayKey() ? dr.streak + 1 : 1) : dr.streak;
  const day = ((nextStreak - 1) % 7) + 1;
  return { canClaim, streak: canClaim ? nextStreak : dr.streak, day, amount: STREAK_REWARDS[day - 1], rewards: STREAK_REWARDS };
}

export function claimDailyReward(save) {
  const info = dailyReward(save);
  if (!info.canClaim) return 0;
  save.dailyReward = { last: dayKey(), streak: info.streak };
  save.coins += info.amount;
  return info.amount;
}

// ---------- Daily challenges ----------
const POOL = [
  { stat: 'kills',        text: n => `Get ${n} kills`,               ns: [10, 15, 20], reward: 100 },
  { stat: 'portalKills',  text: n => `Get ${n} portal kills`,     ns: [2, 3, 5],    reward: 150 },
  { stat: 'headshots',    text: n => `Get ${n} headshot kills`,      ns: [3, 5, 8],    reward: 120 },
  { stat: 'wins',         text: n => `Win ${n} match${n > 1 ? 'es' : ''}`, ns: [1, 2, 3], reward: 120 },
  { stat: 'grenadeKills', text: n => `Get ${n} grenade kill${n > 1 ? 's' : ''}`, ns: [1, 2, 3], reward: 130 },
  { stat: 'matches',      text: n => `Play ${n} matches`,            ns: [2, 3, 4],    reward: 80 },
  { stat: 'rounds',       text: n => `Win ${n} rounds`,              ns: [4, 6, 8],    reward: 100 },
];

// Small seeded random so everyone gets the same challenges on the same day.
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}

// ---------- Weekly challenges ----------
// Monday-based week number, so everyone gets the same set (and the same exclusive skin).
export function weekKey(d = new Date()) {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const monday = new Date(t); monday.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  return Math.floor((monday - new Date(2024, 0, 1)) / (7 * 864e5));
}
export function daysLeftInWeek(d = new Date()) { return 7 - ((d.getDay() + 6) % 7); }
const WEEK_POOL = [
  { stat: 'kills',       text: n => `Get ${n} kills`,              ns: [50, 70],  reward: 300 },
  { stat: 'portalKills', text: n => `Get ${n} portal kills`,    ns: [10, 15],  reward: 400 },
  { stat: 'wins',        text: n => `Win ${n} matches`,            ns: [6, 8],    reward: 350 },
  { stat: 'headshots',   text: n => `Get ${n} headshot kills`,     ns: [20, 30],  reward: 350 },
  { stat: 'captures',    text: n => `Capture ${n} flags`,       ns: [4, 6],    reward: 400 },
  { stat: 'matches',     text: n => `Play ${n} matches`,           ns: [12, 15],  reward: 250 },
];
export function weeklySkin(week = weekKey()) { return WEEKLY_SKINS[((week % WEEKLY_SKINS.length) + WEEKLY_SKINS.length) % WEEKLY_SKINS.length]; }
export function weeklyChallenges(save) {
  const week = weekKey();
  if (!save.weekly || save.weekly.week !== week) {
    const rnd = seeded('week' + week);
    const pool = [...WEEK_POOL], list = [];
    for (let i = 0; i < 3; i++) {
      const c = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      const n = c.ns[Math.floor(rnd() * c.ns.length)];
      list.push({ stat: c.stat, target: n, text: c.text(n), reward: c.reward, progress: 0, done: false });
    }
    save.weekly = { week, list, claimed: false };
  }
  return save.weekly;
}

export function dailyChallenges(save) {
  const today = dayKey();
  if (!save.challenges || save.challenges.day !== today) {
    const rnd = seeded(today);
    const pool = [...POOL];
    const list = [];
    for (let i = 0; i < 3; i++) {
      const c = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      const n = c.ns[Math.floor(rnd() * c.ns.length)];
      list.push({ stat: c.stat, target: n, text: c.text(n), reward: c.reward + n * 5, progress: 0, done: false });
    }
    save.challenges = { day: today, list };
  }
  return save.challenges.list;
}

// ---------- After a match ----------
// res: { won, earned: { kills, portalKills, headshots, shots, hits, deaths, grenadeKills, rounds } }
export function applyMatch(save, res) {
  const e = res.earned;
  const out = { xp: 0, levelUps: [], levelCoins: 0, challengesDone: [] };

  // XP
  out.xp = XP.match + e.kills * XP.kill + e.portalKills * XP.portalKill + e.headshots * XP.headshot + e.rounds * XP.round + (res.won ? XP.win : 0);
  const before = levelInfo(save.xp || 0).level;
  save.xp = (save.xp || 0) + out.xp;
  const after = levelInfo(save.xp).level;
  for (let l = before + 1; l <= after; l++) {
    const coins = 40 + 10 * l;
    out.levelUps.push({ level: l, coins });
    out.levelCoins += coins;
  }
  save.coins += out.levelCoins;

  // Lifetime stats
  const s = save.stats = { matches: 0, wins: 0, kills: 0, deaths: 0, portalKills: 0, headshots: 0, shots: 0, hits: 0, grenadeKills: 0, rounds: 0, ...(save.stats || {}) };
  const add = { matches: 1, wins: res.won ? 1 : 0, kills: e.kills, deaths: e.deaths, portalKills: e.portalKills, headshots: e.headshots, shots: e.shots, hits: e.hits, grenadeKills: e.grenadeKills, rounds: e.rounds, captures: e.captures || 0 };
  for (const k in add) s[k] = (s[k] || 0) + add[k];

  // Challenges
  for (const c of dailyChallenges(save)) {
    if (c.done) continue;
    c.progress = Math.min(c.target, c.progress + (add[c.stat] || 0));
    if (c.progress >= c.target) {
      c.done = true;
      save.coins += c.reward;
      save.xp += 50;
      out.challengesDone.push(c);
    }
  }
  // Weekly challenges (all three done: this week's exclusive gun skin)
  out.weeklyDone = [];
  const wk = weeklyChallenges(save);
  for (const c of wk.list) {
    if (c.done) continue;
    c.progress = Math.min(c.target, c.progress + (add[c.stat] || 0));
    if (c.progress >= c.target) { c.done = true; save.coins += c.reward; save.xp += 100; out.weeklyDone.push(c); }
  }
  if (!wk.claimed && wk.list.every(c => c.done)) {
    wk.claimed = true;
    const skin = weeklySkin(wk.week);
    if (!save.owned.includes(skin.id)) save.owned.push(skin.id);
    out.weeklySkin = skin;
  }
  return out;
}

// ---------- Ranked ----------
// Rank points (RP): win to climb, lose to drop. Ranked bots get tougher as you climb.
export const START_RP = 800;
export const RANKS = [
  { name: 'Bronze',   min: 0,    color: '#c98a4b', icon: '🥉' },
  { name: 'Silver',   min: 800,  color: '#c8d0dc', icon: '🥈' },
  { name: 'Gold',     min: 1000, color: '#ffcf3a', icon: '🥇' },
  { name: 'Platinum', min: 1200, color: '#5ce0d0', icon: '💠' },
  { name: 'Diamond',  min: 1400, color: '#6aa8ff', icon: '💎' },
  { name: 'Master',   min: 1600, color: '#c45cff', icon: '🔮' },
  { name: 'Legend',   min: 1800, color: '#ff5c7a', icon: '👑' },
];

export function rankInfo(rp = START_RP) {
  let i = 0;
  while (i + 1 < RANKS.length && rp >= RANKS[i + 1].min) i++;
  const r = RANKS[i], next = RANKS[i + 1];
  return { ...r, index: i, rp, next, into: next ? (rp - r.min) / (next.min - r.min) : 1 };
}

// Rating change for one ranked match. Bots are matched to you, so it's roughly even:
// a win is worth a bit more than a loss costs, and kills soften a loss / boost a win.
export function applyRanked(save, res) {
  const before = save.rating ?? START_RP;
  const k = Math.min(res.earned.kills || 0, 6);
  const delta = res.won ? 22 + k : -Math.max(8, 22 - k * 2);
  save.rating = Math.max(0, before + delta);
  const a = rankInfo(before), b = rankInfo(save.rating);
  return { before, after: save.rating, delta, rankUp: b.index > a.index, rankDown: b.index < a.index, rank: b };
}
