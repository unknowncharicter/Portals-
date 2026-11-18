import { EMOTES } from './Look.js';

// Hold B (or tap 💃 on a phone) to pick any dance from a ring.
// Mouse / finger direction picks one; let go of B to dance.
const R = 150;           // ring radius (px)
const STEP = (Math.PI * 2) / EMOTES.length;

export class EmoteWheel {
  constructor() {
    const el = this.el = document.createElement('div');
    el.id = 'emote-wheel';
    el.className = 'hidden';
    el.innerHTML = '<div class="ew-mid"><b>DANCE</b><small></small></div>';
    this.items = EMOTES.map((e, i) => {
      const d = document.createElement('div');
      d.className = 'ew-item';
      const a = i * STEP;
      d.style.left = `calc(50% + ${Math.sin(a) * R}px)`;
      d.style.top = `calc(50% - ${Math.cos(a) * R}px)`;
      d.innerHTML = `<span>${e.icon}</span><small>${e.name}</small>`;
      el.appendChild(d);
      return d;
    });
    this.hint = el.querySelector('.ew-mid small');
    (document.getElementById('hud') || document.body).appendChild(el);
    this.open = false;
  }

  // held: opened by holding B (else a touch tap: it stays open until you tap a dance).
  show(held, current) {
    this.open = true; this.held = held;
    this.x = 0; this.y = 0;
    this.current = current;
    this.select(-1);
    this.hint.textContent = held ? 'move mouse, let go of B' : 'tap a dance';
    this.el.classList.remove('hidden');
    document.getElementById('hud')?.classList.add('wheel');
  }
  hide() { this.open = false; this.el.classList.add('hidden'); document.getElementById('hud')?.classList.remove('wheel'); }

  // Direction (screen pixels, y down) -> dance index, or -1 near the middle.
  pickAt(x, y, dead = 40) {
    if (Math.hypot(x, y) < dead) return -1;
    let a = Math.atan2(x, -y);
    if (a < 0) a += Math.PI * 2;
    return Math.round(a / STEP) % EMOTES.length;
  }

  // Mouse movement (relative).
  aim(dx, dy) {
    this.x += dx; this.y += dy;
    const len = Math.hypot(this.x, this.y);
    if (len > 120) { this.x *= 120 / len; this.y *= 120 / len; } // easy to swing to another one
    this.select(this.pickAt(this.x, this.y));
  }

  select(i) {
    this.sel = i;
    this.items.forEach((d, k) => d.classList.toggle('sel', k === i));
    this.items.forEach((d, k) => d.classList.toggle('cur', EMOTES[k].id === this.current));
  }

  // The chosen dance id (or the equipped one when nothing is picked).
  chosen() { return this.sel >= 0 ? EMOTES[this.sel].id : this.current; }

  dispose() { this.hide(); this.el.remove(); }
}
