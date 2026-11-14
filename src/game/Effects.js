import * as THREE from 'three';

// Bullet tracers and impact sparks.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.sparkGeo = new THREE.SphereGeometry(0.06, 6, 4);
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

  update(dt) {
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

  clear() { for (const it of this.items) this.scene.remove(it.obj); this.items = []; }
}
