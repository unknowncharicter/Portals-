import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Gun models (GLB). The source models point their barrel along +X; we turn them to face -Z
// (forward in three.js), scale them to a real-world length, and put the grip at the origin.
const GUNS = {
  ar:       { file: 'ar.glb',       length: 0.85, hold: 0.36 },
  smg:      { file: 'smg.glb',      length: 0.6,  hold: 0.45 },
  shotgun:  { file: 'shotgun.glb',  length: 0.95, hold: 0.38 },
  sniper:   { file: 'sniper.glb',   length: 1.15, hold: 0.33 },
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
  return loading;
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

// A fresh copy of a gun (shares geometry and materials with the template).
export function gunModel(id) {
  const t = templates[id];
  if (!t) return null;
  const c = t.clone(true);
  c.userData.muzzle = t.userData.muzzle.clone();
  return c;
}
