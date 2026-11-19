// Gunsmith data: the gun frames (model variants) and attachments from the
// "Ultimate Gun Pack" by Quaternius (CC0). Frames only change the look; attachments
// also give a small bonus (scope, silencer, grip, bipod) or are just for style.

// hold: where the hand goes, as a share of the gun's length from the back.
export const GUN_FRAMES = {
  ar: { length: 0.85, frames: [
    { id: 'AssaultRifle2_1', name: 'Carbine', hold: 0.36 },
    { id: 'AssaultRifle2_2', name: 'Rifleman', hold: 0.36 },
    { id: 'AssaultRifle2_4', name: 'Tactical', hold: 0.35 },
    { id: 'AssaultRifle2_3', name: 'Shorty', hold: 0.17 },
    { id: 'AssaultRifle_2', name: 'Wooden AK', hold: 0.31 },
    { id: 'AssaultRifle_5', name: 'Black AK', hold: 0.31 },
    { id: 'AssaultRifle_4', name: 'Folding AK', hold: 0.32 },
    { id: 'AssaultRifle_3', name: 'Stubby AK', hold: 0.175 },
    { id: 'AssaultRifle_1', name: 'Krink', hold: 0.2 },
  ] },
  smg: { length: 0.6, frames: [
    { id: 'SubmachineGun_2', name: 'Folding SMG', hold: 0.45 },
    { id: 'SubmachineGun_5', name: 'Long SMG', hold: 0.37 },
    { id: 'SubmachineGun_3', name: 'Rail SMG', hold: 0.5, noUnder: true },
    { id: 'SubmachineGun_1', name: 'Machine Pistol', hold: 0.27 },
    { id: 'SubmachineGun_4', name: 'Stubby SMG', hold: 0.2 },
  ] },
  shotgun: { length: 0.95, frames: [
    { id: 'Shotgun_2', name: 'Pump', hold: 0.38 },
    { id: 'Shotgun_3', name: 'Classic', hold: 0.38 },
    { id: 'Shotgun_4', name: 'Hunter', hold: 0.38 },
    { id: 'Shotgun_1', name: 'Grey Pump', hold: 0.35 },
    { id: 'Shotgun_ShortStock', name: 'Short Stock', hold: 0.3 },
    { id: 'Shotgun_SawedOff', name: 'Sawed-off', hold: 0.31 },
  ] },
  sniper: { length: 1.15, frames: [
    { id: 'SniperRifle_4', name: 'Black Sniper', hold: 0.33 },
    { id: 'SniperRifle_2', name: 'Marksman', hold: 0.31 },
    { id: 'SniperRifle_3', name: 'Thumbhole', hold: 0.365 },
    { id: 'SniperRifle_1', name: 'Olive', hold: 0.335 },
    { id: 'SniperRifle_6', name: 'Wooden', hold: 0.365 },
    { id: 'SniperRifle_5', name: 'Bipod Sniper', hold: 0.32, noUnder: true },
  ] },
  burst: { length: 0.8, frames: [
    { id: 'Bullpup_1', name: 'Bullpup', hold: 0.55, noUnder: true },
    { id: 'Bullpup_3', name: 'Bullpup Mk2', hold: 0.4 },
    { id: 'Bullpup_2', name: 'Compact', hold: 0.31, noUnder: true },
  ] },
  pistol: { length: 0.24, frames: [
    { id: 'Pistol_1', name: 'Classic', hold: 0.62 },
    { id: 'Pistol_2', name: 'Black', hold: 0.62 },
    { id: 'Pistol_3', name: 'Railed', hold: 0.62 },
    { id: 'Pistol_5', name: 'Grip Tape', hold: 0.62 },
    { id: 'Pistol_4', name: 'Long Mag', hold: 0.61 },
    { id: 'Pistol_6', name: 'Long Slide', hold: 0.47 },
  ] },
  revolver: { length: 0.3, frames: [
    { id: 'Revolver_1', name: 'Classic', hold: 0.62 },
    { id: 'Revolver_2', name: 'Black', hold: 0.62 },
    { id: 'Revolver_3', name: 'Railed', hold: 0.62 },
    { id: 'Revolver_5', name: 'Long Barrel', hold: 0.64 },
    { id: 'Revolver_4', name: 'Snub', hold: 0.65 },
  ] },
};

export const SLOTS = {
  optic:  { name: 'Optic',       icon: 'optic' },
  muzzle: { name: 'Muzzle',      icon: 'muzzle' },
  under:  { name: 'Underbarrel', icon: 'under' },
};
// Which slots each gun has (the sniper already has a scope; small guns take small things).
export const SLOTS_FOR = {
  ar: ['optic', 'muzzle', 'under'], smg: ['optic', 'muzzle', 'under'], burst: ['optic', 'muzzle', 'under'],
  shotgun: ['optic', 'muzzle', 'under'], sniper: ['muzzle', 'under'], pistol: ['muzzle', 'under'], revolver: ['under'],
};
const SMALL_GUNS = ['pistol', 'revolver'];

// Attachments. effect: what it does in a match (shown in the Gunsmith).
export const PARTS = {
  // zooms: magnification steps (scroll while aiming to change). eye: how far the sight sits from your eye when aiming.
  reddot:    { build: 'reddot',        slot: 'optic',  name: 'Red Dot',        price: 200, effect: 'scope', zooms: [1, 1.25], eye: 0.15 },
  scope1:    { file: 'Scope_1',        slot: 'optic',  name: 'Hunter Scope',   price: 250, effect: 'scope', zooms: [1.5, 2, 3], eye: 0.12 },
  scope2:    { file: 'Scope_2',        slot: 'optic',  name: 'Long Scope',     price: 300, effect: 'scope', zooms: [2, 4, 6], eye: 0.12 },
  scope3:    { file: 'Scope_3',        slot: 'optic',  name: 'Wide Scope',     price: 350, effect: 'scope', zooms: [1.5, 3, 4], eye: 0.12 },
  sil_short: { file: 'Silencer_Short', slot: 'muzzle', name: 'Short Silencer', price: 150, effect: 'quiet', small: true },
  sil1:      { file: 'Silencer_1',     slot: 'muzzle', name: 'Silencer',       price: 200, effect: 'quiet', small: true },
  sil2:      { file: 'Silencer_2',     slot: 'muzzle', name: 'Ribbed Silencer', price: 250, effect: 'quiet' },
  sil3:      { file: 'Silencer_3',     slot: 'muzzle', name: 'Heavy Silencer', price: 300, effect: 'quiet' },
  sil_long:  { file: 'Silencer_long',  slot: 'muzzle', name: 'Long Silencer',  price: 350, effect: 'quiet' },
  grip:      { file: 'Grip',           slot: 'under',  name: 'Foregrip',       price: 300, effect: 'grip' },
  bipod:     { file: 'Bipod',          slot: 'under',  name: 'Bipod',          price: 250, effect: 'bipod' },
  flashlight:{ file: 'Flashlight',     slot: 'under',  name: 'Flashlight',     price: 100, effect: 'style', small: true },
  bayonet:   { file: 'Bayonet',        slot: 'under',  name: 'Bayonet',        price: 150, effect: 'style' },
  bayonet2:  { file: 'Bayonet_2',      slot: 'under',  name: 'Combat Knife',   price: 200, effect: 'style' },
};
export const EFFECT_TEXT = {
  scope: 'Look through it when aiming: steadier aim, scroll to change the zoom',
  quiet: 'Quiet: no muzzle flash, bots only hear you up close',
  grip:  'Less kick when shooting',
  bipod: 'Much less kick while crouching',
  style: 'Looks only',
};

// Can this part go on this gun?
export function partFits(gun, partId) {
  const p = PARTS[partId];
  if (!p || !(SLOTS_FOR[gun] || []).includes(p.slot)) return false;
  if (SMALL_GUNS.includes(gun) && !p.small) return false;
  return true;
}

export function frameOf(gun, mods) {
  const fam = GUN_FRAMES[gun];
  if (!fam) return null;
  return fam.frames.find(f => mods && f.id === mods.frame) || fam.frames[0];
}

// Clean up a gun's mods (unknown frame/parts, parts that don't fit that frame).
export function cleanMods(gun, mods) {
  if (!mods || !GUN_FRAMES[gun]) return null;
  const frame = frameOf(gun, mods);
  const out = { frame: frame.id };
  for (const slot of SLOTS_FOR[gun] || []) {
    const id = mods[slot];
    if (!id || !partFits(gun, id) || PARTS[id].slot !== slot) continue;
    if (slot === 'under' && frame.noUnder) continue;
    out[slot] = id;
  }
  // Starting zoom for the optic.
  const optic = PARTS[out.optic];
  if (optic && optic.zooms) out.zoom = optic.zooms.includes(mods.zoom) ? mods.zoom : optic.zooms[0];
  return out;
}

// What a gun's attachments do (for Match).
export function modEffects(mods) {
  const e = { scope: false, quiet: false, grip: false, bipod: false };
  if (!mods) return e;
  for (const slot of Object.keys(SLOTS)) {
    const p = PARTS[mods[slot]];
    if (p && p.effect in e) e[p.effect] = true;
  }
  return e;
}

// A random setup for a bot (some bots get attachments).
export function randomMods(gun) {
  const fam = GUN_FRAMES[gun];
  if (!fam) return null;
  const mods = { frame: fam.frames[Math.floor(Math.random() * fam.frames.length)].id };
  for (const slot of SLOTS_FOR[gun]) {
    if (Math.random() > 0.35) continue;
    const ids = Object.keys(PARTS).filter(id => PARTS[id].slot === slot && partFits(gun, id));
    if (ids.length) mods[slot] = ids[Math.floor(Math.random() * ids.length)];
  }
  return cleanMods(gun, mods);
}

// The zoom steps of a gun's optic (null without one).
export function opticZooms(mods) {
  const p = mods && PARTS[mods.optic];
  return p && p.zooms ? p.zooms : null;
}
