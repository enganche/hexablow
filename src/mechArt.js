// Small SVG art for the mechanic intro screens and the win-screen unlock bar.
// Normal tiles use the equipped Garden Set vars (--tile-a/-b/-rim/-base); mechanic colours keep their meaning.
const hexPts = (cx, cy, r) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

const hex = (cx, cy, r, fill, stroke, base) =>
  `<polygon points="${hexPts(cx, cy + 4, r)}" fill="${base}"/><polygon points="${hexPts(cx, cy, r)}" fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/>`;

const text = (x, y, s, fill, size = 26) =>
  `<text x="${x}" y="${y + size * 0.36}" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="900" font-size="${size}" fill="${fill}">${s}</text>`;

const honey = (cx, cy, r, n) =>
  hex(cx, cy, r, 'var(--tile-a,#ffdb65)', 'var(--tile-rim,#ffe3a0)', 'var(--tile-base,#d99a36)') + text(cx, cy, n, '#78521d', r * 0.95);

const swirl = (cx, cy, s, col) => {
  let d = '';
  for (let t = 0; t <= 1.001; t += 0.05) {
    const a = t * Math.PI * 4.2, rr = (2 + t * 13) * s;
    d += `${t === 0 ? 'M' : 'L'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
  }
  return `<path d="${d}" fill="none" stroke="#fff" stroke-width="${5 * s}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${3 * s}" stroke-linecap="round"/>`;
};

/** Portal end: two short chevrons in the pair colour, pointing down for the entrance, up for the exit. */
const portalEnd = (cx, cy, r, col, isIn) => {
  const k = r / 118, sy = isIn ? 1 : -1;
  const chev = (y, w, c) => `<polyline points="${[[-52, y - 22], [0, y + 26], [52, y - 22]].map(([x, yy]) => `${(cx + x * k).toFixed(1)},${(cy + yy * sy * k).toFixed(1)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="${w * k}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".8"/>`;
  return [-34, 30].map((y) => chev(y, 46, '#fff')).join('') + [-34, 30].map((y) => chev(y, 26, col)).join('');
};

const padlock = (cx, cy, s, label) =>
  `<path d="M${cx - 8 * s} ${cy - 3 * s}v-6${s > 1 ? '' : ''}a${8 * s} ${8 * s} 0 0 1 ${16 * s} 0v6" fill="none" stroke="#d7cfbf" stroke-width="${3.4 * s}" stroke-linecap="round"/>` +
  `<rect x="${cx - 12 * s}" y="${cy - 4 * s}" width="${24 * s}" height="${19 * s}" rx="${4 * s}" fill="#6e5a43" stroke="#4a3c2c" stroke-width="${1.6 * s}"/>` +
  (label == null ? `<circle cx="${cx}" cy="${cy + 5 * s}" r="${2.6 * s}" fill="#fff6dc"/>` : text(cx, cy + 6 * s, label, '#fff6dc', 13 * s));

const svg = (vb, body) => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;

/** Round icon-size art (viewBox 0 0 48 48). */
export const MECH_ICON = {
  water: svg('0 0 48 48',
    `<polygon points="${hexPts(24, 24, 21)}" fill="#8fd8ea" stroke="#6cc3d9" stroke-width="3" stroke-linejoin="round"/>` +
    '<path d="M11 21q4-5 7 0t7 0 7 0 5 0M13 29q4-5 7 0t7 0 7 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>'),
  mystery: svg('0 0 48 48', hex(24, 22, 19, '#b69be8', '#e4d6fa', '#7f62b8') + text(24, 22, '?', '#43286f', 24)),
  portal: svg('0 0 48 48',
    `<polygon points="${hexPts(24, 24, 21)}" fill="#d9f6f3" stroke="#18b5ae" stroke-width="3" stroke-linejoin="round"/>` + swirl(24, 24, 1.15, '#18b5ae')),
  lock: svg('0 0 48 48', hex(24, 22, 19, '#cfc4ad', '#efe7d4', '#8d7e63') + padlock(24, 17, 0.9, null)),
};

/** Wide demo shown on the intro screen (viewBox 0 0 260 96). */
export const MECH_DEMO = {
  water: svg('0 0 260 96',
    honey(46, 44, 30, 4) + hex(130, 44, 30, '#8fd8ea', '#6cc3d9', '#4aa7bf') +
    '<path d="M112 44q5-6 9 0t9 0 9 0 5 0" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>' +
    '<ellipse cx="146" cy="52" rx="9" ry="6" fill="#3fa63f"/><circle cx="118" cy="36" r="4.5" fill="#f47fae"/>' +
    honey(214, 44, 30, 5) +
    '<path d="M76 44q8-26 54-26t54 26" fill="none" stroke="#3d7d3a" stroke-opacity=".55" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 9"/>'),
  mystery: svg('0 0 260 96',
    honey(46, 44, 30, 4) + hex(130, 44, 30, '#b69be8', '#e4d6fa', '#7f62b8') + text(130, 44, '?', '#43286f', 34) + honey(214, 44, 30, 6) +
    '<path d="M76 44h24M160 44h24" stroke="#3d7d3a" stroke-opacity=".55" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 9"/>'),
  portal: svg('0 0 260 96',
    honey(46, 56, 30, 5) + portalEnd(78, 24, 22, '#18b5ae', true) +
    hex(130, 56, 30, '#8fd8ea', '#6cc3d9', '#4aa7bf') + '<path d="M112 56q5-6 9 0t9 0 9 0 5 0" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>' +
    honey(214, 56, 30, 6) + portalEnd(182, 24, 22, '#18b5ae', false) +
    '<path d="M104 12Q130 -2 154 12" fill="none" stroke="#18b5ae" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="1 8"/>' +
    '<path d="M147 5l8 7-11 4" fill="none" stroke="#18b5ae" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  lock: svg('0 0 260 96',
    honey(40, 44, 24, 1) + honey(86, 44, 24, 2) + honey(132, 44, 24, 3) +
    '<path d="M162 44h14m-5-6 6 6-6 6" fill="none" stroke="#3d7d3a" stroke-opacity=".7" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>' +
    hex(214, 44, 30, '#cfc4ad', '#efe7d4', '#8d7e63') + padlock(214, 36, 1.15, 3)),
};
