import * as THREE from 'three';
import { AnimatedBody, hasCharacterModel } from './CharacterModel.js';

// Character customization: colours, hats and the blocky body model.
export const SHIRTS = ['#e8e8f0', '#2b2d3a', '#d84a4a', '#3a6fd8', '#3ab060', '#e0a030', '#9a5ad8', '#e070b0', '#30c0c0', '#7a5030'];
export const PANTS = ['#2a2a35', '#3b4a6a', '#5a4632', '#556b2f', '#7a7a85', '#1e3a5f'];
export const SKINS = ['#f6d7b8', '#f0c8a0', '#d6a27a', '#a8704a', '#6e4630', '#8fd06a'];

export const HATS = [
  { id: 'none',       name: 'None',       price: 0 },
  { id: 'cap',        name: 'Cap',        price: 0 },
  { id: 'beanie',     name: 'Beanie',     price: 0 },
  { id: 'helmet',     name: 'Helmet',     price: 80 },
  { id: 'headphones', name: 'Headphones', price: 150 },
  { id: 'tophat',     name: 'Top hat',    price: 250 },
  { id: 'horns',      name: 'Horns',      price: 300 },
  { id: 'crown',      name: 'Crown',      price: 500 },
];

// Character models (free, no price). 'robot' is the original Mixamo robot.
export const BODIES = [
  { id: 'swat',  name: 'SWAT',  icon: '🪖' },
  { id: 'punk',  name: 'Punk',  icon: '🧑‍🎤' },
  { id: 'robot', name: 'Robot', icon: '🤖' },
];
// Where hats/masks and back items sit on each model (head: scale, height above the head bone;
// back: scale, y, z from the upper spine).
const RIG = {
  robot: { head: [0.62, 0.12], back: [0.8, -0.26, -0.03] },
  swat:  { head: [0.74, 0.15], back: [0.85, -0.24, -0.06] },
  punk:  { head: [0.7, 0.14], back: [0.85, -0.24, -0.05] },
};

// Face accessories (on the head, in front of the face).
export const FACES = [
  { id: 'nofaceitem', name: 'None',       icon: '🙂', price: 0 },
  { id: 'visor',      name: 'Visor',      icon: '🥽', price: 0 },
  { id: 'shades',     name: 'Shades',     icon: '🕶️', price: 120 },
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

const pick = (a) => a[Math.floor(Math.random() * a.length)];
export function randomLook(name) {
  const model = pick(['swat', 'punk']);
  return { name, model, shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKINS.slice(0, 5)),
    hat: model === 'swat' ? pick(['none', 'none', 'none', 'headphones', 'horns']) : pick(['none', 'none', ...HATS.map(h => h.id)]),
    face: model === 'swat' ? 'nofaceitem' : pick(['nofaceitem', 'nofaceitem', 'shades', 'ninja', 'skull', 'gasmask']),
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
  const rig = RIG[body.modelId] || RIG.robot;

  // Head socket: reuse the blocky hat shapes, scaled to the model's head.
  const head = body.socket('Head');
  const hatRoot = new THREE.Group();
  hatRoot.scale.setScalar(rig.head[0]);
  hatRoot.position.y = rig.head[1] - 0.72 * rig.head[0];   // blocky head centre (0.72) -> above the head bone
  head.add(hatRoot);
  const box = (w, h, d, m, x, y, z, parent = hatRoot) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); parent.add(b); return b;
  };
  addFace(look, box, mat, visor);
  addHat(hatRoot, look, box, mat, visor);

  // Back socket (on the upper spine): same "blocky torso" coordinates, scaled to the robot.
  const back = new THREE.Group();
  back.scale.setScalar(rig.back[0]);
  back.position.set(0, rig.back[1], rig.back[2]);
  body.socket('Spine2').add(back);
  const bbox = (w, h, d, m, x, y, z) => box(w, h, d, m, x, y, z, back);
  addBack(look, bbox, mat, visor);

  if (teamColor) {
    const hips = body.socket('Hips');
    const team = mat(teamColor);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.24), team);
    belt.position.y = 0.06; hips.add(belt);
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
  switch (look.face || 'visor') {
    case 'visor': box(0.36, 0.1, 0.05, glow, 0, 0.76, -0.2); break;
    case 'shades':
      box(0.15, 0.08, 0.03, black, -0.09, 0.76, z); box(0.15, 0.08, 0.03, black, 0.09, 0.76, z);
      box(0.06, 0.02, 0.03, black, 0, 0.78, z); box(0.42, 0.02, 0.02, black, 0, 0.78, z + 0.01);
      break;
    case 'ninja': {
      const cloth = mat('#1d1f2a');
      box(0.44, 0.2, 0.44, cloth, 0, 0.62, 0);                 // lower face wrap
      box(0.44, 0.08, 0.44, cloth, 0, 0.88, 0);                // forehead band
      box(0.08, 0.06, 0.2, cloth, 0.1, 0.88, 0.28);            // knot tails
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
    case 'cyber':
      box(0.42, 0.42, 0.04, mat('#15161c'), 0, 0.72, z);
      box(0.3, 0.05, 0.02, glow, 0, 0.78, z - 0.025);          // eye line
      box(0.05, 0.05, 0.02, glow, -0.15, 0.6, z - 0.025); box(0.05, 0.05, 0.02, glow, 0.15, 0.6, z - 0.025);
      box(0.2, 0.02, 0.02, glow, 0, 0.6, z - 0.025);
      break;
  }
}

// Back items, in "blocky torso" coordinates: torso centre y 0.16, back at z +0.18.
function addBack(look, box, mat, visor) {
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
