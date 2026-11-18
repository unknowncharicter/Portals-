import * as THREE from 'three';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3(), _o = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);

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
    this.target = null; this.aimDir = null; this.seenT = 0; this.hiddenT = 0; this.flank = null; this.peek = null;
    this.lastKnown = null; this.searchGoal = null; this.searchT = 0; this.tauntT = 0;
    this.hillGoal = null; this.escapeT = 0; this.steerT = 0; this.progPos = null;
  }

  // Heard a gunshot or got hit: remember roughly where it came from.
  hear(pos, accurate = false) {
    const p = pos.clone();
    if (!accurate) p.add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
    this.lastKnown = p;
  }

  // Can we hit `t` — directly or through any linked portal? Returns aim direction or null.
  // accept(dir): optional extra check (e.g. "is it in front of us"); lines it rejects are skipped.
  findShot(t, accept = null) {
    const eye = this.c.eyePos();
    const chest = t.pos.clone().setY(t.pos.y + 0.25);
    // In Portal Only, a direct shot does nothing, so only look for shots through portals.
    const candidates = this.m.mode.portalOnly ? [] : [chest];
    for (const p of this.m.portals.portals) {
      if (!p.partner) continue;
      // Where the target appears if seen through portal p (it is really in front of p.partner).
      const m = p.partner.transformTo(p, new THREE.Matrix4());
      if (p.partner.local(chest).z <= 0) continue;
      candidates.push(chest.clone().applyMatrix4(m));
    }
    for (let i = 0; i < candidates.length; i++) {
      const dir = candidates[i].clone().sub(eye).normalize();
      if (accept && !accept(dir)) continue;
      const tr = this.m.portals.trace(eye, dir, 200, { characters: [t] });
      if (tr.hit && tr.hit.type === 'character' && tr.hit.character === t) { this.viaPortal = tr.segments.length > 1; return dir; }
    }
    return null;
  }

  update(dt) {
    const c = this.c, m = this.m;
    this.wish.set(0, 0, 0);
    this.jump = false;
    this.dash = false;
    this.slideHold = Math.max(0, (this.slideHold || 0) - dt);
    this.crouch = this.slideHold > 0;
    if (!c.alive) { this.tauntT = 0; return; }

    // Taunt: dance for a moment after a kill, unless someone shows up or shoots us.
    if (this.tauntT > 0) {
      this.tauntT -= dt;
      const hurt = performance.now() - (c.hurtAt || 0) < 1500;
      if (hurt || this.tauntT <= 0 || (this.aimDir && this.target && this.target.alive)) { this.tauntT = 0; c.stopEmote(); }
      else { if (!c.emote && c.grounded) c.startEmote(); if (c.emote) return; }
    } else if (c.emote && c.emote.live) c.stopEmote();

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
        // Bots only notice you in front of them (about 120° view), unless they are already
        // fighting you or you just shot them. Every line of sight counts (direct or through
        // any portal), so a peek through our portal works even if you're also behind us.
        const tracking = this.target === e && this.seenT > 0;
        const justHit = c.lastAttacker === e && now - (c.hurtAt || 0) < 2500;
        const dir = this.findShot(e, tracking || justHit ? null : (d) => d.dot(look) >= 0.5);
        if (!dir) continue;
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
    c.aiming = !!this.aimDir; // raise the gun in combat

    // Heal when low.
    if (c.hp < c.maxHp * 0.45) m.heal(c);
    // Reload when empty or idle.
    if (c.weapon.ammo === 0 || (!this.aimDir && c.weapon.ammo < c.weapon.mag * 0.5)) m.reload(c);

    this.checkStuck(dt);
    if (this.aimDir) this.combat(dt); else this.hunt(dt);

    // Unstick: if we barely moved while wanting to, jump.
    this.stuckT = c.pos.distanceTo(this.lastPos) < 0.02 && this.wish.lengthSq() > 0 ? this.stuckT + dt : 0;
    this.lastPos.copy(c.pos);
    if (this.stuckT > 0.4) { this.jump = true; this.strafeSign *= -1; this.stuckT = 0; }
    if (this.jump && !this.groundAhead(this.wish.lengthSq() > 0.01 ? this.wish : new THREE.Vector3(c.vel.x, 0, c.vel.z), [1.5, 3.5], false)) this.jump = false;
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
    // Shooting through a portal from cover: stay put (moving would lose the angle).
    if (this.viaPortal) { this.wish.set(0, 0, 0); this.goingThrough = false; return; }
    // Capture the Flag: a carrier keeps running home while shooting; attackers keep pushing.
    if (m.mode.ctf && m.flags) {
      const g = this.ctfGoal();
      const carrying = m.flags.some(f => f.carrier === c);
      const d = Math.hypot(g.x - c.pos.x, g.z - c.pos.z);
      if (carrying || d > 6) this.wish.multiplyScalar(carrying ? 0.25 : 0.6).add(_v.set(g.x - c.pos.x, 0, g.z - c.pos.z).normalize()).normalize();
    }
    // King of the Hill: fight from inside the zone. Outside it, push in while strafing;
    // inside, drift back toward the middle instead of wandering out.
    if (m.mode.koth && m.hill) {
      this.hillT = (this.hillT || 0) - dt;
      if (!this.hillGoal || this.hillT <= 0) this.pickHillGoal();
      const toHill = _v.set(m.hill.x - c.pos.x, 0, m.hill.z - c.pos.z);
      const d = toHill.length();
      if (!m.inHill(c)) this.wish.multiplyScalar(0.35).add(this.hillGoal.clone().sub(c.pos).setY(0).normalize()).normalize();
      else if (d > m.hill.r * 0.55) this.wish.addScaledVector(toHill.normalize(), 0.9).normalize();
    }
    // Badly hurt: escape through a portal (exit far away from the enemy, entrance at our feet).
    if (this.flank && this.flank.retreat) {
      if (this.flank.stage === 1 && c.portalCd <= 0) this.placeEntrance();
      if (this.flank && this.flank.stage === 2) this.wish.copy(this.flank.entry.clone().sub(c.pos).setY(0).normalize());
    } else if (!this.flank && !m.mode.portalOnly && c.hp < c.maxHp * 0.35 && c.portalCd <= 0 && Math.random() < dt * (0.6 + this.skill)) this.planRetreat();
    this.avoid();
    if (Math.random() < dt * 0.5 && this.groundAhead(this.wish, [2, 4, 6.5])) this.jump = true;
    // Better bots dodge with dashes, especially right after getting hit.
    const hitRecently = performance.now() - (c.hurtAt || 0) < 400;
    if (c.dashCd <= 0 && Math.random() < dt * (hitRecently ? 2 : 0.25) * this.skill && this.groundAhead(this.wish, [2.5, 5])) this.dash = true;
  }

  hunt(dt) {
    const c = this.c, m = this.m;
    // Bots don't know where you are: go to where they last saw/heard you,
    // otherwise search the area you are probably in (a rough guess, refreshed now and then).
    let goal;
    if (m.mode.ctf && m.flags) {
      goal = this.ctfGoal();
    } else if (m.mode.koth && m.hill) {
      // King of the Hill: head for the zone.
      this.hillT = (this.hillT || 0) - dt;
      if (!this.hillGoal || this.hillT <= 0) this.pickHillGoal();
      goal = this.hillGoal;
    } else if (this.lastKnown && this.lastKnown.distanceTo(c.pos) > 2) goal = this.lastKnown;
    else {
      this.lastKnown = null;
      this.searchT -= dt;
      // Up on a lookout spot: stay a while and watch (turning slowly).
      if (this.perched && this.searchGoal && this.searchGoal.distanceTo(c.pos) < 2.5) {
        this.campT = (this.campT ?? 6 + Math.random() * 6) - dt;
        if (this.campT > 0) { c.yaw += dt * 0.7; this.wish.set(0, 0, 0); return; }
        this.perched = false; this.campT = undefined; this.searchT = 0;
      }
      if (!this.searchGoal || this.searchT <= 0 || this.searchGoal.distanceTo(c.pos) < 2) {
        const r = 14, perches = m.world.map.perches;
        this.perched = false;
        if (perches && Math.random() < 0.45) {
          // Now and then go up to a lookout spot (a roof reached by a ladder).
          const p = perches[Math.floor(Math.random() * perches.length)];
          this.searchGoal = new THREE.Vector3(p[0], p[1] + 0.9, p[2]);
          this.searchT = 15 + Math.random() * 6;
          this.perched = true; this.campT = undefined;
        } else {
          this.searchGoal = this.target.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * r * 2, 0, (Math.random() - 0.5) * r * 2));
          this.searchT = 5 + Math.random() * 3;
        }
      }
      goal = this.searchGoal;
    }

    // Portal flank: put an exit near the enemy, then an entrance on the floor ahead and walk in.
    if (this.flank) {
      this.flank.t += dt;
      if (this.flank.t > 9 || m.portals.ownerCount(c) === 0) this.flank = null;
    }
    if (m.mode.portalOnly) {
      // Set up a portal shot: exit near the enemy, entrance on a wall we can see.
      if (c.portalCd <= 0 && Math.random() < dt * 1.5) this.planPortalShot();
      const spot = this.portalShotSpot();
      const mine = m.portals.byOwner.get(c) || [];
      this.noSpotT = spot || mine.length < 2 ? 0 : (this.noSpotT || 0) + dt;
      if (this.noSpotT > 3 && c.portalCd <= 0) { this.placeShotEntrance(); this.noSpotT = 0; }
      if (spot) {
        goal = spot;
        // There: face the entrance portal so we can spot the target through it.
        if (Math.hypot(spot.x - c.pos.x, spot.z - c.pos.z) < 0.7) {
          const dir = this.shotEntry.pos.clone().sub(c.eyePos()).normalize();
          this.turnToward(dir, dt, 5);
          this.wish.set(0, 0, 0);
          return;
        }
      }
    } else {
      // Portal tactics: when we know roughly where an enemy is but can't see them, either set up
      // a shot through a portal (peek) or a portal behind them to walk through (flank).
      if (this.peek) {
        this.peek.t += dt;
        const mine = m.portals.byOwner.get(c) || [];
        if (this.peek.t > 14 || !mine.length || !this.target.alive || (this.peek.stage === 2 && mine.length < 2)) this.peek = null;
      }
      if (!this.flank && !this.peek && this.lastKnown && this.hiddenT > 1.2 && c.portalCd <= 0
        && this.lastKnown.distanceTo(c.pos) > 7 && Math.random() < dt * (0.6 + this.skill)) {
        if (Math.random() < 0.35 + this.skill * 0.3) this.planPeek(); else this.planFlank();
      }
      if (this.peek) {
        if (this.peek.stage === 1 && c.portalCd <= 0) this.placePeekEntrance();
        const spot = this.peek && this.peek.stage === 2 ? this.portalShotSpot() : null;
        if (spot) {
          goal = spot;
          if (Math.hypot(spot.x - c.pos.x, spot.z - c.pos.z) < 0.8) {
            // In position: look into our portal and wait for the enemy to show up through it.
            const dir = this.shotEntry.pos.clone().sub(c.eyePos()).normalize();
            this.turnToward(dir, dt, 5);
            this.wish.set(0, 0, 0);
            return;
          }
        } else if (this.peek && this.peek.stage === 2) this.peek = null;
      }
      this.goingThrough = false;
      if (!this.flank && !this.peek) {
        // Our own portals as a shortcut: walk into one if its partner is much closer to the goal.
        const sc = this.portalShortcut(goal);
        if (sc) { goal = sc; this.goingThrough = true; }
      }
    }
    if (this.flank) {
      if (this.flank.stage === 1 && c.portalCd <= 0) this.placeEntrance();
      if (this.flank && this.flank.stage === 2) { goal = this.flank.entry; this.goingThrough = true; }
    }

    // Somewhere high up (a roof)? Go via a ladder.
    const lr = this.ladderRoute(goal);
    if (lr && lr.climb) { this.wish.copy(lr.climb); return; }
    if (lr) goal = lr.point;
    const to = goal.clone().sub(c.pos).setY(0);
    const far = to.length();
    if (to.lengthSq() > 0.01) this.wish.copy(to.normalize());
    this.avoid();
    // Lob a grenade toward where we think the enemy is.
    if (this.lastKnown && c.grenades > 0 && c.grenadeCd <= 0 && Math.random() < dt * 0.12 * (0.5 + this.skill)) {
      const to = this.lastKnown.clone().sub(c.pos); const d = Math.hypot(to.x, to.z);
      if (d > 7 && d < 24) {
        c.yaw = Math.atan2(-to.x, -to.z);
        c.pitch = 0.2 + d * 0.012;
        m.throwGrenade(c);
      }
    }
    // Slide now and then while running somewhere far.
    if (far > 10 && c.grounded && !c.crouched && Math.random() < dt * 0.35 && this.groundAhead(this.wish, [3, 6, 9])) this.slideHold = 0.6;
    // Look where we are going (slightly toward the target height).
    const look = this.wish.lengthSq() > 0 ? this.wish.clone() : to;
    look.y = 0;
    if (look.lengthSq() > 0) this.turnToward(look.normalize(), dt, 5);
  }

  // The best wall near a position for an exit portal: from it you must be able to see that spot,
  // and it's better if it is behind or beside the enemy (where they aren't looking) and not too
  // close or far. Returns a pose or null.
  bestExitNear(spot, look, allowFloor = false) {
    const m = this.m, w = m.world, P = m.portals;
    const chest = spot.clone().setY(spot.y + 0.25);
    let best = null, bestS = -Infinity;
    const off = Math.random() * Math.PI * 2;
    for (let i = 0; i < 16; i++) {
      const a = off + i * Math.PI / 8;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const hit = w.raycast(spot.clone().setY(spot.y + 0.4), dir, 22);
      if (!hit || Math.abs(hit.normal.y) > 0.5 || hit.t < 3.5) continue;
      hit.point.y = Math.max(hit.point.y, 1.3);
      const pose = P.poseFromHit(hit, dir);
      if (!pose || !pose.valid) continue;
      const eye = pose.pos.clone().addScaledVector(pose.normal, 0.6);
      const to = chest.clone().sub(eye), d = to.length();
      if (w.raycast(eye, to.normalize(), d - 0.4)) continue;      // can't see the spot from there
      let score = -Math.abs(d - 8) * 0.2 + Math.random() * 0.3;
      if (look) score -= look.dot(dir) * 1.5;                      // behind them is best
      if (score > bestS) { bestS = score; best = pose; }
    }
    // Flanks can also come up out of the floor, a few metres behind or beside the enemy.
    if (allowFloor) {
      for (let i = 0; i < 8; i++) {
        const a = off + i * Math.PI / 4, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        for (const r of [5, 7]) {
          const top = spot.clone().addScaledVector(dir, r).setY(spot.y + 1.5);
          if (w.raycast(spot.clone().setY(spot.y + 0.4), dir, r)) continue;    // a wall in between
          const hit = w.raycast(top, new THREE.Vector3(0, -1, 0), 4);
          if (!hit || hit.normal.y < 0.7) continue;
          const pose = P.poseFromHit(hit, dir.clone().negate());
          if (!pose || !pose.valid) continue;
          let score = -1 + Math.random() * 0.3;                              // walls are a bit better
          if (look) score -= look.dot(dir) * 1.5;
          if (score > bestS) { bestS = score; best = pose; }
        }
      }
    }
    return best;
  }

  // Flank: exit portal behind the enemy, then an entrance at our feet, then walk through.
  planFlank() {
    const c = this.c, m = this.m, t = this.target;
    if (!this.lastKnown) return;
    const look = t.alive ? t.lookDir().setY(0).normalize() : null;
    const pose = this.bestExitNear(this.lastKnown, look, true);
    if (!pose || !m.placePortal(c, pose)) return;
    this.flank = { stage: 1, t: 0 };
  }

  // Peek: exit portal that sees the enemy, entrance on a wall near us, then shoot through it from
  // a safe spot.
  planPeek() {
    const c = this.c, m = this.m, t = this.target;
    if (!this.lastKnown) return;
    const look = t.alive ? t.lookDir().setY(0).normalize() : null;
    const pose = this.bestExitNear(this.lastKnown, look);
    if (!pose || !m.placePortal(c, pose)) return;
    this.peek = { stage: 1, t: 0 };
  }

  // Entrance for a peek: a wall 3-9 m from us that we can see, facing us.
  placePeekEntrance() {
    const c = this.c, m = this.m, w = m.world, eye = c.eyePos();
    const toT = this.lastKnown ? this.lastKnown.clone().sub(c.pos).setY(0).normalize() : new THREE.Vector3(1, 0, 0);
    const off = Math.random() * Math.PI * 2;
    let best = null, bestS = -Infinity;
    for (let i = 0; i < 12; i++) {
      const a = off + i * Math.PI / 6, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const hit = w.raycast(eye, dir, 10);
      if (!hit || Math.abs(hit.normal.y) > 0.5 || hit.t < 3) continue;
      hit.point.y = Math.max(hit.point.y, 1.3);
      const pose = m.portals.poseFromHit(hit, dir);
      if (!pose || !pose.valid) continue;
      // Prefer walls away from the enemy (so we stay in cover while shooting).
      const score = -dir.dot(toT) + Math.random() * 0.3 - Math.abs(hit.t - 5) * 0.1;
      if (score > bestS) { bestS = score; best = pose; }
    }
    if (best && m.placePortal(c, best)) this.peek.stage = 2;
    else this.peek = null;
  }

  // If one of our linked portals is close and its partner is much closer to where we want to go,
  // walk into it. Returns where to walk, or null.
  portalShortcut(goal) {
    const c = this.c, mine = this.m.portals.byOwner.get(c) || [];
    if (mine.length < 2 || performance.now() - (this.tpAt || 0) < 6000) return null;
    const here = c.pos.distanceTo(goal);
    if (here < 12) return null;
    for (const p of mine) {
      if (!p.partner) continue;
      const dIn = p.pos.distanceTo(c.pos);
      if (dIn > 12 || dIn < 0.5) continue;
      if (p.partner.pos.distanceTo(goal) + dIn + 4 < here) {
        // Walk to just in front of it (floor portals: onto it).
        return p.normal.y > 0.5 ? p.pos.clone() : p.pos.clone().addScaledVector(p.normal, -0.5).setY(c.pos.y);
      }
    }
    return null;
  }

  // Is this point in the opening of one of our linked portals? (walking into it is fine)
  inOwnOpening(pt) {
    if (!this.goingThrough) return false;
    for (const p of this.m.portals.byOwner.get(this.c) || []) {
      if (!p.partner) continue;
      const l = p.local(pt);
      if (Math.abs(l.x) < 0.75 && Math.abs(l.y) < 1.25 && Math.abs(l.z) < 1.0) return true;
    }
    return false;
  }

  // Retreat: put an exit portal on a wall well away from the target (the entrance comes next).
  planRetreat() {
    const c = this.c, m = this.m, t = this.target;
    if (!t) return;
    const away = c.pos.clone().sub(t.pos).setY(0).normalize();
    const eye = c.eyePos();
    for (let i = 0; i < 10; i++) {
      const dir = away.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 2);
      const hit = m.world.raycast(eye, dir, 40);
      if (!hit || hit.t < 9 || Math.abs(hit.normal.y) > 0.5) continue;
      hit.point.y = Math.max(hit.point.y, 1.3);
      const pose = m.portals.poseFromHit(hit, dir);
      if (!pose || !pose.valid) continue;
      m.placePortal(c, pose);
      this.flank = { stage: 1, t: 0, retreat: true };
      return;
    }
  }

  // Where to stand so a shot into our entrance portal comes out of our exit portal at the target.
  portalShotSpot() {
    const m = this.m, mine = m.portals.byOwner.get(this.c) || [];
    if (mine.length < 2) return null;
    const t = this.target, chest = t.pos.clone().setY(t.pos.y + 0.25);
    const exit = mine.reduce((a, b) => (a.pos.distanceTo(t.pos) < b.pos.distanceTo(t.pos) ? a : b));
    const entry = exit.partner;
    if (!entry || exit.local(chest).z <= 0) return null;
    // The target "seen through" the entrance portal:
    const img = chest.clone().applyMatrix4(exit.transformTo(entry, new THREE.Matrix4()));
    const out = entry.pos.clone().sub(img).setY(0);
    if (out.lengthSq() < 0.01) return null;
    out.normalize();
    this.shotEntry = entry;
    // Try a few distances along the line; pick one with floor and a clear view of the portal.
    const down = new THREE.Vector3(0, -1, 0);
    for (const d of [4, 5, 6, 3, 7, 8, 9]) {
      const s = entry.pos.clone().addScaledVector(out, d);
      if (entry.local(s).z < 1) continue;
      const floor = m.world.raycast(new THREE.Vector3(s.x, s.y + 2, s.z), down, 8);
      if (!floor || floor.normal.y < 0.7) continue;
      s.y = floor.point.y + this.c.halfHeight;
      const eye = s.clone().setY(s.y + this.c.eyeOffset);
      const toEntry = entry.pos.clone().sub(eye);
      if (m.world.raycast(eye, toEntry.clone().normalize(), toEntry.length() - 0.1)) continue;
      return s;
    }
    return null;
  }

  planPortalShot() {
    const c = this.c, m = this.m, t = this.target;
    const mine = m.portals.byOwner.get(c) || [];
    const up = new THREE.Vector3(0, 1, 0);
    // Step 1: exit portal on a wall near the target, facing the target.
    const exitOk = mine.length && mine[mine.length - 1].pos.distanceTo(t.pos) < 16 && mine.length === 1;
    if (!mine.length || (mine.length === 2 && !mine.some(p => p.pos.distanceTo(t.pos) < 16))) {
      for (let i = 0; i < 10; i++) {
        const dir = new THREE.Vector3(1, 0, 0).applyAxisAngle(up, Math.random() * Math.PI * 2);
        const hit = m.world.raycast(t.pos, dir, 14);
        if (!hit || Math.abs(hit.normal.y) > 0.5) continue;
        hit.point.y = Math.max(hit.point.y, 1.3);
        const pose = m.portals.poseFromHit(hit, dir);
        if (pose && pose.valid && m.placePortal(c, pose)) return;
      }
      return;
    }
    if (!exitOk) return;
    this.placeShotEntrance();
  }

  // Entrance portal on a wall near us that we can see.
  placeShotEntrance() {
    const c = this.c, m = this.m, up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 10; i++) {
      const dir = new THREE.Vector3(1, 0, 0).applyAxisAngle(up, Math.random() * Math.PI * 2);
      const hit = m.world.raycast(c.eyePos(), dir, 15);
      if (!hit || Math.abs(hit.normal.y) > 0.5 || hit.t < 3) continue;
      hit.point.y = Math.max(hit.point.y, 1.3);
      const pose = m.portals.poseFromHit(hit, dir);
      if (pose && pose.valid && m.placePortal(c, pose)) return;
    }
  }

  placeEntrance() {
    const c = this.c, m = this.m;
    // Flank: entrance toward the target. Retreat: entrance away from it (we're running).
    const fwd = this.target.pos.clone().sub(c.pos).setY(0).normalize();
    if (this.flank && this.flank.retreat) fwd.negate();
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

  // Is there floor along this direction at these distances? (so slides/dashes don't fly off edges)
  groundAhead(dir, dists, clearPath = true) {
    if (dir.lengthSq() < 0.01) return false;
    const d = dir.clone().setY(0).normalize(), down = new THREE.Vector3(0, -1, 0);
    for (const k of dists) {
      const p = this.c.pos.clone().addScaledVector(d, k);
      if (!this.m.world.raycast(p, down, 4)) return false;
    }
    return !clearPath || !this.m.world.raycast(this.c.pos, d, dists[dists.length - 1]);
  }

  wantsPortalDrop(p) {
    if (this.flank && this.flank.stage === 2 && this.flank.entry && this.flank.entry.distanceTo(p) < 2.5) return true;
    for (const q of this.m.portals.byOwner.get(this.c) || []) if (q.partner && q.normal.y > 0.5 && q.pos.distanceTo(p) < 1.6) return true;
    return false;
  }

  // Steer around obstacles and edges in front of us.
  // Capture the Flag: where to go. Each team's first bot attacks, the second defends.
  ctfGoal() {
    const m = this.m, c = this.c, F = m.flags;
    const mine = F[c.team], theirs = F[1 - c.team];
    const at = (v) => new THREE.Vector3(v.x, v.y + 0.9, v.z);
    if (theirs.carrier === c) return at(mine.base);                      // bring it home
    if (mine.carrier) return mine.carrier.pos.clone();                   // chase the thief
    if (mine.dropped) return at(mine.pos);                               // return our flag
    if (this.role === undefined) {
      const mates = m.bots.filter(b => b.c.team === c.team);
      this.role = mates.indexOf(this) === 0 ? 'attack' : 'defend';
    }
    if (this.role === 'attack') return theirs.carrier ? theirs.carrier.pos.clone() : at(theirs.pos);
    // Defend: hang around our base.
    if (!this.guardSpot || (this.guardT = (this.guardT || 0) - 0.016) <= 0) {
      const a = Math.random() * Math.PI * 2;
      this.guardSpot = at(mine.base).add(new THREE.Vector3(Math.cos(a) * 4, 0, Math.sin(a) * 4));
      this.guardT = 4;
    }
    return this.guardSpot;
  }

  // A random reachable spot inside the King of the Hill zone (standing on the floor, not in a box).
  pickHillGoal() {
    const h = this.m.hill, w = this.m.world;
    this.hillT = 3 + Math.random() * 3;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * h.r * 0.6;
      const top = new THREE.Vector3(h.x + Math.cos(a) * r, h.y + 2.5, h.z + Math.sin(a) * r);
      const g = w.raycast(top, new THREE.Vector3(0, -1, 0), 4);
      const p = top.clone().setY(h.y + 0.6);
      if (w.boxes.some(b => b.containsPoint ? b.containsPoint(p) : (p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z))) continue;
      if (g && Math.abs(g.point.y - h.y) < 0.6) { this.hillGoal = g.point.clone().setY(h.y + 1); return; }
    }
    this.hillGoal = new THREE.Vector3(h.x, h.y + 1, h.z);
  }

  // Is walking in direction d blocked by a wall (or, on the ground, a drop)?
  // Checks the body's left and right edges too, so bots don't snag on corners.
  blocked(d, info) {
    const c = this.c, w = this.m.world;
    const ignored = this.m.portals.ignoredBoxes(c);
    const feet = c.pos.y - c.halfHeight;
    const side = _s.set(-d.z, 0, d.x).multiplyScalar(0.32);
    for (const [o, y] of [[0, -0.3], [1, -0.3], [-1, -0.3], [0, 0.5]]) {
      _o.copy(c.pos).addScaledVector(side, o); _o.y = c.pos.y + y;
      const h = w.raycast(_o, d, 1.3);
      if (h && !ignored.has(h.box) && h.box.max.y - feet > 0.55 && !this.inOwnOpening(h.point)) return true;
    }
    if (!c.grounded) return false;
    const ahead = c.pos.clone().addScaledVector(d, 1.4);
    if (!w.raycast(ahead, DOWN, 8) && !this.wantsPortalDrop(ahead)) { if (info) info.ledge = true; return true; }
    return false;
  }

  avoid() {
    const c = this.c, w = this.m.world;
    if (!c.grounded) {
      // In the air over nothing? Steer back the way we came.
      const hv = new THREE.Vector3(c.vel.x, 0, c.vel.z);
      const land = c.pos.clone().addScaledVector(hv, 0.35);
      if (hv.lengthSq() > 1 && !w.raycast(land, DOWN, 30) && !this.wantsPortalDrop(land)) {
        this.wish.copy(hv.normalize().negate());
        return;
      }
    }
    // Escaping after getting stuck: keep going the escape way for a moment.
    if (this.escapeT > 0) {
      if (!this.blocked(this.escape)) { this.wish.copy(this.escape); return; }
      this.escapeT = 0;
    }
    if (this.wish.lengthSq() === 0) return;
    const want = _w.copy(this.wish).setY(0).normalize();
    // Keep a detour we picked recently while it's free and still roughly useful.
    if (this.steerT > 0 && this.steer.dot(want) > -0.2 && !this.blocked(this.steer)) { this.wish.copy(this.steer); return; }
    const info = { ledge: false };
    if (!this.blocked(want, info)) { this.wish.copy(want); return; }
    // Blocked: try 16 directions around us and take the free one closest to where we want to go.
    let best = null, bestScore = -Infinity;
    for (let i = 1; i < 16; i++) {
      const a = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 8) * this.strafeSign;
      const d = new THREE.Vector3().copy(want).applyAxisAngle(UP, a);
      const score = d.dot(want);
      if (score <= bestScore) continue;
      if (this.blocked(d, info)) continue;
      best = d; bestScore = score;
    }
    if (best) { this.steer = best; this.steerT = 0.5; this.wish.copy(best); return; }
    if (info.ledge) this.wish.set(0, 0, 0); // stand still instead of jumping off
    else if (this.groundAhead(want, [2, 4], false)) this.jump = true;
  }

  // Ladders: if the goal is well above us, walk to the nearest ladder that reaches that high,
  // then push into it to climb. Returns { climb: direction } while on a ladder, { point } to
  // walk to, or null when no ladder is needed.
  ladderRoute(goal) {
    const w = this.m.world, c = this.c;
    if (!w.ladders || !w.ladders.length) return null;
    const on = w.ladderAt(c);
    const high = goal.y - c.pos.y > 2.5;
    if (on && (high || this.climbing)) {
      this.climbing = true;
      return { climb: new THREE.Vector3(-on.n[0], 0, -on.n[2]) };
    }
    this.climbing = false;
    if (!high || !c.grounded) return null;
    let best = null, bestD = Infinity;
    for (const l of w.ladders) {
      if (l.max[1] < goal.y - 2.5) continue;          // doesn't reach that high
      const p = new THREE.Vector3((l.min[0] + l.max[0]) / 2, c.pos.y, (l.min[2] + l.max[2]) / 2);
      const d = p.distanceTo(c.pos) + p.distanceTo(goal);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best ? { point: best } : null;
  }

  // Called every frame: if we've been trying to move but haven't got anywhere, pick a random
  // free direction and go that way for a bit.
  checkStuck(dt) {
    const c = this.c;
    this.steerT = Math.max(0, (this.steerT || 0) - dt);
    this.escapeT = Math.max(0, (this.escapeT || 0) - dt);
    this.progT = (this.progT || 0) + dt;
    if (!this.progPos) this.progPos = c.pos.clone();
    if (this.progT < 1.5) return;
    const moved = Math.hypot(c.pos.x - this.progPos.x, c.pos.z - this.progPos.z);
    if (moved < 0.5 && this.wish.lengthSq() > 0 && this.escapeT <= 0 && c.grounded && !c.onLadder) {
      const off = Math.random() * Math.PI * 2;
      for (let i = 0; i < 8; i++) {
        const d = new THREE.Vector3(Math.sin(off + i * Math.PI / 4), 0, Math.cos(off + i * Math.PI / 4));
        if (!this.blocked(d)) { this.escape = d; this.escapeT = 1.2; break; }
      }
      this.strafeSign *= -1;
    }
    this.progT = 0;
    this.progPos.copy(c.pos);
  }
}
