import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAPS } from './maps.js';

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
    this.tex = gridTexture();
    this.hemi = new THREE.HemisphereLight('#dfefff', '#4a4a5a', 1.6);
    this.sun = new THREE.DirectionalLight('#fff4e0', 1.8);
    this.sun.position.set(30, 60, 20);
    scene.add(this.hemi, this.sun);
    this.mapId = null;
    this.load('arena');
  }

  load(id) {
    const map = MAPS[id] || MAPS.arena;
    if (this.mapId === id) return;
    this.mapId = id;
    this.map = map;
    // Clear the old map.
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      child.geometry.dispose();
      child.material.dispose();
    }
    this.boxes = [];
    const t = map.theme;
    this.scene.background = new THREE.Color(t.sky);
    this.scene.fog = new THREE.Fog(t.sky, t.fog[0], t.fog[1]);
    this.hemi.intensity = t.hemi;
    this.sun.intensity = t.sun;
    this.killY = map.killY ?? -40;
    map.build({
      box: (min, max, color) => this.addBox(min, max, color),
      mirror: (min, max, color) => this.mirrorX(min, max, color),
    });
    const toV = (p) => new THREE.Vector3(p.x, p.y, p.z);
    this.spawns = { 0: map.spawns[0].map(toV), 1: map.spawns[1].map(toV), ffa: map.spawns.ffa.map(toV) };
    this.buildMeshes();
  }

  addBox(min, max, color) {
    this.boxes.push({ min: new THREE.Vector3(...min), max: new THREE.Vector3(...max), color, id: this.boxes.length });
  }

  // Symmetric helper: adds the box and its mirror on the X axis (team sides).
  mirrorX(min, max, color) {
    this.addBox(min, max, color);
    this.addBox([-max[0], min[1], min[2]], [-min[0], max[1], max[2]], color);
  }

  buildMeshes() {
    const byColor = new Map();
    for (const b of this.boxes) {
      const s = new THREE.Vector3().subVectors(b.max, b.min);
      const c = new THREE.Vector3().addVectors(b.max, b.min).multiplyScalar(0.5);
      const geo = worldBoxGeometry(s.x, s.y, s.z, c.x, c.y, c.z);
      if (!byColor.has(b.color)) byColor.set(b.color, []);
      byColor.get(b.color).push(geo);
    }
    for (const [color, geos] of byColor) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ color, map: this.tex }));
      this.group.add(mesh);
      for (const g of geos) g.dispose();
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
