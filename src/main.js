import * as THREE from 'three';
import { World } from './game/World.js';
import { PortalSystem } from './game/Portals.js';
import { Effects } from './game/Effects.js';
import { Viewmodel } from './game/Viewmodel.js';
import { Match, MODES } from './game/Match.js';
import { Hud } from './ui/Hud.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { SDK, initSDK } from './sdk.js';
import { loadSave, writeSave, UPGRADES, COLORS, upgradeCost, lvl } from './save.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');

// ---------- Renderer & shared objects ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.03, 400);
camera.layers.set(0);
camera.layers.enable(3);

const world = new World(scene);
const portals = new PortalSystem(scene, world, renderer);
const effects = new Effects(scene);
const viewmodel = new Viewmodel();
const hud = new Hud();
const input = new Input(canvas);

let save = loadSave();
let match = null;
let state = 'menu'; // menu | lobby | playing | paused | results

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
  input.unlock();
  buildLobby();
  showScreen('lobby');
}

function startMatch() {
  if (match) match.dispose();
  hud.clear();
  match = new Match({ scene, renderer, camera, world, portals, effects, viewmodel, input, hud }, save.mode, save, onMatchEnd);
  state = 'playing';
  input.enabled = true;
  input.reset();
  showScreen(null);
  input.lock();
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
  input.reset();
  showScreen('pause');
  SDK.gameplayStop();
}

function resume() {
  state = 'playing';
  input.enabled = true;
  showScreen(null);
  input.lock();
  SDK.gameplayStart();
}

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && state === 'playing') pause();
});
// Clicking the game while playing re-grabs the mouse (e.g. after a failed lock).
canvas.addEventListener('click', () => { if (state === 'playing' && !input.locked) input.lock(); });

$('btn-play').onclick = () => { Sfx.unlock(); goLobby(); };
$('btn-start').onclick = () => { Sfx.unlock(); startMatch(); };
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
    if (match && match.state !== 'done') match.render();
  } else if (match && (state === 'paused' || state === 'results')) {
    match.render();
  } else {
    // Slow fly-around of the map behind the menus.
    menuCam.t += dt * 0.08;
    camera.position.set(Math.cos(menuCam.t) * 28, 14, Math.sin(menuCam.t) * 18);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
  }
  input.endFrame();
}

showScreen('menu');
frame();
// The SDK loads in the background; it never changes the current screen.
initSDK().then(() => { SDK.loadingStart(); SDK.loadingStop(); });

// Debug handle (handy for testing in the browser console).
window.__game = { get match() { return match; }, portals, world, camera, renderer };
