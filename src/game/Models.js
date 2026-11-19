import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { setCharacterTemplate, addCharacterTemplate } from './CharacterModel.js';
import { retargetClips, MIXAMO_TO_QUAT, fixQuaterniusRig } from './Retarget.js';
import { GUN_FRAMES, PARTS, frameOf, cleanMods } from './Gunsmith.js';

// Character models (Quaternius, CC0). They share one skeleton, so the robot's animation clips
// are copied onto it once and used by both. tint: material name -> look colour it takes.
const CHARACTERS = {
  swat: { file: 'chars/swat.glb', tint: { Swat: 'body', Swat_Black: 'joints', Skin: 'skin' } },
  punk: { file: 'chars/punk.glb', tint: { White: 'body', LightBlue: 'joints', Skin: 'skin' } },
  casual:     { file: 'chars/casual.glb',     tint: { White: 'body', LightBlue: 'joints', Skin: 'skin' } },
  hoodie:     { file: 'chars/hoodie.glb',     tint: { Purple: 'body', LightBlue: 'joints', Skin: 'skin' } },
  farmer:     { file: 'chars/farmer.glb',     tint: { LightBlue: 'body', Brown: 'joints', Skin: 'skin' } },
  worker:     { file: 'chars/worker.glb',     tint: { Worker_Vest: 'body', Grey: 'joints', Skin: 'skin' } },
  beach:      { file: 'chars/beach.glb',      tint: { White: 'body', Red_Dark: 'joints', Skin: 'skin' } },
  business:   { file: 'chars/business.glb',   tint: { Suit: 'body', Tie: 'joints', Skin: 'skin' } },
  adventurer: { file: 'chars/adventurer.glb', tint: { Green: 'body', Brown: 'joints', Skin: 'skin' } },
  astronaut:  { file: 'chars/astronaut.glb',  tint: { SciFi_Main: 'body', SciFi_MainDark: 'joints' } },
  king:       { file: 'chars/king.glb',       tint: { Blue: 'body', DarkBrown: 'joints', Skin: 'skin' } },
};
export const CHARACTER_IDS = Object.keys(CHARACTERS);

// Gun models: frames and attachments (see Gunsmith.js). The source models point their barrel
// along +X; we turn them to face -Z (forward in three.js), scale each gun family so its first
// frame is a real-world length, and put the grip at the origin.
// Hat models (in "blocky head" units: head centre y 0.72, top 0.93, about 0.44 wide).
// width: size across (x) after turning; bottom/top: where the model's lowest/highest point goes.
// tint: recolour with the look's shirt or pants colour.
const HATS = {
  cap:        { file: 'hats/cap.glb',        rotY: Math.PI,     width: 0.5,  bottom: 0.68, tint: 'shirt' },
  beanie:     { file: 'hats/beanie.glb',     rotY: 0,           width: 0.5,  bottom: 0.73, tint: 'pants' },
  helmet:     { file: 'hats/hardhat.glb',    rotY: 0,           width: 0.66, bottom: 0.72, drop: /Box001/ },
  headphones: { file: 'hats/headphones.glb', rotY: Math.PI / 2, width: 0.56, top: 0.95 },
  tophat:     { file: 'hats/tophat.glb',     rotY: 0,           width: 0.62, bottom: 0.76 },
  crown:      { file: 'hats/crown.glb',      rotY: 0,           width: 0.46, bottom: 0.82 },
};
// Face items, same units. cy: centre height; front: where the front of the model goes (z).
const FACE_MODELS = {
  gasmask: { file: 'faces/gasmask.glb', rotY: 0,       width: 0.54, cy: 0.68, front: -0.36 },
  shades:  { file: 'faces/shades.glb',  rotY: 0,       width: 0.5,  cy: 0.68, front: -0.26 },
  glasses: { file: 'faces/glasses.glb', rotY: Math.PI, width: 0.48, cy: 0.67, front: -0.26 },
  skull:   { file: 'faces/skull.glb',   rotY: Math.PI, width: 0.56, cy: 0.71, front: -0.31 },
};
// Back items, in "blocky torso" units (torso centre y 0.16, back surface z +0.18, 0.62 wide).
// front: where the side touching the back goes (z). rotZ tilts it (the katana across the back).
const BACK_MODELS = {
  backpack: { file: 'backs/backpack.glb', rotY: 0,            width: 0.5,  cy: 0.2,  front: 0.17 },
  jetpack:  { file: 'backs/jetpack.glb',  rotY: -Math.PI / 2, width: 0.52, cy: 0.18, front: 0.16 },
  katana:   { file: 'backs/katana.glb',   rotY: 0, rotZ: Math.PI - 0.55, height: 1.1, cy: 0.2, front: 0.2 },
  wings:    { file: 'backs/wings.glb',    rotY: 0,            width: 1.5,  cy: 0.32, front: 0.2 },
};
const hatTemplates = {}, faceTemplates = {}, backTemplates = {};

const templates = {};
const frameTemplates = {}, partScenes = {}, gunScale = {};
let loading = null;

export function loadModels() {
  if (loading) return loading;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const character = loader.loadAsync('models/character.glb')
    .then(async (robot) => {
      setCharacterTemplate(robot);
      let clips = null;
      await Promise.all(Object.entries(CHARACTERS).map(async ([id, cfg]) => {
        try {
          const g = await loader.loadAsync(`models/${cfg.file}`);
          fixQuaterniusRig(g.scene);
          // All these characters share one skeleton: copy the clips once, reuse for all.
          if (!clips) clips = retargetClips(SkeletonUtils.clone(robot.scene), SkeletonUtils.clone(g.scene), robot.animations, MIXAMO_TO_QUAT);
          addCharacterTemplate(id, { scene: g.scene, clips, boneMap: MIXAMO_TO_QUAT, scale: 1, tint: cfg.tint });
        } catch (e) { console.warn('Could not load character', id, e); }
      }));
    })
    .catch(e => console.warn('Could not load character model (using blocky bodies)', e));
  const hats = Object.entries(HATS).map(async ([id, cfg]) => {
    try { hatTemplates[id] = { root: fitHat((await loader.loadAsync(`models/${cfg.file}`)).scene, cfg), cfg }; }
    catch (e) { console.warn('Could not load hat', id, e); }
  });
  const faces = Object.entries(FACE_MODELS).map(async ([id, cfg]) => {
    try { faceTemplates[id] = { root: fitHat((await loader.loadAsync(`models/${cfg.file}`)).scene, cfg), cfg }; }
    catch (e) { console.warn('Could not load face item', id, e); }
  });
  const backs = Object.entries(BACK_MODELS).map(async ([id, cfg]) => {
    try { backTemplates[id] = { root: fitHat((await loader.loadAsync(`models/${cfg.file}`)).scene, cfg), cfg }; }
    catch (e) { console.warn('Could not load back item', id, e); }
  });
  loading = Promise.all([character, ...hats, ...faces, ...backs, ...Object.entries(GUN_FRAMES).map(async ([id, fam]) => {
    try {
      // The first frame sets the family's scale; the others use the same scale (true sizes).
      const first = (await loader.loadAsync(`models/guns/parts/${fam.frames[0].id}.glb`)).scene;
      const raw = new THREE.Box3().setFromObject(first);
      const scale = fam.length / (raw.max.x - raw.min.x);
      gunScale[id] = scale;
      frameTemplates[fam.frames[0].id] = normalizeFrame(first, scale, fam.frames[0].hold);
      templates[id] = frameTemplates[fam.frames[0].id];
      await Promise.all(fam.frames.slice(1).map(async (f) => {
        try { frameTemplates[f.id] = normalizeFrame((await loader.loadAsync(`models/guns/parts/${f.id}.glb`)).scene, scale, f.hold); }
        catch (e) { console.warn('Could not load gun frame', f.id, e); }
      }));
    } catch (e) {
      console.warn('Could not load gun model', id, e);
    }
  }), ...Object.entries(PARTS).map(async ([id, p]) => {
    try { partScenes[id] = (await loader.loadAsync(`models/guns/parts/${p.file}.glb`)).scene; }
    catch (e) { console.warn('Could not load gun part', id, e); }
  })]);
  // Blocky guns built in code (no model file needed).
  templates.crossbow = makeCrossbow();
  templates.rocket = makeRocket();
  return loading;
}

function fitHat(scene, cfg) {
  if (cfg.drop) { const gone = []; scene.traverse(o => { if (cfg.drop.test(o.name)) gone.push(o); }); for (const o of gone) o.removeFromParent(); }
  const inner = new THREE.Group();
  inner.add(scene);
  inner.rotation.set(0, cfg.rotY || 0, cfg.rotZ || 0);
  const root = new THREE.Group();
  root.add(inner);
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);
  inner.scale.setScalar(cfg.height ? cfg.height / (box.max.y - box.min.y) : cfg.width / (box.max.x - box.min.x));
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root);
  const c = box.getCenter(new THREE.Vector3());
  const y = cfg.cy !== undefined ? cfg.cy - c.y : cfg.top !== undefined ? cfg.top - box.max.y : cfg.bottom - box.min.y;
  inner.position.set(-c.x, y, cfg.front !== undefined ? cfg.front - box.min.z : -c.z);
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = false;
    if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals(); // some files have none (renders black)
    const old = o.material;
    o.material = new THREE.MeshLambertMaterial({ color: old.color, map: old.map || null, transparent: old.transparent, opacity: old.opacity, depthWrite: !old.transparent });
  });
  return root;
}

// A copy of a hat model (null if there is none for that hat), tinted for the look.
export function backModel(id) {
  const t = backTemplates[id];
  return t ? t.root.clone(true) : null;
}

export function faceModel(id) {
  const t = faceTemplates[id];
  return t ? t.root.clone(true) : null;
}

export function hatModel(id, look) {
  const t = hatTemplates[id];
  if (!t) return null;
  const m = t.root.clone(true);
  if (t.cfg.tint && look && look[t.cfg.tint]) {
    const col = new THREE.Color(look[t.cfg.tint]);
    if (t.cfg.tint === 'shirt') col.multiplyScalar(0.75);
    m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.copy(col); } });
  }
  return m;
}

// Map models are loaded on demand (only when that map is picked) and kept afterwards.
const mapModels = {}, loadedMaps = {};
export const mapModelLoaded = (file) => loadedMaps[file] || null;
export function mapModel(file) {
  if (!mapModels[file]) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    mapModels[file] = loader.loadAsync(`models/${file}`).then(g => {
      g.scene.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = false;
        // Same simple lighting as the box maps.
        const old = o.material;
        o.material = new THREE.MeshLambertMaterial({ color: old.color, map: old.map || null });
        old.dispose();
      });
      loadedMaps[file] = g.scene;
      return g.scene;
    }).catch(e => { console.warn('Could not load map model', file, e); return null; });
  }
  return mapModels[file];
}

function box(g, w, h, d, color, x, y, z, emissive) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, emissive: emissive || '#000000' }));
  m.position.set(x, y, z); g.add(m); return m;
}

function makeCrossbow() {
  const g = new THREE.Group();
  box(g, 0.06, 0.07, 0.62, '#6b4a2c', 0, 0, -0.12);           // stock
  box(g, 0.05, 0.12, 0.06, '#3a2a1c', 0, -0.08, 0.05);        // grip
  box(g, 0.62, 0.035, 0.04, '#2a2c34', 0, 0.02, -0.4);        // bow limbs
  box(g, 0.04, 0.05, 0.08, '#2a2c34', 0.3, 0.02, -0.37);
  box(g, 0.04, 0.05, 0.08, '#2a2c34', -0.3, 0.02, -0.37);
  box(g, 0.6, 0.006, 0.006, '#dddddd', 0, 0.03, -0.32);       // string
  box(g, 0.012, 0.012, 0.5, '#7cf', 0, 0.05, -0.25, '#1a3a55'); // loaded bolt
  box(g, 0.02, 0.05, 0.05, '#2a2c34', 0, 0.07, -0.05);        // sight
  g.userData.muzzle = new THREE.Vector3(0, 0.05, -0.5);
  return g;
}

function makeRocket() {
  const g = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.95, 12).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#4a5a3a' }));
  tube.position.set(0, 0.05, -0.2); g.add(tube);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 12).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#2a2c34' }));
  rim.position.set(0, 0.05, -0.66); g.add(rim);
  const back = rim.clone(); back.position.z = 0.26; g.add(back);
  box(g, 0.05, 0.13, 0.06, '#2a2c34', 0, -0.07, 0);           // grip
  box(g, 0.05, 0.11, 0.06, '#2a2c34', 0, -0.06, -0.3);        // front grip
  box(g, 0.04, 0.06, 0.12, '#2a2c34', 0.07, 0.12, -0.15);     // sight
  box(g, 0.03, 0.03, 0.03, '#ff4422', 0.07, 0.16, -0.2, '#661100');
  g.userData.muzzle = new THREE.Vector3(0, 0.05, -0.7);
  return g;
}

function normalizeFrame(scene, scale, hold) {
  const inner = scene;
  inner.rotation.y = Math.PI / 2; // +X -> -Z
  inner.scale.multiplyScalar(scale);
  const root = new THREE.Group();
  root.add(inner);
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);
  // Grip point: `hold` of the way from the back of the gun, at mid height.
  const L = box.max.z - box.min.z;
  const grip = new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z - hold * L);
  inner.position.sub(grip);
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root);

  // Height profile along the gun (top and bottom every 1 cm), for fitting attachments,
  // and the muzzle: average height of the vertices at the very front of the barrel.
  const step = 0.01, z0 = box.min.z, n = Math.ceil((box.max.z - z0) / step) + 1;
  const top = new Array(n).fill(-Infinity), bot = new Array(n).fill(Infinity);
  const front = box.min.z + L * 0.03;
  let sumY = 0, cnt = 0;
  const v = new THREE.Vector3();
  const mark = (z, y) => {
    const k = Math.round((z - z0) / step);
    if (k < 0 || k >= n) return;
    if (y > top[k]) top[k] = y;
    if (y < bot[k]) bot[k] = y;
  };
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = false;
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    const ws = [];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      ws.push(v.clone());
      if (v.z <= front) { sumY += v.y; cnt++; }
    }
    // Walk along every triangle edge (a long barrel only has vertices at its two ends).
    const tri = idx ? idx.count : pos.count;
    for (let t = 0; t < tri; t += 3) {
      const ids = idx ? [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)] : [t, t + 1, t + 2];
      for (let e = 0; e < 3; e++) {
        const a = ws[ids[e]], b = ws[ids[(e + 1) % 3]];
        const m = Math.max(1, Math.ceil(Math.abs(b.z - a.z) / step));
        for (let j = 0; j <= m; j++) mark(a.z + (b.z - a.z) * j / m, a.y + (b.y - a.y) * j / m);
      }
    }
  });
  root.userData.muzzle = new THREE.Vector3(0, cnt ? sumY / cnt : 0, box.min.z);
  root.userData.profile = { z0, step, top, bot, back: box.max.z };
  return root;
}

// Highest (or lowest) point of the gun between z a and b.
function profileAt(pr, a, b, which) {
  const lo = Math.max(0, Math.floor((Math.min(a, b) - pr.z0) / pr.step)), hi = Math.min(pr.top.length - 1, Math.ceil((Math.max(a, b) - pr.z0) / pr.step));
  let r = which === 'top' ? -Infinity : Infinity;
  for (let k = lo; k <= hi; k++) {
    const y = which === 'top' ? pr.top[k] : pr.bot[k];
    if (which === 'top' ? y > r : y < r) r = y;
  }
  return Number.isFinite(r) ? r : 0;
}

// An attachment model, turned and scaled like its gun, with its box.
function partModel(id, scale) {
  const src = partScenes[id];
  if (!src) return null;
  const inner = src.clone(true);
  inner.rotation.y = Math.PI / 2;
  inner.scale.setScalar(scale);
  const g = new THREE.Group();
  g.add(inner);
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g);
  inner.position.set(-(box.min.x + box.max.x) / 2, 0, 0); // centred left-right
  g.updateMatrixWorld(true);
  return { g, box: new THREE.Box3().setFromObject(g) };
}

// Put the attachments on a copy of a frame. Returns extra info (new muzzle, scope sight height).
function fitParts(gun, root, frame, mods) {
  const pr = root.userData.profile, scale = gunScale[gun];
  const muzzle = root.userData.muzzle;
  for (const slot of ['optic', 'muzzle', 'under']) {
    const id = mods[slot];
    if (!id) continue;
    const pm = partModel(id, scale);
    if (!pm) continue;
    const { g, box } = pm;
    const len = box.max.z - box.min.z, h = box.max.y - box.min.y;
    if (slot === 'optic') {
      // On top of the gun, a little in front of the hand.
      const cz = -Math.min(0.1, (pr.back) * 0.4);
      const sit = profileAt(pr, cz - len * 0.38, cz + len * 0.38, 'top');
      g.position.set(0, sit - box.min.y - 0.004, cz - (box.min.z + box.max.z) / 2);
      root.userData.sight = sit - 0.004 + h * 0.66; // the middle of the scope's tube
    } else if (slot === 'muzzle') {
      // On the end of the barrel (its threaded nub slides in).
      g.position.set(0, muzzle.y - (box.min.y + box.max.y) / 2, muzzle.z + len * 0.08 - box.max.z);
      root.userData.muzzle = new THREE.Vector3(0, muzzle.y, muzzle.z - len * 0.92);
    } else {
      const p = PARTS[id];
      const reach = muzzle.z; // negative: in front of the hand
      if (p.file.startsWith('Bayonet')) {
        // Under the muzzle, blade forward.
        g.position.set(0, muzzle.y - 0.03 * (scale / 0.16) - (box.min.y + box.max.y) / 2, muzzle.z + len * 0.4 - box.max.z);
      } else {
        // Under the barrel, in front of the magazine: slide forward until the gun's underside
        // is close to the barrel (not a magazine hanging down).
        let cz = p.file === 'Bipod' ? reach * 0.75 : p.file === 'Flashlight' ? reach * 0.72 : reach * 0.5;
        const maxDepth = 0.1 * (scale / 0.16);
        for (let k = 0; k < 12 && muzzle.y - profileAt(pr, cz - len / 2, cz + len / 2, 'bot') > maxDepth && cz > reach * 0.85; k++) cz += (reach * 0.88 - cz) * 0.35;
        const under = profileAt(pr, cz - len / 2, cz + len / 2, 'bot');
        g.position.set(0, under - box.max.y + 0.004, cz - (box.min.z + box.max.z) / 2);
      }
    }
    g.userData.part = slot;
    root.add(g);
  }
}

// Recolour a gun for a skin. skin: entry from GUN_SKINS (progress.js).
export function applySkin(root, skin, portalColor) {
  if (!skin || !skin.color) return root;
  let i = 0;
  root.traverse(o => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    let c;
    if (skin.color === 'rainbow') c = new THREE.Color().setHSL((i++ * 0.17) % 1, 0.85, 0.55);
    else c = new THREE.Color(skin.color === 'portal' ? portalColor : skin.color);
    const lum = o.material.color.getHSL({}).l;
    o.material.color.copy(c).multiplyScalar(0.55 + lum * 0.9); // keep light/dark parts readable
    if (o.material.emissive) {
      if (skin.emissive) o.material.emissive.set(skin.emissive === 'portal' ? portalColor : skin.emissive);
      if (skin.emissive === 'portal') o.material.emissiveIntensity = 0.6;
      if (skin.color === 'rainbow') o.material.emissive.copy(c).multiplyScalar(0.25);
    }
  });
  return root;
}

// A fresh copy of a gun (shares geometry and materials with the template).
// mods: { frame, optic, muzzle, under } from the Gunsmith (optional).
export function gunModel(id, mods = null) {
  const clean = mods && cleanMods(id, mods);
  const frame = clean && frameOf(id, clean);
  const t = (frame && frameTemplates[frame.id]) || templates[id];
  if (!t) return null;
  const c = t.clone(true);
  c.userData.muzzle = t.userData.muzzle.clone();
  c.userData.profile = t.userData.profile;
  if (clean && gunScale[id]) fitParts(id, c, frame, clean);
  return c;
}
