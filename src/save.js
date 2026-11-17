// Player progress (coins, upgrades, colour). Stored in localStorage, wrapped so it never crashes.
const KEY = 'portal-duel-save-v1';

export const UPGRADES = [
  { id: 'damage',  name: 'Weapon damage',   max: 5, desc: '+8% per level' },
  { id: 'firerate', name: 'Fire rate',      max: 5, desc: '+6% per level' },
  { id: 'mag',     name: 'Magazine size',   max: 5, desc: '+10% per level' },
  { id: 'heal',    name: 'Heal power',      max: 5, desc: '+8 HP per level' },
  { id: 'health',  name: 'Max health',      max: 5, desc: '+10 HP per level' },
  { id: 'portal',  name: 'Portal cooldown', max: 5, desc: '-0.15s per level' },
];

export const COLORS = ['#33aaff', '#ff44cc', '#44ff88', '#ffcc22', '#ff5533', '#aa66ff', '#22ffee', '#ffffff'];

import { DEFAULT_LOOK } from './game/Look.js';

const DEFAULT = {
  coins: 0, xp: 0, upgrades: {}, color: COLORS[0], mode: '1v1', difficulty: 'ranked', rating: 800, map: 'arena',
  gunSkin: 'default', killFx: 'sparks',
  loadout: { primary: 'ar', secondary: 'pistol' },
  look: { ...DEFAULT_LOOK },
  owned: ['none', 'cap', 'beanie'],
  settings: { sens: 1, fov: 80, volume: 0.7, music: 0.5 },
};

export function upgradeCost(level) { return 60 * (level + 1); }

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return { ...DEFAULT, ...d,
        loadout: { ...DEFAULT.loadout, ...(d.loadout || {}) },
        look: { ...DEFAULT.look, ...(d.look || {}) },
        settings: { ...DEFAULT.settings, ...(d.settings || {}) },
        owned: [...new Set([...DEFAULT.owned, ...(d.owned || [])])] };
    }
  } catch (e) { /* storage blocked */ }
  return structuredClone(DEFAULT);
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
}

export function lvl(save, id) { return save.upgrades[id] || 0; }
