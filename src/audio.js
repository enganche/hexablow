// Tiny WebAudio synth: soft blips for SFX and a quiet pentatonic loop for music.
// No audio files needed.
export class AudioManager {
  constructor(getSettings) {
    this.getSettings = getSettings;
    this.ctx = null;
    this.musicTimer = null;
    this.step = 0;
  }

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.syncMusic();
  }

  _tone(freq, { type = 'sine', dur = 0.14, gain = 0.12, delay = 0, slideTo = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  place(count = 1) {
    if (!this.getSettings().sound) return;
    const base = 520 + Math.min(count, 6) * 40;
    this._tone(base, { dur: 0.12, gain: 0.13 });
    this._tone(base * 1.5, { dur: 0.16, gain: 0.07, delay: 0.05 });
  }

  wrong() {
    if (!this.getSettings().sound) return;
    this._tone(220, { type: 'triangle', dur: 0.22, gain: 0.16, slideTo: 150 });
  }

  win() {
    if (!this.getSettings().sound) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      this._tone(f, { dur: 0.28, gain: 0.11, delay: i * 0.11 })
    );
  }

  tap() {
    if (!this.getSettings().sound) return;
    this._tone(700, { dur: 0.05, gain: 0.05 });
  }

  // ---- music ----
  syncMusic() {
    const on = this.getSettings().music && this.ctx;
    if (on && !this.musicTimer) {
      const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 392.0, 329.63, 293.66];
      this.musicTimer = setInterval(() => {
        if (document.hidden) return;
        const f = scale[this.step % scale.length];
        this._tone(f, { dur: 1.6, gain: 0.035 });
        if (this.step % 4 === 0) this._tone(f / 2, { dur: 2.4, gain: 0.03 });
        this.step++;
      }, 1100);
    } else if (!on && this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

export function vibrate(settings, pattern) {
  if (!settings.vibration) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
