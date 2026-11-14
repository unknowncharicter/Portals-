// Tiny synthesized sound effects (no audio files needed).
let ctx = null;
let master = null;

function ac() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch (e) { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(c, dur) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  return buf;
}

function tone(freq, dur, type = 'sine', vol = 0.5, slideTo = null) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g); g.connect(master);
  o.start(); o.stop(c.currentTime + dur);
}

function noise(dur, vol, freq) {
  const c = ac(); if (!c) return;
  const s = c.createBufferSource(); s.buffer = noiseBuffer(c, dur);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = c.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); s.start();
}

export const Sfx = {
  unlock: () => ac(),
  rifle: (vol = 1) => { noise(0.12, 0.6 * vol, 2500); tone(140, 0.08, 'square', 0.15 * vol, 60); },
  pistol: (vol = 1) => { noise(0.15, 0.7 * vol, 1800); tone(200, 0.1, 'square', 0.2 * vol, 70); },
  reload: () => { tone(500, 0.05, 'square', 0.15); setTimeout(() => tone(700, 0.05, 'square', 0.15), 180); },
  portalGhost: () => tone(600, 0.12, 'sine', 0.2, 900),
  portalPlace: () => { tone(300, 0.35, 'sawtooth', 0.15, 1200); tone(450, 0.35, 'sine', 0.2, 1500); },
  portalDeny: () => tone(160, 0.2, 'square', 0.2, 100),
  teleport: () => tone(900, 0.25, 'sine', 0.25, 200),
  hit: () => tone(1200, 0.06, 'square', 0.2),
  hurt: () => tone(180, 0.2, 'sawtooth', 0.3, 80),
  heal: () => { tone(500, 0.3, 'sine', 0.25, 1000); },
  beep: (hi) => tone(hi ? 1100 : 660, 0.15, 'sine', 0.35),
  win: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.3), i * 120)); },
  lose: () => { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.3), i * 150)); },
};
