import * as THREE from 'three';
import { Character, SWITCH_TIME } from './Character.js';
import { BotBrain } from './Bot.js';
import { PortalGhost } from './Portals.js';
import { buildStats, WEAPONS, WeaponState } from './Weapons.js';
import { randomLook } from './Look.js';
import { Projectiles } from './Projectiles.js';
import { GUN_SKINS } from '../progress.js';
import { Tutorial } from './Tutorial.js';
import { Sfx } from '../audio.js';
import { COLORS } from '../save.js';
import { NetSync, packSegs, unpackSegs, v3, arr } from '../net/NetSync.js';
import { mapModelLoaded } from './Models.js';

export const DIFFICULTIES = {
  easy:   { label: 'Easy',   skill: 0.25, coins: 0.75, botDamage: 0.55, guns: ['ar', 'smg', 'shotgun', 'burst'] },
  normal: { label: 'Normal', skill: 0.5,  coins: 1,    botDamage: 0.75, guns: ['ar', 'ar', 'smg', 'shotgun', 'burst'] },
  hard:   { label: 'Hard',   skill: 0.85, coins: 1.5,  botDamage: 0.95, guns: ['ar', 'ar', 'smg', 'shotgun', 'sniper', 'burst', 'crossbow'] },
};
// Ranked bots scale with your rating: Bronze is like Easy, Gold like Normal, Master+ is beyond Hard.
export function rankedDifficulty(rp = 800) {
  const t = Math.min(1, Math.max(0, (rp - 600) / 1400));
  const guns = rp < 900 ? DIFFICULTIES.easy.guns : rp < 1300 ? DIFFICULTIES.normal.guns : DIFFICULTIES.hard.guns;
  return { label: 'Ranked', skill: 0.22 + t * 0.78, coins: 1 + t * 0.6, botDamage: 0.55 + t * 0.5, guns, ranked: true };
}
export function matchDifficulty(save) {
  if (save.difficulty === 'ranked') return rankedDifficulty(save.rating ?? 800);
  return DIFFICULTIES[save.difficulty] || DIFFICULTIES.normal;
}

const shadowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

export const ROUNDS_TO_WIN = 3;
const COUNTDOWN = 3;
const ROUND_TIME = 120;
const ROUND_END_TIME = 3;
export const TEAM_COLORS = ['#3a6fd8', '#d84a4a'];
export const FFA_COLORS = ['#3a6fd8', '#d84a4a', '#3ab060', '#d8a030'];
export const BOT_NAMES = ['Vex', 'Nova', 'Bolt', 'Kira', 'Rook', 'Zed'];

export const MODES = {
  '1v1': { label: '1v1', teams: [[0], [1]], desc: 'Duel one bot. Last one standing wins the round. First to 3 rounds.' },
  '2v2': { label: '2v2', teams: [[0, 1], [2, 3]], desc: 'You and a bot teammate vs two bots. First to 3 rounds.' },
  'ffa': { label: 'Free for all', ffa: true, count: 4, desc: 'Everyone for themselves. Last one standing wins the round.' },
  'koth': { label: 'King of the Hill', teams: [[0, 1], [2, 3]], respawn: true, koth: true, target: 100, time: 240,
    desc: '2v2 with respawns. Stand in the glowing zone to score. First team to 100 wins.' },
  'gungame': { label: 'Gun Game', ffa: true, count: 4, respawn: true, gungame: true, time: 300,
    desc: 'Free for all with respawns. Every kill gives you the next gun. Get a kill with the last one to win.' },
  'ctf': { label: 'Capture the Flag', teams: [[0, 1], [2, 3]], respawn: true, ctf: true, target: 3, time: 300,
    desc: '2v2 with respawns. Grab the enemy flag and bring it to yours. First to 3 captures wins.' },
  'tutorial': { label: 'Tutorial', teams: [[0], [1]], tutorial: true, hidden: true },
  'portalonly': { label: 'Portal Only', teams: [[0], [1]], portalOnly: true,
    desc: 'Damage only counts if the shot went through a portal. Bounce your shots! First to 3 rounds.' },
};
export const GUN_LADDER = ['smg', 'shotgun', 'burst', 'ar', 'crossbow', 'sniper', 'revolver', 'pistol'];

export class Match {
  // online: { room, roster } for an online match (see src/net/), otherwise null.
  constructor(ctx, modeId, save, onEnd, online = null) {
    Object.assign(this, ctx); // scene, renderer, camera, world, portals, effects, viewmodel, input, hud
    this.online = online;
    this.isAuthority = !online || online.room.isHost; // decides rounds, scores and the winner
    this.net = null;
    this.byNet = {};
    this.mode = MODES[modeId];
    this.modeId = modeId;
    this.save = save;
    this.onEnd = onEnd;
    this.chars = [];
    this.bots = [];
    this.wins = {};
    this.state = 'countdown';
    this.stateT = 0;
    this.round = 0;
    // Everything the player did this match (used for coins, XP, challenges and stats).
    this.earned = { kills: 0, rounds: 0, portalKills: 0, headshots: 0, shots: 0, hits: 0, deaths: 0, grenadeKills: 0, captures: 0 };
    this.killcam = null;
    this.projectiles = new Projectiles(this);
    this.ghostMode = false;
    this.ghost = new PortalGhost(this.scene);
    this.deathCam = null;
    this.scoped = false;
    this.ads = false; this.adsT = 0; // aiming down sights (right mouse)
    this.baseFov = this.camera.fov;
    this.jumpBuf = 0; this.bobT = 0; this.dip = 0; this.dipV = 0; this.shake = 0; this.bloom = 0;
    this.fovKick = 0; this.eyeSmooth = 1.6; this.roundT = ROUND_TIME;

    this.portals.onEvent = (type, c) => {
      if (type === 'expire' && c.owner === this.player) Sfx.portalClose();
      if (type === 'teleport') {
        if (c === this.player) Sfx.teleport();
        if (c === this.player && this.tutorial) this.tutorial.flags.teleported = true;
        const brain = this.bots.find(b => b.c === c);
        if (brain) { brain.flank = null; brain.tpAt = performance.now(); }
      }
    };
    this.setup();
    this.startRound();
    if (online) this.net = new NetSync(this, online.room);
    if (this.mode.tutorial) {
      this.bots = [];            // the target dummy just stands there
      this.roundT = 1e9;
      this.stateT = 0.6;
      this.tutorial = new Tutorial(this);
      this.tutorial.placeDummy(new THREE.Vector3(6.2, 0, 9), -Math.PI / 2);
    }
  }

  finishTutorial() {
    if (this.state === 'done') return;
    this.state = 'done';
    this.onEnd({ tutorial: true, won: true, coins: 0, kills: 0, rounds: 0, earned: { ...this.earned } });
  }

  // Online: characters come from the host's roster (players + bots), in the same order everywhere.
  setupOnline(roster) {
    for (const e of roster) this.addChar(this.makeOnlineChar(e));
    this.player = this.chars.find(c => c.owner === this.online.room.myId && !c.isBot);
  }

  // A character from a roster entry (and its bot brain if this browser runs it).
  makeOnlineChar(e) {
    const myId = this.online.room.myId;
    const diff = matchDifficulty(this.save);
    const local = e.owner === myId, isMe = local && !e.bot;
    const c = new Character({
      name: e.name, look: e.look, team: e.team, color: e.bodyColor, portalColor: e.color, isBot: e.bot,
      skin: GUN_SKINS.find(s => s.id === e.gunSkin) || null,
      stats: isMe ? buildStats(this.save) : e.bot ? { ...buildStats(null), damageMult: diff.botDamage } : buildStats(null),
      loadout: e.loadout,
    });
    c.netId = e.id; c.owner = e.owner; c.remote = !local;
    this.byNet[e.id] = c;
    if (e.bot && local) this.bots.push(new BotBrain(c, this, Math.min(1, diff.skill + Math.random() * 0.1)));
    return c;
  }

  // Swap the character in a roster slot (a player taking over a bot, or a bot replacing a
  // player who left). The new one keeps the old one's place, score and life.
  replaceChar(entry) {
    const old = this.byNet[entry.id];
    if (!old) return;
    const i = this.chars.indexOf(old);
    this.scene.remove(old.mesh); this.scene.remove(old.shadow);
    this.portals.removeOwner(old);
    this.bots = this.bots.filter(b => b.c !== old);
    const c = this.makeOnlineChar(entry);
    this.scene.add(c.mesh);
    c.shadow = old.shadow; this.scene.add(c.shadow);
    this.chars[i] = c;
    const k = this.online.roster.findIndex(e => e.id === entry.id);
    if (k >= 0) this.online.roster[k] = entry;
    if (this.net) this.net.states.delete(entry.id);
    c.kills = old.kills; c.deaths = old.deaths; c.gunLevel = old.gunLevel; c.respawnT = old.respawnT;
    if (this.mode.gungame) this.setGunGameWeapon(c);
    if (old.alive) { c.spawn(old.pos.clone().setY(old.pos.y - old.halfHeight), old.yaw); c.hp = old.hp; }
    else { c.alive = false; c.mesh.visible = false; if (c.tagSprite) c.tagSprite.visible = false; if (!c.respawnT) c.respawnT = 2; }
    c.animate(0);
    for (const b of this.bots) if (b.target === old) { b.target = null; b.aimDir = null; }
    if (this.deathCam && this.deathCam.spec === old) this.deathCam.spec = null;
    this.updateScore();
    return c;
  }

  // Host: a player joined mid-match. They take over a bot (on the team with fewer players).
  // Returns false if there is no bot to take over.
  lateJoin(p) {
    const humans = (t) => this.online.roster.filter(e => !e.bot && e.team === t).length;
    const slots = this.online.roster.filter(e => e.bot).sort((a, b) => humans(a.team) - humans(b.team));
    if (!slots.length) return false;
    const old = slots[0];
    const entry = { ...old, owner: p.id, bot: false, name: p.name, look: p.look, color: p.color, loadout: p.loadout, gunSkin: p.gunSkin };
    this.replaceChar(entry);
    this.net.send({ e: 'takeover', entry }, p.id);
    this.hud.toast(`${p.name} joined`, '#9f9');
    return true;
  }

  // Host: a player left, a bot carries on in their place.
  botTakeover(c) {
    const e = this.online.roster.find(r => r.id === c.netId);
    if (!e) return;
    const used = new Set(this.chars.map(o => o.name));
    const name = BOT_NAMES.map(n => n + ' (bot)').find(n => !used.has(n)) || 'Bot';
    const diff = matchDifficulty(this.save);
    const entry = { ...e, owner: 'h', bot: true, name, look: randomLook(name), gunSkin: null,
      loadout: { primary: diff.guns[Math.floor(Math.random() * diff.guns.length)], secondary: 'pistol' } };
    this.replaceChar(entry);
    this.net.send({ e: 'takeover', entry });
  }

  // Where the match is at, for someone joining late.
  snapshot() {
    return { round: this.round, wins: this.wins, scores: this.scores, state: this.state, roundT: this.roundT,
      chars: this.chars.map(c => [c.netId, c.alive ? 1 : 0, c.kills, c.deaths || 0, c.gunLevel || 0]) };
  }

  applySnapshot(s) {
    this.round = s.round; this.wins = s.wins; this.scores = s.scores || {}; this.roundT = s.roundT;
    if (s.state === 'fight' || s.state === 'roundEnd') { this.state = s.state; this.stateT = 0.5; this.hud.centerText(''); }
    for (const [id, alive, kills, deaths, gunLevel] of s.chars) {
      const c = this.byNet[id];
      if (!c) continue;
      c.kills = kills; c.deaths = deaths;
      if (this.mode.gungame && gunLevel !== (c.gunLevel || 0)) { c.gunLevel = gunLevel; this.setGunGameWeapon(c); }
      if (!alive && c.alive) {
        c.alive = false; c.mesh.visible = false; if (c.tagSprite) c.tagSprite.visible = false;
        c.respawnT = 2;
        if (c === this.player) this.deathCam = { pos: this.camera.position.clone(), t: 1.2 };
      }
    }
    this.updateScore();
  }

  addChar(c) {
    this.chars.push(c);
    this.scene.add(c.mesh);
    c.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    c.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(c.shadow);
  }

  setup() {
    if (this.online) this.setupOnline(this.online.roster);
    else this.setupBots();
    this.player.setBodyLayer(1); // visible only through portals, not to the first-person camera
    if (this.mode.gungame) for (const c of this.chars) { c.gunLevel = 0; this.setGunGameWeapon(c); }
    if (this.mode.koth) this.setupHill();
    if (this.mode.ctf) this.setupFlags();
    this.viewmodel.setSkin(this.player.skin, this.player.portalColor);
    for (const c of this.chars) this.wins[c.team] = 0;
  }

  setupBots() {
    const botColors = COLORS.filter(c => c !== this.save.color);
    const diff = matchDifficulty(this.save);
    const make = (i, team, bodyColor) => {
      const isBot = i !== 0;
      const name = isBot ? BOT_NAMES[(i - 1) % BOT_NAMES.length] : this.save.look.name;
      const c = new Character({
        name, look: isBot ? randomLook(name) : this.save.look,
        skin: isBot ? null : GUN_SKINS.find(s => s.id === this.save.gunSkin) || null,
        team, color: bodyColor,
        portalColor: isBot ? botColors[(i - 1) % botColors.length] : this.save.color,
        isBot, stats: isBot ? { ...buildStats(null), damageMult: diff.botDamage } : buildStats(this.save),
        loadout: isBot
          ? { primary: diff.guns[Math.floor(Math.random() * diff.guns.length)], secondary: 'pistol' }
          : this.save.loadout,
      });
      this.addChar(c);
      if (isBot) this.bots.push(new BotBrain(c, this, Math.min(1, diff.skill + Math.random() * 0.1)));
      return c;
    };
    if (this.mode.ffa) {
      for (let i = 0; i < this.mode.count; i++) make(i, i, FFA_COLORS[i]);
    } else {
      this.mode.teams.forEach((members, team) => members.forEach(i => make(i, team, TEAM_COLORS[team])));
      this.chars.sort((a, b) => (a.isBot ? 1 : 0) - (b.isBot ? 1 : 0));
    }
    this.player = this.chars.find(c => !c.isBot);
  }

  enemiesOf(c) { return this.chars.filter(o => o.team !== c.team); }

  startRound() {
    this.round++;
    this.portals.clear();
    this.effects.clear();
    this.ghostMode = false;
    this.ghost.hide();
    this.setScope(false);
    this.endKillcam();
    this.projectiles.clear();
    this.deathCam = null;
    this.hud.killcam(null);
    const teamIdx = {};
    for (const c of this.chars) {
      let at, yaw;
      if (this.mode.ffa) {
        at = this.world.spawns.ffa[c.team];
      } else {
        teamIdx[c.team] = (teamIdx[c.team] || 0);
        at = this.world.spawns[c.team][teamIdx[c.team]++];
      }
      yaw = Math.atan2(at.x, at.z); // face the centre of the map
      c.spawn(at, yaw);
      c.animate(0);
    }
    for (const b of this.bots) b.reset();
    this.state = 'countdown';
    this.stateT = COUNTDOWN;
    this.roundT = this.mode.time || ROUND_TIME;
    this.lastBeep = null;
    if (this.net) {
      this.net.states.clear();
      if (this.isAuthority) this.net.send({ e: 'round', what: 'start' });
    }
    this.scores = {};
    for (const c of this.chars) { this.scores[c.team] = 0; c.respawnT = 0; }
    this.updateScore();
  }

  // ---------- Respawn modes ----------

  // Spawn point farthest from living enemies.
  respawn(c) {
    const enemies = this.enemiesOf(c).filter(e => e.alive);
    const all = [...this.world.spawns[0], ...this.world.spawns[1], ...this.world.spawns.ffa];
    let best = all[0], bestD = -1;
    for (const s of all) {
      const d = enemies.length ? Math.min(...enemies.map(e => e.pos.distanceTo(s))) : Math.random();
      if (d > bestD) { bestD = d; best = s; }
    }
    c.spawn(best, Math.atan2(best.x, best.z));
    if (this.mode.gungame) this.setGunGameWeapon(c);
    c.animate(0);
    const brain = this.bots.find(b => b.c === c);
    if (brain) brain.reset();
    if (c === this.player) { this.endKillcam(); this.deathCam = null; this.hud.killcam(null); this.hud.centerText(''); }
  }

  setGunGameWeapon(c) {
    const def = WEAPONS[GUN_LADDER[Math.min(c.gunLevel, GUN_LADDER.length - 1)]];
    c.weapons = [new WeaponState(def, c.stats)];
    c.slot = 0; c.gunId = null; c.updateGun();
  }

  // ---------- Capture the Flag ----------

  setupFlags() {
    const tpl = mapModelLoaded('props/flag.glb');
    this.flags = [0, 1].map(team => {
      const sp = this.world.spawns[team];
      const base = sp.reduce((a, v) => a.add(v), new THREE.Vector3()).multiplyScalar(1 / sp.length);
      const color = TEAM_COLORS[team];
      const g = new THREE.Group();
      if (tpl) {
        const m = tpl.clone(true);
        m.traverse(o => { if (o.isMesh && o.material.color.getHSL({}).s > 0.3) { o.material = o.material.clone(); o.material.color.set(color); } });
        m.scale.setScalar(1.9);
        g.add(m);
      } else {
        const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.6, 0.08), new THREE.MeshLambertMaterial({ color: '#888' }));
        pole.position.y = 1.3; g.add(pole);
        const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.04), new THREE.MeshLambertMaterial({ color }));
        cloth.position.set(0.48, 2.25, 0); g.add(cloth);
      }
      // A glowing ring marks the base.
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.75, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false }));
      ring.position.copy(base).setY(base.y + 0.04);
      this.scene.add(g, ring);
      return { team, base, pos: base.clone(), carrier: null, dropped: false, returnT: 0, mesh: g, ring };
    });
    this.placeFlags();
  }

  placeFlags() {
    for (const f of this.flags) {
      if (f.carrier) {
        // Carried: on the carrier's back, a bit smaller.
        f.pos.copy(f.carrier.pos).setY(f.carrier.pos.y - f.carrier.halfHeight);
        f.mesh.position.copy(f.pos).add(new THREE.Vector3(Math.sin(f.carrier.yaw) * 0.35, 0.6, Math.cos(f.carrier.yaw) * 0.35));
        f.mesh.scale.setScalar(0.7);
        f.mesh.rotation.y = f.carrier.yaw + Math.PI / 2;
        f.mesh.visible = f.carrier !== this.player || this.camera.layers.isEnabled(1);
      } else {
        f.mesh.position.copy(f.pos);
        f.mesh.scale.setScalar(1);
        f.mesh.visible = true;
        f.mesh.rotation.y = Math.PI / 2; // cloth side-on to the map's long axis: readable from the middle
      }
    }
  }

  returnFlag(f) {
    f.carrier = null; f.dropped = false; f.pos.copy(f.base);
  }

  updateFlags(dt) {
    const p = this.player, name = (t) => t === p.team ? 'Your' : 'Enemy';
    if (this.isAuthority) {
      for (const f of this.flags) {
        if (f.carrier && (!f.carrier.alive || f.carrier.gone)) {
          // Carrier went down: the flag drops where they were (and goes home by itself later).
          f.pos.copy(f.carrier.pos).setY(Math.max(this.world.killY + 2, f.carrier.pos.y - f.carrier.halfHeight));
          if (f.carrier.pos.y < this.world.killY + 1) this.returnFlag(f); else { f.dropped = true; f.returnT = 12; }
          f.carrier = null;
          this.hud.toast(`${name(f.team)} flag dropped`, '#ffd27a');
        }
        if (f.dropped && (f.returnT -= dt) <= 0) { this.returnFlag(f); this.hud.toast(`${name(f.team)} flag returned`, '#9cf'); }
        if (f.carrier) continue;
        for (const c of this.chars) {
          if (!c.alive || c.gone || c.pos.distanceTo(f.pos.clone().setY(f.pos.y + c.halfHeight)) > 1.7) continue;
          if (c.team !== f.team && !this.flags.some(o => o.carrier === c)) {
            f.carrier = c; f.dropped = false;
            this.hud.toast(c.team === p.team ? `${c === p ? 'You have' : c.name + ' has'} the enemy flag!` : `${c.name} took your flag!`, c.team === p.team ? '#7f7' : '#f77');
            (c.team === p.team ? Sfx.portalPlace : Sfx.portalDeny)();
            break;
          }
          if (c.team === f.team && f.dropped) { this.returnFlag(f); this.hud.toast(`${name(f.team)} flag returned`, '#9cf'); break; }
        }
      }
      // Capture: a carrier reaches their own base while their own flag is home.
      for (const f of this.flags) {
        const c = f.carrier;
        if (!c) continue;
        const own = this.flags[c.team];
        if (!own.carrier && !own.dropped && Math.hypot(c.pos.x - own.base.x, c.pos.z - own.base.z) < 2.2) {
          this.returnFlag(f);
          this.scores[c.team] = (this.scores[c.team] || 0) + 1;
          this.hud.centerText(c.team === p.team ? 'FLAG CAPTURED!' : 'ENEMY CAPTURED YOUR FLAG', 1800, c.team === p.team ? '#7f7' : '#f77');
          (c.team === p.team ? Sfx.levelUp : Sfx.lose)();
          if (c === p) this.earned.captures = (this.earned.captures || 0) + 1;
          if (this.scores[c.team] >= this.mode.target) { this.placeFlags(); return this.finish(c.team); }
        }
      }
      if (this.net && (this.flagSendT = (this.flagSendT || 0) - dt) <= 0) {
        this.flagSendT = 0.15;
        this.net.send({ e: 'ctf', scores: this.scores, flags: this.flags.map(f => ({ c: f.carrier ? f.carrier.netId : null, p: arr(f.pos), d: f.dropped })) });
      }
    }
    for (const f of this.flags) f.ring.material.opacity = f.carrier || f.dropped ? 0.25 : 0.7;
    const mine = this.flags[p.team];
    this.flagText = mine.carrier ? 'TAKEN!' : mine.dropped ? 'dropped' : 'safe';
    this.placeFlags();
  }

  applyFlags(msg) {
    this.scores = msg.scores;
    msg.flags.forEach((s, i) => {
      const f = this.flags[i];
      const was = f.carrier;
      f.carrier = s.c === null ? null : this.byNet[s.c] || null;
      f.pos.set(...s.p); f.dropped = s.d;
      if (f.carrier && f.carrier !== was) this.hud.toast(f.carrier.team === this.player.team ? `${f.carrier === this.player ? 'You have' : f.carrier.name + ' has'} the enemy flag!` : `${f.carrier.name} took your flag!`, '#ffd27a');
    });
  }

  setupHill() {
    const h = this.world.map.hill || { x: 0, y: 0, z: 0, r: 4 };
    this.hill = h;
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(h.r, h.r, 2.2, 48, 1, true), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    ring.position.y = 1.1;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(h.r, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false }));
    disc.position.y = 0.03;
    g.add(ring, disc);
    g.position.set(h.x, h.y, h.z);
    this.scene.add(g);
    this.hillMesh = g; this.hillMats = [ring.material, disc.material];
  }

  inHill(c) {
    const h = this.hill;
    return c.alive && Math.hypot(c.pos.x - h.x, c.pos.z - h.z) < h.r && Math.abs(c.pos.y - c.halfHeight - h.y) < 2.5;
  }

  updateRespawnMode(dt) {
    const p = this.player;
    for (const c of this.chars) {
      if (c.alive || c.remote || c.gone) continue; // each browser respawns its own characters
      c.respawnT -= dt;
      if (c === p) this.hud.centerText(c.respawnT > 0 ? `Respawning in ${Math.ceil(c.respawnT)}` : '', 0, '#fff');
      if (c.respawnT <= 0) this.respawn(c);
    }
    if (this.mode.koth) {
      const teams = new Set(this.chars.filter(c => this.inHill(c)).map(c => c.team));
      const holder = teams.size === 1 ? [...teams][0] : null;
      const color = teams.size > 1 ? '#ffd040' : holder === null ? '#ffffff' : TEAM_COLORS[holder];
      for (const m of this.hillMats) m.color.set(color);
      this.hillMesh.children[0].rotation.y += dt;
      if (holder !== null && this.isAuthority) {
        this.scores[holder] += dt * 2;
        if (this.scores[holder] >= this.mode.target) return this.finish(holder);
      }
      if (this.net && this.isAuthority && (this.scoreSendT = (this.scoreSendT || 0) - dt) <= 0) {
        this.scoreSendT = 0.3;
        this.net.send({ e: 'score', scores: this.scores });
      }
      this.hillText = teams.size > 1 ? 'CONTESTED' : holder === null ? 'EMPTY' : holder === p.team ? 'YOURS' : 'ENEMY';
    }
    if (this.mode.ctf && this.flags) { this.updateFlags(dt); if (this.state !== 'fight') return; }
    this.updateScore();
    if (this.roundT <= 0 && this.isAuthority) {
      // Time up: best score wins.
      const val = (t) => this.mode.gungame ? Math.max(...this.chars.filter(c => c.team === t).map(c => c.gunLevel)) : this.scores[t];
      const best = Object.keys(this.scores).map(Number).sort((a, b) => val(b) - val(a))[0];
      this.finish(best);
    }
  }

  // Top-of-screen scoreboard. Updated every frame in respawn modes and on every kill otherwise.
  updateScore() {
    const p = this.player;
    const kd = `<div class="sb-kd">⚔ ${p.kills} kills · ☠ ${p.deaths || 0} deaths</div>`;
    const teamKills = (t) => this.chars.filter(c => c.team === t).reduce((n, c) => n + c.kills, 0);
    const side = (label, big, small, color, cls) => `<div class="sb-side ${cls}" style="--c:${color}"><span class="sb-name">${label}</span><b>${big}</b><small>${small}</small></div>`;
    let html;
    if (this.mode.ctf) {
      const my = p.team, other = 1 - my, s = this.scores || {};
      html = `<div class="sb-row">${side('YOU', s[my] || 0, `${teamKills(my)} kills`, TEAM_COLORS[my], 'l')}<div class="sb-mid">CAPTURE THE FLAG<small>first to ${this.mode.target} · your flag: ${this.flagText || 'safe'}</small></div>${side('ENEMY', s[other] || 0, `${teamKills(other)} kills`, TEAM_COLORS[other], 'r')}</div>${kd}`;
    } else if (this.mode.koth) {
      const my = p.team, other = 1 - my, s = this.scores || {};
      html = `<div class="sb-row">${side('YOU', Math.floor(s[my] || 0), `${teamKills(my)} kills`, TEAM_COLORS[my], 'l')}<div class="sb-mid">KING OF THE HILL<small>first to ${this.mode.target} · hill: ${this.hillText || 'EMPTY'}</small></div>${side('ENEMY', Math.floor(s[other] || 0), `${teamKills(other)} kills`, TEAM_COLORS[other], 'r')}</div>${kd}`;
    } else if (this.mode.gungame || this.mode.ffa) {
      const n = GUN_LADDER.length;
      const rows = [...this.chars].sort((a, b) => (this.mode.gungame ? b.gunLevel - a.gunLevel : 0) || b.kills - a.kills).map(c => {
        const extra = this.mode.gungame ? `gun ${Math.min(c.gunLevel, n - 1) + 1}/${n}` : `${'★'.repeat(this.wins[c.team] || 0) || '☆'}`;
        return `<div class="sb-ffa${c === p ? ' me' : ''}" style="--c:${c.color}"><span>${c === p ? 'YOU' : c.name}</span><b>${c.kills}</b><small>${extra}</small></div>`;
      }).join('');
      html = `<div class="sb-row ffa">${rows}</div>${kd}`;
    } else {
      const my = p.team, other = 1 - my;
      html = `<div class="sb-row">${side('YOU', this.wins[my], `${teamKills(my)} kills`, TEAM_COLORS[my], 'l')}<div class="sb-mid">ROUND ${this.round}<small>first to ${ROUNDS_TO_WIN}</small></div>${side('ENEMY', this.wins[other], `${teamKills(other)} kills`, TEAM_COLORS[other], 'r')}</div>${kd}`;
    }
    this.hud.setScore(html);
  }

  // ---------- Actions shared by player and bots ----------

  fire(c, extraSpread = 0, burstCont = false) {
    const w = c.weapon;
    if (c.switchT > 0 || !c.alive) return false;
    if (w.ammo === 0) { this.reload(c); return false; }
    if (!burstCont && !w.canFire()) return false;
    if (burstCont && (w.reloading || w.ammo === 0)) { w.burstLeft = 0; return false; }
    w.consume();

    const def = w.def;
    // Burst rifle: one click fires a quick burst of shots.
    if (def.burst) {
      w.burstLeft = burstCont ? w.burstLeft - 1 : def.burst - 1;
      w.cooldown = w.burstLeft > 0 ? def.burstGap : w.interval;
    }
    const moving = Math.hypot(c.vel.x, c.vel.z) > 1;
    const scoped = c === this.player && this.scoped;
    const aiming = c === this.player && this.ads;
    const base = scoped ? def.scopedSpread : def.spread * (aiming ? 0.35 : 1);
    const spread = base * (moving ? 1.35 : 1) * (c.grounded ? 1 : 1.7) + extraSpread;
    const origin = c.eyePos();
    const pellets = def.pellets || 1;
    const isPlayer = c === this.player;
    const muzzle = isPlayer
      ? this.viewmodel.muzzleView().applyMatrix4(this.camera.matrixWorld)
      : c.pos.clone().add(new THREE.Vector3(0.3, 0.38, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw)).addScaledVector(c.lookDir(), 0.9);

    let anyHit = false, anyHead = false;
    const sendSegs = [], sendHits = [];
    if (def.projectile) {
      // Rockets and crossbow bolts fly (and go through portals).
      const dir = c.lookDir();
      const start = origin.clone().addScaledVector(dir, 0.5);
      const vel = dir.multiplyScalar(def.speed);
      this.projectiles.spawn(def.projectile, c, start, vel);
      if (this.net) this.net.send({ e: 'proj', n: c.netId, type: def.projectile, pos: arr(start), vel: arr(vel) });
    } else {
      for (let i = 0; i < pellets; i++) {
        const dir = c.lookDir();
        dir.x += (Math.random() - 0.5) * 2 * spread;
        dir.y += (Math.random() - 0.5) * 2 * spread;
        dir.z += (Math.random() - 0.5) * 2 * spread;
        dir.normalize();
        const tr = this.portals.trace(origin, dir, 250, { characters: this.chars, ignore: c });
        tr.segments[0].from = muzzle.clone();
        this.effects.tracer(tr.segments, c.portalColor);
        if (this.net) { sendSegs.push(packSegs(tr.segments)); if (tr.hit && tr.hit.type === 'world' && i < 3) sendHits.push(arr(tr.hit.point)); }

        const hit = tr.hit;
        if (!hit) continue;
        if (hit.type === 'world') {
          if (i < 3) this.effects.spark(hit.point);
          if (i === 0 && hit.point.distanceTo(this.player.pos) < 25) Sfx.impact(isPlayer ? 1 : 0.6);
          continue;
        }
        const t = hit.character;
        let dmg = w.damage * (hit.head ? def.headMult : 1);
        if (def.falloff) {
          // Damage drops with distance (shotgun, SMG). Distance counts the whole path, through portals too.
          const [d0, d1, minK] = def.falloff;
          const travelled = origin.distanceTo(tr.segments[0].to) + tr.segments.slice(1).reduce((n, sg) => n + sg.from.distanceTo(sg.to), 0);
          dmg *= 1 - (1 - minK) * THREE.MathUtils.clamp((travelled - d0) / (d1 - d0), 0, 1);
        }
        if (this.applyDamage(c, t, dmg, { portal: tr.segments.length > 1, head: hit.head, segs: tr.segments })) {
          this.effects.spark(hit.point, '#ff4040');
          if (t !== c) { anyHit = true; anyHead = anyHead || hit.head; }
        }
      }
    }
    if (this.net) this.net.send({ e: 'fire', n: c.netId, segs: sendSegs, hits: sendHits });
    // Empty? Reload straight away.
    if (w.ammo === 0) { w.burstLeft = 0; this.reload(c); }

    if (isPlayer) {
      this.earned.shots++;
      if (anyHit) this.earned.hits++;
      if (anyHit) { this.hud.hit(anyHead); anyHead ? Sfx.headshot() : Sfx.hit(); }
      const kick = { ar: 0.008, smg: 0.006, shotgun: 0.05, sniper: 0.06, pistol: 0.02, revolver: 0.045, burst: 0.012, crossbow: 0.03, rocket: 0.07 }[def.id] || 0.02;
      this.viewmodel.fire(Math.min(1.5, kick * 30));
      this.bloom = Math.min(3, this.bloom + kick * 40);
      c.pitch = Math.min(1.5, c.pitch + kick);
      if (def.zoom) this.setScope(false); // sniper un-scopes after each shot
    }
    // Bots hear gunshots nearby.
    for (const b of this.bots) {
      if (b.c !== c && b.c.team !== c.team && b.c.pos.distanceTo(c.pos) < 30 && !b.aimDir) b.hear(c.pos);
    }
    const vol = isPlayer ? 1 : Math.max(0.1, 1 - c.pos.distanceTo(this.player.pos) / 60);
    (Sfx[def.sound] || Sfx.rifle)(vol);
    return true;
  }

  // All damage goes through here (bullets, bolts, explosions). Returns true if it counted.
  // info: { portal, head, segs (bullet path), from (explosion/projectile position), grenade, explosion }
  applyDamage(attacker, t, dmg, info = {}) {
    if (!t.alive) return false;
    if (t !== attacker && t.team === attacker.team) return false; // no friendly fire (you CAN hit yourself)
    if (this.mode.portalOnly && !info.portal) return false;        // Portal Only mode
    if (this.tutorial && t !== attacker) { this.tutorial.onHit(info); return true; } // target dummy
    if (this.net && t.remote) {
      // Someone else's character: their browser applies the damage. Grenades and rockets fly on
      // every screen, so each browser only handles its own characters for those.
      if (info.proj || info.explosion || !this.net.owns(attacker)) return false;
      this.net.send({ e: 'hit', a: attacker.netId, v: t.netId, d: dmg, head: !!info.head, portal: !!info.portal, segs: info.segs ? packSegs(info.segs) : null });
      if (attacker === this.player) this.showDamage(t, Math.min(dmg, t.hp), info, false);
      return true;
    }
    if (t === this.player) {
      // Point the hit arrow toward where the damage came from (through portals too).
      let d;
      if (info.segs) { const seg = info.segs[info.segs.length - 1]; d = seg.from.clone().sub(seg.to); }
      else if (info.from) d = info.from.clone().sub(t.pos);
      if (d) {
        const fx = -Math.sin(t.yaw) * d.x - Math.cos(t.yaw) * d.z;
        const rx = Math.cos(t.yaw) * d.x - Math.sin(t.yaw) * d.z;
        this.hud.hurt(Math.atan2(rx, fx));
      } else this.hud.hurt();
      this.shake = Math.min(1, this.shake + 0.6);
      Sfx.hurt();
    }
    const tb = t.isBot && this.bots.find(b => b.c === t);
    if (tb && t !== attacker) tb.hear(attacker.pos, true); // getting hit reveals where it came from
    if (attacker === this.player && t !== attacker && info.explosion) { this.hud.hit(false); Sfx.hit(); }
    t.lastHitHead = !!info.head;
    const hpBefore = t.hp;
    const killed = t.damage(dmg, attacker);
    if (attacker === this.player && t !== attacker) this.showDamage(t, Math.min(dmg, hpBefore), info, killed);
    if (killed) this.onKill(attacker, t, info);
    return true;
  }

  // Floating damage number where your shot landed (you only see your own).
  showDamage(t, amount, info, killed) {
    if (amount <= 0) return;
    const segs = info.segs;
    const at = segs && segs.length ? segs[segs.length - 1].to.clone() : t.pos.clone().setY(t.pos.y + 0.6);
    this.effects.damageNumber(t, amount, at, !!info.head, killed);
  }

  throwGrenade(c) {
    if (!c.alive || c.grenades <= 0 || c.grenadeCd > 0 || c.switchT > 0) return false;
    c.grenades--;
    c.grenadeCd = 0.8;
    const dir = c.lookDir();
    const vel = dir.clone().multiplyScalar(17).add(new THREE.Vector3(0, 3.5, 0)).addScaledVector(c.vel, 0.5);
    const at = c.eyePos().addScaledVector(dir, 0.6);
    this.projectiles.spawn('grenade', c, at, vel);
    if (this.net) this.net.send({ e: 'proj', n: c.netId, type: 'grenade', pos: arr(at), vel: arr(vel) });
    if (c === this.player) { Sfx.pin(); setTimeout(() => Sfx.throw(), 80); this.viewmodel.fire(0.6); }
    if (c === this.player && this.tutorial) this.tutorial.flags.grenade = true;
    return true;
  }

  setScope(on) {
    const p = this.player;
    on = on && p.alive && !!p.weapon.def.zoom && !p.weapon.reloading;
    if (on === this.scoped) return;
    this.scoped = on;
    this.camera.fov = on ? p.weapon.def.zoom : this.baseFov;
    this.camera.updateProjectionMatrix();
    this.viewmodel.hidden = on;
    this.hud.scope(on);
  }

  // info: { portal: shot went through a portal, head: headshot, segs: bullet path, grenade }
  onKill(killer, victim, info = {}) {
    const self = killer === victim;
    if (this.net && !info.fromNet && this.net.owns(victim)) {
      this.net.send({ e: 'kill', k: killer.netId, v: victim.netId, head: !!info.head, portal: !!info.portal, grenade: !!info.grenade, segs: info.segs ? packSegs(info.segs) : null });
    }
    this.hud.kill(killer, victim, self, info);
    if (!self) killer.kills++;
    victim.deaths = (victim.deaths || 0) + 1;
    if (killer === this.player && !self) {
      this.earned.kills++;
      if (info.head) this.earned.headshots++;
      if (info.grenade) this.earned.grenadeKills++;
      if (info.portal) { this.earned.portalKills++; this.hud.killPop(victim.name, 'PORTAL KILL!'); Sfx.portalKill(); }
      else { this.hud.killPop(victim.name, info.head ? 'HEADSHOT' : 'ELIMINATED'); Sfx.kill(); }
    }
    if (this.onKillHook) this.onKillHook(killer, victim, info);
    this.updateScore(); // kills/deaths show up straight away
    if (this.mode.respawn) victim.respawnT = victim === this.player ? 4.5 : 3;
    if (this.mode.gungame && !self && killer.alive && this.state === 'fight') {
      killer.gunLevel++;
      if (killer.gunLevel >= GUN_LADDER.length) { if (this.isAuthority) this.finish(killer.team); }
      else {
        this.setGunGameWeapon(killer);
        if (killer === this.player) { this.hud.toast(`Next gun: ${WEAPONS[GUN_LADDER[killer.gunLevel]].name}`, '#7cf'); Sfx.swap(); }
      }
    }
    const fx = killer === this.player && !self ? (this.save.killFx || 'sparks') : 'sparks';
    this.effects.killFx(fx, victim.pos.clone(), killer.portalColor);
    this.portals.removeOwner(victim);
    if (victim === this.player) {
      this.earned.deaths++;
      this.setScope(false);
      this.ads = false;
      this.deathCam = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone() };
      this.ghostMode = false; this.ghost.hide();
      if (!self && info.segs && killer.alive !== undefined) this.startKillcam(killer, info);
      else this.hud.centerText(self ? 'You shot yourself!' : `Eliminated by ${killer.name}`, 2000, '#f66');
    }
  }

  // Kill-cam: look from the killer's eyes along the shot that got you, with its path drawn.
  startKillcam(killer, info) {
    this.endKillcam();
    const pts = [];
    for (const s of info.segs) pts.push(s.from.clone(), s.to.clone());
    const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#ff3355', depthTest: false, transparent: true }));
    line.renderOrder = 20;
    this.scene.add(line);
    const from = info.segs[0].from.clone(), to = info.segs[0].to.clone();
    this.killcam = { t: 2.6, killer, line, from, dir: to.clone().sub(from).normalize() };
    this.hud.killcam(`KILLED BY ${killer.name}`, info.portal ? 'through a portal 🌀' : info.head ? 'headshot' : killer.weapon.def.name);
  }

  endKillcam() {
    if (!this.killcam) return;
    this.scene.remove(this.killcam.line);
    this.killcam.line.geometry.dispose(); this.killcam.line.material.dispose();
    this.killcam = null;
    this.hud.killcam(null);
  }

  reload(c) {
    if (c.weapon.startReload() && c === this.player) Sfx.reload();
  }

  heal(c) {
    if (c.tryHeal() && c === this.player) Sfx.heal();
  }

  placePortal(c, pose) {
    if (c.portalCd > 0 || !pose || !pose.valid) return false;
    this.portals.place(c, pose);
    c.portalCd = c.stats.portalCooldown;
    if (this.net) this.net.send({ e: 'portal', n: c.netId, pos: arr(pose.pos), normal: arr(pose.normal), up: arr(pose.up) });
    if (c === this.player) Sfx.portalPlace();
    return true;
  }

  // ---------- Player input ----------

  updatePlayer(dt, canAct) {
    const p = this.player, inp = this.input;
    if (!p.alive) return new THREE.Vector3();

    const sens = inp.sensitivity * ((this.scoped || this.ads) ? Math.min(1, this.camera.fov / this.baseFov) : 1);
    p.yaw -= inp.dx * sens;
    p.pitch = THREE.MathUtils.clamp(p.pitch - inp.dy * sens, -1.55, 1.55);

    const wish = new THREE.Vector3();
    if (canAct) {
      const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      if (inp.down('KeyW')) wish.add(fwd);
      if (inp.down('KeyS')) wish.sub(fwd);
      if (inp.down('KeyD')) wish.add(right);
      if (inp.down('KeyA')) wish.sub(right);
      if (wish.lengthSq() > 0) wish.normalize();
      if (inp.moveX || inp.moveY) {
        // Touch joystick (analog: a small push walks slowly).
        wish.addScaledVector(fwd, -inp.moveY).addScaledVector(right, inp.moveX);
        if (wish.lengthSq() > 1) wish.normalize();
      }

      if (inp.hit('Digit1') && p.switchTo(0)) { this.setScope(false); Sfx.swap(); }
      if (inp.hit('Digit2') && p.switchTo(1)) { this.setScope(false); Sfx.swap(); }
      if (inp.wheel && p.switchTo((p.slot + 1) % 2)) { this.setScope(false); Sfx.swap(); }
      if (inp.hit('KeyR')) { this.reload(p); this.setScope(false); }
      // Right mouse (held) aims with every gun. The sniper aims through its scope
      // (and comes back out while the bolt cycles after a shot).
      const wantAim = inp.rightDown || inp.touchAim;
      const canAim = !p.weapon.reloading && p.switchT <= 0;
      if (p.weapon.def.zoom) { this.setScope(wantAim && canAim && p.weapon.cooldown <= 0); this.ads = false; }
      else { this.setScope(false); this.ads = wantAim && canAim; }
      if (inp.hit('KeyF')) this.heal(p);
      if (inp.hit('KeyG')) this.throwGrenade(p);

      // Left click shoots. Right click aims guns that have a scope, and shoots with every other gun.
      const w = p.weapon;
      const held = inp.mouseDown;          // left click shoots
      const clicked = inp.mouseClicked;
      if (w.def.auto ? held : clicked) this.fire(p);

      // Portals: E shows the outline, E again places it. Q cancels.
      if (inp.hit('KeyQ') && this.ghostMode) { this.ghostMode = false; }
      if (inp.hit('KeyE')) {
        if (!this.ghostMode) { this.ghostMode = true; Sfx.portalGhost(); }
        else {
          const pose = this.portals.aimPose(p.eyePos(), p.lookDir(), p);
          if (this.placePortal(p, pose)) this.ghostMode = false;
          else Sfx.portalDeny();
        }
      }
    }
    if (this.ghostMode) {
      const pose = this.portals.aimPose(p.eyePos(), p.lookDir(), p);
      this.ghost.show(pose, p.portalColor, pose && pose.valid && p.portalCd <= 0);
    } else this.ghost.hide();
    return wish;
  }

  // ---------- Main update ----------

  update(dt) {
    if (this.state === 'outro') { this.updateOutro(dt); return; }
    if (this.state === 'done') return;
    const fighting = this.state === 'fight';
    const p = this.player;
    for (const c of this.chars) c.tick(dt);

    const wish = this.updatePlayer(dt, fighting);
    const inp = this.input;
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (inp.hit('Space')) this.jumpBuf = 0.15; // pressing jump just before landing still counts
    const jump = fighting && (this.jumpBuf > 0 || inp.down('Space'));
    const act = {
      crouch: fighting && inp.down('KeyC'), // not Ctrl: Ctrl+W would close the browser tab
      dash: fighting && (inp.hit('ShiftLeft') || inp.hit('ShiftRight')),
    };

    for (const b of this.bots) { if (fighting) b.update(dt); else { b.wish.set(0, 0, 0); b.jump = false; } }

    for (const c of this.chars) {
      if (c.remote) { this.net.updatePuppet(c, dt); continue; } // another player's character
      if (!c.alive) { if (c.body && c.mesh.visible) c.animate(dt); continue; } // death fall
      const brain = this.bots.find(b => b.c === c);
      const w = brain ? brain.wish : wish;
      const j = brain ? brain.jump && c.grounded : jump;
      const a = brain ? { crouch: brain.crouch, dash: brain.dash } : act;
      c.move(dt, w, j, a, this.world, this.portals.ignoredBoxes(c));
      if (c === p) {
        if (c.jumped) { this.jumpBuf = 0; Sfx.jump(); }
        if (c.landImpact > 6) Sfx.land(Math.min(1, c.landImpact / 18));
        if (c.dashed) { Sfx.dash(); this.fovKick = 10; }
        if (c.slid) Sfx.slide();
      }
      this.portals.checkTeleport(c);
      if (c.pos.y < this.world.killY) { c.damage(9999, c.lastAttacker || c); this.onKill(c.lastAttacker || c, c); }
    }

    for (const c of this.chars) {
      c.shadow.visible = c.alive;
      if (!c.alive) continue;
      const g = this.world.raycast(c.pos, new THREE.Vector3(0, -1, 0), 30);
      if (g) {
        c.shadow.position.set(c.pos.x, g.point.y + 0.02, c.pos.z);
        const k = Math.max(0.3, 1 - (g.t - c.halfHeight) / 6);
        c.shadow.scale.setScalar(k);
        c.shadow.material.opacity = k;
      } else c.shadow.visible = false;
    }

    // Burst rifle: keep firing the rest of a burst.
    for (const c of this.chars) {
      const w = c.weapon;
      if (c.alive && !c.remote && w.burstLeft > 0 && w.cooldown <= 0) this.fire(c, c.isBot ? 0.02 : 0, true);
    }
    this.projectiles.update(dt);
    this.portals.update(dt);
    this.effects.update(dt);
    this.updateCamera(dt);
    this.viewmodel.show(p.weapon.def.id);
    this.adsT += ((this.ads ? 1 : 0) - this.adsT) * Math.min(1, dt * 14);
    if (this.ads || this.input.mouseDown) this.aimHold = 1.2;
    this.aimHold = Math.max(0, (this.aimHold || 0) - dt);
    p.aiming = this.aimHold > 0; // your body (seen through portals) raises the gun, and keeps it up briefly
    this.hud.aiming(this.ads);
    this.viewmodel.update(dt, { ads: this.adsT, moving: p.grounded && wish.lengthSq() > 0, switching: p.switchT / SWITCH_TIME, reloading: p.weapon.reloading, lookX: inp.dx, lookY: inp.dy });
    this.hud.update(p, this.portals.ownerCount(p));
    // Crosshair opens up while moving, jumping and shooting.
    this.bloom = Math.max(0, this.bloom - dt * 3);
    const def = p.weapon.def;
    const mv = Math.hypot(p.vel.x, p.vel.z) > 1 ? 1.35 : 1;
    this.hud.setSpread((def.pellets ? 0.6 : 1) * (def.spread * mv * (p.grounded ? 1 : 1.7) * 500 + this.bloom * 10));

    if (this.net) this.net.tick(dt);
    this.stateT -= dt;
    if (this.state === 'countdown') {
      const n = Math.ceil(this.stateT);
      if (n !== this.lastBeep && n > 0) { this.lastBeep = n; this.hud.centerText(String(n)); Sfx.beep(false); }
      if (this.stateT <= 0) { this.state = 'fight'; this.hud.centerText('FIGHT!', 700, '#7cf'); Sfx.beep(true); }
    } else if (this.state === 'fight' && this.tutorial) {
      this.tutorial.update(dt);
      this.hud.setTimer(null);
    } else if (this.state === 'fight' && this.mode.respawn) {
      this.roundT -= dt;
      this.hud.setTimer(this.roundT);
      this.updateRespawnMode(dt);
    } else if (this.state === 'fight' && !this.isAuthority) {
      this.roundT -= dt;                 // online: the host decides when the round ends
      this.hud.setTimer(Math.max(0, this.roundT));
    } else if (this.state === 'fight') {
      this.roundT -= dt;
      this.hud.setTimer(this.roundT);
      const teamsAlive = new Set(this.chars.filter(c => c.alive).map(c => c.team));
      if (teamsAlive.size <= 1) this.endRound([...teamsAlive][0]);
      else if (this.roundT <= 0) {
        // Time up: the team with the most health left wins.
        const hp = {};
        for (const c of this.chars) if (c.alive) hp[c.team] = (hp[c.team] || 0) + c.hp / c.maxHp;
        const sorted = Object.entries(hp).sort((a, b) => b[1] - a[1]);
        this.endRound(sorted.length > 1 && sorted[0][1] - sorted[1][1] < 0.01 ? undefined : Number(sorted[0][0]), true);
      }
    } else if (this.state === 'roundEnd' && this.stateT <= 0 && this.isAuthority) {
      const champ = Object.keys(this.wins).find(t => this.wins[t] >= ROUNDS_TO_WIN);
      if (champ !== undefined) this.finish(Number(champ));
      else this.startRound();
    }
  }

  endRound(winnerTeam, timeUp = false) {
    if (this.net && this.isAuthority) this.net.send({ e: 'round', what: 'end', winner: winnerTeam ?? null, timeUp });
    this.hud.setTimer(null);
    this.state = 'roundEnd';
    this.stateT = ROUND_END_TIME;
    if (winnerTeam !== undefined) this.wins[winnerTeam]++;
    const won = winnerTeam === this.player.team;
    if (won) this.earned.rounds++;
    const name = this.mode.ffa && winnerTeam !== undefined ? this.chars.find(c => c.team === winnerTeam).name : null;
    const text = winnerTeam === undefined ? 'DRAW' : won ? 'ROUND WON' : name ? `${name} wins the round` : 'ROUND LOST';
    this.hud.centerText((timeUp ? "TIME'S UP · " : '') + text, 2500, won ? '#7f7' : winnerTeam === undefined ? '#fff' : '#f77');
    won ? Sfx.win() : Sfx.lose();
    this.updateScore();
  }

  finish(winnerTeam) {
    if (this.state === 'done' || this.state === 'outro') return;
    if (this.net && this.isAuthority) this.net.send({ e: 'finish', winner: winnerTeam ?? null });
    this.hud.setTimer(null);
    const won = winnerTeam === this.player.team;
    const diff = matchDifficulty(this.save);
    const e = this.earned;
    const coins = Math.round((20 + e.kills * 10 + e.portalKills * 15 + e.headshots * 3 + e.rounds * 20 + (won ? 100 : 0)) * diff.coins);
    this.startOutro(winnerTeam, { won, coins, kills: e.kills, rounds: e.rounds, earned: { ...e } });
  }

  // End of match: the winners line up and emote at the camera, then the results show.
  startOutro(team, res) {
    this.state = 'outro';
    this.outroT = 3;
    this.outroRes = res;
    this.endKillcam(); this.deathCam = null; this.hud.killcam(null);
    this.setScope(false); this.ads = false;
    this.portals.clear(); this.projectiles.clear(); this.ghost.hide();
    const winners = team === undefined ? [] : this.chars.filter(c => c.team === team);
    const anchor = (this.mode.ffa ? this.world.spawns.ffa[team] : this.world.spawns[team]?.[0]) || new THREE.Vector3();
    const yaw = Math.atan2(anchor.x, anchor.z); // facing the map centre
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const kinds = [0, 1, 2].sort(() => Math.random() - 0.5);
    winners.forEach((c, i) => {
      c.spawn(anchor.clone().addScaledVector(right, (i - (winners.length - 1) / 2) * 1.6), yaw);
      const em = (c.look && c.look.emote) || 'cheer';
      c.emote = { t: Math.random() * 0.3, kind: kinds[i % 3], clip: em !== 'cheer' ? 'emote_' + em : null };
    });
    for (const c of this.chars) if (!winners.includes(c)) { c.mesh.visible = false; c.shadow.visible = false; c.alive = false; c.corpseT = 0; }
    // Camera in front of them, pulled in if something is in the way.
    const head = anchor.clone().setY(anchor.y + 1.1);
    let dist = 4.2;
    const hit = this.world.raycast(head, fwd, dist + 0.3);
    if (hit) dist = Math.max(1.5, hit.t - 0.4);
    this.outroCam = { head, fwd, right, dist };
    this.camera.layers.enable(1); // show your own body
    this.camera.fov = 50; this.camera.updateProjectionMatrix();
    document.getElementById('hud').classList.add('outro');
    const name = team === undefined ? null : this.mode.ffa ? winners[0].name : res.won ? 'YOUR TEAM' : 'ENEMY TEAM';
    this.hud.centerText(team === undefined ? 'DRAW' : res.won ? 'VICTORY!' : `${name} WINS`, 4000, res.won ? '#7f7' : '#f77');
    res.won ? Sfx.win() : Sfx.lose();
  }

  updateOutro(dt) {
    this.outroT -= dt;
    for (const c of this.chars) { if (c.emote) { c.animate(dt); c.shadow.position.set(c.pos.x, c.pos.y - c.halfHeight + 0.03, c.pos.z); } }
    const o = this.outroCam, cam = this.camera;
    const sway = Math.sin((4.5 - this.outroT) * 0.6) * 0.35;
    const want = o.head.clone().addScaledVector(o.fwd, o.dist).addScaledVector(o.right, sway * 1.5).add(new THREE.Vector3(0, 0.3, 0));
    if (!o.placed) { cam.position.copy(want); o.placed = true; } // start in place (no swoop from wherever we were)
    else cam.position.lerp(want, Math.min(1, dt * 3));
    // Once the results panel is up (right side), frame the dancers on the left.
    o.shift = (o.shift || 0) + ((this.outroShown && innerWidth > 700 ? 1 : 0) - (o.shift || 0)) * Math.min(1, dt * 3);
    cam.lookAt(o.head.clone().addScaledVector(o.right, -1.7 * o.shift).add(new THREE.Vector3(0, -0.15 * o.shift, 0)));
    cam.updateMatrixWorld();
    // After a moment (or a click) the results appear; the winners keep dancing behind them
    // until you press Continue.
    if (!this.outroShown && (this.outroT <= 0 || (this.outroT < 3 && this.input.mouseClicked))) {
      this.outroShown = true;
      document.getElementById('hud').classList.remove('outro');
      this.hud.centerText('');
      this.onEnd(this.outroRes);
    }
  }

  updateCamera(dt = 0) {
    const cam = this.camera, p = this.player;
    if (p.alive) {
      // Smooth the eye height so crouching/sliding glides instead of snapping.
      const feet = p.pos.y - p.halfHeight;
      const eyeH = p.halfHeight + p.eyeOffset; // 1.6 standing, 0.95 crouched/sliding
      this.eyeSmooth += (eyeH - this.eyeSmooth) * Math.min(1, dt * 14);
      cam.position.set(p.pos.x, feet + this.eyeSmooth, p.pos.z);
      // Head bob, landing dip and a little shake when hit.
      const hs = Math.hypot(p.vel.x, p.vel.z);
      if (p.grounded && hs > 1) {
        const before = Math.floor(this.bobT / Math.PI);
        this.bobT += dt * hs * 1.5;
        if (Math.floor(this.bobT / Math.PI) !== before && p.slideT <= 0) Sfx.step(p.crouched ? 0.4 : 1); // footstep
      }
      const bob = p.grounded ? Math.sin(this.bobT) * 0.03 * Math.min(1, hs / 7) : 0;
      if (p.landImpact > 4) this.dipV -= Math.min(p.landImpact, 22) * 0.025;
      p.landImpact = 0;
      this.dipV += (-this.dip * 140 - this.dipV * 16) * dt;
      this.dip = THREE.MathUtils.clamp(this.dip + this.dipV * dt, -0.35, 0.1);
      cam.position.y += bob + this.dip;
      this.shake = Math.max(0, this.shake - dt * 3);
      const sh = this.shake * 0.015;
      const tilt = p.slideT > 0 ? 0.05 : 0; // slight camera roll while sliding
      this.roll = (this.roll || 0) + (tilt - (this.roll || 0)) * Math.min(1, dt * 10);
      cam.rotation.set(p.pitch + (Math.random() - 0.5) * sh, p.yaw + (Math.random() - 0.5) * sh, this.roll + Math.sin(this.bobT * 0.5) * 0.004 * Math.min(1, hs / 7), 'YXZ');
      if (!this.scoped) {
        // Field of view widens with speed (and kicks on a dash).
        this.fovKick = Math.max(0, this.fovKick - dt * 30);
        const target = this.ads ? (p.weapon.def.adsFov || this.baseFov * 0.75)
          : this.baseFov + THREE.MathUtils.clamp((hs - 7) * 0.9, 0, 12) + this.fovKick;
        if (Math.abs(cam.fov - target) > 0.01) {
          cam.fov += (target - cam.fov) * Math.min(1, dt * (this.ads ? 14 : 8));
          cam.updateProjectionMatrix();
        }
      }
    } else if (this.killcam && this.killcam.t > 0) {
      const k = this.killcam;
      k.t -= dt;
      // Just behind and above the killer's eyes, looking along their shot.
      const eye = k.killer.alive ? k.killer.eyePos() : k.from.clone();
      const back = eye.clone().addScaledVector(k.dir, -1.6).add(new THREE.Vector3(0, 0.45, 0));
      cam.position.lerp(back, Math.min(1, dt * 8));
      cam.lookAt(eye.clone().addScaledVector(k.dir, 6));
      if (cam.fov !== this.baseFov) { cam.fov = this.baseFov; cam.updateProjectionMatrix(); }
      if (k.t <= 0) this.endKillcam();
    } else if (this.deathCam) {
      const dc = this.deathCam;
      dc.t = (dc.t || 0) + dt;
      // After a moment, spectate a living teammate (or anyone still alive). Click / FIRE switches.
      const mates = this.chars.filter(c => c.alive && c !== p && c.team === p.team);
      const pool = mates.length ? mates : this.chars.filter(c => c.alive && c !== p);
      if (dc.t > 1.2 && pool.length && this.state !== 'done') {
        let i = pool.indexOf(dc.spec);
        if (i < 0 || this.input.mouseClicked || this.input.pressed.has('Space')) {
          dc.spec = pool[(i + 1) % pool.length];
          dc.snap = i < 0;
          this.hud.killcam(dc.spec.name, pool.length > 1 ? 'click to switch player' : (dc.spec.team === p.team ? 'teammate' : ''), 'SPECTATING');
        }
        this.followCam(dc.spec, dt, dc.snap);
        dc.snap = false;
      } else {
        // Float up and look down at where you died.
        if (dc.spec) { dc.spec = null; this.hud.killcam(null); }
        cam.position.lerp(dc.pos.clone().add(new THREE.Vector3(0, 6, 0)), 0.02);
        cam.lookAt(dc.pos);
      }
    }
    cam.updateMatrixWorld();
  }

  // ---------- Online ----------

  netEvent(msg) {
    const B = this.byNet, c = B[msg.n];
    switch (msg.e) {
      case 'fire': if (c) this.remoteFire(c, msg); break;
      case 'hit': {
        const a = B[msg.a], v = B[msg.v];
        if (a && v && this.net.owns(v)) this.applyDamage(a, v, msg.d, { head: msg.head, portal: msg.portal, segs: msg.segs ? unpackSegs(msg.segs) : null, from: a.pos.clone() });
        break;
      }
      case 'kill': {
        const k = B[msg.k], v = B[msg.v];
        if (!k || !v || this.state === 'outro' || this.state === 'done') break;
        if (v.alive) { v.lastHitHead = !!msg.head; v.damage(v.hp + 9999, k); }
        if (v.remote) this.net.died(v);
        this.onKill(k, v, { head: msg.head, portal: msg.portal, grenade: msg.grenade, segs: msg.segs ? unpackSegs(msg.segs) : null, fromNet: true });
        break;
      }
      case 'portal': if (c) this.remotePortal(c, msg); break;
      case 'proj': if (c) this.projectiles.spawn(msg.type, c, v3(msg.pos), v3(msg.vel)); break;
      case 'round':
        if (msg.what === 'start') { if (this.state !== 'outro' && this.state !== 'done') this.startRound(); }
        else this.endRound(msg.winner ?? undefined, msg.timeUp);
        break;
      case 'finish': this.finish(msg.winner ?? undefined); break;
      case 'score': this.scores = msg.scores; break;
      case 'ctf': if (this.flags) this.applyFlags(msg); break;
      case 'takeover': this.replaceChar(msg.entry); break;
    }
  }

  // Another player shot: draw the tracers and play the sound (the shooter decides the hits).
  remoteFire(c, msg) {
    for (const s of msg.segs || []) this.effects.tracer(unpackSegs(s), c.portalColor);
    for (const h of msg.hits || []) this.effects.spark(v3(h));
    const vol = Math.max(0.1, 1 - c.pos.distanceTo(this.player.pos) / 60);
    (Sfx[c.weapon.def.sound] || Sfx.rifle)(vol);
    for (const b of this.bots) if (b.c.team !== c.team && b.c.pos.distanceTo(c.pos) < 30 && !b.aimDir) b.hear(c.pos);
  }

  remotePortal(c, msg) {
    const pos = v3(msg.pos), normal = v3(msg.normal), up = v3(msg.up);
    const hit = this.world.raycast(pos.clone().addScaledVector(normal, 0.6), normal.clone().negate(), 1.6) || { box: null };
    // Which boxes it sits on (may be several on 3D-model maps).
    const right = new THREE.Vector3().crossVectors(up, normal);
    const boxes = this.portals.hostsFor(pos, normal, up, right);
    this.portals.place(c, { pos, normal, up, box: hit.box, boxes: boxes.length ? boxes : [hit.box], valid: true });
  }

  // The host left (or the connection dropped).
  netClosed(why) {
    if (this.state === 'done') return;
    this.state = 'done';
    this.hud.centerText(why || 'Connection lost', 3000, '#f77');
    setTimeout(() => this.onEnd({ aborted: true, reason: why }), 1500);
  }

  // Third-person camera over a character's shoulder, pulled in if a wall is behind them.
  followCam(c, dt, snap = false) {
    const cam = this.camera;
    const eye = c.eyePos();
    const fwd = new THREE.Vector3(-Math.sin(c.yaw) * Math.cos(c.pitch * 0.6), Math.sin(c.pitch * 0.6), -Math.cos(c.yaw) * Math.cos(c.pitch * 0.6));
    const back = fwd.clone().negate().add(new THREE.Vector3(0, 0.35, 0)).normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();
    const origin = eye.clone().addScaledVector(right, 0.45);
    let dist = 3;
    const hit = this.world.raycast(origin, back, dist + 0.3);
    if (hit) dist = Math.max(0.4, hit.t - 0.3);
    const want = origin.clone().addScaledVector(back, dist);
    if (snap) cam.position.copy(want); else cam.position.lerp(want, Math.min(1, dt * 10));
    cam.lookAt(eye.clone().addScaledVector(fwd, 8));
    if (cam.fov !== this.baseFov) { cam.fov = this.baseFov; cam.updateProjectionMatrix(); }
  }

  render() {
    this.portals.renderViews(this.camera);
    this.renderer.render(this.scene, this.camera);
    if (this.player.alive && this.state !== 'outro' && this.state !== 'done') {
      this.renderer.autoClear = false;
      this.viewmodel.render(this.renderer);
      this.renderer.autoClear = true;
    }
  }

  dispose() {
    if (this.net) this.net.dispose();
    if (this.tutorial) this.tutorial.dispose();
    if (this.hillMesh) this.scene.remove(this.hillMesh);
    if (this.flags) for (const f of this.flags) this.scene.remove(f.mesh, f.ring);
    this.endKillcam();
    this.camera.layers.disable(1);
    this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix();
    document.getElementById('hud').classList.remove('outro');
    this.projectiles.clear();
    this.setScope(false);
    this.portals.clear();
    this.effects.clear();
    this.portals.onEvent = () => {};
    this.scene.remove(this.ghost.mesh);
    for (const c of this.chars) { this.scene.remove(c.mesh); this.scene.remove(c.shadow); }
  }
}
