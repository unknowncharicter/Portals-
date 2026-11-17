import * as THREE from 'three';

// Small pictures for the lobby cards, rendered once from the real game assets.
export const thumbs = { guns: {}, maps: {} };

// Side view of every gun (muzzle pointing right) on a transparent background.
export function makeGunThumbs(gunModel, ids) {
  let r;
  try {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (e) { return; }
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.setPixelRatio(1);
  r.setSize(220, 110, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#555566', 2.6));
  const d = new THREE.DirectionalLight('#ffffff', 2); d.position.set(3, 4, 2); scene.add(d);
  for (const id of ids) {
    const g = gunModel(id);
    if (!g) continue;
    scene.add(g);
    const box = new THREE.Box3().setFromObject(g);
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const half = Math.max(s.z / 2 / 2, s.y / 2) * 1.15;          // fit 2:1 frame
    const cam = new THREE.OrthographicCamera(-half * 2, half * 2, half, -half, 0.01, 10);
    cam.position.set(c.x + 2, c.y + 0.25, c.z);
    cam.lookAt(c);
    r.render(scene, cam);
    thumbs.guns[id] = r.domElement.toDataURL('image/png');
    scene.remove(g);
  }
  r.dispose();
  r.forceContextLoss?.();
}

// A wide shot of each map, rendered with the main renderer into an off-screen target.
export function makeMapThumbs(renderer, world, scene, maps, ids) {
  const W = 320, H = 200;
  const rt = new THREE.WebGLRenderTarget(W, H);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const cam = new THREE.PerspectiveCamera(55, W / H, 0.1, 400);
  const buf = new Uint8Array(W * H * 4);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const prev = world.mapId;
  for (const id of ids) {
    world.load(id);
    const v = maps[id].view;
    cam.position.set(v.r * 0.75, v.h * 1.05, v.r * 0.55);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); // flip
    ctx.putImageData(img, 0, 0);
    thumbs.maps[id] = canvas.toDataURL('image/jpeg', 0.85);
  }
  renderer.setRenderTarget(null);
  rt.dispose();
  if (prev) world.load(prev);
}
