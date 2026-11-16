import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

// Animated character (Mixamo rig) used for bots, and for you when seen through a portal.
// Legs come from the animation clips; the arms are posed every frame to hold the gun and
// follow where the character is aiming.

let template = null; // { scene, clips }

export function setCharacterTemplate(gltf) {
  template = { scene: gltf.scene, clips: gltf.animations };
}
export const hasCharacterModel = () => !!template;

// How fast each clip moves when played at normal speed (m/s), measured from the original
// root motion. Used to match the leg speed to the real movement speed.
const CLIP_SPEED = { run: 5.95, walk: 1.81, back: 1.1, crouch: 1.23 };

// Arm directions for a rifle hold, in character space (forward = -Z, right = +X, up = +Y).
const AIM = {
  RightArm:     new THREE.Vector3(0.28, -0.78, -0.3).normalize(),
  RightForeArm: new THREE.Vector3(-0.22, 0.22, -0.95).normalize(),
  LeftArm:      new THREE.Vector3(-0.28, -0.62, -0.62).normalize(),
  LeftForeArm:  new THREE.Vector3(0.42, 0.2, -0.88).normalize(),
};
const Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _d = new THREE.Quaternion();
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class AnimatedBody {
  // colors: { body, joints }
  constructor(colors) {
    this.root = new THREE.Group();
    const model = SkeletonUtils.clone(template.scene);
    model.scale.setScalar(0.01);            // the rig is in centimetres
    model.rotation.y = Math.PI;              // Mixamo faces +Z; our characters face -Z
    model.position.y = -0.9;                 // feet at the bottom of the 1.8 m body
    this.model = model;
    this.root.add(model);

    this.bones = {};
    model.traverse(o => {
      if (o.isBone) this.bones[o.name.replace('mixamorig', '')] = o;
      if (o.isSkinnedMesh) {
        const joints = /joint/i.test(o.material.name);
        o.material = new THREE.MeshLambertMaterial({ color: joints ? colors.joints : colors.body });
        o.frustumCulled = false;             // skinned bounds don't follow the animation
      }
    });

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of template.clips) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.current = null;
    this.play('walk', 0);
  }

  // Attach something to a bone in metres, facing our -Z forward.
  socket(boneName) {
    const s = new THREE.Group();
    s.scale.setScalar(100);
    s.rotation.y = Math.PI;
    this.bones[boneName].add(s);
    return s;
  }

  play(name, timeScale) {
    const a = this.actions[name];
    if (!a) return;
    a.timeScale = timeScale;
    if (this.current === a) return;
    a.reset().setEffectiveWeight(1).fadeIn(this.current ? 0.15 : 0).play();
    if (this.current) this.current.fadeOut(0.15);
    this.current = a;
  }

  // s: { vel, yaw, pitch, grounded, crouched, sliding }
  update(dt, s) {
    const fwdX = -Math.sin(s.yaw), fwdZ = -Math.cos(s.yaw);
    const fwd = s.vel.x * fwdX + s.vel.z * fwdZ;
    const side = s.vel.x * -fwdZ + s.vel.z * fwdX;
    const hs = Math.hypot(s.vel.x, s.vel.z);
    let legYaw = 0;

    if (s.sliding) this.play('crouch', 0);
    else if (s.crouched) this.play('crouch', hs > 0.3 ? THREE.MathUtils.clamp(hs / CLIP_SPEED.crouch, 0.6, 2.2) * (fwd < -0.3 ? -1 : 1) : 0);
    else if (!s.grounded) this.play('run', 0.25);
    else if (hs < 0.6) this.play('walk', 0);
    else if (fwd < -0.5 * hs) {
      // Backpedal: a slow walk backwards, or the run played in reverse when fast.
      if (hs < 3) this.play('back', THREE.MathUtils.clamp(hs / CLIP_SPEED.back, 0.8, 2.4));
      else this.play('run', -THREE.MathUtils.clamp(hs / CLIP_SPEED.run, 0.7, 1.6));
      legYaw = THREE.MathUtils.clamp(Math.atan2(side, -fwd), -1, 1) * -0.8;
    } else {
      this.play('run', THREE.MathUtils.clamp(hs / CLIP_SPEED.run, 0.7, 1.6));
      // Strafing: turn the legs toward the movement (up to ~70°).
      legYaw = THREE.MathUtils.clamp(Math.atan2(side, fwd), -1.2, 1.2) * -1;
    }
    this.model.rotation.y += (Math.PI + legYaw - this.model.rotation.y) * Math.min(1, dt * 12);
    this.mixer.update(dt);
    this.pose(s.pitch || 0);
  }

  // Point the arms where the character is aiming (after the animation has moved them).
  pose(pitch) {
    this.root.updateMatrixWorld(true);
    const parentQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
    for (const name of ['RightArm', 'RightForeArm', 'LeftArm', 'LeftForeArm']) {
      const bone = this.bones[name];
      if (!bone) continue;
      const target = _v.copy(AIM[name]).applyQuaternion(pitchQ).applyQuaternion(parentQ);
      bone.getWorldQuaternion(_q);
      _w.copy(Y).applyQuaternion(_q);                 // where the bone points now
      _d.setFromUnitVectors(_w, target);
      _q.premultiply(_d);                             // new world rotation
      bone.parent.getWorldQuaternion(_pq);
      bone.quaternion.copy(_pq.invert().multiply(_q));
      bone.updateMatrixWorld(true);
    }
  }

  // Right hand position in the coordinates of `space` (the character group).
  handIn(space, out = new THREE.Vector3()) {
    const hand = this.bones.RightHand;
    hand.getWorldPosition(out);
    return space.worldToLocal(out);
  }
}
