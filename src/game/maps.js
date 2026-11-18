import COMPOUND_BOXES from './compound-boxes.json';
import COLOSSEUM_BOXES from './colosseum-boxes.json';
import WAREHOUSE_BOXES from './warehouse-boxes.json';
// Map layouts. Every map is built only from boxes: build(m) gets helpers
// m.box(min, max, color) and m.mirror(min, max, color) (adds the box and its mirror across X).
// Portal-friendly surfaces need to be at least 1.6 m wide and 2.6 m tall.
const V = (x, y, z) => ({ x, y, z });

export const MAPS = {
  arena: {
    name: 'Arena',
    hill: { x: 0, y: 0, z: 9.5, r: 4 },
    theme: { sky: '#8fb8e8', fog: [60, 160], hemi: 1.6, sun: 1.8 },
    view: { r: 30, h: 14 },
    spawns: {
      0: [V(-27, 0, -3), V(-27, 0, 3)],
      1: [V(27, 0, 3), V(27, 0, -3)],
      ffa: [V(-27, 0, -3), V(27, 0, 3), V(-20, 0, 20), V(20, 0, -20)],
    },
    build(m) {
      const W = 34, D = 24, H = 12;
      const floor = '#8a90a0', wall = '#b8bccb', cover = '#e0a060', dark = '#6a7088', blue = '#6fa0e0', red = '#e07070';
      m.box([-W, -1, -D], [W, 0, D], floor);
      m.box([-W - 1, 0, -D], [-W, H, D], wall);
      m.box([W, 0, -D], [W + 1, H, D], wall);
      m.box([-W - 1, 0, -D - 1], [W + 1, H, -D], wall);
      m.box([-W - 1, 0, D], [W + 1, H, D + 1], wall);
      m.box([-3, 0, -3], [3, 2, 3], dark);
      m.box([-0.5, 2, -2.5], [0.5, 5, 2.5], wall);
      for (let i = 0; i < 4; i++) {
        m.box([-3 - (4 - i) * 0.8, 0, -1.2], [-3 - (3 - i) * 0.8, 0.5 * (i + 1), 1.2], dark);
        m.box([3 + (3 - i) * 0.8, 0, -1.2], [3 + (4 - i) * 0.8, 0.5 * (i + 1), 1.2], dark);
      }
      for (const z of [-9, 9]) m.mirror([9, 0, z - 1], [11, 8, z + 1], wall);
      for (const z of [-16, 16]) m.box([-5, 0, z - 0.5], [5, 6, z + 0.5], wall);
      for (const z of [-5, 5]) m.mirror([16, 0, z - 2], [17, 1.4, z + 2], cover);
      m.mirror([20, 0, -0.6], [24, 1.4, 0.6], cover);
      m.mirror([13, 0, 14], [15, 2, 16], cover);
      m.mirror([13, 0, -16], [15, 2, -14], cover);
      for (const sx of [-1, 1]) for (const sz of [-1, 1])
        m.prop('container', [sx * 23, 0, sz * 11.25], 1.9, Math.PI / 2, { tint: sz * sx > 0 ? '#c0503c' : '#3a7cc0' });
      m.mirror([26, 0, 15], [33, 3, 23], dark);
      for (let i = 0; i < 6; i++) m.mirror([27, 0, 15 - (6 - i) * 0.7], [32, 0.5 * (i + 1), 15 - (5 - i) * 0.7], dark);
      m.mirror([26, 0, -23], [33, 3, -15], dark);
      for (let i = 0; i < 6; i++) m.mirror([27, 0, -15 + (5 - i) * 0.7], [32, 0.5 * (i + 1), -15 + (6 - i) * 0.7], dark);
      m.box([-30, 0, -6], [-29, 4, 6], blue);
      m.box([29, 0, -6], [30, 4, 6], red);
      for (const z of [-8, 8]) {                    // team flags behind the spawns
        m.prop('flag', [-31.5, 0, z], 2.2, 0, { tint: '#3a6fd8', solid: false });
        m.prop('flag', [31.5, 0, z], 2.2, Math.PI, { tint: '#d84a4a', solid: false });
      }
    },
  },

  islands: {
    name: 'Sky Islands',
    hill: { x: 0, y: 0, z: 0, r: 5 },
    theme: { sky: '#a8d4ff', fog: [70, 200], hemi: 1.35, sun: 1.6 },
    view: { r: 34, h: 16 },
    killY: -25,
    spawns: {
      0: [V(-26, 0, -3), V(-26, 0, 3)],
      1: [V(26, 0, 3), V(26, 0, -3)],
      ffa: [V(-26, 0, -3), V(26, 0, 3), V(-26, 0, 5), V(26, 0, -5)],
    },
    build(m) {
      const wall = '#cfc8b8', wood = '#b07a45';
      for (const sx of [-1, 1]) {
        // Team island with a portal wall at the back, rocks for cover and a couple of trees.
        m.prop('island_large', [sx * 24.5, 0, 0], 12, 0, { top: true });
        m.box(sx > 0 ? [30, 0, -7] : [-31, 0, -7], sx > 0 ? [31, 6, 7] : [-30, 6, 7], wall);
        m.prop('rock_large', [sx * 21.5, 0, -5.8], 3.6, 0);
        m.prop('rock_large', [sx * 21.5, 0, 5.8], 3.6, Math.PI);
        m.prop('rock_small', [sx * 19.5, 0, 0], 3, Math.PI / 2);
        m.prop('tree', [sx * 28.5, 0, -6.5], 9);
        m.prop('tree', [sx * 28.5, 0, 6.5], 8, Math.PI / 2);
        // Bridge to the middle (with little rails)
        m.box(sx > 0 ? [5.5, -0.6, -1.5] : [-18.5, -0.6, -1.5], sx > 0 ? [18.5, 0, 1.5] : [-5.5, 0, 1.5], wood);
        m.box(sx > 0 ? [10, 0, -1.6] : [-12, 0, -1.6], sx > 0 ? [12, 1.1, -1.5] : [-10, 1.1, -1.5], wood);
        m.box(sx > 0 ? [10, 0, 1.5] : [-12, 0, 1.5], sx > 0 ? [12, 1.1, 1.6] : [-10, 1.1, 1.6], wood);
        // Side islands with flags: reach them with portals or by hopping the grass platforms.
        for (const sz of [-1, 1]) {
          m.prop('island', [sx * 10, 1.5, sz * 16.5], 10, 0, { top: true });
          m.prop('flag', [sx * 10.5, 1.5, sz * 17.5], 2, sx > 0 ? 0 : Math.PI);
          m.box([sx * 10 - 1, 1.5, sz * 19.5 - 0.5], [sx * 10 + 1, 5, sz * 19.5 + 0.5], wall);   // portal wall
          m.prop('grass_platform', [sx * 10.5, 0.3, sz * 5.6], 5, 0, { top: true });
          m.prop('grass_platform', [sx * 10.5, 0.9, sz * 9.6], 5, Math.PI / 2, { top: true });
          // Floating panels to put portals on
          m.box([sx > 0 ? 14 : -17, 1, sz > 0 ? 6.5 : -7], [sx > 0 ? 17 : -14, 5, sz > 0 ? 7 : -6.5], wall);
        }
      }
      // Centre island with a tower
      m.prop('island_medium', [0, 0, 0], 10, 0, { top: true });
      m.box([-1.5, 0, -1.5], [1.5, 8, 1.5], wall);
      m.prop('rock_small', [-4, 0, 5], 2.6);
      m.prop('rock_small', [4, 0, -5], 2.6, Math.PI);
      m.prop('tree', [4.2, 0, 4.6], 7);
      m.prop('tree', [-4.2, 0, -4.6], 7, Math.PI / 2);
    },
  },

  // "Warehouse" by Lavender Harmony (scaled 0.4: about 24 x 41 m inside, 20 m to the roof), with
  // shipping containers (Clint Chilcott), crates and a raised walkway. Teams start at the ends.
  warehouse: {
    name: 'Warehouse',
    model: { file: 'maps/warehouse.glb', scale: 0.4, offset: [0, -0.79, -5.44] },
    hill: { x: 6.5, y: 0, z: -1.5, r: 4.5 },
    theme: { sky: '#9db4c8', fog: [50, 140], hemi: 1.5, sun: 1.6 },
    view: { r: 30, h: 16 },
    spawns: {
      0: [V(-4, 0, -18), V(4, 0, -18)],
      1: [V(8, 0, 18), V(-7, 0, 18.5)],
      ffa: [V(-8, 0, -18), V(8, 0, 18), V(-7, 0, 6), V(9, 0, -9)],
    },
    build(m) {
      const wood = '#a87a48', metal = '#7f8794';
      for (const b of WAREHOUSE_BOXES) m.box([b[0], b[1], b[2]], [b[3], b[4], b[5]], null);
      // Invisible walls around the building (one end is open above head height).
      m.box([-13.5, 0, -22], [-12.1, 30, 22], null);
      m.box([12.1, 0, -22], [13.5, 30, 22], null);
      m.box([-13.5, 0, -22], [13.5, 30, -20.5], null);
      m.box([-13.5, 0, 20.5], [13.5, 30, 22], null);
      // Shipping containers (6 m long, 2.5 m tall) in a few colours.
      const C = (x, y, z, rot, tint) => m.prop('container', [x, y, z], 1.9, rot, { tint });
      C(0, 0, 0, Math.PI / 2, '#3a7cc0');
      C(0, 2.43, 0, Math.PI / 2, '#d8603a');            // stacked on top
      C(-6.5, 0, -7, 0, '#4ea05a');
      C(6.5, 0, 7, 0, '#c0503c');
      C(-5.5, 0, 9.8, Math.PI / 2, '#d8a030');
      C(7, 0, -12.5, Math.PI / 2, '#3a7cc0');
      // Crates (steps up onto the stack, and cover near the spawns)
      m.box([3.3, 0, -0.9], [4.6, 1.2, 0.4], wood);
      m.box([-4.6, 0, -0.4], [-3.3, 1.2, 0.9], wood);
      m.box([-1.2, 0, -15.1], [1.2, 1.2, -13.9], wood);   // (the other end has the loading platform)
      for (const sx of [-1, 1]) m.box([sx * 9.5 - 0.7, 0, -0.7], [sx * 9.5 + 0.7, 1.4, 0.7], wood);
      // Raised walkway along the left wall with stairs at both ends.
      m.box([-12, 3.6, -9], [-9.2, 4, 9], metal);
      m.box([-9.2, 4, -9], [-9.05, 5, 9], metal);                    // railing
      for (let i = 0; i < 7; i++) {
        m.box([-12, 0, 9 + i * 0.7], [-9.2, 3.6 - i * 0.5, 9 + (i + 1) * 0.7], metal);
        m.box([-12, 0, -9 - (i + 1) * 0.7], [-9.2, 3.6 - i * 0.5, -9 - i * 0.7], metal);
      }
    },
  },

  village: {
    name: 'Village',
    hill: { x: 0, y: 0, z: 0, r: 5.5 },
    theme: { sky: '#f2c890', fog: [60, 170], hemi: 1.6, sun: 2.0 },
    view: { r: 30, h: 13 },
    spawns: {
      0: [V(-26, 0, -3), V(-26, 0, 3)],
      1: [V(26, 0, 3), V(26, 0, -3)],
      ffa: [V(-26, 0, -3), V(26, 0, 3), V(-3, 0, 17), V(3, 0, -17)],
    },
    build(m) {
      const ground = '#c8b088', wall = '#e8dcc4', roof = '#b85c48', stone = '#a8a8a0', wood = '#a07040', water = '#5aa0d0';
      const W = 30, D = 20, H = 8;
      m.box([-W, -1, -D], [W, 0, D], ground);
      m.box([-W - 1, 0, -D], [-W, H, D], stone);
      m.box([W, 0, -D], [W + 1, H, D], stone);
      m.box([-W - 1, 0, -D - 1], [W + 1, H, -D], stone);
      m.box([-W - 1, 0, D], [W + 1, H, D + 1], stone);
      // Houses with flat roofs you can climb to
      m.mirror([10, 0, -16], [18, 4.5, -9], wall);
      m.mirror([10, 4.5, -16.3], [18.3, 4.8, -9], roof);
      m.mirror([10, 0, 9], [18, 4.5, 16], wall);
      m.mirror([10, 4.5, 9], [18.3, 4.8, 16.3], roof);
      for (let i = 0; i < 9; i++) {
        m.mirror([10, 0, -9 + (8 - i) * 0.6], [11.5, 0.5 * (i + 1), -9 + (9 - i) * 0.6], wood);
        m.mirror([10, 0, 9 - (9 - i) * 0.6], [11.5, 0.5 * (i + 1), 9 - (8 - i) * 0.6], wood);
      }
      // Fountain and statue
      m.box([-3, 0, -3], [3, 0.8, 3], stone);
      m.box([-2.6, 0.8, -2.6], [2.6, 0.85, 2.6], water);
      m.box([-0.8, 0.8, -0.8], [0.8, 4.5, 0.8], stone);
      // Market stalls
      m.mirror([4, 0, -8], [6, 1.2, -6], wood);
      m.mirror([4, 0, 6], [6, 1.2, 8], wood);
      // Walls across the edges
      m.box([-4, 0, -14], [4, 5, -13], wall);
      m.box([-4, 0, 13], [4, 5, 14], wall);
      // Trees at the edges and team flags on the roofs
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        m.prop('tree', [sx * 27.5, 0, sz * 17.5], 9, sz > 0 ? 0 : Math.PI / 2);
        m.prop('tree', [sx * 7.5, 0, sz * 17.8], 7.5, Math.PI);
        m.prop('flag', [sx * 14, 4.8, sz * 12.5], 1.8, sx > 0 ? Math.PI : 0, { tint: sx > 0 ? '#d84a4a' : '#3a6fd8', solid: false });
      }
      m.prop('rock_small', [0, 0, 9], 2.2);
      m.prop('rock_small', [0, 0, -9], 2.2, Math.PI);
      // Spawn cover
      m.mirror([22, 0, -3], [23, 1.5, 3], wood);
      m.mirror([22, 0, -12], [24, 3, -10], wood);
      m.mirror([22, 0, 10], [24, 3, 12], wood);
    },
  },

  towers: {
    name: 'Sunset Spires',
    theme: { sky: '#ffb48a', fog: [70, 190], hemi: 1.6, sun: 1.9 },
    view: { r: 36, h: 20 },
    killY: -25,
    hill: { x: 0, y: 0, z: 6, r: 4 },
    spawns: {
      0: [V(-24, 0, 4), V(-22, 0, 0)],
      1: [V(24, 0, -4), V(22, 0, 0)],
      ffa: [V(-24, 0, 4), V(24, 0, -4), V(0, 0, 8), V(0, 4, -5)],
    },
    build(m) {
      const stone = '#c9b8a8', dark = '#7d6f66', wood = '#a8743c', glow = '#ffd27a', panel = '#e8dccc';
      // Tower bases (over the void)
      m.mirror([18, -3, -8], [30, 0, 8], stone);
      m.mirror([30, 0, -8.5], [31, 12, 8.5], dark);          // back wall
      m.mirror([18, 0, -8.5], [30, 12, -8], dark);           // side walls
      m.mirror([18, 0, 8], [30, 12, 8.5], dark);
      // Floor 1 (y 4) with a stair hole, floor 2 (y 8) with another
      m.mirror([20, 3.6, -8], [26.5, 4, 8], wood);
      m.mirror([26.5, 3.6, -2], [30, 4, 8], wood);
      for (let i = 0; i < 8; i++) m.mirror([27, 0, -8 + i * 0.7], [29.5, 0.5 * (i + 1), -8 + (i + 1) * 0.7], stone);
      m.mirror([20, 7.6, -8], [26.5, 8, 8], wood);
      m.mirror([26.5, 7.6, -8], [30, 8, 2], wood);
      for (let i = 0; i < 8; i++) m.mirror([27, 4, 8 - (i + 1) * 0.7], [29.5, 4 + 0.5 * (i + 1), 8 - i * 0.7], stone);
      m.mirror([20, 8, -8], [21, 9.2, 8], dark);             // perch railing
      // Low centre island + bridges
      m.box([-6, -3, 2], [6, 0, 10], stone);
      m.mirror([6, -0.5, 4], [18, 0, 6], wood);
      m.box([-1, 0, 5], [1, 6, 7], panel);                   // centre pillar (portal walls)
      m.box([-5, 0, 8.5], [-3, 1.3, 9.5], wood);
      m.box([3, 0, 2.5], [5, 1.3, 3.5], wood);
      // High centre platform + bridges from floor 1
      m.box([-4, 3.6, -7], [4, 4, -3], glow);
      m.mirror([4, 3.6, -6], [20, 4, -4], wood);
      m.box([-1, 4, -7], [1, 5.2, -6.6], dark);
      // Floating panels for portals
      m.box([-3, 2, -16.5], [3, 7, -16], panel);
      m.box([-3, 2, 16], [3, 7, 16.5], panel);
      m.mirror([10, 1, 12], [10.5, 6, 16], panel);
      // Floating islands drifting around (scenery, out of reach)
      for (const [x, y, z, sc, id] of [[-42, -6, 26, 14, 'island_large'], [44, -9, -24, 13, 'island_medium'], [0, -14, -34, 16, 'island_large'],
        [-36, 4, -30, 8, 'island'], [38, 6, 30, 9, 'island'], [6, -4, 36, 10, 'island_medium']]) m.prop(id, [x, y, z], sc, 0, { top: true, solid: false });
      m.prop('tree', [-4.6, 0, 4.2], 7);
    },
  },

  canyon: {
    name: 'Canyon',
    theme: { sky: '#f3c98f', fog: [60, 170], hemi: 1.7, sun: 2.1 },
    view: { r: 32, h: 16 },
    hill: { x: 0, y: 0, z: 0, r: 4.5 },
    spawns: {
      0: [V(-26, 5, -3), V(-26, 5, 3)],
      1: [V(26, 5, 3), V(26, 5, -3)],
      ffa: [V(-26, 5, -3), V(26, 5, 3), V(-10, 0, 12), V(10, 0, -12)],
    },
    build(m) {
      const sand = '#d9b07a', rock = '#b07a52', dark = '#8a5a3c', wood = '#9a6a3a', stone = '#c8b49a';
      const W = 33, D = 20;
      m.box([-W, -1, -D], [W, 0, D], sand);                  // valley floor
      m.box([-W - 1, 0, -D - 1], [W + 1, 12, -D], rock);     // outer walls
      m.box([-W - 1, 0, D], [W + 1, 12, D + 1], rock);
      m.box([-W - 1, 0, -D], [-W, 12, D], rock);
      m.box([W, 0, -D], [W + 1, 12, D], rock);
      // Cliffs (team sides) with stairs down
      m.mirror([18, 0, -D], [W, 5, D], rock);
      for (const z of [-14, 12]) for (let i = 0; i < 9; i++) m.mirror([18 - (i + 1) * 0.6, 0, z], [18 - i * 0.6, 5 - 0.5 * (i + 1), z + 2.5], dark);
      m.mirror([22, 5, -1], [23, 6.3, 1], wood);             // cliff-top cover
      m.mirror([26, 5, 9], [28, 7, 11], wood);
      m.mirror([26, 5, -11], [28, 7, -9], wood);
      // Valley: rock pillars, an arch, boulders
      for (const z of [-7, 7]) m.mirror([6, 0, z - 1], [8, 9, z + 1], stone);
      m.box([-1, 0, -4.5], [1, 6, -3], stone);
      m.box([-1, 0, 3], [1, 6, 4.5], stone);
      m.box([-1, 6, -4.5], [1, 7, 4.5], stone);              // arch top
      m.prop('rock_large', [12, 0, 0], 3.6, Math.PI / 2);
      m.prop('rock_large', [-12, 0, 0], 3.6, -Math.PI / 2);
      m.prop('rock_large', [-2.5, 0, 11], 3.8, 0);
      m.prop('rock_large', [2.5, 0, -11], 3.8, Math.PI);
      // Smaller rocks along the canyon walls and on the cliffs
      for (const sx of [-1, 1]) {
        m.prop('rock_small', [sx * 15.5, 0, 17.5], 3.2, 0);
        m.prop('rock_small', [sx * 15.5, 0, -17.5], 3, Math.PI);
        m.prop('rock_small', [sx * 4, 0, 18], 2.6, Math.PI / 2);
        m.prop('rock_large', [sx * 30.5, 5, 17], 3.4, 0);
        m.prop('rock_large', [sx * 30.5, 5, -17], 3.4, Math.PI);
      }
      // Long high bridge between the cliffs
      m.box([-18, 4.6, -18.5], [18, 5, -16.5], wood);
      m.box([-18, 5, -18.6], [18, 5.9, -18.5], wood);
    },
  },
};

// Desert compound: a real 3D model ("fps tps Map" by theking1322), shown as-is, with
// collision boxes generated from it (compound-boxes.json, 5 cm voxels, model scaled 2x).
MAPS.compound = {
  name: 'Desert Compound',
  model: { file: 'maps/compound.glb', scale: 2 },
  theme: { sky: '#f4d6a6', fog: [60, 160], hemi: 1.7, sun: 2.0 },
  view: { r: 30, h: 15 },
  hill: { x: 0, y: 0.08, z: 0, r: 4.5 },
  perches: [[-6.5, 5.8, 6.5], [6.6, 5.8, -6.6]],    // roofs bots climb up to (by the ladders)
  spawns: {
    0: [V(-22, 0.08, -3), V(-22, 0.08, 3)],
    1: [V(22, 0.08, 3), V(22, 0.08, -3)],
    ffa: [V(-22, 0.08, -3), V(22, 0.08, 3), V(0, 0.08, 13.5), V(0, 0.08, -13.5)],
  },
  build(m) {
    for (const b of COMPOUND_BOXES) m.box([b[0], b[1], b[2]], [b[3], b[4], b[5]], null);
    // The two ladders up to the flat roofs (climbable).
    m.ladder([-6.75, 0, 0.9], [-5.45, 6.3, 2.5], [0, 0, -1]);
    m.ladder([5.45, 0, -2.5], [6.75, 6.3, -0.9], [0, 0, 1]);
    // Invisible walls a little above the real ones, so nobody jumps out from the roofs.
    m.box([-26.5, 0, -18], [-25.1, 30, 18], null);
    m.box([25.1, 0, -18], [26.5, 30, 18], null);
    m.box([-26.5, 0, -18], [26.5, 30, -16.75], null);
    m.box([-26.5, 0, 16.66], [26.5, 30, 18], null);
  },
};

// Arches in the Colosseum's arena wall: [angle in degrees, distance from the centre] (measured).
const COLOSSEUM_ARCHES = [[6, 23.11], [17.35, 23.15], [28.65, 23.19], [39.95, 23.25], [51.25, 23.31], [62.55, 23.38], [73.8, 23.45], [85, 23.51], [96.2, 23.58], [107.35, 23.63], [118.5, 23.68], [129.65, 23.72], [140.8, 23.74], [151.9, 23.75], [163, 23.75], [174.15, 23.73], [185.3, 23.7], [196.45, 23.65], [207.6, 23.6], [218.75, 23.54], [230, 23.47], [241.2, 23.4], [252.5, 23.34], [263.75, 23.27], [275.05, 23.21], [286.4, 23.16], [297.75, 23.12], [309.1, 23.09], [320.45, 23.07], [331.85, 23.06], [343.2, 23.07], [354.6, 23.08]];

// Wooden gate with iron bands (drawn once, shared).
let _gate = null;
function gateTexture(THREE) {
  if (_gate) return _gate;
  const c = document.createElement('canvas'); c.width = 128; c.height = 192;
  const g = c.getContext('2d');
  for (let i = 0; i < 6; i++) {                      // planks
    g.fillStyle = ['#5a3d24', '#64432a', '#553a22'][i % 3];
    g.fillRect(i * 21.3, 0, 21.3, 192);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(i * 21.3, 0, 2, 192);
  }
  for (const y of [28, 96, 164]) {                   // iron bands and studs
    g.fillStyle = '#2c2f36'; g.fillRect(0, y - 6, 128, 12);
    g.fillStyle = '#6b7079'; for (let x = 8; x < 128; x += 20) g.fillRect(x, y - 2, 4, 4);
  }
  _gate = new THREE.CanvasTexture(c); _gate.colorSpace = THREE.SRGBColorSpace;
  return _gate;
}

// Colosseum: "Colosseum" by CreativeTrio, scaled 25x (floor 46 m across, 7 m arena wall).
// Collision is a height map of the model (colosseum-boxes.json). Stairs at both ends lead up
// over the arena wall into the stands; pillars, a low centre wall and rocks give cover.
MAPS.colosseum = {
  name: 'Colosseum',
  model: { file: 'maps/colosseum.glb', scale: 25, offset: [0, 7.47, 0] },
  theme: { sky: '#bcd8f0', fog: [80, 220], hemi: 1.6, sun: 2.1 },
  view: { r: 50, h: 26 },
  hill: { x: 0, y: 0, z: 0, r: 5 },
  spawns: {
    0: [V(-18, 0, -4), V(-18, 0, 4)],
    1: [V(18, 0, 4), V(18, 0, -4)],
    ffa: [V(-18, 0, -4), V(18, 0, 4), V(-4, 0, 18), V(4, 0, -18)],
  },
  build(m) {
    const stone = '#cdbb98', dark = '#a8956f';
    for (const b of COLOSSEUM_BOXES) m.box([b[0], b[1], b[2]], [b[3], b[4], b[5]], null);
    // Stairs up over the arena wall (north and south)
    for (const sz of [-1, 1]) {
      for (let i = 0; i < 14; i++) {
        const z0 = sz * (9 + i * 1.05), z1 = sz * (9 + (i + 1) * 1.05);
        m.box([-1.6, 0, Math.min(z0, z1)], [1.6, 0.53 * (i + 1), Math.max(z0, z1)], i % 2 ? stone : dark);
      }
      m.box([-1.6, 0, sz > 0 ? 23.7 : -25.3], [1.6, 7.42, sz > 0 ? 25.3 : -23.7], stone);   // landing on the wall
    }
    // Pillars (good portal walls) and a low centre wall
    for (const x of [-9, 9]) for (const z of [-7, 7]) m.box([x - 1, 0, z - 1], [x + 1, 5, z + 1], stone);
    m.box([-6, 0, -0.8], [-1.5, 1.4, 0.8], dark);
    m.box([1.5, 0, -0.8], [6, 1.4, 0.8], dark);
    // Rocks for cover near the team ends
    for (const sx of [-1, 1]) {
      m.prop('rock_large', [sx * 14, 0, -10], 4, 0);
      m.prop('rock_large', [sx * 14, 0, 10], 4, Math.PI);
      m.prop('rock_small', [sx * 12, 0, 0], 3, Math.PI / 2);
    }
    // The 32 arches in the arena wall are solid (they'd lead out of the arena): close them with
    // wooden gates so it's clear you can't go in there.
    m.decor((THREE, add) => {
      const mat = new THREE.MeshLambertMaterial({ map: gateTexture(THREE) });
      const geo = new THREE.PlaneGeometry(2.7, 3.9);
      for (const [deg, r] of COLOSSEUM_ARCHES) {
        const a = deg * Math.PI / 180;
        const g = new THREE.Mesh(geo, mat);
        g.position.set(Math.cos(a) * (r + 0.35), 1.95, Math.sin(a) * (r + 0.35));
        g.lookAt(0, 1.95, 0);
        add(g);
      }
    });
    // Invisible fence around the top of the outer wall, so nobody falls out.
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2, x = Math.cos(a) * 44.5, z = Math.sin(a) * 47.5;
      m.box([x - 1.6, 8, z - 1.6], [x + 1.6, 60, z + 1.6], null);
    }
  },
};

// 3D props maps can place with m.prop(id, [x, y, z], scale, rotation, { top }).
export const PROPS = {
  island_large: 'props/island_large.glb', island_medium: 'props/island_medium.glb', island: 'props/island.glb',
  grass_platform: 'props/grass_platform.glb', stone_platform: 'props/stone_platform.glb',
  tree: 'props/tree.glb', rock_large: 'props/rock_large.glb', rock_small: 'props/rock_small.glb',
  flag: 'props/flag.glb', container: 'props/container.glb',
};

export const MAP_IDS = Object.keys(MAPS);
