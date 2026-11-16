// Keyboard + mouse state with pointer lock.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // keys pressed this frame
    this.mouseDown = false;
    this.mouseClicked = false;
    this.rightClicked = false;
    this.dx = 0; this.dy = 0;
    this.wheel = 0;
    this.sensitivity = 0.0022;
    this.enabled = false;

    addEventListener('keydown', e => {
      if (!this.enabled) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('mousedown', e => {
      if (!this.enabled || !this.locked) return;
      if (e.button === 0) { this.mouseDown = true; this.mouseClicked = true; }
      if (e.button === 2) this.rightClicked = true;
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.mouseDown = false; });
    // Browsers can send one huge fake movement right when the mouse gets locked.
    // Ignore movement briefly after locking, and drop single absurd jumps.
    this.ignoreUntil = 0;
    document.addEventListener('pointerlockchange', () => { this.ignoreUntil = performance.now() + 150; });
    addEventListener('mousemove', e => {
      if (!this.locked || performance.now() < this.ignoreUntil) return;
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.dx += e.movementX; this.dy += e.movementY;
    });
    addEventListener('wheel', e => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
  }

  get locked() { return document.pointerLockElement === this.canvas; }

  lock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => this.canvas.requestPointerLock());
    } catch (e) { this.canvas.requestPointerLock(); }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }

  endFrame() {
    this.pressed.clear();
    this.mouseClicked = false;
    this.rightClicked = false;
    this.dx = 0; this.dy = 0; this.wheel = 0;
  }

  reset() { this.keys.clear(); this.pressed.clear(); this.mouseDown = false; this.dx = this.dy = 0; }
}
