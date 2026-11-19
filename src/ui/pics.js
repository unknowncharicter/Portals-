import * as THREE from 'three';
import { buildCharacterMesh } from '../game/Look.js';

// Small pictures of your character wearing an item (Character tab), rendered once and cached.
// view: 'body' (whole character), 'head' (hats, face items) or 'back' (back items, from behind).
const cache = new Map();
let R = null;

function renderer() {
  if (R) return R;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.setPixelRatio(1);
  r.setSize(128, 128, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#444a55', 2.4));
  const d = new THREE.DirectionalLight('#ffffff', 1.8); d.position.set(2, 3, 3); scene.add(d);
  const back = new THREE.DirectionalLight('#ffffff', 1.2); back.position.set(-2, 2, -3); scene.add(back);
  R = { r, scene, cam: new THREE.PerspectiveCamera(30, 1, 0.05, 50) };
  return R;
}

export function charPic(look, view = 'body') {
  const key = JSON.stringify([look.model, look.hat, look.face, look.back, look.shirt, look.pants, look.skin, view]);
  if (cache.has(key)) return cache.get(key);
  let url = null;
  try {
    const { r, scene, cam } = renderer();
    const parts = buildCharacterMesh(look, { tag: false });
    const g = parts.group;
    // Stand in the idle pose (not the model's T-pose).
    if (parts.body) for (let i = 0; i < 4; i++) parts.body.update(0.25, { vel: new THREE.Vector3(), yaw: 0, pitch: 0, grounded: true, crouched: false, sliding: false });
    if (parts.gunHolder) parts.gunHolder.visible = false;
    g.rotation.y = view === 'back' ? 0.35 : Math.PI - 0.35; // three-quarter view
    scene.add(g);
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    const h = box.max.y - box.min.y;
    // Part of the character to frame.
    const top = box.max.y, y0 = view === 'body' ? box.min.y : view === 'head' ? top - h * 0.3 : top - h * 0.6;
    const cy = (top + y0) / 2, size = (top - y0) * 1.12;
    const dist = size / 2 / Math.tan((cam.fov / 2) * Math.PI / 180);
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    cam.position.set(cx, cy + size * 0.05, cz + dist);
    cam.lookAt(cx, cy, cz);
    r.render(scene, cam);
    url = r.domElement.toDataURL('image/png');
    scene.remove(g);
  } catch (e) { url = null; }
  cache.set(key, url);
  return url;
}
