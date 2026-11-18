import * as THREE from 'three';

// Keeps an online match in sync. Every browser simulates its own characters (its player, and
// on the host also the bots) and sends their movement 20 times a second; everyone else's
// characters are "puppets" that smoothly follow those updates.
//
// Who decides what:
//  - The shooter decides if a bullet hit (it sends 'hit' to the victim's owner).
//  - The victim's owner applies the damage and announces the 'kill'.
//  - Grenades/rockets fly on every screen; each browser only damages its own characters.
//  - The host decides rounds, scores and the end of the match.

const SEND_RATE = 1 / 20;
const HOST_ONLY = ['round', 'finish', 'score', 'takeover', 'ctf'];
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const arr = (v) => [r3(v.x), r3(v.y), r3(v.z)];

export class NetSync {
  constructor(match, room) {
    this.m = match;
    this.room = room;
    this.isHost = room.isHost;
    this.myId = room.myId;
    this.sendT = 0;
    this.states = new Map();   // netId -> latest packed state (from other browsers)
    this.onMessage = (msg, from) => this.receive(msg, from);
    room.on('message', this.onMessage);
    this.onLeft = (id) => this.playerLeft(id);
    this.onClosed = (why) => this.m.netClosed(why);
    room.on('left', this.onLeft);
    room.on('closed', this.onClosed);
  }

  // Characters this browser simulates.
  owns(c) { return c.owner === this.myId; }

  // A puppet was killed: remember which life it died in.
  died(c) { const s = this.states.get(c.netId); c.deadLife = s ? s[13] : null; }

  // ---------- Movement ----------
  pack(c) {
    const flags = (c.alive ? 1 : 0) | (c.grounded ? 2 : 0) | (c.crouched ? 4 : 0) | (c.slideT > 0 ? 8 : 0) | (c.aiming ? 16 : 0) | (c.climbT > 0 ? 32 : 0) | (c.emote && c.emote.live ? 64 : 0);
    return [c.netId, r3(c.pos.x), r3(c.pos.y), r3(c.pos.z), r2(c.vel.x), r2(c.vel.y), r2(c.vel.z), r3(c.yaw), r3(c.pitch), flags, Math.round(c.hp), c.slot, c.gunLevel || 0, c.life || 0];
  }

  tick(dt) {
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT = SEND_RATE;
    const mine = this.m.chars.filter(c => this.owns(c) && !c.gone).map(c => this.pack(c));
    if (!this.isHost) { this.room.broadcast({ t: 's', list: mine }); return; }
    // Host: send everyone all states except their own.
    const all = [...mine, ...this.states.values()];
    for (const p of this.room.players) {
      if (p.id === 'h') continue;
      const list = all.filter(s => this.m.byNet[s[0]] && this.m.byNet[s[0]].owner !== p.id);
      this.room.sendTo(p.id, { t: 's', list });
    }
  }

  // Move a puppet toward its latest state. Called every frame.
  updatePuppet(c, dt) {
    const s = this.states.get(c.netId);
    if (!s) { if (c.alive) c.animate(dt); return; }
    const [, x, y, z, vx, vy, vz, yaw, pitch, flags, hp, slot, gunLevel, life] = s;
    const alive = !!(flags & 1);
    // Only a new life brings a dead puppet back (an older "alive" update can arrive after the kill).
    if (alive && !c.alive && !c.gone && life !== c.deadLife) {
      // Came back (respawn / new round).
      c.spawn(new THREE.Vector3(x, y - 0.92, z), yaw);
      c.deadLife = null;
    }
    if (!c.alive) { if (c.body && c.mesh.visible) c.animate(dt); return; }
    const target = new THREE.Vector3(x, y, z);
    if (c.pos.distanceTo(target) > 4) c.pos.copy(target);            // teleported (portal, respawn)
    else c.pos.lerp(target, Math.min(1, dt * 14));
    c.vel.set(vx, vy, vz);
    let dy = yaw - c.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    c.yaw += dy * Math.min(1, dt * 16);
    c.pitch += (pitch - c.pitch) * Math.min(1, dt * 16);
    c.grounded = !!(flags & 2);
    c.airT = c.grounded ? 0 : (c.airT || 0) + dt;
    const crouch = !!(flags & 4);
    if (crouch !== c.crouched) {
      c.crouched = crouch;
      c.halfHeight = crouch ? 0.6 : 0.9;
      c.eyeOffset = crouch ? 0.35 : 0.7;
    }
    c.slideT = flags & 8 ? 0.1 : 0;
    c.aiming = !!(flags & 16);
    c.climbT = flags & 32 ? 0.1 : 0;
    if (flags & 64) { if (!c.emote) c.startEmote(); } else if (c.emote && c.emote.live) c.stopEmote();
    c.hp = hp;
    if (gunLevel !== (c.gunLevel || 0) && this.m.mode.gungame) { c.gunLevel = gunLevel; this.m.setGunGameWeapon(c); }
    if (slot !== c.slot && c.weapons[slot]) { c.slot = slot; c.updateGun(); }
    c.animate(dt);
  }

  // ---------- Events ----------
  send(ev, except = null) {
    const msg = { t: 'ev', ...ev };
    if (ev.e === 'hit') {
      const victim = this.m.byNet[ev.v];
      if (!victim) return;
      if (this.isHost) this.room.sendTo(victim.owner, msg); // host's own characters never get here
      else this.room.broadcast(msg);                       // to the host, who passes it on
      return;
    }
    this.room.broadcast(msg, except);
  }

  receive(msg, from) {
    if (msg.t === 's') {
      for (const s of msg.list) {
        const c = this.m.byNet[s[0]];
        if (!c || this.owns(c)) continue;
        if (this.isHost && c.owner !== from) continue; // players can only move their own characters
        this.states.set(s[0], s);
      }
      return;
    }
    if (msg.t !== 'ev') return;
    if (this.isHost && from !== 'h') {
      // Pass it on: hits go to the victim's owner, everything else to everyone else.
      if (msg.e === 'hit') {
        const victim = this.m.byNet[msg.v];
        if (victim && victim.owner !== 'h') { this.room.sendTo(victim.owner, msg); return; }
      } else if (!HOST_ONLY.includes(msg.e)) this.room.broadcast(msg, from);
      // Only the host may control rounds and who plays which character.
      if (HOST_ONLY.includes(msg.e)) return;
    }
    this.m.netEvent(msg);
  }

  // Host: a player left mid-match, a bot takes over their character.
  playerLeft(id) {
    if (!this.isHost) return;
    for (const c of [...this.m.chars]) if (c.owner === id) this.m.botTakeover(c);
    this.m.hud.toast('A player left, a bot took over', '#f99');
  }

  dispose() {
    const h = this.room.handlers;
    for (const [type, fn] of [['message', this.onMessage], ['left', this.onLeft], ['closed', this.onClosed]])
      if (h[type]) h[type] = h[type].filter(f => f !== fn);
  }
}

// Bullet path <-> plain arrays.
export const packSegs = (segs) => segs.map(s => [...arr(s.from), ...arr(s.to)]);
export const unpackSegs = (a) => (a || []).map(s => ({ from: v3(s.slice(0, 3)), to: v3(s.slice(3, 6)) }));
export { v3, arr };
