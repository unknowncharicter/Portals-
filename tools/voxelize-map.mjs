// Turns a GLB map model into collision boxes for the game (see MAPS.compound in src/game/maps.js).
// Needs: npm i -D @gltf-transform/core @gltf-transform/extensions
// Usage: node tools/voxelize-map.mjs map.glb boxes.json [voxel=0.05] [scale=2] [skipNameRegex] [skipThinnerThan]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'fs';
const [,, inp, out, vs = '0.05', sc = '2', excl = '', thinS = '0'] = process.argv;
const THIN = +thinS;
const V = +vs, S = +sc, EX = excl ? new RegExp(excl) : null;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
const tris = []; let skipped = 0;
const mul = (m, p) => [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  if (EX && EX.test(node.getName())) continue;
  const m = node.getWorldMatrix();
  if (THIN) { // skip flat decorations (doors, windows, signs)
    const lo = [1e9,1e9,1e9], hi = [-1e9,-1e9,-1e9];
    for (const prim of mesh.listPrimitives()) { const pos = prim.getAttribute('POSITION'); for (let i = 0; i < pos.getCount(); i++) { const p = mul(m, pos.getElement(i, [])); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } } }
    if (Math.min(hi[0]-lo[0], hi[1]-lo[1], hi[2]-lo[2]) < THIN) { skipped++; continue; }
  }
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
    const n = idx ? idx.getCount() : pos.getCount();
    const P = []; for (let i = 0; i < pos.getCount(); i++) P.push(mul(m, pos.getElement(i, [])));
    for (const p of P) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
    for (let i = 0; i < n; i += 3) tris.push([P[idx ? idx.getScalar(i) : i], P[idx ? idx.getScalar(i + 1) : i + 1], P[idx ? idx.getScalar(i + 2) : i + 2]]);
  }
}
const pad = 2;
const o = min.map(v => v - pad * V);
const N = max.map((v, k) => Math.ceil((v - o[k]) / V) + pad * 2);
const [NX, NY, NZ] = N;
const id = (x, y, z) => (y * NZ + z) * NX + x;
const g = new Uint8Array(NX * NY * NZ); // 1 = surface/solid, 2 = outside air
// Rasterize: sample each triangle densely.
for (const [a, b, c] of tris) {
  const e1 = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], e2 = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
  const l = Math.max(Math.hypot(...e1), Math.hypot(...e2), Math.hypot(c[0]-b[0], c[1]-b[1], c[2]-b[2]));
  const steps = Math.max(1, Math.ceil(l / (V * 0.5)));
  for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps - i; j++) {
    const u = i / steps, w = j / steps;
    const x = Math.floor((a[0] + e1[0]*u + e2[0]*w - o[0]) / V), y = Math.floor((a[1] + e1[1]*u + e2[1]*w - o[1]) / V), z = Math.floor((a[2] + e1[2]*u + e2[2]*w - o[2]) / V);
    g[id(x, y, z)] = 1;
  }
}
// Flood the outside air from the top and sides; anything left unreached is inside a solid.
const stack = [];
const push = (x, y, z) => { if (x < 0 || y < 0 || z < 0 || x >= NX || y >= NY || z >= NZ) return; const i = id(x, y, z); if (g[i]) return; g[i] = 2; stack.push(x, y, z); };
for (let x = 0; x < NX; x++) for (let z = 0; z < NZ; z++) push(x, NY - 1, z);
for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) { push(x, y, 0); push(x, y, NZ - 1); }
for (let y = 0; y < NY; y++) for (let z = 0; z < NZ; z++) { push(0, y, z); push(NX - 1, y, z); }
while (stack.length) { const z = stack.pop(), y = stack.pop(), x = stack.pop(); push(x+1,y,z); push(x-1,y,z); push(x,y+1,z); push(x,y-1,z); push(x,y,z+1); push(x,y,z-1); }
let solid = 0; for (let i = 0; i < g.length; i++) if (g[i] !== 2) { g[i] = 1; solid++; } else g[i] = 0;
// Greedy merge into boxes.
const used = new Uint8Array(g.length);
const boxes = [];
const ok = (x, y, z) => g[id(x, y, z)] && !used[id(x, y, z)];
for (let y = 0; y < NY; y++) for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++) {
  if (!ok(x, y, z)) continue;
  let x2 = x; while (x2 + 1 < NX && ok(x2 + 1, y, z)) x2++;
  let z2 = z; outerZ: while (z2 + 1 < NZ) { for (let xi = x; xi <= x2; xi++) if (!ok(xi, y, z2 + 1)) break outerZ; z2++; }
  let y2 = y; outerY: while (y2 + 1 < NY) { for (let zi = z; zi <= z2; zi++) for (let xi = x; xi <= x2; xi++) if (!ok(xi, y2 + 1, zi)) break outerY; y2++; }
  for (let yi = y; yi <= y2; yi++) for (let zi = z; zi <= z2; zi++) for (let xi = x; xi <= x2; xi++) used[id(xi, yi, zi)] = 1;
  const r = (v) => Math.round(v * 1000) / 1000;
  boxes.push([r((o[0] + x * V) * S), r((o[1] + y * V) * S), r((o[2] + z * V) * S), r((o[0] + (x2 + 1) * V) * S), r((o[1] + (y2 + 1) * V) * S), r((o[2] + (z2 + 1) * V) * S)]);
}
fs.writeFileSync(out, JSON.stringify(boxes));
console.log('skipped', skipped, 'tris', tris.length, 'grid', N.join('x'), 'solid', solid, 'boxes', boxes.length, 'bounds', min.map(v=>v.toFixed(2)), max.map(v=>v.toFixed(2)));
