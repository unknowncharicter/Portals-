import * as THREE from 'three';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/700.css';
import '@fontsource/russo-one/400.css';
import { thumbs, makeGunThumbs, makeMapThumbs } from './ui/thumbs.js';
import { World } from './game/World.js';
import { PortalSystem } from './game/Portals.js';
import { Effects } from './game/Effects.js';
import { Viewmodel } from './game/Viewmodel.js';
import { Match, MODES, DIFFICULTIES, matchDifficulty, TEAM_COLORS, FFA_COLORS, BOT_NAMES } from './game/Match.js';
import { Room } from './net/Room.js';
import { submitScore, fetchBoard, myTag } from './leaderboard.js';
import { buildCharacterMesh, SHIRTS, PANTS, SKINS, HATS, FACES, BACKS, BODIES, EMOTES, cleanName, randomLook } from './game/Look.js';
import { Hud } from './ui/Hud.js';
import { Input } from './input.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { MAPS, MAP_IDS, PROPS } from './game/maps.js';
import { Sfx, setVolume, setMusicVolume, setMuted, Music } from './audio.js';
import { SDK, initSDK, setAdAudioHooks } from './sdk.js';
import { loadModels, gunModel, mapModel } from './game/Models.js';
import { WEAPONS, PRIMARIES, SECONDARIES } from './game/Weapons.js';
import { loadSave, writeSave, UPGRADES, COLORS, upgradeCost, lvl } from './save.js';
import { levelInfo, GUN_SKINS, KILL_FX, owns, dailyReward, claimDailyReward, dailyChallenges, applyMatch, applyRanked, rankInfo, weeklyChallenges, weeklySkin, daysLeftInWeek } from './progress.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');

// ---------- Renderer & shared objects ----------
// Ask for a stencil buffer too: without one, some Windows graphics drivers hand out a
// 16-bit depth buffer, and then walls and boxes flicker through each other. With it they
// give the normal 24-bit depth buffer. If depth is still low, use a logarithmic depth buffer.
const GL_OPTS = { antialias: true, depth: true, stencil: true, powerPreference: 'high-performance' };
function depthBits() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', GL_OPTS) || c.getContext('webgl', GL_OPTS);
    if (!gl) return 24;
    const bits = gl.getParameter(gl.DEPTH_BITS);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return bits || 24;
  } catch (e) { return 24; }
}
const PARAMS = new URLSearchParams(location.search);
const LOW_DEPTH = PARAMS.has('logdepth') || depthBits() < 24;
const renderer = new THREE.WebGLRenderer({ canvas, ...GL_OPTS, logarithmicDepthBuffer: LOW_DEPTH });

// ?debug shows graphics info (useful if something looks wrong on a computer).
if (PARAMS.has('debug')) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99;background:rgba(0,0,0,.7);color:#0f0;font:12px monospace;padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre';
  document.body.appendChild(box);
  let frames = 0, last = performance.now(), fps = 0;
  (function tick() {
    frames++;
    const now = performance.now();
    if (now - last > 500) { fps = Math.round(frames * 1000 / (now - last)); frames = 0; last = now; }
    box.textContent = `GPU: ${gpu}\nDepth bits: ${gl.getParameter(gl.DEPTH_BITS)}  Stencil bits: ${gl.getParameter(gl.STENCIL_BITS)}\nLog depth: ${LOW_DEPTH}  FPS: ${fps}`;
    requestAnimationFrame(tick);
  })();
}

let touchMode = isTouchDevice();
document.body.classList.toggle('touch', touchMode);
// Phones: render at a lower resolution so it stays smooth.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, touchMode ? 1 : 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
// Near plane 8 cm (not 3 cm): ~3x more depth precision, so surfaces don't flicker through each other.
const camera = new THREE.PerspectiveCamera(75, 1, 0.08, 300);
camera.layers.set(0);
camera.layers.enable(3);

const world = new World(scene);
const portals = new PortalSystem(scene, world, renderer);
const effects = new Effects(scene);
const viewmodel = new Viewmodel();
const hud = new Hud();
const input = new Input(canvas);
portals.lowQuality = touchMode;
const touch = new TouchControls(input, { onPause: () => pause() });

let save = loadSave();
let match = null;
let state = 'menu'; // menu | lobby | playing | paused | results

// ---------- Settings ----------
const SETTINGS = [
  { id: 'sens',   label: 'Mouse speed', min: 0.2, max: 3,   step: 0.05, fmt: v => v.toFixed(2) },
  { id: 'fov',    label: 'Field of view', min: 60, max: 110, step: 1,   fmt: v => String(v) },
  { id: 'volume', label: 'Sound',       min: 0,   max: 1,   step: 0.05, fmt: v => Math.round(v * 100) + '%' },
  { id: 'music',  label: 'Music',       min: 0,   max: 1,   step: 0.05, fmt: v => Math.round(v * 100) + '%' },
];

function applySettings() {
  const st = save.settings;
  input.sensitivity = 0.0022 * st.sens;
  setVolume(st.volume);
  setMusicVolume(st.music ?? 0.5);
  camera.fov = st.fov;
  if (match) { match.baseFov = st.fov; if (match.scoped) camera.fov = match.player.weapon.def.zoom; }
  camera.updateProjectionMatrix();
}

function buildSettings() {
  for (const box of document.querySelectorAll('[data-settings]')) {
    box.innerHTML = '';
    for (const def of SETTINGS) {
      const row = document.createElement('label');
      const v = save.settings[def.id];
      row.innerHTML = `<span>${def.label}</span><input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${v}"><b>${def.fmt(v)}</b>`;
      const inp = row.querySelector('input'), out = row.querySelector('b');
      inp.oninput = () => {
        save.settings[def.id] = Number(inp.value);
        out.textContent = def.fmt(Number(inp.value));
        applySettings();
        writeSave(save);
      };
      box.appendChild(row);
    }
  }
}

// ---------- Character preview (lobby) ----------
const previewCanvas = $('preview');
const previewRenderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true, alpha: true });
previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
const previewScene = new THREE.Scene();
previewScene.add(new THREE.HemisphereLight('#ffffff', '#445', 2.2));
const pl = new THREE.DirectionalLight('#ffffff', 1.8); pl.position.set(2, 3, 3); previewScene.add(pl);
const rim = new THREE.DirectionalLight('#9fc8ff', 2.2); rim.position.set(-2, 2.5, -3); previewScene.add(rim); // backlight so dark guns still read
const previewCam = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
previewCam.position.set(0, 0.25, 5.4);
previewCam.lookAt(0, 0.05, 0);
let previewChar = null, previewParts = null;
// Drag the character to spin it.
const previewDrag = { active: false, x: 0, yaw: Math.PI, last: 0 };
previewCanvas.style.pointerEvents = 'auto';
previewCanvas.style.cursor = 'grab';
previewCanvas.addEventListener('pointerdown', (e) => { previewDrag.active = true; previewDrag.x = e.clientX; previewCanvas.setPointerCapture?.(e.pointerId); });
previewCanvas.addEventListener('pointermove', (e) => {
  if (!previewDrag.active) return;
  previewDrag.yaw += (e.clientX - previewDrag.x) * 0.012; previewDrag.x = e.clientX; previewDrag.last = performance.now();
});
const endDrag = () => { previewDrag.active = false; previewDrag.last = performance.now(); };
previewCanvas.addEventListener('pointerup', endDrag);
previewCanvas.addEventListener('pointercancel', endDrag);
const previewState = { vel: new THREE.Vector3(), yaw: 0, pitch: 0, grounded: true, crouched: false, sliding: false };

function rebuildPreview() {
  const keepYaw = previewChar ? previewChar.rotation.y : Math.PI; // start facing the camera
  if (previewChar) previewScene.remove(previewChar);
  const parts = buildCharacterMesh(save.look, { visor: save.color, tag: false });
  const gun = gunModel(save.loadout.primary);
  if (gun) parts.gunHolder.add(gun);
  previewChar = parts.group;
  previewChar.rotation.y = keepYaw;
  previewParts = parts;
  previewScene.add(previewChar);
}

let previewDance = null;
function renderPreview(dt) {
  if (!previewChar) return;
  const w = previewCanvas.clientWidth, h = previewCanvas.clientHeight;
  if (!w || !h) return;
  if (previewCanvas.width !== Math.floor(w * previewRenderer.getPixelRatio())) {
    previewRenderer.setSize(w, h, false);
    previewCam.aspect = w / h;
    previewCam.updateProjectionMatrix();
  }
  if (!previewDrag.active && performance.now() - previewDrag.last > 1500) previewChar.rotation.y += dt * 0.6;
  else previewChar.rotation.y = previewDrag.yaw;
  previewDrag.yaw = previewChar.rotation.y;
  if (previewParts.body && previewDance && performance.now() < previewDance.until) {
    // Just picked an emote: show it for a few seconds.
    previewDance.t += dt;
    previewChar.updateMatrixWorld(true);
    previewParts.gunHolder.visible = !previewDance.clip;
    if (previewDance.clip && previewParts.body.actions[previewDance.clip]) previewParts.body.dance(dt, previewDance.clip);
    else { previewParts.body.emote(dt, previewDance.t, 0); previewParts.body.handIn(previewChar, previewParts.gunHolder.position); }
  } else if (previewParts.body) {
    if (previewDance) { previewDance = null; previewParts.body.reset(); previewParts.gunHolder.visible = true; }
    previewChar.updateMatrixWorld(true);
    previewParts.body.update(dt, previewState);
    previewParts.body.handIn(previewChar, previewParts.gunHolder.position);
  }
  previewRenderer.render(previewScene, previewCam);
}

function buildCharacterPanel() {
  const L = save.look;
  const nameInput = $('name-input');
  nameInput.value = L.name;
  nameInput.onchange = () => { L.name = cleanName(nameInput.value); nameInput.value = L.name; writeSave(save); };
  nameInput.onkeydown = (e) => e.stopPropagation();

  for (const [key, list] of [['shirt', SHIRTS], ['pants', PANTS], ['skin', SKINS]]) {
    const box = $('sw-' + key);
    box.innerHTML = '';
    for (const c of list) {
      const b = document.createElement('button');
      b.style.background = c;
      if (L[key] === c) b.classList.add('sel');
      b.onclick = () => { L[key] = c; writeSave(save); buildLobby(); };
      box.appendChild(b);
    }
  }

  // Accessory shops: hats, face and back. Free items are always owned.
  const HAT_ICONS = { none: '🚫', cap: '🧢', beanie: '🧶', helmet: '⛑️', headphones: '🎧', tophat: '🎩', horns: '😈', crown: '👑' };
  const slots = [
    ['bodies', 'model', BODIES],
    ['hats', 'hat', HATS.map(h => ({ ...h, icon: HAT_ICONS[h.id] || '🎩' }))],
    ['faces', 'face', FACES],
    ['backs', 'back', BACKS],
    ['emotes', 'emote', EMOTES],
  ];
  for (const [elId, key, list] of slots) {
    const grid = $(elId);
    grid.innerHTML = '';
    for (const item of list) {
      const owned = !item.price || save.owned.includes(item.id);
      const equipped = (L[key] || list[0].id) === item.id;
      const b = document.createElement('button');
      b.className = 'acc' + (equipped ? ' sel' : '') + (owned ? '' : ' locked');
      b.innerHTML = `<span class="ai">${item.icon}</span><span class="an">${item.name}</span><span class="ap">${equipped ? 'Equipped' : owned ? 'Equip' : '🪙 ' + item.price}</span>`;
      if (!owned && save.coins < item.price) b.classList.add('poor');
      b.onclick = () => {
        if (!owned) {
          if (save.coins < item.price) { Sfx.portalDeny(); return; }
          save.coins -= item.price;
          save.owned.push(item.id);
          Sfx.coin();
        } else Sfx.click();
        L[key] = item.id;
        writeSave(save);
        buildLobby();
        if (key === 'emote') previewDance = { clip: item.id === 'cheer' ? null : 'emote_' + item.id, until: performance.now() + 6000, t: 0 };
      };
      grid.appendChild(b);
    }
  }
  rebuildPreview();
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  viewmodel.setAspect(w / h);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  portals.setSize(size.x, size.y);
}
addEventListener('resize', resize);
resize();

// ---------- Screens ----------
function showScreen(id) {
  for (const s of ['menu', 'lobby', 'pause', 'results']) $(s).classList.toggle('hidden', s !== id);
  hud.show(id === null);
  document.body.classList.toggle('playing', id === null);
  touch.show(touchMode && id === null);
  if (id !== null) $('lockprompt').classList.add('hidden');
}

function buildLobby() {
  $('coin-count').textContent = save.coins;

  const up = $('upgrades');
  up.innerHTML = '';
  for (const u of UPGRADES) {
    const L = lvl(save, u.id);
    const row = document.createElement('div');
    row.className = 'upg';
    const pips = Array.from({ length: u.max }, (_, i) => `<i class="${i < L ? 'on' : ''}"></i>`).join('');
    const maxed = L >= u.max;
    const cost = upgradeCost(L);
    row.innerHTML = `<div class="name">${u.name}<br><small style="opacity:.6">${u.desc}</small></div><div class="lvl">${pips}</div>`;
    const b = document.createElement('button');
    b.textContent = maxed ? 'MAX' : `🪙 ${cost}`;
    b.disabled = maxed || save.coins < cost;
    b.onclick = () => {
      save.coins -= cost;
      save.upgrades[u.id] = L + 1;
      writeSave(save);
      Sfx.portalPlace();
      buildLobby();
    };
    row.appendChild(b);
    up.appendChild(row);
  }

  const cols = $('colors');
  cols.innerHTML = '';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.style.background = c;
    if (c === save.color) b.classList.add('sel');
    b.onclick = () => { save.color = c; writeSave(save); buildLobby(); };
    cols.appendChild(b);
  }

  // Loadout: gun cards with pictures.
  const lo = $('loadout');
  lo.innerHTML = '';
  for (const [slot, list] of [['primary', PRIMARIES], ['secondary', SECONDARIES]]) {
    const row = document.createElement('div');
    row.className = 'row';
    for (const id of list) {
      const b = card(WEAPONS[id].name, save.loadout[slot] === id, () => { save.loadout[slot] = id; writeSave(save); rebuildPreview(); buildLobby(); });
      if (thumbs.guns[id]) { const img = document.createElement('img'); img.src = thumbs.guns[id]; img.alt = ''; b.prepend(img); }
      else b.prepend(icon('🔫'));
      row.appendChild(b);
    }
    lo.appendChild(row);
  }

  // Maps: picture cards.
  const mapsEl = $('maps');
  mapsEl.innerHTML = '';
  for (const id of [...MAP_IDS, 'random']) {
    const b = card(id === 'random' ? 'Random' : MAPS[id].name, id === (save.map || 'arena'), () => {
      save.map = id; writeSave(save);
      if (id !== 'random') world.load(id);
      buildLobby();
    });
    const t = document.createElement('div');
    t.className = 'thumb';
    if (id === 'random') { t.style.background = 'linear-gradient(135deg,#36b5ff,#b65cff,#ff5cc8)'; t.textContent = ''; b.appendChild(icon('🎲')); }
    else t.style.background = thumbs.maps[id] ? `url(${thumbs.maps[id]}) center / cover` : MAPS[id].theme.sky;
    b.prepend(t);
    mapsEl.appendChild(b);
  }

  // Difficulty: segmented control.
  const diff = $('difficulty');
  diff.innerHTML = '';
  for (const [id, d] of Object.entries({ ranked: { label: '🏆 Ranked' }, ...DIFFICULTIES })) {
    const b = document.createElement('button');
    b.textContent = d.label;
    if (id === 'ranked') b.title = 'Bots match your rank. Win to climb, lose to drop.';
    if (id === (save.difficulty || 'normal')) b.classList.add('sel');
    b.onclick = () => { save.difficulty = id; writeSave(save); Sfx.click(); buildLobby(); };
    diff.appendChild(b);
  }

  buildCharacterPanel();
  buildTabs();
  buildLevel();
  buildShop();
  buildDaily();
  buildOnline();
  buildStats();

  // Modes: icon cards.
  if (!MODES[save.mode] || MODES[save.mode].hidden) save.mode = '1v1';
  const MODE_ICONS = { '1v1': '⚔️', '2v2': '👥', ffa: '💥', koth: '👑', ctf: '🚩', gungame: '🔫', portalonly: '🌀' };
  const modes = $('modes');
  modes.innerHTML = '';
  for (const [id, m] of Object.entries(MODES)) {
    if (m.hidden) continue;
    const b = card(m.label, id === save.mode, () => { save.mode = id; writeSave(save); buildLobby(); });
    b.prepend(icon(MODE_ICONS[id] || '🎮'));
    b.title = m.desc || '';
    modes.appendChild(b);
  }

  // Hero (left column) text.
  $('hero-name').textContent = save.look.name;
  $('hero-sub').textContent = `${WEAPONS[save.loadout.primary].name} · ${WEAPONS[save.loadout.secondary].name}`;
  const mapName = save.map === 'random' ? 'Random map' : (MAPS[save.map] || MAPS.arena).name;
  $('hero-mode').textContent = `${MODES[save.mode].label} · ${mapName} · ${save.difficulty === 'ranked' ? `Ranked · ${rankInfo(save.rating).name}` : matchDifficulty(save).label + ' bots'}`;
  $('mode-desc').textContent = (MODES[save.mode] || MODES['1v1']).desc || '';
  $('btn-tutorial').classList.toggle('new', !save.tutorialDone);
}

function card(label, selected, onClick) {
  const b = document.createElement('button');
  b.className = 'card' + (selected ? ' sel' : '');
  const l = document.createElement('div'); l.className = 'lbl'; l.textContent = label;
  b.appendChild(l);
  b.onclick = () => { Sfx.click(); onClick(); };
  return b;
}
function icon(ch) { const i = document.createElement('div'); i.className = 'ico'; i.textContent = ch; return i; }

// ---------- Lobby tabs ----------
let currentTab = 'play';
try { currentTab = localStorage.getItem('portal-duel-tab') || 'play'; } catch (e) { /* ignore */ }
function buildTabs() {
  for (const b of document.querySelectorAll('#tabs button')) {
    b.classList.toggle('sel', b.dataset.tab === currentTab);
    b.onclick = () => {
      currentTab = b.dataset.tab;
      try { localStorage.setItem('portal-duel-tab', currentTab); } catch (e) { /* ignore */ }
      Sfx.click();
      buildLobby();
    };
  }
  for (const s of document.querySelectorAll('.tab-body > section')) s.classList.toggle('active', s.dataset.tab === currentTab);
}

function buildLevel() {
  const li = levelInfo(save.xp || 0);
  $('lvl-num').textContent = li.level;
  $('xp-fill').style.width = (100 * li.into / li.need) + '%';
  $('xp-text').textContent = `Level ${li.level} · ${li.into} / ${li.need} XP`;
  const rk = rankInfo(save.rating);
  $('rank-icon').textContent = rk.icon;
  $('rank-icon').style.background = rk.color;
  $('rank-text').textContent = `${rk.name} · ${rk.rp} RP`;
  $('rank-fill').style.width = (100 * rk.into) + '%';
  $('rank-fill').style.background = rk.color;
  $('daily-dot').classList.toggle('hidden', !dailyReward(save).canClaim);
}

// ---------- Shop ----------
function shopItem(item, equipped, swatch, onEquip) {
  const d = document.createElement('div');
  d.className = 'item' + (equipped ? ' sel' : '');
  const lvl = levelInfo(save.xp || 0).level;
  const have = owns(save, item);
  d.innerHTML = `<div class="swatch" style="background:${swatch}"></div><div>${item.name}</div>`;
  const b = document.createElement('button');
  if (equipped) { b.textContent = 'Equipped'; b.disabled = true; }
  else if (have) { b.textContent = 'Equip'; b.onclick = () => { onEquip(); writeSave(save); Sfx.click(); buildLobby(); }; }
  else if (item.level) { b.textContent = `🔒 Level ${item.level}`; b.disabled = true; }
  else if (item.weekly) { b.textContent = '🏆 Weekly reward'; b.disabled = true; }
  else {
    b.textContent = `🪙 ${item.price}`;
    b.disabled = save.coins < item.price;
    b.onclick = () => { save.coins -= item.price; save.owned.push(item.id); onEquip(); writeSave(save); Sfx.coin(); buildLobby(); };
  }
  d.appendChild(b);
  return d;
}

function buildShop() {
  const skins = $('shop-skins'); skins.innerHTML = '';
  for (const s of GUN_SKINS) {
    const sw = s.color === 'rainbow' ? 'linear-gradient(90deg,#f44,#fd4,#4f6,#4cf,#a6f)' : s.color === 'portal' ? save.color : (s.color || '#3a3d48');
    skins.appendChild(shopItem(s, (save.gunSkin || 'default') === s.id, sw, () => { save.gunSkin = s.id; }));
  }
  const fx = $('shop-fx'); fx.innerHTML = '';
  const fxSwatch = { sparks: '#ff7040', confetti: 'linear-gradient(90deg,#f44,#fd4,#4f6,#4cf)', pixels: save.color, ghost: '#dde', vortex: `radial-gradient(${save.color}, #000)` };
  for (const k of KILL_FX) fx.appendChild(shopItem(k, (save.killFx || 'sparks') === k.id, fxSwatch[k.id], () => { save.killFx = k.id; }));
}

// ---------- Daily ----------
function buildDaily() {
  const info = dailyReward(save);
  const box = $('daily-reward');
  const days = info.rewards.map((r, i) => {
    const day = i + 1;
    const cls = day < info.day || (!info.canClaim && day === info.day) ? 'done' : day === info.day ? 'today' : '';
    return `<div class="${cls}">Day ${day}<b>🪙${r}</b></div>`;
  }).join('');
  box.innerHTML = `<div class="daily-days">${days}</div>`;
  const b = document.createElement('button');
  b.className = 'big';
  b.style.marginTop = '10px';
  b.textContent = info.canClaim ? `Claim 🪙 ${info.amount}` : 'Come back tomorrow!';
  b.disabled = !info.canClaim;
  b.onclick = () => { const got = claimDailyReward(save); if (got) { writeSave(save); Sfx.coin(); buildLobby(); } };
  box.appendChild(b);

  const ch = $('challenges'); ch.innerHTML = '';
  for (const c of dailyChallenges(save)) {
    const d = document.createElement('div');
    d.className = 'challenge' + (c.done ? ' done' : '');
    d.innerHTML = `<div class="t">${c.done ? '✅ ' : ''}${c.text}<div class="bar"><i style="width:${100 * c.progress / c.target}%"></i></div></div><small>${c.progress}/${c.target}</small><span class="rw">🪙${c.reward}</span>`;
    ch.appendChild(d);
  }
  // Weekly: bigger challenges, and an exclusive gun skin for finishing all three.
  const wk = weeklyChallenges(save), skin = weeklySkin(wk.week), left = daysLeftInWeek();
  const wEl = $('weekly'); wEl.innerHTML = '';
  for (const c of wk.list) {
    const d = document.createElement('div');
    d.className = 'challenge' + (c.done ? ' done' : '');
    d.innerHTML = `<div class="t">${c.done ? '✅ ' : ''}${c.text}<div class="bar"><i style="width:${100 * c.progress / c.target}%"></i></div></div><small>${c.progress}/${c.target}</small><span class="rw">🪙${c.reward}</span>`;
    wEl.appendChild(d);
  }
  const r = document.createElement('div');
  r.className = 'weekly-reward' + (wk.claimed ? ' got' : '');
  r.innerHTML = `<span class="swatch" style="background:${skin.color}"></span><div><b>${wk.claimed ? 'Unlocked: ' : 'Finish all 3: '}${skin.name} gun skin</b><small>${wk.claimed ? 'Equip it in the Shop.' : `Exclusive — only this week · ${left} day${left > 1 ? 's' : ''} left`}</small></div>`;
  wEl.appendChild(r);
  writeSave(save);
}

// ---------- Stats ----------
function buildStats() {
  const s = { matches: 0, wins: 0, kills: 0, deaths: 0, portalKills: 0, headshots: 0, shots: 0, hits: 0, grenadeKills: 0, rounds: 0, ...(save.stats || {}) };
  const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '–';
  const rows = [
    ['Level', levelInfo(save.xp || 0).level], ['Matches', s.matches], ['Wins', s.wins], ['Win rate', pct(s.wins, s.matches)],
    ['Kills', s.kills], ['Deaths', s.deaths], ['K/D', s.deaths ? (s.kills / s.deaths).toFixed(2) : s.kills],
    ['Portal kills 🌀', s.portalKills], ['Headshot kills', s.headshots], ['Grenade kills', s.grenadeKills],
    ['Accuracy', pct(s.hits, s.shots)], ['Rounds won', s.rounds],
  ];
  $('stats').innerHTML = rows.map(([k, v]) => `<div><b>${v}</b><small>${k}</small></div>`).join('');
  if (currentTab === 'stats') buildLeaderboard();
}

// ---------- Leaderboard ----------
let lbKey = 'rp';
async function buildLeaderboard(force = false) {
  for (const b of document.querySelectorAll('#lb-seg button')) {
    b.classList.toggle('sel', b.dataset.k === lbKey);
    b.onclick = () => { lbKey = b.dataset.k; Sfx.click(); buildLeaderboard(); };
  }
  const el = $('leaderboard');
  const data = await fetchBoard(force);
  if (!data) { el.innerHTML = '<p class="hint left">The global leaderboard is coming soon.</p>'; return; }
  const list = data[lbKey] || [], me = myTag(save);
  if (!list.length) { el.innerHTML = '<p class="hint left">No scores yet — play a match to be first!</p>'; return; }
  el.innerHTML = list.slice(0, 20).map((e, i) => {
    const v = lbKey === 'rp' ? `${rankInfo(e.rp).icon} ${e.rp} RP` : `${e.kills} kills`;
    return `<div class="${e.tag === me ? 'me' : ''}"><span class="n">${i + 1}</span><span class="who">${escapeHtml(e.name)}${e.tag === me ? ' (you)' : ''}</span><b>${v}</b></div>`;
  }).join('');
  const mine = list.findIndex(e => e.tag === me);
  if (mine >= 20) el.innerHTML += `<div class="me"><span class="n">${mine + 1}</span><span class="who">${escapeHtml(save.look.name)} (you)</span><b>${lbKey === 'rp' ? save.rating : (save.stats || {}).kills}</b></div>`;
}

setAdAudioHooks(() => setMuted(true), () => setMuted(false));

function goLobby() {
  Music.play('menu');
  state = 'lobby';
  input.enabled = false;
  if (MAPS[save.map]) world.load(save.map);
  buildSettings();
  input.unlock();
  buildLobby();
  showScreen('lobby');
}

// opts: { map, online: { room, roster } } for online matches.
function startMatch(modeId = save.mode, opts = {}) {
  if (match) match.dispose();
  hud.clear();
  let mapId = opts.map || (save.map === 'random' ? MAP_IDS[Math.floor(Math.random() * MAP_IDS.length)] : (MAPS[save.map] ? save.map : 'arena'));
  if (modeId === 'tutorial') mapId = 'arena';
  world.load(mapId);
  match = new Match({ scene, renderer, camera, world, portals, effects, viewmodel, input, hud }, modeId, save, onMatchEnd, opts.online || null);
  Music.play('battle');
  state = 'playing';
  input.enabled = true;
  input.reset();
  showScreen(null);
  if (!touchMode) input.lock();
  SDK.gameplayStart();
}

function onMatchEnd(res) {
  if (res.aborted) {
    // Online match ended early (host left / connection lost).
    if (match) { match.dispose(); match = null; }
    leaveRoom();
    currentTab = 'online';
    goLobby();
    onlineStatus(res.reason || 'Connection lost.', true);
    return;
  }
  const online = !!(match && match.online);
  if (res.tutorial) {
    const first = !save.tutorialDone;
    save.tutorialDone = true;
    if (first) { save.coins += 100; save.xp = (save.xp || 0) + 50; }
    writeSave(save);
    SDK.gameplayStop();
    state = 'results';
    input.enabled = false;
    input.unlock();
    $('results-title').textContent = 'TUTORIAL COMPLETE!';
    $('results-title').style.color = '#7cf';
    $('results-detail').innerHTML = first ? '<div>🪙 <b>+100</b> coins · ⭐ <b>+50</b> XP</div><div>Now try a real match!</div>' : '<div>Nice! Now try a real match.</div>';
    showScreen('results');
    Sfx.win();
    return;
  }
  save.coins += res.coins;
  const prog = applyMatch(save, res);
  const ranked = !online && save.difficulty === 'ranked' ? applyRanked(save, res) : null;
  writeSave(save);
  submitScore(save).then(() => fetchBoard(true)); // global leaderboard (quietly does nothing if it isn't set up)
  SDK.gameplayStop();
  if (res.won) SDK.happyTime();
  state = 'results';
  input.enabled = false;
  input.unlock();
  $('results-title').textContent = res.won ? 'VICTORY!' : 'DEFEAT';
  $('results-title').style.color = res.won ? '#7f7' : '#f77';
  const e = res.earned, li = levelInfo(save.xp);
  let html = `<div>Kills <b>${e.kills}</b> · Portal kills <b>${e.portalKills}</b> 🌀 · Headshots <b>${e.headshots}</b> · Rounds won <b>${e.rounds}</b></div>`;
  html += `<div>🪙 <b>+${res.coins}</b> coins · ⭐ <b>+${prog.xp}</b> XP</div>`;
  html += `<div class="xpbar"><i style="width:${100 * li.into / li.need}%"></i></div><small>Level ${li.level} · ${li.into} / ${li.need} XP</small>`;
  if (ranked) {
    const r = ranked.rank;
    html += `<div class="rp ${ranked.delta >= 0 ? 'up' : 'down'}">${r.icon} <b style="color:${r.color}">${r.name}</b> · ${ranked.after} RP <b>${ranked.delta >= 0 ? '+' : ''}${ranked.delta}</b></div>`;
    html += `<div class="xpbar rpbar"><i style="width:${100 * r.into}%;background:${r.color}"></i></div>`;
    if (ranked.rankUp) html += `<div class="lvlup">RANK UP! ${r.icon} ${r.name}</div>`;
    if (ranked.rankDown) html += `<div class="ch">Dropped to ${r.name}</div>`;
  }
  for (const l of prog.levelUps) html += `<div class="lvlup">LEVEL UP! Level ${l.level} · +🪙${l.coins}</div>`;
  for (const c of prog.weeklyDone || []) html += `<div class="ch">🏆 Weekly challenge done: ${c.text} · +🪙${c.reward}</div>`;
  if (prog.weeklySkin) html += `<div class="lvlup">EXCLUSIVE UNLOCKED: ${prog.weeklySkin.name} gun skin!</div>`;
  for (const c of prog.challengesDone) html += `<div class="ch">✅ Challenge done: ${c.text} · +🪙${c.reward}</div>`;
  $('results-detail').innerHTML = html;
  if (prog.levelUps.length) setTimeout(() => Sfx.levelUp(), 600);
  showScreen('results');
  $('results').classList.toggle('over-outro', !!(match && match.state === 'outro'));
  // Public room host: carry on by itself (other players are waiting for the next match).
  if (online && room && room.isHost && room.isPublic) setTimeout(() => { if (state === 'results') $('btn-continue').onclick(); }, 9000);
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  input.enabled = false;
  buildSettings();
  input.reset();
  showScreen('pause');
  SDK.gameplayStop();
}

function resume() {
  state = 'playing';
  input.enabled = true;
  showScreen(null);
  if (!touchMode) input.lock();
  SDK.gameplayStart();
}

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && state === 'playing' && !touchMode) pause();
});
// Clicking the game while playing re-grabs the mouse (e.g. after a failed lock).
canvas.addEventListener('click', () => { if (!touchMode && state === 'playing' && !input.locked) input.lock(); });
$('lockprompt').addEventListener('click', () => { if (state === 'playing') input.lock(); });
// If the mouse somehow gets grabbed while a menu is open, give it back.
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement && state !== 'playing') input.unlock(); });

// Switch between mouse and touch controls based on what the player actually uses.
function setTouchMode(on) {
  if (on === touchMode) return;
  touchMode = on;
  document.body.classList.toggle('touch', on);
  touch.show(on && state === 'playing');
  if (on) input.unlock();
}
addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') setTouchMode(true);
  else if (e.pointerType === 'mouse' && touchMode) {
    setTouchMode(false);
    if (state === 'playing') input.lock();
  }
}, true);

$('btn-play').onclick = () => {
  Sfx.unlock();
  if (touchMode) {
    // Full screen + landscape where the browser allows it.
    const el = document.documentElement;
    try { (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(() => {}); } catch (e) { /* ignore */ }
    try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch (e) { /* ignore */ }
  }
  goLobby();
};
$('btn-start').onclick = async () => {
  Sfx.unlock();
  // First match ever: offer the 1-minute tutorial first.
  if (!save.tutorialDone && !save.tutorialOffered && !((save.stats || {}).matches)) {
    save.tutorialOffered = true; writeSave(save);
    if (touchMode) $('intro').querySelector('.intro-steps div').innerHTML = '<b>🌀</b><span>tap PORTAL to aim one<br>(tap again to place it)</span>';
    $('intro').classList.remove('hidden');
    return;
  }
  const b = $('btn-start');
  b.disabled = true; b.textContent = 'LOADING...';
  await models;
  b.disabled = false; b.textContent = 'START MATCH';
  startMatch();
};
$('btn-start-top').onclick = () => $('btn-start').onclick();
$('intro-tut').onclick = async () => { $('intro').classList.add('hidden'); Sfx.unlock(); await models; startMatch('tutorial'); };
$('intro-skip').onclick = () => { $('intro').classList.add('hidden'); $('btn-start').onclick(); };
$('btn-tutorial').onclick = async () => { Sfx.unlock(); await models; startMatch('tutorial'); };
$('btn-resume').onclick = resume;
$('btn-quit').onclick = () => {
  const wasOnline = !!(match && match.online);
  if (match) { match.dispose(); match = null; }
  if (wasOnline) { leaveRoom(); currentTab = 'online'; }
  goLobby();
};
$('btn-continue').onclick = async () => {
  const wasOnline = !!(match && match.online);
  if (match) { match.dispose(); match = null; }
  if (wasOnline && room) {
    // Back to the room (no ad, friends are waiting).
    if (room.isHost) { room.started = false; room.sendLobby(); }
    currentTab = 'online';
    goLobby();
    scheduleAutoStart();
    return;
  }
  await SDK.midgameAd();
  goLobby();
};

// ---------- Online rooms ----------
let room = null;
const ONLINE_MODES = Object.entries(MODES).filter(([, m]) => !m.hidden).map(([id]) => id);
const slotsFor = (modeId) => { const M = MODES[modeId]; return M.ffa ? M.count : M.teams.flat().length; };
const me = () => ({ name: save.look.name, look: save.look, color: save.color, loadout: save.loadout, gunSkin: save.gunSkin });

function onlineStatus(text, err = false) {
  const el = $('on-status');
  el.textContent = text || '';
  el.classList.toggle('err', err);
}

function leaveRoom() {
  clearTimeout(autoStartT);
  if (room) room.leave();
  room = null;
}

function bindRoom(r) {
  r.on('players', () => { if (state === 'lobby') buildOnline(); });
  r.on('message', (msg) => { if (msg.t === 'start' && !r.isHost) startOnline(msg); });
  r.on('closed', (why) => {
    if (match && match.online) return; // the match shows it
    leaveRoom();
    onlineStatus(why, true);
    if (state === 'lobby') buildOnline();
  });
  r.on('error', (why) => onlineStatus(why, true));
  // Host: someone joined while a match is on. They take over a bot straight away.
  r.on('joined', (id) => {
    if (!r.isHost || !match || !match.online || match.state === 'outro' || match.state === 'done') return;
    const p = r.players.find(q => q.id === id);
    if (!p || !match.lateJoin(p)) return; // no free spot: they wait for the next match
    r.sendTo(id, { t: 'start', mode: match.modeId, map: world.mapId, roster: match.online.roster, snap: match.snapshot() });
  });
}

// Who plays on which team. Players alternate teams; bots fill the empty spots.
function makeRoster(modeId, players) {
  const M = MODES[modeId];
  const slots = M.ffa
    ? Array.from({ length: M.count }, (_, i) => ({ team: i, bodyColor: FFA_COLORS[i] }))
    : M.teams.flatMap((members, team) => members.map(() => ({ team, bodyColor: TEAM_COLORS[team] })));
  const free = [...slots], roster = [];
  players.forEach((p, i) => {
    let k = M.ffa ? 0 : free.findIndex(s => s.team === i % M.teams.length);
    if (k < 0) k = 0;
    const slot = free.splice(k, 1)[0];
    roster.push({ ...slot, owner: p.id, bot: false, name: p.name, look: p.look, color: p.color, loadout: p.loadout, gunSkin: p.gunSkin });
  });
  const diff = matchDifficulty(save);
  const used = new Set(players.map(p => p.color));
  const botColors = COLORS.filter(c => !used.has(c));
  free.forEach((slot, i) => {
    const name = BOT_NAMES[i % BOT_NAMES.length] + ' (bot)';
    roster.push({ ...slot, owner: 'h', bot: true, name, look: randomLook(name), color: botColors[i % botColors.length] || COLORS[i % COLORS.length],
      loadout: { primary: diff.guns[Math.floor(Math.random() * diff.guns.length)], secondary: 'pistol' }, gunSkin: null });
  });
  roster.forEach((e, i) => { e.id = i; });
  return roster;
}

async function startOnline(msg) {
  await models;
  clearTimeout(autoStartT);
  startMatch(msg.mode, { map: msg.map, online: { room, roster: msg.roster } });
  if (msg.snap) match.applySnapshot(msg.snap); // joined a match already going
}

// Host: start a match for everyone in the room.
async function hostStart() {
  if (!room || !room.isHost) return;
  await models;
  if (!room || room.players.length > slotsFor(room.mode)) return;
  const map = room.map === 'random' ? MAP_IDS[Math.floor(Math.random() * MAP_IDS.length)] : (MAPS[room.map] ? room.map : 'arena');
  const msg = { t: 'start', mode: room.mode, map, roster: makeRoster(room.mode, room.players) };
  room.started = true;
  room.broadcast(msg);
  startOnline(msg);
}

// ---------- Quick match ----------
// Public rooms have fixed codes per mode (e.g. QF1..QF8 for free for all). Try to join each in
// turn; the first free code becomes your own public room, and other players drop into it.
const QUICK_MODES = { ffa: 'F', '2v2': 'T', koth: 'K', ctf: 'C', gungame: 'G' };
const QUICK_ROOMS = 8;
let autoStartT = null, searching = false;

async function quickMatch(mode) {
  if (searching) return;
  searching = true;
  leaveRoom();
  $('btn-quick').disabled = true;
  try {
    for (let n = 1; n <= QUICK_ROOMS; n++) {
      const code = 'Q' + QUICK_MODES[mode] + n;
      onlineStatus(`Looking for a match… (${n}/${QUICK_ROOMS})`);
      const r = new Room();
      bindRoom(r);
      try {
        await r.join(code, me(), 7000);
        room = r;
        onlineStatus('Joined! Getting you into the match…');
        buildOnline();
        return;
      } catch (e) {
        r.leave();
        if (e.code === 'network') throw e;
        if (e.code !== 'not-found') continue; // full or not answering: try the next one
      }
      // Nobody is using this code: open it as a public room and start playing (bots fill in).
      const h = new Room();
      bindRoom(h);
      try {
        await h.host(me(), 0, code);
        h.isPublic = true;
        h.setSettings(mode, 'random');
        room = h;
        buildOnline();
        onlineStatus('No one around yet — you are playing bots. Players who join take over a bot.');
        await hostStart();
        return;
      } catch (e) {
        h.leave();
        if (e.code === 'taken') { n--; continue; } // someone opened it a moment ago: join it instead
        throw e;
      }
    }
    onlineStatus('All public rooms are full. Try another mode or create a room.', true);
  } catch (e) {
    leaveRoom();
    onlineStatus(e.message, true);
  } finally {
    searching = false;
    $('btn-quick').disabled = false;
  }
}

// Public rooms keep going on their own: the next match starts a few seconds after the last.
function scheduleAutoStart() {
  clearTimeout(autoStartT);
  if (!room || !room.isHost || !room.isPublic) return;
  let n = 5;
  const tick = () => {
    if (!room || !room.isPublic || state !== 'lobby') return;
    if (n <= 0) { hostStart(); return; }
    onlineStatus(`Next match in ${n}…`);
    n--;
    autoStartT = setTimeout(tick, 1000);
  };
  tick();
}

function buildOnline() {
  const inRoom = !!(room && room.myId);
  $('on-start').classList.toggle('hidden', inRoom);
  $('on-room').classList.toggle('hidden', !inRoom);
  if (!inRoom) return;
  $('room-code').textContent = room.code;
  const mode = MODES[room.mode] || MODES['2v2'];
  const roster = makeRoster(room.mode, room.players.slice(0, slotsFor(room.mode)));
  $('room-players').innerHTML = room.players.map(p => {
    const e = roster.find(r => r.owner === p.id && !r.bot);
    const team = !e ? 'waiting (too many for this mode)' : mode.ffa ? 'free for all' : e.team === 0 ? 'Blue team' : 'Red team';
    return `<div style="--c:${e ? e.bodyColor : '#888'}">${escapeHtml(p.name)}${p.id === room.myId ? ' (you)' : ''}${p.id === 'h' ? ' 👑' : ''}<small>${team}</small></div>`;
  }).join('') + roster.filter(r => r.bot).map(r => `<div style="--c:${r.bodyColor}">🤖 Bot<small>${mode.ffa ? 'free for all' : r.team === 0 ? 'Blue team' : 'Red team'}</small></div>`).join('');
  const set = $('room-settings');
  const mapName = room.map === 'random' ? 'Random' : (MAPS[room.map] || MAPS.arena).name;
  if (room.isHost) {
    set.innerHTML = `<select id="room-mode">${ONLINE_MODES.map(id => `<option value="${id}"${id === room.mode ? ' selected' : ''}>${MODES[id].label} (${slotsFor(id)} players)</option>`).join('')}</select>`
      + `<select id="room-map">${[...MAP_IDS, 'random'].map(id => `<option value="${id}"${id === room.map ? ' selected' : ''}>${id === 'random' ? 'Random map' : MAPS[id].name}</option>`).join('')}</select>`;
    $('room-mode').onchange = (e) => { room.setSettings(e.target.value, room.map); buildOnline(); };
    $('room-map').onchange = (e) => { room.setSettings(room.mode, e.target.value); buildOnline(); };
    const tooMany = room.players.length > slotsFor(room.mode);
    $('btn-room-start').classList.remove('hidden');
    $('btn-room-start').disabled = tooMany;
    if (!room.isPublic) onlineStatus(tooMany ? `Too many players for ${mode.label}. Pick a bigger mode.` : room.players.length < 2 ? 'Waiting for friends to join… (or start now with bots)' : 'Ready!');
  } else {
    set.innerHTML = `<div class="hint left">${mode.label} · ${mapName} — the host picks the mode and map.</div>`;
    $('btn-room-start').classList.add('hidden');
    onlineStatus(room.code.startsWith('Q') ? 'Public room — the next match starts soon…' : 'Waiting for the host to start…');
  }
}

const escapeHtml = (t) => String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

$('btn-create').onclick = async () => {
  Sfx.click();
  leaveRoom();
  room = new Room();
  bindRoom(room);
  onlineStatus('Creating room…');
  $('btn-create').disabled = true;
  try {
    await room.host(me());
    room.setSettings(ONLINE_MODES.includes(save.mode) ? save.mode : '2v2', save.map || 'arena');
    buildOnline();
  } catch (e) { leaveRoom(); onlineStatus(e.message, true); }
  $('btn-create').disabled = false;
};
$('btn-join').onclick = async () => {
  Sfx.click();
  const code = $('join-code').value.trim().toUpperCase();
  if (code.length < 5) { onlineStatus('Enter the 5-letter room code.', true); return; }
  leaveRoom();
  room = new Room();
  bindRoom(room);
  onlineStatus('Joining…');
  $('btn-join').disabled = true;
  try { await room.join(code, me()); buildOnline(); }
  catch (e) { leaveRoom(); onlineStatus(e.message, true); }
  $('btn-join').disabled = false;
};
$('join-code').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') $('btn-join').onclick(); };
$('btn-copy').onclick = () => { navigator.clipboard?.writeText(room ? room.code : '').then(() => onlineStatus('Code copied! Send it to your friends.')).catch(() => {}); };
$('btn-leave').onclick = () => { Sfx.click(); leaveRoom(); onlineStatus(''); buildOnline(); };
$('btn-room-start').onclick = () => { Sfx.unlock(); hostStart(); };
$('btn-quick').onclick = () => { Sfx.unlock(); quickMatch($('quick-mode').value); };

// ---------- Loop ----------
const clock = new THREE.Clock();
const menuCam = { t: 0 };

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 30);

  if (match && (state === 'playing' || (state === 'paused' && match.online) || (state === 'results' && match.state === 'outro'))) {
    match.update(dt);
    if (touchMode) touch.update(match);
  }
  // Mouse players: if the game doesn't have the mouse yet, ask for a click.
  // Only while actually playing (the match may have just ended during update()).
  $('lockprompt').classList.toggle('hidden', state !== 'playing' || touchMode || input.locked || match?.state === 'outro');

  if (match && (state === 'playing' || state === 'paused' || state === 'results')) {
    match.render();
  } else {
    if (state === 'lobby') renderPreview(dt);
    // Slow fly-around of the map behind the menus.
    menuCam.t += dt * 0.08;
    const v = world.map.view;
    camera.position.set(Math.cos(menuCam.t) * v.r, v.h, Math.sin(menuCam.t) * v.r * 0.65);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
  }
  input.endFrame();
}

const models = loadModels();
// Hide the loading screen once characters and guns are ready (or failed: the menu still works).
models.finally(() => { if (window.__bootDone) window.__bootDone(); });
models.then(() => {
  makeGunThumbs(gunModel, [...PRIMARIES, ...SECONDARIES]);
  if (state === 'lobby') { rebuildPreview(); buildLobby(); }
});
// Map pictures: rendered once, shortly after start (uses the main renderer).
// Maps made from a 3D model wait for it first.
Promise.all([...MAP_IDS.filter(id => MAPS[id].model).map(id => mapModel(MAPS[id].model.file)), ...Object.values(PROPS).map(f => mapModel(f))]).then(() => setTimeout(() => {
  try { makeMapThumbs(renderer, world, scene, MAPS, MAP_IDS); } catch (e) { console.warn('map thumbnails failed', e); }
  if (state === 'lobby') buildLobby();
}, 300));
applySettings();
buildSettings();
showScreen('menu');
frame();
// The SDK loads in the background; it never changes the current screen.
initSDK().then(() => {
  SDK.loadingStart(); SDK.loadingStop();
  // The intro's sound waits for CrazyGames' mute setting (no SDK: nothing to wait for, it already chose).
  let muted = false;
  try { muted = !!(window.CrazyGames && window.CrazyGames.SDK.game.settings.muteAudio); } catch (e) { /* no SDK */ }
  if (window.__bootSound) window.__bootSound(!muted);
});

// Debug handle (handy for testing in the browser console).
window.__game = { get match() { return match; }, portals, world, camera, renderer, WEAPONS, get preview() { return previewParts; } };
