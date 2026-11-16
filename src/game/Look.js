import * as THREE from 'three';

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

export const DEFAULT_LOOK = { name: 'Player', shirt: SHIRTS[3], pants: PANTS[0], skin: SKINS[1], hat: 'cap' };

const pick = (a) => a[Math.floor(Math.random() * a.length)];
export function randomLook(name) {
  return { name, shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKINS.slice(0, 5)), hat: pick(HATS).id };
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
export function buildCharacterMesh(look, { visor = '#33aaff', teamColor = null, tag = true } = {}) {
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
  box(0.36, 0.1, 0.05, glow, 0, 0.76, -0.22); // visor in portal colour
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
