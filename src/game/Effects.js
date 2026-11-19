import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _UP = new THREE.Vector3(0, 1, 0), _tmp = new THREE.Vector3();
function mergeTwo(a, b) { return mergeGeometries([a.toNonIndexed(), b.toNonIndexed()]); }

// Bullet tracers and impact sparks.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.sparkGeo = new THREE.SphereGeometry(0.06, 6, 4);
    this.parts = [];
    this.nums = [];
    this.geo = {
      ball: new THREE.SphereGeometry(0.07, 6, 4),
      cube: new THREE.BoxGeometry(0.13, 0.13, 0.13),
      flake: new THREE.BoxGeometry(0.1, 0.02, 0.07),
      ghost: new THREE.SphereGeometry(0.25, 10, 8),
      ring: new THREE.TorusGeometry(1, 0.06, 6, 32),
      flake2: new THREE.PlaneGeometry(0.09, 0.14),
      streamer: new THREE.PlaneGeometry(0.05, 0.5),
      star: new THREE.OctahedronGeometry(0.09, 0),
      pixel: new THREE.BoxGeometry(0.08, 0.08, 0.08),
      streak: new THREE.BoxGeometry(0.03, 0.22, 0.03),
      glow: new THREE.SphereGeometry(1, 16, 12),
      shock: new THREE.RingGeometry(0.8, 1, 48),
      beam: new THREE.CylinderGeometry(0.55, 0.9, 4, 24, 1, true),
      wisp: new THREE.SphereGeometry(0.06, 8, 6),
      ghostBody: (() => { const g = new THREE.SphereGeometry(0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62); const t = new THREE.CylinderGeometry(0.255, 0.08, 0.55, 16, 1, true); t.translate(0, -0.3, 0); return mergeTwo(g, t); })(),
      eye: new THREE.SphereGeometry(0.05, 8, 6),
    };
    this.lights = [];
  }

  // Kill effects (where someone was eliminated). type: sparks | confetti | pixels | ghost | vortex
  // Built from a few pieces: a glowing flash, a shockwave on the floor, a light, and particles
  // that glow (additive), stretch along their motion, flutter, bounce or spiral.
  killFx(type, pos, color) {
    const R = Math.random, c = pos.clone(), floor = pos.y - 0.9;
    const col = new THREE.Color(color);
    const mat = (cl, glow = true) => new THREE.MeshBasicMaterial({ color: cl, transparent: true, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending });
    const add = (geo, cl, vel, life, o = {}) => {
      const mesh = new THREE.Mesh(geo, mat(cl, o.glow !== false));
      mesh.position.copy(o.at || c).add(o.offset || new THREE.Vector3());
      if (o.rot) mesh.rotation.set(R() * 6, R() * 6, R() * 6);
      if (o.scale) mesh.scale.setScalar(o.scale);
      this.scene.add(mesh);
      const p = { mesh, vel, life, max: life, g: o.g ?? 9, spin: o.spin || 0, grow: o.grow || 0, shrink: o.shrink || false,
        stretch: o.stretch || 0, sway: o.sway || 0, swayT: R() * 6, bounce: o.bounce ? floor : null, drag: o.drag || 0,
        orbit: o.orbit || null, fadeIn: o.fadeIn || 0, delay: o.delay || 0, base: o.scale || 1, flat: o.flat || false, peak: o.peak ?? 1 };
      if (p.delay) mesh.visible = false;
      this.parts.push(p);
      return p;
    };
    const out = (s, up = 0) => new THREE.Vector3((R() - 0.5) * 2 * s, up + R() * s, (R() - 0.5) * 2 * s);
    const flash = (cl, size = 1.2, life = 0.25) => add(this.geo.glow, cl, new THREE.Vector3(), life, { g: 0, grow: size * 3, scale: size * 0.3 });
    const shock = (cl, size = 3, life = 0.5, y = floor + 0.04) => {
      const p = add(this.geo.shock, cl, new THREE.Vector3(), life, { g: 0, at: new THREE.Vector3(c.x, y, c.z), grow: size, scale: 0.3, flat: true });
      p.mesh.rotation.x = -Math.PI / 2;
      return p;
    };
    const light = (cl, power = 6, life = 0.35) => {
      const l = new THREE.PointLight(cl, power, 9, 2);
      l.position.copy(c); this.scene.add(l);
      this.lights.push({ l, life, max: life, power });
    };

    if (type === 'confetti') {
      // Party popper: a white pop, a cone of fluttering confetti and a few long streamers.
      flash('#ffffff', 1, 0.18); light('#ffe080', 5, 0.3);
      for (let i = 0; i < 70; i++) {
        const v = out(2.6, 4.5);
        add(R() < 0.5 ? this.geo.flake : this.geo.flake2, new THREE.Color().setHSL(R(), 0.95, 0.6), v, 2.2 + R() * 0.8, { glow: false, g: 4, rot: true, spin: 6 + R() * 8, sway: 2.2, drag: 1.4 });
      }
      for (let i = 0; i < 8; i++) add(this.geo.streamer, new THREE.Color().setHSL(i / 8, 0.9, 0.6), out(1.8, 5), 2.4, { glow: false, g: 4, rot: true, spin: 3, sway: 1.5, drag: 1.2 });
      for (let i = 0; i < 6; i++) add(this.geo.star, '#ffe27a', out(2.5, 3), 0.9, { g: 3, spin: 6, shrink: true, delay: 0.05 * i });
    } else if (type === 'pixels') {
      // De-rez: the body shatters into voxels that bounce, and a column of pixels rises and fades.
      flash(col, 1, 0.2); light(col, 6, 0.35); shock(col, 2.4, 0.45);
      for (let i = 0; i < 46; i++) {
        const sh = new THREE.Color(color).offsetHSL((R() - 0.5) * 0.06, 0, (R() - 0.5) * 0.35);
        add(this.geo.cube, sh, out(3.5, 2.5), 1.4 + R() * 0.6, { glow: false, g: 14, rot: true, spin: 5, bounce: true, offset: new THREE.Vector3((R() - 0.5) * 0.5, (R() - 0.3) * 1.5, (R() - 0.5) * 0.5) });
      }
      for (let i = 0; i < 26; i++) {
        add(this.geo.pixel, R() < 0.3 ? '#ffffff' : col, new THREE.Vector3(0, 1.2 + R() * 1.5, 0), 1 + R() * 0.6,
          { g: 0, offset: new THREE.Vector3((R() - 0.5) * 0.7, (R() - 0.5) * 1.6, (R() - 0.5) * 0.7), shrink: true, delay: R() * 0.3 });
      }
    } else if (type === 'ghost') {
      // The soul floats up: a ghost with eyes rising and swaying, a spiral of wisps and mist.
      const ghost = new THREE.Group();
      const body = new THREE.Mesh(this.geo.ghostBody, mat('#e8f0ff', false)); body.material.opacity = 0.85; ghost.add(body);
      for (const sx of [-1, 1]) { const e = new THREE.Mesh(this.geo.eye, new THREE.MeshBasicMaterial({ color: '#1a1f33', transparent: true, depthWrite: false })); e.position.set(sx * 0.11, 0.12, 0.24); ghost.add(e); }
      ghost.position.copy(c); ghost.scale.setScalar(1.8);
      this.scene.add(ghost);
      this.parts.push({ mesh: ghost, group: true, vel: new THREE.Vector3(0, 1.1, 0), life: 2.4, max: 2.4, g: 0, sway: 0, swayT: 0, spin: 0, grow: 0, base: 1.8, fadeIn: 0.2, peak: 1, wobble: true });
      add(this.geo.glow, '#7f9cff', new THREE.Vector3(0, 1.1, 0), 2.4, { g: 0, scale: 0.75, peak: 0.45, fadeIn: 0.2 });
      light('#bcd0ff', 4, 1.2);
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 4;
        add(this.geo.wisp, i % 3 ? '#9fb8ff' : '#ffffff', new THREE.Vector3(0, 0.9 + R() * 0.6, 0), 1.6 + R() * 0.6,
          { g: 0, orbit: { a, r: 0.7, w: 3.2, rise: 0 }, shrink: true, delay: i * 0.03 });
      }
      for (let i = 0; i < 14; i++) add(this.geo.ghost, '#6f86d8', out(1, 0.1), 1.4, { g: -0.4, grow: 2.5, scale: 0.6, peak: 0.25, offset: new THREE.Vector3(0, -0.7, 0) });
    } else if (type === 'vortex') {
      // A portal opens under them and swallows them: rings, a beam, particles spiralling in, then a pop.
      light(col, 8, 1.0);
      const r1 = shock(col, 0, 1.0, floor + 0.05); r1.base = 2.4; r1.mesh.scale.setScalar(2.4); r1.grow = 0; r1.shrink = true; r1.spinFlat = 6;
      const r2 = shock("#ffffff", 0, 1.0, floor + 0.06); r2.base = 1.6; r2.mesh.scale.setScalar(1.6); r2.grow = 0; r2.shrink = true; r2.spinFlat = -9;
      add(this.geo.beam, col, new THREE.Vector3(), 0.9, { g: 0, at: new THREE.Vector3(c.x, floor + 2, c.z), peak: 0.55 });
      for (let i = 0; i < 40; i++) {
        add(this.geo.ball, R() < 0.25 ? '#ffffff' : col, new THREE.Vector3(), 0.9 + R() * 0.3,
          { g: 0, orbit: { a: R() * Math.PI * 2, r: 1.4 + R() * 0.8, w: 6 + R() * 3, rise: -0.8, pull: 1.6, y: R() * 2 - 0.9 }, delay: R() * 0.15 });
      }
      // The implosion pop when it closes.
      for (const q of [flash('#ffffff', 1.1, 0.22), flash(col, 1.6, 0.35), shock(col, 4, 0.5)]) { q.delay = 0.85; q.mesh.visible = false; }
    } else {
      // Sparks: a hot flash, streaking sparks, a floor shockwave and embers drifting up.
      flash('#ffd27a', 1.1, 0.22); light('#ff8a3a', 7, 0.35); shock('#ff9a40', 3.2, 0.45);
      for (let i = 0; i < 55; i++) add(this.geo.streak, i % 3 ? '#ff7a2a' : '#ffe08a', out(6.5, 3), 0.75 + R() * 0.45, { g: 9, stretch: 0.07, drag: 1.2, scale: 1.6 });
      for (let i = 0; i < 16; i++) add(this.geo.ball, '#ff9a40', new THREE.Vector3((R() - 0.5) * 0.6, 0.6 + R() * 1.2, (R() - 0.5) * 0.6), 1.6 + R() * 1,
        { g: -0.3, scale: 0.9, sway: 0.6, shrink: true, offset: out(0.4, -0.5) });
    }
  }

  updateParts(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      const m = p.mesh;
      if (p.delay > 0) { p.delay -= dt; if (p.delay <= 0) m.visible = true; else continue; }
      p.life -= dt;
      const k = Math.max(0, p.life / p.max);
      if (p.orbit) {
        // Spiral around the centre (rising/sinking, pulled inward if asked).
        const o = p.orbit;
        o.a += o.w * dt; if (o.pull) o.r = Math.max(0.02, o.r - o.pull * dt);
        o.y = (o.y ?? 0) + (o.rise || 0) * dt + p.vel.y * dt;
        const cx = p.cx ?? (p.cx = m.position.x), cz = p.cz ?? (p.cz = m.position.z), cy = p.cy ?? (p.cy = m.position.y);
        m.position.set(cx + Math.cos(o.a) * o.r, cy + o.y, cz + Math.sin(o.a) * o.r);
      } else {
        p.vel.y -= p.g * dt;
        if (p.drag) { const f = Math.max(0, 1 - p.drag * dt); p.vel.x *= f; p.vel.z *= f; if (p.vel.y > 0) p.vel.y *= f; }
        if (p.sway) { p.swayT += dt * 5; m.position.x += Math.sin(p.swayT) * p.sway * dt; m.position.z += Math.cos(p.swayT * 0.7) * p.sway * dt * 0.6; }
        m.position.addScaledVector(p.vel, dt);
        if (p.bounce !== null && p.bounce !== undefined && m.position.y < p.bounce + 0.07 && p.vel.y < 0) {
          m.position.y = p.bounce + 0.07; p.vel.y *= -0.45; p.vel.x *= 0.7; p.vel.z *= 0.7; p.spin *= 0.6;
        }
      }
      if (p.stretch) {
        // Point along the motion and stretch with speed (streaks).
        const sp = p.vel.length();
        if (sp > 0.01) m.quaternion.setFromUnitVectors(_UP, _tmp.copy(p.vel).divideScalar(sp));
        m.scale.set(1, 1 + sp * p.stretch * 12, 1).multiplyScalar(Math.max(0.05, k));
      } else if (p.spin) { m.rotation.z += p.spin * dt; m.rotation.y += p.spin * 0.5 * dt; }
      if (p.spinFlat) m.rotation.z += p.spinFlat * dt;
      if (p.wobble) { m.rotation.z = Math.sin((p.max - p.life) * 4) * 0.25; m.position.x += Math.cos((p.max - p.life) * 3) * dt * 0.4; }
      if (!p.stretch) {
        let sc = p.base;
        if (p.grow) sc = p.base * (1 + (1 - k) * p.grow);
        if (p.shrink) sc *= Math.max(0.05, k);
        if (p.grow || p.shrink) m.scale.setScalar(sc);
      }
      const fadeIn = p.fadeIn ? Math.min(1, (p.max - p.life) / p.fadeIn) : 1;
      const op = Math.min(1, k * 1.6) * fadeIn * (p.peak ?? 1);
      if (p.group) m.traverse(o => { if (o.material) o.material.opacity = op * (o.material.color.r < 0.2 ? 1 : 0.85); });
      else m.material.opacity = op;
      if (p.life <= 0) {
        this.scene.remove(m);
        if (p.group) m.traverse(o => { if (o.material) o.material.dispose(); }); else m.material.dispose();
        this.parts.splice(i, 1);
      }
    }
    for (let i = this.lights.length - 1; i >= 0; i--) {
      const L = this.lights[i];
      L.life -= dt;
      L.l.intensity = L.power * Math.max(0, L.life / L.max);
      if (L.life <= 0) { this.scene.remove(L.l); this.lights.splice(i, 1); }
    }
  }

  tracer(segments, color = '#ffe9a0') {
    const pts = [];
    for (const s of segments) pts.push(s.from, s.to);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.LineSegments(geo, mat);
    this.scene.add(line);
    this.items.push({ obj: line, life: 0.12, max: 0.12 });
  }

  spark(point, color = '#ffd070') {
    const m = new THREE.Mesh(this.sparkGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.copy(point);
    this.scene.add(m);
    this.items.push({ obj: m, life: 0.25, max: 0.25, grow: true });
  }

  // Small floating number showing damage you dealt. Hits on the same target close together
  // (shotgun pellets, bursts) add up into one number.
  damageNumber(target, amount, pos, head = false, kill = false) {
    const now = performance.now();
    let n = this.nums.find(x => x.target === target && now - x.t0 < 350 && x.life > 0.3);
    if (n) { n.amount += amount; n.head = n.head || head; n.kill = n.kill || kill; n.dirty = true; n.t0 = now; n.life = n.max; n.pos.lerp(pos, 0.5); }
    else {
      const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64;
      const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
      sprite.layers.set(3);           // only your own camera (not the views through portals)
      sprite.renderOrder = 30;
      sprite.scale.set(0.15, 0.075, 1);
      this.scene.add(sprite);
      n = { target, amount, head, kill, pos: pos.clone(), sprite, canvas, tex, life: 0.8, max: 0.8, t0: now, dirty: true, drift: (Math.random() - 0.5) * 0.6 };
      this.nums.push(n);
    }
  }

  drawNumber(n) {
    const g = n.canvas.getContext('2d');
    g.clearRect(0, 0, 128, 64);
    g.font = '700 44px "Barlow Condensed", system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.75)';
    const txt = String(Math.max(1, Math.round(n.amount)));
    g.strokeText(txt, 64, 34);
    g.fillStyle = n.kill ? '#ff5050' : n.head ? '#ffd23a' : '#ffffff';
    g.fillText(txt, 64, 34);
    n.tex.needsUpdate = true; n.dirty = false;
  }

  updateNumbers(dt) {
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i];
      if (n.dirty) this.drawNumber(n);
      n.life -= dt;
      const age = n.max - n.life;
      n.sprite.position.copy(n.pos).add(new THREE.Vector3(n.drift * age, 0.25 + age * 1.1, 0));
      const pop = age < 0.08 ? 1 + (0.08 - age) * 5 : 1;            // quick pop when it appears
      const big = n.head || n.kill ? 1.2 : 1;
      n.sprite.scale.set(0.15 * pop * big, 0.075 * pop * big, 1);
      n.sprite.material.opacity = Math.min(1, n.life / 0.3);
      if (n.life <= 0) { this.scene.remove(n.sprite); n.sprite.material.dispose(); n.tex.dispose(); this.nums.splice(i, 1); }
    }
  }

  update(dt) {
    this.updateParts(dt);
    this.updateNumbers(dt);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const k = Math.max(0, it.life / it.max);
      it.obj.material.opacity = k;
      if (it.grow) it.obj.scale.setScalar(1 + (1 - k) * 2);
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        it.obj.geometry !== this.sparkGeo && it.obj.geometry.dispose();
        it.obj.material.dispose();
        this.items.splice(i, 1);
      }
    }
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.obj);
    for (const p of this.parts) this.scene.remove(p.mesh);
    for (const L of this.lights) this.scene.remove(L.l);
    this.lights = [];
    for (const n of this.nums) this.scene.remove(n.sprite);
    this.items = []; this.parts = []; this.nums = [];
  }
}
