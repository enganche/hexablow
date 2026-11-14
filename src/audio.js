import bgmUrl from './assets/bgm.mp3';
import winUrl from './assets/win.mp3';
import loseUrl from './assets/lose.mp3';
import clickUrl from './assets/click.mp3';
import closeUrl from './assets/close.mp3';
import placeUrl from './assets/place.mp3';
import wrongUrl from './assets/wrong.mp3';
import warnUrl from './assets/warn.mp3';

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
    this.preload();
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
    if (!this.ctx) return;
    // combos rise in pitch: +1 semitone per extra piece, capped at 6
    const rate = 2 ** ((Math.min(count, 6) - 1) / 12);
    const base = 520 + Math.min(count, 6) * 40;
    this._sample('place', placeUrl, () => {
      this._tone(base, { dur: 0.12, gain: 0.13 });
      this._tone(base * 1.5, { dur: 0.16, gain: 0.07, delay: 0.05 });
    }, false, 0.4, rate);
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
    if (!this.ctx) return;
    this._sample('wrong', wrongUrl, () => this._tone(220, { type: 'triangle', dur: 0.22, gain: 0.16, slideTo: 150 }), false, 0.4);
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

  /** Short filtered noise burst (snare / cymbal). */
  _noise({ dur = 0.15, gain = 0.1, delay = 0, hp = 4000 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
  }

  /** Brass-ish note: detuned saw + square, so it sounds big. */
  _brass(freq, dur, delay, gain = 0.07) {
    this._tone(freq, { type: 'sawtooth', dur, gain, delay });
    this._tone(freq * 1.006, { type: 'square', dur, gain: gain * 0.5, delay });
    this._tone(freq / 2, { type: 'triangle', dur, gain: gain * 1.2, delay });
  }

  /** Level-complete fanfare: drum roll, triumphant brass phrase, big final chord, cymbal and sparkles. */
  victory(stars = 1) {
    if (!this.getSettings().sound || !this.ctx) return;
    this._sample('win', winUrl, () => this._victorySynth(stars), true);
  }

  /** Decode-once sample player; plays when ready, falls back to `fallback` if the file fails. */
  _sample(key, url, fallback, duck = false, vol = 0.9, rate = 1) {
    this.samples ??= {};
    const st = (this.samples[key] ??= { buf: null, loading: false, failed: false, pending: false });
    const play = () => {
      const src = this.ctx.createBufferSource();
      src.buffer = st.buf;
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(g).connect(this.master);
      src.start();
      if (duck && this.bgmGain) { // duck the BGM under the sample
        const t = this.ctx.currentTime, p = this.bgmGain.gain;
        p.cancelScheduledValues(t);
        p.setTargetAtTime(0.08, t, 0.05);
        p.setTargetAtTime(0.35, t + st.buf.duration, 0.4);
      }
    };
    if (st.buf) return play();
    if (st.failed) return fallback?.();
    st.onReady = (ok) => (ok ? play() : fallback?.());
    st.pending = true;
    if (st.loading) return;
    st.loading = true;
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((ab) => new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej)))
      .then((buf) => { st.buf = buf; }, () => { st.failed = true; })
      .then(() => { st.loading = false; if (st.pending) { st.pending = false; st.onReady(!!st.buf); } });
  }

  /** Preload so one-shot jingles are instant the first time. */
  preload() {
    if (!this.ctx) return;
    [['win', winUrl], ['lose', loseUrl], ['click', clickUrl], ['close', closeUrl], ['place', placeUrl], ['wrong', wrongUrl], ['warn', warnUrl]].forEach(([k, u]) => {
      this.samples ??= {};
      const st = (this.samples[k] ??= { buf: null, loading: false, failed: false, pending: false });
      if (st.buf || st.loading || st.failed) return;
      st.loading = true;
      fetch(u).then((r) => r.arrayBuffer())
        .then((ab) => new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej)))
        .then((buf) => { st.buf = buf; }, () => { st.failed = true; })
        .then(() => { st.loading = false; if (st.pending) { st.pending = false; st.onReady(!!st.buf); } });
    });
  }

  _victorySynth(stars = 1) {
    const [C, E, G, Bb, hiC, hiE, hiG] = [523.25, 659.25, 783.99, 932.33, 1046.5, 1318.5, 1567.98];
    // snare roll that speeds up
    let rt = 0;
    for (let i = 0; i < 9; i++) {
      this._noise({ dur: 0.07, gain: 0.05 + i * 0.006, delay: rt, hp: 2000 });
      this._tone(110, { type: 'sine', dur: 0.08, gain: 0.1, delay: rt, slideTo: 60 });
      rt += 0.1 - i * 0.007;
    }
    const t0 = rt + 0.02; // ~0.58
    // "da da da DAAA": G G G C (held)
    [0, 0.13, 0.26].forEach((d) => this._brass(G, 0.12, t0 + d));
    this._brass(hiC, 0.45, t0 + 0.4, 0.085);
    // second phrase: Bb, then climb up
    const t1 = t0 + 0.9;
    this._brass(Bb, 0.14, t1);
    this._brass(hiC, 0.14, t1 + 0.16);
    // final big chord C major
    const t2 = t1 + 0.34;
    [C, E, G, hiC, hiE].forEach((f) => this._brass(f, 1.5, t2, 0.06));
    this._tone(65.4, { type: 'sine', dur: 1.5, gain: 0.18, delay: t2 }); // deep bass hit
    this._noise({ dur: 1.0, gain: 0.07, delay: t2, hp: 6000 }); // cymbal crash
    this._noise({ dur: 0.18, gain: 0.12, delay: t2, hp: 1500 });
    // sparkle shower on top
    for (let i = 0; i < 6 + stars * 3; i++) {
      this._tone(2093 + (i % 5) * 330, { dur: 0.14, gain: 0.04, delay: t2 + 0.1 + i * 0.07 });
    }
    // perfect clear: extra rising flourish
    if (stars >= 3) {
      [hiG, 2093, 2637, 3136].forEach((f, i) =>
        this._tone(f, { type: 'triangle', dur: 0.4, gain: 0.07, delay: t2 + 0.5 + i * 0.12 })
      );
    }
  }

  /** Sad descending phrase + low sigh for running out of hearts. */
  defeat() {
    if (!this.getSettings().sound || !this.ctx) return;
    this._sample('lose', loseUrl, () => this._defeatSynth(), true);
  }

  _defeatSynth() {
    // descending minor line: G Eb C (then a low drop)
    [392.0, 311.13, 261.63].forEach((f, i) => {
      this._tone(f, { type: 'triangle', dur: 0.38, gain: 0.13, delay: i * 0.3 });
      this._tone(f / 2, { type: 'sine', dur: 0.4, gain: 0.07, delay: i * 0.3 });
    });
    // final slumping slide
    this._tone(196, { type: 'triangle', dur: 0.9, gain: 0.13, delay: 0.9, slideTo: 98 });
    this._tone(98, { type: 'sine', dur: 1.0, gain: 0.08, delay: 0.9, slideTo: 65 });
  }

  /** HARD level warning: three beeps (sample), synth fallback. */
  warn() {
    if (!this.getSettings().sound || !this.ctx) return;
    this._sample('warn', warnUrl, () => this._warnSynth(), false, 0.45);
  }

  _warnSynth() {
    // two deep drum hits
    [0, 0.26].forEach((d, i) => {
      this._tone(i ? 82 : 98, { type: 'sine', dur: 0.34, gain: 0.26, delay: d, slideTo: 48 });
      this._tone(196, { type: 'triangle', dur: 0.1, gain: 0.05, delay: d, slideTo: 90 });
      this._noise({ dur: 0.08, gain: 0.04, delay: d, hp: 300 });
    });
    // tension swell: minor second / tritone cluster, gentle
    [220, 233.08, 311.13].forEach((f) => this._tone(f, { type: 'triangle', dur: 0.9, gain: 0.035, delay: 0.5 }));
    this._tone(55, { type: 'sine', dur: 0.9, gain: 0.12, delay: 0.5 });
  }

  tap() {
    if (!this.getSettings().sound) return;
    this._ui('click', clickUrl, 700);
  }

  /** Close (X) button pop. */
  close() {
    if (!this.getSettings().sound) return;
    this._ui('close', closeUrl, 500);
  }

  _ui(key, url, beepHz) {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - (this._lastTap || 0) < 80) return; // explicit tap() + global button listener = one sound
    this._lastTap = now;
    this._sample(key, url, () => this._tone(beepHz, { dur: 0.05, gain: 0.05 }), false, 0.8);
  }

  // ---- music ----
  /** Gapless BGM via WebAudio buffer loop (an <audio loop> leaves an mp3 gap). */
  _loadBgm() {
    if (this.bgmBuf || this.bgmLoading || this.bgmFailed || !this.ctx) return;
    this.bgmLoading = true;
    fetch(bgmUrl)
      .then((r) => r.arrayBuffer())
      .then((ab) => new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej)))
      .then((buf) => { this.bgmBuf = buf; this.bgmLoading = false; this.syncMusic(); })
      .catch(() => { this.bgmFailed = true; this.bgmLoading = false; this.syncMusic(); });
    document.addEventListener('visibilitychange', () => this.syncMusic());
  }

  syncMusic() {
    const on = !!(this.getSettings().music && this.ctx);
    if (on) this._loadBgm();
    if (!this.bgmFailed) {
      const play = on && !document.hidden && this.bgmBuf;
      if (play && !this.bgmSrc) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.bgmBuf;
        src.loop = true;
        const g = this.ctx.createGain();
        g.gain.value = 0.35;
        src.connect(g).connect(this.master);
        this.bgmGain = g;
        src.start();
        this.bgmSrc = src;
      } else if (!play && this.bgmSrc) {
        try { this.bgmSrc.stop(); } catch { /* already stopped */ }
        this.bgmSrc = null;
        this.bgmGain = null;
      }
      if (this.bgmBuf || on) return; // buffer loading: stay silent, no synth flash
    }
    // fallback: synth loop if the file is unavailable
    if (on && this.bgmFailed && !this.musicTimer) {
      const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 392.0, 329.63, 293.66];
      this.musicTimer = setInterval(() => {
        if (document.hidden) return;
        const f = scale[this.step % scale.length];
        this._tone(f, { dur: 1.6, gain: 0.035 });
        if (this.step % 4 === 0) this._tone(f / 2, { dur: 2.4, gain: 0.03 });
        this.step++;
      }, 1100);
    } else if ((!on || !this.bgmFailed) && this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
