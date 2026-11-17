// All music & sound effects are synthesized live with the Web Audio API — no files needed.

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

const CHORDS = [
  { root: 48, pad: [60, 64, 67, 71], tones: [72, 76, 79, 83, 84] }, // Cmaj7
  { root: 45, pad: [57, 60, 64, 67], tones: [69, 72, 76, 79, 81] }, // Am7
  { root: 41, pad: [57, 60, 64, 65], tones: [69, 72, 76, 77, 81] }, // Fmaj7
  { root: 43, pad: [55, 59, 62, 64], tones: [67, 71, 74, 76, 79] }, // G6
];
const PENTA = [72, 74, 76, 79, 81, 84, 86, 88, 91];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.mode = 0; // 0 all on, 1 music off, 2 all off
    this.r = 0;    // how colorful the world is (0..1)
    this.last = {};
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.out = C.createGain(); this.out.gain.value = 0.9;
    const comp = C.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    this.out.connect(comp).connect(C.destination);

    this.music = C.createGain(); this.music.gain.value = 0.55; this.music.connect(this.out);
    this.sfx = C.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.out);

    this.reverb = C.createConvolver();
    this.reverb.buffer = this.impulse(3.4, 2.6);
    const rv = C.createGain(); rv.gain.value = 0.55;
    this.reverb.connect(rv).connect(this.out);

    this.delay = C.createDelay(1.5); this.delay.delayTime.value = 0.48;
    const fb = C.createGain(); fb.gain.value = 0.32;
    const dl = C.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2600;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    const dOut = C.createGain(); dOut.gain.value = 0.35;
    dl.connect(dOut); dOut.connect(this.out); dOut.connect(this.reverb);

    this.noise = C.createBuffer(1, C.sampleRate * 2, C.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.startBrush();
    this.startAmbience();
    this.nextChord = C.currentTime + 0.3;
    this.chordIdx = 0;
    this.nextBeat = C.currentTime + 1.0;
    this.melIdx = 3;
    this.timer = setInterval(() => this.schedule(), 120);
    this.applyMode();
  }

  impulse(sec, decay) {
    const C = this.ctx, len = Math.floor(C.sampleRate * sec);
    const b = C.createBuffer(2, len, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  setMode(m) { this.mode = m; this.applyMode(); }
  applyMode() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(this.mode === 0 ? 0.55 : 0, t, 0.3);
    this.out.gain.setTargetAtTime(this.mode === 2 ? 0 : 0.9, t, 0.1);
  }
  ok(name, gap) {
    if (!this.ctx || this.mode === 2) return false;
    const now = this.ctx.currentTime;
    if (gap && this.last[name] && now - this.last[name] < gap) return false;
    this.last[name] = now;
    return true;
  }

  // ---------- generative music ----------
  schedule() {
    const C = this.ctx; if (!C) return;
    const ahead = C.currentTime + 0.5;
    while (this.nextChord < ahead) {
      const ch = CHORDS[this.chordIdx % CHORDS.length];
      this.curChord = ch;
      const len = 6.4;
      for (const m of ch.pad) this.padNote(mtof(m), this.nextChord, len);
      if (this.r > 0.18) this.bassNote(mtof(ch.root), this.nextChord, len);
      this.nextChord += len;
      this.chordIdx++;
    }
    while (this.nextBeat < ahead) {
      const ch = this.curChord || CHORDS[0];
      const p = 0.07 + this.r * 0.38;
      if (Math.random() < p) {
        // gentle random walk melody
        this.melIdx = Math.max(0, Math.min(PENTA.length - 1, this.melIdx + Math.round((Math.random() - 0.5) * 3.2)));
        let note = PENTA[this.melIdx];
        if (Math.random() < 0.4) note = ch.tones[Math.floor(Math.random() * ch.tones.length)];
        this.pluck(mtof(note), this.nextBeat, 0.05 + this.r * 0.05, this.music, true);
        if (this.r > 0.55 && Math.random() < 0.25) this.pluck(mtof(note - 12), this.nextBeat, 0.035, this.music, true);
      }
      this.nextBeat += 0.4;
    }
  }

  padNote(f, t, dur) {
    const C = this.ctx;
    const g = C.createGain();
    const v = 0.022 + this.r * 0.012;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 2.2);
    g.gain.setValueAtTime(v, t + dur - 0.4);
    g.gain.linearRampToValueAtTime(0, t + dur + 2.6);
    const flt = C.createBiquadFilter(); flt.type = 'lowpass';
    flt.frequency.value = 420 + this.r * 1600; flt.Q.value = 0.4;
    flt.connect(g); g.connect(this.music); g.connect(this.reverb);
    for (const [type, det] of [['triangle', -6], ['sine', 7], ['sawtooth', 0]]) {
      const o = C.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
      const og = C.createGain(); og.gain.value = type === 'sawtooth' ? 0.12 + this.r * 0.2 : 0.5;
      o.connect(og).connect(flt);
      o.start(t); o.stop(t + dur + 2.8);
    }
  }
  bassNote(f, t, dur) {
    const C = this.ctx;
    const o = C.createOscillator(); o.type = 'sine'; o.frequency.value = f / 2;
    const g = C.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 1.2);
    g.gain.linearRampToValueAtTime(0, t + dur + 1);
    o.connect(g).connect(this.music);
    o.start(t); o.stop(t + dur + 1.2);
  }
  // music-box / bell pluck
  pluck(f, t, vol = 0.1, bus = this.sfx, echo = true, decay = 1.6) {
    const C = this.ctx;
    const g = C.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const o1 = C.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
    const o2 = C.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 3.01;
    const g2 = C.createGain(); g2.gain.value = 0.18;
    o1.connect(g); o2.connect(g2).connect(g);
    g.connect(bus); g.connect(this.reverb);
    if (echo) g.connect(this.delay);
    o1.start(t); o2.start(t); o1.stop(t + decay + 0.1); o2.stop(t + decay + 0.1);
  }
  noiseBurst(t, dur, type, freq, q, vol, sweepTo) {
    const C = this.ctx;
    const s = C.createBufferSource(); s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = C.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = C.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.05, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g); g.connect(this.sfx); g.connect(this.reverb);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // ---------- continuous layers ----------
  startBrush() {
    const C = this.ctx;
    const s = C.createBufferSource(); s.buffer = this.noise; s.loop = true;
    this.brushF = C.createBiquadFilter(); this.brushF.type = 'bandpass'; this.brushF.frequency.value = 1400; this.brushF.Q.value = 0.9;
    this.brushG = C.createGain(); this.brushG.gain.value = 0;
    s.connect(this.brushF).connect(this.brushG).connect(this.sfx);
    s.start();
  }
  setBrush(level, speed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.brushG.gain.setTargetAtTime(level * 0.09, t, 0.06);
    this.brushF.frequency.setTargetAtTime(900 + speed * 90 + Math.sin(t * 7) * 150, t, 0.05);
  }
  startAmbience() {
    // soft wind that becomes a gentle breeze with birds as the world brightens
    const C = this.ctx;
    const s = C.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    this.windG = C.createGain(); this.windG.gain.value = 0.035;
    const lfo = C.createOscillator(); lfo.frequency.value = 0.07;
    const lg = C.createGain(); lg.gain.value = 160;
    lfo.connect(lg).connect(f.frequency); lfo.start();
    s.connect(f).connect(this.windG).connect(this.sfx);
    s.start();
  }
  setColorfulness(r) {
    this.r = r;
    if (this.ctx) this.windG.gain.setTargetAtTime(0.035 * (1 - r * 0.6), this.ctx.currentTime, 1);
  }

  // ---------- one-shot effects ----------
  wake() {
    if (!this.ok('wake', 0.25)) return;
    const t = this.ctx.currentTime + 0.02;
    const base = [72, 76, 79, 84, 88];
    const shift = [0, 2, -3, 5][Math.floor(Math.random() * 4)];
    base.forEach((m, i) => this.pluck(mtof(m + shift), t + i * 0.085, 0.12));
    this.pluck(mtof(96 + shift), t + 0.5, 0.05);
    this.noiseBurst(t, 1.2, 'highpass', 6000, 0.5, 0.025);
  }
  collect() {
    if (!this.ok('collect', 0.3)) return;
    const t = this.ctx.currentTime + 0.02;
    PENTA.concat([93, 96]).forEach((m, i) => this.pluck(mtof(m), t + i * 0.055, 0.09));
    [60, 64, 67, 72].forEach(m => this.pluck(mtof(m), t + 0.7, 0.07, this.sfx, true, 3));
    this.noiseBurst(t, 1.6, 'highpass', 5000, 0.5, 0.04);
  }
  fanfare() {
    if (!this.ok('fanfare', 2)) return;
    const t = this.ctx.currentTime + 0.05;
    const seq = [60, 64, 67, 72, 76, 79, 84, 88, 91, 96];
    seq.forEach((m, i) => this.pluck(mtof(m), t + i * 0.09, 0.1));
    [48, 55, 64, 67, 72].forEach(m => this.pluck(mtof(m), t + 1.0, 0.08, this.sfx, true, 4));
    this.noiseBurst(t + 0.9, 3, 'highpass', 4000, 0.4, 0.03);
  }
  sparkle(vol = 0.04) {
    if (!this.ok('sparkle', 0.08)) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) this.pluck(mtof(PENTA[4 + Math.floor(Math.random() * 5)] + 12), t + i * 0.06, vol, this.sfx, false, 0.6);
  }
  pop() {
    if (!this.ok('pop', 0.09)) return;
    const C = this.ctx, t = C.currentTime;
    const o = C.createOscillator(); o.type = 'sine';
    const f0 = 500 + Math.random() * 500;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 2.2, t + 0.06);
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.025, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + 0.15);
  }
  splash(vol = 1) {
    if (!this.ok('splash', 0.15)) return;
    const C = this.ctx, t = C.currentTime;
    this.noiseBurst(t, 0.5, 'bandpass', 1400, 0.8, 0.07 * vol, 500);
    const o = C.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(700, t); o.frequency.exponentialRampToValueAtTime(220, t + 0.15);
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06 * vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + 0.25);
  }
  drip() {
    if (!this.ok('drip', 0.12)) return;
    const C = this.ctx, t = C.currentTime;
    const o = C.createOscillator(); o.type = 'sine';
    const f = 900 + Math.random() * 700;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.4, t + 0.08);
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.018, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + 0.12);
  }
  meow() {
    if (!this.ok('meow', 1.2)) return;
    const C = this.ctx, t = C.currentTime;
    const o = C.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(520, t);
    o.frequency.linearRampToValueAtTime(820, t + 0.18);
    o.frequency.linearRampToValueAtTime(480, t + 0.6);
    const f = C.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(1600, t + 0.2); f.frequency.linearRampToValueAtTime(800, t + 0.6);
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.06); g.gain.setValueAtTime(0.09, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(f).connect(g); g.connect(this.sfx); g.connect(this.reverb);
    o.start(t); o.stop(t + 0.75);
  }
  purr() {
    if (!this.ok('purr', 2.5)) return;
    const C = this.ctx, t = C.currentTime;
    const s = C.createBufferSource(); s.buffer = this.noise;
    const f = C.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
    const am = C.createGain(); am.gain.value = 0;
    const lfo = C.createOscillator(); lfo.frequency.value = 24;
    const lg = C.createGain(); lg.gain.value = 0.5;
    lfo.connect(lg).connect(am.gain);
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.3); g.gain.setValueAtTime(0.35, t + 1.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2);
    s.connect(f).connect(am).connect(g).connect(this.sfx);
    s.start(t); lfo.start(t); s.stop(t + 2.1); lfo.stop(t + 2.1);
  }
  chirp(vol = 0.04) {
    if (!this.ok('chirp', 0.6)) return;
    const C = this.ctx; let t = C.currentTime;
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 2600 + Math.random() * 1400;
    for (let i = 0; i < n; i++) {
      const o = C.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), t + 0.07);
      const g = C.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g); g.connect(this.sfx); g.connect(this.reverb);
      o.start(t); o.stop(t + 0.1);
      t += 0.1 + Math.random() * 0.06;
    }
  }
  baa() {
    if (!this.ok('baa', 1.5)) return;
    const C = this.ctx, t = C.currentTime;
    const o = C.createOscillator(); o.type = 'sawtooth';
    const f0 = 230 + Math.random() * 80;
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 0.92, t + 0.7);
    const vib = C.createOscillator(); vib.frequency.value = 8;
    const vg = C.createGain(); vg.gain.value = 14; vib.connect(vg).connect(o.frequency);
    const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1000; f.Q.value = 2;
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    o.connect(f).connect(g); g.connect(this.sfx); g.connect(this.reverb);
    o.start(t); vib.start(t); o.stop(t + 0.85); vib.stop(t + 0.85);
  }
  quack() {
    if (!this.ok('quack', 2)) return;
    const C = this.ctx, t = C.currentTime;
    for (let k = 0; k < 2; k++) {
      const s = t + k * 0.22;
      const o = C.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(330, s); o.frequency.linearRampToValueAtTime(260, s + 0.15);
      const f = C.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 4;
      const g = C.createGain(); g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.05, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.16);
      o.connect(f).connect(g).connect(this.sfx); o.start(s); o.stop(s + 0.18);
    }
  }
  bell(vol = 0.12) {
    if (!this.ok('bell', 0.8)) return;
    const C = this.ctx, t = C.currentTime;
    const f = mtof(67);
    [[1, 1], [2.0, 0.5], [2.76, 0.35], [5.4, 0.2], [0.5, 0.4]].forEach(([r, v]) => {
      const o = C.createOscillator(); o.type = 'sine'; o.frequency.value = f * r;
      const g = C.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
      o.connect(g); g.connect(this.sfx); g.connect(this.reverb);
      o.start(t); o.stop(t + 5.1);
    });
  }
  whoosh() {
    if (!this.ok('whoosh', 1.5)) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 1.3, 'bandpass', 300, 1.2, 0.12, 1400);
  }
  shutter() {
    if (!this.ok('shutter', 0.3)) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.08, 'highpass', 2500, 0.7, 0.12);
    this.noiseBurst(t + 0.11, 0.1, 'highpass', 1800, 0.7, 0.1);
    this.pluck(1318, t + 0.25, 0.05, this.sfx, true, 0.8);
  }
  click() {
    if (!this.ok('click', 0.05)) return;
    this.pluck(mtof(84), this.ctx.currentTime, 0.05, this.sfx, false, 0.3);
  }
}
