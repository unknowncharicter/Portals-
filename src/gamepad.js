// Xbox / PlayStation controllers (browser Gamepad API, "standard" button layout).
// Buttons press the same actions as the keyboard (by their default key), so the game needs no
// changes: sticks move and look, triggers aim and shoot.
//
//  Left stick   move            Right stick  look
//  RT / R2      shoot           LT / L2      aim
//  A / ✕        jump            B / ○        crouch / slide
//  X / □        reload          Y / △        swap gun
//  LB / L1      portal (twice)  RB / R1      grenade
//  L3           dash            R3           heal
//  D-pad up     heal            D-pad down   dance
//  D-pad left   cancel portal   D-pad right  sight zoom
//  Menu/Options pause

const BUTTON_KEYS = {
  0: 'Space', 1: 'KeyC', 2: 'KeyR', 3: 'WHEEL', 4: 'KeyE', 5: 'KeyG',
  10: 'ShiftLeft', 11: 'KeyF', 12: 'KeyF', 13: 'KeyB', 14: 'KeyQ', 15: 'KeyZ',
};
const DEAD = 0.16;

export class Gamepads {
  constructor(input) {
    this.input = input;
    this.prev = [];
    this.active = false;     // a controller was used recently
    this.lookSpeed = 1;      // Settings: controller look speed
    this.lastUse = 0;
    this.onPause = null; this.onConfirm = null; this.onUse = null;
    addEventListener('gamepadconnected', () => { this.connected = true; });
  }

  pad() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of list) if (p && p.connected && p.buttons.length >= 16) return p;
    return null;
  }

  // Call once per frame, before the game reads input. playing: in a match (not paused/menus).
  poll(dt, playing) {
    const p = this.pad();
    if (!p) { this.release(); return; }
    const inp = this.input;
    const down = p.buttons.map(b => b.pressed || b.value > 0.5);
    const was = this.prev;
    const hit = (i) => down[i] && !was[i];
    const axis = (i) => { const v = p.axes[i] || 0; return Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD); };
    const lx = axis(0), ly = axis(1), rx = axis(2), ry = axis(3);
    const used = down.some(Boolean) || lx || ly || rx || ry;
    if (used) { this.lastUse = performance.now(); if (!this.active) { this.active = true; this.onUse && this.onUse(); } }
    else if (this.active && performance.now() - this.lastUse > 60000) this.active = false;

    // Menus: Start pauses / resumes (and starts a match from the lobby); A confirms.
    if (hit(9)) this.onPause && this.onPause();
    if (!playing) {
      if (hit(0)) this.onConfirm && this.onConfirm();
      this.release(); this.prev = down; return;
    }

    // Movement: left stick (analog, like the touch joystick).
    inp.moveX = lx; inp.moveY = ly;
    // Looking: right stick, with a curve (fine aim near the centre, fast turns at the edge).
    const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.8);
    const speed = 1500 * this.lookSpeed * (inp.rightDown ? 0.55 : 1); // "mouse pixels" per second
    inp.dx += curve(rx) * speed * dt;
    inp.dy += curve(ry) * speed * 0.75 * dt;
    // Triggers.
    const rt = p.buttons[7].value > 0.4 || p.buttons[7].pressed, lt = p.buttons[6].value > 0.4 || p.buttons[6].pressed;
    if (rt && !this.rt) inp.mouseClicked = true;
    if (rt) { inp.mouseDown = true; this.holdFire = true; } else if (this.holdFire) { inp.mouseDown = false; this.holdFire = false; }
    if (lt) { inp.rightDown = true; this.holdAim = true; } else if (this.holdAim) { inp.rightDown = false; this.holdAim = false; }
    this.rt = rt;
    // Buttons -> keys.
    for (const [i, key] of Object.entries(BUTTON_KEYS)) {
      if (key === 'WHEEL') { if (hit(+i)) inp.wheel += 1; continue; }
      if (down[i] && !was[i]) inp.press(key);
      else if (!down[i] && was[i] && !this.otherHolds(key, i, down)) inp.release(key);
    }
    this.prev = down;
    this.padSticks = !!(lx || ly);
  }

  // Two buttons can share a key (R3 and D-pad up both heal): only release when neither is held.
  otherHolds(key, i, down) {
    for (const [j, k] of Object.entries(BUTTON_KEYS)) if (k === key && j !== i && down[j]) return true;
    return false;
  }

  release() {
    const inp = this.input;
    if (this.holdFire) { inp.mouseDown = false; this.holdFire = false; }
    if (this.holdAim) { inp.rightDown = false; this.holdAim = false; }
    if (this.padSticks) { inp.moveX = 0; inp.moveY = 0; this.padSticks = false; }
    for (const [i, key] of Object.entries(BUTTON_KEYS)) if (this.prev[i] && key !== 'WHEEL') inp.release(key);
    this.prev = [];
  }

  // A short buzz (hit taken, kill). Ignored on controllers/browsers without rumble.
  rumble(strong = 0.5, weak = 0.3, ms = 120) {
    const p = this.pad();
    if (!p || !this.active || !p.vibrationActuator) return;
    try { p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) { /* ignore */ }
  }
}
