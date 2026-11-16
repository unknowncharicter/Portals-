import * as THREE from 'three';
import { World } from './game/World.js';
import { PortalSystem } from './game/Portals.js';
import { Effects } from './game/Effects.js';
import { Viewmodel } from './game/Viewmodel.js';
import { Match, MODES, DIFFICULTIES } from './game/Match.js';
import { buildCharacterMesh, SHIRTS, PANTS, SKINS, HATS, cleanName } from './game/Look.js';
import { Hud } from './ui/Hud.js';
import { Input } from './input.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { MAPS, MAP_IDS } from './game/maps.js';
import { Sfx, setVolume } from './audio.js';
import { SDK, initSDK } from './sdk.js';
import { loadModels, gunModel } from './game/Models.js';
import { WEAPONS, PRIMARIES, SECONDARIES } from './game/Weapons.js';
import { loadSave, writeSave, UPGRADES, COLORS, upgradeCost, lvl } from './save.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');

// ---------- Renderer & shared objects ----------
// Some computers only give the browser a 16-bit depth buffer. Then far-away walls and boxes
// "fight" and show through each other. On those, use a logarithmic depth buffer instead.
function depthBits() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' }) || c.getContext('webgl', { antialias: true });
    if (!gl) return 24;
    const bits = gl.getParameter(gl.DEPTH_BITS);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return bits || 24;
  } catch (e) { return 24; }
}
const LOW_DEPTH = new URLSearchParams(location.search).has('logdepth') || depthBits() < 24;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: LOW_DEPTH });
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
  { id: 'volume', label: 'Volume',      min: 0,   max: 1,   step: 0.05, fmt: v => Math.round(v * 100) + '%' },
];

function applySettings() {
  const st = save.settings;
  input.sensitivity = 0.0022 * st.sens;
  setVolume(st.volume);
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
const previewCam = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
previewCam.position.set(0, 0.35, 4.2);
previewCam.lookAt(0, 0.15, 0);
let previewChar = null;

function rebuildPreview() {
  if (previewChar) previewScene.remove(previewChar);
  const parts = buildCharacterMesh(save.look, { visor: save.color, tag: false });
  const gun = gunModel(save.loadout.primary);
  if (gun) parts.gunHolder.add(gun);
  previewChar = parts.group;
  previewScene.add(previewChar);
}

function renderPreview(dt) {
  if (!previewChar) return;
  const w = previewCanvas.clientWidth, h = previewCanvas.clientHeight;
  if (!w || !h) return;
  if (previewCanvas.width !== Math.floor(w * previewRenderer.getPixelRatio())) {
    previewRenderer.setSize(w, h, false);
    previewCam.aspect = w / h;
    previewCam.updateProjectionMatrix();
  }
  previewChar.rotation.y += dt * 0.6;
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

  const hats = $('hats');
  hats.innerHTML = '';
  for (const h of HATS) {
    const owned = save.owned.includes(h.id);
    const b = document.createElement('button');
    b.textContent = owned ? h.name : `🪙 ${h.price}`;
    b.title = h.name;
    if (!owned) { b.classList.add('locked'); b.disabled = save.coins < h.price; }
    if (L.hat === h.id) b.classList.add('sel');
    b.onclick = () => {
      if (!owned) {
        if (save.coins < h.price) return;
        save.coins -= h.price;
        save.owned.push(h.id);
        Sfx.portalPlace();
      }
      L.hat = h.id;
      writeSave(save);
      buildLobby();
    };
    hats.appendChild(b);
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

  const lo = $('loadout');
  lo.innerHTML = '';
  for (const [slot, list] of [['primary', PRIMARIES], ['secondary', SECONDARIES]]) {
    const row = document.createElement('div');
    row.className = 'row';
    for (const id of list) {
      const b = document.createElement('button');
      b.textContent = WEAPONS[id].name;
      if (save.loadout[slot] === id) b.classList.add('sel');
      b.onclick = () => { save.loadout[slot] = id; writeSave(save); buildLobby(); };
      row.appendChild(b);
    }
    lo.appendChild(row);
  }

  const mapsEl = $('maps');
  mapsEl.innerHTML = '';
  for (const id of [...MAP_IDS, 'random']) {
    const b = document.createElement('button');
    b.textContent = id === 'random' ? '🎲 Random' : MAPS[id].name;
    if (id === (save.map || 'arena')) b.classList.add('sel');
    b.onclick = () => {
      save.map = id; writeSave(save);
      if (id !== 'random') world.load(id);
      buildLobby();
    };
    mapsEl.appendChild(b);
  }

  const diff = $('difficulty');
  diff.innerHTML = '';
  for (const [id, d] of Object.entries(DIFFICULTIES)) {
    const b = document.createElement('button');
    b.textContent = d.label;
    if (id === (save.difficulty || 'normal')) b.classList.add('sel');
    b.onclick = () => { save.difficulty = id; writeSave(save); buildLobby(); };
    diff.appendChild(b);
  }

  buildCharacterPanel();

  const modes = $('modes');
  modes.innerHTML = '';
  for (const [id, m] of Object.entries(MODES)) {
    const b = document.createElement('button');
    b.textContent = m.label;
    if (id === save.mode) b.classList.add('sel');
    b.onclick = () => { save.mode = id; writeSave(save); buildLobby(); };
    modes.appendChild(b);
  }
}

function goLobby() {
  state = 'lobby';
  input.enabled = false;
  if (MAPS[save.map]) world.load(save.map);
  buildSettings();
  input.unlock();
  buildLobby();
  showScreen('lobby');
}

function startMatch() {
  if (match) match.dispose();
  hud.clear();
  const mapId = save.map === 'random' ? MAP_IDS[Math.floor(Math.random() * MAP_IDS.length)] : (MAPS[save.map] ? save.map : 'arena');
  world.load(mapId);
  match = new Match({ scene, renderer, camera, world, portals, effects, viewmodel, input, hud }, save.mode, save, onMatchEnd);
  state = 'playing';
  input.enabled = true;
  input.reset();
  showScreen(null);
  if (!touchMode) input.lock();
  SDK.gameplayStart();
}

function onMatchEnd(res) {
  save.coins += res.coins;
  writeSave(save);
  SDK.gameplayStop();
  if (res.won) SDK.happyTime();
  state = 'results';
  input.enabled = false;
  input.unlock();
  $('results-title').textContent = res.won ? 'VICTORY!' : 'DEFEAT';
  $('results-title').style.color = res.won ? '#7f7' : '#f77';
  $('results-detail').textContent = `Kills ${res.kills} · Rounds won ${res.rounds} · +${res.coins} coins`;
  showScreen('results');
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
$('lockprompt').addEventListener('click', () => input.lock());

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
  const b = $('btn-start');
  b.disabled = true; b.textContent = 'LOADING...';
  await models;
  b.disabled = false; b.textContent = 'START MATCH';
  startMatch();
};
$('btn-start-top').onclick = () => $('btn-start').onclick();
$('btn-resume').onclick = resume;
$('btn-quit').onclick = () => { if (match) { match.dispose(); match = null; } goLobby(); };
$('btn-continue').onclick = async () => {
  if (match) { match.dispose(); match = null; }
  await SDK.midgameAd();
  goLobby();
};

// ---------- Loop ----------
const clock = new THREE.Clock();
const menuCam = { t: 0 };

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 30);

  if (state === 'playing' && match) {
    match.update(dt);
    if (touchMode) touch.update(match);
    // Mouse players: if the game doesn't have the mouse yet, ask for a click.
    $('lockprompt').classList.toggle('hidden', touchMode || input.locked);
    if (match && match.state !== 'done') match.render();
  } else if (match && (state === 'paused' || state === 'results')) {
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
models.then(() => { if (state === 'lobby') rebuildPreview(); });
applySettings();
buildSettings();
showScreen('menu');
frame();
// The SDK loads in the background; it never changes the current screen.
initSDK().then(() => { SDK.loadingStart(); SDK.loadingStop(); });

// Debug handle (handy for testing in the browser console).
window.__game = { get match() { return match; }, portals, world, camera, renderer, WEAPONS };
