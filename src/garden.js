// Garden assets for the win animation: a seamless lawn, flower / grass sprites and a small
// isometric cottage. Everything is drawn procedurally on canvases (no image files).
import * as THREE from 'three';
import { axialToPixel } from './hex.js';

/** Height of a tile's top face above its base, in cell-radius units (shared with game.js). */
export const LIFT = 0.115;

const unitPos = (q, r) => {
  const p = axialToPixel(q, r, 1);
  return { x: p.x, y: -p.y };
};

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- lawn ----------
const HEX_SHAPE = (() => {
  const s = new THREE.Shape();
  for (let k = 0; k < 6; k++) {
    const a = ((30 + 60 * k) * Math.PI) / 180;
    const x = Math.cos(a), y = Math.sin(a);
    if (k === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
})();
const HEX_BASE_GEO = new THREE.ShapeGeometry(HEX_SHAPE);
// Pixel-art lawn: one seamless tile (soft tonal patches + faint speckles, drawn texel by texel)
// sampled in board space, so the pattern flows across neighbouring cells. Linear filtering keeps it soft.
const TEX_N = 128; // texels per tile side
const TEX_UNITS = 3.6; // tile side in cell-radius units
let lawnTex = null;
function lawnTexture() {
  if (lawnTex) return lawnTex;
  const N = TEX_N;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const rnd = mulberry(20261110);
  const wrap = (v) => ((Math.round(v) % N) + N) % N;
  const px = (x, y, col) => {
    g.fillStyle = col;
    g.fillRect(wrap(x), wrap(y), 1, 1);
  };
  // 1) tonal patches: wrapping value noise, quantised to a few greens
  const G = 16;
  const lat = Array.from({ length: G * G }, () => rnd());
  const L = (i, j) => lat[(((j % G) + G) % G) * G + (((i % G) + G) % G)];
  const sm = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  const tones = ['#6ac13a', '#6ec53d', '#72c840', '#76cc43'];
  const cs = N / G;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / cs, v = y / cs, i = Math.floor(u), j = Math.floor(v);
      const fu = sm(u - i), fv = sm(v - j);
      let n = lerp(lerp(L(i, j), L(i + 1, j), fu), lerp(L(i, j + 1), L(i + 1, j + 1), fu), fv);
      n += (rnd() - 0.5) * 0.05;
      px(x, y, tones[Math.max(0, Math.min(3, Math.floor(n * 4)))]);
    }
  }
  // 2) speckles
  for (let k = 0; k < 14; k++) px(rnd() * N, rnd() * N, rnd() < 0.6 ? '#7acd46' : '#76ca43');
  for (let k = 0; k < 8; k++) {
    const x = rnd() * N, y = rnd() * N;
    px(x, y, '#66bc38');
    if (rnd() < 0.5) px(x, y + 1, '#66bc38');
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  lawnTex = tex;
  return tex;
}
const lawnGeoCache = new Map();
function lawnTopGeo(q, r) {
  const k = `${q},${r}`;
  if (lawnGeoCache.has(k)) return lawnGeoCache.get(k);
  const p = unitPos(q, r);
  const V = Array.from({ length: 6 }, (_, i) => {
    const a = ((30 + 60 * i) * Math.PI) / 180;
    return [Math.cos(a), Math.sin(a)];
  });
  const pos = [], uv = [];
  const vert = (P) => {
    pos.push(P[0], P[1], 0);
    uv.push((P[0] + p.x) / TEX_UNITS, (P[1] + p.y) / TEX_UNITS);
  };
  for (let i = 0; i < 6; i++) {
    vert([0, 0]);
    vert(V[i]);
    vert(V[(i + 1) % 6]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  lawnGeoCache.set(k, g);
  return g;
}

/** One lawn cell: dark soil/grass edge underneath, textured grass lifted on top. Fades via its materials. */
const SIDE_DEPTH = 0.3; // thickness of the soil lip, in cell-radius units
const NEIGH = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const sideGeoCache = new Map();
/** Soil faces under the two screen-downward edges of a hex (skipped where another lawn cell sits against them). */
function lawnSideGeo(q, r, hasCell) {
  const faces = [];
  const p = unitPos(q, r);
  // hex corners start at 30deg: the lower-left edge joins corners 210-270, the lower-right edge 270-330
  for (const [a0, a1, shade] of [[210, 270, 0.9], [270, 330, 0.78]]) {
    const mid = ((a0 + a1) / 2) * (Math.PI / 180);
    const nb = NEIGH.reduce((best, [dq, dr]) => {
      const u = unitPos(q + dq, r + dr);
      const score = (u.x - p.x) * Math.cos(mid) + (u.y - p.y) * Math.sin(mid);
      return !best || score > best.score ? { dq, dr, score } : best;
    }, null);
    if (hasCell(q + nb.dq, r + nb.dr)) continue;
    faces.push([a0, a1, shade]);
  }
  const k = faces.map(([a, b, s]) => `${a}${b}${s}`).join('|');
  if (sideGeoCache.has(k)) return sideGeoCache.get(k);
  const pos = [], col = [];
  const c = new THREE.Color();
  const pt = (a) => [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180)];
  for (const [a0, a1, shade] of faces) {
    const A = pt(a0), B = pt(a1);
    const top = (v) => pos.push(v[0], v[1] + LIFT, 0);
    const bot = (v) => pos.push(v[0], v[1] + LIFT - SIDE_DEPTH, 0);
    top(A); bot(A); top(B);
    top(B); bot(A); bot(B);
    const upper = c.set('#b57b43').multiplyScalar(shade).toArray();
    const lower = c.set('#7d4e28').multiplyScalar(shade).toArray();
    col.push(...upper, ...lower, ...upper, ...upper, ...lower, ...lower);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  sideGeoCache.set(k, geo);
  return geo;
}

export function makeLawnCell(q, r, hasCell = () => false) {
  const baseMat = new THREE.MeshBasicMaterial({ color: 0x5cba30, transparent: true, opacity: 0 });
  const sideMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide });
  const topMat = new THREE.MeshBasicMaterial({
    map: lawnTexture(),
    transparent: true,
    opacity: 0,
  });
  const group = new THREE.Group();
  const base = new THREE.Mesh(HEX_BASE_GEO, baseMat);
  base.position.set(0, LIFT, 0.15);
  const side = new THREE.Mesh(lawnSideGeo(q, r, hasCell), sideMat);
  side.position.set(0, 0, 0.2);
  const top = new THREE.Mesh(lawnTopGeo(q, r), topMat);
  top.scale.setScalar(1.006);
  top.position.set(0, LIFT, 0.25);
  group.add(base, side, top);
  return { group, mats: [baseMat, sideMat, topMat] };
}

export function setLawnOpacity(cell, a) {
  const done = a >= 1;
  for (const m of cell.mats) {
    m.opacity = a;
    m.transparent = !done;
  }
  cell.group.visible = a > 0;
}

// ---------- sprites ----------
const spriteGeoCache = new Map();
/** Plane whose origin sits at (ax, ay) of the sprite (fractions from left / bottom). */
export function spriteGeo(w, h, ax, ay) {
  const k = `${w}|${h}|${ax}|${ay}`;
  if (!spriteGeoCache.has(k)) {
    const g = new THREE.PlaneGeometry(w, h);
    g.translate((0.5 - ax) * w, (0.5 - ay) * h, 0);
    spriteGeoCache.set(k, g);
  }
  return spriteGeoCache.get(k);
}

function canvasMat(c) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
}

const PS = 192; // plant canvas size
const P_BASE = PS - 12; // ground contact row
export const PLANT_ANCHOR = { ax: 0.5, ay: 12 / PS };

const FLOWERS = {
  daisy: { petal: '#ffffff', edge: '#cfc7b6', center: '#ffd84a', n: 9, rx: 7.5, ry: 22 },
  pink: { petal: '#ff9fc6', edge: '#d8639a', center: '#ffe27b', n: 5, rx: 15, ry: 20 },
  yellow: { petal: '#ffd84a', edge: '#d99a1c', center: '#ff9a3c', n: 6, rx: 12, ry: 20 },
  blue: { petal: '#a9bcff', edge: '#6b84e3', center: '#fff3b0', n: 5, rx: 14, ry: 19 },
  tulip: {},
};
export const FLOWER_KINDS = Object.keys(FLOWERS);

const plantCache = new Map();
export function plantMaterial(kind) {
  if (plantCache.has(kind)) return plantCache.get(kind);
  const c = document.createElement('canvas');
  c.width = c.height = PS;
  const g = c.getContext('2d');
  g.lineCap = g.lineJoin = 'round';
  const cx = PS / 2;
  // contact shadow
  g.fillStyle = 'rgba(36,96,24,0.28)';
  g.beginPath();
  g.ellipse(cx, P_BASE + 2, kind === 'tuft' ? 34 : 22, 8, 0, 0, Math.PI * 2);
  g.fill();

  if (kind === 'tuft') {
    const blades = [
      [-30, -46, 58, '#4fae35'],
      [-16, -26, 84, '#6ccb45'],
      [-2, 4, 104, '#58b83a'],
      [12, 28, 88, '#7bd650'],
      [28, 48, 62, '#4fae35'],
    ];
    for (const [dx, tip, h, col] of blades) {
      g.beginPath();
      g.moveTo(cx + dx - 8, P_BASE);
      g.quadraticCurveTo(cx + dx - 3, P_BASE - h * 0.62, cx + tip, P_BASE - h);
      g.quadraticCurveTo(cx + dx + 4, P_BASE - h * 0.5, cx + dx + 8, P_BASE);
      g.closePath();
      g.fillStyle = col;
      g.fill();
      g.strokeStyle = '#2f7d2c';
      g.lineWidth = 3;
      g.stroke();
    }
  } else {
    const bx = cx + 8, by = P_BASE - 104;
    // stem
    g.beginPath();
    g.moveTo(cx, P_BASE);
    g.quadraticCurveTo(cx - 6, P_BASE - 52, bx, by + 6);
    g.strokeStyle = '#2f7d2c';
    g.lineWidth = 11;
    g.stroke();
    g.strokeStyle = '#4fb340';
    g.lineWidth = 6;
    g.stroke();
    // leaves
    for (const side of [-1, 1]) {
      g.save();
      g.translate(cx - 2 + side * 3, P_BASE - 30 - (side > 0 ? 12 : 0));
      g.rotate(side * 1.0);
      g.beginPath();
      g.ellipse(0, -16, 9, 21, 0, 0, Math.PI * 2);
      g.fillStyle = '#62c94a';
      g.fill();
      g.strokeStyle = '#2f7d2c';
      g.lineWidth = 3;
      g.stroke();
      g.restore();
    }
    if (kind === 'tulip') {
      g.beginPath();
      g.moveTo(bx - 21, by - 4);
      g.lineTo(bx - 23, by - 30);
      g.quadraticCurveTo(bx - 14, by - 22, bx - 8, by - 36);
      g.quadraticCurveTo(bx, by - 18, bx + 8, by - 36);
      g.quadraticCurveTo(bx + 14, by - 22, bx + 23, by - 30);
      g.lineTo(bx + 21, by - 4);
      g.quadraticCurveTo(bx + 20, by + 18, bx, by + 20);
      g.quadraticCurveTo(bx - 20, by + 18, bx - 21, by - 4);
      g.closePath();
      const gr = g.createLinearGradient(0, by - 36, 0, by + 20);
      gr.addColorStop(0, '#ff8f8f');
      gr.addColorStop(1, '#ee4d63');
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = '#b8344b';
      g.lineWidth = 4;
      g.stroke();
      g.beginPath();
      g.moveTo(bx, by - 18);
      g.lineTo(bx, by + 14);
      g.strokeStyle = 'rgba(184,52,75,0.5)';
      g.lineWidth = 3;
      g.stroke();
    } else {
      const f = FLOWERS[kind];
      for (let i = 0; i < f.n; i++) {
        g.save();
        g.translate(bx, by);
        g.scale(1, 0.84);
        g.rotate((i / f.n) * Math.PI * 2);
        g.beginPath();
        g.ellipse(0, -f.ry * 0.9, f.rx, f.ry, 0, 0, Math.PI * 2);
        g.fillStyle = f.petal;
        g.fill();
        g.strokeStyle = f.edge;
        g.lineWidth = 3.5;
        g.stroke();
        g.restore();
      }
      g.beginPath();
      g.arc(bx, by, 11, 0, Math.PI * 2);
      g.fillStyle = f.center;
      g.fill();
      g.strokeStyle = 'rgba(160,100,20,0.55)';
      g.lineWidth = 3;
      g.stroke();
    }
  }
  const mat = canvasMat(c);
  plantCache.set(kind, mat);
  return mat;
}

// ---------- isometric cottage ----------
const HS = 512; // house canvas size
const H_AX = 256, H_AY = 360; // ground-contact point on the canvas (cell centre)
export const HOUSE_SIZE = 2.3; // plane size in cell radii
export const HOUSE_ANCHOR = { ax: H_AX / HS, ay: 1 - H_AY / HS };
/** How far the sprite reaches above its ground point, in cell radii. */
export const HOUSE_REACH = (H_AY - 56) / HS * HOUSE_SIZE;

let houseMatCache = null;
export function houseMaterial() {
  if (houseMatCache) return houseMatCache;
  const c = document.createElement('canvas');
  c.width = c.height = HS;
  const g = c.getContext('2d');
  g.lineCap = g.lineJoin = 'round';

  const K = 92, CX = H_AX, CY = H_AY;
  const C = K * 0.866, SN = K * 0.5;
  const P = (x, y, z) => [CX + (x - y) * C, CY + (x + y) * SN - z * K];
  const poly = (pts, fill, stroke = '#8a5a2b', lw = 5) => {
    g.beginPath();
    pts.forEach((p, i) => {
      const [px, py] = P(...p);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.closePath();
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = lw;
      g.stroke();
    }
  };
  const a = 1, h = 0.92, rise = 0.78, o = 0.16;
  const ze = h - rise * (o / a);
  const T = 0.07; // roof thickness

  // ground shadow
  g.fillStyle = 'rgba(36,96,24,0.30)';
  g.beginPath();
  const [sx, sy] = P(0.15, 0.15, 0);
  g.ellipse(sx, sy + 6, 168, 70, 0, 0, Math.PI * 2);
  g.fill();

  // stepping stones leading from the door
  g.fillStyle = '#e8dcc2';
  g.strokeStyle = '#b9a67f';
  g.lineWidth = 3;
  [[-0.35, 1.38], [-0.35, 1.78], [-0.35, 2.16]].forEach(([x, y], i) => {
    const [px, py] = P(x, y, 0);
    g.beginPath();
    g.ellipse(px, py, 22 - i * 2, 11 - i, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  });

  // walls
  poly([[-a, a, 0], [a, a, 0], [a, a, h], [-a, a, h]], '#fff1cf'); // long wall (lit)
  poly([[a, a, 0], [a, -a, 0], [a, -a, h], [a, 0, h + rise], [a, a, h]], '#f0d49b'); // gable wall (shade)
  // timber base line
  poly([[-a, a, 0], [a, a, 0], [a, a, 0.14], [-a, a, 0.14]], '#d9b878', null);
  poly([[a, a, 0], [a, -a, 0], [a, -a, 0.14], [a, a, 0.14]], '#c9a566', null);

  // door (long wall)
  poly([[-0.62, a, 0], [-0.1, a, 0], [-0.1, a, 0.66], [-0.36, a, 0.78], [-0.62, a, 0.66]], '#a56a35');
  const [kx, ky] = P(-0.2, a, 0.34);
  g.fillStyle = '#ffd84a';
  g.beginPath();
  g.arc(kx, ky, 4.5, 0, Math.PI * 2);
  g.fill();
  // window (long wall)
  poly([[0.3, a, 0.3], [0.8, a, 0.3], [0.8, a, 0.72], [0.3, a, 0.72]], '#aee6f5', '#8a5a2b', 5);
  poly([[0.3, a, 0.51], [0.8, a, 0.51], [0.8, a, 0.53], [0.3, a, 0.53]], '#8a5a2b', null);
  poly([[0.54, a, 0.3], [0.56, a, 0.3], [0.56, a, 0.72], [0.54, a, 0.72]], '#8a5a2b', null);
  // round window (gable wall)
  {
    const [wx, wy] = P(a, -0.05, 0.62);
    g.save();
    g.translate(wx, wy);
    g.transform(C / K, -SN / K, 0, 1, 0, 0); // skew the circle onto the wall plane
    g.beginPath();
    g.arc(0, 0, 0.2 * K, 0, Math.PI * 2);
    g.restore();
    g.fillStyle = '#aee6f5';
    g.fill();
    g.strokeStyle = '#8a5a2b';
    g.lineWidth = 5;
    g.stroke();
  }

  // roof: front slope, then gable-end fascia, then eave edge
  poly([[-a - o, a + o, ze], [a + o, a + o, ze], [a + o, 0, h + rise], [-a - o, 0, h + rise]], '#ee6b4d', '#a63a2a');
  g.save();
  g.globalAlpha = 0.28;
  g.strokeStyle = '#a63a2a';
  g.lineWidth = 3;
  for (const t of [0.25, 0.5, 0.75]) {
    const y = (a + o) * (1 - t);
    const z = ze + (h + rise - ze) * t;
    g.beginPath();
    g.moveTo(...P(-a - o, y, z));
    g.lineTo(...P(a + o, y, z));
    g.stroke();
  }
  g.restore();
  g.save();
  g.globalAlpha = 0.5;
  g.strokeStyle = '#ffb29a';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(...P(-a - o + 0.12, 0.08, h + rise - 0.03));
  g.lineTo(...P(a + o - 0.12, 0.08, h + rise - 0.03));
  g.stroke();
  g.restore();
  poly(
    [[a + o, a + o, ze], [a + o, 0, h + rise], [a + o, -a - o, ze], [a + o, -a - o, ze - T], [a + o, 0, h + rise - T], [a + o, a + o, ze - T]],
    '#c4503a',
    '#a63a2a'
  );
  poly([[-a - o, a + o, ze], [a + o, a + o, ze], [a + o, a + o, ze - T], [-a - o, a + o, ze - T]], '#b84632', '#a63a2a');

  // chimney (straddles the ridge)
  {
    const x0 = -0.72, x1 = -0.42, yy = 0.15, z0 = h + rise * 0.84, z1 = z0 + 0.5;
    poly([[x0, yy, z0], [x1, yy, z0], [x1, yy, z1], [x0, yy, z1]], '#d27a55', '#8f4a2e');
    poly([[x1, yy, z0], [x1, -yy, z0], [x1, -yy, z1], [x1, yy, z1]], '#b9623f', '#8f4a2e');
    poly([[x0, yy, z1], [x1, yy, z1], [x1, -yy, z1], [x0, -yy, z1]], '#8a4a33', '#8f4a2e');
    // smoke
    for (const [i, rr] of [[0, 12], [1, 16], [2, 20]]) {
      const [px, py] = P((x0 + x1) / 2, 0, z1 + 0.28 + i * 0.3);
      g.fillStyle = `rgba(255,255,255,${0.78 - i * 0.2})`;
      g.beginPath();
      g.arc(px + i * 9, py, rr, 0, Math.PI * 2);
      g.fill();
    }
  }

  // little bushes at the corners
  const bush = (x, y, rr) => {
    const [px, py] = P(x, y, 0);
    for (const [dx, dy, r2, col] of [[-rr * 0.6, 0, rr * 0.8, '#4fae35'], [rr * 0.6, 0, rr * 0.8, '#58b83a'], [0, -rr * 0.5, rr, '#6ccb45']]) {
      g.beginPath();
      g.arc(px + dx, py + dy - rr * 0.3, r2, 0, Math.PI * 2);
      g.fillStyle = col;
      g.fill();
      g.strokeStyle = '#2f7d2c';
      g.lineWidth = 3;
      g.stroke();
    }
    g.fillStyle = '#ff9fc6';
    for (const [dx, dy] of [[-8, -14], [6, -20], [10, -8]]) {
      g.beginPath();
      g.arc(px + dx, py + dy, 4, 0, Math.PI * 2);
      g.fill();
    }
  };
  bush(a + 0.18, a + 0.12, 22);
  bush(-a - 0.1, a + 0.12, 18);

  houseMatCache = canvasMat(c);
  return houseMatCache;
}

// ---------- fish & butterflies (ambient win-screen animation) ----------
let fishMatCache = null;
/** Orange koi facing right; origin at the sprite centre. */
export function fishMaterial() {
  if (fishMatCache) return fishMatCache;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.lineCap = g.lineJoin = 'round';
  g.lineWidth = 4;
  g.strokeStyle = '#d4561f';
  // tail
  g.beginPath();
  g.moveTo(34, 64);
  g.lineTo(8, 40);
  g.quadraticCurveTo(18, 64, 8, 88);
  g.closePath();
  g.fillStyle = '#ff9a4a';
  g.fill();
  g.stroke();
  // body
  g.beginPath();
  g.ellipse(68, 64, 44, 26, 0, 0, Math.PI * 2);
  g.fillStyle = '#ff8a3c';
  g.fill();
  g.stroke();
  // belly + spot
  g.beginPath();
  g.ellipse(70, 74, 30, 11, 0, 0, Math.PI * 2);
  g.fillStyle = '#ffd9b0';
  g.fill();
  g.beginPath();
  g.ellipse(58, 52, 12, 7, -0.2, 0, Math.PI * 2);
  g.fillStyle = '#fff4e4';
  g.fill();
  // dorsal fin
  g.beginPath();
  g.moveTo(50, 40);
  g.quadraticCurveTo(66, 18, 84, 40);
  g.fillStyle = '#ff9a4a';
  g.fill();
  g.stroke();
  // eye
  g.beginPath();
  g.arc(94, 58, 5, 0, Math.PI * 2);
  g.fillStyle = '#fff';
  g.fill();
  g.beginPath();
  g.arc(95, 58, 2.6, 0, Math.PI * 2);
  g.fillStyle = '#2b2b2b';
  g.fill();
  fishMatCache = canvasMat(c);
  return fishMatCache;
}

let ringMatCache = null;
/** Soft white ripple ring for the splash. */
export function rippleMaterial() {
  if (ringMatCache) return ringMatCache;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = 7;
  g.beginPath();
  g.ellipse(64, 64, 52, 22, 0, 0, Math.PI * 2);
  g.stroke();
  ringMatCache = canvasMat(c);
  return ringMatCache;
}

const butterflyCache = new Map();
/** Front-view butterfly with spread wings; scale X to flap. Origin at centre. */
export function butterflyMaterial(kind = 0) {
  if (butterflyCache.has(kind)) return butterflyCache.get(kind);
  const pal = [
    ['#ffb347', '#e0731c', '#fff1c9'],
    ['#8fb5ff', '#4c6fe0', '#e6efff'],
    ['#ff9fc6', '#d8639a', '#ffe3f0'],
    ['#ffe56b', '#d9a81c', '#fff8d2'],
  ][kind % 4];
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  g.lineWidth = 3;
  g.strokeStyle = pal[1];
  const wing = (sx) => {
    g.save();
    g.translate(48, 48);
    g.scale(sx, 1);
    g.beginPath();
    g.ellipse(18, -13, 20, 16, -0.45, 0, Math.PI * 2);
    g.fillStyle = pal[0];
    g.fill();
    g.stroke();
    g.beginPath();
    g.ellipse(14, 16, 13, 11, 0.5, 0, Math.PI * 2);
    g.fillStyle = pal[0];
    g.fill();
    g.stroke();
    g.beginPath();
    g.arc(20, -14, 5, 0, Math.PI * 2);
    g.fillStyle = pal[2];
    g.fill();
    g.restore();
  };
  wing(1);
  wing(-1);
  g.beginPath();
  g.ellipse(48, 50, 4.5, 17, 0, 0, Math.PI * 2);
  g.fillStyle = '#5a3a24';
  g.fill();
  g.strokeStyle = '#5a3a24';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(47, 33); g.quadraticCurveTo(42, 22, 37, 20);
  g.moveTo(49, 33); g.quadraticCurveTo(54, 22, 59, 20);
  g.stroke();
  const m = canvasMat(c);
  butterflyCache.set(kind, m);
  return m;
}

// ---------- dog (runs around the lawn) ----------
const dogCache = [];
export const DOG_FRAMES = 6;
/** Side-view corgi-ish pup facing right, 6-frame gallop cycle. Origin: feet-level centre. */
export function dogMaterial(frame) {
  const f = ((frame % DOG_FRAMES) + DOG_FRAMES) % DOG_FRAMES;
  if (dogCache[f]) return dogCache[f];
  const W = 192, H = 144;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.lineCap = g.lineJoin = 'round';
  const ph = (f / DOG_FRAMES) * Math.PI * 2;
  const OUT = '#8a4f1f', FUR = '#f0a24a', LIGHT = '#fff1d6', DARK = '#c97a2c';
  const gy = 124; // ground line
  // shadow
  g.fillStyle = 'rgba(36,96,24,0.28)';
  g.beginPath();
  g.ellipse(94, gy + 2, 54, 8, 0, 0, Math.PI * 2);
  g.fill();
  // legs: [hipx, hipy, phase offset, far?]
  const leg = (hx, hy, off, far) => {
    const a = Math.sin(ph + off);
    const lift = Math.max(0, Math.cos(ph + off));
    const fx = hx + a * 20;
    const fy = gy - lift * 12;
    g.strokeStyle = OUT;
    g.lineWidth = 15;
    g.beginPath();
    g.moveTo(hx, hy);
    g.lineTo(fx, fy);
    g.stroke();
    g.strokeStyle = far ? DARK : FUR;
    g.lineWidth = 9;
    g.stroke();
    g.fillStyle = LIGHT;
    g.beginPath();
    g.ellipse(fx + 3, fy, 8, 5, 0, 0, Math.PI * 2);
    g.fill();
  };
  leg(60, 94, Math.PI, true);
  leg(120, 94, 0, true);
  // tail (wags with the cycle)
  g.strokeStyle = OUT;
  g.lineWidth = 13;
  g.beginPath();
  g.moveTo(44, 72);
  g.quadraticCurveTo(24, 54 + Math.sin(ph * 2) * 8, 28, 40 + Math.sin(ph * 2) * 8);
  g.stroke();
  g.strokeStyle = FUR;
  g.lineWidth = 7;
  g.stroke();
  // body
  g.beginPath();
  g.ellipse(92, 82, 52, 29, 0, 0, Math.PI * 2);
  g.fillStyle = FUR;
  g.fill();
  g.strokeStyle = OUT;
  g.lineWidth = 5;
  g.stroke();
  g.beginPath();
  g.ellipse(96, 98, 36, 13, 0, 0, Math.PI * 2);
  g.fillStyle = LIGHT;
  g.fill();
  leg(70, 96, 0.5, false);
  leg(128, 96, Math.PI + 0.5, false);
  // head
  g.beginPath();
  g.ellipse(144, 60, 25, 22, 0, 0, Math.PI * 2);
  g.fillStyle = FUR;
  g.fill();
  g.strokeStyle = OUT;
  g.lineWidth = 5;
  g.stroke();
  // snout
  g.beginPath();
  g.ellipse(166, 68, 15, 11, 0.1, 0, Math.PI * 2);
  g.fillStyle = LIGHT;
  g.fill();
  g.stroke();
  g.fillStyle = '#3a2418';
  g.beginPath();
  g.ellipse(178, 63, 5.5, 4.5, 0, 0, Math.PI * 2);
  g.fill();
  // tongue
  g.fillStyle = '#ff7f9a';
  g.beginPath();
  g.ellipse(166, 82 + Math.abs(Math.sin(ph)) * 3, 5, 7, 0, 0, Math.PI * 2);
  g.fill();
  // ear (flops with the stride)
  g.save();
  g.translate(132, 46);
  g.rotate(-0.5 + Math.sin(ph + 1) * 0.25);
  g.beginPath();
  g.ellipse(0, 12, 10, 20, 0, 0, Math.PI * 2);
  g.fillStyle = DARK;
  g.fill();
  g.strokeStyle = OUT;
  g.lineWidth = 4;
  g.stroke();
  g.restore();
  // eye
  g.fillStyle = '#2b1a10';
  g.beginPath();
  g.arc(153, 54, 4.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(154.5, 52.5, 1.4, 0, Math.PI * 2);
  g.fill();
  // collar
  g.strokeStyle = '#e8503a';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(128, 76);
  g.quadraticCurveTo(136, 86, 142, 80);
  g.stroke();
  dogCache[f] = canvasMat(c);
  return dogCache[f];
}
export const DOG_ASPECT = 192 / 144;
export const DOG_ANCHOR = { ax: 0.5, ay: 20 / 144 };
