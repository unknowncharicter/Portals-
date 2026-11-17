import * as THREE from 'three';
import { rayBox } from './World.js';
import { WEAPONS, WeaponState, HEAL_COOLDOWN } from './Weapons.js';
import { gunModel, applySkin } from './Models.js';
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
  constructor({ name, team, color, portalColor, isBot, stats, loadout, look, skin = null }) {
    this.skin = skin;
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
    this.grenades = 2; this.grenadeCd = 0;
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
      applySkin(m, this.skin, this.portalColor);
      m.traverse(o => o.layers.set(this.bodyLayer));
      this.gunHolder.add(m);
    }
  }

  get weapon() { return this.weapons[this.slot]; }

  buildMesh() {
    const parts = buildCharacterMesh(this.look, { visor: this.portalColor, teamColor: this.color, tag: this.isBot });
    this.legL = parts.legL;
    this.legR = parts.legR;
    this.body = parts.body || null;
    this.tagSprite = parts.tag || null;
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
    this.life = (this.life || 0) + 1; // counts spawns (online: tells old updates from new ones)
    this.emote = null;
    this.mesh.visible = true;
    if (this.body) this.body.reset();
    if (this.tagSprite) this.tagSprite.visible = true;
    this.healCd = 0; this.portalCd = 0; this.grenades = 2; this.grenadeCd = 0;
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
    const solid = world.near(this.pos, 3 + Math.hypot(this.vel.x, this.vel.z) * dt).filter(b => !ignored.has(b));
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
          this.climbT = 0.3; // stepped up: play the stairs animation for a moment
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
    if (!this.alive && this.body) {
      // Dead: let the fall play out, then hide the body.
      this.corpseT -= dt;
      this.body.updateDead(dt);
      this.mesh.updateMatrixWorld(true);
      this.body.handIn(this.mesh, this.gunHolder.position); // the gun falls with the hand
      this.gunHolder.rotation.x += (0.6 - this.gunHolder.rotation.x) * Math.min(1, dt * 3);
      if (this.corpseT <= 0) this.mesh.visible = false;
      return;
    }
    this.mesh.position.copy(this.pos);
    if (this.emote) {
      // Victory emote: hop (and spin for kind 1) while the body cheers.
      const e = this.emote;
      e.t += dt;
      const ph = (e.t * 1.25) % 1; // spin hop: up and one full turn in the first half of each beat
      const hop = e.kind === 1 ? (ph < 0.5 ? Math.sin(ph * 2 * Math.PI) * 0.55 : 0) : Math.abs(Math.sin(e.t * 4.5)) * 0.12;
      const spin = e.kind === 1 && ph < 0.5 ? ph * 4 * Math.PI : 0;
      this.mesh.position.y = this.pos.y - this.halfHeight + FULL_HALF + hop;
      this.mesh.rotation.set(0, this.yaw + spin, 0, 'YXZ');
      if (this.body) {
        this.body.emote(dt, e.t, e.kind);
        this.body.handIn(this.mesh, this.gunHolder.position);
        this.gunHolder.rotation.set(e.kind === 1 ? -1.1 : 0, 0, 0);
      }
      return;
    }
    if (this.body) {
      // Animated body: the crouch clip already lowers it, so no squash. Feet stay on the ground.
      this.mesh.position.y = this.pos.y - this.halfHeight + FULL_HALF;
      this.mesh.rotation.set(this.slideT > 0 ? 0.25 : 0, this.yaw, 0, 'YXZ');
      if (this.mesh.visible) {
        this.body.update(dt, { vel: this.vel, yaw: this.yaw, pitch: this.pitch, grounded: this.grounded, crouched: this.crouched, sliding: this.slideT > 0, climbing: this.climbT > 0, aiming: this.aiming, airT: this.airT });
        this.body.handIn(this.mesh, this.gunHolder.position);
        this.gunHolder.rotation.set(this.body.bend, 0, 0); // gun follows the (limited) body bend
      }
      return;
    }
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.walkT += dt * hs * 1.6;
    const swing = this.grounded ? Math.sin(this.walkT) * Math.min(1, hs / 6) * 0.7 : 0.3;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.mesh.scale.y = this.halfHeight / FULL_HALF;
    this.mesh.rotation.set(this.slideT > 0 ? 0.35 : 0, this.yaw, 0, 'YXZ');
  }

  // ---------- Combat ----------

  // Hit test against the body only. The boxes turn with the character and fit the body
  // tightly, so hats, masks, backpacks, capes and wings are NOT part of them: bullets pass
  // straight through accessories (and hit whatever is behind).
  rayHit(o, d) {
    const p = this.pos, hh = this.halfHeight;
    const c = Math.cos(-this.yaw), s = Math.sin(-this.yaw);
    const rot = (v) => new THREE.Vector3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
    const lo = rot(new THREE.Vector3(o.x - p.x, o.y - p.y, o.z - p.z));
    const ld = rot(d);
    const neck = hh - 0.34;
    const h = rayBox(lo, ld, new THREE.Vector3(-0.16, neck, -0.16), new THREE.Vector3(0.16, hh, 0.16));
    const b = rayBox(lo, ld, new THREE.Vector3(-0.3, -hh, -0.32), new THREE.Vector3(0.3, neck, 0.18));
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
      if (this.body && this.body.actions.die1) {
        // Play a fall that matches where the hit came from, leave the body down for a moment.
        let fromBack = false, fromRight = false;
        if (attacker && attacker !== this) {
          const dx = attacker.pos.x - this.pos.x, dz = attacker.pos.z - this.pos.z;
          const f = -Math.sin(this.yaw) * dx - Math.cos(this.yaw) * dz, r = Math.cos(this.yaw) * dx - Math.sin(this.yaw) * dz;
          fromBack = f < -Math.abs(r) * 0.6; fromRight = !fromBack && r > Math.abs(f);
        }
        this.body.die({ fromBack, fromRight, crouched: this.crouched, head: this.lastHitHead });
        this.corpseT = 3;
        if (this.tagSprite) this.tagSprite.visible = false;
      } else this.mesh.visible = false;
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
    this.climbT = Math.max(0, (this.climbT || 0) - dt);
    this.grenadeCd = Math.max(0, this.grenadeCd - dt);
    this.slideCd = Math.max(0, this.slideCd - dt);
    for (const w of this.weapons) w.update(dt);
  }
}
