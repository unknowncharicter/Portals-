import * as THREE from 'three';
import { rayBox } from './World.js';
import { WEAPONS, WeaponState, HEAL_COOLDOWN } from './Weapons.js';
import { gunModel } from './Models.js';

const GRAVITY = 24;
const JUMP_SPEED = 8.2;
const WALK = 6.5, SPRINT = 9.5;
const STEP_HEIGHT = 0.55;
const EPS = 0.001;

export class Character {
  constructor({ name, team, color, portalColor, isBot, stats, loadout }) {
    this.name = name;
    this.team = team;
    this.color = color;
    this.portalColor = portalColor;
    this.isBot = isBot;
    this.stats = stats;

    this.radius = 0.35;
    this.halfHeight = 0.9;
    this.eyeOffset = 0.7;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.grounded = false;
    this.teleportCooldown = 0;

    this.maxHp = stats.maxHp;
    this.hp = this.maxHp;
    this.alive = true;
    this.kills = 0;

    this.weapons = [new WeaponState(WEAPONS[loadout.primary], stats), new WeaponState(WEAPONS[loadout.secondary], stats)];
    this.slot = 0;
    this.switchT = 0;
    this.healCd = 0;
    this.portalCd = 0;
    this.lastAttacker = null;

    this.walkT = 0;
    this.bodyLayer = 0;
    this.mesh = this.buildMesh();
    this.gunId = null;
    this.updateGun();
  }

  // Show the model of the weapon currently held.
  updateGun() {
    const id = this.weapon.def.id;
    if (id === this.gunId) return;
    this.gunId = id;
    this.gunHolder.clear();
    const m = gunModel(id);
    if (m) {
      m.traverse(o => o.layers.set(this.bodyLayer));
      this.gunHolder.add(m);
    }
  }

  get weapon() { return this.weapons[this.slot]; }

  buildMesh() {
    const g = new THREE.Group();
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
    const body = mat(this.color), skin = mat('#f0c8a0'), dark = mat('#2a2a35'), glow = new THREE.MeshBasicMaterial({ color: this.portalColor });
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
    this.legL = box(0.24, 0.8, 0.26, dark, -0.15, -0.5, 0);
    this.legR = box(0.24, 0.8, 0.26, dark, 0.15, -0.5, 0);
    for (const leg of [this.legL, this.legR]) { leg.geometry.translate(0, -0.4, 0); leg.position.y += 0.4; }
    box(0.62, 0.78, 0.36, body, 0, 0.16, 0);
    box(0.42, 0.42, 0.42, skin, 0, 0.72, 0);
    box(0.36, 0.1, 0.05, glow, 0, 0.76, -0.22); // visor in portal colour
    box(0.16, 0.16, 0.6, body, 0.3, 0.32, -0.25); // arm
    this.gunHolder = new THREE.Group();
    this.gunHolder.position.set(0.3, 0.38, -0.5);
    g.add(this.gunHolder);
    box(0.16, 0.16, 0.45, body, -0.28, 0.32, -0.25);
    return g;
  }

  setBodyLayer(layer) { this.bodyLayer = layer; this.mesh.traverse(o => o.layers.set(layer)); }

  spawn(at, yaw) {
    this.pos.set(at.x, at.y + this.halfHeight + 0.02, at.z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.hp = this.maxHp;
    this.alive = true;
    this.mesh.visible = true;
    this.healCd = 0; this.portalCd = 0;
    this.slot = 0; this.switchT = 0;
    this.updateGun();
    this.lastAttacker = null;
    for (const w of this.weapons) w.refill();
  }

  eyePos(out = new THREE.Vector3()) { return out.copy(this.pos).setY(this.pos.y + this.eyeOffset); }

  lookDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
  setLookDir(d) {
    d = d.clone().normalize();
    this.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.5, 1.5);
    if (Math.abs(d.y) < 0.999) this.yaw = Math.atan2(-d.x, -d.z);
  }

  // ---------- Physics ----------

  overlaps(b) {
    const p = this.pos, r = this.radius, h = this.halfHeight;
    return p.x - r < b.max.x - EPS && p.x + r > b.min.x + EPS &&
           p.y - h < b.max.y - EPS && p.y + h > b.min.y + EPS &&
           p.z - r < b.max.z - EPS && p.z + r > b.min.z + EPS;
  }

  // wish: horizontal direction (length 0..1)
  move(dt, wish, jump, sprint, world, ignored) {
    this.teleportCooldown = Math.max(0, this.teleportCooldown - dt);
    const speed = sprint ? SPRINT : WALK;
    if (this.grounded) {
      const k = Math.min(1, 14 * dt);
      this.vel.x += (wish.x * speed - this.vel.x) * k;
      this.vel.z += (wish.z * speed - this.vel.z) * k;
      if (jump) { this.vel.y = JUMP_SPEED; this.grounded = false; }
    } else if (wish.lengthSq() > 0) {
      // Air control that never cancels momentum (portal flings stay fun).
      const cur = this.vel.x * wish.x + this.vel.z * wish.z;
      const add = speed - cur;
      if (add > 0) {
        const a = Math.min(add, 25 * dt);
        this.vel.x += wish.x * a; this.vel.z += wish.z * a;
      }
    }
    this.vel.y = Math.max(this.vel.y - GRAVITY * dt, -55);

    const solid = world.boxes.filter(b => !ignored.has(b));
    this.unstick(solid);

    const dist = this.vel.length() * dt;
    const steps = Math.max(1, Math.ceil(dist / 0.25));
    const sdt = dt / steps;
    const wasGrounded = this.grounded;
    this.grounded = false;
    for (let i = 0; i < steps; i++) {
      this.moveAxis(0, this.vel.x * sdt, solid, wasGrounded);
      this.moveAxis(2, this.vel.z * sdt, solid, wasGrounded);
      this.moveAxis(1, this.vel.y * sdt, solid, wasGrounded);
    }
    this.animate(dt);
  }

  moveAxis(axis, amount, solid, canStep) {
    if (amount === 0) return;
    const p = this.pos;
    p.setComponent(axis, p.getComponent(axis) + amount);
    for (const b of solid) {
      if (!this.overlaps(b)) continue;
      if (axis === 1) {
        if (amount < 0) { p.y = b.max.y + this.halfHeight; this.grounded = true; }
        else p.y = b.min.y - this.halfHeight;
        this.vel.y = 0;
      } else {
        const feet = p.y - this.halfHeight;
        const rise = b.max.y - feet;
        if (canStep && rise > 0 && rise <= STEP_HEIGHT && this.freeAt(p.x, b.max.y + this.halfHeight + EPS, p.z, solid)) {
          p.y = b.max.y + this.halfHeight + EPS;
          continue;
        }
        const r = this.radius;
        p.setComponent(axis, amount > 0 ? b.min.getComponent(axis) - r - EPS : b.max.getComponent(axis) + r + EPS);
        this.vel.setComponent(axis, 0);
      }
    }
  }

  freeAt(x, y, z, solid) {
    const old = this.pos.clone();
    this.pos.set(x, y, z);
    const free = !solid.some(b => this.overlaps(b));
    this.pos.copy(old);
    return free;
  }

  // If we ended up inside a box (e.g. a portal closed while we were half through), push out.
  unstick(solid) {
    for (const b of solid) {
      if (!this.overlaps(b)) continue;
      const p = this.pos, r = this.radius, h = this.halfHeight;
      const opts = [
        [0, b.max.x + r - p.x], [0, b.min.x - r - p.x],
        [1, b.max.y + h - p.y], [1, b.min.y - h - p.y],
        [2, b.max.z + r - p.z], [2, b.min.z - r - p.z],
      ];
      opts.sort((a, c) => Math.abs(a[1]) - Math.abs(c[1]));
      const [axis, delta] = opts[0];
      p.setComponent(axis, p.getComponent(axis) + delta + Math.sign(delta) * EPS);
      if (axis === 1 && delta > 0) { this.vel.y = Math.max(0, this.vel.y); }
    }
  }

  animate(dt) {
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.walkT += dt * hs * 1.6;
    const swing = this.grounded ? Math.sin(this.walkT) * Math.min(1, hs / 6) * 0.7 : 0.3;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0, this.yaw, 0);
  }

  // ---------- Combat ----------

  rayHit(o, d) {
    const p = this.pos;
    const headMin = new THREE.Vector3(p.x - 0.23, p.y + 0.5, p.z - 0.23), headMax = new THREE.Vector3(p.x + 0.23, p.y + 0.95, p.z + 0.23);
    const bodyMin = new THREE.Vector3(p.x - 0.36, p.y - 0.9, p.z - 0.36), bodyMax = new THREE.Vector3(p.x + 0.36, p.y + 0.5, p.z + 0.36);
    const h = rayBox(o, d, headMin, headMax);
    const b = rayBox(o, d, bodyMin, bodyMax);
    let best = null;
    if (h) best = { t: h.t, head: true };
    if (b && (!best || b.t < best.t)) best = { t: b.t, head: false };
    if (best) best.point = o.clone().addScaledVector(d, best.t);
    return best;
  }

  // Returns true if this killed the character.
  damage(amount, attacker) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.lastAttacker = attacker;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.mesh.visible = false;
      return true;
    }
    return false;
  }

  tryHeal() {
    if (this.healCd > 0 || this.hp >= this.maxHp || !this.alive) return false;
    this.hp = Math.min(this.maxHp, this.hp + this.stats.heal);
    this.healCd = HEAL_COOLDOWN;
    return true;
  }

  switchTo(slot) {
    if (slot === this.slot || slot < 0 || slot >= this.weapons.length) return false;
    this.slot = slot;
    this.switchT = 0.3;
    this.updateGun();
    return true;
  }

  tick(dt) {
    this.healCd = Math.max(0, this.healCd - dt);
    this.portalCd = Math.max(0, this.portalCd - dt);
    this.switchT = Math.max(0, this.switchT - dt);
    for (const w of this.weapons) w.update(dt);
  }
}
