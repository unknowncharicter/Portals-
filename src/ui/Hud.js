const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = $('hud');
    this.hp = $('hp-bar'); this.hpText = $('hp-text');
    this.heal = $('heal-info'); this.portal = $('portal-info');
    this.weapon = $('weapon-name'); this.ammo = $('ammo');
    this.score = $('score'); this.center = $('center-text');
    this.killfeed = $('killfeed'); this.hitmarker = $('hitmarker'); this.dmg = $('damage');
    this.scopeEl = $('scope'); this.crosshair = $('crosshair');
    this._hitT = null; this._dmgT = null; this._centerT = null;
  }
  show(v) { this.el.classList.toggle('hidden', !v); }

  update(p, portalCount) {
    const pct = Math.max(0, p.hp / p.maxHp) * 100;
    this.hp.style.width = pct + '%';
    this.hp.style.background = pct > 50 ? 'linear-gradient(90deg,#3d6,#8f6)' : pct > 25 ? 'linear-gradient(90deg,#db3,#fd5)' : 'linear-gradient(90deg,#d33,#f66)';
    this.hpText.textContent = Math.ceil(p.hp);
    this.heal.textContent = p.healCd > 0 ? `F heal · ${Math.ceil(p.healCd)}s` : `F heal · READY (+${p.stats.heal})`;
    const w = p.weapon;
    this.weapon.textContent = `${w.def.name}  [1/2]`;
    this.ammo.textContent = w.reloading ? 'RELOADING' : `${w.ammo} / ${w.mag}`;
    const cd = p.portalCd > 0 ? `${p.portalCd.toFixed(1)}s` : 'READY';
    this.portal.innerHTML = `<span style="color:${p.portalColor}">◉</span> Portals ${portalCount}/2 · E ${cd}`;
  }

  scope(on) {
    this.scopeEl.classList.toggle('hidden', !on);
    this.crosshair.classList.toggle('hidden', on);
  }

  setScore(html) { this.score.innerHTML = html; }

  centerText(text, ms = 0, color = '#fff') {
    this.center.textContent = text;
    this.center.style.color = color;
    clearTimeout(this._centerT);
    if (ms) this._centerT = setTimeout(() => { this.center.textContent = ''; }, ms);
  }

  kill(killer, victim, self = false) {
    const d = document.createElement('div');
    d.innerHTML = self
      ? `<b style="color:${victim.color}">${victim.name}</b> shot themselves 🌀`
      : `<b style="color:${killer.color}">${killer.name}</b> ▸ <b style="color:${victim.color}">${victim.name}</b>`;
    this.killfeed.prepend(d);
    setTimeout(() => d.remove(), 5000);
  }

  hit(head) {
    this.hitmarker.classList.add('show');
    this.hitmarker.style.filter = head ? 'hue-rotate(60deg) brightness(1.5)' : '';
    clearTimeout(this._hitT);
    this._hitT = setTimeout(() => this.hitmarker.classList.remove('show'), 90);
  }

  hurt(angle = null) {
    if (angle !== null) {
      const a = document.createElement('div');
      a.className = 'hitdir';
      a.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
      this.el.appendChild(a);
      setTimeout(() => a.remove(), 900);
    }
    this.dmg.classList.add('show');
    clearTimeout(this._dmgT);
    this._dmgT = setTimeout(() => this.dmg.classList.remove('show'), 80);
  }

  clear() { this.killfeed.innerHTML = ''; this.centerText(''); }
}
