import * as THREE from 'three';
import { gunModel, applySkin, partModel } from '../game/Models.js';
import { GUN_FRAMES, PARTS, SLOTS, SLOTS_FOR, EFFECT_TEXT, partFits, frameOf, cleanMods } from '../game/Gunsmith.js';
import { WEAPONS } from '../game/Weapons.js';

// The Gunsmith lobby tab: pick a gun, its frame (look) and attachments, with a 3D view.
const PART_ICON = { optic: '🔭', muzzle: '🔇', grip: '✊', bipod: '🦵', flashlight: '🔦', bayonet: '🔪', bayonet2: '🗡️' };
const GUNS = Object.keys(GUN_FRAMES);
const ownKey = (id) => 'part:' + id;

let view = null; // { renderer, scene, camera, gun, key }
let smithGun = null;

export function buildGunsmith({ save, writeSave, thumbs, Sfx, skin, onChange }) {
  const el = document.getElementById('gunsmith');
  if (!el) return;
  save.gunMods ||= {};
  if (!smithGun || !GUNS.includes(smithGun)) smithGun = GUNS.includes(save.loadout.primary) ? save.loadout.primary : 'ar';
  const gun = smithGun;
  const mods = cleanMods(gun, save.gunMods[gun] || {}) || { frame: GUN_FRAMES[gun].frames[0].id };
  const set = (next) => {
    save.gunMods[gun] = cleanMods(gun, next);
    writeSave(save);
    onChange();
  };
  el.innerHTML = '';

  // Which gun.
  const guns = document.createElement('div');
  guns.className = 'cards smith-guns';
  for (const id of GUNS) {
    const b = document.createElement('button');
    b.className = 'card' + (id === gun ? ' sel' : '');
    if (thumbs.guns[id]) { const img = document.createElement('img'); img.src = thumbs.guns[id]; img.alt = ''; b.appendChild(img); }
    const l = document.createElement('div'); l.className = 'lbl'; l.textContent = WEAPONS[id].name;
    b.appendChild(l);
    const inUse = save.loadout.primary === id || save.loadout.secondary === id;
    if (inUse) { const t = document.createElement('i'); t.className = 'smith-inuse'; t.textContent = 'IN LOADOUT'; b.appendChild(t); }
    b.onclick = () => { Sfx.click(); smithGun = id; onChange(); };
    guns.appendChild(b);
  }
  el.appendChild(guns);

  // 3D view.
  const holder = document.createElement('div');
  holder.className = 'smith-view';
  el.appendChild(holder);
  showGun(holder, gun, mods, skin);
  const inUse = save.loadout.primary === gun || save.loadout.secondary === gun;
  const note = document.createElement('p');
  note.className = 'hint left';
  note.textContent = inUse ? 'This gun is in your loadout: changes show up in your next match.' : 'Pick this gun in Play → Loadout to use it.';
  el.appendChild(note);

  const section = (title) => { const h = document.createElement('h3'); h.textContent = title; el.appendChild(h); const g = document.createElement('div'); g.className = 'accs'; el.appendChild(g); return g; };
  // pic: a picture (data URL) of the actual model; otherwise the icon is shown.
  const button = (iconTxt, name, sub, selected, locked, onClick, pic = null) => {
    const b = document.createElement('button');
    b.className = 'acc' + (selected ? ' sel' : '') + (locked ? ' locked' : '');
    b.innerHTML = (pic ? `<img class="ath" alt="" src="${pic}">` : `<span class="ai">${iconTxt}</span>`) + `<span class="an"></span><span class="ap"></span>`;
    b.querySelector('.an').textContent = name;
    b.querySelector('.ap').textContent = sub;
    b.onclick = onClick;
    return b;
  };

  // Frames (free, looks only).
  const frames = section('Frame (looks only)');
  for (const f of GUN_FRAMES[gun].frames) {
    const sel = f.id === mods.frame;
    frames.appendChild(button('🔧', f.name, sel ? 'Equipped' : 'Free', sel, false, () => { Sfx.click(); set({ ...mods, frame: f.id }); },
      thumb('f:' + f.id, () => gunModel(gun, { frame: f.id }))));
  }

  // Attachment slots.
  const frame = frameOf(gun, mods);
  for (const slot of SLOTS_FOR[gun] || []) {
    const grid = section(`${SLOTS[slot].icon} ${SLOTS[slot].name}`);
    if (slot === 'under' && frame.noUnder) {
      const p = document.createElement('p'); p.className = 'hint left'; p.textContent = 'This frame has its own grip: pick another frame to use underbarrel attachments.';
      grid.replaceWith(p);
      continue;
    }
    grid.appendChild(button('✖️', 'None', !mods[slot] ? 'Equipped' : '', !mods[slot], false, () => { Sfx.click(); set({ ...mods, [slot]: null }); }));
    for (const [id, p] of Object.entries(PARTS)) {
      if (p.slot !== slot || !partFits(gun, id)) continue;
      const owned = save.owned.includes(ownKey(id));
      const sel = mods[slot] === id;
      const b = button(PART_ICON[id] || PART_ICON[slot], p.name, sel ? 'Equipped' : owned ? 'Equip' : '🪙 ' + p.price, sel, !owned, () => {
        if (!owned) {
          if (save.coins < p.price) { Sfx.portalDeny(); return; }
          save.coins -= p.price;
          save.owned.push(ownKey(id));
          Sfx.coin();
        } else Sfx.click();
        set({ ...mods, [slot]: id });
      }, thumb('p:' + id, () => { const pm = partModel(id); return pm && pm.g; }));
      if (!owned && save.coins < p.price) b.classList.add('poor');
      b.title = EFFECT_TEXT[p.effect];
      grid.appendChild(b);
    }
    // Sights: pick the zoom it starts at (scroll while aiming to change it in a match).
    const cur = PARTS[mods[slot]];
    if (slot === 'optic' && cur && cur.zooms && cur.zooms.length > 1) {
      const z = document.createElement('div');
      z.className = 'seg smith-zoom';
      const lbl = document.createElement('span'); lbl.textContent = 'Starting zoom'; z.appendChild(lbl);
      for (const v of cur.zooms) {
        const b = document.createElement('button');
        b.textContent = v + '×';
        if (v === mods.zoom) b.classList.add('sel');
        b.onclick = () => { Sfx.click(); set({ ...mods, zoom: v }); };
        z.appendChild(b);
      }
      el.appendChild(z);
    }
    // What the equipped one does.
    const d = document.createElement('p');
    d.className = 'hint left smith-effect';
    d.textContent = cur ? `${cur.name}: ${EFFECT_TEXT[cur.effect]}` : 'Buy an attachment once and use it on every gun it fits.';
    el.appendChild(d);
  }
}

// ---------- 3D view ----------
function showGun(holder, gun, mods, skin) {
  if (!view) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#445', 2.6));
    const d = new THREE.DirectionalLight('#ffffff', 1.8); d.position.set(2, 3, 2); scene.add(d);
    const camera = new THREE.PerspectiveCamera(28, 2, 0.01, 20);
    view = { renderer, scene, camera, gun: null, key: null, t: 0, drag: null, yaw: 0 };
    const c = renderer.domElement;
    c.addEventListener('pointerdown', (e) => { view.drag = e.clientX; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (view.drag !== null) { view.yaw += (e.clientX - view.drag) * 0.01; view.drag = e.clientX; } });
    const end = () => { view.drag = null; };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
    const loop = () => {
      requestAnimationFrame(loop);
      const el = view.renderer.domElement;
      if (!el.isConnected || !view.gun) return;
      const w = el.parentElement.clientWidth, h = el.parentElement.clientHeight;
      if (!w || !h) return;
      if (el.width !== Math.round(w * view.renderer.getPixelRatio())) { view.renderer.setSize(w, h, false); view.camera.aspect = w / h; view.camera.updateProjectionMatrix(); }
      if (view.drag === null) view.yaw += 0.004;
      view.gun.rotation.y = Math.PI / 2 + Math.sin(view.yaw) * 0.6; // mostly side-on, gently turning
      view.renderer.render(view.scene, view.camera);
    };
    loop();
  }
  holder.appendChild(view.renderer.domElement);
  const key = gun + JSON.stringify(mods) + (skin ? skin.id : '');
  if (view.key === key) return;
  view.key = key;
  if (view.gun) view.scene.remove(view.gun);
  const m = gunModel(gun, mods);
  if (!m) { view.gun = null; return; }
  applySkin(m, skin, '#36b5ff');
  // Centre it and frame it.
  const pivot = new THREE.Group();
  pivot.add(m);
  const box = new THREE.Box3().setFromObject(m);
  m.position.sub(box.getCenter(new THREE.Vector3()));
  const len = box.max.z - box.min.z;
  view.camera.position.set(0, len * 0.1, len * 1.35);
  view.camera.lookAt(0, 0, 0);
  view.gun = pivot;
  view.scene.add(pivot);
}

// ---------- Pictures of frames and parts (rendered once, then cached) ----------
const pics = new Map();
let picR = null;
function thumb(key, make) {
  if (pics.has(key)) return pics.get(key);
  let url = null;
  try {
    const obj = make();
    if (obj) {
      if (!picR) {
        picR = { r: new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }), scene: new THREE.Scene() };
        picR.r.outputColorSpace = THREE.SRGBColorSpace;
        picR.r.setPixelRatio(1);
        picR.r.setSize(160, 90, false);
        picR.scene.add(new THREE.HemisphereLight('#ffffff', '#555566', 2.6));
        const d = new THREE.DirectionalLight('#ffffff', 2); d.position.set(3, 4, 2); picR.scene.add(d);
      }
      const { r, scene } = picR;
      const holder = new THREE.Group();
      holder.add(obj);
      holder.rotation.y = 0.35; // a little from the front, so round parts look round
      scene.add(holder);
      holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(holder);
      const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
      const half = Math.max(Math.max(s.z, s.x) / 2 / (16 / 9), s.y / 2) * 1.12;
      const cam = new THREE.OrthographicCamera(-half * 16 / 9, half * 16 / 9, half, -half, 0.01, 20);
      cam.position.set(c.x + 3, c.y + 0.3, c.z);
      cam.lookAt(c);
      r.render(scene, cam);
      url = r.domElement.toDataURL('image/png');
      scene.remove(holder);
    }
  } catch (e) { url = null; }
  pics.set(key, url);
  return url;
}
