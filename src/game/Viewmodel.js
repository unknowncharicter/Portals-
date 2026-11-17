import * as THREE from 'three';
import { gunModel, applySkin } from './Models.js';

// Where each gun sits on screen (view space, grip point).
const HOLD = {
  ar:       new THREE.Vector3(0.17, -0.2, -0.32),
  smg:      new THREE.Vector3(0.17, -0.18, -0.3),
  shotgun:  new THREE.Vector3(0.17, -0.2, -0.32),
  sniper:   new THREE.Vector3(0.17, -0.2, -0.3),
  burst:    new THREE.Vector3(0.17, -0.2, -0.3),
  crossbow: new THREE.Vector3(0.16, -0.19, -0.32),
  rocket:   new THREE.Vector3(0.24, -0.25, -0.5),
  pistol:   new THREE.Vector3(0.15, -0.16, -0.32),
  revolver: new THREE.Vector3(0.15, -0.16, -0.32),
};

// First-person gun, drawn in its own scene on top of the world (never clips into walls).
export class Viewmodel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#555566', 2.4));
    const d = new THREE.DirectionalLight('#ffffff', 1.6); d.position.set(1, 2, 1); this.scene.add(d);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.guns = {};

    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffdd77' }));
    this.flash.visible = false;
    this.scene.add(this.flash);

    this.kick = 0; this.bobT = 0; this.flashT = 0;
    this.swayX = 0; this.swayY = 0;
    this.current = null;
    this.hidden = false;
  }

  setAspect(a) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }

  // Change the gun skin (rebuilds the cached first-person guns).
  setSkin(skin, portalColor) {
    const key = (skin ? skin.id : 'default') + portalColor;
    if (key === this.skinKey) return;
    this.skinKey = key; this.skin = skin; this.portalColor = portalColor;
    for (const g of Object.values(this.guns)) this.root.remove(g);
    this.guns = {}; this.current = null;
  }

  show(id) {
    if (this.current === id) return;
    this.current = id;
    if (!this.guns[id]) {
      const m = gunModel(id);
      if (m) applySkin(m, this.skin, this.portalColor);
      if (m) { this.guns[id] = m; this.root.add(m); }
    }
    for (const [k, g] of Object.entries(this.guns)) g.visible = k === id;
  }

  fire(strength = 1) { this.kick = strength; this.flashT = 0.05; }

  update(dt, { moving, switching, reloading, lookX = 0, lookY = 0, ads = 0 }) {
    // The gun lags a little behind your aim.
    const k = Math.min(1, dt * 10);
    this.swayX += (THREE.MathUtils.clamp(-lookX * 0.0006, -0.04, 0.04) - this.swayX) * k;
    this.swayY += (THREE.MathUtils.clamp(lookY * 0.0006, -0.04, 0.04) - this.swayY) * k;
    this.bobT += dt * (moving ? 9 : 2);
    const bobA = moving ? 0.01 : 0.002;
    this.kick = Math.max(0, this.kick - dt * 8);
    const g = this.guns[this.current];
    if (!g) return;
    const hold = HOLD[this.current] || HOLD.ar;
    // Aiming: slide the gun to the middle of the screen, sights in line with the crosshair.
    const g0 = this.guns[this.current];
    const aimY = -(g0 ? g0.userData.muzzle.y : 0) - 0.045;
    const bob = 1 - ads * 0.8;
    let y = THREE.MathUtils.lerp(hold.y, aimY, ads) + Math.sin(this.bobT * 2) * bobA * bob;
    const x = THREE.MathUtils.lerp(hold.x, 0, ads) + Math.cos(this.bobT) * bobA * bob;
    let rx = this.kick * 0.12;
    if (switching > 0) y -= switching * 0.5;
    if (reloading) { y -= 0.06; rx -= 0.45; }
    this.root.position.set(x + this.swayX, y + this.swayY, hold.z + this.kick * 0.05);
    this.root.rotation.set(rx * (1 - ads * 0.6), 0.04 * (1 - ads), reloading ? 0.35 : 0);
    this.root.updateMatrixWorld();

    this.flashT -= dt;
    this.flash.visible = this.flashT > 0 && !this.hidden;
    if (this.flash.visible) this.flash.position.copy(g.userData.muzzle).applyMatrix4(this.root.matrixWorld);
  }

  // Muzzle position in view space (used to start tracers near the gun).
  muzzleView() {
    const g = this.guns[this.current];
    this.root.updateMatrixWorld();
    return g ? g.userData.muzzle.clone().applyMatrix4(this.root.matrixWorld) : new THREE.Vector3(0.2, -0.2, -0.8);
  }

  render(renderer) {
    if (this.hidden) return;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
