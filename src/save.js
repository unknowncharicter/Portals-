// Player progress (coins, upgrades, colour). Stored in localStorage, wrapped so it never crashes.
const KEY = 'portal-duel-save-v1';

export const UPGRADES = [
  { id: 'damage',  name: 'Weapon damage',   max: 5, desc: '+8% per level' },
  { id: 'firerate', name: 'Fire rate',      max: 5, desc: '+6% per level' },
  { id: 'mag',     name: 'Magazine size',   max: 5, desc: '+3 rifle / +1 pistol' },
  { id: 'heal',    name: 'Heal power',      max: 5, desc: '+8 HP per level' },
  { id: 'health',  name: 'Max health',      max: 5, desc: '+10 HP per level' },
  { id: 'portal',  name: 'Portal cooldown', max: 5, desc: '-0.15s per level' },
];

export const COLORS = ['#33aaff', '#ff44cc', '#44ff88', '#ffcc22', '#ff5533', '#aa66ff', '#22ffee', '#ffffff'];

const DEFAULT = { coins: 0, upgrades: {}, color: COLORS[0], mode: '1v1' };

export function upgradeCost(level) { return 60 * (level + 1); }

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch (e) { /* storage blocked */ }
  return { ...DEFAULT, upgrades: {} };
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
}

export function lvl(save, id) { return save.upgrades[id] || 0; }
