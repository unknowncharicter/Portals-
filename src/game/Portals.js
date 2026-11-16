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
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const surfaceFrag = /* glsl */`
  uniform sampler2D tex;
  uniform vec2 resolution;
  uniform vec3 color;
  uniform float linked, flatMode, time, open;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0 || r > open) discard;
    float edge = smoothstep(0.78, 1.0, r);
    vec3 col;
    if (linked > 0.5 && flatMode < 0.5) {
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

export class Portal {
  constructor(owner, pose, color) {
    this.owner = owner;
    this.normal = pose.normal.clone();
    this.up = pose.up.clone();
    this.right = new THREE.Vector3().crossVectors(this.up, this.normal);
    this.pos = pose.pos.clone();
    this.host = pose.box;
    this.age = 0;
    this.partner = null;
    this.color = new THREE.Color(color);

    this.matrix = new THREE.Matrix4().makeBasis(this.right, this.up, this.normal).setPosition(this.pos);
    this.matrixInv = this.matrix.clone().invert();
    this.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.normal, this.pos);

    this.rt = null;
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    const visual = this.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, SURFACE_OFFSET));
    this.group.matrix.copy(visual);

    this.uniforms = {
      tex: { value: null },
      color: { value: this.color },
      linked: { value: 0 },
      open: { value: 0 },
      flatMode: portalShared.flat,
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
    for (const p of this.portals) if (p.rt) p.rt.setSize(w, h);
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
    // Clamp along each in-plane axis.
    for (const [axisVec, half] of [[right, PORTAL_W / 2], [up, PORTAL_H / 2]]) {
      const i = Math.abs(axisVec.x) > 0.5 ? 0 : Math.abs(axisVec.y) > 0.5 ? 1 : 2;
      const lo = b.min.getComponent(i) + half, hi = b.max.getComponent(i) - half;
      if (lo > hi) return { pos, normal: n, up, box: b, valid: false };
      pos.setComponent(i, THREE.MathUtils.clamp(pos.getComponent(i), lo, hi));
    }
    // Snap exactly onto the face.
    const ni = Math.abs(n.x) > 0.5 ? 0 : Math.abs(n.y) > 0.5 ? 1 : 2;
    pos.setComponent(ni, n.getComponent(ni) > 0 ? b.max.getComponent(ni) : b.min.getComponent(ni));
    const pose = { pos, normal: n, up, box: b, valid: true };
    pose.valid = !this.overlapsExisting(pose);
    return pose;
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
    if (pose && pose.valid) {
      // The owner's oldest portal will vanish when this one is placed, so ignore it.
      const mine = this.byOwner.get(owner) || [];
      if (mine.length >= 2) pose.valid = !this.overlapsExisting(pose, mine[0]);
    }
    return pose;
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
      if (p.age >= PORTAL_LIFETIME) this.remove(p);
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
        if (t < 0 || t > remaining || (best && t > best.t + 0.02)) continue;
        const pt = o.clone().addScaledVector(d, t);
        const l = p.local(pt);
        const ex = l.x / (PORTAL_W / 2), ey = l.y / (PORTAL_H / 2);
        if (ex * ex + ey * ey > 1) continue; // elliptical opening
        if (!best || t < best.t + 0.02) best = { type: 'portal', t, point: pt, portal: p };
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
      if (Math.abs(l.x) < PORTAL_W / 2 - 0.12 && Math.abs(l.y) < PORTAL_H / 2 - 0.12 && l.z > -1.2 && l.z < 1.3) set.add(p.host);
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

  // Render each visible portal's view into its texture.
  renderViews(camera) {
    const r = this.renderer;
    camera.updateMatrixWorld();
    this._frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const visible = [];
    for (const p of this.portals) {
      if (!p.partner) continue;
      if (p.local(camPos).z < -0.05) continue;
      this._sphere.set(p.pos, Math.max(PORTAL_W, PORTAL_H) * 0.6);
      if (!this._frustum.intersectsSphere(this._sphere)) continue;
      visible.push(p);
    }
    if (!visible.length) return;

    portalShared.flat.value = 1;
    const vcam = this.vcam;
    vcam.layers.enableAll();
    vcam.layers.disable(3); // layer 3 = aiming ghost, only for the real camera
    for (const p of visible) {
      const target = p.partner;
      p.surface.visible = false;
      target.surface.visible = false;

      vcam.matrixWorld.copy(p.transformTo(target, this._m)).multiply(camera.matrixWorld);
      vcam.matrixWorldInverse.copy(vcam.matrixWorld).invert();
      vcam.projectionMatrix.copy(camera.projectionMatrix);
      this.obliqueClip(vcam, target);
      vcam.projectionMatrixInverse.copy(vcam.projectionMatrix).invert();

      r.setRenderTarget(p.rt);
      r.clear();
      r.render(this.scene, vcam);

      p.surface.visible = true;
      target.surface.visible = true;
    }
    r.setRenderTarget(null);
    portalShared.flat.value = 0;
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
