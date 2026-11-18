import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { setCharacterTemplate, addCharacterTemplate } from './CharacterModel.js';
import { retargetClips, MIXAMO_TO_QUAT, fixQuaterniusRig } from './Retarget.js';

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

// Gun models (GLB). The source models point their barrel along +X; we turn them to face -Z
// (forward in three.js), scale them to a real-world length, and put the grip at the origin.
const GUNS = {
  ar:       { file: 'ar.glb',       length: 0.85, hold: 0.36 },
  smg:      { file: 'smg.glb',      length: 0.6,  hold: 0.45 },
  shotgun:  { file: 'shotgun.glb',  length: 0.95, hold: 0.38 },
  sniper:   { file: 'sniper.glb',   length: 1.15, hold: 0.33 },
  burst:    { file: 'burst.glb',    length: 0.8,  hold: 0.55 },
  pistol:   { file: 'pistol.glb',   length: 0.24, hold: 0.62 },
  revolver: { file: 'revolver.glb', length: 0.3,  hold: 0.62 },
};

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
const hatTemplates = {}, faceTemplates = {};

const templates = {};
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
  loading = Promise.all([character, ...hats, ...faces, ...Object.entries(GUNS).map(async ([id, cfg]) => {
    try {
      const gltf = await loader.loadAsync(`models/guns/${cfg.file}`);
      templates[id] = normalize(gltf.scene, cfg);
    } catch (e) {
      console.warn('Could not load gun model', id, e);
    }
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
  inner.rotation.y = cfg.rotY;
  const root = new THREE.Group();
  root.add(inner);
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);
  inner.scale.setScalar(cfg.width / (box.max.x - box.min.x));
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

function normalize(scene, cfg) {
  const inner = scene;
  inner.rotation.y = Math.PI / 2; // +X -> -Z
  const root = new THREE.Group();
  root.add(inner);
  root.updateMatrixWorld(true);

  let box = new THREE.Box3().setFromObject(root);
  const len = box.max.z - box.min.z;
  inner.scale.multiplyScalar(cfg.length / len);
  root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(root);

  // Grip point: `hold` of the way from the back of the gun, at mid height.
  const L = box.max.z - box.min.z;
  const grip = new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z - cfg.hold * L);
  inner.position.sub(grip);
  root.updateMatrixWorld(true);

  // Muzzle: average height of the vertices at the very front of the barrel.
  box = new THREE.Box3().setFromObject(root);
  const front = box.min.z + L * 0.03;
  let sumY = 0, n = 0;
  const v = new THREE.Vector3();
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = false;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.z <= front) { sumY += v.y; n++; }
    }
  });
  root.userData.muzzle = new THREE.Vector3(0, n ? sumY / n : 0, box.min.z);
  return root;
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
export function gunModel(id) {
  const t = templates[id];
  if (!t) return null;
  const c = t.clone(true);
  c.userData.muzzle = t.userData.muzzle.clone();
  return c;
}
