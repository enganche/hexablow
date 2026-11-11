// Praise / combo system: consecutive correct placements (no mistakes) build a streak.
// Each correct drop shows praise text, a particle burst and an exciting sound that grow with the streak.

const TIERS = [
  { min: 1, text: 'Nice!', color: ['#fff6b0', '#ffd24a'], parts: 8, size: 1 },
  { min: 2, text: 'Good!', color: ['#e6ffb0', '#9be04a'], parts: 11, size: 1.05 },
  { min: 3, text: 'Great!', color: ['#d4fff0', '#3fd6a8'], parts: 14, size: 1.15 },
  { min: 4, text: 'Awesome!', color: ['#d6ecff', '#4ea8ff'], parts: 18, size: 1.25 },
  { min: 5, text: 'Amazing!', color: ['#ffe0f4', '#ff58b8'], parts: 24, size: 1.38 },
  { min: 6, text: 'Fantastic!', color: ['#fff0c2', '#ff9a2e'], parts: 30, size: 1.5 },
  { min: 8, text: 'Unstoppable!', color: ['#ffffff', '#ff4d4d'], parts: 40, size: 1.65 },
];
// Time allowed to reach the next streak step before the combo restarts: 10s for 0→1,
// shrinking linearly to 3s for the step into the top tier (and every step after it).
const IDLE_MAX_MS = 10000;
const IDLE_MIN_MS = 3000;
function idleWindow(nextStreak) {
  const top = TIERS[TIERS.length - 1].min;
  const k = Math.min(Math.max(nextStreak - 1, 0) / (top - 1), 1);
  return IDLE_MAX_MS - (IDLE_MAX_MS - IDLE_MIN_MS) * k;
}
const CHAIN_TEXT = { 2: 'Double link!', 3: 'Triple link!' };
const SPARKS = ['★', '✦', '✧', '●'];
const CONFETTI = ['#ff6b8b', '#ffd24a', '#6ee06e', '#4ea8ff', '#c07bff', '#ff9a2e'];

export function tierFor(streak) {
  let t = 0;
  for (let i = 0; i < TIERS.length; i++) if (streak >= TIERS[i].min) t = i;
  return t;
}

export class Praise {
  constructor(stage, audio, getSettings) {
    this.stage = stage;
    this.audio = audio;
    this.getSettings = getSettings;
    this.streak = 0;
    this.idleTimer = null;
    this.layer = document.createElement('div');
    this.layer.id = 'praise-layer';
    stage.appendChild(this.layer);
  }

  /** (Re)start the idle countdown for the next streak step; running out breaks the streak. */
  _armIdle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.streak = 0;
      this.idleTimer = null;
    }, idleWindow(this.streak + 1));
  }

  reset() {
    clearTimeout(this.idleTimer);
    this.streak = 0;
    this.layer.replaceChildren();
  }

  /** a wrong drop breaks the streak */
  miss() {
    clearTimeout(this.idleTimer);
    this.streak = 0;
  }

  /** A correct placement. `pos` = stage-local px of the placed piece centre, `size` = chain length. */
  hit(pos, size, isLast) {
    this.streak++;
    if (isLast) clearTimeout(this.idleTimer);
    else this._armIdle();
    const ti = tierFor(this.streak);
    const tier = TIERS[ti];
    this.audio.praise?.(ti, size);
    if (isLast) return; // the win celebration takes over
    const w = this.stage.clientWidth;
    const x = Math.min(Math.max(pos.x, w * 0.22), w * 0.78);
    const y = Math.max(pos.y - w * 0.12, w * 0.3);
    this._burst(pos.x, pos.y, tier, ti);
    this._text(x, y, tier, ti, size);
    if (ti >= 3) this._flash(ti);
    if (ti >= 4) this._confetti(pos.x, pos.y, 10 + ti * 4);
  }

  _text(x, y, tier, ti, size) {
    const w = this.stage.clientWidth;
    const el = document.createElement('div');
    el.className = 'praise-text';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.fontSize = `${w * 0.062 * tier.size}px`;
    el.style.setProperty('--c1', tier.color[0]);
    el.style.setProperty('--c2', tier.color[1]);
    el.textContent = tier.text;
    const sub = [];
    if (this.streak >= 2) sub.push(`x${this.streak} combo`);
    if (CHAIN_TEXT[size]) sub.push(CHAIN_TEXT[size]);
    if (sub.length) {
      const s = document.createElement('small');
      s.textContent = sub.join(' · ');
      el.appendChild(s);
    }
    this.layer.appendChild(el);
    const tilt = (Math.random() - 0.5) * 10;
    const a = el.animate(
      [
        { transform: `translate(-50%,-50%) scale(0.2) rotate(${tilt - 12}deg)`, opacity: 0 },
        { transform: `translate(-50%,-50%) scale(${1.25 + ti * 0.04}) rotate(${tilt}deg)`, opacity: 1, offset: 0.22 },
        { transform: `translate(-50%,-50%) scale(1) rotate(${tilt}deg)`, opacity: 1, offset: 0.4 },
        { transform: `translate(-50%,-50%) scale(1) rotate(${tilt}deg)`, opacity: 1, offset: 0.78 },
        { transform: `translate(-50%,-${160}%) scale(0.9) rotate(${tilt}deg)`, opacity: 0 },
      ],
      { duration: 1050 + ti * 70, easing: 'cubic-bezier(.2,.9,.3,1)' }
    );
    a.onfinish = () => el.remove();
  }

  _burst(x, y, tier, ti) {
    const w = this.stage.clientWidth;
    // expanding ring
    const ring = document.createElement('div');
    ring.className = 'praise-ring';
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.style.borderColor = tier.color[1];
    ring.style.width = ring.style.height = `${w * 0.16}px`;
    this.layer.appendChild(ring);
    ring.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0.95 },
        { transform: `translate(-50%,-50%) scale(${2.2 + ti * 0.35})`, opacity: 0 },
      ],
      { duration: 520, easing: 'ease-out' }
    ).onfinish = () => ring.remove();
    // star sparks flying outward
    for (let i = 0; i < tier.parts; i++) {
      const p = document.createElement('div');
      p.className = 'praise-spark';
      p.textContent = SPARKS[i % SPARKS.length];
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.style.color = i % 2 ? tier.color[1] : '#fff7c2';
      p.style.fontSize = `${w * (0.03 + Math.random() * 0.03)}px`;
      this.layer.appendChild(p);
      const ang = (i / tier.parts) * Math.PI * 2 + Math.random() * 0.4;
      const dist = w * (0.12 + Math.random() * 0.14 + ti * 0.02);
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist;
      p.animate(
        [
          { transform: 'translate(-50%,-50%) scale(0.4) rotate(0)', opacity: 1 },
          { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(1.1) rotate(${(Math.random() - 0.5) * 360}deg)`, opacity: 1, offset: 0.6 },
          { transform: `translate(calc(-50% + ${dx * 1.15}px),calc(-50% + ${dy * 1.15 + w * 0.05}px)) scale(0.2)`, opacity: 0 },
        ],
        { duration: 600 + Math.random() * 300, easing: 'cubic-bezier(.1,.8,.3,1)' }
      ).onfinish = () => p.remove();
    }
  }

  _confetti(x, y, n) {
    const w = this.stage.clientWidth;
    const h = this.stage.clientHeight;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('div');
      p.className = 'praise-confetti';
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.style.background = CONFETTI[i % CONFETTI.length];
      p.style.width = `${w * 0.018}px`;
      p.style.height = `${w * 0.03}px`;
      this.layer.appendChild(p);
      const dx = (Math.random() - 0.5) * w * 0.9;
      const up = h * (0.1 + Math.random() * 0.2);
      p.animate(
        [
          { transform: 'translate(-50%,-50%) rotate(0)', opacity: 1 },
          { transform: `translate(calc(-50% + ${dx * 0.6}px),calc(-50% - ${up}px)) rotate(${Math.random() * 400}deg)`, opacity: 1, offset: 0.35 },
          { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${h * 0.25}px)) rotate(${Math.random() * 900}deg)`, opacity: 0 },
        ],
        { duration: 1100 + Math.random() * 600, easing: 'cubic-bezier(.2,.6,.4,1)' }
      ).onfinish = () => p.remove();
    }
  }

  _flash(ti) {
    const f = document.createElement('div');
    f.className = 'praise-flash';
    this.layer.appendChild(f);
    f.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 380 + ti * 40, easing: 'ease-out' }).onfinish = () => f.remove();
    if (ti >= 5 && !this.getSettings().reduceMotion) {
      this.stage.animate(
        [{ translate: '0 0' }, { translate: '-5px 3px' }, { translate: '5px -3px' }, { translate: '-3px -2px' }, { translate: '0 0' }],
        { duration: 260 }
      );
    }
  }
}
