// Sound: recorded samples for guns, portals and menus (public/sfx, CC0: "The Free Firearm Sound
// Library" and Kenney's Digital SFX / UI sets, via OpenGameArt). Everything else, and any sample
// that hasn't loaded yet, is generated in code: impacts, explosions, footsteps, plus a small
// music sequencer with a menu and a battle track.
let ctx = null;
let master = null, sfxBus = null, musicBus = null, comp = null;
let noiseBuf = null;
let volume = 0.7, musicVolume = 0.5, muted = false;

function ac() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4;
      comp.attack.value = 0.003; comp.release.value = 0.15;
      master = ctx.createGain();
      sfxBus = ctx.createGain();
      musicBus = ctx.createGain();
      sfxBus.connect(comp); musicBus.connect(comp);
      comp.connect(master); master.connect(ctx.destination);
      // 2 s of white noise, reused by every noisy sound (random start offsets keep it varied).
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      applyVolumes();
      loadSamples();
    } catch (e) { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function applyVolumes() {
  if (!master) return;
  master.gain.value = muted ? 0 : 1;
  sfxBus.gain.value = 0.9 * volume;
  musicBus.gain.value = 0.35 * musicVolume;
}
export function setVolume(v) { volume = v; applyVolumes(); }
export function setMusicVolume(v) { musicVolume = v; applyVolumes(); }
export function setMuted(m) { muted = m; applyVolumes(); }

// ---------- Recorded samples ----------
const SAMPLE_FILES = {
  rifle: 'ar', smg: 'smg', shotgun: 'shotgun', sniper: 'sniper', pistol: 'pistol', revolver: 'revolver', burst: 'burst',
  portalPlace: 'portal_place', teleport: 'teleport', portalClose: 'portal_close', portalDeny: 'portal_deny',
  portalGhost: 'portal_ghost', coin: 'coin', levelUp: 'levelup', click: 'click', swap: 'swap',
};
const samples = {};
let samplesRequested = false;
function loadSamples() {
  if (samplesRequested || !ctx) return;
  samplesRequested = true;
  for (const [name, file] of Object.entries(SAMPLE_FILES)) {
    fetch(`sfx/${file}.mp3`).then(r => r.ok ? r.arrayBuffer() : Promise.reject())
      .then(b => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej)))
      .then(buf => { samples[name] = buf; }).catch(() => {});
  }
}
// Play a sample if it has loaded (returns false otherwise, so the generated sound plays instead).
function sample(name, vol = 1, rate = 1) {
  const b = samples[name];
  if (!b) return false;
  const src = ctx.createBufferSource();
  src.buffer = b; src.playbackRate.value = rate;
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(g); g.connect(sfxBus);
  src.start();
  return true;
}
const jitter = () => 0.94 + Math.random() * 0.12;

// ---------- Building blocks ----------
const now = () => ctx.currentTime;

function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

// Filtered noise burst. type: lowpass/highpass/bandpass. sweepTo: filter frequency at the end.
function noise({ t = now(), dur = 0.2, vol = 0.5, type = 'lowpass', freq = 2000, q = 0.7, attack = 0.002, sweepTo = null, out = sfxBus, rate = 1 }) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf; s.playbackRate.value = rate;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + dur);
  const g = ctx.createGain(); env(g, t, vol, attack, dur);
  s.connect(f); f.connect(g); g.connect(out);
  const len = attack + dur + 0.05;
  s.start(t, Math.random() * Math.max(0, 1.95 - len * rate), len);
}

function tone({ t = now(), freq = 440, to = null, dur = 0.2, vol = 0.3, type = 'sine', attack = 0.002, out = sfxBus, detune = 0 }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + dur);
  env(g, t, vol, attack, dur);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + attack + dur + 0.05);
}

const play = (fn) => (...args) => { if (ac()) fn(...args); };

// One recipe for every gun: crack + body + thump + tail.
function gunshot(p, vol = 1) {
  const t = now(), v = vol;
  noise({ t, dur: 0.025, vol: 0.9 * v * p.crack, type: 'highpass', freq: 3500 });             // crack
  noise({ t, dur: p.body, vol: 0.9 * v, type: 'bandpass', freq: p.bodyFreq, q: 0.9, sweepTo: p.bodyFreq * 0.35 }); // body
  tone({ t, freq: p.thump, to: 38, dur: p.body * 1.2, vol: 0.7 * v * p.thumpVol, type: 'sine' });  // low thump
  noise({ t: t + 0.01, dur: p.tail, vol: 0.18 * v, type: 'lowpass', freq: 900, sweepTo: 200 });    // room tail
  if (p.mech) tone({ t: t + 0.04, freq: 2400, to: 1800, dur: 0.03, vol: 0.05 * v, type: 'square' }); // bolt click
}

const GUNS = {
  rifle:    { crack: 1, body: 0.09, bodyFreq: 1400, thump: 140, thumpVol: 0.8, tail: 0.35, mech: true },
  smg:      { crack: 0.8, body: 0.06, bodyFreq: 1800, thump: 170, thumpVol: 0.6, tail: 0.25, mech: true },
  shotgun:  { crack: 1.2, body: 0.22, bodyFreq: 800, thump: 110, thumpVol: 1.2, tail: 0.7 },
  sniper:   { crack: 1.4, body: 0.18, bodyFreq: 1100, thump: 95, thumpVol: 1.3, tail: 1.1 },
  pistol:   { crack: 0.9, body: 0.08, bodyFreq: 1600, thump: 180, thumpVol: 0.6, tail: 0.3 },
  revolver: { crack: 1.2, body: 0.14, bodyFreq: 1200, thump: 120, thumpVol: 1.0, tail: 0.6 },
  burst:    { crack: 0.9, body: 0.07, bodyFreq: 1600, thump: 150, thumpVol: 0.7, tail: 0.3, mech: true },
};

export const Sfx = {
  unlock: () => ac(),
  rifle: play((v = 1) => sample('rifle', 0.7 * v, jitter()) || gunshot(GUNS.rifle, v)),
  smg: play((v = 1) => sample('smg', 0.7 * v, jitter()) || gunshot(GUNS.smg, v)),
  shotgun: play((v = 1) => sample('shotgun', 0.7 * v, jitter()) || gunshot(GUNS.shotgun, v)),
  sniper: play((v = 1) => sample('sniper', 0.7 * v, jitter()) || gunshot(GUNS.sniper, v)),
  pistol: play((v = 1) => sample('pistol', 0.7 * v, jitter()) || gunshot(GUNS.pistol, v)),
  revolver: play((v = 1) => sample('revolver', 0.7 * v, jitter()) || gunshot(GUNS.revolver, v)),
  burst: play((v = 1) => sample('burst', 0.7 * v, jitter()) || gunshot(GUNS.burst, v)),
  crossbow: play((v = 1) => {
    const t = now();
    tone({ t, freq: 220, to: 110, dur: 0.12, vol: 0.4 * v, type: 'triangle' });
    noise({ t, dur: 0.15, vol: 0.35 * v, type: 'bandpass', freq: 2500, q: 2, sweepTo: 600 });
  }),
  rocket: play((v = 1) => {
    const t = now();
    noise({ t, dur: 0.6, vol: 0.7 * v, type: 'lowpass', freq: 1500, sweepTo: 300, attack: 0.02 });
    tone({ t, freq: 90, to: 50, dur: 0.4, vol: 0.5 * v });
  }),
  explosion: play((v = 1) => {
    const t = now();
    noise({ t, dur: 0.05, vol: 1.0 * v, type: 'highpass', freq: 1500 });
    noise({ t, dur: 0.9, vol: 1.0 * v, type: 'lowpass', freq: 2200, sweepTo: 120 });
    tone({ t, freq: 110, to: 28, dur: 0.8, vol: 1.0 * v });
    noise({ t: t + 0.05, dur: 1.6, vol: 0.3 * v, type: 'lowpass', freq: 600, sweepTo: 80 });
  }),
  throw: play(() => noise({ dur: 0.15, vol: 0.25, type: 'bandpass', freq: 900, q: 1, sweepTo: 2500 })),
  bounce: play((v = 1) => { tone({ freq: 1800, to: 1300, dur: 0.05, vol: 0.12 * v, type: 'triangle' }); noise({ dur: 0.04, vol: 0.1 * v, type: 'highpass', freq: 2000 }); }),
  pin: play(() => { tone({ freq: 2600, dur: 0.04, vol: 0.12, type: 'square' }); tone({ t: now() + 0.07, freq: 2000, dur: 0.05, vol: 0.1, type: 'square' }); }),
  impact: play((v = 1) => noise({ dur: 0.05, vol: 0.18 * v, type: 'bandpass', freq: 2500 + Math.random() * 1500, q: 1.5 })),
  reload: play(() => {
    const t = now();
    noise({ t, dur: 0.04, vol: 0.25, type: 'bandpass', freq: 1800, q: 3 });
    tone({ t, freq: 900, to: 700, dur: 0.04, vol: 0.08, type: 'square' });
    noise({ t: t + 0.22, dur: 0.05, vol: 0.3, type: 'bandpass', freq: 1200, q: 3 });
    tone({ t: t + 0.22, freq: 600, to: 500, dur: 0.05, vol: 0.1, type: 'square' });
  }),
  swap: play(() => sample('swap', 0.6) || noise({ dur: 0.08, vol: 0.2, type: 'bandpass', freq: 1500, q: 2, sweepTo: 2500 })),
  portalGhost: play(() => { if (sample('portalGhost', 0.35)) return; tone({ freq: 500, to: 800, dur: 0.15, vol: 0.12 }); tone({ freq: 750, to: 1200, dur: 0.15, vol: 0.06, detune: 8 }); }),
  portalPlace: play(() => { if (sample('portalPlace', 0.6)) return;
    const t = now();
    noise({ t, dur: 0.45, vol: 0.35, type: 'bandpass', freq: 400, q: 1.5, sweepTo: 3000, attack: 0.02 });
    for (const [f, d] of [[300, -10], [450, 10], [600, 0]]) tone({ t, freq: f, to: f * 3, dur: 0.4, vol: 0.09, type: 'sawtooth', detune: d, attack: 0.02 });
    tone({ t: t + 0.3, freq: 1500, to: 1400, dur: 0.6, vol: 0.06, attack: 0.02 });
  }),
  portalDeny: play(() => { if (sample('portalDeny', 0.45)) return; tone({ freq: 200, to: 120, dur: 0.18, vol: 0.2, type: 'square' }); }),
  portalClose: play((v = 1) => sample('portalClose', 0.5 * v) || noise({ dur: 0.3, vol: 0.2 * v, type: 'bandpass', freq: 2000, q: 1.2, sweepTo: 300 })),
  teleport: play(() => { if (sample('teleport', 0.6)) return;
    const t = now();
    noise({ t, dur: 0.35, vol: 0.45, type: 'bandpass', freq: 3000, q: 1, sweepTo: 250, attack: 0.01 });
    tone({ t, freq: 1200, to: 300, dur: 0.3, vol: 0.12 });
  }),
  dash: play(() => {
    const t = now();
    noise({ t, dur: 0.25, vol: 0.5, type: 'bandpass', freq: 600, q: 0.8, sweepTo: 2500, attack: 0.01 });
    tone({ t, freq: 220, to: 440, dur: 0.15, vol: 0.08, type: 'triangle' });
  }),
  slide: play(() => noise({ dur: 0.55, vol: 0.28, type: 'lowpass', freq: 1400, sweepTo: 300, attack: 0.03 })),
  jump: play(() => noise({ dur: 0.08, vol: 0.12, type: 'lowpass', freq: 700 })),
  land: play((v = 1) => { noise({ dur: 0.1, vol: 0.3 * v, type: 'lowpass', freq: 500 }); tone({ freq: 90, to: 50, dur: 0.1, vol: 0.2 * v }); }),
  step: play((v = 1) => noise({ dur: 0.05, vol: 0.12 * v, type: 'lowpass', freq: 500 + Math.random() * 300 })),
  hit: play(() => { tone({ freq: 1700, dur: 0.05, vol: 0.18, type: 'triangle' }); noise({ dur: 0.03, vol: 0.12, type: 'highpass', freq: 4000 }); }),
  headshot: play(() => { tone({ freq: 2400, to: 2300, dur: 0.12, vol: 0.2, type: 'triangle' }); tone({ freq: 3600, dur: 0.08, vol: 0.08 }); }),
  kill: play(() => {
    const t = now();
    tone({ t, freq: 880, dur: 0.12, vol: 0.25, type: 'triangle' });
    tone({ t: t + 0.08, freq: 1320, dur: 0.25, vol: 0.25, type: 'triangle' });
    tone({ t, freq: 110, to: 55, dur: 0.25, vol: 0.4 });
  }),
  portalKill: play(() => {
    const t = now();
    [660, 880, 1100, 1320, 1760].forEach((f, i) => tone({ t: t + i * 0.06, freq: f, dur: 0.3, vol: 0.18, type: 'triangle' }));
    noise({ t, dur: 0.6, vol: 0.3, type: 'bandpass', freq: 500, q: 1, sweepTo: 5000, attack: 0.02 });
  }),
  hurt: play(() => { noise({ dur: 0.12, vol: 0.4, type: 'lowpass', freq: 700 }); tone({ freq: 160, to: 90, dur: 0.15, vol: 0.25, type: 'sawtooth' }); }),
  heal: play(() => { const t = now(); [523, 659, 784].forEach((f, i) => tone({ t: t + i * 0.07, freq: f, to: f * 1.5, dur: 0.3, vol: 0.12 })); }),
  levelUp: play(() => { if (sample('levelUp', 0.6)) return; const t = now(); [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ t: t + i * 0.08, freq: f, dur: 0.35, vol: 0.2, type: 'triangle' })); }),
  coin: play(() => { if (sample('coin', 0.5)) return; const t = now(); tone({ t, freq: 1318, dur: 0.07, vol: 0.15, type: 'square' }); tone({ t: t + 0.07, freq: 1760, dur: 0.15, vol: 0.15, type: 'square' }); }),
  click: play(() => sample('click', 0.5) || tone({ freq: 900, dur: 0.03, vol: 0.08, type: 'triangle' })),
  beep: play((hi) => tone({ freq: hi ? 1100 : 660, dur: 0.18, vol: 0.3, type: 'triangle' })),
  win: play(() => { const t = now(); [523, 659, 784, 1046].forEach((f, i) => tone({ t: t + i * 0.12, freq: f, dur: 0.3, vol: 0.25, type: 'triangle' })); }),
  lose: play(() => { const t = now(); [392, 330, 262].forEach((f, i) => tone({ t: t + i * 0.15, freq: f, dur: 0.35, vol: 0.25, type: 'triangle' })); }),
};

// ---------- Music ----------
// A tiny step sequencer. Chords: Am - F - C - G (one bar each).
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

const TRACKS = {
  menu: { bpm: 96, kick: [0, 10], clap: [], hat: [2, 6, 10, 14], hatVol: 0.04, bass: [0, 7, 10], arp: 2, pad: true, lead: false },
  battle: { bpm: 132, kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14], hatVol: 0.06, bass: [0, 2, 4, 6, 8, 10, 12, 14], arp: 1, pad: true, lead: true },
};

let musicTimer = null, current = null, step = 0, nextTime = 0;

function scheduleStep(tr, s, t) {
  const bar = Math.floor(s / 16) % 4, i = s % 16;
  const chord = CHORDS[bar];
  const out = musicBus;
  if (tr.kick.includes(i)) tone({ t, freq: 150, to: 45, dur: 0.25, vol: 0.5, out });
  if (tr.clap.includes(i)) noise({ t, dur: 0.12, vol: 0.18, type: 'bandpass', freq: 1500, q: 1, out });
  if (tr.hat.includes(i)) noise({ t, dur: 0.03, vol: tr.hatVol, type: 'highpass', freq: 8000, out });
  if (tr.bass.includes(i)) {
    const n = chord[0] - 24 + (tr === TRACKS.battle && i % 4 === 2 ? 12 : 0);
    tone({ t, freq: midi(n), dur: 0.16, vol: 0.16, type: 'sawtooth', out });
    tone({ t, freq: midi(n), dur: 0.2, vol: 0.12, type: 'sine', out });
  }
  if (i % tr.arp === 0) {
    const notes = [chord[0], chord[1], chord[2], chord[0] + 12];
    const n = notes[(i / tr.arp) % 4] + 12;
    tone({ t, freq: midi(n), dur: 0.12, vol: tr.lead ? 0.035 : 0.05, type: tr.lead ? 'square' : 'triangle', out });
  }
  if (tr.pad && i === 0) {
    const len = (60 / tr.bpm) * 4;
    for (const n of chord) for (const d of [-7, 7]) tone({ t, freq: midi(n), dur: len * 0.9, vol: 0.022, type: 'sawtooth', attack: 0.3, detune: d, out });
  }
  if (tr.lead && bar === 3 && (i === 8 || i === 12)) tone({ t, freq: midi(chord[2] + 24), dur: 0.2, vol: 0.04, type: 'square', out });
}

export const Music = {
  play(name) {
    if (current === name) return;
    current = name;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (!name || !ac()) return;
    const tr = TRACKS[name];
    const stepLen = 60 / tr.bpm / 4;
    step = 0; nextTime = ctx.currentTime + 0.1;
    musicTimer = setInterval(() => {
      if (!ctx) return;
      while (nextTime < ctx.currentTime + 0.12) {
        scheduleStep(tr, step, nextTime);
        nextTime += stepLen; step++;
      }
    }, 25);
  },
  stop() { this.play(null); },
};
