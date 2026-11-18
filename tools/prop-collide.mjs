// Needs: npm i -D @gltf-transform/core @gltf-transform/extensions. Output goes into src/game/prop-boxes.json.
// Collision boxes for a prop: an exact walkable top (height map, merged into flat rectangles)
// plus a few coarse boxes for the body under it. Model units (no scale).
// usage: node propcollide.mjs in.glb out.json cells(across the longest side) [slabFraction=0.15]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'fs';
const [,, inp, out, cellsS = '14', slabS = '0.15'] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
const mul = (m, p) => [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const tris = []; const min = [1e9,1e9,1e9], max = [-1e9,-1e9,-1e9];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
    const P = []; for (let i = 0; i < pos.getCount(); i++) P.push(mul(m, pos.getElement(i, [])));
    for (const p of P) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
    const n = idx ? idx.getCount() : pos.getCount();
    for (let i = 0; i < n; i += 3) tris.push([P[idx ? idx.getScalar(i) : i], P[idx ? idx.getScalar(i + 1) : i + 1], P[idx ? idx.getScalar(i + 2) : i + 2]]);
  }
}
const H = max[1] - min[1];
const C = Math.max(max[0] - min[0], max[2] - min[2]) / +cellsS;
const NX = Math.ceil((max[0] - min[0]) / C), NZ = Math.ceil((max[2] - min[2]) / C);
const top = new Float64Array(NX * NZ).fill(-Infinity), bot = new Float64Array(NX * NZ).fill(Infinity);
for (const [a, b, c] of tris) {
  const e1 = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], e2 = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
  const l = Math.max(Math.hypot(...e1), Math.hypot(...e2));
  const steps = Math.max(1, Math.ceil(l / (C * 0.25)));
  for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps - i; j++) {
    const u = i / steps, w = j / steps;
    const x = a[0] + e1[0]*u + e2[0]*w, y = a[1] + e1[1]*u + e2[1]*w, z = a[2] + e1[2]*u + e2[2]*w;
    const cx = Math.min(NX - 1, Math.floor((x - min[0]) / C)), cz = Math.min(NZ - 1, Math.floor((z - min[2]) / C));
    const k = cz * NX + cx;
    if (y > top[k]) top[k] = y; if (y < bot[k]) bot[k] = y;
  }
}
// Only columns fully covered by the model count (avoid edge columns hanging in the air).
const boxes = [];
const used = new Uint8Array(NX * NZ);
const tol = Math.max(H * 0.02, C * 0.1), slab = Math.max(H * +slabS, C * 0.5);
const r = (v) => Math.round(v * 10000) / 10000;
for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++) {
  const k = z * NX + x;
  if (used[k] || top[k] === -Infinity) continue;
  const t0 = top[k];
  const ok = (xx, zz) => { const kk = zz * NX + xx; return !used[kk] && top[kk] !== -Infinity && Math.abs(top[kk] - t0) < tol; };
  let x2 = x; while (x2 + 1 < NX && ok(x2 + 1, z)) x2++;
  let z2 = z; outer: while (z2 + 1 < NZ) { for (let xi = x; xi <= x2; xi++) if (!ok(xi, z2 + 1)) break outer; z2++; }
  let tMin = Infinity, bMax = -Infinity, bMin = Infinity;
  for (let zi = z; zi <= z2; zi++) for (let xi = x; xi <= x2; xi++) { const kk = zi * NX + xi; used[kk] = 1; tMin = Math.min(tMin, top[kk]); bMax = Math.max(bMax, bot[kk]); bMin = Math.min(bMin, bot[kk]); }
  const x0 = min[0] + x * C, x1 = min[0] + (x2 + 1) * C, z0 = min[2] + z * C, z1 = min[2] + (z2 + 1) * C;
  // Walkable slab at the top, and the body under it (down to the highest bottom, so it stays inside).
  const slabBot = Math.max(bMin, tMin - slab);
  boxes.push([r(x0), r(slabBot), r(z0), r(x1), r(tMin), r(z1)]);
}
// Body: columns grouped by how deep they go (a stepped cone for floating islands).
const used2 = new Uint8Array(NX * NZ);
const tolB = H * 0.12;
for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++) {
  const k = z * NX + x;
  if (used2[k] || top[k] === -Infinity) continue;
  const b0 = bot[k];
  const ok = (xx, zz) => { const kk = zz * NX + xx; return !used2[kk] && top[kk] !== -Infinity && Math.abs(bot[kk] - b0) < tolB; };
  let x2 = x; while (x2 + 1 < NX && ok(x2 + 1, z)) x2++;
  let z2 = z; outer2: while (z2 + 1 < NZ) { for (let xi = x; xi <= x2; xi++) if (!ok(xi, z2 + 1)) break outer2; z2++; }
  let bMax = -Infinity, tMin = Infinity;
  for (let zi = z; zi <= z2; zi++) for (let xi = x; xi <= x2; xi++) { const kk = zi * NX + xi; used2[kk] = 1; bMax = Math.max(bMax, bot[kk]); tMin = Math.min(tMin, top[kk]); }
  const hiY = tMin - slab;                       // stay under the walkable slab
  if (hiY - bMax < H * 0.08) continue;
  boxes.push([r(min[0] + x * C), r(bMax), r(min[2] + z * C), r(min[0] + (x2 + 1) * C), r(hiY), r(min[2] + (z2 + 1) * C)]);
}
fs.writeFileSync(out, JSON.stringify(boxes));
console.log('tris', tris.length, 'cells', NX + 'x' + NZ, 'boxes', boxes.length, 'size', (max[0]-min[0]).toFixed(2), H.toFixed(2), (max[2]-min[2]).toFixed(2));
