// On-screen controls for phones and tablets.
// Left side: a joystick appears wherever you put your thumb. Right side: drag to look.
// The FIRE button can also be dragged to aim while shooting.
export function isTouchDevice() {
  if (new URLSearchParams(location.search).has('touch')) return true;
  // Only phones/tablets: a touchscreen laptop still has a mouse, so it starts in mouse mode.
  // (The game also switches automatically when it sees a real touch or a real mouse.)
  const mm = (q) => window.matchMedia && matchMedia(q).matches;
  return mm('(pointer: coarse)') && !mm('(any-pointer: fine)');
}

const BUTTONS = [
  { id: 'fire',   label: 'FIRE',   cls: 'big' },
  { id: 'jump',   label: 'JUMP' },
  { id: 'dash',   label: 'DASH',   cls: 'mid' },
  { id: 'slide',  label: 'SLIDE',  cls: 'mid' },
  { id: 'portal', label: 'PORTAL', cls: 'portal' },
  { id: 'cancel', label: '✕',      cls: 'small' },
  { id: 'reload', label: 'R',      cls: 'small' },
  { id: 'nade',   label: '💣',     cls: 'small' },
  { id: 'swap',   label: '⇄',      cls: 'small' },
  { id: 'heal',   label: '+',      cls: 'small heal' },
  { id: 'scope',  label: '◎',      cls: 'small' },
  { id: 'pause',  label: 'II',     cls: 'small pause' },
];

export class TouchControls {
  constructor(input, { onPause }) {
    this.input = input;
    this.onPause = onPause;
    this.el = document.getElementById('touch');
    this.ptrs = new Map();
    this.lookScale = 2.2;

    this.joyBase = document.createElement('div'); this.joyBase.className = 'joy-base';
    this.joyKnob = document.createElement('div'); this.joyKnob.className = 'joy-knob';
    this.joyBase.appendChild(this.joyKnob);
    this.el.appendChild(this.joyBase);

    this.btn = {};
    for (const b of BUTTONS) {
      const d = document.createElement('div');
      d.className = 'tbtn ' + (b.cls || '');
      d.id = 't-' + b.id;
      d.textContent = b.label;
      d.dataset.act = b.id;
      this.el.appendChild(d);
      this.btn[b.id] = d;
    }

    const opts = { passive: false };
    this.el.addEventListener('pointerdown', e => this.down(e), opts);
    this.el.addEventListener('pointermove', e => this.move(e), opts);
    this.el.addEventListener('pointerup', e => this.up(e), opts);
    this.el.addEventListener('pointercancel', e => this.up(e), opts);
    this.el.addEventListener('contextmenu', e => e.preventDefault());
  }

  show(on) {
    this.el.classList.toggle('hidden', !on);
    if (!on) this.releaseAll();
  }

  down(e) {
    e.preventDefault();
    if (!this.input.enabled) return;
    try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    const act = e.target.dataset && e.target.dataset.act;
    const p = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, act };
    this.ptrs.set(e.pointerId, p);
    const inp = this.input;
    if (act) {
      e.target.classList.add('on');
      switch (act) {
        case 'fire': inp.mouseDown = true; inp.mouseClicked = true; break;
        case 'jump': inp.press('Space'); break;
        case 'dash': inp.tap('ShiftLeft'); break;
        case 'slide': inp.press('KeyC'); break;
        case 'portal': inp.tap('KeyE'); break;
        case 'cancel': inp.tap('KeyQ'); break;
        case 'reload': inp.tap('KeyR'); break;
        case 'nade': inp.tap('KeyG'); break;
        case 'heal': inp.tap('KeyF'); break;
        case 'swap': inp.wheel += 1; break;
        case 'scope': inp.touchAim = !inp.touchAim; e.target.classList.toggle('lit', inp.touchAim); break;
        case 'pause': this.onPause(); break;
      }
      return;
    }
    if (e.clientX < window.innerWidth * 0.42) {
      p.act = 'joy';
      this.joyBase.style.left = e.clientX + 'px';
      this.joyBase.style.top = e.clientY + 'px';
      this.joyBase.classList.add('on');
      this.joyKnob.style.transform = 'translate(-50%, -50%)';
    } else {
      p.act = 'look';
    }
  }

  move(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const inp = this.input;
    if (p.act === 'joy') {
      const R = 60;
      let dx = e.clientX - p.sx, dy = e.clientY - p.sy;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx *= R / len; dy *= R / len; }
      inp.moveX = dx / R;
      inp.moveY = dy / R;
      this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (p.act === 'look' || p.act === 'fire') {
      inp.dx += (e.clientX - p.x) * this.lookScale;
      inp.dy += (e.clientY - p.y) * this.lookScale;
    }
    p.x = e.clientX; p.y = e.clientY;
  }

  up(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    const inp = this.input;
    if (p.act && this.btn[p.act]) this.btn[p.act].classList.remove('on');
    if (p.act === 'joy') {
      inp.moveX = 0; inp.moveY = 0; inp.touchSprint = false;
      this.joyBase.classList.remove('on');
    } else if (p.act === 'fire') inp.mouseDown = false;
    else if (p.act === 'jump') inp.release('Space');
    else if (p.act === 'slide') inp.release('KeyC');
  }

  releaseAll() {
    for (const id of [...this.ptrs.keys()]) this.up({ pointerId: id });
  }

  // Show only the buttons that make sense right now.
  update(match) {
    if (!match) return;
    const p = match.player;
    this.btn.scope.style.display = '';
    this.btn.cancel.style.display = match.ghostMode ? '' : 'none';
    this.btn.portal.textContent = match.ghostMode ? 'PLACE' : 'PORTAL';
    this.btn.portal.classList.toggle('cool', p.portalCd > 0);
    this.btn.portal.style.borderColor = p.portalColor;
    this.btn.heal.classList.toggle('cool', p.healCd > 0);
    this.btn.dash.classList.toggle('cool', p.dashCd > 0);
    this.btn.nade.classList.toggle('cool', p.grenades <= 0);
  }
}
