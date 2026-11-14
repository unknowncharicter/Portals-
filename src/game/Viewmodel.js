import * as THREE from 'three';

// First-person gun, drawn in its own scene on top of the world (never clips into walls).
export class Viewmodel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#555566', 2.2));
    const d = new THREE.DirectionalLight('#ffffff', 1.2); d.position.set(1, 2, 1); this.scene.add(d);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.guns = { rifle: this.makeRifle(), pistol: this.makePistol() };
    for (const g of Object.values(this.guns)) { g.visible = false; this.root.add(g); }

    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffdd77' }));
    this.flash.visible = false;
    this.scene.add(this.flash);

    this.kick = 0; this.bobT = 0; this.flashT = 0;
    this.current = null;
  }

  makeRifle() {
    const g = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: '#30323c' }), mid = new THREE.MeshLambertMaterial({ color: '#555a6a' }), acc = new THREE.MeshLambertMaterial({ color: '#6fa0ff' });
    const add = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); };
    add(0.07, 0.09, 0.55, dark, 0, 0, -0.2);
    add(0.03, 0.03, 0.25, mid, 0, 0.015, -0.55);
    add(0.05, 0.12, 0.06, dark, 0, -0.09, -0.1);
    add(0.05, 0.14, 0.05, mid, 0, -0.1, -0.3);
    add(0.06, 0.07, 0.18, dark, 0, -0.01, 0.12);
    add(0.072, 0.02, 0.3, acc, 0, 0.055, -0.2);
    g.userData.muzzle = new THREE.Vector3(0, 0.015, -0.7);
    return g;
  }

  makePistol() {
    const g = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: '#2c2e36' }), acc = new THREE.MeshLambertMaterial({ color: '#ff70c8' });
    const add = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); };
    add(0.05, 0.07, 0.25, dark, 0, 0, -0.1);
    add(0.045, 0.13, 0.06, dark, 0, -0.08, 0);
    add(0.052, 0.015, 0.2, acc, 0, 0.04, -0.1);
    g.userData.muzzle = new THREE.Vector3(0, 0.01, -0.24);
    return g;
  }

  setAspect(a) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }

  show(id) {
    if (this.current === id) return;
    this.current = id;
    for (const [k, g] of Object.entries(this.guns)) g.visible = k === id;
  }

  fire() { this.kick = 1; this.flashT = 0.05; }

  update(dt, { moving, switching, reloading }) {
    this.bobT += dt * (moving ? 9 : 2);
    const bobA = moving ? 0.012 : 0.003;
    this.kick = Math.max(0, this.kick - dt * 10);
    const g = this.guns[this.current];
    if (!g) return;
    let y = -0.2 + Math.sin(this.bobT * 2) * bobA;
    let x = 0.2 + Math.cos(this.bobT) * bobA;
    let rx = this.kick * 0.12;
    if (switching > 0) y -= switching * 0.8;
    if (reloading) { y -= 0.08; rx -= 0.5; }
    this.root.position.set(x, y, -0.35 + this.kick * 0.05);
    this.root.rotation.set(rx, 0, reloading ? 0.3 : 0);

    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    if (this.flash.visible) {
      this.flash.position.copy(g.userData.muzzle).applyMatrix4(this.root.matrixWorld);
      this.root.updateMatrixWorld();
      this.flash.position.copy(g.userData.muzzle.clone().applyMatrix4(this.root.matrixWorld));
    }
  }

  // Muzzle position in view space (used to start tracers near the gun).
  muzzleView() {
    const g = this.guns[this.current];
    this.root.updateMatrixWorld();
    return g ? g.userData.muzzle.clone().applyMatrix4(this.root.matrixWorld) : new THREE.Vector3(0.2, -0.2, -0.8);
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
