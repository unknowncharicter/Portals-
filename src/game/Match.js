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

export const DIFFICULTIES = {
  easy:   { label: 'Easy',   skill: 0.25, coins: 0.75, botDamage: 0.55, guns: ['ar', 'smg', 'shotgun', 'burst'] },
  normal: { label: 'Normal', skill: 0.5,  coins: 1,    botDamage: 0.75, guns: ['ar', 'ar', 'smg', 'shotgun', 'burst'] },
  hard:   { label: 'Hard',   skill: 0.85, coins: 1.5,  botDamage: 0.95, guns: ['ar', 'ar', 'smg', 'shotgun', 'sniper', 'burst', 'crossbow'] },
};
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
const TEAM_COLORS = ['#3a6fd8', '#d84a4a'];
const FFA_COLORS = ['#3a6fd8', '#d84a4a', '#3ab060', '#d8a030'];
const BOT_NAMES = ['Vex', 'Nova', 'Bolt', 'Kira', 'Rook', 'Zed'];

export const MODES = {
  '1v1': { label: '1v1', teams: [[0], [1]], desc: 'Duel one bot. Last one standing wins the round. First to 3 rounds.' },
  '2v2': { label: '2v2', teams: [[0, 1], [2, 3]], desc: 'You and a bot teammate vs two bots. First to 3 rounds.' },
  'ffa': { label: 'Free for all', ffa: true, count: 4, desc: 'Everyone for themselves. Last one standing wins the round.' },
  'koth': { label: 'King of the Hill', teams: [[0, 1], [2, 3]], respawn: true, koth: true, target: 100, time: 240,
    desc: '2v2 with respawns. Stand in the glowing zone to score. First team to 100 wins.' },
  'gungame': { label: 'Gun Game', ffa: true, count: 4, respawn: true, gungame: true, time: 300,
    desc: 'Free for all with respawns. Every kill gives you the next gun. Get a kill with the last one to win.' },
  'tutorial': { label: 'Tutorial', teams: [[0], [1]], tutorial: true, hidden: true },
  'portalonly': { label: 'Portal Only', teams: [[0], [1]], portalOnly: true,
    desc: 'Damage only counts if the shot went through a portal. Bounce your shots! First to 3 rounds.' },
};
export const GUN_LADDER = ['smg', 'shotgun', 'burst', 'ar', 'crossbow', 'sniper', 'revolver', 'pistol'];

export class Match {
  constructor(ctx, modeId, save, onEnd) {
    Object.assign(this, ctx); // scene, renderer, camera, world, portals, effects, viewmodel, input, hud
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
    this.earned = { kills: 0, rounds: 0, portalKills: 0, headshots: 0, shots: 0, hits: 0, deaths: 0, grenadeKills: 0 };
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
        if (brain) brain.flank = null;
      }
    };
    this.setup();
    this.startRound();
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

  setup() {
    const botColors = COLORS.filter(c => c !== this.save.color);
    const diff = DIFFICULTIES[this.save.difficulty] || DIFFICULTIES.normal;
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
      this.chars.push(c);
      this.scene.add(c.mesh);
      c.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
      c.shadow.rotation.x = -Math.PI / 2;
      this.scene.add(c.shadow);
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
    this.player.setBodyLayer(1); // visible only through portals, not to the first-person camera
    if (this.mode.gungame) for (const c of this.chars) { c.gunLevel = 0; this.setGunGameWeapon(c); }
    if (this.mode.koth) this.setupHill();
    this.viewmodel.setSkin(this.player.skin, this.player.portalColor);
    for (const c of this.chars) this.wins[c.team] = 0;
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
    if (c === this.player) { this.endKillcam(); this.deathCam = null; this.hud.centerText(''); }
  }

  setGunGameWeapon(c) {
    const def = WEAPONS[GUN_LADDER[Math.min(c.gunLevel, GUN_LADDER.length - 1)]];
    c.weapons = [new WeaponState(def, c.stats)];
    c.slot = 0; c.gunId = null; c.updateGun();
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
      if (c.alive) continue;
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
      if (holder !== null) {
        this.scores[holder] += dt * 2;
        if (this.scores[holder] >= this.mode.target) return this.finish(holder);
      }
      this.hillText = teams.size > 1 ? 'CONTESTED' : holder === null ? 'EMPTY' : holder === p.team ? 'YOURS' : 'ENEMY';
    }
    this.updateScore();
    if (this.roundT <= 0) {
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
    if (this.mode.koth) {
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
    if (def.projectile) {
      // Rockets and crossbow bolts fly (and go through portals).
      const dir = c.lookDir();
      const start = origin.clone().addScaledVector(dir, 0.5);
      this.projectiles.spawn(def.projectile, c, start, dir.multiplyScalar(def.speed));
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

        const hit = tr.hit;
        if (!hit) continue;
        if (hit.type === 'world') {
          if (i < 3) this.effects.spark(hit.point);
          if (i === 0 && hit.point.distanceTo(this.player.pos) < 25) Sfx.impact(isPlayer ? 1 : 0.6);
          continue;
        }
        const t = hit.character;
        const dmg = w.damage * (hit.head ? def.headMult : 1);
        if (this.applyDamage(c, t, dmg, { portal: tr.segments.length > 1, head: hit.head, segs: tr.segments })) {
          this.effects.spark(hit.point, '#ff4040');
          if (t !== c) { anyHit = true; anyHead = anyHead || hit.head; }
        }
      }
    }
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
    if (t.damage(dmg, attacker)) this.onKill(attacker, t, info);
    return true;
  }

  throwGrenade(c) {
    if (!c.alive || c.grenades <= 0 || c.grenadeCd > 0 || c.switchT > 0) return false;
    c.grenades--;
    c.grenadeCd = 0.8;
    const dir = c.lookDir();
    const vel = dir.clone().multiplyScalar(17).add(new THREE.Vector3(0, 3.5, 0)).addScaledVector(c.vel, 0.5);
    this.projectiles.spawn('grenade', c, c.eyePos().addScaledVector(dir, 0.6), vel);
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
      if (killer.gunLevel >= GUN_LADDER.length) { this.finish(killer.team); }
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
      if (c.alive && w.burstLeft > 0 && w.cooldown <= 0) this.fire(c, c.isBot ? 0.02 : 0, true);
    }
    this.projectiles.update(dt);
    this.portals.update(dt);
    this.effects.update(dt);
    this.updateCamera(dt);
    this.viewmodel.show(p.weapon.def.id);
    this.adsT += ((this.ads ? 1 : 0) - this.adsT) * Math.min(1, dt * 14);
    this.hud.aiming(this.ads);
    this.viewmodel.update(dt, { ads: this.adsT, moving: p.grounded && wish.lengthSq() > 0, switching: p.switchT / SWITCH_TIME, reloading: p.weapon.reloading, lookX: inp.dx, lookY: inp.dy });
    this.hud.update(p, this.portals.ownerCount(p));
    // Crosshair opens up while moving, jumping and shooting.
    this.bloom = Math.max(0, this.bloom - dt * 3);
    const def = p.weapon.def;
    const mv = Math.hypot(p.vel.x, p.vel.z) > 1 ? 1.35 : 1;
    this.hud.setSpread((def.pellets ? 0.6 : 1) * (def.spread * mv * (p.grounded ? 1 : 1.7) * 500 + this.bloom * 10));

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
    } else if (this.state === 'roundEnd' && this.stateT <= 0) {
      const champ = Object.keys(this.wins).find(t => this.wins[t] >= ROUNDS_TO_WIN);
      if (champ !== undefined) this.finish(Number(champ));
      else this.startRound();
    }
  }

  endRound(winnerTeam, timeUp = false) {
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
    if (this.state === 'done') return;
    this.state = 'done';
    this.hud.setTimer(null);
    const won = winnerTeam === this.player.team;
    const diff = DIFFICULTIES[this.save.difficulty] || DIFFICULTIES.normal;
    const e = this.earned;
    const coins = Math.round((20 + e.kills * 10 + e.portalKills * 15 + e.headshots * 3 + e.rounds * 20 + (won ? 100 : 0)) * diff.coins);
    this.onEnd({ won, coins, kills: e.kills, rounds: e.rounds, earned: { ...e } });
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
      // Float up and look down at where you died.
      cam.position.lerp(this.deathCam.pos.clone().add(new THREE.Vector3(0, 6, 0)), 0.02);
      cam.lookAt(this.deathCam.pos);
    }
    cam.updateMatrixWorld();
  }

  render() {
    this.portals.renderViews(this.camera);
    this.renderer.render(this.scene, this.camera);
    if (this.player.alive) {
      this.renderer.autoClear = false;
      this.viewmodel.render(this.renderer);
      this.renderer.autoClear = true;
    }
  }

  dispose() {
    if (this.tutorial) this.tutorial.dispose();
    if (this.hillMesh) this.scene.remove(this.hillMesh);
    this.endKillcam();
    this.projectiles.clear();
    this.setScope(false);
    this.portals.clear();
    this.effects.clear();
    this.portals.onEvent = () => {};
    this.scene.remove(this.ghost.mesh);
    for (const c of this.chars) { this.scene.remove(c.mesh); this.scene.remove(c.shadow); }
  }
}
