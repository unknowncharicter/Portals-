import * as THREE from 'three';

const _v = new THREE.Vector3();

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Simple bot: chases, strafes, aims with a reaction delay, heals, and uses portals to flank.
export class BotBrain {
  constructor(char, match, skill = 0.6) {
    this.c = char;
    this.m = match;
    this.skill = skill;
    this.target = null;
    this.aimDir = null;
    this.seenT = 0;          // how long the target has been visible
    this.hiddenT = 0;        // how long since we last saw anyone
    this.visCheckT = 0;
    this.strafeSign = 1;
    this.strafeT = 0;
    this.burstT = 0;
    this.flank = null;       // portal flank plan
    this.stuckT = 0;
    this.lastPos = new THREE.Vector3();
    this.wish = new THREE.Vector3();
    this.jump = false;
    this.aimNoise = new THREE.Vector2();
  }

  reset() {
    this.target = null; this.aimDir = null; this.seenT = 0; this.hiddenT = 0; this.flank = null;
  }

  // Can we hit `t` — directly or through any linked portal? Returns aim direction or null.
  findShot(t) {
    const eye = this.c.eyePos();
    const chest = t.pos.clone().setY(t.pos.y + 0.25);
    const candidates = [chest];
    for (const p of this.m.portals.portals) {
      if (!p.partner) continue;
      // Where the target appears if seen through portal p (it is really in front of p.partner).
      const m = p.partner.transformTo(p, new THREE.Matrix4());
      if (p.partner.local(chest).z <= 0) continue;
      candidates.push(chest.clone().applyMatrix4(m));
    }
    for (const point of candidates) {
      const dir = point.clone().sub(eye).normalize();
      const tr = this.m.portals.trace(eye, dir, 200, { characters: [t] });
      if (tr.hit && tr.hit.type === 'character' && tr.hit.character === t) return dir;
    }
    return null;
  }

  update(dt) {
    const c = this.c, m = this.m;
    this.wish.set(0, 0, 0);
    this.jump = false;
    if (!c.alive) return;

    const enemies = m.enemiesOf(c).filter(e => e.alive);
    if (!enemies.length) return;

    // Pick nearest enemy, prefer one we can shoot.
    this.visCheckT -= dt;
    if (this.visCheckT <= 0) {
      this.visCheckT = 0.12;
      enemies.sort((a, b) => a.pos.distanceToSquared(c.pos) - b.pos.distanceToSquared(c.pos));
      let found = null;
      for (const e of enemies) {
        const dir = this.findShot(e);
        if (dir) { found = { e, dir }; break; }
      }
      if (found) {
        if (this.target !== found.e) this.seenT = 0;
        this.target = found.e;
        this.aimDir = found.dir;
      } else {
        this.aimDir = null;
        this.target = enemies[0];
      }
    }
    if (!this.target || !this.target.alive) { this.target = enemies[0]; this.aimDir = null; }

    if (this.aimDir) { this.seenT += dt; this.hiddenT = 0; } else { this.seenT = 0; this.hiddenT += dt; }

    // Heal when low.
    if (c.hp < c.maxHp * 0.45) m.heal(c);
    // Reload when empty or idle.
    if (c.weapon.ammo === 0 || (!this.aimDir && c.weapon.ammo < c.weapon.mag * 0.5)) m.reload(c);

    if (this.aimDir) this.combat(dt); else this.hunt(dt);

    // Unstick: if we barely moved while wanting to, jump.
    this.stuckT = c.pos.distanceTo(this.lastPos) < 0.02 && this.wish.lengthSq() > 0 ? this.stuckT + dt : 0;
    this.lastPos.copy(c.pos);
    if (this.stuckT > 0.4) { this.jump = true; this.strafeSign *= -1; this.stuckT = 0; }
  }

  turnToward(dir, dt, speed) {
    const c = this.c;
    const yaw = Math.atan2(-dir.x, -dir.z);
    const pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    const dy = angleDiff(c.yaw, yaw), dp = pitch - c.pitch;
    const step = speed * dt;
    c.yaw += THREE.MathUtils.clamp(dy, -step, step);
    c.pitch += THREE.MathUtils.clamp(dp, -step, step);
    return Math.hypot(dy, dp);
  }

  combat(dt) {
    const c = this.c, m = this.m;
    // Aim with a little wobble that settles the longer we track the target.
    const settle = Math.max(0.15, 1 - this.seenT * this.skill);
    this.aimNoise.x += (Math.random() - 0.5) * dt * 2; this.aimNoise.y += (Math.random() - 0.5) * dt * 2;
    this.aimNoise.clampLength(0, 1);
    const dir = this.aimDir.clone();
    dir.x += this.aimNoise.x * 0.06 * settle; dir.y += this.aimNoise.y * 0.04 * settle;
    dir.normalize();
    const err = this.turnToward(dir, dt, 4 + this.skill * 6);

    // Fire in bursts after a reaction delay.
    const reaction = 0.55 - this.skill * 0.3;
    this.burstT -= dt;
    if (this.seenT > reaction && err < 0.08) {
      if (this.burstT > -0.5) m.fire(c, Math.random() < 0.3 ? 0.03 : 0.012);
      if (this.burstT < -0.9) this.burstT = 0.6 + Math.random() * 0.5;
    }

    // Strafe and keep a good distance.
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeSign = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0.6 + Math.random() * 1.4; }
    const to = this.target.pos.clone().sub(c.pos).setY(0);
    const dist = to.length();
    to.normalize();
    const side = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(this.strafeSign);
    const approach = dist > 18 ? 0.7 : dist < 8 ? -0.6 : 0;
    this.wish.copy(side).addScaledVector(to, approach).normalize();
    this.avoid();
    if (Math.random() < dt * 0.4) this.jump = true;
  }

  hunt(dt) {
    const c = this.c, m = this.m;
    let goal = this.target.pos;

    // Portal flank: put an exit near the enemy, then an entrance on the floor ahead and walk in.
    if (this.flank) {
      this.flank.t += dt;
      if (this.flank.t > 9 || m.portals.ownerCount(c) === 0) this.flank = null;
    }
    if (!this.flank && this.hiddenT > 2.5 && c.portalCd <= 0 && Math.random() < dt * 0.6) this.planFlank();
    if (this.flank) {
      if (this.flank.stage === 1 && c.portalCd <= 0) this.placeEntrance();
      if (this.flank.stage === 2) goal = this.flank.entry;
    }

    const to = goal.clone().sub(c.pos).setY(0);
    if (to.lengthSq() > 0.01) this.wish.copy(to.normalize());
    this.avoid();
    // Look where we are going (slightly toward the target height).
    const look = this.wish.lengthSq() > 0 ? this.wish.clone() : to;
    look.y = 0;
    if (look.lengthSq() > 0) this.turnToward(look.normalize(), dt, 5);
  }

  planFlank() {
    const c = this.c, m = this.m, t = this.target;
    // Exit portal: on a wall near the target, ideally behind it (away from us).
    const away = t.pos.clone().sub(c.pos).setY(0).normalize();
    for (let i = 0; i < 8; i++) {
      const ang = (Math.random() - 0.5) * Math.PI * 1.2;
      const dir = away.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
      const origin = t.pos.clone();
      const hit = m.world.raycast(origin, dir, 14);
      if (!hit || Math.abs(hit.normal.y) > 0.5) continue;
      hit.point.y = Math.max(hit.point.y, 1.2);
      const pose = m.portals.poseFromHit(hit, dir);
      if (!pose || !pose.valid) continue;
      m.placePortal(c, pose);
      this.flank = { stage: 1, t: 0 };
      return;
    }
  }

  placeEntrance() {
    const c = this.c, m = this.m;
    const fwd = this.target.pos.clone().sub(c.pos).setY(0).normalize();
    for (const dist of [3, 2.5, 4, 2]) {
      for (const ang of [0, 0.5, -0.5, 1, -1]) {
        const d = fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
        const above = c.pos.clone().addScaledVector(d, dist).setY(c.pos.y + 0.5);
        // Make sure the path there is clear.
        if (m.world.raycast(c.pos, d, dist)) continue;
        const hit = m.world.raycast(above, new THREE.Vector3(0, -1, 0), 4);
        if (!hit || hit.normal.y < 0.5) continue;
        const pose = m.portals.poseFromHit(hit, d);
        if (!pose || !pose.valid) continue;
        m.placePortal(c, pose);
        this.flank.stage = 2;
        this.flank.entry = pose.pos.clone();
        return;
      }
    }
    this.flank = null;
  }

  // Steer around obstacles in front of us.
  avoid() {
    const c = this.c, w = this.m.world;
    if (this.wish.lengthSq() === 0) return;
    const origin = c.pos.clone().setY(c.pos.y - 0.3);
    const ignored = this.m.portals.ignoredBoxes(c);
    const blocked = (d) => {
      const h = w.raycast(origin, d, 1.3);
      return h && !ignored.has(h.box) && h.box.max.y - (c.pos.y - c.halfHeight) > 0.55;
    };
    if (!blocked(this.wish)) return;
    for (const a of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const d = _v.copy(this.wish).applyAxisAngle(new THREE.Vector3(0, 1, 0), a * this.strafeSign);
      if (!blocked(d)) { this.wish.copy(d); return; }
    }
    this.jump = true;
  }
}
