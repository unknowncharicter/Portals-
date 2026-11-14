import { lvl } from '../save.js';

export const WEAPONS = {
  rifle:  { id: 'rifle',  name: 'Rifle',  damage: 17, headMult: 1.8, interval: 0.1,  mag: 30, reload: 1.8, spread: 0.012, auto: true },
  pistol: { id: 'pistol', name: 'Pistol', damage: 28, headMult: 2.0, interval: 0.24, mag: 12, reload: 1.3, spread: 0.005, auto: false },
};

export const BASE_PORTAL_COOLDOWN = 2.0; // seconds between portal placements
export const HEAL_COOLDOWN = 15;
export const BASE_HEAL = 45;

// Stats from lobby upgrades. Bots use `null` (no upgrades).
export function buildStats(save) {
  const L = (id) => (save ? lvl(save, id) : 0);
  return {
    damageMult: 1 + 0.08 * L('damage'),
    rateMult: 1 + 0.06 * L('firerate'),
    magBonus: { rifle: 3 * L('mag'), pistol: L('mag') },
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
  }
  get mag() { return this.def.mag + (this.stats.magBonus[this.def.id] || 0); }
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
  refill() { this.ammo = this.mag; this.reloadT = 0; this.cooldown = 0; }
}
