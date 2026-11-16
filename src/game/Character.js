import * as THREE from 'three';
import { rayBox } from './World.js';
import { WEAPONS, WeaponState, HEAL_COOLDOWN } from './Weapons.js';
import { gunModel } from './Models.js';
import { buildCharacterMesh } from './Look.js';

// Movement tuning: fast and snappy.
const GRAVITY = 27;
const JUMP_SPEED = 9.0;
const RUN = 8.8;              // always running
const CROUCH = 4.2;
const AIR_ACCEL = 45;         // air strafing
const BHOP_WINDOW = 0.09;     // jump within this time after landing and you keep your speed
const SLIDE_BOOST = 4.5, SLIDE_MAX = 16, SLIDE_TIME = 0.8, SLIDE_FRICTION = 1.1;
const DASH_SPEED = 17;
export const DASH_COOLDOWN = 2.2;
export const SWITCH_TIME = 0.18;
const FULL_HALF = 0.9, CROUCH_HALF = 0.6;
const STEP_HEIGHT = 0.55;
const EPS = 0.001;

export class Character {
  constructor({ name, team, color, portalColor, isBot, stats, loadout, look }) {
    this.look = { ...look, name };
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
    this.airT = 0;
    this.landImpact = 0;
    this.jumped = false;
    this.groundT = 1; this.crouched = false; this.slideT = 0; this.slideCd = 0;
    this.dashT = 0; this.dashCd = 0; this.dashed = false; this.slid = false;

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
    const parts = buildCharacterMesh(this.look, { visor: this.portalColor, teamColor: this.color, tag: this.isBot });
    this.legL = parts.legL;
    this.legR = parts.legR;
    this.gunHolder = parts.gunHolder;
    return parts.group;
  }

  setBodyLayer(layer) { this.bodyLayer = layer; this.mesh.traverse(o => o.layers.set(layer)); }

  spawn(at, yaw) {
    this.crouched = false; this.halfHeight = FULL_HALF; this.eyeOffset = 0.7;
    this.slideT = 0; this.slideCd = 0; this.dashT = 0; this.dashCd = 0; this.groundT = 1;
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
  // act: { crouch: held, dash: pressed this frame }
  move(dt, wish, jump, act, world, ignored) {
    this.teleportCooldown = Math.max(0, this.teleportCooldown - dt);
    this.jumped = false;
    this.dashed = false;
    this.slid = false;
    const solid = world.boxes.filter(b => !ignored.has(b));
    this._solid = solid;
    const hs = Math.hypot(this.vel.x, this.vel.z);

    // ----- Crouch / slide -----
    if (act.crouch && !this.crouched) {
      this.setCrouch(true);
      // Crouching while running fast starts a slide with a speed boost.
      if (this.grounded && hs > RUN * 0.7 && this.slideCd <= 0) {
        const boost = Math.min(SLIDE_MAX, Math.max(hs, RUN) + SLIDE_BOOST);
        this.vel.x *= boost / hs; this.vel.z *= boost / hs;
        this.slideT = SLIDE_TIME;
        this.slideCd = 0.7;
        this.slid = true;
      }
    }
    if (!act.crouch && this.crouched && this.slideT <= 0) this.setCrouch(false);

    // ----- Dash -----
    if (act.dash && this.dashCd <= 0) {
      const d = wish.lengthSq() > 0.01 ? wish.clone().setY(0).normalize()
        : new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const keep = Math.max(0, this.vel.x * d.x + this.vel.z * d.z);
      const sp = Math.max(DASH_SPEED, keep + 4);
      this.vel.x = d.x * sp; this.vel.z = d.z * sp;
      if (!this.grounded) this.vel.y = Math.max(this.vel.y, 2.5);
      this.dashT = 0.16;
      this.dashCd = DASH_COOLDOWN;
      this.dashed = true;
    }

    // ----- Horizontal movement -----
    const speed = this.crouched && this.slideT <= 0 ? CROUCH : RUN;
    if (this.grounded && this.slideT > 0) {
      // Sliding: very little friction, a bit of steering.
      this.slideT -= dt;
      const f = Math.max(0, 1 - SLIDE_FRICTION * dt);
      this.vel.x *= f; this.vel.z *= f;
      this.vel.x += wish.x * 6 * dt; this.vel.z += wish.z * 6 * dt;
      if (Math.hypot(this.vel.x, this.vel.z) < CROUCH) this.slideT = 0;
    } else if (this.grounded && this.groundT > BHOP_WINDOW && this.dashT <= 0) {
      // Normal running: snappy acceleration and stopping.
      const k = Math.min(1, 16 * dt);
      this.vel.x += (wish.x * speed - this.vel.x) * k;
      this.vel.z += (wish.z * speed - this.vel.z) * k;
    } else if (wish.lengthSq() > 0) {
      // In the air (or just landed, so bunny hops keep speed): air strafing that never kills momentum.
      const cur = this.vel.x * wish.x + this.vel.z * wish.z;
      const add = speed - cur;
      if (add > 0) {
        const a = Math.min(add, AIR_ACCEL * dt);
        this.vel.x += wish.x * a; this.vel.z += wish.z * a;
      }
    }
    if (this.dashT > 0) this.dashT -= dt;

    // ----- Jump (with coyote time); jumping out of a slide keeps its speed -----
    if (jump && (this.grounded || this.airT < 0.12) && this.vel.y <= 1) {
      this.vel.y = JUMP_SPEED; this.grounded = false; this.airT = 1; this.jumped = true;
      if (this.slideT > 0) { this.slideT = 0; this.setCrouch(false); }
    }
    const g = this.dashT > 0 ? GRAVITY * 0.3 : GRAVITY;
    this.vel.y = Math.max(this.vel.y - g * dt, -55);
    const vyBefore = this.vel.y;

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
    if (this.grounded) {
      if (!wasGrounded) { this.landImpact = -vyBefore; this.groundT = 0; }
      this.groundT += dt;
      this.airT = 0;
    } else { this.airT += dt; this.groundT = 0; }
    this.animate(dt);
  }

  // Crouching shrinks the body (feet stay put). Standing up needs room above.
  setCrouch(on) {
    if (on === this.crouched) return true;
    const d = FULL_HALF - CROUCH_HALF;
    if (on) {
      this.pos.y -= d;
      this.halfHeight = CROUCH_HALF;
      this.eyeOffset = 0.35;
    } else {
      if (this._solid && !this.freeAtSize(this.pos.x, this.pos.y + d, this.pos.z, FULL_HALF, this._solid)) return false;
      this.pos.y += d;
      this.halfHeight = FULL_HALF;
      this.eyeOffset = 0.7;
      this.slideT = 0;
    }
    this.crouched = on;
    return true;
  }

  freeAtSize(x, y, z, half, solid) {
    const oldP = this.pos.clone(), oldH = this.halfHeight;
    this.pos.set(x, y, z); this.halfHeight = half;
    const free = !solid.some(b => this.overlaps(b));
    this.pos.copy(oldP); this.halfHeight = oldH;
    return free;
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
    this.mesh.scale.y = this.halfHeight / FULL_HALF;
    this.mesh.rotation.set(this.slideT > 0 ? 0.35 : 0, this.yaw, 0, 'YXZ');
  }

  // ---------- Combat ----------

  rayHit(o, d) {
    const p = this.pos, hh = this.halfHeight, neck = p.y + hh - 0.4;
    const headMin = new THREE.Vector3(p.x - 0.23, neck, p.z - 0.23), headMax = new THREE.Vector3(p.x + 0.23, p.y + hh + 0.05, p.z + 0.23);
    const bodyMin = new THREE.Vector3(p.x - 0.36, p.y - hh, p.z - 0.36), bodyMax = new THREE.Vector3(p.x + 0.36, neck, p.z + 0.36);
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
    this.hurtAt = performance.now();
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
    this.switchT = SWITCH_TIME;
    this.updateGun();
    return true;
  }

  tick(dt) {
    this.healCd = Math.max(0, this.healCd - dt);
    this.portalCd = Math.max(0, this.portalCd - dt);
    this.switchT = Math.max(0, this.switchT - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.slideCd = Math.max(0, this.slideCd - dt);
    for (const w of this.weapons) w.update(dt);
  }
}
