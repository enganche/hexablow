// Win fireworks: rockets launch from the two bottom corners of the stage, arc inward and burst into sparks.
// Plays during the tile-sort win animation and finishes right before the result sheet / garden appear.

export const FIREWORK_MS = 1600; // total run time; game.js waits this long before showing the result
const COLORS = ['#ffd54a', '#ff8fb8', '#7bd650', '#6fc9ee', '#ff9d32', '#c58bff', '#ffffff'];
const GRAVITY = 0.00115; // px / ms^2 (scaled by stage height)

let canvas = null;
let raf = 0;
let endTimer = 0;

export function stopFireworks() {
  cancelAnimationFrame(raf);
  clearTimeout(endTimer);
  raf = 0;
  canvas?.remove();
  canvas = null;
}

export function playFireworks(stage, ms = FIREWORK_MS) {
  stopFireworks();
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas = document.createElement('canvas');
  canvas.id = 'fireworks-layer';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const g = GRAVITY * (h / 800);
  const rockets = [];
  const sparks = [];
  const flashes = [];
  const rand = (a, b) => a + Math.random() * (b - a);
  const S = w / 400; // everything scales with the stage width

  // rockets: 5 volleys, two per corner each (one flatter, one steeper); early enough that the last burst can fade
  [0, 0.12, 0.24, 0.36].forEach((f, i) => {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 1; k++) {
        rockets.push({ at: f * ms + rand(0, 90) + k * 60 + (side > 0 ? 25 : 0), side, launched: false, big: i >= 2 });
      }
    }
  });

  const launch = (r) => {
    const fromX = r.side < 0 ? w * 0.03 : w * 0.97;
    const targetX = w * rand(0.18, 0.82);
    const targetY = h * rand(0.12, 0.46);
    const flight = rand(330, 440);
    r.x = fromX;
    r.y = h + 4;
    // ballistic: reach (targetX, targetY) at t = flight
    r.vx = (targetX - fromX) / flight;
    r.vy = (targetY - r.y - 0.5 * g * flight * flight) / flight;
    r.life = flight;
    r.t = 0;
    r.color = COLORS[(Math.random() * COLORS.length) | 0];
    r.launched = true;
  };

  const ring = (x, y, n, speed, color, room, o = {}) => {
    const off = rand(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2 + rand(-0.05, 0.05);
      const sp = speed * rand(0.8, 1.1);
      sparks.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0,
        life: Math.min(rand(650, 1000), room), size: rand(2.2, 3.8) * S * (o.size || 1),
        color: Math.random() < 0.12 ? '#fff6d0' : color, drag: o.drag || 0.982, grav: o.grav ?? 0.3,
      });
    }
  };

  const burst = (x, y, color, t, big) => {
    const room = Math.max(240, ms - t - 40); // every spark has faded by the time the result appears
    const k = big ? 1.25 : 1;
    ring(x, y, Math.round(44 * k), 0.5 * S * k, color, room);                                   // wide outer ring
    ring(x, y, Math.round(22 * k), 0.3 * S * k, COLORS[(Math.random() * COLORS.length) | 0], room, { size: 0.9 }); // inner ring, other colour
    ring(x, y, 10, 0.16 * S, '#fff3b0', room, { size: 0.8, drag: 0.97 });                        // white core
    for (let i = 0; i < 8; i++) {                                                               // falling glitter
      ring(x, y, 1, rand(0.05, 0.45) * S, '#ffe9a0', room, { size: 0.55, grav: 0.9, drag: 0.975 });
    }
    flashes.push({ x, y, age: 0, life: 220, r: (big ? 120 : 90) * S, color });
  };

  const t0 = performance.now();
  let last = t0;
  const frame = (now) => {
    const t = now - t0;
    const dt = Math.min(now - last, 40);
    last = now;
    // fade the previous frame instead of clearing it: sparks leave glowing trails
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over'; // additive blending blows out to white on the light backdrop

    for (const r of rockets) {
      if (!r.launched && t >= r.at) launch(r);
      if (!r.launched || r.done) continue;
      r.t += dt;
      r.vy += g * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      ctx.fillStyle = r.color;
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 7 * S, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 3.4 * S, 0, Math.PI * 2);
      ctx.fill();
      if (r.t >= r.life) {
        r.done = true;
        burst(r.x, r.y, r.color, t, r.big);
      }
    }

    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.age += dt;
      if (f.age >= f.life) { flashes.splice(i, 1); continue; }
      const k = 1 - f.age / f.life;
      const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (1.2 - 0.5 * k));
      gr.addColorStop(0, f.color);
      gr.addColorStop(0.3, f.color);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = 0.18 * k;
      ctx.fillStyle = gr;
      ctx.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.age += dt;
      if (s.age >= s.life) { sparks.splice(i, 1); continue; }
      s.vx *= s.drag;
      s.vy = s.vy * s.drag + g * s.grav * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const k = 1 - s.age / s.life;
      const rr = s.size * (0.4 + k * 0.6);
      ctx.fillStyle = s.color;
      ctx.globalAlpha = k * 0.1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, rr * 2.6, 0, Math.PI * 2); // soft glow
      ctx.fill();
      ctx.globalAlpha = k;
      ctx.beginPath();
      ctx.arc(s.x, s.y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (t < ms) raf = requestAnimationFrame(frame);
    else stopFireworks();
  };
  raf = requestAnimationFrame(frame);
  endTimer = setTimeout(stopFireworks, ms + 200); // safety net if rAF is throttled (hidden tab)
}
