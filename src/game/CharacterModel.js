import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

// Animated character (Mixamo rig) used for bots, and for you when seen through a portal.
// Legs come from the animation clips; the arms are posed every frame to hold the gun and
// follow where the character is aiming.

// Character models. 'robot' is the Mixamo rig the clips were made for; the others get the
// same clips copied onto their own skeleton (see Retarget.js).
const templates = {};       // id -> { scene, clips, boneMap, scale, tint }
const measureCache = {};
let template = null;        // the robot (source of the animation clips)

export function setCharacterTemplate(gltf) {
  template = { scene: gltf.scene, clips: gltf.animations };
  templates.robot = { scene: gltf.scene, clips: gltf.animations, boneMap: null, scale: 0.01 };
}
export function addCharacterTemplate(id, t) { templates[id] = t; }
export const hasCharacterModel = () => !!template;
export const hasModel = (id) => !!templates[id];
export const robotTemplate = () => template;

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
  constructor(colors, modelId = 'robot') {
    this.root = new THREE.Group();
    const t = templates[modelId] || templates.robot;
    this.modelId = templates[modelId] ? modelId : 'robot';
    const model = SkeletonUtils.clone(t.scene);
    model.scale.setScalar(t.scale);          // the robot rig is in centimetres
    model.rotation.y = Math.PI;              // the models face +Z; our characters face -Z
    model.position.y = -0.9;                 // feet at the bottom of the 1.8 m body
    this.model = model;
    this.root.add(model);

    // Bones by their Mixamo names, so the rest of the code works with every model.
    const byName = {};
    model.traverse(o => { if (o.isBone) byName[o.name.replace('mixamorig', '')] = o; });
    this.bones = {};
    if (t.boneMap) { for (const [mx, own] of Object.entries(t.boneMap)) if (byName[own]) this.bones[mx] = byName[own]; }
    else this.bones = byName;

    model.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false;               // skinned bounds don't follow the animation
      o.castShadow = false;
      if (!t.tint) {
        const joints = /joint/i.test(o.material.name);
        o.material = new THREE.MeshLambertMaterial({ color: joints ? colors.joints : colors.body });
        return;
      }
      // Textured/coloured models: keep their look, recolour the parts the player customises.
      const recolor = (m) => {
        const role = t.tint[m.name];
        const c = new THREE.MeshLambertMaterial({ color: m.color, map: m.map || null });
        if (role && colors[role]) c.color.set(colors[role]);
        c.name = m.name;
        return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(recolor) : recolor(o.material);
    });

    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const clip of t.clips) this.actions[clip.name] = this.mixer.clipAction(clip);
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
  // Size of a body part, measured from the mesh: the vertices that mostly follow one of
  // `boneNames`, in the coordinates of `space` (a socket). Percentiles ignore spikes (hair).
  // Cached per model, since every copy is the same.
  measure(key, boneNames, space) {
    const cacheKey = this.modelId + ':' + key;
    if (measureCache[cacheKey]) return measureCache[cacheKey];
    this.root.updateMatrixWorld(true);
    const want = new Set(boneNames.map(n => this.bones[n]).filter(Boolean));
    const xs = [], ys = [], zs = [];
    const v = new THREE.Vector3();
    this.model.traverse(o => {
      if (!o.isSkinnedMesh) return;
      const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
      const bones = o.skeleton.bones;
      for (let i = 0; i < si.count; i++) {
        let best = 0, bi = -1;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > best) { best = w; bi = si.getComponent(i, k); } }
        if (bi < 0 || !want.has(bones[bi])) continue;
        o.getVertexPosition(i, v);
        o.localToWorld(v);
        space.worldToLocal(v);
        xs.push(v.x); ys.push(v.y); zs.push(v.z);
      }
    });
    if (xs.length < 10) return null;
    const pc = (a, p) => { a.sort((m, n) => m - n); return a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))]; };
    const r = { x0: pc(xs, 0.03), x1: pc(xs, 0.97), y0: pc(ys, 0.03), y1: pc(ys, 0.93), z0: pc(zs, 0.03), z1: pc(zs, 0.97) };
    measureCache[cacheKey] = r;
    return r;
  }

  // The socket is lined up with the character (not the bone) in the rest pose, and in metres.
  socket(boneName) {
    const s = new THREE.Group();
    const bone = this.bones[boneName];
    this.root.updateMatrixWorld(true);
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const boneQ = bone.getWorldQuaternion(new THREE.Quaternion());
    s.quaternion.copy(boneQ.invert().multiply(rootQ));
    s.scale.setScalar(1 / bone.getWorldScale(new THREE.Vector3()).x * this.root.getWorldScale(new THREE.Vector3()).x);
    bone.add(s);
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
    this.feetForward(); // the idle is a rifle stance (back foot turned out): cheering, both feet face forward
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

  // Play a dance clip (looping), with no aiming adjustments. The dancer stays on its spot: some
  // dances walk about (Thriller up to 2.6 m), which could carry a winner into a wall or off a
  // ledge, so the hips keep their place across the floor (they still bob up and down).
  dance(dt, clip) {
    this.held += dt;
    const a = this.actions[clip];
    if (this.current !== a) {
      a.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).fadeIn(0.25).play();
      if (this.current) this.current.fadeOut(0.25);
      this.current = a; this.held = 0;
      this.danceSpot = this.hipsSpot();
    }
    this.emoting = true;
    this.model.rotation.y = Math.PI;
    this.mixer.update(dt);
    this.keepOnSpot(this.danceSpot);
  }

  // Where the hips are now, and which of their (parent's) axes points up.
  hipsSpot() {
    const hips = this.bones.Hips;
    if (!hips || !hips.parent) return null;
    hips.parent.updateMatrixWorld(true);
    const up = _v.set(0, 1, 0).applyQuaternion(hips.parent.getWorldQuaternion(_q).invert());
    const ax = [Math.abs(up.x), Math.abs(up.y), Math.abs(up.z)];
    const upAxis = ax.indexOf(Math.max(...ax));
    return { pos: hips.position.clone(), upAxis };
  }

  // Puts the hips back over their spot across the floor (only their height moves).
  keepOnSpot(spot) {
    const hips = this.bones.Hips;
    if (!spot || !hips) return;
    const axes = ['x', 'y', 'z'];
    for (let i = 0; i < 3; i++) if (i !== spot.upAxis) hips.position[axes[i]] = spot.pos[axes[i]];
    hips.updateMatrixWorld(true);
  }

  // Turns each foot to point straight ahead (keeping how far it tips up or down).
  feetForward() {
    this.root.updateMatrixWorld(true);
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const toRoot = rootQ.clone().invert();
    const dirs = {};
    for (const name of ['LeftFoot', 'RightFoot']) {
      const bone = this.bones[name];
      if (!bone) continue;
      const d = Y.clone().applyQuaternion(bone.getWorldQuaternion(_q)).applyQuaternion(toRoot); // in character space
      const flat = Math.hypot(d.x, d.z);
      if (flat < 0.05) continue; // pointing straight down: nothing to turn
      dirs[name] = [0, d.y, -flat]; // the same tilt, facing forward (-Z)
    }
    this.poseArms(dirs); // (points any bone along a direction, not just arms)
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
