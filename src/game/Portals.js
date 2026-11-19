import * as THREE from 'three';

export const PORTAL_W = 1.6;
export const PORTAL_H = 2.6;
export const PORTAL_LIFETIME = 60;     // seconds, then it closes no matter what
const SURFACE_OFFSET = 0.012;          // lift off the wall to avoid z-fighting
const ROT_Y_PI = new THREE.Matrix4().makeRotationY(Math.PI);

// Shared by all portal surfaces. `flat` = 1 while rendering the view *inside* a portal,
// so portals seen through portals show a solid colour instead of sampling textures.
export const portalShared = {
  flat: { value: 0 },
  time: { value: 0 },
  resolution: { value: new THREE.Vector2(1, 1) },
};

const surfaceVert = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;
const surfaceFrag = /* glsl */`
  uniform sampler2D tex;
  uniform vec2 resolution;
  uniform vec3 color;
  uniform float linked, flatMode, time, open;
  varying vec2 vUv;
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    float edge = smoothstep(0.78, 1.0, r);
    vec3 col;
    // Still opening: the view grows from the middle, the rest is the portal's swirling colour
    // (so the opening always fills the ring, never shows the wall behind it).
    bool viewHere = linked > 0.5 && flatMode < 0.5 && r <= open;
    if (viewHere) {
      col = texture2D(tex, gl_FragCoord.xy / resolution).rgb;
      col = mix(col, color, edge * 0.55);
    } else {
      float a = atan(p.y, p.x);
      float swirl = 0.5 + 0.5 * sin(a * 5.0 + time * 4.0 - r * 12.0);
      col = color * (0.45 + 0.55 * swirl) + edge * 0.3;
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const ringGeo = new THREE.RingGeometry(0.975, 1.03, 96);
const surfGeo = new THREE.PlaneGeometry(1, 1);

// Offsets (along the surface) tried when looking for room for a portal around where you aimed.
const SEARCH = [[0, 0]];
for (const r of [0.3, 0.6, 0.9, 1.2, 1.6, 2.0]) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) SEARCH.push([a * r, b * r]);

export class Portal {
  constructor(owner, pose, color) {
    this.owner = owner;
    this.normal = pose.normal.clone();
    this.up = pose.up.clone();
    this.right = new THREE.Vector3().crossVectors(this.up, this.normal);
    this.pos = pose.pos.clone();
    this.hosts = pose.boxes || (pose.box ? [pose.box] : []); // wall boxes you can walk into through this portal
    this.age = 0;
    this.partner = null;
    this.color = new THREE.Color(color);

    this.matrix = new THREE.Matrix4().makeBasis(this.right, this.up, this.normal).setPosition(this.pos);
    this.matrixInv = this.matrix.clone().invert();
    this.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.normal, this.pos);

    this.rt = null;
    this.rt2 = null; // view used when this portal is seen through another portal
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    const visual = this.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, SURFACE_OFFSET));
    this.group.matrix.copy(visual);

    this.uniforms = {
      tex: { value: null },
      color: { value: this.color },
      linked: { value: 0 },
      open: { value: 0 },
      flatMode: { value: 0 }, // per portal: 1 = show solid colour instead of a view
      time: portalShared.time,
      resolution: portalShared.resolution,
    };
    this.surface = new THREE.Mesh(surfGeo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: surfaceVert, fragmentShader: surfaceFrag,
    }));
    this.surface.scale.set(PORTAL_W, PORTAL_H, 1);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: this.color, side: THREE.DoubleSide }));
    this.ring.scale.set(PORTAL_W / 2, PORTAL_H / 2, 1);
    this.ring.position.z = 0.004;
    this.group.add(this.surface, this.ring);
  }

  // Local coords of a world point: x = right, y = up, z = distance in front.
  local(p) {
    const d = p.clone().sub(this.pos);
    return { x: d.dot(this.right), y: d.dot(this.up), z: d.dot(this.normal) };
  }

  inRect(p, margin = 0) {
    const l = this.local(p);
    return Math.abs(l.x) <= PORTAL_W / 2 - margin && Math.abs(l.y) <= PORTAL_H / 2 - margin;
  }

  // Matrix that maps world space in front of this portal to world space in front of the partner.
  transformTo(target, out = new THREE.Matrix4()) {
    return out.copy(target.matrix).multiply(ROT_Y_PI).multiply(this.matrixInv);
  }

  dispose() {
    this.surface.material.dispose();
    this.ring.material.dispose();
    if (this.rt) this.rt.dispose();
    if (this.rt2) this.rt2.dispose();
  }
}

// Ghost outline shown while aiming a portal.
export class PortalGhost {
  constructor(scene) {
    this.mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthTest: false,
    }));
    this.mesh.renderOrder = 10;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
    this.mesh.layers.set(3);
    scene.add(this.mesh);
  }
  show(pose, color, valid) {
    if (!pose) { this.mesh.visible = false; return; }
    const right = new THREE.Vector3().crossVectors(pose.up, pose.normal);
    this.mesh.matrix.makeBasis(right, pose.up, pose.normal)
      .setPosition(pose.pos.clone().addScaledVector(pose.normal, 0.03))
      .multiply(new THREE.Matrix4().makeScale(PORTAL_W / 2, PORTAL_H / 2, 1));
    this.mesh.material.color.set(valid ? color : '#ff2222');
    this.mesh.material.opacity = 0.55 + 0.3 * Math.sin(performance.now() / 120);
    this.mesh.visible = true;
  }
  hide() { this.mesh.visible = false; }
}

// Snap a direction to the nearest of ±X / ±Z.
function snapAxis(v) {
  if (Math.abs(v.x) > Math.abs(v.z)) return new THREE.Vector3(Math.sign(v.x) || 1, 0, 0);
  return new THREE.Vector3(0, 0, Math.sign(v.z) || 1);
}

export class PortalSystem {
  constructor(scene, world, renderer) {
    this.scene = scene;
    this.world = world;
    this.renderer = renderer;
    this.portals = [];
    this.byOwner = new Map();
    this.onEvent = () => {};
    this._m = new THREE.Matrix4();
    this._frustum = new THREE.Frustum();
    this._sphere = new THREE.Sphere();
    this.vcam = new THREE.PerspectiveCamera();
    this.vcam.matrixAutoUpdate = false;
    this.vcam2 = new THREE.PerspectiveCamera();
    this.vcam2.matrixAutoUpdate = false;
    this.recursive = true; // portals seen through portals show their own view (one extra level)
    this.rtSize = new THREE.Vector2(1, 1);
  }

  clear() {
    for (const p of this.portals) { this.scene.remove(p.group); p.dispose(); }
    this.portals = [];
    this.byOwner.clear();
  }

  setSize(w, h) {
    this.rtSize.set(w, h);
    portalShared.resolution.value.set(w, h);
    for (const p of this.portals) { if (p.rt) p.rt.setSize(w, h); if (p.rt2) p.rt2.setSize(w, h); }
  }

  // ---------- Placement ----------

  // Turn a surface hit into a portal pose, clamped so the whole portal fits on that face.
  poseFromHit(hit, viewDir) {
    if (!hit || !hit.box) return null;
    const n = hit.normal.clone();
    let up;
    if (Math.abs(n.y) > 0.5) {
      // Floor / ceiling: portal "up" follows the direction you are facing.
      up = snapAxis(new THREE.Vector3(viewDir.x, 0, viewDir.z));
    } else {
      up = new THREE.Vector3(0, 1, 0);
    }
    const right = new THREE.Vector3().crossVectors(up, n);
    const pos = hit.point.clone();
    const b = hit.box;
    const ni = Math.abs(n.x) > 0.5 ? 0 : Math.abs(n.y) > 0.5 ? 1 : 2;
    // Fast path: the whole portal fits on the one box that was hit. Clamp along each axis.
    let fits = true;
    for (const [axisVec, half] of [[right, PORTAL_W / 2], [up, PORTAL_H / 2]]) {
      const i = Math.abs(axisVec.x) > 0.5 ? 0 : Math.abs(axisVec.y) > 0.5 ? 1 : 2;
      const lo = b.min.getComponent(i) + half, hi = b.max.getComponent(i) - half;
      if (lo > hi) { fits = false; break; }
      pos.setComponent(i, THREE.MathUtils.clamp(pos.getComponent(i), lo, hi));
    }
    if (fits) {
      pos.setComponent(ni, n.getComponent(ni) > 0 ? b.max.getComponent(ni) : b.min.getComponent(ni));
      const pose = { pos, normal: n, up, box: b, boxes: [b], valid: true };
      pose.valid = !this.overlapsExisting(pose);
      return pose;
    }
    // Otherwise the surface may be made of several boxes (3D-model maps): look for a spot
    // near the hit where a flat surface covers the whole portal.
    const start = hit.point.clone();
    let found = null;
    for (const [dx, dy] of SEARCH) {
      const c = start.clone().addScaledVector(right, dx).addScaledVector(up, dy);
      found = this.surfaceUnder(c, n, up, right);
      if (found) break;
    }
    if (!found) return this.fitPose(hit, viewDir) || { pos: hit.point.clone(), normal: n, up, box: b, valid: false };
    const pose = { pos: found.pos, normal: n, up, box: b, boxes: found.boxes, valid: true };
    pose.valid = !this.overlapsExisting(pose);
    return pose;
  }

  // ---------- Portals on 3D-model surfaces (any angle: curved walls, slopes, props) ----------

  // The visible 3D models of the map (map model and props), for exact surface hits.
  modelMeshes() {
    const g = this.world.group;
    if (this._meshKey === g.children.length && this._meshMap === this.world.mapId) return this._meshes;
    const list = [];
    for (const ch of g.children) if (ch.userData.mapModel) ch.traverse(o => { if (o.isMesh) list.push(o); });
    this._meshes = list; this._meshKey = g.children.length; this._meshMap = this.world.mapId;
    return list;
  }

  meshHit(origin, dir, far) {
    const meshes = this.modelMeshes();
    if (!meshes.length) return null;
    this._ray ||= new THREE.Raycaster();
    this._ray.set(origin, dir); this._ray.near = 0; this._ray.far = far;
    const h = this._ray.intersectObjects(meshes, false)[0];
    if (!h || !h.face) return null;
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    if (n.dot(dir) > 0) n.negate(); // double-sided faces: face the ray
    return { point: h.point, normal: n, t: h.distance };
  }

  // Fit a portal to an uneven surface (curved or arched walls, bumpy floors): sample the
  // collision shape over the portal area, fit a plane through it (walls can face any direction),
  // and put the portal on the front of it. Returns a pose or null.
  fitPose(hit, viewDir) {
    const d = viewDir.clone().normalize();
    const floor = Math.abs(hit.normal.y) > 0.5;
    let n0 = floor ? new THREE.Vector3(0, Math.sign(hit.normal.y), 0) : new THREE.Vector3(-d.x, 0, -d.z);
    if (n0.lengthSq() < 1e-4) return null;
    n0.normalize();
    const upOf = (n) => (floor ? d.clone().addScaledVector(n, -d.dot(n)) : new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y)).normalize();
    const up0 = upOf(n0), right0 = new THREE.Vector3().crossVectors(up0, n0).normalize();
    const back = n0.clone().negate(), w = this.world;
    // Walls: first try spots where the portal stands on the floor (so you can walk in).
    let tries = SEARCH;
    if (!floor) {
      const g = w.raycast(hit.point.clone().addScaledVector(n0, 0.5), new THREE.Vector3(0, -1, 0), 6);
      if (g) {
        const dy0 = g.point.y + PORTAL_H / 2 + 0.03 - hit.point.y;
        tries = [...[0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.3, -1.3, 1.7, -1.7].map(dx => [dx, dy0]), ...SEARCH];
      }
    }
    for (const [dx, dy] of tries) {
      const c = hit.point.clone().addScaledVector(right0, dx).addScaledVector(up0, dy);
      const pts = [];
      let ok = true;
      for (let i = 0; i < 4 && ok; i++) for (let j = 0; j < 6; j++) {
        const u = (i / 3 - 0.5) * (PORTAL_W - 0.2), v = (j / 5 - 0.5) * (PORTAL_H - 0.2);
        if ((u / (PORTAL_W / 2)) ** 2 + (v / (PORTAL_H / 2)) ** 2 > 1.15) continue;
        const o = c.clone().addScaledVector(right0, u).addScaledVector(up0, v).addScaledVector(n0, 1.0);
        const h = w.raycast(o, back, 2.0);
        if (!h || h.normal.dot(n0) < 0.3) { ok = false; break; }
        pts.push(h.point);
      }
      if (!ok || pts.length < 10) continue;
      // Plane through the points. Walls: best-fit vertical line in x/z. Floors: flat.
      let n = n0.clone();
      if (!floor) {
        let mx = 0, mz = 0;
        for (const p of pts) { mx += p.x; mz += p.z; }
        mx /= pts.length; mz /= pts.length;
        let sxx = 0, szz = 0, sxz = 0;
        for (const p of pts) { const a = p.x - mx, b = p.z - mz; sxx += a * a; szz += b * b; sxz += a * b; }
        const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);           // main direction of the wall
        n = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang));
        if (n.dot(n0) < 0) n.negate();
        if (n.dot(n0) < 0.6) continue;                              // wall faces too far away from us
      }
      let hi = -Infinity, lo = Infinity;
      for (const p of pts) { const dd = n.dot(p); hi = Math.max(hi, dd); lo = Math.min(lo, dd); }
      if (hi - lo > (floor ? 0.45 : 0.6)) continue;                 // too bumpy
      const up = upOf(n), right = new THREE.Vector3().crossVectors(up, n).normalize();
      const pos = c.clone().addScaledVector(n, hi - n.dot(c) + 0.004);
      // On 3D-model maps, sit on the visible surface if it is just behind the collision front.
      // (Use the front-most visible point across the portal, so no part of it ends up behind
      // something like a pillar between arches.)
      if (this.modelMeshes().length) {
        let vis = -Infinity;
        for (const [u, v] of [[0, 0], [-0.6, 0], [0.6, 0], [0, -1], [0, 1], [-0.5, -0.8], [0.5, -0.8], [-0.5, 0.8], [0.5, 0.8]]) {
          const o = pos.clone().addScaledVector(right, u).addScaledVector(up, v).addScaledVector(n, 0.3);
          const mh = this.meshHit(o, n.clone().negate(), 1.0);
          vis = Math.max(vis, mh ? n.dot(mh.point) : hi);
        }
        if (vis < hi && vis > hi - 0.6) pos.addScaledVector(n, vis - hi);
      }
      // Open space in front of it.
      const front = pos.clone().addScaledVector(n, hi - n.dot(pos) + 0.05);
      if (w.raycast(front, n, 0.6)) continue;
      const boxes = this.hostsFor(pos, n, up, right);
      const pose = { pos, normal: n, up, box: boxes[0] || hit.box, boxes, valid: true };
      pose.valid = !this.overlapsExisting(pose);
      return pose;
    }
    return null;
  }

  // Collision boxes just behind (and around) a portal: you can walk into these through it.
  hostsFor(pos, n, up, right) {
    const back = n.clone().negate(), set = new Set();
    const plane = n.dot(pos);
    for (let i = 0; i < 7; i++) for (let j = 0; j < 9; j++) {
      const u = (i / 6 - 0.5) * (PORTAL_W + 0.6), v = (j / 8 - 0.5) * (PORTAL_H + 0.6);
      const o = pos.clone().addScaledVector(right, u).addScaledVector(up, v).addScaledVector(n, 0.9);
      const h = this.world.raycast(o, back, 2.2);
      if (!h) continue;
      const dd = n.dot(h.point) - plane;
      if (dd > -0.7 && dd < 0.8) set.add(h.box);
    }
    return [...set];
  }

  // Is there a flat surface facing n under the whole portal centred at c (and nothing sticking
  // out in front of it)? Returns { pos (on the surface), boxes } or null.
  surfaceUnder(c, n, up, right) {
    const w = this.world, back = n.clone().negate();
    const boxes = new Set();
    let hi = -Infinity, lo = Infinity;
    const plane = n.dot(c);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) {
      const u = (i / 3 - 0.5) * (PORTAL_W - 0.2), v = (j / 5 - 0.5) * (PORTAL_H - 0.2);
      if ((u / (PORTAL_W / 2)) ** 2 + (v / (PORTAL_H / 2)) ** 2 > 1.15) continue; // outside the oval
      const s = c.clone().addScaledVector(right, u).addScaledVector(up, v);
      const o = s.addScaledVector(n, 0.4);
      const h = w.raycast(o, back, 0.8);
      if (!h || h.normal.dot(n) < 0.99) return null;
      const d = n.dot(h.point) - plane;
      hi = Math.max(hi, d); lo = Math.min(lo, d);
      if (hi - lo > 0.15) return null;                   // not flat enough
      boxes.add(h.box);
    }
    // Nothing right in front of the portal (it must open onto open space).
    const mid = c.clone().addScaledVector(n, hi + 0.05);
    if (w.raycast(mid, n, 0.6)) return null;
    return { pos: c.clone().addScaledVector(n, hi), boxes: [...boxes] };
  }

  overlapsExisting(pose, ignore = null) {
    for (const p of this.portals) {
      if (p === ignore) continue;
      if (p.normal.dot(pose.normal) < 0.99) continue;
      if (Math.abs(p.normal.dot(p.pos) - pose.normal.dot(pose.pos)) > 0.05) continue;
      const d = pose.pos.clone().sub(p.pos);
      const dx = Math.abs(d.dot(p.right)), dy = Math.abs(d.dot(p.up));
      const sameOrient = Math.abs(p.up.dot(pose.up)) > 0.5;
      const w = sameOrient ? PORTAL_W : (PORTAL_W + PORTAL_H) / 2;
      const h = sameOrient ? PORTAL_H : (PORTAL_W + PORTAL_H) / 2;
      if (dx < w * 0.95 && dy < h * 0.95) return true;
    }
    return false;
  }

  // Aim a portal from a camera ray (follows the ray through existing portals).
  aimPose(origin, dir, owner) {
    const tr = this.trace(origin, dir, 300, {});
    if (!tr.hit || tr.hit.type !== 'world') return null;
    const pose = this.poseFromHit(tr.hit, tr.finalDir);
    if (pose) this.liftToVisible(pose);
    if (pose && pose.valid) {
      // The owner's oldest portal will vanish when this one is placed, so ignore it.
      const mine = this.byOwner.get(owner) || [];
      if (mine.length >= 2) pose.valid = !this.overlapsExisting(pose, mine[0]);
    }
    return pose;
  }

  // 3D props (like the sky islands) can stick up a little past their collision box: if the
  // visible surface is just in front of the portal, move the portal onto it so it isn't hidden.
  liftToVisible(pose) {
    if (!this.modelMeshes().length) return;
    const n = pose.normal, up = pose.up, right = new THREE.Vector3().crossVectors(up, n).normalize();
    let lift = 0;
    for (const [u, v] of [[0, 0], [-0.5, 0], [0.5, 0], [0, -0.9], [0, 0.9], [-0.4, -0.7], [0.4, -0.7], [-0.4, 0.7], [0.4, 0.7]]) {
      const o = pose.pos.clone().addScaledVector(right, u).addScaledVector(up, v).addScaledVector(n, 0.3);
      const mh = this.meshHit(o, n.clone().negate(), 0.32);
      if (mh) lift = Math.max(lift, 0.3 - mh.t);
    }
    if (lift > 0.002 && lift < 0.25) pose.pos.addScaledVector(n, lift + 0.004);
  }

  place(owner, pose) {
    let mine = this.byOwner.get(owner);
    if (!mine) { mine = []; this.byOwner.set(owner, mine); }
    if (mine.length >= 2) this.remove(mine[0]);
    const p = new Portal(owner, pose, owner.portalColor);
    this.portals.push(p);
    mine.push(p);
    this.scene.add(p.group);
    this.relink(owner);
    return p;
  }

  remove(p) {
    this.scene.remove(p.group);
    this.portals.splice(this.portals.indexOf(p), 1);
    const mine = this.byOwner.get(p.owner);
    if (mine) mine.splice(mine.indexOf(p), 1);
    if (p.partner) p.partner.partner = null;
    this.relink(p.owner);
    p.dispose();
  }

  removeOwner(owner) {
    for (const p of [...(this.byOwner.get(owner) || [])]) this.remove(p);
  }

  relink(owner) {
    const mine = this.byOwner.get(owner) || [];
    for (const p of mine) p.partner = null;
    if (mine.length === 2) {
      mine[0].partner = mine[1];
      mine[1].partner = mine[0];
    }
    for (const p of mine) {
      if (p.partner && !p.rt) {
        p.rt = new THREE.WebGLRenderTarget(this.rtSize.x, this.rtSize.y, { samples: this.lowQuality ? 0 : 4 });
        p.rt.texture.colorSpace = THREE.SRGBColorSpace;
      }
      p.uniforms.tex.value = p.rt ? p.rt.texture : null;
      p.uniforms.linked.value = p.partner ? 1 : 0;
    }
  }

  ownerCount(owner) { return (this.byOwner.get(owner) || []).length; }

  update(dt) {
    portalShared.time.value += dt;
    for (const p of [...this.portals]) {
      p.age += dt;
      p.uniforms.open.value = Math.min(1.05, p.age / 0.25);
      if (p.age >= PORTAL_LIFETIME) { this.onEvent('expire', p); this.remove(p); }
    }
  }

  // ---------- Ray tracing through portals ----------

  // Trace a ray through the world, passing through linked portals (up to 6 hops).
  // opts.characters: list of characters to test. opts.ignore: character ignored on the first segment.
  trace(origin, dir, maxDist, opts) {
    let o = origin.clone(), d = dir.clone().normalize();
    let remaining = maxDist;
    let lastPortal = null;
    const segments = [];
    for (let hop = 0; hop < 6; hop++) {
      let best = null;
      const w = this.world.raycast(o, d, remaining);
      if (w) best = { type: 'world', t: w.t, point: w.point, normal: w.normal, box: w.box };

      for (const p of this.portals) {
        if (!p.partner || p === lastPortal) continue;
        const denom = d.dot(p.normal);
        if (denom >= -1e-6) continue; // must approach from the front
        const t = (p.pos.clone().sub(o)).dot(p.normal) / denom;
        if (t < 0 || t > remaining) continue;
        if (best && t > best.t + 0.02 && !(best.type === 'world' && p.hosts.includes(best.box) && t < best.t + 0.9)) continue;
        const pt = o.clone().addScaledVector(d, t);
        const l = p.local(pt);
        const ex = l.x / (PORTAL_W / 2), ey = l.y / (PORTAL_H / 2);
        if (ex * ex + ey * ey > 1) continue; // elliptical opening
        if (!best || t < best.t + 0.02 || (best.type === 'world' && p.hosts.includes(best.box) && t < best.t + 0.9)) best = { type: 'portal', t, point: pt, portal: p };
      }

      if (opts.characters) {
        for (const c of opts.characters) {
          if (!c.alive || (hop === 0 && c === opts.ignore)) continue;
          const h = c.rayHit(o, d);
          if (h && h.t <= remaining && (!best || h.t < best.t)) best = { type: 'character', t: h.t, point: h.point, character: c, head: h.head };
        }
      }

      if (!best) {
        segments.push({ from: o.clone(), to: o.clone().addScaledVector(d, remaining) });
        return { segments, hit: null, finalDir: d };
      }
      segments.push({ from: o.clone(), to: best.point.clone() });
      if (best.type !== 'portal') return { segments, hit: best, finalDir: d };

      // Pass through: continue from the partner portal.
      const m = best.portal.transformTo(best.portal.partner, this._m);
      o = best.point.clone().applyMatrix4(m);
      d = d.clone().transformDirection(m);
      o.addScaledVector(d, 0.001);
      remaining -= best.t;
      lastPortal = best.portal.partner;
    }
    return { segments, hit: null, finalDir: d };
  }

  // ---------- Walking through portals ----------

  // Boxes a character may pass into because they are standing in a portal opening.
  ignoredBoxes(c) {
    const set = new Set();
    for (const p of this.portals) {
      if (!p.partner) continue;
      const l = p.local(c.pos);
      if (Math.abs(l.x) < PORTAL_W / 2 - 0.12 && Math.abs(l.y) < PORTAL_H / 2 - 0.12 && l.z > -1.2 && l.z < 1.3) for (const b of p.hosts) set.add(b);
    }
    return set;
  }

  // Teleport the character if it is crossing a portal. Returns true if it did.
  checkTeleport(c) {
    if (c.teleportCooldown > 0) return false;
    const eye = c.eyePos();
    for (const p of this.portals) {
      if (!p.partner) continue;
      const toward = c.vel.dot(p.normal);
      let crossing = false;
      for (const probe of [c.pos, eye]) {
        const l = p.local(probe);
        if (Math.abs(l.x) <= PORTAL_W / 2 && Math.abs(l.y) <= PORTAL_H / 2 && l.z < 0.16 && l.z > -0.9 && (toward < 0 || l.z < 0)) crossing = true;
      }
      if (!crossing) continue;
      this.teleport(c, p, p.partner);
      return true;
    }
    return false;
  }

  teleport(c, from, to) {
    const m = from.transformTo(to, this._m);
    const center = c.pos.clone().applyMatrix4(m);
    // Fit the whole body inside the exit opening, just in front of it.
    const ext = (v) => Math.abs(v.x) * c.radius + Math.abs(v.y) * c.halfHeight + Math.abs(v.z) * c.radius;
    let lx = center.clone().sub(to.pos).dot(to.right);
    let ly = center.clone().sub(to.pos).dot(to.up);
    lx = THREE.MathUtils.clamp(lx, -Math.max(0, PORTAL_W / 2 - ext(to.right)), Math.max(0, PORTAL_W / 2 - ext(to.right)));
    ly = THREE.MathUtils.clamp(ly, -Math.max(0, PORTAL_H / 2 - ext(to.up)), Math.max(0, PORTAL_H / 2 - ext(to.up)));
    c.pos.copy(to.pos).addScaledVector(to.right, lx).addScaledVector(to.up, ly).addScaledVector(to.normal, ext(to.normal) + 0.04);

    // Rotate velocity and view direction.
    const speed = c.vel.length();
    c.vel.transformDirection(m).multiplyScalar(speed);
    const out = c.vel.dot(to.normal);
    const minOut = to.normal.y > 0.5 ? 4 : 1.5;
    if (out < minOut) c.vel.addScaledVector(to.normal, minOut - out);
    const look = c.lookDir().transformDirection(m);
    c.setLookDir(look);
    c.teleportCooldown = 0.08;
    c.grounded = false;
    this.onEvent('teleport', c);
  }

  // ---------- Rendering ----------

  // Set up a camera that looks out of `p.partner` the way `baseWorld` looks into `p`.
  virtualCam(cam, baseWorld, baseProj, p) {
    cam.matrixWorld.copy(p.transformTo(p.partner, this._m)).multiply(baseWorld);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    cam.projectionMatrix.copy(baseProj);
    this.obliqueClip(cam, p.partner);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }

  // Linked portals that `cam` can see (facing it and inside its view). `projForCull` is the
  // plain (non-oblique) projection, used for the frustum test.
  visibleFrom(cam, projForCull, skip = null) {
    const pos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    this._frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(projForCull, cam.matrixWorldInverse));
    const out = [];
    for (const p of this.portals) {
      if (!p.partner || p === skip) continue;
      if (p.local(pos).z < -0.05) continue;
      this._sphere.set(p.pos, Math.max(PORTAL_W, PORTAL_H) * 0.6);
      if (!this._frustum.intersectsSphere(this._sphere)) continue;
      out.push(p);
    }
    return out;
  }

  ensureRT(p, key) {
    if (!p[key]) {
      p[key] = new THREE.WebGLRenderTarget(this.rtSize.x, this.rtSize.y, { samples: this.lowQuality ? 0 : 4 });
      p[key].texture.colorSpace = THREE.SRGBColorSpace;
    }
    return p[key];
  }

  setLook(p, mode, tex) { // mode: 'flat' | 'view'
    p.uniforms.flatMode.value = mode === 'flat' ? 1 : 0;
    if (tex) p.uniforms.tex.value = tex;
  }

  // Render each visible portal's view into its texture. With `recursive`, portals seen
  // through a portal get their own view too (one extra level), instead of a flat colour.
  renderViews(camera) {
    const r = this.renderer;
    camera.updateMatrixWorld();
    const proj = camera.projectionMatrix;
    const visible = this.visibleFrom(camera, proj);
    if (!visible.length) return;

    const vcam = this.vcam, vcam2 = this.vcam2;
    for (const c of [vcam, vcam2]) { c.layers.enableAll(); c.layers.disable(3); } // layer 3 = aiming ghost
    const deep = this.recursive && !this.lowQuality;

    for (const p of visible) {
      const target = p.partner;
      this.virtualCam(vcam, camera.matrixWorld, proj, p);

      // Level 2: portals visible inside this portal's view.
      let inner = [];
      if (deep) {
        inner = this.visibleFrom(vcam, proj, target).filter(q => target.local(q.pos).z > -0.05).slice(0, 2);
        for (const q of inner) {
          this.virtualCam(vcam2, vcam.matrixWorld, proj, q);
          for (const o of this.portals) this.setLook(o, 'flat');
          q.surface.visible = false; q.partner.surface.visible = false;
          r.setRenderTarget(this.ensureRT(q, 'rt2'));
          r.clear();
          r.render(this.scene, vcam2);
          q.surface.visible = true; q.partner.surface.visible = true;
        }
      }

      // Level 1: this portal's view. Portals inside it show their level-2 view (or a flat colour).
      for (const o of this.portals) this.setLook(o, 'flat');
      for (const q of inner) this.setLook(q, 'view', q.rt2.texture);
      target.surface.visible = false;
      if (!inner.includes(p)) p.surface.visible = false;
      r.setRenderTarget(p.rt);
      r.clear();
      r.render(this.scene, vcam);
      p.surface.visible = true;
      target.surface.visible = true;
    }
    r.setRenderTarget(null);
    // Back to normal for the main view.
    for (const o of this.portals) this.setLook(o, o.partner ? 'view' : 'flat', o.rt && o.rt.texture);
  }

  // Oblique near plane: hide everything behind the exit portal (e.g. the wall it is on).
  obliqueClip(cam, portal) {
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(portal.normal, portal.pos.clone().addScaledVector(portal.normal, 0.02));
    plane.applyMatrix4(cam.matrixWorldInverse);
    if (Math.abs(plane.constant) < 0.02) return;
    const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = cam.projectionMatrix.elements;
    const q = new THREE.Vector4(
      (Math.sign(clip.x) + e[8]) / e[0],
      (Math.sign(clip.y) + e[9]) / e[5],
      -1.0,
      (1.0 + e[10]) / e[14],
    );
    clip.multiplyScalar(2.0 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1.0; e[14] = clip.w;
  }
}
