// Result-screen artwork (inline SVG, drawn in the Gardendoku candy style).
// winArt: soft rays + leafy sprigs + kawaii stars + green ribbon.  loseArt: sad cracked heart + purple ribbon.

const rad = (d) => (d * Math.PI) / 180;
const f1 = (n) => n.toFixed(1);

// ---- cute kit: chubby rounded shapes, kawaii faces, soft pastel rays ----
const FACE = '#8a4a12';

function starPts(cx, cy, R, inner = 0.6) {
  return Array.from({ length: 10 }, (_, i) => {
    const a = rad(-90 + i * 36);
    const r = i % 2 ? R * inner : R;
    return `${f1(cx + Math.cos(a) * r)},${f1(cy + Math.sin(a) * r)}`;
  }).join(' ');
}

function starFace(cx, cy, R, on) {
  const ex = R * 0.27, ey = cy + R * 0.08, er = R * 0.1;
  const eyes = on
    ? `<ellipse cx="${f1(cx - ex)}" cy="${f1(ey)}" rx="${f1(er)}" ry="${f1(er * 1.25)}" fill="${FACE}"/><ellipse cx="${f1(cx + ex)}" cy="${f1(ey)}" rx="${f1(er)}" ry="${f1(er * 1.25)}" fill="${FACE}"/>
       <circle cx="${f1(cx - ex + er * 0.35)}" cy="${f1(ey - er * 0.5)}" r="${f1(er * 0.38)}" fill="#fff"/><circle cx="${f1(cx + ex + er * 0.35)}" cy="${f1(ey - er * 0.5)}" r="${f1(er * 0.38)}" fill="#fff"/>
       <path d="M${f1(cx - R * 0.13)} ${f1(cy + R * 0.28)}q${f1(R * 0.13)} ${f1(R * 0.16)} ${f1(R * 0.26)} 0" fill="#e8665d" stroke="${FACE}" stroke-width="${f1(R * 0.06)}" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M${f1(cx - ex - er)} ${f1(ey)}q${f1(er)} ${f1(er)} ${f1(er * 2)} 0M${f1(cx + ex - er)} ${f1(ey)}q${f1(er)} ${f1(er)} ${f1(er * 2)} 0" fill="none" stroke="#9a8d72" stroke-width="${f1(R * 0.07)}" stroke-linecap="round"/>
       <circle cx="${f1(cx)}" cy="${f1(cy + R * 0.3)}" r="${f1(R * 0.05)}" fill="#9a8d72"/>`;
  const blush = on ? '#ff8fa8' : '#e3b9a8';
  return `${eyes}<ellipse cx="${f1(cx - R * 0.46)}" cy="${f1(cy + R * 0.24)}" rx="${f1(R * 0.12)}" ry="${f1(R * 0.08)}" fill="${blush}" opacity=".7"/><ellipse cx="${f1(cx + R * 0.46)}" cy="${f1(cy + R * 0.24)}" rx="${f1(R * 0.12)}" ry="${f1(R * 0.08)}" fill="${blush}" opacity=".7"/>`;
}

function star(cx, cy, R, tilt, on, i) {
  const fill = on ? 'url(#ra-gold)' : 'url(#ra-grey)';
  const edge = on ? '#e08e1b' : '#bdb198';
  return `<g transform="rotate(${tilt} ${cx} ${cy})"><g class="ra-star" style="--i:${i};transform-origin:${cx}px ${cy}px">
    <polygon points="${starPts(cx, cy + 5, R)}" fill="${edge}" stroke="${edge}" stroke-width="14" stroke-linejoin="round" opacity=".5"/>
    <polygon points="${starPts(cx, cy, R)}" fill="${fill}" stroke="${edge}" stroke-width="9" stroke-linejoin="round"/>
    ${on ? `<path d="M${f1(cx - R * 0.5)} ${f1(cy - R * 0.2)}q${f1(R * 0.08)}-${f1(R * 0.3)} ${f1(R * 0.34)}-${f1(R * 0.4)}" fill="none" stroke="#fffbe6" stroke-width="${f1(R * 0.1)}" stroke-linecap="round" opacity=".95"/>` : ''}
    ${starFace(cx, cy, R, on)}
  </g></g>`;
}

function rays(count, color) {
  // soft, wide wedges that fade out towards the edge
  let s = '';
  for (let i = 0; i < count; i++) {
    s += `<polygon points="0,0 -26,-176 26,-176" fill="${color}" transform="rotate(${f1((360 / count) * i)})"/>`;
  }
  return s;
}

function leaf(x, y, rot, len, fill) {
  const w = len * 0.42;
  return `<path d="M0 0C${f1(w)} ${f1(-len * 0.25)} ${f1(w)} ${f1(-len * 0.8)} 0 ${f1(-len)}C${f1(-w)} ${f1(-len * 0.8)} ${f1(-w)} ${f1(-len * 0.25)} 0 0Z" transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)})" fill="${fill}" stroke="#3a8a3a" stroke-width="3" stroke-linejoin="round"/>
  <path d="M0 -3V${f1(-len * 0.7)}" transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)})" stroke="#3a8a3a" stroke-width="2" stroke-linecap="round" opacity=".45"/>`;
}

/** A curved leafy sprig sweeping up the left side; mirrored for the right. */
function sprig(side) {
  const g = '#8fe05a', g2 = '#6bcf4a';
  const inner = `<path d="M92 196C58 170 50 120 78 62" fill="none" stroke="#3a8a3a" stroke-width="5" stroke-linecap="round"/>
    ${leaf(83, 182, -60, 30, g2)}${leaf(69, 156, 62, 30, g)}${leaf(60, 128, -64, 29, g2)}${leaf(58, 100, 58, 28, g)}${leaf(66, 76, -50, 26, g2)}${leaf(78, 60, 8, 24, g)}
    <circle cx="48" cy="150" r="7" fill="#ffb3cc" stroke="#e0709a" stroke-width="3"/><circle cx="48" cy="150" r="2.6" fill="#ffe27b"/>
    <circle cx="94" cy="104" r="6" fill="#fff" stroke="#d7cfb9" stroke-width="3"/><circle cx="94" cy="104" r="2.4" fill="#ffd84a"/>`;
  return side < 0 ? inner : `<g transform="translate(400 0) scale(-1 1)">${inner}</g>`;
}

function ribbon(text, c1, c2, edge, tail, fs) {
  return `
  <g class="ra-ribbon">
    <path d="M18 184H70V244H18L40 214Z" fill="${tail}" stroke="${edge}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M382 184H330V244H382L360 214Z" fill="${tail}" stroke="${edge}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M46 228L70 232V246Z" fill="${edge}" stroke="${edge}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M354 228L330 232V246Z" fill="${edge}" stroke="${edge}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M58 168Q200 154 342 168Q352 169 352 180V226Q352 237 342 238Q200 252 58 238Q48 237 48 226V180Q48 169 58 168Z" fill="url(#ra-rib)" stroke="${edge}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M62 177Q200 164 338 177" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".4"/>
    <path d="M66 230Q200 243 334 230" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="1 8" opacity=".55"/>
    <text x="200" y="215" text-anchor="middle" font-family="Nunito, ui-rounded, system-ui, sans-serif" font-weight="900" font-size="${fs}" fill="#fffef0" stroke="${edge}" stroke-width="8" paint-order="stroke" stroke-linejoin="round" >${text}</text>
  </g>
  <defs><linearGradient id="ra-rib" x2="0" y2="1"><stop stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>`;
}

function sparkle(x, y, s, delay) {
  return `<path class="ra-sparkle" style="animation-delay:${delay}s" transform="translate(${x} ${y}) scale(${s})" d="M0 -12Q2 -2 12 0Q2 2 0 12Q-2 2 -12 0Q-2 -2 0 -12Z" fill="#fffbe0" stroke="#f0c75a" stroke-width="1.6" stroke-linejoin="round"/>`;
}

const DEFS = `<defs>
  <linearGradient id="ra-gold" x2="0" y2="1"><stop stop-color="#fff7b8"/><stop offset=".45" stop-color="#ffe055"/><stop offset="1" stop-color="#ffb62e"/></linearGradient>
  <linearGradient id="ra-grey" x2="0" y2="1"><stop stop-color="#f6f0e2"/><stop offset="1" stop-color="#d6ccb6"/></linearGradient>
  <linearGradient id="ra-heart" x2="0" y2="1"><stop stop-color="#ff9a92"/><stop offset="1" stop-color="#ec5c5c"/></linearGradient>
  <radialGradient id="ra-glow"><stop stop-color="#fffbd0" stop-opacity=".9"/><stop offset=".6" stop-color="#fff2a0" stop-opacity=".3"/><stop offset="1" stop-color="#fff2a0" stop-opacity="0"/></radialGradient>
</defs>`;

/** @param {{title:string, stars:number}} o */
export function winArt({ title, stars }) {
  return `<svg viewBox="0 0 400 260" class="ra" role="img" aria-label="${title}">
  ${DEFS}
  <g transform="translate(200 118)">
    <circle r="150" fill="url(#ra-glow)"/>
    <g class="ra-rays">${rays(10, 'rgba(255,250,200,.4)')}</g>
  </g>
  <g>${sparkle(52, 70, 1, 0)}${sparkle(352, 48, 1.1, 0.4)}${sparkle(330, 128, 0.7, 0.8)}${sparkle(102, 28, 0.8, 1.2)}${sparkle(300, 20, 0.6, 0.2)}</g>
  <g class="ra-laurel">${sprig(-1)}${sprig(1)}</g>
  ${star(122, 122, 36, -14, stars >= 1, 0)}
  ${star(278, 122, 36, 14, stars >= 3, 2)}
  ${star(200, 92, 54, 0, stars >= 2, 1)}
  ${ribbon(title, '#9ae05f', '#46a653', '#2d6f45', '#3f8a52', 29)}
</svg>`;
}

export function loseArt({ title }) {
  const heart = 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 5 6 5c2.1 0 3.6 1.1 4.5 2.6h3C14.4 6.1 15.9 5 18 5c3.3 0 5.1 3.4 3.6 6.8C19.5 16.4 12 21 12 21z';
  // zig-zag crack through the middle (heart space, 0..24)
  const left = 'M-2 -2H12.6L11 6.5 14 10 11.5 14 13.4 18 11 26H-2Z';
  const right = 'M26 -2H12.6L11 6.5 14 10 11.5 14 13.4 18 11 26H26Z';
  // sad face parts for one half; sx = -1 left / +1 right
  const face = (sx) => {
    const ex = 200 + sx * 30;
    return `<g>
      <ellipse cx="${ex}" cy="98" rx="9" ry="11.5" fill="${FACE}"/>
      <circle cx="${ex + 3}" cy="93" r="3.6" fill="#fff"/><circle cx="${ex - 2.5}" cy="102" r="1.8" fill="#fff"/>
      <path d="M${ex - 12} ${sx < 0 ? 84 : 80}L${ex + 11} ${sx < 0 ? 80 : 84}" stroke="${FACE}" stroke-width="4.5" stroke-linecap="round"/>
      <ellipse cx="${200 + sx * 50}" cy="112" rx="9" ry="5.5" fill="#ff7f8f" opacity=".6"/>
    </g>`;
  };
  const half = (clip, tx, ty, rot, cls, sx) => `<g transform="translate(${tx} ${ty}) rotate(${rot} 200 110)"><g class="${cls}">
    <g transform="translate(130 22) scale(5.8)" clip-path="url(#${clip})">
      <path d="${heart}" fill="url(#ra-heart)" stroke="#fff" stroke-width=".9" stroke-linejoin="round"/>
      <path d="M5 8.6c.5-1.6 1.9-2.2 3.2-1.7" fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".6"/>
    </g>
    ${face(sx)}
    ${sx > 0 ? '<path d="M232 118q-5 9 0 13q5-4 0-13Z" fill="#8fd6ff" stroke="#4aa8e0" stroke-width="2"/>' : ''}
  </g></g>`;
  return `<svg viewBox="0 0 400 260" class="ra ra-lose" role="img" aria-label="${title}">
  ${DEFS}
  <defs>
    <clipPath id="ra-cl"><path d="${left}"/></clipPath>
    <clipPath id="ra-cr"><path d="${right}"/></clipPath>
  </defs>
  <g transform="translate(200 120)">
    <circle r="140" fill="url(#ra-glow)" opacity=".5"/>
    <g class="ra-rays">${rays(10, 'rgba(255,220,214,.3)')}</g>
  </g>
  ${half('ra-cl', -9, 2, -7, 'ra-half l', -1)}
  ${half('ra-cr', 9, 6, 6, 'ra-half r', 1)}
  <g fill="#fff" opacity=".9"><circle cx="150" cy="52" r="3.5"/><circle cx="255" cy="58" r="3"/><circle cx="278" cy="96" r="2.6"/></g>
  ${ribbon(title, '#b9a0dc', '#8a66b8', '#5d4585', '#7a5a9e', 31)}
</svg>`;
}

/** Falling confetti pieces (spawned into `el`). */
export function confetti(el, count = 34) {
  const colors = ['#ffd54a', '#ff8fb8', '#7bd650', '#6fc9ee', '#ff9d32', '#fff'];
  let s = '';
  for (let i = 0; i < count; i++) {
    const c = colors[i % colors.length];
    const w = 6 + Math.random() * 6;
    s += `<i style="left:${f1(Math.random() * 100)}%;width:${f1(w)}px;height:${f1(w * (0.7 + Math.random()))}px;background:${c};` +
      `animation-delay:${f1(Math.random() * 1.6)}s;animation-duration:${f1(2.4 + Math.random() * 1.8)}s;--sway:${f1((Math.random() - 0.5) * 90)}px;--spin:${f1(300 + Math.random() * 500)}deg;border-radius:${Math.random() > 0.6 ? '50%' : '2px'}"></i>`;
  }
  el.innerHTML = s;
}
