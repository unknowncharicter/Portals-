// Line icons (SVG) used instead of emojis. 24x24, drawn with the current text colour.
const P = {
  play: '<path d="M7 4l13 8-13 8z"/>',
  online: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
  character: '<circle cx="12" cy="7" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  gunsmith: '<path d="M14.5 4.5a4 4 0 0 0-5 5L3 16l2 2 2 2 6.5-6.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z"/>',
  shop: '<path d="M3 4h2l2.4 11h11L21 7H6.2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>',
  upgrades: '<path d="M6 13l6-6 6 6M6 19l6-6 6 6"/>',
  daily: '<rect x="3" y="8" width="18" height="13"/><path d="M3 12h18M12 8v13M12 8c-1.5-4-6-4-6-1.5S10 8 12 8zm0 0c1.5-4 6-4 6-1.5S14 8 12 8z"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  // Modes
  duel: '<path d="M4 4l9 9M4 4v4M4 4h4M20 4l-9 9M20 4v4M20 4h-4M7 17l-3 3M17 17l3 3M9 15l-2 2M15 15l2 2"/>',
  team: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20c0-3.5 2.7-6 6-6s6 2.5 6 6M10 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/>',
  ffa: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  koth: '<path d="M3 18h18M4 18L3 7l5 4 4-6 4 6 5-4-1 11"/>',
  ctf: '<path d="M5 21V3M5 4h13l-3 4 3 4H5"/>',
  gungame: '<path d="M3 9h14l2-2h2v5h-6l-1 2h-3l-1 3H6l1-3H3z"/>',
  portal: '<ellipse cx="12" cy="12" rx="6" ry="9"/><ellipse cx="12" cy="12" rx="2.5" ry="5"/>',
  random: '<rect x="4" y="4" width="16" height="16"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  gun: '<path d="M3 9h14l2-2h2v5h-6l-1 2h-3l-1 3H6l1-3H3z"/>',
  // Gunsmith
  optic: '<circle cx="12" cy="12" r="7"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>',
  muzzle: '<rect x="3" y="9" width="13" height="6"/><path d="M16 11h5M16 13h5"/>',
  under: '<path d="M3 7h18M9 7v4h4v10"/>',
  none: '<path d="M6 6l12 12M18 6L6 18"/>',
  frame: '<path d="M3 9h14l2-2h2v5h-6l-1 2h-3l-1 3H6l1-3H3z"/>',
  // Misc
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H3v2a4 4 0 0 0 4 4M17 6h4v2a4 4 0 0 1-4 4M12 14v4M8 21h8"/>',
  dance: '<circle cx="13" cy="4" r="2"/><path d="M13 7l-2 6 3 3v5M11 13l-4 2M13 8l4 3 3-2M9 21l2-5"/>',
  zoom: '<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6M10 7v6M7 10h6"/>',
  lock: '<rect x="5" y="11" width="14" height="10"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  copy: '<rect x="8" y="8" width="12" height="12"/><path d="M4 16V4h12"/>',
  grenade: '<circle cx="12" cy="14" r="6"/><path d="M10 8V5h4v3M14 5l4-2"/>',
  headshot: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  book: '<path d="M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z"/>',
};

// An icon as an HTML string. cls: extra class names.
export function ic(name, cls = '') {
  const p = P[name] || P.none;
  return `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${p}</svg>`;
}
// As an element.
export function icEl(name, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = ic(name, cls);
  return t.content.firstChild;
}
// Coins: icon + amount.
export const coin = (n) => `<span class="cn">${ic('coin')}${n}</span>`;
