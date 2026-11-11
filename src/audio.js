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

  /** Exciting reward: rising sparkle arpeggio + shimmer; grows richer with the combo tier. */
  praise(tier = 0, size = 1) {
    if (!this.getSettings().sound || !this.ctx) return;
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1567.98];
    const notes = Math.min(3 + tier, 7);
    const start = Math.min(tier, 3);
    for (let i = 0; i < notes; i++) {
      const f = scale[Math.min(start + i, scale.length - 1)];
      this._tone(f, { type: 'triangle', dur: 0.2, gain: 0.1, delay: 0.04 + i * 0.055 });
      this._tone(f * 2, { dur: 0.16, gain: 0.04, delay: 0.04 + i * 0.055 });
    }
    const end = 0.04 + notes * 0.055;
    // final bright chord
    [1, 1.25, 1.5].forEach((m) =>
      this._tone(scale[Math.min(start + notes, scale.length - 1)] * m, { type: 'triangle', dur: 0.4 + tier * 0.05, gain: 0.07, delay: end })
    );
    if (size > 1) this._tone(1760, { dur: 0.3, gain: 0.05, delay: end + 0.05 });
    // coin-like sparkle on top for bigger combos
    if (tier >= 2) for (let i = 0; i < 3; i++) this._tone(2093 + i * 330, { dur: 0.1, gain: 0.04, delay: end + 0.08 + i * 0.05 });
    // rising whoosh
    if (tier >= 3) this._tone(300, { type: 'sawtooth', dur: 0.35, gain: 0.035, slideTo: 1400 });
  }

  wrong() {
    if (!this.getSettings().sound) return;
    this._tone(220, { type: 'triangle', dur: 0.22, gain: 0.16, slideTo: 150 });
  }

  /**
   * Zelda-style low-health alarm: a quick "bip-bip" every second while one heart is left.
   * `canBeep()` lets the caller mute it on non-game screens (home, result, shop...).
   */
  setLowHealth(on, canBeep = () => true) {
    if (!on) {
      clearInterval(this.lowTimer);
      this.lowTimer = null;
      return;
    }
    if (this.lowTimer) return;
    const beep = () => {
      if (document.hidden || !this.ctx || !this.getSettings().sound || !canBeep()) return;
      this._tone(1568, { type: 'square', dur: 0.07, gain: 0.05 });
      this._tone(1568, { type: 'square', dur: 0.07, gain: 0.05, delay: 0.13 });
    };
    this.lowTimer = setInterval(beep, 1000);
    setTimeout(beep, 350); // first alarm right after the wrong-drop thud
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
