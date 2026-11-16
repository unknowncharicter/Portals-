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
    this.lastKnown = null; this.searchGoal = null; this.searchT = 0;
  }

  // Heard a gunshot or got hit: remember roughly where it came from.
  hear(pos, accurate = false) {
    const p = pos.clone();
    if (!accurate) p.add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
    this.lastKnown = p;
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
      const look = c.lookDir();
      const now = performance.now();
      for (const e of enemies) {
        if (e.pos.distanceTo(c.pos) > 70) continue;
        const dir = this.findShot(e);
        if (!dir) continue;
        // Bots only notice you in front of them (about 120° view), unless they are already
        // fighting you or you just shot them.
        const tracking = this.target === e && this.seenT > 0;
        const justHit = c.lastAttacker === e && now - (c.hurtAt || 0) < 2500;
        if (!tracking && !justHit && dir.dot(look) < 0.5) continue;
        found = { e, dir }; break;
      }
      if (found) {
        if (this.target !== found.e) this.seenT = 0;
        this.target = found.e;
        this.aimDir = found.dir;
        this.lastKnown = found.e.pos.clone();
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
    // Aim wobbles and only partly settles (easy bots never aim well).
    const floor = 0.6 - this.skill * 0.45;
    const settle = Math.max(floor, 1 - this.seenT * this.skill * 0.5);
    this.aimNoise.x += (Math.random() - 0.5) * dt * 3; this.aimNoise.y += (Math.random() - 0.5) * dt * 3;
    this.aimNoise.clampLength(0, 1);
    const dir = this.aimDir.clone();
    dir.x += this.aimNoise.x * 0.1 * settle; dir.y += this.aimNoise.y * 0.07 * settle; dir.z += this.aimNoise.x * 0.05 * settle;
    dir.normalize();
    const err = this.turnToward(dir, dt, 2 + this.skill * 4);

    // Fire in short bursts with pauses, after a human-like reaction delay.
    const reaction = 1.1 - this.skill * 0.75;
    this.burstT -= dt;
    if (this.seenT > reaction && err < 0.06) {
      if (this.burstT > 0) m.fire(c, 0.02 + (1 - this.skill) * 0.03);
      if (this.burstT < -(0.6 + Math.random() * 0.5)) this.burstT = 0.4 + Math.random() * 0.5;
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
    // Bots don't know where you are: go to where they last saw/heard you,
    // otherwise search the area you are probably in (a rough guess, refreshed now and then).
    let goal;
    if (this.lastKnown && this.lastKnown.distanceTo(c.pos) > 2) goal = this.lastKnown;
    else {
      this.lastKnown = null;
      this.searchT -= dt;
      if (!this.searchGoal || this.searchT <= 0 || this.searchGoal.distanceTo(c.pos) < 2) {
        const r = 14;
        this.searchGoal = this.target.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * r * 2, 0, (Math.random() - 0.5) * r * 2));
        this.searchT = 5 + Math.random() * 3;
      }
      goal = this.searchGoal;
    }

    // Portal flank: put an exit near the enemy, then an entrance on the floor ahead and walk in.
    if (this.flank) {
      this.flank.t += dt;
      if (this.flank.t > 9 || m.portals.ownerCount(c) === 0) this.flank = null;
    }
    if (!this.flank && this.hiddenT > 2.5 && c.portalCd <= 0 && Math.random() < dt * 0.6) this.planFlank();
    if (this.flank) {
      if (this.flank.stage === 1 && c.portalCd <= 0) this.placeEntrance();
      if (this.flank && this.flank.stage === 2) goal = this.flank.entry;
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
    if (!this.lastKnown) return; // only flank someone we know about
    const away = this.lastKnown.clone().sub(c.pos).setY(0).normalize();
    for (let i = 0; i < 8; i++) {
      const ang = (Math.random() - 0.5) * Math.PI * 1.2;
      const dir = away.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
      const origin = this.lastKnown.clone().setY(t.pos.y);
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

  wantsPortalDrop(p) {
    return !!(this.flank && this.flank.stage === 2 && this.flank.entry && this.flank.entry.distanceTo(p) < 2.5);
  }

  // Steer around obstacles and edges in front of us.
  avoid() {
    const c = this.c, w = this.m.world;
    if (this.wish.lengthSq() === 0) return;
    const origin = c.pos.clone().setY(c.pos.y - 0.3);
    const ignored = this.m.portals.ignoredBoxes(c);
    const down = new THREE.Vector3(0, -1, 0);
    let ledge = false;
    const blocked = (d) => {
      const h = w.raycast(origin, d, 1.3);
      if (h && !ignored.has(h.box) && h.box.max.y - (c.pos.y - c.halfHeight) > 0.55) return true;
      // Don't walk off edges (unless it's into a portal on purpose).
      if (!c.grounded) return false;
      const ahead = c.pos.clone().addScaledVector(d, 1.4);
      const g = w.raycast(ahead, down, 4);
      if (!g && !this.wantsPortalDrop(ahead)) { ledge = true; return true; }
      return false;
    };
    if (!blocked(this.wish)) return;
    for (const a of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const d = _v.copy(this.wish).applyAxisAngle(new THREE.Vector3(0, 1, 0), a * this.strafeSign);
      if (!blocked(d)) { this.wish.copy(d); return; }
    }
    if (ledge) this.wish.set(0, 0, 0); // stand still instead of jumping off
    else this.jump = true;
  }
}
