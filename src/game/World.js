import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The map is built only from axis-aligned boxes. That keeps collision, raycasts and
// portal placement simple and exact.

function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#d8d8e0'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
  g.strokeStyle = '#9a9aa8'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 125, 125);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Box geometry with UVs scaled to world size (1 texture tile = 2 m).
function worldBoxGeometry(sx, sy, sz, cx, cy, cz) {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  const uv = geo.attributes.uv;
  const n = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    let w, h;
    if (ax > 0.5) { w = sz; h = sy; } else if (ay > 0.5) { w = sx; h = sz; } else { w = sx; h = sy; }
    uv.setXY(i, uv.getX(i) * w / 2, uv.getY(i) * h / 2);
  }
  geo.translate(cx, cy, cz);
  return geo;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.boxes = [];
    this.spawns = { 0: [], 1: [], ffa: [] };
    this.group = new THREE.Group();
    scene.add(this.group);
    this.buildLights();
    this.buildMap();
  }

  buildLights() {
    this.scene.background = new THREE.Color('#8fb8e8');
    this.scene.fog = new THREE.Fog('#8fb8e8', 60, 160);
    const hemi = new THREE.HemisphereLight('#dfefff', '#4a4a5a', 1.6);
    const sun = new THREE.DirectionalLight('#fff4e0', 1.8);
    sun.position.set(30, 60, 20);
    this.scene.add(hemi, sun);
  }

  addBox(min, max, color) {
    this.boxes.push({ min: new THREE.Vector3(...min), max: new THREE.Vector3(...max), color, id: this.boxes.length });
  }

  // Symmetric helper: adds the box and its mirror on the X axis (team sides).
  mirrorX(min, max, color) {
    this.addBox(min, max, color);
    this.addBox([-max[0], min[1], min[2]], [-min[0], max[1], max[2]], color);
  }

  buildMap() {
    const W = 34, D = 24, H = 12;
    const floor = '#8a90a0', wall = '#b8bccb', cover = '#e0a060', dark = '#6a7088', blue = '#6fa0e0', red = '#e07070';

    // Floor and outer walls
    this.addBox([-W, -1, -D], [W, 0, D], floor);
    this.addBox([-W - 1, 0, -D], [-W, H, D], wall);
    this.addBox([W, 0, -D], [W + 1, H, D], wall);
    this.addBox([-W - 1, 0, -D - 1], [W + 1, H, -D], wall);
    this.addBox([-W - 1, 0, D], [W + 1, H, D + 1], wall);

    // Centre structure: a raised block with a wall on top
    this.addBox([-3, 0, -3], [3, 2, 3], dark);
    this.addBox([-0.5, 2, -2.5], [0.5, 5, 2.5], wall);

    // Steps up to the centre block (step height 0.5 so you can walk up)
    for (let i = 0; i < 4; i++) {
      this.addBox([-3 - (4 - i) * 0.8, 0, -1.2], [-3 - (3 - i) * 0.8, 0.5 * (i + 1), 1.2], dark);
      this.addBox([3 + (3 - i) * 0.8, 0, -1.2], [3 + (4 - i) * 0.8, 0.5 * (i + 1), 1.2], dark);
    }

    // Tall pillars (great portal walls)
    for (const z of [-9, 9]) this.mirrorX([9, 0, z - 1], [11, 8, z + 1], wall);

    // Long walls across the middle lanes
    for (const z of [-16, 16]) this.addBox([-5, 0, z - 0.5], [5, 6, z + 0.5], wall);

    // Low cover walls (crouch-height)
    for (const z of [-5, 5]) this.mirrorX([16, 0, z - 2], [17, 1.4, z + 2], cover);
    this.mirrorX([20, 0, -0.6], [24, 1.4, 0.6], cover);

    // Crates
    this.mirrorX([13, 0, 14], [15, 2, 16], cover);
    this.mirrorX([13, 0, -16], [15, 2, -14], cover);
    this.mirrorX([22, 0, 10], [24, 2.5, 12.5], cover);
    this.mirrorX([22, 0, -12.5], [24, 2.5, -10], cover);

    // Raised side platforms with steps
    this.mirrorX([26, 0, 15], [33, 3, 23], dark);
    for (let i = 0; i < 6; i++) this.mirrorX([27, 0, 15 - (6 - i) * 0.7], [32, 0.5 * (i + 1), 15 - (5 - i) * 0.7], dark);
    this.mirrorX([26, 0, -23], [33, 3, -15], dark);
    for (let i = 0; i < 6; i++) this.mirrorX([27, 0, -15 + (5 - i) * 0.7], [32, 0.5 * (i + 1), -15 + (6 - i) * 0.7], dark);

    // Spawn walls (colour-coded team sides)
    this.addBox([-30, 0, -6], [-29, 4, 6], blue);
    this.addBox([29, 0, -6], [30, 4, 6], red);

    // Spawns
    this.spawns[0] = [new THREE.Vector3(-27, 0, -3), new THREE.Vector3(-27, 0, 3)];
    this.spawns[1] = [new THREE.Vector3(27, 0, 3), new THREE.Vector3(27, 0, -3)];
    this.spawns.ffa = [new THREE.Vector3(-27, 0, -3), new THREE.Vector3(27, 0, 3), new THREE.Vector3(-20, 0, 20), new THREE.Vector3(20, 0, -20)];

    this.buildMeshes();
  }

  buildMeshes() {
    const tex = gridTexture();
    const byColor = new Map();
    for (const b of this.boxes) {
      const s = new THREE.Vector3().subVectors(b.max, b.min);
      const c = new THREE.Vector3().addVectors(b.max, b.min).multiplyScalar(0.5);
      const geo = worldBoxGeometry(s.x, s.y, s.z, c.x, c.y, c.z);
      if (!byColor.has(b.color)) byColor.set(b.color, []);
      byColor.get(b.color).push(geo);
    }
    for (const [color, geos] of byColor) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ color, map: tex }));
      this.group.add(mesh);
    }
  }

  // Ray vs all boxes. Returns { t, point, normal, box } or null.
  raycast(origin, dir, maxDist = 500) {
    let best = null;
    for (const b of this.boxes) {
      const hit = rayBox(origin, dir, b.min, b.max);
      if (hit && hit.t >= 0 && hit.t <= maxDist && (!best || hit.t < best.t)) best = { ...hit, box: b };
    }
    if (best) best.point = origin.clone().addScaledVector(dir, best.t);
    return best;
  }
}

// Slab method. Only reports hits where the ray starts outside the box.
export function rayBox(o, d, min, max) {
  let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 0;
  for (let i = 0; i < 3; i++) {
    const oi = o.getComponent(i), di = d.getComponent(i);
    const lo = min.getComponent(i), hi = max.getComponent(i);
    if (Math.abs(di) < 1e-9) {
      if (oi < lo || oi > hi) return null;
      continue;
    }
    let t1 = (lo - oi) / di, t2 = (hi - oi) / di;
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0 || axis < 0 || tmin < 0) return null;
  const normal = new THREE.Vector3();
  normal.setComponent(axis, sign);
  return { t: tmin, normal };
}
