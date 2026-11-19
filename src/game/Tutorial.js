import * as THREE from 'three';
import { Sfx } from '../audio.js';

// Step-by-step tutorial on the Arena map with a target dummy.
// Each step: text (desktop / touch) and a check that passes when the player has done it.
export class Tutorial {
  constructor(match) {
    this.m = match;
    this.flags = { teleported: false, grenade: false, portalHit: false, hits: 0 };
    this.stepIndex = 0;
    this.stepT = 0;
    this.start = null;
    this.el = document.getElementById('tutorial');
    this.el.classList.remove('hidden');
    this.touch = document.body.classList.contains('touch');
    const t = (desk, touch) => (this.touch ? touch : desk);

    this.steps = [
      { text: t('Move the mouse to look around', 'Drag on the right side to look around'), check: () => this.yawMoved > 1.2 },
      { text: t('Move with W A S D', 'Move with the joystick (left thumb)'), check: () => this.moved > 6 },
      { text: t('Press SPACE to jump', 'Tap JUMP'), check: () => this.jumped },
      { text: t('Press SHIFT to dash', 'Tap DASH'), check: () => this.dashed },
      { text: t('Run and press C to slide', 'Run and tap SLIDE'), check: () => this.slid },
      { text: t('Press E to show a portal outline', 'Tap PORTAL to show a portal outline'), check: () => this.m.ghostMode },
      { text: t('Aim at a wall or the floor and press E again to place it', 'Aim at a wall or the floor and tap PLACE'), check: () => this.portalCount() >= 1 },
      { text: t('Place a second portal somewhere else (E, then E)', 'Place a second portal somewhere else'), check: () => this.portalCount() >= 2 },
      { text: 'Walk into one of your portals', check: () => this.flags.teleported },
      { text: 'Shoot INTO the portal in front of you. The bullet comes out the other one and hits the target!', setup: () => this.setupPortalShot(), check: () => this.flags.portalHit },
      { text: t('Throw a grenade with G', 'Tap the grenade button to throw a grenade'), check: () => this.flags.grenade },
      { text: 'You\'re ready! Win matches to earn coins, level up and unlock skins.', check: () => this.stepT > 3.5, final: true },
    ];
    this.render();
  }

  portalCount() { return this.m.portals.ownerCount(this.m.player); }

  setupPortalShot() {
    const m = this.m, p = m.player, V = THREE.Vector3;
    m.portals.removeOwner(p);
    p.pos.set(4, 0.92, 12.6); p.vel.set(0, 0, 0); p.yaw = Math.PI; p.pitch = 0;
    p.portalCd = 0;
    const a = m.portals.poseFromHit(m.world.raycast(new V(4, 1.5, 12.6), new V(0, 0, 1), 50), new V(0, 0, 1));
    m.placePortal(p, a); p.portalCd = 0;
    const b = m.portals.poseFromHit(m.world.raycast(new V(4, 1.3, 9), new V(1, 0, 0), 50), new V(1, 0, 0)); // same height as A, so a straight shot hits the chest
    m.placePortal(p, b);
    this.placeDummy(new V(6.2, 0, 9), -Math.PI / 2);
  }

  placeDummy(at, yaw) {
    const d = this.m.chars.find(c => c.isBot);
    d.spawn(at, yaw);
    d.animate(0);
  }

  // Called by Match for every hit on the dummy.
  onHit(info) {
    this.flags.hits++;
    if (info.portal) this.flags.portalHit = true;
  }

  update(dt) {
    const p = this.m.player;
    if (!this.start) { this.start = p.pos.clone(); this.lastYaw = p.yaw; this.yawMoved = 0; this.moved = 0; }
    this.yawMoved += Math.abs(p.yaw - this.lastYaw); this.lastYaw = p.yaw;
    this.moved += Math.hypot(p.vel.x, p.vel.z) * dt;
    if (p.jumped) this.jumped = true;
    if (p.dashed) this.dashed = true;
    if (p.slid) this.slid = true;
    // Keep everyone topped up: nobody can lose in the tutorial.
    p.hp = p.maxHp;
    p.grenades = Math.max(p.grenades, 1);
    for (const c of this.m.chars) if (c.isBot) { c.hp = c.maxHp; c.vel.set(0, 0, 0); }

    this.stepT += dt;
    const step = this.steps[this.stepIndex];
    if (step.check()) {
      if (step.final) return this.m.finishTutorial();
      this.stepIndex++;
      this.stepT = 0;
      Sfx.coin();
      const next = this.steps[this.stepIndex];
      if (next.setup) next.setup();
      this.render();
    }
  }

  render() {
    const step = this.steps[this.stepIndex];
    const n = this.steps.length - 1;
    this.el.innerHTML = `<small>TUTORIAL · ${Math.min(this.stepIndex + 1, n)} / ${n}</small><div>${step.text}</div>`;
  }

  dispose() { this.el.classList.add('hidden'); }
}
