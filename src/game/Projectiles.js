import * as THREE from 'three';
import { Sfx } from '../audio.js';

// Things that fly: grenades (bounce, then explode), rockets (explode on impact) and crossbow
// bolts (heavy hit). They move in small steps using the same ray tracer as bullets, so they
// pass through portals exactly like shots do.
const TYPES = {
  grenade: { gravity: 22, fuse: 2.0, radius: 5.5, damage: 115, bounce: 0.42, knock: 9 },
  rocket:  { gravity: 0, fuse: 6, radius: 4.2, damage: 105, knock: 13, explodeOnHit: true },
  bolt:    { gravity: 7, fuse: 4, damage: 95, headMult: 1.6 },
};

const geoGrenade = new THREE.SphereGeometry(0.11, 10, 8);
const geoRocket = new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8).rotateX(Math.PI / 2);
const geoBolt = new THREE.BoxGeometry(0.03, 0.03, 0.6);
const geoBoom = new THREE.SphereGeometry(1, 16, 12);

export class Projectiles {
  constructor(match) {
    this.m = match;
    this.list = [];
    this.booms = [];
  }

  spawn(type, owner, pos, vel) {
    const def = TYPES[type];
    let mesh;
    if (type === 'grenade') {
      mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(geoGrenade, new THREE.MeshLambertMaterial({ color: '#3d5a2a' })));
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), new THREE.MeshBasicMaterial({ color: owner.portalColor }));
      led.position.y = 0.1; mesh.add(led); mesh.userData.led = led;
    } else if (type === 'rocket') {
      mesh = new THREE.Mesh(geoRocket, new THREE.MeshLambertMaterial({ color: '#c8c8d0', emissive: '#442200' }));
    } else {
      mesh = new THREE.Mesh(geoBolt, new THREE.MeshBasicMaterial({ color: owner.portalColor }));
    }
    mesh.position.copy(pos);
    this.m.scene.add(mesh);
    this.list.push({ type, def, owner, pos: pos.clone(), vel: vel.clone(), age: 0, mesh, viaPortal: false, resting: false });
  }

  update(dt) {
    const m = this.m;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      if (p.age >= p.def.fuse) { this.finish(i, p.def.radius ? p.pos : null); continue; }
      if (p.mesh.userData.led) p.mesh.userData.led.visible = Math.sin(p.age * (8 + p.age * 12)) > 0;
      if (p.resting) continue;
      p.vel.y -= p.def.gravity * dt;
      const speed = p.vel.length();
      const dist = speed * dt;
      if (dist < 1e-5) continue;
      const dir = p.vel.clone().divideScalar(speed);
      const tr = m.portals.trace(p.pos, dir, dist, { characters: m.chars, ignore: p.age < 0.25 ? p.owner : null });
      if (tr.segments.length > 1) p.viaPortal = true;
      const end = tr.segments[tr.segments.length - 1].to;
      const hit = tr.hit;
      if (!hit) {
        p.pos.copy(end);
        if (tr.segments.length > 1) p.vel.copy(tr.finalDir).multiplyScalar(speed); // came out of a portal
      } else if (hit.type === 'world') {
        if (p.def.explodeOnHit) { this.finish(i, hit.point.clone().addScaledVector(hit.normal, 0.2)); continue; }
        if (p.type === 'bolt') { this.m.effects.spark(hit.point); Sfx.impact(0.8); this.finish(i, null); continue; }
        // Grenade bounce
        p.pos.copy(hit.point).addScaledVector(hit.normal, 0.12);
        const vn = p.vel.dot(hit.normal);
        p.vel.addScaledVector(hit.normal, -(1 + p.def.bounce) * vn);
        // Friction: floors grab the grenade much more than walls do.
        p.vel.multiplyScalar(hit.normal.y > 0.7 ? 0.5 : 0.75);
        if (Math.abs(vn) > 2) Sfx.bounce(Math.min(1, Math.abs(vn) / 12));
        if (hit.normal.y > 0.7 && p.vel.length() < 2.5) { p.resting = true; p.vel.set(0, 0, 0); }
      } else if (hit.type === 'character') {
        const t = hit.character;
        if (p.type === 'grenade') {
          // Bonk: drop at their feet.
          p.pos.copy(hit.point).addScaledVector(dir, -0.2);
          p.vel.x *= -0.15; p.vel.z *= -0.15; p.vel.y = Math.min(p.vel.y, 0);
          Sfx.bounce(0.6);
          p.mesh.position.copy(p.pos);
          continue;
        }
        if (p.def.explodeOnHit) { this.finish(i, hit.point.clone()); continue; }
        // Bolt: direct hit
        if (t === p.owner || t.team !== p.owner.team) {
          const dmg = p.def.damage * p.owner.stats.damageMult * (hit.head ? p.def.headMult : 1);
          m.applyDamage(p.owner, t, dmg, { portal: p.viaPortal, head: hit.head, segs: tr.segments, from: p.pos.clone(), proj: true });
        }
        this.finish(i, null);
        continue;
      }
      p.mesh.position.copy(p.pos);
      if (p.type !== 'grenade') p.mesh.lookAt(p.pos.clone().add(p.vel));
    }
    // explosion visuals
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      b.t += dt;
      const k = b.t / 0.45;
      b.mesh.scale.setScalar(0.5 + k * b.r);
      b.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) { m.scene.remove(b.mesh); b.mesh.material.dispose(); this.booms.splice(i, 1); }
    }
  }

  finish(i, explodeAt) {
    const p = this.list[i];
    this.list.splice(i, 1);
    this.m.scene.remove(p.mesh);
    if (explodeAt) this.explode(p, explodeAt);
  }

  explode(p, at) {
    const m = this.m, def = p.def;
    const vol = Math.max(0.15, 1 - at.distanceTo(m.player.pos) / 70);
    Sfx.explosion(vol);
    const boom = new THREE.Mesh(geoBoom, new THREE.MeshBasicMaterial({ color: '#ffa040', transparent: true, depthWrite: false }));
    boom.position.copy(at);
    m.scene.add(boom);
    this.booms.push({ mesh: boom, t: 0, r: def.radius * 0.8 });
    if (at.distanceTo(m.player.pos) < 12) m.shake = Math.min(1.5, m.shake + 1.2 * (1 - at.distanceTo(m.player.pos) / 12));

    for (const c of m.chars) {
      if (!c.alive) continue;
      if (c !== p.owner && c.team === p.owner.team) continue; // no friendly fire (you can hurt yourself)
      const center = c.pos.clone();
      const d = center.distanceTo(at);
      if (d > def.radius + 0.5) continue;
      // Walls block explosions.
      const toC = center.clone().sub(at);
      const blocked = m.world.raycast(at, toC.clone().normalize(), Math.max(0, toC.length() - 0.4));
      if (blocked) continue;
      const k = Math.max(0, 1 - d / (def.radius + 0.5));
      // Knockback (rocket jumps!)
      const push = toC.lengthSq() > 0.01 ? toC.normalize() : new THREE.Vector3(0, 1, 0);
      push.y = Math.max(push.y, 0.35);
      c.vel.addScaledVector(push.normalize(), def.knock * k);
      c.grounded = false;
      let dmg = def.damage * k * p.owner.stats.damageMult;
      if (c === p.owner) dmg *= 0.35; // self damage is reduced
      if (dmg >= 1) m.applyDamage(p.owner, c, dmg, { portal: p.viaPortal, grenade: p.type === 'grenade', explosion: true, from: at.clone(), proj: true });
    }
  }

  clear() {
    for (const p of this.list) this.m.scene.remove(p.mesh);
    for (const b of this.booms) this.m.scene.remove(b.mesh);
    this.list = []; this.booms = [];
  }
}
