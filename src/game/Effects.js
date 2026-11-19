import * as THREE from 'three';

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
    };
  }

  // Burst of particles where someone was eliminated. type: sparks | confetti | pixels | ghost | vortex
  killFx(type, pos, color) {
    const R = Math.random, c = pos.clone();
    const add = (geo, col, vel, life, opts = {}) => {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, depthWrite: false }));
      mesh.position.copy(c).add(opts.offset || new THREE.Vector3());
      if (opts.rot) mesh.rotation.set(R() * 6, R() * 6, R() * 6);
      this.scene.add(mesh);
      this.parts.push({ mesh, vel, life, max: life, g: opts.g ?? 9, spin: opts.spin || 0, grow: opts.grow || 0, shrink: opts.shrink || false, vortex: opts.vortex || false });
    };
    const out = (s, up = 0) => new THREE.Vector3((R() - 0.5) * 2 * s, up + R() * s, (R() - 0.5) * 2 * s);
    if (type === 'confetti') {
      for (let i = 0; i < 34; i++) add(this.geo.flake, new THREE.Color().setHSL(R(), 0.9, 0.6), out(3.5, 3), 1.5, { g: 5, rot: true, spin: 8 });
    } else if (type === 'pixels') {
      for (let i = 0; i < 26; i++) add(this.geo.cube, new THREE.Color(color).offsetHSL(0, 0, (R() - 0.5) * 0.3), out(4, 2), 1.0, { g: 12, rot: true, spin: 4, shrink: true });
    } else if (type === 'ghost') {
      for (let i = 0; i < 9; i++) add(this.geo.ghost, '#eef2ff', new THREE.Vector3((R() - 0.5) * 0.8, 1.2 + R() * 1.2, (R() - 0.5) * 0.8), 1.5, { g: 0, grow: 1.2, offset: out(0.3) });
    } else if (type === 'vortex') {
      const ring = new THREE.Mesh(this.geo.ring, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
      ring.position.copy(c); ring.rotation.x = Math.PI / 2; this.scene.add(ring);
      this.parts.push({ mesh: ring, vel: new THREE.Vector3(), life: 0.8, max: 0.8, g: 0, spin: 10, ringShrink: true });
      for (let i = 0; i < 18; i++) {
        const a = R() * Math.PI * 2, r = 1.2 + R() * 0.5;
        add(this.geo.ball, color, new THREE.Vector3(), 0.8, { g: 0, offset: new THREE.Vector3(Math.cos(a) * r, R() * 1.6 - 0.6, Math.sin(a) * r), vortex: true });
      }
    } else {
      for (let i = 0; i < 16; i++) add(this.geo.ball, i % 2 ? '#ff5030' : '#ffb040', out(4, 1.5), 0.6, { g: 9, shrink: true });
    }
  }

  updateParts(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      const k = Math.max(0, p.life / p.max);
      const m = p.mesh;
      if (p.vortex) {
        // Spiral in toward the centre.
        const center = this.parts.find(q => q.ringShrink)?.mesh.position || m.position;
        const to = center.clone().sub(m.position);
        const tangent = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(3);
        m.position.addScaledVector(to, dt * 3).addScaledVector(tangent, dt);
      } else {
        p.vel.y -= p.g * dt;
        m.position.addScaledVector(p.vel, dt);
      }
      if (p.spin) { m.rotation.z += p.spin * dt; m.rotation.y += p.spin * 0.5 * dt; }
      if (p.grow) m.scale.setScalar(1 + (1 - k) * p.grow);
      if (p.shrink) m.scale.setScalar(Math.max(0.05, k));
      if (p.ringShrink) m.scale.setScalar(Math.max(0.02, k * 1.5));
      m.material.opacity = Math.min(1, k * 1.5);
      if (p.life <= 0) { this.scene.remove(m); m.material.dispose(); this.parts.splice(i, 1); }
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
    for (const n of this.nums) this.scene.remove(n.sprite);
    this.items = []; this.parts = []; this.nums = [];
  }
}
