import { lvl } from '../save.js';

// slot: 'primary' or 'secondary'. pellets > 1 = shotgun. zoom = right-click scope FOV.
export const WEAPONS = {
  ar:       { id: 'ar',       slot: 'primary',   name: 'Assault Rifle', damage: 17, headMult: 1.8, interval: 0.1,   mag: 30, reload: 1.8, spread: 0.012, auto: true,  sound: 'rifle' },
  smg:      { id: 'smg',      slot: 'primary',   name: 'SMG',           damage: 12, headMult: 1.6, interval: 0.065, mag: 35, reload: 1.5, spread: 0.022, auto: true,  sound: 'smg' },
  shotgun:  { id: 'shotgun',  slot: 'primary',   name: 'Shotgun',       damage: 11, headMult: 1.4, interval: 0.85,  mag: 6,  reload: 2.2, spread: 0.065, auto: false, sound: 'shotgun', pellets: 9 },
  sniper:   { id: 'sniper',   slot: 'primary',   name: 'Sniper',        damage: 85, headMult: 2.0, interval: 1.3,   mag: 5,  reload: 2.5, spread: 0.05,  auto: false, sound: 'sniper', zoom: 22, scopedSpread: 0.0005 },
  burst:    { id: 'burst',    slot: 'primary',   name: 'Burst Rifle',   damage: 21, headMult: 1.8, interval: 0.4,   mag: 24, reload: 2.0, spread: 0.007, auto: false, sound: 'burst', burst: 3, burstGap: 0.07 },
  crossbow: { id: 'crossbow', slot: 'primary',   name: 'Crossbow',      damage: 95, headMult: 1.6, interval: 0.3,   mag: 1,  reload: 1.1, spread: 0,     auto: false, sound: 'crossbow', projectile: 'bolt', speed: 62 },
  rocket:   { id: 'rocket',   slot: 'primary',   name: 'Rocket Launcher', damage: 0, headMult: 1, interval: 0.9,   mag: 2,  reload: 2.6, spread: 0,     auto: false, sound: 'rocket', projectile: 'rocket', speed: 30 },
  pistol:   { id: 'pistol',   slot: 'secondary', name: 'Pistol',        damage: 26, headMult: 2.0, interval: 0.22,  mag: 12, reload: 1.3, spread: 0.006, auto: false, sound: 'pistol' },
  revolver: { id: 'revolver', slot: 'secondary', name: 'Revolver',      damage: 48, headMult: 2.0, interval: 0.5,   mag: 6,  reload: 2.0, spread: 0.004, auto: false, sound: 'revolver' },
};

export const PRIMARIES = Object.values(WEAPONS).filter(w => w.slot === 'primary').map(w => w.id);
export const SECONDARIES = Object.values(WEAPONS).filter(w => w.slot === 'secondary').map(w => w.id);

export const BASE_PORTAL_COOLDOWN = 2.0; // seconds between portal placements
export const HEAL_COOLDOWN = 15;
export const BASE_HEAL = 45;

// Stats from lobby upgrades. Bots use `null` (no upgrades).
export function buildStats(save) {
  const L = (id) => (save ? lvl(save, id) : 0);
  return {
    damageMult: 1 + 0.08 * L('damage'),
    rateMult: 1 + 0.06 * L('firerate'),
    magMult: 1 + 0.1 * L('mag'),
    heal: BASE_HEAL + 8 * L('heal'),
    maxHp: 100 + 10 * L('health'),
    portalCooldown: BASE_PORTAL_COOLDOWN - 0.15 * L('portal'),
  };
}

export class WeaponState {
  constructor(def, stats) {
    this.def = def;
    this.stats = stats;
    this.ammo = this.mag;
    this.reloadT = 0;
    this.cooldown = 0;
    this.burstLeft = 0;
  }
  get mag() { return Math.round(this.def.mag * this.stats.magMult); }
  get interval() { return this.def.interval / this.stats.rateMult; }
  get damage() { return this.def.damage * this.stats.damageMult; }
  get reloading() { return this.reloadT > 0; }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.reloadT = 0; this.ammo = this.mag; }
    }
  }
  startReload() {
    if (this.reloading || this.ammo === this.mag) return false;
    this.reloadT = this.def.reload;
    return true;
  }
  canFire() { return !this.reloading && this.cooldown <= 0 && this.ammo > 0; }
  consume() { this.ammo--; this.cooldown = this.interval; }
  refill() { this.ammo = this.mag; this.reloadT = 0; this.cooldown = 0; this.burstLeft = 0; }
}
