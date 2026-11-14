// Result-screen artwork (inline SVG, drawn in the Gardendoku candy style).
// winArt: soft rays + leafy sprigs + kawaii stars + green ribbon.  loseArt: sad cracked heart + purple ribbon.

import starOn from './assets/star-on.webp';
import starOff from './assets/star-off.webp';
import winBanner from './assets/win-banner.webp';

const rad = (d) => (d * Math.PI) / 180;
const f1 = (n) => n.toFixed(1);

// ---- cute kit: chubby rounded shapes, kawaii faces, soft pastel rays ----
const FACE = '#8a4a12';

/** A result star: the candy star artwork (gold when earned, grey and asleep when not), drop-shadowed. */
function star(cx, cy, R, tilt, on, i) {
  const S = R * 2.5; // the artwork has a little padding around the star itself
  return `<g transform="rotate(${tilt} ${cx} ${cy})"><g class="ra-star" style="--i:${i};transform-origin:${cx}px ${cy}px">
    <image href="${on ? starOn : starOff}" x="${f1(cx - S / 2)}" y="${f1(cy - S / 2)}" width="${f1(S)}" height="${f1(S)}" style="filter:drop-shadow(0 4px 0 ${on ? 'rgba(224,142,27,.45)' : 'rgba(150,140,115,.4)'})"/>
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

function flower(x, y, r, petal, edge, rot = 0) {
  let s = `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${rot})">`;
  for (let i = 0; i < 5; i++) {
    s += `<ellipse cx="0" cy="${f1(-r * 0.78)}" rx="${f1(r * 0.5)}" ry="${f1(r * 0.62)}" fill="${petal}" stroke="${edge}" stroke-width="2" transform="rotate(${i * 72})"/>`;
  }
  return s + `<circle r="${f1(r * 0.42)}" fill="#ffe27b" stroke="#e0a928" stroke-width="2"/><circle cx="${f1(-r * 0.12)}" cy="${f1(-r * 0.14)}" r="${f1(r * 0.12)}" fill="#fff" opacity=".8"/></g>`;
}

/** One lush leafy branch hugging an arc over the stars (left side); mirrored for the right. */
function sprig(side) {
  const cx = 200, cy = 136, r = 130;
  const pt = (deg) => [cx + r * Math.cos(rad(deg)), cy - r * Math.sin(rad(deg))];
  const [x0, y0] = pt(208), [x2, y2] = pt(96);
  let inner = `<path d="M${f1(x0)} ${f1(y0)}A${r} ${r} 0 0 1 ${f1(x2)} ${f1(y2)}" fill="none" stroke="#2f7a3c" stroke-width="5" stroke-linecap="round"/>`;
  const greens = ['#7fdc54', '#5cc447', '#9be866'];
  let k = 0;
  for (let deg = 204; deg >= 98; deg -= 9) {
    const [x, y] = pt(deg);
    const len = 36 - (204 - deg) * 0.12;
    const rot = 180 - deg;
    inner += leaf(x, y, rot - 42, len, greens[k % 3]);
    inner += leaf(x, y, rot + 42, len * 0.9, greens[(k + 1) % 3]);
    k++;
  }
  const [fx, fy] = pt(172), [gx, gy] = pt(126), [bx, by] = pt(190), [dx, dy] = pt(110);
  inner += flower(fx - 6, fy - 4, 12, '#ffb3cc', '#e0709a', 10);
  inner += flower(gx - 4, gy - 8, 9.5, '#fff', '#d9cfb4', -8);
  inner += `<circle cx="${f1(bx - 4)}" cy="${f1(by - 14)}" r="4.5" fill="#ff9ec2" stroke="#e0709a" stroke-width="2"/><circle cx="${f1(dx)}" cy="${f1(dy - 12)}" r="4" fill="#ffd84a" stroke="#e0a928" stroke-width="2"/>`;
  return side < 0 ? inner : `<g transform="translate(400 0) scale(-1 1)">${inner}</g>`;
}

/** A drooping, wilted flower for the lose screen. */
function wilt(x, y, flip) {
  return `<g transform="translate(${x} ${y}) scale(${flip ? -1 : 1} 1)">
    <path d="M0 40C0 18 4 4 22 -2" fill="none" stroke="#6aa04a" stroke-width="5" stroke-linecap="round"/>
    <path d="M2 30C-12 26-16 16-14 8C-2 10 4 20 2 30Z" fill="#8cc06a" stroke="#5e8f45" stroke-width="2.5" stroke-linejoin="round"/>
    <g transform="translate(24 4) rotate(100)">${[0, 1, 2, 3, 4].map((i) => `<ellipse cx="0" cy="-9" rx="5.5" ry="7.5" fill="#e6c9d6" stroke="#b996a9" stroke-width="2" transform="rotate(${i * 72})"/>`).join('')}<circle r="5" fill="#e8d28a" stroke="#bda55a" stroke-width="2"/></g>
  </g>`;
}

function ribbon(text, c1, c2, edge, tail, fs) {
  return `
  <g class="ra-ribbon">
    <path d="M18 184H70V244H18L40 214Z" fill="${tail}" stroke="${edge}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M382 184H330V244H382L360 214Z" fill="${tail}" stroke="${edge}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M46 228L70 232V246Z" fill="${edge}" stroke="${edge}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M354 228L330 232V246Z" fill="${edge}" stroke="${edge}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M70 232V246L58 238Z" fill="#000" opacity=".18"/>
    <path d="M330 232V246L342 238Z" fill="#000" opacity=".18"/>
    <path d="M58 168Q200 154 342 168Q352 169 352 180V226Q352 237 342 238Q200 252 58 238Q48 237 48 226V180Q48 169 58 168Z" fill="url(#ra-rib)" stroke="${edge}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M62 177Q200 164 338 177" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".4"/>
    <path d="M66 230Q200 243 334 230" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="1 8" opacity=".55"/>
    <circle cx="66" cy="203" r="4" fill="#fff" opacity=".75"/><circle cx="334" cy="203" r="4" fill="#fff" opacity=".75"/>
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
  // the banner artwork has "Level Complete!" baked in; any other title (e.g. the final level) keeps the drawn ribbon
  const baked = title === 'Level Complete!';
  const cy = baked ? 96 : 118;
  const sideY = baked ? 114 : 122, sideX = baked ? 140 : 122, sideR = baked ? 32 : 36;
  const topY = baked ? 84 : 92, topR = baked ? 50 : 54;
  return `<svg viewBox="${baked ? '0 -40 400 300' : '0 0 400 260'}" class="ra" role="img" aria-label="${title}">
  ${DEFS}
  <g transform="translate(200 ${cy})">
    <circle r="150" fill="url(#ra-glow)"/>
    <g class="ra-rays">${rays(10, 'rgba(255,250,200,.4)')}</g>
  </g>
  <circle cx="200" cy="${cy}" r="92" fill="#fffbe0" opacity=".45"/>
  <circle cx="200" cy="${cy}" r="92" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round" opacity=".8"/>
  <g>${sparkle(52, 70, 1, 0)}${sparkle(352, 48, 1.1, 0.4)}${sparkle(330, 128, 0.7, 0.8)}${sparkle(102, 28, 0.8, 1.2)}${sparkle(300, 20, 0.6, 0.2)}</g>
  ${baked ? `<image class="ra-banner" href="${winBanner}" x="0" y="-40" width="400" height="300"/>` : `<g class="ra-laurel">${sprig(-1)}${sprig(1)}</g>`}
  ${star(sideX, sideY, sideR, -14, stars >= 1, 0)}
  ${star(400 - sideX, sideY, sideR, 14, stars >= 3, 2)}
  ${star(200, topY, topR, 0, stars >= 2, 1)}
  ${baked ? '' : ribbon(title, '#9ae05f', '#46a653', '#2d6f45', '#3f8a52', 29)}
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
  ${wilt(62, 112, false)}${wilt(338, 112, true)}
  ${half('ra-cl', -9, 2, -7, 'ra-half l', -1)}
  ${half('ra-cr', 9, 6, 6, 'ra-half r', 1)}
  <g fill="#fff" opacity=".9"><circle cx="150" cy="52" r="3.5"/><path d="M118 70q-4 8 0 11q4-3 0-11ZM284 40q-4 8 0 11q4-3 0-11Z" fill="#cfe9ff" stroke="#8cc4ee" stroke-width="1.6"/><circle cx="255" cy="58" r="3"/><circle cx="278" cy="96" r="2.6"/></g>
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
