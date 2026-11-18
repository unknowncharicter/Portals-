import * as THREE from 'three';
import { AnimatedBody, hasCharacterModel } from './CharacterModel.js';
import { hatModel, faceModel, backModel } from './Models.js';

// Character customization: colours, hats and the blocky body model.
export const SHIRTS = ['#e8e8f0', '#2b2d3a', '#d84a4a', '#3a6fd8', '#3ab060', '#e0a030', '#9a5ad8', '#e070b0', '#30c0c0', '#7a5030'];
export const PANTS = ['#2a2a35', '#3b4a6a', '#5a4632', '#556b2f', '#7a7a85', '#1e3a5f'];
export const SKINS = ['#f6d7b8', '#f0c8a0', '#d6a27a', '#a8704a', '#6e4630', '#8fd06a'];

export const HATS = [
  { id: 'none',       name: 'None',       price: 0 },
  { id: 'cap',        name: 'Cap',        price: 0 },
  { id: 'beanie',     name: 'Beanie',     price: 0 },
  { id: 'helmet',     name: 'Hard hat',     price: 80 },
  { id: 'headphones', name: 'Headphones', price: 150 },
  { id: 'tophat',     name: 'Top hat',    price: 250 },
  { id: 'horns',      name: 'Horns',      price: 300 },
  { id: 'crown',      name: 'Crown',      price: 500 },
];

// Character models (all free except the King). 'robot' is the original Mixamo robot.
export const BODIES = [
  { id: 'swat',       name: 'SWAT',       icon: '🪖', price: 0 },
  { id: 'punk',       name: 'Punk',       icon: '🧑‍🎤', price: 0 },
  { id: 'robot',      name: 'Robot',      icon: '🤖', price: 0 },
  { id: 'casual',     name: 'Casual',     icon: '👕', price: 0 },
  { id: 'hoodie',     name: 'Hoodie',     icon: '🧥', price: 0 },
  { id: 'farmer',     name: 'Farmer',     icon: '👨‍🌾', price: 0 },
  { id: 'worker',     name: 'Worker',     icon: '👷', price: 0 },
  { id: 'beach',      name: 'Beach',      icon: '🏖️', price: 0 },
  { id: 'business',   name: 'Business',   icon: '💼', price: 0 },
  { id: 'adventurer', name: 'Adventurer', icon: '🧭', price: 0 },
  { id: 'astronaut',  name: 'Astronaut',  icon: '👨‍🚀', price: 0 },
  { id: 'king',       name: 'King',       icon: '🤴', price: 1000 },
];
// Where hats/masks and back items sit on each model (head: scale, height above the head bone;
// back: scale, y, z from the upper spine).
const RIG = {
  robot: { head: [0.62, 0.12], back: [0.8, -0.26, -0.03] },
  default: { head: [0.72, 0.15], back: [0.85, -0.24, -0.05] },
  swat:  { head: [0.74, 0.15], back: [0.85, -0.24, -0.06] },
  punk:  { head: [0.7, 0.14], back: [0.85, -0.24, -0.05] },
};

// Face accessories (on the head, in front of the face).
export const FACES = [
  { id: 'nofaceitem', name: 'None',       icon: '🙂', price: 0 },
  { id: 'visor',      name: 'Visor',      icon: '🥽', price: 0 },
  { id: 'shades',     name: 'Pixel shades', icon: '🕶️', price: 120 },
  { id: 'glasses',    name: 'Sport glasses', icon: '👓', price: 100 },
  { id: 'ninja',      name: 'Ninja mask', icon: '🥷', price: 180 },
  { id: 'gasmask',    name: 'Gas mask',   icon: '😷', price: 260 },
  { id: 'skull',      name: 'Skull mask', icon: '💀', price: 350 },
  { id: 'cyber',      name: 'Cyber face', icon: '🤖', price: 450 },
];
// Back accessories.
export const BACKS = [
  { id: 'noback',   name: 'None',     icon: '⬜', price: 0 },
  { id: 'backpack', name: 'Backpack', icon: '🎒', price: 150 },
  { id: 'katana',   name: 'Katana',   icon: '🗡️', price: 280 },
  { id: 'cape',     name: 'Cape',     icon: '🦸', price: 300 },
  { id: 'jetpack',  name: 'Jetpack',  icon: '🚀', price: 450 },
  { id: 'wings',    name: 'Wings',    icon: '🪽', price: 600 },
];

export const DEFAULT_LOOK = { name: 'Player', model: 'swat', shirt: SHIRTS[3], pants: PANTS[0], skin: SKINS[1], hat: 'none', face: 'nofaceitem', back: 'noback' };

const HELMETED = new Set(['swat', 'astronaut', 'king']);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
export function randomLook(name) {
  const model = pick(['swat', 'swat', 'punk', ...BODIES.filter(b => b.id !== 'robot').map(b => b.id)]);
  return { name, model, shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKINS.slice(0, 5)),
    hat: HELMETED.has(model) ? 'none' : pick(['none', 'none', 'none', ...HATS.map(h => h.id)]),
    face: HELMETED.has(model) ? 'nofaceitem' : pick(['nofaceitem', 'nofaceitem', 'shades', 'ninja', 'skull', 'gasmask']),
    back: pick(['noback', 'noback', 'backpack', 'cape', 'katana']) };
}

export function cleanName(s) {
  return (s || '').replace(/[^\w \-.]/g, '').trim().slice(0, 14) || 'Player';
}

function nameTag(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(250, g.measureText(text).width + 28);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath(); g.roundRect((256 - w) / 2, 8, w, 48, 14); g.fill();
  g.fillStyle = color;
  g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.2, 0.3, 1);
  s.position.y = 1.3;
  return s;
}

// Returns { group, legL, legR, gunHolder, tag }.
// teamColor: shoulder pads + belt (so teams are clear whatever the shirt is). tag: show a name tag.
export function buildCharacterMesh(look, opts = {}) {
  return hasCharacterModel() ? buildAnimated(look, opts) : buildBlocky(look, opts);
}

// Animated (Mixamo) body: shirt colour on the body, pants colour on the joints.
// Hats and the visor sit on the head bone; the team band sits on the hips.
function buildAnimated(look, { visor = '#33aaff', teamColor = null, tag = true } = {}) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const body = new AnimatedBody({ body: look.shirt, joints: look.pants, skin: look.skin }, look.model || 'swat');
  g.add(body.root);
  const rig = RIG[body.modelId] || RIG.default;

  // Head socket: the accessories are made for the blocky head (a 0.42 cube centred at 0.72).
  // Fit that cube onto this model's real head, measured from its mesh.
  const head = body.socket('Head');
  const hatRoot = new THREE.Group();
  const hb = body.measure('head', ['Head'], head);
  if (hb) {
    const k = ((hb.x1 - hb.x0) + (hb.z1 - hb.z0)) / 2 / 0.42;
    hatRoot.scale.setScalar(k);
    hatRoot.position.set((hb.x0 + hb.x1) / 2, hb.y1 - 0.93 * k, (hb.z0 + hb.z1) / 2);
  } else {
    hatRoot.scale.setScalar(rig.head[0]);
    hatRoot.position.y = rig.head[1] - 0.72 * rig.head[0];
  }
  head.add(hatRoot);
  const box = (w, h, d, m, x, y, z, parent = hatRoot) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); parent.add(b); return b;
  };
  addFace(look, box, mat, visor);
  addHat(hatRoot, look, box, mat, visor);

  // Back socket (upper spine): back items are made for the blocky torso (top at 0.55, back at
  // z +0.18). Fit it to the model's chest. The measured part is the middle of the chest only
  // (shoulders follow other bones), so the scale is calibrated on the robot: 0.255 m -> 0.8.
  const back = new THREE.Group();
  const spine = body.socket('Spine2');
  const cb = body.measure('chest', ['Spine2', 'Spine1'], spine);
  if (cb) {
    const k = THREE.MathUtils.clamp((cb.x1 - cb.x0) / 0.32, 0.65, 0.9); // (built-in gear like a bedroll can make it look wider)
    back.scale.setScalar(k);
    back.position.set((cb.x0 + cb.x1) / 2, cb.y1 - 0.55 * k, cb.z1 - 0.18 * k);
  } else {
    back.scale.setScalar(rig.back[0]);
    back.position.set(0, rig.back[1], rig.back[2]);
  }
  spine.add(back);
  const bbox = (w, h, d, m, x, y, z) => box(w, h, d, m, x, y, z, back);
  addBack(look, bbox, mat, visor);

  if (teamColor) {
    const team = mat(teamColor);
    // Belt around the measured waist (bottom of the lower spine).
    const waist = body.socket('Spine');
    const wb = body.measure('waist', ['Spine'], waist);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(wb ? wb.x1 - wb.x0 + 0.04 : 0.36, 0.07, wb ? wb.z1 - wb.z0 + 0.04 : 0.24), team);
    if (wb) belt.position.set((wb.x0 + wb.x1) / 2, wb.y0 + 0.02, (wb.z0 + wb.z1) / 2);
    else belt.position.y = 0.06;
    waist.add(belt);
    for (const side of ['LeftArm', 'RightArm']) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.13), team);
      pad.position.y = 0.04; body.socket(side).add(pad);
    }
  }

  const gunHolder = new THREE.Group();
  gunHolder.position.set(0.25, 0.3, -0.45);
  g.add(gunHolder);

  let tagSprite = null;
  if (tag) { tagSprite = nameTag(look.name, teamColor || '#ffffff'); g.add(tagSprite); }
  return { group: g, gunHolder, tag: tagSprite, body };
}

function buildBlocky(look, { visor = '#33aaff', teamColor = null, tag = true } = {}) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const shirt = mat(look.shirt), pants = mat(look.pants), skin = mat(look.skin), dark = mat('#22232b');
  const glow = new THREE.MeshBasicMaterial({ color: visor });
  const box = (w, h, d, m, x, y, z, parent = g) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); parent.add(b); return b;
  };

  const legL = box(0.24, 0.8, 0.26, pants, -0.15, -0.5, 0);
  const legR = box(0.24, 0.8, 0.26, pants, 0.15, -0.5, 0);
  for (const leg of [legL, legR]) {
    leg.geometry.translate(0, -0.4, 0); leg.position.y += 0.4;
    box(0.26, 0.12, 0.3, dark, 0, -0.76, -0.02, leg); // shoe
  }
  box(0.62, 0.78, 0.36, shirt, 0, 0.16, 0);
  box(0.42, 0.42, 0.42, skin, 0, 0.72, 0);
  addFace(look, box, mat, visor);
  addBack(look, (w, h, d, m, x, y, z) => box(w, h, d, m, x, y, z), mat, visor);
  box(0.16, 0.16, 0.6, shirt, 0.3, 0.32, -0.25);
  box(0.16, 0.16, 0.45, shirt, -0.28, 0.32, -0.25);
  box(0.14, 0.14, 0.14, skin, 0.3, 0.32, -0.58);  // hands
  box(0.14, 0.14, 0.14, skin, -0.28, 0.32, -0.5);

  if (teamColor) {
    const team = mat(teamColor);
    box(0.64, 0.1, 0.38, team, 0, -0.18, 0);            // belt
    box(0.2, 0.12, 0.38, team, 0.33, 0.52, 0);          // shoulder pads
    box(0.2, 0.12, 0.38, team, -0.33, 0.52, 0);
  }

  addHat(g, look, box, mat, visor);

  const gunHolder = new THREE.Group();
  gunHolder.position.set(0.3, 0.38, -0.5);
  g.add(gunHolder);

  let tagSprite = null;
  if (tag) { tagSprite = nameTag(look.name, teamColor || '#ffffff'); g.add(tagSprite); }
  return { group: g, legL, legR, gunHolder, tag: tagSprite };
}

// Face items, in "blocky head" coordinates: head centre y 0.72, face at z -0.21.
function addFace(look, box, mat, visor) {
  const glow = new THREE.MeshBasicMaterial({ color: visor });
  const black = mat('#111116'), white = mat('#f2f0e6'), z = -0.225;
  const id = look.face || 'visor';
  // 3D models for these.
  const model = faceModel(id);
  if (model) { box(0.001, 0.001, 0.001, black, 0, 0.72, 0).parent.add(model); return; }
  const parent = box(0.001, 0.001, 0.001, black, 0, 0.72, 0).parent;
  const add = (geo, m, x, y, zz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, zz); parent.add(o); return o; };
  switch (id) {
    case 'visor': {
      // Curved glowing band across the eyes, with a dark frame and little side pods.
      const arc = (r, h) => new THREE.CylinderGeometry(r, r, h, 28, 1, true, Math.PI - 1.2, 2.4);
      const glass = new THREE.MeshBasicMaterial({ color: visor, map: visorTexture(), side: THREE.DoubleSide });
      const Y = 0.675;
      add(arc(0.235, 0.1), glass, 0, Y, 0);
      const frame = mat('#1a1c24');
      frame.side = THREE.DoubleSide;
      add(arc(0.243, 0.022), frame, 0, Y + 0.06, 0);
      add(arc(0.243, 0.022), frame, 0, Y - 0.06, 0);
      for (const sx of [-1, 1]) {
        add(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 12).rotateZ(Math.PI / 2), frame, sx * 0.225, Y, 0.03);
        add(new THREE.CylinderGeometry(0.022, 0.022, 0.055, 10).rotateZ(Math.PI / 2), glow, sx * 0.226, Y, 0.03);
      }
      break;
    }
    case 'shades':
      box(0.15, 0.08, 0.03, black, -0.09, 0.76, z); box(0.15, 0.08, 0.03, black, 0.09, 0.76, z);
      box(0.06, 0.02, 0.03, black, 0, 0.78, z); box(0.42, 0.02, 0.02, black, 0, 0.78, z + 0.01);
      break;
    case 'ninja': {
      // Rounded hood and face wrap with an eye slit, a red headband with a metal plate, and tails.
      const cloth = mat('#1b1d27'), band = mat('#c0303a'), metal = mat('#9aa3b0');
      const R = 0.228, slitLo = 0.635, slitHi = 0.705;                    // eye slit between these heights
      add(new THREE.CylinderGeometry(R, R * 0.86, 0.15, 20), cloth, 0, slitLo - 0.075, 0);            // face wrap
      const hood = add(new THREE.SphereGeometry(R + 0.006, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), cloth, 0, slitHi, 0.004);
      hood.scale.y = 0.95;
      add(new THREE.CylinderGeometry(R + 0.002, R + 0.002, slitHi - slitLo, 20, 1, true, Math.PI * 1.35, Math.PI * 1.3), cloth, 0, (slitLo + slitHi) / 2, 0.004); // sides and back of the slit
      add(new THREE.CylinderGeometry(R + 0.008, R + 0.008, 0.04, 20), band, 0, slitHi + 0.04, 0);   // headband
      box(0.12, 0.05, 0.02, metal, 0, slitHi + 0.04, -R - 0.006);                                     // forehead plate
      box(0.05, 0.012, 0.005, mat('#4a505c'), 0, slitHi + 0.04, -R - 0.018);
      for (const sx of [-1, 1]) {
        const t = box(0.045, 0.2, 0.012, band, sx * 0.04, slitHi - 0.06, R + 0.03);                  // knot tails
        t.rotation.z = sx * 0.35; t.rotation.x = 0.35;
      }
      box(0.07, 0.06, 0.05, band, 0, slitHi + 0.04, R + 0.01);                                         // knot
      break;
    }
    case 'gasmask': {
      const rubber = mat('#2c3328');
      box(0.32, 0.24, 0.06, rubber, 0, 0.68, z);
      box(0.12, 0.08, 0.03, glow, -0.08, 0.77, z - 0.03); box(0.12, 0.08, 0.03, glow, 0.08, 0.77, z - 0.03);
      for (const x of [-0.13, 0.13]) box(0.11, 0.11, 0.09, mat('#5a5f52'), x, 0.6, z - 0.06); // filters
      break;
    }
    case 'skull':
      box(0.4, 0.44, 0.04, white, 0, 0.71, z);                 // mask
      box(0.11, 0.1, 0.02, black, -0.09, 0.78, z - 0.02);      // eye sockets
      box(0.11, 0.1, 0.02, black, 0.09, 0.78, z - 0.02);
      box(0.05, 0.06, 0.02, black, 0, 0.69, z - 0.02);         // nose
      for (let i = -2; i <= 2; i++) box(0.035, 0.07, 0.02, i % 2 ? black : white, i * 0.045, 0.6, z - 0.02); // teeth
      break;
    case 'cyber': {
      // Curved dark faceplate with a glowing eye line and mouth grille.
      const plate = mat('#15161c'); plate.side = THREE.DoubleSide;
      const arc = (r, h, a) => new THREE.CylinderGeometry(r, r, h, 24, 1, true, Math.PI - a / 2, a);
      add(arc(0.235, 0.36, 2.2), plate, 0, 0.7, 0);
      const g2 = glow.clone(); g2.side = THREE.DoubleSide;
      add(arc(0.24, 0.035, 1.2), g2, 0, 0.73, 0);                        // eye line
      for (const y of [0.6, 0.575]) add(arc(0.24, 0.012, 0.5), g2, 0, y, 0); // grille
      break;
    }
  }
}

// Soft vertical shine for the visor (a bright line across the middle).
let _visorTex = null;
function visorTexture() {
  if (_visorTex) return _visorTex;
  const c = document.createElement('canvas'); c.width = 4; c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 32);
  grd.addColorStop(0, '#6a6a6a'); grd.addColorStop(0.35, '#ffffff'); grd.addColorStop(0.45, '#ffffff'); grd.addColorStop(1, '#5a5a5a');
  g.fillStyle = grd; g.fillRect(0, 0, 4, 32);
  _visorTex = new THREE.CanvasTexture(c);
  _visorTex.colorSpace = THREE.SRGBColorSpace;
  return _visorTex;
}

// Back items, in "blocky torso" coordinates: torso centre y 0.16, back at z +0.18.
function addBack(look, box, mat, visor) {
  // 3D models where we have them.
  const model = backModel(look.back || 'noback');
  if (model) { box(0.001, 0.001, 0.001, mat('#000000'), 0, 0.16, 0).parent.add(model); return; }
  const glow = new THREE.MeshBasicMaterial({ color: visor });
  switch (look.back || 'noback') {
    case 'backpack':
      box(0.42, 0.46, 0.18, mat('#6b5a3a'), 0, 0.18, 0.27);
      box(0.34, 0.16, 0.06, mat('#5a4a2e'), 0, 0.02, 0.38);
      box(0.06, 0.5, 0.04, mat('#3a3020'), -0.16, 0.2, 0.17); box(0.06, 0.5, 0.04, mat('#3a3020'), 0.16, 0.2, 0.17);
      break;
    case 'cape': {
      const c = box(0.6, 0.95, 0.03, mat(new THREE.Color(look.shirt).multiplyScalar(0.6)), 0, -0.05, 0.24);
      c.rotation.x = 0.12;
      box(0.62, 0.06, 0.06, mat('#d8b84a'), 0, 0.52, 0.2);
      break;
    }
    case 'jetpack':
      for (const x of [-0.13, 0.13]) {
        box(0.16, 0.48, 0.16, mat('#8a8f9c'), x, 0.18, 0.28);
        box(0.12, 0.08, 0.12, mat('#3a3d48'), x, -0.1, 0.28);
        box(0.08, 0.12, 0.08, glow, x, -0.2, 0.28);              // flame
      }
      break;
    case 'wings':
      for (const sx of [-1, 1]) {
        const w = box(0.7, 0.32, 0.03, mat('#f4f4ff'), sx * 0.42, 0.34, 0.26);
        w.rotation.z = sx * 0.45; w.rotation.y = sx * -0.35;
        const tip = box(0.4, 0.18, 0.03, glow, sx * 0.72, 0.6, 0.3);
        tip.rotation.z = sx * 0.6; tip.rotation.y = sx * -0.35;
      }
      break;
    case 'katana': {
      const blade = box(0.05, 1.05, 0.03, mat('#cfd6e0'), 0, 0.16, 0.24);
      blade.rotation.z = 0.7;
      const hilt = box(0.07, 0.26, 0.05, mat('#2a1a10'), 0.36, 0.56, 0.24);
      hilt.rotation.z = 0.7;
      break;
    }
  }
}

function addHat(g, look, box, mat, visor) {
  // 3D hat models where we have one; the rest are built from boxes.
  const model = hatModel(look.hat, look);
  if (model) { g.add(model); return; }
  const top = 0.93;
  switch (look.hat) {
    case 'cap': {
      const m = mat(new THREE.Color(look.shirt).multiplyScalar(0.7));
      box(0.46, 0.14, 0.46, m, 0, top + 0.05, 0);
      box(0.4, 0.04, 0.22, m, 0, top - 0.01, -0.3);
      break;
    }
    case 'beanie': {
      const m = mat(look.pants);
      box(0.46, 0.2, 0.46, m, 0, top + 0.06, 0);
      box(0.12, 0.1, 0.12, mat('#eeeeee'), 0, top + 0.21, 0);
      break;
    }
    case 'helmet': {
      const m = mat('#556b3a');
      box(0.5, 0.22, 0.5, m, 0, top + 0.04, 0);
      box(0.54, 0.06, 0.54, m, 0, top - 0.06, 0);
      break;
    }
    case 'headphones': {
      const d = mat('#1c1c22'), c = new THREE.MeshBasicMaterial({ color: visor });
      box(0.5, 0.06, 0.1, d, 0, top + 0.03, 0);
      box(0.06, 0.24, 0.2, d, 0.24, 0.72, 0); box(0.06, 0.24, 0.2, d, -0.24, 0.72, 0);
      box(0.02, 0.14, 0.12, c, 0.275, 0.72, 0); box(0.02, 0.14, 0.12, c, -0.275, 0.72, 0);
      break;
    }
    case 'tophat': {
      const m = mat('#16161c');
      box(0.6, 0.04, 0.6, m, 0, top + 0.0, 0);
      box(0.38, 0.4, 0.38, m, 0, top + 0.22, 0);
      box(0.39, 0.07, 0.39, new THREE.MeshBasicMaterial({ color: visor }), 0, top + 0.07, 0);
      break;
    }
    case 'horns': {
      const m = mat('#efe6d0');
      for (const s of [-1, 1]) {
        const h = box(0.08, 0.26, 0.08, m, s * 0.17, top + 0.1, 0.02);
        h.rotation.z = -s * 0.5;
        const t = box(0.06, 0.12, 0.06, m, s * 0.25, top + 0.24, 0.02);
        t.rotation.z = -s * 0.9;
      }
      break;
    }
    case 'crown': {
      const m = new THREE.MeshLambertMaterial({ color: '#ffcc33', emissive: '#553300' });
      box(0.44, 0.1, 0.44, m, 0, top + 0.03, 0);
      for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18], [0, -0.2], [0, 0.2], [-0.2, 0], [0.2, 0]]) {
        box(0.07, 0.12, 0.07, m, x, top + 0.13, z);
      }
      box(0.08, 0.08, 0.04, new THREE.MeshBasicMaterial({ color: '#ff3355' }), 0, top + 0.04, -0.225);
      break;
    }
  }
}
