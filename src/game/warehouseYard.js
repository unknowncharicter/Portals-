// Scenery around the Warehouse map: an industrial yard you see through the open end, the windows
// and the holes in the roof. Visual only (no collision, portals can't go on it), and everything is
// out of reach behind the map's invisible walls.

function canvasTex(THREE, w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  return t;
}

// Speckled surface (asphalt, concrete, grass).
function speckle(base, dots, n) {
  return (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      g.fillStyle = dots[i % dots.length];
      g.globalAlpha = 0.25 + Math.random() * 0.35;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    g.globalAlpha = 1;
  };
}

// Corrugated metal siding: vertical ribs.
function siding(base) {
  return (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) {
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x, 0, 3, h);
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x + 5, 0, 2, h);
    }
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 6; i++) g.fillRect(Math.random() * w, h * 0.7 + Math.random() * h * 0.3, 2, h * 0.3); // streaks
  };
}

// The warehouse's own floor is at about -0.1 m, so the yard sits a little below it.
const BASE = -0.16;

export function warehouseYard(THREE, addRaw, propRaw) {
  const root = new THREE.Group();
  root.position.y = BASE;
  addRaw(root);
  const add = (o) => root.add(o);
  const prop = (id, pos, ...rest) => propRaw(id, [pos[0], pos[1] + BASE, pos[2]], ...rest);
  const lam = (o) => new THREE.MeshLambertMaterial(o);
  const box = (w, h, d, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.rotation.y = ry;
    add(m);
    return m;
  };

  // ---- Ground: asphalt yard, a concrete apron round the building, grass further out ----
  const asphalt = lam({ map: canvasTex(THREE, 256, 256, speckle('#4a4c52', ['#6a6c72', '#2e3036', '#7a7468'], 2600), [40, 40]) });
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), asphalt);
  yard.rotation.x = -Math.PI / 2; yard.position.y = -0.03;
  add(yard);
  const grass = lam({ map: canvasTex(THREE, 256, 256, speckle('#5f8a43', ['#7aa652', '#4a6e34', '#8a9a50'], 3000), [60, 60]) });
  const field = new THREE.Mesh(new THREE.RingGeometry(99, 400, 48, 1), grass);
  field.rotation.x = -Math.PI / 2; field.position.y = -0.08;
  add(field);
  const concrete = lam({ map: canvasTex(THREE, 256, 256, speckle('#9a9a96', ['#b4b4ae', '#7c7c78'], 1800), [8, 12]) });
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(34, 54), concrete);
  apron.rotation.x = -Math.PI / 2; apron.position.y = 0;
  add(apron);

  // Painted lines: parking bays and a lane in front of the open end.
  const paint = new THREE.MeshBasicMaterial({ color: '#e8d27a' });
  const line = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), paint); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); add(m); };
  for (let i = -4; i <= 4; i++) line(0.2, 6, i * 3.4, 33);                // truck bays outside the open end
  line(31, 0.2, 0, 36);
  for (let z = 45; z < 95; z += 6) line(0.25, 3, 0, z);                  // dashed lane leading away
  for (const sx of [-1, 1]) for (let z = -18; z <= 18; z += 3) line(5, 0.15, sx * 24, z); // car spaces down the sides

  // ---- Chain-link fence round the yard ----
  const postMat = lam({ color: '#8d939b' });
  const mesh = canvasTex(THREE, 64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(190,196,204,0.9)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
  });
  const F = { x: 52, z: 70, h: 3 };
  const fenceSide = (len, x, z, ry) => {
    const t = mesh.clone(); t.needsUpdate = true; t.repeat.set(len / 1.2, F.h / 1.2);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, F.h), new THREE.MeshLambertMaterial({ map: t, transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 }));
    p.position.set(x, F.h / 2, z); p.rotation.y = ry;
    add(p);
    const n = Math.round(len / 4);
    for (let i = 0; i <= n; i++) {
      const u = -len / 2 + (i * len) / n;
      box(0.12, F.h + 0.2, 0.12, postMat, x + Math.cos(ry) * u, (F.h + 0.2) / 2, z - Math.sin(ry) * u);
    }
    const rail = box(len, 0.08, 0.08, postMat, x, F.h, z, ry);
    return rail;
  };
  fenceSide(F.x * 2, 0, -F.z, 0);
  fenceSide(F.z * 2, -F.x, 0, Math.PI / 2);
  fenceSide(F.z * 2, F.x, 0, Math.PI / 2);
  // Front fence with a gate gap for the lane.
  fenceSide(F.x - 5, -(F.x + 5) / 2, F.z, 0);
  fenceSide(F.x - 5, (F.x + 5) / 2, F.z, 0);

  // ---- Shipping containers stacked round the yard ----
  const tints = ['#3a7cc0', '#d8603a', '#4ea05a', '#c0503c', '#d8a030', '#7a5ab0', '#2f8f8a', '#b8b8b0'];
  let ti = 0;
  const C = (x, y, z, rot) => prop('container', [x, y, z], 1.9, rot, { tint: tints[ti++ % tints.length], solid: false });
  const stack = (x, z, rot, rows, cols, gap) => {
    for (let c = 0; c < cols; c++) {
      const h = rows - (c % 2 === 1 ? 1 : 0);
      for (let r = 0; r < Math.max(1, h); r++) {
        const off = c * gap;
        C(x + (rot ? 0 : off), r * 2.43, z + (rot ? off : 0), rot);
      }
    }
  };
  stack(-30, 30, 0, 3, 3, 2.6);           // left of the open end
  stack(24, 34, 0, 2, 4, 2.6);            // right of the open end
  stack(-38, -10, Math.PI / 2, 2, 3, 2.6);
  stack(36, -26, Math.PI / 2, 3, 2, 2.6);
  stack(-20, -40, 0, 1, 4, 2.6);
  stack(18, 56, Math.PI / 2, 2, 2, 2.6);

  // ---- Neighbouring warehouses ----
  const roofMat = lam({ color: '#5a6068' });
  const shed = (x, z, w, d, h, color, ry = 0) => {
    const mat = lam({ map: canvasTex(THREE, 128, 64, siding(color), [w / 4, 1]) });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    body.position.y = h / 2; g.add(body);
    // Pitched roof.
    const roofH = w * 0.18;
    const shape = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.4, 0), new THREE.Vector2(w / 2 + 0.4, 0), new THREE.Vector2(0, roofH)]);
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: d + 0.8, bevelEnabled: false }), roofMat);
    roof.position.set(0, h, -d / 2 - 0.4); g.add(roof);
    // Big roller door and a few windows.
    const door = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(8, w * 0.4), h * 0.6), lam({ map: canvasTex(THREE, 64, 64, (c, W, H) => { c.fillStyle = '#8a8e94'; c.fillRect(0, 0, W, H); c.fillStyle = 'rgba(0,0,0,.2)'; for (let y = 0; y < H; y += 5) c.fillRect(0, y, W, 1); }) }));
    door.position.set(0, h * 0.3, d / 2 + 0.02); g.add(door);
    const win = lam({ color: '#a8c4d8', emissive: '#203040' });
    for (let i = -1; i <= 1; i += 2) { const wn = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.15, 1.2), win); wn.position.set(i * w * 0.32, h * 0.75, d / 2 + 0.02); g.add(wn); }
    g.position.set(x, 0, z); g.rotation.y = ry;
    add(g);
  };
  shed(0, 92, 46, 26, 14, '#b8b2a4', Math.PI);    // straight out of the open end, across the lane
  shed(-70, 40, 30, 40, 12, '#7d93a8', Math.PI / 2);
  shed(72, 10, 34, 46, 13, '#a65a48', -Math.PI / 2);
  shed(-62, -60, 40, 28, 15, '#8a9a7a', 0);
  shed(48, -88, 50, 30, 16, '#9aa0a8', 0);

  // ---- Semi trailers parked at the bays ----
  const trailerMat = lam({ map: canvasTex(THREE, 128, 64, siding('#d8dade'), [3, 1]) });
  const wheelMat = lam({ color: '#202226' });
  const trailer = (x, z, ry, cab) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.8, 12), trailerMat); body.position.y = 2.6; g.add(body);
    for (const wz of [-4.4, -3.2]) for (const wx of [-1, 1]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 12), wheelMat);
      wh.rotation.z = Math.PI / 2; wh.position.set(wx * 1.05, 0.5, wz); g.add(wh);
    }
    if (cab) {
      const cabM = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.6, 3), lam({ color: cab })); cabM.position.set(0, 1.9, 7.8); g.add(cabM);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.9), lam({ color: '#3a4858' })); glass.position.set(0, 2.5, 9.31); g.add(glass);
      for (const wx of [-1, 1]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 12), wheelMat); wh.rotation.z = Math.PI / 2; wh.position.set(wx * 1.05, 0.5, 7.6); g.add(wh); }
    }
    g.position.set(x, 0, z); g.rotation.y = ry;
    add(g);
  };
  trailer(-6.8, 42, 0, '#c03a2e');
  trailer(10.2, 41, 0, null);
  trailer(-42, 58, Math.PI / 2, '#2e5fa8');

  // ---- Floodlight poles ----
  const pole = lam({ color: '#6c727a' });
  const lampMat = new THREE.MeshBasicMaterial({ color: '#fff4cc' });
  for (const [x, z] of [[-18, 26], [18, 26], [-20, -26], [20, -26], [-40, 50], [40, 50], [0, 64]]) {
    box(0.25, 10, 0.25, pole, x, 5, z);
    box(1.6, 0.12, 0.12, pole, x, 10, z);
    for (const s of [-1, 1]) box(0.5, 0.25, 0.4, lampMat, x + s * 0.7, 9.85, z);
  }

  // ---- Barrels, pallets and jersey barriers for detail near the building ----
  const barrelMats = ['#2f6fb0', '#c84a2a', '#3a8a4a'].map(c => lam({ color: c }));
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.1, 14);
  for (const [x, z, k] of [[16, 28, 0], [16.9, 28.3, 1], [16.4, 29.1, 0], [-16, -26, 2], [-16.8, -25.6, 0], [17, -27, 1]]) {
    const b = new THREE.Mesh(barrelGeo, barrelMats[k]); b.position.set(x, 0.5, z); add(b);
  }
  const palletMat = lam({ color: '#a8824e' });
  for (const [x, z, n] of [[-17, 27, 4], [-17.5, 30, 2], [17, 31, 3], [15, -28, 5]]) for (let i = 0; i < n; i++) box(1.2, 0.14, 1.2, palletMat, x, 0.07 + i * 0.15, z, i * 0.06);
  const barrier = lam({ color: '#c8c4bc' });
  for (let i = 0; i < 6; i++) box(2, 0.8, 0.6, barrier, -26 + i * 2.1, 0.35, 64);

  // ---- Trees and distant hills on the horizon ----
  const treeSpots = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + (i % 3) * 0.07, r = 108 + (i % 4) * 9;
    treeSpots.push([Math.cos(a) * r, Math.sin(a) * r * 1.15]);
  }
  for (const [x, z] of treeSpots) prop('tree', [x, 0, z], 20 + Math.random() * 8, Math.random() * 6, { solid: false });
  for (const [x, z] of [[-60, 80], [65, 75], [-80, -30], [85, -45], [-30, -85], [25, 95]]) prop('tree', [x, 0, z], 14 + Math.random() * 5, Math.random() * 6, { solid: false });
  const hillMat = lam({ color: '#6f8a62' });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3, r = 170;
    const h = new THREE.Mesh(new THREE.SphereGeometry(45 + (i % 3) * 15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    h.scale.y = 0.35 + (i % 2) * 0.15;
    h.position.set(Math.cos(a) * r, -2, Math.sin(a) * r);
    add(h);
  }
}
