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
      const grass = '#7fbf6a', rock = '#9a8f80', wall = '#d8d2c4', wood = '#c08a50', gold = '#e8c050';
      // Team islands
      m.mirror([18, -3, -9], [31, 0, 9], grass);
      m.mirror([30, 0, -9], [31, 6, 9], wall);              // back wall (portal wall)
      m.mirror([23, 0, -6], [25, 5, -4], rock);              // pillars
      m.mirror([23, 0, 4], [25, 5, 6], rock);
      m.mirror([19, 0, -1.5], [20, 1.3, 1.5], wood);         // low cover
      // Bridges to the middle
      m.mirror([6, -0.6, -1.5], [18, 0, 1.5], wood);
      m.mirror([10, 0, -1.6], [12, 1.1, -1.5], wood);        // little rails
      m.mirror([10, 0, 1.5], [12, 1.1, 1.6], wood);
      // Centre island with a tower
      m.box([-6, -4, -7], [6, 0, 7], grass);
      m.box([-1.5, 0, -1.5], [1.5, 8, 1.5], wall);
      m.box([-5, 0, 4.5], [-3, 1.4, 6], wood);
      m.box([3, 0, -6], [5, 1.4, -4.5], wood);
      // Side islands: only reachable with portals (or a brave jump)
      m.mirror([6, -2, 12], [14, 1.5, 20], grass);
      m.mirror([6, -2, -20], [14, 1.5, -12], grass);
      m.mirror([9, 1.5, 17], [11, 5, 19], gold);
      m.mirror([9, 1.5, -19], [11, 5, -17], gold);
      // Floating panels to put portals on
      m.mirror([12, 1, 6], [15, 5, 6.5], wall);
      m.mirror([12, 1, -6.5], [15, 5, -6], wall);
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
    hill: { x: 0, y: 0.8, z: 0, r: 4 },
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
};

export const MAP_IDS = Object.keys(MAPS);
