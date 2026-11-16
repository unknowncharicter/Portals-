import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

const templates = {};
let loading = null;

export function loadModels() {
  if (loading) return loading;
  const loader = new GLTFLoader();
  loading = Promise.all(Object.entries(GUNS).map(async ([id, cfg]) => {
    try {
      const gltf = await loader.loadAsync(`models/guns/${cfg.file}`);
      templates[id] = normalize(gltf.scene, cfg);
    } catch (e) {
      console.warn('Could not load gun model', id, e);
    }
  }));
  // Blocky guns built in code (no model file needed).
  templates.crossbow = makeCrossbow();
  templates.rocket = makeRocket();
  return loading;
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
