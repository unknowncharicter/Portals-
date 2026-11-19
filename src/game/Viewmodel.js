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
    // Looking through a tube scope: hide all of it except the eyepiece end (a clear view).
    this.clip = new THREE.Plane(new THREE.Vector3(0, 0, 1), 1e6);
  }

  setAspect(a) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }

  // Change the gun skin (rebuilds the cached first-person guns).
  setSkin(skin, portalColor) {
    const key = (skin ? skin.id : 'default') + portalColor;
    if (key === this.skinKey) return;
    this.skinKey = key; this.skin = skin; this.portalColor = portalColor;
    for (const g of Object.values(this.guns)) this.root.remove(g);
    this.guns = {}; this.current = null; this.currentKey = null;
  }

  // mods: the Gunsmith setup for this gun (frame and attachments).
  show(id, mods = null) {
    const key = id + (mods ? JSON.stringify(mods) : '');
    if (this.currentKey === key) return;
    this.current = key; this.currentKey = key; this.currentId = id;
    if (!this.guns[key]) {
      const m = gunModel(id, mods);
      if (m) applySkin(m, this.skin, this.portalColor);
      // Highest point of the gun (for aiming: keep all of it below the crosshair).
      if (m) m.userData.top = new THREE.Box3().setFromObject(m).max.y;
      if (m) m.traverse(o => { if (o.isMesh && o.userData.scopeBody) { o.material = o.material.clone(); o.material.clippingPlanes = [this.clip]; } });
      if (m) { this.guns[key] = m; this.root.add(m); }
    }
    for (const [k, g] of Object.entries(this.guns)) g.visible = k === key;
  }

  fire(strength = 1, flash = true) { this.kick = strength; this.flashT = flash ? 0.05 : 0; }

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
    const hold = HOLD[this.currentId] || HOLD.ar;
    // Aiming: slide the gun to the middle of the screen, just under the crosshair, so the top of
    // the gun lines up with it and never covers what you're aiming at.
    // With a scope, look straight through its middle.
    const aimY = g.userData.sight !== undefined ? -g.userData.sight : -(g.userData.top ?? g.userData.muzzle.y) - 0.012;
    const bob = 1 - ads * 0.8;
    let y = THREE.MathUtils.lerp(hold.y, aimY, ads) + Math.sin(this.bobT * 2) * bobA * bob;
    const x = THREE.MathUtils.lerp(hold.x, 0, ads) + Math.cos(this.bobT) * bobA * bob;
    let rx = this.kick * 0.12;
    if (switching > 0) y -= switching * 0.5;
    if (reloading) { y -= 0.06; rx -= 0.45; }
    // With a sight: bring its back close to your eye, so you look through it (like a real scope).
    const scoped = g.userData.sight !== undefined;
    const z = scoped ? THREE.MathUtils.lerp(hold.z, -g.userData.eyeDist - g.userData.eye, ads) : hold.z - ads * 0.06;
    const sw = scoped ? 1 - ads * 0.75 : 1; // steadier while looking through a sight
    this.root.position.set(x + this.swayX * sw, y + this.swayY * sw, z + this.kick * (scoped ? 0.02 : 0.05));
    this.root.rotation.set(rx * (1 - ads * (scoped ? 0.85 : 0.6)), 0.04 * (1 - ads), reloading ? 0.35 : 0);
    this.root.updateMatrixWorld();
    if (scoped && g.userData.scopeLen && ads > 0.6) {
      const cut = new THREE.Vector3(0, g.userData.sight, g.userData.eye - g.userData.scopeLen * 0.22).applyMatrix4(this.root.matrixWorld);
      this.clip.constant = -cut.z;
    } else this.clip.constant = 1e6;

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
    renderer.localClippingEnabled = true;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
