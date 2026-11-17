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
    this.timer = $('timer'); this.killpopEl = $('killpop');
    this._kpT = null; this._spread = -1;
    this._hitT = null; this._dmgT = null; this._centerT = null;
  }
  show(v) { this.el.classList.toggle('hidden', !v); }

  update(p, portalCount) {
    const pct = Math.max(0, p.hp / p.maxHp) * 100;
    this.hp.style.width = pct + '%';
    this.hp.style.background = pct > 50 ? 'linear-gradient(90deg,#3d6,#8f6)' : pct > 25 ? 'linear-gradient(90deg,#db3,#fd5)' : 'linear-gradient(90deg,#d33,#f66)';
    this.hpText.textContent = Math.ceil(p.hp);
    const hk = document.body.classList.contains('touch') ? 'Heal' : 'F heal';
    const dk = document.body.classList.contains('touch') ? 'Dash' : 'Shift dash';
    const gk = document.body.classList.contains('touch') ? '💣' : 'G 💣';
    this.heal.textContent = (p.healCd > 0 ? `${hk} ${Math.ceil(p.healCd)}s` : `${hk} READY`) + ' · ' + (p.dashCd > 0 ? `${dk} ${p.dashCd.toFixed(1)}s` : `${dk} READY`) + ` · ${gk} ${p.grenades}`;
    const w = p.weapon;
    this.weapon.textContent = `${w.def.name}  [1/2]`;
    this.ammo.textContent = w.reloading ? 'RELOADING' : `${w.ammo} / ${w.mag}`;
    const cd = p.portalCd > 0 ? `${p.portalCd.toFixed(1)}s` : 'READY';
    this.portal.innerHTML = `<span style="color:${p.portalColor}">◉</span> Portals ${portalCount}/2 · E ${cd}`;
  }

  aiming(on) {
    if (on === this._aiming) return;
    this._aiming = on;
    this.crosshair.classList.toggle('ads', on);
  }

  scope(on) {
    this.scopeEl.classList.toggle('hidden', !on);
    this.crosshair.classList.toggle('hidden', on);
  }

  setSpread(px) {
    const v = Math.round(Math.min(40, 3 + px));
    if (v !== this._spread) { this._spread = v; this.crosshair.style.setProperty('--gap', v + 'px'); }
  }

  setTimer(sec) {
    if (sec === null) { this.timer.textContent = ''; return; }
    const s = Math.max(0, Math.ceil(sec));
    this.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.timer.classList.toggle('low', s <= 15);
  }

  killPop(name, title = 'ELIMINATED') {
    const k = this.killpopEl;
    k.innerHTML = `<small>${title}</small>${name}`;
    k.classList.toggle('portal', title === 'PORTAL KILL!');
    k.classList.remove('show'); void k.offsetWidth; k.classList.add('show');
    clearTimeout(this._kpT);
    this._kpT = setTimeout(() => k.classList.remove('show'), 1400);
  }

  killcam(title, sub = '', label = 'KILL CAM') {
    const el = document.getElementById('killcam');
    if (!title) { el.classList.add('hidden'); return; }
    el.classList.toggle('spec', label !== 'KILL CAM');
    el.innerHTML = `<span>${label}</span><b>${title}</b><small>${sub}</small>`;
    el.classList.remove('hidden');
  }

  // Short floating message (XP, coins, challenge done...)
  toast(text, color = '#fff') {
    const box = document.getElementById('toasts');
    const d = document.createElement('div');
    d.textContent = text; d.style.color = color;
    box.appendChild(d);
    setTimeout(() => d.remove(), 2600);
  }

  setScore(html) { this.score.innerHTML = html; }

  centerText(text, ms = 0, color = '#fff') {
    this.center.textContent = text;
    this.center.style.color = color;
    clearTimeout(this._centerT);
    if (ms) this._centerT = setTimeout(() => { this.center.textContent = ''; }, ms);
  }

  kill(killer, victim, self = false, info = {}) {
    const d = document.createElement('div');
    const how = info.grenade ? ' 💣' : info.portal ? ' 🌀' : info.head ? ' 🎯' : '';
    d.innerHTML = self
      ? `<b style="color:${victim.color}">${victim.name}</b> took themselves out${how}`
      : `<b style="color:${killer.color}">${killer.name}</b> ▸${how} <b style="color:${victim.color}">${victim.name}</b>`;
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
