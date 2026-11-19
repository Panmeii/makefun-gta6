// audio.js — every sound in Marisol Heat is synthesised with WebAudio: engine hum,
// two-tone sirens, gunshots, crashes, pickups, rain, and a generated tropical music
// loop (marimba-style plucks over an Am–F–C–G progression). No audio files at all.

import { clamp } from './util.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null; this.engineGain = null; this.engineFilter = null;
    this.sirenOsc = null; this.sirenGain = null; this.sirenFlip = 0;
    this.rainGain = null;
    this.musicTimer = 0; this.musicStep = 0; this.musicOn = false;
  }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    // shared noise buffer for shots, crashes and rain
    const len = this.ctx.sampleRate * 1.2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.55; }
  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol, freq = 1200, q = 0.8, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }
  gunshot() { this.noise(0.13, 0.5, 900, 0.4); this.tone(160, 0.09, 'square', 0.16, 0, 55); }
  dryFire() { this.tone(1200, 0.03, 'square', 0.06); }
  crash(strength = 1) {
    this.noise(0.28, 0.4 * strength, 300, 0.5);
    this.tone(70, 0.3, 'sine', 0.4 * strength, 0, 34);
  }
  explosionSound() { this.noise(0.8, 0.7, 160, 0.3); this.tone(52, 0.8, 'sine', 0.6, 0, 26); }
  pickup() { this.tone(880, 0.08, 'sine', 0.18); this.tone(1318, 0.14, 'sine', 0.18, 0.07); }
  cash() { this.tone(1046, 0.07, 'triangle', 0.2); this.tone(1318, 0.07, 'triangle', 0.2, 0.06); this.tone(1568, 0.16, 'triangle', 0.22, 0.12); }
  blip() { this.tone(660, 0.05, 'square', 0.07); }
  fail() { this.tone(220, 0.16, 'sawtooth', 0.14, 0, 160); this.tone(160, 0.24, 'sawtooth', 0.14, 0.14, 110); }
  success() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.2, i * 0.08)); }
  sting(down = true) {
    if (down) [392, 370, 349, 311].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.22, i * 0.16));
    else [523, 659, 784].forEach((f, i) => this.tone(f, 0.24, 'triangle', 0.2, i * 0.12));
  }
  // Continuous layers -------------------------------------------------------
  engine(speedRatio, inCar) {
    if (!this.ctx) return;
    if (inCar && !this.engineOsc) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
      o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = 0.0;
      o.connect(f); f.connect(g); g.connect(this.master); o.start();
      this.engineOsc = o; this.engineGain = g; this.engineFilter = f;
    }
    if (!inCar && this.engineOsc) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      const o = this.engineOsc; setTimeout(() => { try { o.stop(); } catch { /* already stopped */ } }, 300);
      this.engineOsc = null;
    }
    if (this.engineOsc) {
      const t = this.ctx.currentTime;
      this.engineOsc.frequency.setTargetAtTime(55 + speedRatio * 165, t, 0.06);
      this.engineFilter.frequency.setTargetAtTime(320 + speedRatio * 700, t, 0.1);
      this.engineGain.gain.setTargetAtTime(0.05 + speedRatio * 0.075, t, 0.1);
    }
  }
  siren(nearestCopDist) {
    if (!this.ctx) return;
    const want = nearestCopDist < 620 ? clamp(1 - nearestCopDist / 700, 0.04, 0.3) : 0;
    if (want > 0 && !this.sirenOsc) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 720; g.gain.value = 0;
      o.connect(g); g.connect(this.master); o.start();
      this.sirenOsc = o; this.sirenGain = g;
    }
    if (this.sirenOsc) {
      this.sirenFlip += 1;
      if (this.sirenFlip % 24 === 0) {
        const cur = this.sirenOsc.frequency.value;
        this.sirenOsc.frequency.setTargetAtTime(cur > 820 ? 690 : 950, this.ctx.currentTime, 0.03);
      }
      this.sirenGain.gain.setTargetAtTime(want * 0.16, this.ctx.currentTime, 0.2);
      if (want === 0) {
        const o = this.sirenOsc, g = this.sirenGain;
        setTimeout(() => { try { o.stop(); } catch { /* done */ } }, 500);
        this.sirenOsc = null; this.sirenGain = null;
      }
    }
  }
  rain(on) {
    if (!this.ctx) return;
    if (on && !this.rainGain) {
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
      const g = this.ctx.createGain(); g.gain.value = 0.0;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      g.gain.setTargetAtTime(0.045, this.ctx.currentTime, 0.8);
      this.rainSrc = src; this.rainGain = g;
    } else if (!on && this.rainGain) {
      const src = this.rainSrc, g = this.rainGain;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
      setTimeout(() => { try { src.stop(); } catch { /* done */ } }, 1400);
      this.rainSrc = null; this.rainGain = null;
    }
  }
  // Generated tropical loop: plucked melody over Am–F–C–G, one bar per chord.
  music(dt, playing) {
    if (!this.ctx) return;
    this.musicOn = playing;
    if (!playing) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [130.8, 164.8, 196], [196, 246.9, 293.7]];
    const melody = [0, 2, 1, 2, 0, -1, 1, 2, 0, 2, 1, 0, 2, 1, 0, -1];
    const step = this.musicStep++;
    const bar = (step >> 3) % 4, chord = chords[bar];
    const beat = step % 8;
    if (beat === 0) this.tone(chord[0] / 2, 0.5, 'sine', 0.16); // bass
    if (beat === 4) this.tone(chord[1] / 2, 0.4, 'sine', 0.1);
    const idx = melody[step % melody.length];
    if (idx >= 0) this.tone(chord[idx] * 2, 0.22, 'triangle', 0.075); // marimba-ish pluck
    if (step % 2 === 0) this.noise(0.03, 0.012, 6000, 1); // soft shaker
    this.musicTimer = 0.24;
  }
}
