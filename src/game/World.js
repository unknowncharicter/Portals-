import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAPS, PROPS } from './maps.js';
import PROP_BOXES from './prop-boxes.json';
import { mapModel, mapModelLoaded } from './Models.js';

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
      if (child.userData.mapModel) continue; // shared model: keep it for next time
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
    this.props = [];
    map.build({
      box: (min, max, color) => this.addBox(min, max, color),
      mirror: (min, max, color) => this.mirrorX(min, max, color),
      prop: (id, pos, scale, rot, opts) => this.addProp(id, pos, scale, rot, opts),
    });
    const toV = (p) => new THREE.Vector3(p.x, p.y, p.z);
    this.spawns = { 0: map.spawns[0].map(toV), 1: map.spawns[1].map(toV), ffa: map.spawns.ffa.map(toV) };
    this.buildMeshes();
    // Maps made from a 3D model: show it (once it has loaded).
    const show = (model) => {
      if (!model || this.mapId !== id || model.parent === this.group) return;
      model.scale.setScalar(map.model.scale);
      if (map.model.offset) model.position.set(...map.model.offset); else model.position.set(0, 0, 0);
      model.userData.mapModel = true;
      this.group.add(model);
    };
    if (map.model) {
      const ready = mapModelLoaded(map.model.file);
      if (ready) show(ready); else mapModel(map.model.file).then(show);
    }
    // Props: a copy of the model for each one placed.
    for (const pr of this.props) {
      const place = (tpl) => {
        if (!tpl || this.mapId !== id) return;
        const outer = new THREE.Group();
        outer.position.set(...pr.pos); outer.rotation.y = pr.rot;
        const m = tpl.clone(true);
        m.scale.setScalar(pr.scale);
        m.position.set(-pr.off[0] * pr.scale, -pr.off[1] * pr.scale, -pr.off[2] * pr.scale);
        outer.add(m);
        outer.userData.mapModel = true;
        this.group.add(outer);
      };
      const ready = mapModelLoaded(PROPS[pr.id]);
      if (ready) place(ready); else mapModel(PROPS[pr.id]).then(place);
    }
  }

  // A 3D prop with its collision boxes (from prop-boxes.json). pos is where its middle (x, z)
  // and its bottom go, or its top with opts.top (floating islands). rot: quarter turns only.
  addProp(id, pos, scale = 1, rot = 0, opts = {}) {
    const boxes = PROP_BOXES[id];
    if (!boxes || !PROPS[id]) { console.warn('unknown prop', id); return; }
    const b = propBounds(id);
    const off = [(b[0] + b[3]) / 2, opts.top ? b[4] : b[1], (b[2] + b[5]) / 2];
    const c = Math.round(Math.cos(rot)), sn = Math.round(Math.sin(rot));
    if (opts.solid !== false) for (const bx of boxes) {
      const pts = [];
      for (const x of [bx[0], bx[3]]) for (const z of [bx[2], bx[5]]) {
        const lx = (x - off[0]) * scale, lz = (z - off[2]) * scale;
        pts.push([lx * c + lz * sn, -lx * sn + lz * c]);
      }
      const xs = pts.map(p => p[0] + pos[0]), zs = pts.map(p => p[1] + pos[2]);
      this.addBox([Math.min(...xs), (bx[1] - off[1]) * scale + pos[1], Math.min(...zs)], [Math.max(...xs), (bx[4] - off[1]) * scale + pos[1], Math.max(...zs)], null);
    }
    this.props.push({ id, pos, scale, rot, off });
  }

  addBox(min, max, color) {
    this.boxes.push({ min: new THREE.Vector3(...min), max: new THREE.Vector3(...max), color, id: this.boxes.length });
  }

  // Symmetric helper: adds the box and its mirror on the X axis (team sides).
  mirrorX(min, max, color) {
    this.addBox(min, max, color);
    this.addBox([-max[0], min[1], min[2]], [-min[0], max[1], max[2]], color);
  }

  // Spatial grid (XZ cells) so rays and movement only test nearby boxes.
  buildGrid() {
    const C = this.cell = 4;
    this.grid = new Map();
    this.stamp = 0;
    for (const b of this.boxes) {
      b._s = 0;
      for (let cx = Math.floor(b.min.x / C); cx <= Math.floor(b.max.x / C); cx++)
        for (let cz = Math.floor(b.min.z / C); cz <= Math.floor(b.max.z / C); cz++) {
          const k = cellKey(cx, cz);
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push(b);
        }
    }
  }

  // Boxes within r (XZ) of a point.
  near(p, r) {
    const C = this.cell, out = [], st = ++this.stamp;
    for (let cx = Math.floor((p.x - r) / C); cx <= Math.floor((p.x + r) / C); cx++)
      for (let cz = Math.floor((p.z - r) / C); cz <= Math.floor((p.z + r) / C); cz++) {
        const list = this.grid.get(cellKey(cx, cz));
        if (list) for (const b of list) if (b._s !== st) { b._s = st; out.push(b); }
      }
    return out;
  }

  buildMeshes() {
    this.buildGrid();
    const byColor = new Map();
    for (const b of this.boxes) {
      if (!b.color) continue; // invisible collision box (the map has its own model)
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

  // Ray vs the boxes, walking the grid cells along the ray (nearest first).
  // Returns { t, point, normal, box } or null.
  raycast(origin, dir, maxDist = 500) {
    let best = null;
    const C = this.cell, st = ++this.stamp;
    let cx = Math.floor(origin.x / C), cz = Math.floor(origin.z / C);
    const sx = Math.sign(dir.x), sz = Math.sign(dir.z);
    let tx = sx ? ((cx + (sx > 0 ? 1 : 0)) * C - origin.x) / dir.x : Infinity;
    let tz = sz ? ((cz + (sz > 0 ? 1 : 0)) * C - origin.z) / dir.z : Infinity;
    const dx = sx ? C / Math.abs(dir.x) : Infinity, dz = sz ? C / Math.abs(dir.z) : Infinity;
    for (let i = 0; i < 400; i++) {
      const list = this.grid.get(cellKey(cx, cz));
      if (list) for (const b of list) {
        if (b._s === st) continue;
        b._s = st;
        const hit = rayBox(origin, dir, b.min, b.max);
        if (hit && hit.t >= 0 && hit.t <= maxDist && (!best || hit.t < best.t)) best = { ...hit, box: b };
      }
      const exit = Math.min(tx, tz);
      if ((best && best.t <= exit) || exit > maxDist) break;
      if (tx < tz) { cx += sx; tx += dx; } else { cz += sz; tz += dz; }
    }
    if (best) best.point = origin.clone().addScaledVector(dir, best.t);
    return best;
  }
}

const cellKey = (cx, cz) => (cx + 2048) * 4096 + (cz + 2048);

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

const _pb = {};
function propBounds(id) {
  if (_pb[id]) return _pb[id];
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const x of PROP_BOXES[id]) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], x[k]); b[k + 3] = Math.max(b[k + 3], x[k + 3]); }
  return (_pb[id] = b);
}
