// Result-screen artwork (inline SVG, drawn in the Gardendoku candy style).
// winArt: sunburst + laurel + stars + green ribbon.  loseArt: cracked heart + coral ribbon.

const rad = (d) => (d * Math.PI) / 180;
const f1 = (n) => n.toFixed(1);

function starPts(cx, cy, R) {
  return Array.from({ length: 10 }, (_, i) => {
    const a = rad(-90 + i * 36);
    const r = i % 2 ? R * 0.52 : R;
    return `${f1(cx + Math.cos(a) * r)},${f1(cy + Math.sin(a) * r)}`;
  }).join(' ');
}

function star(cx, cy, R, tilt, on, i) {
  const fill = on ? 'url(#ra-gold)' : 'url(#ra-grey)';
  const edge = on ? '#d6891a' : '#b4a88f';
  return `<g transform="rotate(${tilt} ${cx} ${cy})"><g class="ra-star" style="--i:${i};transform-origin:${cx}px ${cy}px">
    <polygon points="${starPts(cx, cy + 4, R)}" fill="${edge}" stroke="${edge}" stroke-width="12" stroke-linejoin="round" opacity=".55"/>
    <polygon points="${starPts(cx, cy, R)}" fill="${fill}" stroke="${edge}" stroke-width="8" stroke-linejoin="round"/>
    ${on ? `<path d="M${f1(cx - R * 0.42)} ${f1(cy - R * 0.1)}q${f1(R * 0.1)}-${f1(R * 0.34)} ${f1(R * 0.38)}-${f1(R * 0.42)}" fill="none" stroke="#fffbe0" stroke-width="5" stroke-linecap="round" opacity=".9"/>` : ''}
  </g></g>`;
}

function rays(count, color) {
  let s = '';
  for (let i = 0; i < count; i++) {
    s += `<polygon points="0,0 -13,-172 13,-172" fill="${color}" transform="rotate(${f1((360 / count) * i)})"/>`;
  }
  return s;
}

function laurel(side) {
  // leaves along an arc on one side of the medallion
  let s = '';
  const cx = 200, cy = 132, rr = 128;
  for (let i = 0; i < 8; i++) {
    const deg = 168 + i * 11.5; // 168..248 (left); mirrored for the right
    const a = rad(deg);
    const x = cx + Math.cos(a) * rr * side;
    const y = cy + Math.sin(a) * rr * 0.78;
    const rot = (side < 0 ? deg : 180 - deg) + (side < 0 ? 22 : -22); // along the arc, tipped outward
    s += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="9" ry="19" transform="rotate(${f1(rot)} ${f1(x)} ${f1(y)})" fill="${i % 2 ? '#7bd650' : '#5cc044'}" stroke="#2f7d2c" stroke-width="3"/>`;
  }
  return s;
}

function ribbon(text, c1, c2, edge, tail, fs) {
  return `
  <g class="ra-ribbon">
    <path d="M28 186h60v54H28l22-27z" fill="${tail}" stroke="${edge}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M372 186h-60v54h60l-22-27z" fill="${tail}" stroke="${edge}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M72 232l16 12v-20z M328 232l-16 12v-20z" fill="${edge}" opacity=".75"/>
    <path d="M62 170Q200 156 338 170V228Q200 242 62 228Z" fill="url(#ra-rib)" stroke="${edge}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M70 178Q200 165 330 178" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".38"/>
    <text x="200" y="213" text-anchor="middle" font-family="Nunito, ui-rounded, system-ui, sans-serif" font-weight="800" font-size="${fs}" fill="#fffde6" stroke="${edge}" stroke-width="7" paint-order="stroke" stroke-linejoin="round" textLength="236" lengthAdjust="spacingAndGlyphs">${text}</text>
  </g>
  <defs><linearGradient id="ra-rib" x2="0" y2="1"><stop stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>`;
}

const DEFS = `<defs>
  <linearGradient id="ra-gold" x2="0" y2="1"><stop stop-color="#fff4ac"/><stop offset=".5" stop-color="#ffd54a"/><stop offset="1" stop-color="#f5a21f"/></linearGradient>
  <linearGradient id="ra-grey" x2="0" y2="1"><stop stop-color="#f1ead9"/><stop offset="1" stop-color="#cfc4ac"/></linearGradient>
  <radialGradient id="ra-glow"><stop stop-color="#fffbd0" stop-opacity=".95"/><stop offset=".6" stop-color="#fff2a0" stop-opacity=".35"/><stop offset="1" stop-color="#fff2a0" stop-opacity="0"/></radialGradient>
</defs>`;

/** @param {{title:string, stars:number}} o */
export function winArt({ title, stars }) {
  return `<svg viewBox="0 0 400 260" class="ra" role="img" aria-label="${title}">
  ${DEFS}
  <g transform="translate(200 120)">
    <circle r="150" fill="url(#ra-glow)"/>
    <g class="ra-rays">${rays(14, 'rgba(255,248,190,.55)')}</g>
  </g>
  <g class="ra-laurel">${laurel(-1)}${laurel(1)}</g>
  ${star(126, 118, 34, -16, stars >= 1, 0)}
  ${star(274, 118, 34, 16, stars >= 3, 2)}
  ${star(200, 92, 48, 0, stars >= 2, 1)}
  ${ribbon(title, '#8be04e', '#4fb336', '#2c7338', '#3e9a32', 31)}
</svg>`;
}

export function loseArt({ title }) {
  const heart = 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 5 6 5c2.1 0 3.6 1.1 4.5 2.6h3C14.4 6.1 15.9 5 18 5c3.3 0 5.1 3.4 3.6 6.8C19.5 16.4 12 21 12 21z';
  // zig-zag crack through the middle (heart space, 0..24)
  const left = 'M-2 -2H12.6L11 6.5 14 10 11.5 14 13.4 18 11 26H-2Z';
  const right = 'M26 -2H12.6L11 6.5 14 10 11.5 14 13.4 18 11 26H26Z';
  const half = (clip, tx, ty, rot, cls) => `<g transform="translate(${tx} ${ty}) rotate(${rot} 200 110)"><g class="${cls}">
    <g transform="translate(130 22) scale(5.8)" clip-path="url(#${clip})">
      <path d="${heart}" fill="#f0716d" stroke="#fff" stroke-width=".7" stroke-linejoin="round"/>
      <path d="M5.2 8.4c.5-1.5 1.8-2 3-1.6" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".55"/>
    </g></g></g>`;
  return `<svg viewBox="0 0 400 260" class="ra ra-lose" role="img" aria-label="${title}">
  ${DEFS}
  <defs>
    <clipPath id="ra-cl"><path d="${left}"/></clipPath>
    <clipPath id="ra-cr"><path d="${right}"/></clipPath>
  </defs>
  <g transform="translate(200 120)">
    <circle r="140" fill="url(#ra-glow)" opacity=".6"/>
    <g class="ra-rays">${rays(12, 'rgba(255,214,206,.4)')}</g>
  </g>
  ${half('ra-cl', -9, 2, -7, 'ra-half l')}
  ${half('ra-cr', 9, 6, 6, 'ra-half r')}
  <g fill="#fff" opacity=".9"><circle cx="200" cy="72" r="4"/><circle cx="211" cy="104" r="3"/><circle cx="188" cy="136" r="3.5"/></g>
  ${ribbon(title, '#ff8c85', '#e2554f', '#a8332f', '#c9433e', 31)}
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
