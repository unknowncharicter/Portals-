import * as THREE from 'three';

// Copies animation clips from one skeleton to another with different bone names and rest
// poses (here: Mixamo clips onto the Quaternius characters).
//
// How: first each target bone is turned so it points the same way as the matching source
// bone in its rest pose (T-pose vs A-pose). Then, every frame, each target bone gets the same
// world-space rotation change (from rest) as its source bone. Hips height is scaled to the
// target's leg length.

const _q = new THREE.Quaternion(), _p = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

// Mixamo bone (without the "mixamorig" prefix) -> Quaternius bone (three.js strips the dots).
export const MIXAMO_TO_QUAT = {
  Hips: 'Body', Spine: 'Abdomen', Spine1: 'Torso', Spine2: 'Chest', Neck: 'Neck', Head: 'Head',
  LeftShoulder: 'ShoulderL', LeftArm: 'UpperArmL', LeftForeArm: 'LowerArmL', LeftHand: 'WristL',
  RightShoulder: 'ShoulderR', RightArm: 'UpperArmR', RightForeArm: 'LowerArmR', RightHand: 'WristR',
  LeftUpLeg: 'UpperLegL', LeftLeg: 'LowerLegL', LeftFoot: 'FootL',
  RightUpLeg: 'UpperLegR', RightLeg: 'LowerLegR', RightFoot: 'FootR',
};
for (const side of ['Left', 'Right']) {
  const s = side[0];
  for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'])
    for (let i = 1; i <= 3; i++) MIXAMO_TO_QUAT[`${side}Hand${f}${i}`] = `${f}${i}${s}`;
}

// The Quaternius rig is set up for IK: the feet hang off the root bone, not the legs. Attach
// each foot to its lower leg (keeping its rest position, so the skin still fits).
export function fixQuaterniusRig(scene) {
  scene.updateMatrixWorld(true);
  for (const s of ['L', 'R']) {
    const leg = scene.getObjectByName('LowerLeg' + s), foot = scene.getObjectByName('Foot' + s);
    if (leg && foot && foot.parent !== leg) leg.attach(foot);
  }
  scene.updateMatrixWorld(true);
}

const PREFERRED_CHILD = /Spine|Neck|ForeArm|Leg$|Hand$|Middle1|2$|3$/;

function bonesByName(root, strip = '') {
  const out = {};
  root.traverse(o => { if (o.isBone) out[strip ? o.name.replace(strip, '') : o.name] = o; });
  return out;
}

// src/tgt: scenes (cloned, at the origin, both facing the same way). map: src name -> tgt name.
export function retargetClips(src, tgt, clips, map, { fps = 30, srcPrefix = 'mixamorig' } = {}) {
  src.updateMatrixWorld(true); tgt.updateMatrixWorld(true);
  const sb = bonesByName(src, srcPrefix), tb = bonesByName(tgt);
  // Pairs in target hierarchy order (parents before children).
  const pairs = [];
  for (const [sn, tn] of Object.entries(map)) if (sb[sn] && tb[tn]) pairs.push({ s: sb[sn], t: tb[tn], sn });
  const depth = (o) => { let d = 0; while (o.parent) { d++; o = o.parent; } return d; };
  pairs.sort((x, y) => depth(x.t) - depth(y.t));
  const byS = new Map(pairs.map(p => [p.s, p]));

  // Rest poses and the "point the same way" alignment.
  for (const p of pairs) {
    p.sRest = p.s.getWorldQuaternion(new THREE.Quaternion());
    p.tRestLocal = p.t.quaternion.clone();
    const tRest = p.t.getWorldQuaternion(new THREE.Quaternion());
    const kids = p.s.children.filter(c => byS.has(c));
    const kid = kids.find(c => PREFERRED_CHILD.test(c.name.replace(srcPrefix, ''))) || kids[0];
    let align = new THREE.Quaternion();
    if (kid) {
      const k = byS.get(kid);
      const ds = k.s.getWorldPosition(_a).sub(p.s.getWorldPosition(_b)).normalize().clone();
      const dt = k.t.getWorldPosition(_a).sub(p.t.getWorldPosition(_b)).normalize().clone();
      if (ds.lengthSq() > 0 && dt.lengthSq() > 0) align.setFromUnitVectors(dt, ds);
    }
    p.tAligned = align.multiply(tRest);           // target bone, posed like the source rest
    p.sRestInv = p.sRest.clone().invert();
  }
  const hips = pairs.find(p => p.sn === 'Hips');
  const sHipRest = hips.s.getWorldPosition(new THREE.Vector3());
  const tHipRest = hips.t.getWorldPosition(new THREE.Vector3());
  const tHipLocalRest = hips.t.position.clone();
  const ratio = tHipRest.y / Math.max(0.01, sHipRest.y);

  const mixer = new THREE.AnimationMixer(src);
  const out = [];
  for (const clip of clips) {
    const action = mixer.clipAction(clip);
    action.play();
    const n = Math.max(2, Math.ceil(clip.duration * fps) + 1);
    const times = new Float32Array(n);
    const qv = pairs.map(() => new Float32Array(n * 4));
    const pv = new Float32Array(n * 3);
    for (let f = 0; f < n; f++) {
      const t = Math.min(clip.duration, f / fps);
      times[f] = t;
      mixer.setTime(t);
      src.updateMatrixWorld(true);
      pairs.forEach((p, i) => {
        // world rotation = source change since rest, applied to the aligned target rest
        p.s.getWorldQuaternion(_q).multiply(p.sRestInv).multiply(p.tAligned);
        p.t.parent.getWorldQuaternion(_p).invert();
        p.t.quaternion.copy(_p.multiply(_q));
        p.t.updateMatrixWorld(true);
        p.t.quaternion.toArray(qv[i], f * 4);
      });
      // Hips position: same movement from rest, scaled, in the target's parent space.
      const d = hips.s.getWorldPosition(_a).sub(sHipRest).multiplyScalar(ratio);
      const w = tHipRest.clone().add(d);
      const local = hips.t.parent.worldToLocal(w);
      local.toArray(pv, f * 3);
    }
    action.stop();
    mixer.uncacheAction(clip);
    const tracks = pairs.map((p, i) => new THREE.QuaternionKeyframeTrack(`${p.t.name}.quaternion`, times, qv[i]));
    tracks.push(new THREE.VectorKeyframeTrack(`${hips.t.name}.position`, times, pv));
    out.push(new THREE.AnimationClip(clip.name, clip.duration, tracks));
  }
  // Put the target back in its rest pose.
  for (const p of pairs) p.t.quaternion.copy(p.tRestLocal);
  hips.t.position.copy(tHipLocalRest);
  tgt.updateMatrixWorld(true);
  return out;
}
