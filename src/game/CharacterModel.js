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
const SPRINT_SPEED = 7.26, CROUCH_SPEED = 2.05;
// 8 movement directions, in order around the compass (0 = forward, then clockwise).
const DIRS = ['f', 'fr', 'r', 'br', 'b', 'bl', 'l', 'fl'];
// Every clip holds the rifle except the stairs climb: those keep their own arms and just bend
// the upper body to aim up/down. The stairs clip gets the posed-arms treatment instead.
const POSED_ARMS = new Set(['stairs'])

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
    this.dead = false;
    this.held = 0;
    this.bend = 0;        // smoothed upper-body bend (aim up/down)
    this.play('idle', 1);
  }

  // Fall over (plays once and stays down). The fall matches where the hit came from.
  die({ fromBack = false, fromRight = false, crouched = false, head = false } = {}) {
    let name = crouched ? 'dieCrouch' : fromBack ? (head ? 'die5' : 'die2') : fromRight ? 'die3' : (head ? 'die4' : 'die1');
    if (!this.actions[name]) name = 'die1';
    const a = this.actions[name];
    if (!a) return;
    this.dead = true;
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    this.play(name, 1, true);
  }

  updateDead(dt) { this.mixer.update(dt); }

  // Back to normal after a respawn.
  reset() {
    this.dead = false;
    for (const a of Object.values(this.actions)) { a.stop(); a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; }
    this.current = null;
    this.held = 0;
    this.emoting = false;
    this.play('idle', 1, true);
  }

  // Attach something to a bone in metres, facing our -Z forward.
  socket(boneName) {
    const s = new THREE.Group();
    s.scale.setScalar(100);
    s.rotation.y = Math.PI;
    this.bones[boneName].add(s);
    return s;
  }

  // Switch animation with a short blend. Unless forced, an animation is kept for at least a
  // moment, so tiny wobbles in state (a frame off the ground, a single click) can't make the
  // body flicker between two poses.
  play(name, timeScale, force = false) {
    const a = this.actions[name];
    if (!a) return;
    if (this.current === a) { a.timeScale = timeScale; return; }
    if (this.current && !force && this.held < 0.18) return;
    a.timeScale = timeScale;
    a.reset().setEffectiveWeight(1).fadeIn(this.current ? 0.18 : 0).play();
    if (this.current) this.current.fadeOut(0.18);
    this.current = a;
    this.held = 0;
  }

  // s: { vel, yaw, pitch, grounded, airT, crouched, sliding, climbing, aiming }
  update(dt, s) {
    this.held += dt;
    // Keep the gun raised for a moment after aiming/shooting stops (no up-down-up flapping).
    this.aimHold = s.aiming ? 0.8 : Math.max(0, (this.aimHold || 0) - dt);
    s = { ...s, aiming: this.aimHold > 0 };
    const airborne = !s.grounded && (s.airT === undefined || s.airT > 0.2); // ignore single frames off the ground
    const fwdX = -Math.sin(s.yaw), fwdZ = -Math.cos(s.yaw);
    const fwd = s.vel.x * fwdX + s.vel.z * fwdZ;
    const side = s.vel.x * -fwdZ + s.vel.z * fwdX;
    const hs = Math.hypot(s.vel.x, s.vel.z);
    // Which of the 8 directions are we moving in, and how far off it?
    const ang = Math.atan2(side, fwd);
    const k = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
    let off = ang - Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
    let legYaw = 0;

    if (s.sliding) this.play('crouchIdle', 0);
    else if (s.crouched) {
      if (hs > 0.3) { this.play('c_' + DIRS[k], THREE.MathUtils.clamp(hs / CROUCH_SPEED, 0.6, 2.2)); legYaw = -off; }
      else this.play(s.aiming ? 'crouchIdleAim' : 'crouchIdle', 1);
    }
    else if (s.climbing && fwd > 0.5 * hs) this.play('stairs', THREE.MathUtils.clamp(hs / 5, 0.9, 1.7)); // going up steps
    else if (airborne) this.play('jump', 1);
    else if (hs < 0.6) this.play(s.aiming ? 'idleAim' : 'idle', 1);
    else { this.play('s_' + DIRS[k], THREE.MathUtils.clamp(hs / SPRINT_SPEED, 0.7, 1.6)); legYaw = -off; }

    this.model.rotation.y += (Math.PI + legYaw - this.model.rotation.y) * Math.min(1, dt * 12);
    this.mixer.update(dt);
    // Smooth and limit the aim bend: looking far up/down no longer folds the body in half.
    const target = THREE.MathUtils.clamp(s.pitch || 0, -0.7, 0.7) * 0.85;
    this.bend += (target - this.bend) * Math.min(1, dt * 10);
    if (this.current && POSED_ARMS.has(this.current.getClip().name)) this.pose(this.bend);
    else this.bendSpine(this.bend);
  }

  // Aim up/down with a rifle clip: bend the spine instead of re-posing the arms.
  bendSpine(pitch) {
    this.root.updateMatrixWorld(true);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
    for (const name of ['Spine', 'Spine1', 'Spine2']) {
      const bone = this.bones[name];
      if (!bone) continue;
      bone.getWorldQuaternion(_q);
      _d.setFromAxisAngle(right, pitch / 3); // spread the bend over three spine bones
      _q.premultiply(_d);
      bone.parent.getWorldQuaternion(_pq);
      bone.quaternion.copy(_pq.invert().multiply(_q));
      bone.updateMatrixWorld(true);
    }
  }

  // Victory emote after a match. kind 0: cheer with both arms pumping, 1: gun raised high
  // with spin hops, 2: wave with the free hand.
  emote(dt, t, kind) {
    this.held += dt;
    this.play('idle', 1, !this.emoting);
    this.emoting = true;
    this.model.rotation.y = Math.PI;
    this.mixer.update(dt);
    const pump = Math.sin(t * 9);
    if (kind === 0) this.poseArms({
      RightArm: [0.35, 0.95, -0.1], RightForeArm: [0.1, 1, 0.25 * pump],
      LeftArm: [-0.35, 0.95, -0.1], LeftForeArm: [-0.1, 1, 0.25 * pump],
    });
    else if (kind === 1) this.pose(1.25);
    else this.poseArms({
      RightArm: [0.85, 0.5, -0.15], RightForeArm: [0.55 * Math.sin(t * 7), 1, -0.1],
      LeftArm: AIM.LeftArm, LeftForeArm: AIM.LeftForeArm,
    });
  }

  // Point arm bones along directions given in character space.
  poseArms(dirs) {
    this.root.updateMatrixWorld(true);
    const parentQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    for (const [name, d] of Object.entries(dirs)) {
      const bone = this.bones[name];
      if (!bone) continue;
      const target = (Array.isArray(d) ? _v.set(...d) : _v.copy(d)).normalize().applyQuaternion(parentQ);
      bone.getWorldQuaternion(_q);
      _w.copy(Y).applyQuaternion(_q);
      _d.setFromUnitVectors(_w, target);
      _q.premultiply(_d);
      bone.parent.getWorldQuaternion(_pq);
      bone.quaternion.copy(_pq.invert().multiply(_q));
      bone.updateMatrixWorld(true);
    }
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
