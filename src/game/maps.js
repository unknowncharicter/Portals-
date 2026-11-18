import COMPOUND_BOXES from './compound-boxes.json';
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
      m.mirror([22, 0, 10], [24, 2.5, 12.5], cover);
      m.mirror([22, 0, -12.5], [24, 2.5, -10], cover);
      m.mirror([26, 0, 15], [33, 3, 23], dark);
      for (let i = 0; i < 6; i++) m.mirror([27, 0, 15 - (6 - i) * 0.7], [32, 0.5 * (i + 1), 15 - (5 - i) * 0.7], dark);
      m.mirror([26, 0, -23], [33, 3, -15], dark);
      for (let i = 0; i < 6; i++) m.mirror([27, 0, -15 + (5 - i) * 0.7], [32, 0.5 * (i + 1), -15 + (6 - i) * 0.7], dark);
      m.box([-30, 0, -6], [-29, 4, 6], blue);
      m.box([29, 0, -6], [30, 4, 6], red);
    },
  },

  islands: {
    name: 'Sky Islands',
    hill: { x: 0, y: 0, z: 0, r: 5 },
    theme: { sky: '#a8d4ff', fog: [70, 200], hemi: 1.8, sun: 2.0 },
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
        m.prop('rock_large', [sx * 23.5, 0, -5], 4, 0);
        m.prop('rock_large', [sx * 23.5, 0, 5], 4, Math.PI);
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

  warehouse: {
    name: 'Warehouse',
    hill: { x: 0, y: 0, z: 6, r: 4 },
    theme: { sky: '#1c1f28', fog: [30, 90], hemi: 1.3, sun: 1.0 },
    view: { r: 18, h: 6 },
    spawns: {
      0: [V(-22, 0, -3), V(-22, 0, 3)],
      1: [V(22, 0, 3), V(22, 0, -3)],
      ffa: [V(-22, 0, -3), V(22, 0, 3), V(-6, 0, 16), V(6, 0, -16)],
    },
    build(m) {
      const floor = '#6e7380', wall = '#8a8f9c', roof = '#5a5e6a', cont1 = '#c0503c', cont2 = '#3c7cc0', cont3 = '#4ea05a', shelf = '#b08850', metal = '#9aa0ac';
      const W = 25, D = 19, H = 8;
      m.box([-W, -1, -D], [W, 0, D], floor);
      m.box([-W - 1, H, -D - 1], [W + 1, H + 1, D + 1], roof); // ceiling: portals work up here too
      m.box([-W - 1, 0, -D], [-W, H, D], wall);
      m.box([W, 0, -D], [W + 1, H, D], wall);
      m.box([-W - 1, 0, -D - 1], [W + 1, H, -D], wall);
      m.box([-W - 1, 0, D], [W + 1, H, D + 1], wall);
      // Containers (2.8 m tall so their sides take portals)
      m.box([-3, 0, -1.5], [3, 2.8, 1.5], cont1);
      m.mirror([8, 0, -12], [14, 2.8, -9.5], cont2);
      m.mirror([8, 0, 9.5], [14, 2.8, 12], cont3);
      m.mirror([4, 0, 4], [6.5, 2.8, 10], cont1);
      m.mirror([4, 0, -10], [6.5, 2.8, -4], cont3);
      // Shelves near the spawns
      m.mirror([16, 0, -11], [17.2, 4, -4], shelf);
      m.mirror([16, 0, 4], [17.2, 4, 11], shelf);
      m.mirror([19, 0, -0.8], [21, 1.3, 0.8], shelf);
      // Support pillars (floor to ceiling)
      for (const x of [-10, 10]) for (const z of [-6, 6]) m.box([x - 0.8, 0, z - 0.8], [x + 0.8, H, z + 0.8], metal);
      // Mezzanine walkways with stairs
      for (const s of [-1, 1]) {
        const z0 = s > 0 ? 14 : -18, z1 = s > 0 ? 18 : -14;
        m.box([-12, 3, z0], [12, 3.5, z1], metal);
        const rz = s > 0 ? [14, 14.2] : [-14.2, -14];
        m.box([-12, 3.5, rz[0]], [12, 4.5, rz[1]], metal);
        for (let i = 0; i < 7; i++) m.mirror([12 + i * 0.6, 0, z0], [12 + (i + 1) * 0.6, 3.5 - i * 0.5, z1], metal);
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
      m.mirror([11, 0, -2], [13, 1.4, 2], rock);
      m.box([-4, 0, 10], [-1, 1.4, 12], rock);
      m.box([1, 0, -12], [4, 1.4, -10], rock);
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
  spawns: {
    0: [V(-22, 0.08, -3), V(-22, 0.08, 3)],
    1: [V(22, 0.08, 3), V(22, 0.08, -3)],
    ffa: [V(-22, 0.08, -3), V(22, 0.08, 3), V(0, 0.08, 13.5), V(0, 0.08, -13.5)],
  },
  build(m) {
    for (const b of COMPOUND_BOXES) m.box([b[0], b[1], b[2]], [b[3], b[4], b[5]], null);
    // Invisible walls a little above the real ones, so nobody jumps out from the roofs.
    m.box([-26.5, 0, -18], [-25.1, 30, 18], null);
    m.box([25.1, 0, -18], [26.5, 30, 18], null);
    m.box([-26.5, 0, -18], [26.5, 30, -16.75], null);
    m.box([-26.5, 0, 16.66], [26.5, 30, 18], null);
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
