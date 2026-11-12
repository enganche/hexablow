import * as THREE from 'three';
import { axialToPixel, pixelToAxial, key, areAdjacent, DIRS } from './hex.js';
import {
  LIFT, mulberry, makeLawnCell, setLawnOpacity, spriteGeo, plantMaterial, PLANT_ANCHOR, FLOWER_KINDS,
  houseMaterial, HOUSE_SIZE, HOUSE_ANCHOR, HOUSE_REACH,
  fishMaterial, rippleMaterial, butterflyMaterial,
  dogMaterial, DOG_FRAMES, DOG_ASPECT, DOG_ANCHOR,
  PLANT_SPECIES, CRITTERS, critterMaterial, CRITTER_ANCHOR,
} from './garden.js';

// ---- Honeycomb palette ----
const COLORS = {
  bg: 0xfff4df,
  water: 0x8fd8ea,
  waterEdge: 0x6cc3d9,
  hint: 0xf5c84b,
  ghostOk: 0x75d7b1,
  ghostBad: 0xef6f6c,
};

const MAX_HEARTS = 3;
const TRAY_PAD = 18;
const TUTORIAL_GAP = 60; // HUD bottom -> board top on level 1; the tutorial bubble (~44px) lives in here
const BOARD_GAP = 6; // HUD bottom -> board top on every other level
const MAX_CELL_R = 46; // cap for tiny maps (e.g. level 1) so they don't dwarf the normal levels
const TRAY_GAP = 20;
const BAR_H = 92; // booster bar at the very bottom (keep in sync with --bar-h in style.css)
const TRAY_BOTTOM = BAR_H + 14 + 6; // booster bar + scrollbar + gap

// ---- Shared geometry (unit circumradius, y-up world) ----
function roundedHexShape(radius = 1, corner = 0.18) {
  const pts = [];
  for (let k = 0; k < 6; k++) {
    const a = ((30 + 60 * k) * Math.PI) / 180;
    pts.push(new THREE.Vector2(Math.cos(a) * radius, Math.sin(a) * radius));
  }
  const s = new THREE.Shape();
  const lerp = (a, b, t) => new THREE.Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  for (let i = 0; i < 6; i++) {
    const prev = pts[(i + 5) % 6];
    const cur = pts[i];
    const next = pts[(i + 1) % 6];
    const before = lerp(cur, prev, corner);
    const after = lerp(cur, next, corner);
    if (i === 0) s.moveTo(before.x, before.y);
    else s.lineTo(before.x, before.y);
    s.quadraticCurveTo(cur.x, cur.y, after.x, after.y);
  }
  s.closePath();
  return s;
}
const HEX_GEO = new THREE.ShapeGeometry(roundedHexShape(1, 0.18), 6);
const outline = roundedHexShape(0.96);
outline.holes.push(new THREE.Path(roundedHexShape(0.84).getPoints(6)));
const OUTLINE_GEO = new THREE.ShapeGeometry(outline, 6);
// wrong-move pulse: a ring hugging the outside of a placed tile
const TILE_RING = roundedHexShape(1.1);
TILE_RING.holes.push(new THREE.Path(roundedHexShape(0.98).getPoints(6)));
const TILE_RING_GEO = new THREE.ShapeGeometry(TILE_RING, 6);

const WAX_MAT = new THREE.MeshBasicMaterial({ vertexColors: true });

const TILE_BODY_GEO = new THREE.ShapeGeometry(roundedHexShape(1, 0));

function roundRectGeo(w, h, r) {
  const x = -w / 2, y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ShapeGeometry(s, 8);
}

function waxSurface(top, bottom, shape = HEX_GEO) {
  const geometry = shape.clone();
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const upper = new THREE.Color(top);
  const lower = new THREE.Color(bottom);
  const shade = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    shade.copy(lower).lerp(upper, (positions.getY(i) + 1) / 2).toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

let WAX_RIM = waxSurface(0xfbe3ad, 0xf5d596, TILE_BODY_GEO);
let WAX_WALL = waxSurface(0xdfb479, 0xfce4b3);
let WAX_FLOOR = waxSurface(0xe9be7f, 0xfce1aa);

/** Theme palette for the empty board sockets: { rim, wall, floor } each [top, bottom]. */
function setSocketColors(s) {
  if (!s) return;
  WAX_RIM.dispose(); WAX_WALL.dispose(); WAX_FLOOR.dispose();
  WAX_RIM = waxSurface(s.rim[0], s.rim[1], TILE_BODY_GEO);
  WAX_WALL = waxSurface(s.wall[0], s.wall[1]);
  WAX_FLOOR = waxSurface(s.floor[0], s.floor[1]);
}
const CONNECTED_FACE = waxSurface(0xbbef54, 0x78c528, TILE_BODY_GEO);
const CONNECTED_RIM = waxSurface(0xd8ef9d, 0xc0e77b, TILE_BODY_GEO);
let TILE_FACE = waxSurface(0xffdb65, 0xffa936, TILE_BODY_GEO);
let TILE_RIM = waxSurface(0xffe3a0, 0xffd477, TILE_BODY_GEO);
let TILE_BASE = 0xd99a36;

/** Swap the normal-tile palette (cosmetic skin). Connected / finish tiles keep their meaning colours. */
function setTileSkinColors(skin) {
  TILE_FACE.dispose();
  TILE_RIM.dispose();
  TILE_FACE = waxSurface(skin.face[0], skin.face[1], TILE_BODY_GEO);
  TILE_RIM = waxSurface(skin.rim[0], skin.rim[1], TILE_BODY_GEO);
  TILE_BASE = new THREE.Color(skin.base).getHex();
}
const FINISH_FACE = waxSurface(0xffb3d3, 0xed77b2, TILE_BODY_GEO);
const FINISH_RIM = waxSurface(0xffd0e5, 0xf7afd0, TILE_BODY_GEO);
const LABEL_GEO = new THREE.PlaneGeometry(1.5, 1.5);

const matCache = new Map();
function basicMat(color, opacity = 1) {
  const k = `${color}|${opacity}`;
  if (!matCache.has(k)) {
    matCache.set(
      k,
      new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity })
    );
  }
  return matCache.get(k);
}

const labelCache = new Map();
/** Digit colour: the tile's own hue at the old brown's darkness (L .27) and saturation (S .74). */
function labelInk(tileColor) {
  const hsl = {};
  new THREE.Color(tileColor).getHSL(hsl, THREE.SRGBColorSpace);
  return `#${new THREE.Color().setHSL(hsl.h, 0.74, 0.274, THREE.SRGBColorSpace).getHexString(THREE.SRGBColorSpace)}`;
}
function labelMaterial(n, tileColor) {
  const ink = labelInk(tileColor);
  const ck = `${n}|${ink}`;
  if (!labelCache.has(ck)) {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const digits = String(n).length;
    const fs = digits >= 3 ? 70 : digits === 2 ? 88 : 104;
    g.font = `900 ${fs}px "Nunito", ui-rounded, system-ui, sans-serif`;
    g.strokeStyle = ink;
    g.lineJoin = 'round';
    g.lineWidth = 6;
    g.strokeText(String(n), size / 2, size / 2 + 5);
    g.fillText(String(n), size / 2, size / 2 + 5);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    labelCache.set(ck, new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  }
  return labelCache.get(ck);
}

// Water: full-size sharp hex so neighbouring water cells touch, with a painted ripple texture.
const WATER_GEO = (() => {
  const g = new THREE.ShapeGeometry(roundedHexShape(1, 0));
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + 1) / 2;
    uv[i * 2 + 1] = (pos.getY(i) + 1) / 2;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
})();
const WATER_MAT = new THREE.MeshBasicMaterial({ color: 0x2fc5cc });

// Seamless caustic-style water texture (tiling Voronoi cells with soft light seams),
// sampled in board space so neighbouring water cells continue the same pattern.
const WATER_TILE_UNITS = 4.2;
let waterTexMat = null;
function waterTextureMaterial() {
  if (waterTexMat) return waterTexMat;
  const S = 512, N = 5, cell = S / N;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pts = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      pts.push({ x: (i + 0.15 + rnd() * 0.7) * cell, y: (j + 0.15 + rnd() * 0.7) * cell, t: rnd() });
    }
  }
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const mix = (a, b, t) => a + (b - a) * t;
  const sstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const deep = [38, 176, 205], mid = [58, 198, 222], seam = [150, 232, 244];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let d1 = 1e9, d2 = 1e9, near = null;
      const TAU = Math.PI * 2;
      // wobble the sample point (periodic, so the tile stays seamless) for rounder, organic cells
      const wx = x + 12 * Math.sin((TAU * 3 * y) / S) + 6 * Math.sin((TAU * 5 * x) / S + 1);
      const wy = y + 12 * Math.sin((TAU * 2 * x) / S + 2) + 6 * Math.sin((TAU * 4 * y) / S);
      const gi = Math.floor(wx / cell), gj = Math.floor(wy / cell);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ci = gi + di, cj = gj + dj;
          const p = pts[((cj + N) % N) * N + ((ci + N) % N)];
          const px = p.x + Math.floor(ci / N) * S, py = p.y + Math.floor(cj / N) * S;
          const d = Math.hypot(wx - px, wy - py);
          if (d < d1) { d2 = d1; d1 = d; near = p; } else if (d < d2) d2 = d;
        }
      }
      const e = (d2 - d1) / cell;
      const body = mix(0, 1, near.t);
      const inner = sstep(0.0, 0.55, d1 / cell); // darker toward cell rim
      let r = mix(mid[0], deep[0], body * 0.8 + inner * 0.25);
      let gg = mix(mid[1], deep[1], body * 0.8 + inner * 0.25);
      let b = mix(mid[2], deep[2], body * 0.8 + inner * 0.25);
      const halo = 0.42 * (1 - sstep(0.0, 0.5, e));
      const line = 1 - sstep(0.0, 0.2, e);
      const k = Math.max(halo, line * 0.55);
      r = mix(r, seam[0], k); gg = mix(gg, seam[1], k); b = mix(b, seam[2], k);
      const o = (y * S + x) * 4;
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // a few white glints on seams
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let n = 0; n < 14; n++) {
    const p = pts[Math.floor(rnd() * pts.length)];
    g.beginPath();
    g.ellipse((p.x + cell * 0.45) % S, (p.y + cell * 0.2) % S, 5 + rnd() * 5, 2 + rnd() * 2, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  waterTexMat = new THREE.MeshBasicMaterial({ map: tex });
  return waterTexMat;
}
function waterCellGeo(q, r) {
  const g = WATER_GEO.clone();
  const p = unitPos(q, r);
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (p.x + pos.getX(i)) / WATER_TILE_UNITS;
    uv[i * 2 + 1] = (p.y + pos.getY(i)) / WATER_TILE_UNITS;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Decoration sprites (lily pad / lotus) drawn once on canvases, with a soft ripple ring.
const decorCache = new Map();
function decorMaterial(kind) {
  if (decorCache.has(kind)) return decorCache.get(kind);
  const S = 256, m = S / 2;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  // ripple ring
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 5;
  g.beginPath();
  g.ellipse(m, m + 12, 92, 66, 0, 0, Math.PI * 2);
  g.stroke();
  const pad = (x, y, r, rot) => {
    g.save();
    g.translate(x, y);
    g.scale(1, 0.72);
    g.rotate(rot);
    g.fillStyle = '#2f9a3a';
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, r, 0.35, Math.PI * 2 - 0.35);
    g.closePath();
    g.fill();
    g.fillStyle = '#58c25a';
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, -r * 0.08, r * 0.82, 0.4, Math.PI * 2 - 0.4);
    g.closePath();
    g.fill();
    g.restore();
  };
  if (kind === 'lotus') {
    pad(m + 8, m + 30, 58, 0.5);
    const petal = (rot, len, color) => {
      g.save();
      g.translate(m + 8, m + 14);
      g.rotate(rot);
      g.fillStyle = color;
      g.beginPath();
      g.ellipse(0, -len * 0.5, len * 0.28, len * 0.5, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    };
    for (const r of [-1.1, 1.1, -0.6, 0.6]) petal(r, 48, '#f47fae');
    petal(0, 54, '#ffa3c8');
    g.fillStyle = '#ffd95a';
    g.beginPath();
    g.arc(m + 8, m + 8, 9, 0, Math.PI * 2);
    g.fill();
  } else {
    pad(m, m + 6, 52, kind === 'padB' ? 2.4 : 0.8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  decorCache.set(kind, mat);
  return mat;
}
// Sunken shore: a darker band only along the two upper edges (i = 1, 2) that touch land,
// like the far wall of a pool seen from an isometric camera. Bands join with mitred ends.
const SHORE_MAT = new THREE.MeshBasicMaterial({ color: 0x17a2b3, side: THREE.DoubleSide });
const SHORE_W = 0.2;
const SHORE_EDGES = new Set([1, 2]);
const shoreCache = new Map();
/** endA / endB: -1 shorten (convex corner), 0 square, +1 extend (concave corner). */
function shoreGeo(i, endA, endB) {
  const k = `${i}|${endA}|${endB}`;
  if (shoreCache.has(k)) return shoreCache.get(k);
  const rad = (d) => (d * Math.PI) / 180;
  const a = new THREE.Vector2(Math.cos(rad(60 * i - 30)), Math.sin(rad(60 * i - 30)));
  const b = new THREE.Vector2(Math.cos(rad(60 * i + 30)), Math.sin(rad(60 * i + 30)));
  const n = new THREE.Vector2(Math.cos(rad(60 * i)), Math.sin(rad(60 * i)));
  const d = b.clone().sub(a).normalize();
  const m = SHORE_W * Math.tan(rad(30));
  const a2 = a.clone().addScaledVector(n, -SHORE_W).addScaledVector(d, -endA * m);
  const b2 = b.clone().addScaledVector(n, -SHORE_W).addScaledVector(d, endB * m);
  const geo = new THREE.ShapeGeometry(new THREE.Shape([a, b, b2, a2]));
  shoreCache.set(k, geo);
  return geo;
}
let waveBase = null;
function waveMaterial() {
  if (!waveBase) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.strokeStyle = '#ffffff';
    g.lineWidth = 13;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(24, 34);
    g.bezierCurveTo(60, 6, 92, 6, 128, 34);
    g.bezierCurveTo(164, 62, 196, 62, 232, 34);
    g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    waveBase = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false });
  }
  return waveBase.clone();
}
const WAVE_GEO = new THREE.PlaneGeometry(1.35, 0.34);
function waterDecor(q, r) {
  const h = ((q * 73856093) ^ (r * 19349663)) >>> 0;
  const v = h % 8;
  if (v === 0) return 'lotus';
  if (v === 1) return 'padA';
  if (v === 2) return 'padB';
  return null;
}

function hexLayer(geometry, material, radius, y, z) {
  const layer = new THREE.Mesh(geometry, material);
  layer.scale.setScalar(radius);
  layer.position.set(0, y, z);
  return layer;
}

function makeSocket() {
  const group = new THREE.Group();
  group.add(
    hexLayer(WAX_RIM, WAX_MAT, 1, 0, 0),
    hexLayer(WAX_WALL, WAX_MAT, 0.87, 0, 0.02),
    hexLayer(WAX_FLOOR, WAX_MAT, 0.80, -0.035, 0.04)
  );
  return group;
}

/** Layered profile for the orthographic camera. The numbers stay dynamic. */
const TILE_TOP_LIFT = LIFT;
const TILE_FACE_Y = TILE_TOP_LIFT + 0.027;
const TILE_ROW_DEPTH = 0.035;
const pathSegment = new THREE.Shape();
pathSegment.moveTo(-0.5, 0.30);
pathSegment.lineTo(0.08, 0.30);
pathSegment.quadraticCurveTo(0.24, 0.20, 0.5, 0.20);
pathSegment.lineTo(0.5, -0.20);
pathSegment.quadraticCurveTo(0.24, -0.20, 0.08, -0.30);
pathSegment.lineTo(-0.5, -0.30);
pathSegment.closePath();

const PATH_SEGMENT_GEO = new THREE.ShapeGeometry(pathSegment, 8);
const STRAIGHT_PATH_GEO = new THREE.PlaneGeometry(1, 0.42);

function makeTile(n, directions, isFinish = false, connected = false) {
  const group = new THREE.Group();
  const label = new THREE.Mesh(LABEL_GEO, labelMaterial(n, connected ? 0x70a42a : isFinish ? 0xd9609c : TILE_BASE));
  label.scale.setScalar(0.72);
  label.position.set(0, TILE_TOP_LIFT, 0.5);
  group.add(
    hexLayer(HEX_GEO, basicMat(0xb5651a, 0.10), 0.97, -0.08, 0.08),
    hexLayer(TILE_BODY_GEO, basicMat(connected ? 0x70a42a : isFinish ? 0xd9609c : TILE_BASE), 1, 0, 0.14),
    hexLayer(connected ? CONNECTED_RIM : isFinish ? FINISH_RIM : TILE_RIM, WAX_MAT, 1, TILE_TOP_LIFT, 0.16),
    hexLayer(connected ? CONNECTED_FACE : isFinish ? FINISH_FACE : TILE_FACE, WAX_MAT, 0.92, TILE_FACE_Y, 0.20),
    label
  );
  return group;
}



// unit position helpers: y flipped so world is y-up
const unitPos = (q, r) => {
  const p = axialToPixel(q, r, 1);
  return { x: p.x, y: -p.y };
};

// ---- Level helpers ----
/**
 * Tray pieces. Levels ship an explicit `pieces` list (mostly single tiles,
 * a few pairs — like the reference game). Fallback: every missing number
 * is its own single tile.
 */
function buildPieces(level) {
  const N = level.cells.length;
  let pieces = level.pieces;
  if (!pieces) {
    pieces = [];
    for (let n = 1; n <= N; n++) if (!level.givens[n]) pieces.push([n]);
  }
  return pieces.map((numbers, i) => {
    const first = level.solution[numbers[0]];
    const offsets = numbers.map((n) => {
      const c = level.solution[n];
      return [c[0] - first[0], c[1] - first[1]];
    });
    return { id: i, numbers, offsets };
  });
}

function pieceBounds(offsets) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [dq, dr] of offsets) {
    const p = unitPos(dq, dr);
    minX = Math.min(minX, p.x - Math.sqrt(3) / 2);
    maxX = Math.max(maxX, p.x + Math.sqrt(3) / 2);
    minY = Math.min(minY, p.y - 1);
    maxY = Math.max(maxY, p.y + 1);
  }
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export class Game {
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.hooks = hooks; // { onHearts, onWin, onFail, onPlace, onMistake, getSettings }
    // alpha canvas: on the result screens the clear colour fades out so the sky backdrop shows through
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.bgColor = new THREE.Color(COLORS.bg);
    this.bgAlpha = 1;
    this._applyClear();
    this.scene = new THREE.Scene();
    // Deep depth range: tile groups are uniformly scaled by cell size, so z scales too.
    this.camera = new THREE.OrthographicCamera(0, 100, 100, 0, 1, 4000);
    this.camera.position.z = 2000;

    this.boardGroup = new THREE.Group();
    this.hlGroup = new THREE.Group();
    this.contentGroup = new THREE.Group();
    this.trayGroup = new THREE.Group();
    this.dragGroup = new THREE.Group();
    this.gardenGroup = new THREE.Group();
    this.pickerGroup = new THREE.Group(); // dim + panel behind the tray pieces while the Picker booster is open
    this.scene.add(this.boardGroup, this.hlGroup, this.contentGroup, this.gardenGroup, this.pickerGroup, this.trayGroup, this.dragGroup);
    this.pickerMode = false;
    this.findMode = false;
    this.revealed = new Map(); // cell key -> number shown by the Reveal booster (cleared per level load)
    this.revealMarks = new Map();
    this.gardenPlan = null; // win garden: stable (unit-space) layout of plants + house
    this.gardenObjs = null; // meshes built from the plan for the current layout
    this.gardenT = 0; // garden animation clock (ms)
    this.view = null; // result-screen camera fit { rectFn, e }
    this.resultMode = false;
    this._winToken = 0;
    this.dragGroup.position.z = 200;

    this.tweens = [];
    this.level = null;
    this.hearts = MAX_HEARTS;
    this.pieces = [];
    this.placed = new Map(); // number -> [q,r]
    this.tileGroups = new Map(); // number -> Group (given + placed)
    this.selected = null;
    this.ptr = null;
    this.locked = false;
    this.scroll = 0;
    this.maxScroll = 0;
    this.W = 0;
    this.H = 0;

    this._bind();
    this._initScrollbar();
    this._initPickerUI();
    this._pickTok = 0;
    this.resize();
    this._last = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // ---------- public ----------
  loadLevel(level, opts = {}) {
    this.exitResultView();
    this._clearGarden();
    this._winToken++;
    this.level = level;
    this.hearts = MAX_HEARTS;
    this.locked = false;
    this.selected = null;
    this.dragPiece = null;
    this._dragCells = null;
    this.ptr = null;
    this.placed = new Map();
    this.revealed = new Map();
    this._setMode(null, true);
    this.hooks.onHearts(this.hearts, false);
    this.pieces = buildPieces(level).map((p) => ({ ...p, group: null, slot: { x: 0, y: 0 }, scale: 1 }));
    // random per play from level 3; level 1 keeps its fixed shuffle; level 2 keeps ascending order
    if (opts.randomOrder) this.pieces = seededShuffle(this.pieces, Math.floor(Math.random() * 4294967296));
    else if (level.id !== 2) this.pieces = seededShuffle(this.pieces, level.id * 7919); // level 2 stays ascending
    this._layout();
  }

  /**
   * Entrance animation after loadLevel: board cells ripple outward from the centre, the given tiles pop in,
   * then the tray pieces rise one by one. Works on the already-built objects so layout/input are untouched.
   */
  playIntro() {
    if (!this.level) return;
    const items = [];
    const cx = this.boardScreenX, cy = this.boardScreenY;
    const reach = Math.max(1, this.R * 4.5);
    const add = (obj, delay, dur, rise, piece) => {
      items.push({ obj, delay, dur, rise, piece, k: obj.scale.x, y: obj.position.y });
      obj.scale.setScalar(0.0001);
    };
    const dist = (o) => Math.min(1, Math.hypot(o.position.x - cx, this.H - o.position.y - cy) / reach);
    for (const o of this.boardGroup.children) add(o, 80 + dist(o) * 380, 420, this.R * 0.28);
    for (const o of this.contentGroup.children) add(o, 330 + dist(o) * 380, 420, this.R * 0.4);
    this.pieces.forEach((p, i) => add(p.group, 560 + Math.min(i, 8) * 70, 440, 34, p));
    const total = Math.max(...items.map((it) => it.delay + it.dur));
    const skip = (it) => !it.obj.parent || (it.piece && (it.piece === this.dragPiece || it.obj.parent !== this.trayGroup));
    this._tween(total, (k) => {
      const t = k * total;
      for (const it of items) {
        if (skip(it)) continue;
        const u = clamp((t - it.delay) / it.dur, 0, 1);
        it.obj.scale.setScalar(Math.max(0.0001, it.k * easeOutBack(u)));
        it.obj.position.y = it.y - it.rise * (1 - easeOut(u));
      }
    }, () => {
      for (const it of items) {
        if (skip(it)) continue;
        it.obj.scale.setScalar(it.k);
        it.obj.position.y = it.y;
      }
    });
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.W = w;
    this.H = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.left = 0;
    this.camera.right = w;
    this.camera.top = h;
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
    if (this.level) this._layout();
  }

  /** Tutorial helper: screen points (px, y-down) for the tray piece holding number n and its target cell. */
  tutorialInfo(n) {
    const p = this.pieces.find((x) => x.numbers[0] === n);
    if (!p || !this.level || this.dragPiece === p) return null;
    const piv = this._trayPivot(p);
    const u = unitPos(p.offsets[0][0], p.offsets[0][1]);
    const to = this.level.solution[n];
    return {
      from: { x: piv.x + u.x * this.Rt, y: piv.y - u.y * this.Rt },
      to: this._cellScreen(to[0], to[1]),
      R: this.R,
      Rt: this.Rt,
      hudBottom: this._hudBottom(),
    };
  }

  // ---------- boosters ----------
  /** True when a booster can start right now (no drag in flight, not locked, still something to place). */
  canBoost() {
    return !!this.level && !this.locked && !this.dragPiece && this.pieces.length > 0 && !this.resultMode;
  }

  get mode() {
    return this.pickerMode ? 'picker' : this.findMode ? 'find' : null;
  }

  _setMode(mode, silent = false) {
    if (this.pickerMode && mode !== 'picker') this._closePickerView();
    this.findMode = mode === 'find';
    this.pickerMode = mode === 'picker';
    this._updateHighlights(null);
    if (!silent) this.hooks.onModeChange?.(mode);
  }

  cancelMode() {
    if (this.mode) this._setMode(null);
  }

  _emptyCells() {
    return this.level.cells.filter(([q, r]) => !this._occupied(key(q, r)));
  }

  /** Reveal: show the exact number of one random empty cell. Returns false if nothing to reveal. */
  reveal() {
    if (!this.canBoost()) return false;
    const byCell = new Map();
    for (const [n, c] of Object.entries(this.level.solution)) byCell.set(key(c[0], c[1]), Number(n));
    const open = this._emptyCells().filter(([q, r]) => !this.revealed.has(key(q, r)));
    if (!open.length) return false;
    const [q, r] = open[Math.floor(Math.random() * open.length)];
    const k = key(q, r);
    this.revealed.set(k, byCell.get(k));
    this._buildContent(null);
    const mark = this.revealMarks.get(k);
    if (mark) {
      mark.scale.setScalar(this.R * 0.3);
      this._tween(380, (t) => mark.scale.setScalar(this.R * (0.3 + 0.7 * easeOutBack(t))));
    }
    return true;
  }

  /** Find: next tap on an empty cell pulls the tile that belongs there. */
  beginFind() {
    if (!this.canBoost()) return false;
    this._select(null);
    this._setMode('find');
    return true;
  }

  /** Picker: the tray opens up into a full list; tapping a tile sends it to its cell. */
  beginPicker() {
    if (!this.canBoost()) return false;
    this._select(null);
    this._setMode('picker');
    this._openPickerView();
    return true;
  }

  _solutionCells(p) {
    return this._pieceCells(p, this.level.solution[p.numbers[0]]);
  }

  /** Fly a tray piece from where it is to its solved cells, then place it. Never costs a heart. */
  _flyPiece(p) {
    const cells = this._solutionCells(p);
    this.locked = true;
    if (this.dragPiece !== p) {
      this.trayGroup.remove(p.group);
      this.dragGroup.add(p.group);
      this.dragPiece = p;
    }
    // a piece scrolled out of the list starts from the nearest visible edge of the tray
    const s = this._cellScreen(cells[0][0], cells[0][1]);
    const from = p.group.position.clone();
    from.x = clamp(from.x, this.W * 0.12, this.W * 0.88);
    const to = this._w(s.x, s.y);
    const fromScale = p.group.scale.x;
    const lift = this.R * 1.2;
    this._tween(460, (k) => {
      const e = easeOut(k);
      p.group.position.lerpVectors(from, to, e);
      p.group.position.y += Math.sin(k * Math.PI) * lift;
      p.group.scale.setScalar(fromScale + (this.R - fromScale) * e);
    }, () => {
      this.locked = false;
      this._commit(p, cells);
    });
  }

  /** Debug: fly the next tray piece to its solved cells, like a normal move. Returns false if nothing can be placed now. */
  autoPlaceNext() {
    if (!this.canBoost()) return false;
    this.cancelMode();
    this._select(null);
    this._flyPiece(this.pieces[0]);
    return true;
  }

  _findCell(cell) {
    const k = key(cell[0], cell[1]);
    const p = this.pieces.find((x) => this._solutionCells(x).some(([q, r]) => key(q, r) === k));
    if (!p) return;
    this._setMode(null);
    this.hooks.onBoosterUsed?.('find');
    this._flyPiece(p);
  }

  _pickPiece(p) {
    // the chosen tile leaves the list; the panel closes and the others settle back into the tray
    this.trayGroup.remove(p.group);
    this.dragGroup.add(p.group);
    this.dragPiece = p;
    this._setMode(null);
    this.hooks.onBoosterUsed?.('picker');
    this._flyPiece(p);
  }

  /** Continue after running out of hearts: one heart back. */
  revive() {
    this.hearts = 1;
    this.locked = false;
    this.hooks.onHearts(this.hearts, false);
  }

  /** Cosmetic: tile skin ({face, rim, base}). Rebuilds the scene so existing tiles pick it up. */
  setTileSkin(skin) {
    setTileSkinColors(skin);
    if (this.level) this._layout();
  }

  /** Cosmetic: canvas background colour. */
  setSocketSkin(socket) {
    setSocketColors(socket);
    if (this.level) this._layout();
  }

  /** The canvas clears transparent; the map colour lives in #play-bg so the bottom panel can sit between them. */
  _applyClear() {
    this.renderer.setClearColor(this.bgColor, 0);
    const bg = this.canvas.parentElement?.querySelector('#play-bg');
    if (bg) {
      bg.style.background = `#${this.bgColor.getHexString()}`;
      bg.style.opacity = String(this.bgAlpha);
    }
  }

  setBackground(hex) {
    this.bgColor = new THREE.Color(hex);
    this._applyClear();
  }

  refreshHints() {
    this._updateHighlights(this._dragCells || null);
  }

  /** HUD bottom edge in stage coordinates (the stage may be letterboxed inside the window). */
  _hudBottom() {
    const h = document.getElementById('hud')?.getBoundingClientRect();
    return h ? h.bottom - this.canvas.getBoundingClientRect().top : 96;
  }

  // ---------- layout ----------
  _layout() {
    const { W, H, level } = this;
    if (!level) return;
    if (this.mode) this._setMode(null); // a resize closes any open booster mode
    const hud = this._hudBottom();
    const trayMaxH = Math.max(1, ...this.pieces.map((pc) => pieceBounds(pc.offsets).h));
    const trayBottomPad = TRAY_BOTTOM;
    this.trayBottomPad = trayBottomPad;
    const availBottom = H - trayBottomPad;
    // fixed gap under the HUD (room for the tutorial bubble) so the board never moves when it shows
    const areaTop = hud + ([1, 4, 6, 8].includes(level.id) ? TUTORIAL_GAP : BOARD_GAP);
    const avail = availBottom - areaTop - 12;

    // board extents in unit space
    const all = [...level.cells, ...level.blocked];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [q, r] of all) {
      const p = unitPos(q, r);
      minX = Math.min(minX, p.x - Math.sqrt(3) / 2);
      maxX = Math.max(maxX, p.x + Math.sqrt(3) / 2);
      minY = Math.min(minY, p.y - 1);
      maxY = Math.max(maxY, p.y + 1);
    }
    const bw = maxX - minX;
    const bh = maxY - minY;
    const padX = 8;
    // Board and tray share the height under the HUD: solve for a board scale where both fit (tray pieces
    // at ~85% of a board cell); height left over on width-limited boards goes to the tray.
    this.R = Math.min((W - padX * 2) / bw, (avail - 8) / (bh + 0.85 * trayMaxH), MAX_CELL_R);
    // the tray (and its panel) only takes what its pieces need; spare height goes to the board
    const trayH = Math.min(avail - bh * this.R, 220, trayMaxH * Math.min(this.R, 46) + 34);
    this.trayCenterY = availBottom - trayH / 2;
    this.trayTop = availBottom - trayH;
    this.boardCx = (minX + maxX) / 2;
    this.boardCy = (minY + maxY) / 2;
    this.boardScreenX = W / 2;
    // centred in the space between the HUD and the tray
    this.boardScreenY = (areaTop + this.trayTop - 16) / 2;
    this.boardBox = {
      x0: this.boardScreenX - (bw * this.R) / 2,
      x1: this.boardScreenX + (bw * this.R) / 2,
      y0: this.boardScreenY - (bh * this.R) / 2,
      y1: this.boardScreenY + (bh * this.R) / 2,
    };

    this._buildBoard();
    this._buildContent(null);
    this._buildTray();
    if (this.gardenPlan) {
      this._buildGardenObjs();
      this._applyGarden();
    }
    this._applyView();
    // bottom panel card starts just above the tray area
    this.canvas.parentElement?.style.setProperty('--panel-top', `${Math.round(this.trayTop - 2)}px`);
    this.hooks.onLayout?.({ trayTop: this.trayTop });
  }

  /**
   * Depth of a tile in a given row. Lower rows sit in front of upper ones, but the whole range is shifted
   * so the top row is still above the socket / water layer (a centred range hid top-row tiles on tall boards).
   */
  _tileZ(screenY) {
    return (screenY - this.boardBox.y0) * TILE_ROW_DEPTH;
  }

  /** screen (y-down px) for a cell centre */
  _cellScreen(q, r) {
    const u = unitPos(q, r);
    return {
      x: this.boardScreenX + (u.x - this.boardCx) * this.R,
      y: this.boardScreenY - (u.y - this.boardCy) * this.R,
    };
  }
  _screenToCell(x, y) {
    const ux = (x - this.boardScreenX) / this.R + this.boardCx;
    const uy = -((y - this.boardScreenY) / this.R) + this.boardCy; // unit y-up
    return pixelToAxial(ux, -uy, 1); // pixelToAxial expects y-down
  }
  _w(x, y, z = 0) {
    return new THREE.Vector3(x, this.H - y, z);
  }

  _clear(group) {
    for (const c of [...group.children]) group.remove(c);
  }

  _buildBoard() {
    this._clear(this.boardGroup);
    this.waves = [];
    this.cellKeys = new Set(this.level.cells.map(([q, r]) => key(q, r)));
    this.blockedKeys = new Set(this.level.blocked.map(([q, r]) => key(q, r)));
    const addCell = (q, r, model) => {
      const s = this._cellScreen(q, r);
      model.position.copy(this._w(s.x, s.y));
      model.scale.setScalar(this.R);
      this.boardGroup.add(model);
    };
    for (const [q, r] of this.level.cells) {
      const socket = makeSocket();
      socket.userData.land = true;
      addCell(q, r, socket);
    }
    for (const [q, r] of this.level.blocked) {
      const water = new THREE.Group();
      water.add(hexLayer(waterCellGeo(q, r), waterTextureMaterial(), 1.005, 0, 0));
      const decor = waterDecor(q, r);
      if (decor) water.add(hexLayer(LABEL_GEO, decorMaterial(decor), 1, 0, 0.05));
      const dir = (j) => DIRS[((j % 6) + 6) % 6];
      const isWater = (dq, dr) => this.blockedKeys.has(key(q + dq, r + dr));
      const endType = (i, j) => {
        const [jq, jr] = dir(j);
        if (!isWater(jq, jr)) return SHORE_EDGES.has(((j % 6) + 6) % 6) ? -1 : 0;
        // neighbour across the other edge is water: does its edge facing our land cell get a band?
        const [iq, ir] = dir(i);
        const k = DIRS.findIndex(([a, b]) => a === iq - jq && b === ir - jr);
        return SHORE_EDGES.has(k) ? 1 : 0;
      };
      for (const i of SHORE_EDGES) {
        const [dq, dr] = DIRS[i];
        if (isWater(dq, dr)) continue;
        water.add(hexLayer(shoreGeo(i, endType(i, i - 1), endType(i, i + 1)), SHORE_MAT, 1.005, 0, 0.02));
      }
      addCell(q, r, water);
    }
  }

  /** Rebuild board tiles and animate new placements. */
  _buildContent(popNumbers) {
    this._clear(this.contentGroup);
    this.tileGroups.clear();
    const pos = new Map();
    for (const [n, c] of Object.entries(this.level.givens)) pos.set(Number(n), c);
    for (const [n, c] of this.placed) pos.set(n, c);

    // Green tiles: a run of consecutive, adjacent numbers (2+ tiles) that contains at least one
    // tile the player placed. Runs made only of starting givens stay default colour.
    const linked = new Set();
    const lastN = this.level.cells.length;
    let run = [];
    const flush = () => {
      if (run.length > 1 && run.some((n) => this.placed.has(n))) run.forEach((n) => linked.add(n));
      run = [];
    };
    for (let n = 1; n <= lastN; n++) {
      if (!pos.has(n)) { flush(); continue; }
      if (run.length && !areAdjacent(pos.get(n), pos.get(n - 1))) flush();
      run.push(n);
    }
    flush();

    for (const [n, c] of pos) {
      const s = this._cellScreen(c[0], c[1]);
      const directions = [];
      for (const neighbor of [pos.get(n - 1), pos.get(n + 1)]) {
        if (neighbor && areAdjacent(c, neighbor)) {
          directions.push(unitPos(neighbor[0] - c[0], neighbor[1] - c[1]));
        }
      }
      const last = this.level.cells.length;
      const connected = n !== last && linked.has(n);
      const t = makeTile(n, [], n === last, connected);
      t.position.copy(this._w(s.x, s.y, this._tileZ(s.y)));
      t.scale.setScalar(this.R);
      this.contentGroup.add(t);
      this.tileGroups.set(n, t);
      if (popNumbers && popNumbers.includes(n)) {
        t.scale.setScalar(this.R * 0.6);
        this._tween(150, (k) => t.scale.setScalar(this.R * (0.6 + 0.4 * easeOutBack(k))));
      }
    }

    // Reveal booster: the exact number of a still-empty cell, shown as a golden ghost tile
    this.revealMarks.clear();
    for (const [k, n] of this.revealed) {
      if (this._occupied(k)) continue;
      const [q, r] = k.split(',').map(Number);
      const s = this._cellScreen(q, r);
      const mark = new THREE.Group();
      // ghost look (clearly not a placed tile): flat pale fill that breathes, dashed outline, faded number
      const label = new THREE.Mesh(LABEL_GEO, labelMaterial(n, 0x70a42a).clone());
      label.material.opacity = 0.42;
      label.scale.setScalar(0.6);
      label.position.set(0, 0, 0.5);
      const fill = hexLayer(HEX_GEO, new THREE.MeshBasicMaterial({ color: 0xb6dc7a, transparent: true, opacity: 0.15 }), 0.88, 0, 0.1);
      mark.add(fill, label);
      const dashMat = basicMat(0x7da84a, 0.4);
      for (let e = 0; e < 6; e++) {
        const a0 = ((30 + 60 * e) * Math.PI) / 180, a1 = a0 + Math.PI / 3;
        const ax = Math.cos(a0) * 0.9, ay = Math.sin(a0) * 0.9, bx = Math.cos(a1) * 0.9, by = Math.sin(a1) * 0.9;
        const ang = Math.atan2(by - ay, bx - ax), len = Math.hypot(bx - ax, by - ay);
        for (const t of [0.2, 0.5, 0.8]) {
          const d = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.2, 0.075), dashMat);
          d.position.set(ax + (bx - ax) * t, ay + (by - ay) * t, 0.12);
          d.rotation.z = ang;
          mark.add(d);
        }
      }
      mark.userData.fill = fill;
      mark.position.copy(this._w(s.x, s.y, this._tileZ(s.y)));
      mark.scale.setScalar(this.R);
      this.contentGroup.add(mark);
      this.revealMarks.set(k, mark);
    }
  }

  // ---------- tray ----------
  _buildTray() {
    this._clear(this.trayGroup);
    this._clear(this.dragGroup);
    const bounds = this.pieces.map((p) => pieceBounds(p.offsets));
    const maxH = Math.max(1, ...bounds.map((b) => b.h));
    const trayH = this.H - this.trayBottomPad - this.trayTop;
    this.Rt = Math.max(13, Math.min(this.R, (trayH * 0.92) / maxH, 46));

    let x = TRAY_PAD;
    this.pieces.forEach((p, i) => {
      const b = bounds[i];
      p.bounds = b;
      p.w = b.w * this.Rt;
      p.slotX = x + p.w / 2; // slot centre (before scroll)
      x += p.w + TRAY_GAP;
      if (p.group) this.trayGroup.remove(p.group);
      p.group = this._makePieceGroup(p);
      p.scale = this.Rt;
      this.trayGroup.add(p.group);
    });
    this.totalTrayW = x - TRAY_GAP + TRAY_PAD;
    this.maxScroll = Math.max(0, this.totalTrayW - this.W);
    this.scroll = Math.min(this.scroll, this.maxScroll);
    this._positionTray();
  }

  _makePieceGroup(p) {
    const g = new THREE.Group();
    const upos = p.offsets.map(([dq, dr]) => unitPos(dq, dr));
    p.numbers.forEach((n, i) => {
      // connectors only toward consecutive numbers inside the piece (pieces are cut by position,
      // so neighbouring tiles of a piece need not be consecutive numbers)
      const at = (m) => { const j = p.numbers.indexOf(m); return j < 0 ? null : upos[j]; };
      const directions = [at(n - 1), at(n + 1)].filter(Boolean).map((neighbor) => ({
        x: neighbor.x - upos[i].x,
        y: neighbor.y - upos[i].y,
      }));
      const t = makeTile(n, directions);
      t.position.set(upos[i].x, upos[i].y, -upos[i].y * TILE_ROW_DEPTH);
      g.add(t);
    });
    return g;
  }

  /** screen position of a piece's pivot (first cell) when resting in tray */
  _trayPivot(p) {
    if (this.pickerMode && p.pickPivot) return p.pickPivot;
    const cxu = p.bounds.cx;
    const cyu = p.bounds.cy;
    return {
      x: p.slotX - this.scroll - cxu * this.Rt,
      y: this.trayCenterY + cyu * this.Rt, // cy is y-up unit; screen y is down
    };
  }

  // ---------- tray scrollbar ----------
  _initScrollbar() {
    const track = document.createElement('div');
    track.id = 'tray-scroll';
    const thumb = document.createElement('div');
    thumb.id = 'tray-scroll-thumb';
    track.appendChild(thumb);
    (this.canvas.parentElement || document.body).appendChild(track);
    this.sbTrack = track;
    this.sbThumb = thumb;

    let drag = null;
    thumb.addEventListener('pointerdown', (e) => {
      if (this.locked) return;
      e.preventDefault();
      e.stopPropagation();
      try { thumb.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      drag = { id: e.pointerId, x: e.clientX, scroll: this.scroll };
      thumb.classList.add('active');
    });
    thumb.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const travel = track.clientWidth - thumb.offsetWidth;
      if (travel <= 0) return;
      this.scroll = clamp(drag.scroll + ((e.clientX - drag.x) / travel) * this.maxScroll, 0, this.maxScroll);
      this._positionTray();
    });
    const end = (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      drag = null;
      thumb.classList.remove('active');
    };
    thumb.addEventListener('pointerup', end);
    thumb.addEventListener('pointercancel', end);
    // tap on the track: jump so the thumb centres on the tap
    track.addEventListener('pointerdown', (e) => {
      if (e.target !== track || this.locked) return;
      const r = track.getBoundingClientRect();
      const travel = track.clientWidth - thumb.offsetWidth;
      if (travel <= 0) return;
      const t = (e.clientX - r.left - thumb.offsetWidth / 2) / travel;
      this.scroll = clamp(t * this.maxScroll, 0, this.maxScroll);
      this._positionTray();
    });
  }

  _updateScrollbar() {
    if (!this.sbTrack) return;
    const show = this.maxScroll > 1 && this.pieces.length > 0 && !this.pickerMode;
    this.sbTrack.style.display = show ? 'block' : 'none';
    if (!show) return;
    const tw = this.sbTrack.clientWidth;
    const frac = clamp(this.W / this.totalTrayW, 0.1, 1);
    const thumbW = Math.max(36, tw * frac);
    const travel = tw - thumbW;
    this.sbThumb.style.width = `${thumbW}px`;
    this.sbThumb.style.transform = `translateX(${(this.scroll / this.maxScroll) * travel}px)`;
  }

  _positionTray(animate = false) {
    this._updateScrollbar();
    const sc = this.pickerMode ? this.Rp : this.Rt;
    for (const p of this.pieces) {
      if (p === this.dragPiece) continue;
      const s = this._trayPivot(p);
      p.group.visible = true;
      if (animate) {
        const from = { x: p.group.position.x, y: this.H - p.group.position.y, k: p.group.scale.x };
        this._tween(180, (k) => {
          const e = easeOut(k);
          p.group.position.copy(this._w(from.x + (s.x - from.x) * e, from.y + (s.y - from.y) * e));
          p.group.scale.setScalar(from.k + (sc - from.k) * e);
        });
      } else {
        p.group.position.copy(this._w(s.x, s.y));
        p.group.scale.setScalar(sc);
      }
      if (p === this.selected) p.group.position.y += 8;
    }
  }

  // ---------- picker panel ----------
  _initPickerUI() {
    const head = document.createElement('div');
    head.id = 'picker-head';
    head.innerHTML = '<span>Pick a tile</span><button type="button" aria-label="Close">×</button>';
    head.querySelector('button').addEventListener('click', () => this.cancelMode());
    (this.canvas.parentElement || document.body).appendChild(head);
    this.pickerHead = head;
  }

  _openPickerView() {
    const HEAD = 46, PADY = 12, GAPX = 12, GAPY = 10, MX = 8;
    const hud = this._hudBottom();
    const panelBottom = this.H - BAR_H - 4;
    const maxH = panelBottom - (hud + 20);
    const availW = this.W - 2 * (MX + 14);
    const list = [...this.pieces].sort((a, b) => a.numbers[0] - b.numbers[0]);
    const flow = (Rp) => {
      const rows = [];
      let cur = { items: [], w: 0, h: 0 };
      for (const p of list) {
        const pw = p.bounds.w * Rp, ph = p.bounds.h * Rp;
        if (cur.items.length && cur.w + GAPX + pw > availW) { rows.push(cur); cur = { items: [], w: 0, h: 0 }; }
        cur.w += (cur.items.length ? GAPX : 0) + pw;
        cur.h = Math.max(cur.h, ph);
        cur.items.push({ p, pw });
      }
      rows.push(cur);
      return { rows, h: rows.reduce((a, r) => a + r.h, 0) + GAPY * (rows.length - 1) };
    };
    let Rp = Math.min(this.Rt, 28), f = flow(Rp);
    while (f.h + HEAD + PADY * 2 > maxH && Rp > 10) f = flow((Rp -= 1));
    this.Rp = Rp;
    const panelH = f.h + HEAD + PADY * 2;
    const panelTop = panelBottom - panelH;
    this.panelTop = panelTop;
    let y = panelTop + HEAD + PADY;
    for (const row of f.rows) {
      let x = (this.W - row.w) / 2;
      const cy = y + row.h / 2;
      for (const { p, pw } of row.items) {
        p.pickPivot = { x: x + pw / 2 - p.bounds.cx * Rp, y: cy + p.bounds.cy * Rp };
        x += pw + GAPX;
      }
      y += row.h + GAPY;
    }

    const tok = ++this._pickTok;
    this._clear(this.pickerGroup);
    const dim = new THREE.Mesh(new THREE.PlaneGeometry(this.W, this.H), new THREE.MeshBasicMaterial({ color: 0x2b1d0c, transparent: true, opacity: 0 }));
    dim.position.set(this.W / 2, this.H / 2, 120);
    const pw = this.W - MX * 2;
    const border = new THREE.Mesh(roundRectGeo(pw + 8, panelH + 8, 24), new THREE.MeshBasicMaterial({ color: 0xd9a24a }));
    const panel = new THREE.Mesh(roundRectGeo(pw, panelH, 20), new THREE.MeshBasicMaterial({ color: 0xfff5dd }));
    const cyw = this.H - (panelTop + panelBottom) / 2;
    border.position.set(this.W / 2, cyw, 124);
    panel.position.set(this.W / 2, cyw, 125);
    this.pickerGroup.add(dim, border, panel);
    this.pickerDim = dim;
    this.pickerSlide = panelH + BAR_H;
    this.trayGroup.position.z = 150;
    this.pickerHead.style.display = 'flex';
    this.pickerHead.style.top = `${panelTop + 6}px`;
    this.pickerHead.style.left = `${MX}px`;
    this.pickerHead.style.width = `${pw}px`;
    this._tween(220, (k) => {
      if (this._pickTok !== tok) return;
      const e = easeOut(k);
      this.pickerGroup.position.y = -this.pickerSlide * (1 - e);
      dim.material.opacity = 0.45 * e;
    });
    this._positionTray(true);
  }

  _closePickerView() {
    this.pickerMode = false;
    this.pickerHead.style.display = 'none';
    const tok = ++this._pickTok;
    const dim = this.pickerDim;
    this._tween(200, (k) => {
      if (this._pickTok !== tok) return;
      this.pickerGroup.position.y = -(this.pickerSlide || 0) * easeOut(k);
      if (dim) dim.material.opacity = 0.45 * (1 - k);
    }, () => {
      if (this._pickTok !== tok) return;
      this._clear(this.pickerGroup);
      this.pickerGroup.position.y = 0;
      this.trayGroup.position.z = 0;
    });
    this._positionTray(true);
  }

  _pickerPieceAt(pt) {
    for (const p of this.pieces) {
      const piv = this._trayPivot(p);
      for (const [dq, dr] of p.offsets) {
        const u = unitPos(dq, dr);
        if (Math.hypot(pt.x - (piv.x + u.x * this.Rp), pt.y - (piv.y - u.y * this.Rp)) < this.Rp) return p;
      }
    }
    return null;
  }

  // ---------- input ----------
  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this._down(e));
    c.addEventListener('pointermove', (e) => this._move(e));
    c.addEventListener('pointerup', (e) => this._up(e));
    c.addEventListener('pointercancel', (e) => this._up(e, true));
    window.addEventListener('resize', () => this.resize());
  }
  _pt(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _pieceAt(pt) {
    if (pt.y < this.trayTop - 10) return null;
    for (const p of this.pieces) {
      const piv = this._trayPivot(p);
      for (const [dq, dr] of p.offsets) {
        const u = unitPos(dq, dr);
        const cx = piv.x + u.x * this.Rt;
        const cy = piv.y - u.y * this.Rt;
        if (Math.hypot(pt.x - cx, pt.y - cy) < this.Rt * 1.0) return p;
      }
    }
    return null;
  }

  _down(e) {
    if (this.locked || !this.level) return;
    e.preventDefault();
    const pt = this._pt(e);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointer */
    }
    if (this.pickerMode) {
      this.ptr = { id: e.pointerId, start: pt, piece: this._pickerPieceAt(pt), mode: null, picker: true };
      return;
    }
    this.ptr = {
      id: e.pointerId,
      start: pt,
      piece: this.findMode ? null : this._pieceAt(pt),
      mode: null,
      scrollStart: this.scroll,
    };
  }

  _move(e) {
    const s = this.ptr;
    if (!s || s.id !== e.pointerId || s.picker) return;
    const pt = this._pt(e);
    const dx = pt.x - s.start.x;
    const dy = pt.y - s.start.y;
    if (!s.mode && Math.hypot(dx, dy) > 7) {
      if (s.piece && (Math.abs(dy) > Math.abs(dx) * 0.8 || this.maxScroll === 0)) s.mode = 'drag';
      else if (pt.y >= this.trayTop - 10 || s.start.y >= this.trayTop - 10) s.mode = 'scroll';
      else s.mode = 'none';
      if (s.mode === 'drag') this._startDrag(s.piece);
    }
    if (s.mode === 'scroll') {
      this.scroll = clamp(s.scrollStart - dx, 0, this.maxScroll);
      this._positionTray();
    } else if (s.mode === 'drag') {
      this._dragTo(pt);
    }
  }

  _up(e, cancelled = false) {
    const s = this.ptr;
    if (!s || s.id !== e.pointerId) return;
    this.ptr = null;
    const pt = this._pt(e);
    if (s.picker) {
      if (cancelled || !this.pickerMode) return;
      if (s.piece && this._pickerPieceAt(pt) === s.piece) this._pickPiece(s.piece);
      else if (pt.y < this.panelTop) this.cancelMode();
      return;
    }
    if (s.mode === 'drag') {
      if (cancelled) this._returnPiece(this.dragPiece);
      else this._drop(pt);
      return;
    }
    if (s.mode) return; // scroll / none
    if (this.findMode) {
      const cell = this._screenToCell(pt.x, pt.y);
      const k = key(cell[0], cell[1]);
      if (this.cellKeys.has(k) && !this._occupied(k)) this._findCell(cell);
      else this.cancelMode();
      return;
    }
    // ---- tap ----
    if (s.piece) {
      this._select(this.selected === s.piece ? null : s.piece);
    } else if (this.selected) {
      const cell = this._screenToCell(pt.x, pt.y);
      if (this.cellKeys.has(key(cell[0], cell[1])) || this.blockedKeys.has(key(cell[0], cell[1]))) {
        this._attempt(this.selected, cell, null);
      } else {
        this._select(null);
      }
    }
  }

  _select(p) {
    this.selected = p;
    this._positionTray();
    this._updateHighlights(null);
  }

  _startDrag(p) {
    this.dragPiece = p;
    this.selected = null;
    this.trayGroup.remove(p.group);
    this.dragGroup.add(p.group);
    p.group.scale.setScalar(this.R);
    this._positionTray();
  }

  _dragLift() {
    return this.R * 2.3;
  }

  _dragTo(pt) {
    const p = this.dragPiece;
    const piv = { x: pt.x, y: pt.y - this._dragLift() };
    p.group.position.copy(this._w(piv.x, piv.y));
    p.dragPivot = piv;
    const cell = this._screenToCell(piv.x, piv.y);
    const cells = this._pieceCells(p, cell);
    this._dragCells = { piece: p, cell, cells };
    this._updateHighlights(this._dragCells);
  }

  _pieceCells(p, anchor) {
    return p.offsets.map(([dq, dr]) => [anchor[0] + dq, anchor[1] + dr]);
  }

  _fits(cells) {
    return cells.every(([q, r]) => {
      const k = key(q, r);
      if (!this.cellKeys.has(k)) return false;
      return !this._occupied(k);
    });
  }
  _occupied(k) {
    for (const c of Object.values(this.level.givens)) if (key(c[0], c[1]) === k) return true;
    for (const c of this.placed.values()) if (key(c[0], c[1]) === k) return true;
    return false;
  }

  _drop(pt) {
    const p = this.dragPiece;
    const piv = p.dragPivot || { x: pt.x, y: pt.y - this._dragLift() };
    const cell = this._screenToCell(piv.x, piv.y);
    this._dragCells = null;
    this._updateHighlights(null);
    const inBoard = this.cellKeys.has(key(cell[0], cell[1])) || this.blockedKeys.has(key(cell[0], cell[1]));
    if (!inBoard) {
      this._returnPiece(p);
      return;
    }
    this._attempt(p, cell, p);
  }

  /** Try to place piece with its first number on `anchor`. */
  _attempt(p, anchor, dragged) {
    const cells = this._pieceCells(p, anchor);
    if (!this._fits(cells)) {
      // not a legal spot (occupied / blocked / off-board): bounce, no penalty
      this._bounce(p, dragged);
      return;
    }
    const correct = p.numbers.every((n, i) => {
      const s = this.level.solution[n];
      return s[0] === cells[i][0] && s[1] === cells[i][1];
    });
    if (!correct) {
      this._wrong(p, dragged, anchor);
      return;
    }
    this._commit(p, cells);
  }

  _commit(p, cells) {
    if (this.dragPiece === p) {
      this.dragGroup.remove(p.group);
      this.dragPiece = null;
    } else {
      this.trayGroup.remove(p.group);
    }
    p.numbers.forEach((n, i) => this.placed.set(n, cells[i]));
    this.pieces = this.pieces.filter((x) => x !== p);
    this.selected = null;
    this._updateHighlights(null);
    this._buildContent(p.numbers);
    this._reflowTray();
    const pts = cells.map(([q, r]) => this._cellScreen(q, r));
    const mid = { x: pts.reduce((a, s) => a + s.x, 0) / pts.length, y: pts.reduce((a, s) => a + s.y, 0) / pts.length };
    this.hooks.onPlace?.(p.numbers.length, mid, this.pieces.length === 0);
    this._checkWin();
  }

  _reflowTray() {
    let x = TRAY_PAD;
    for (const p of this.pieces) {
      p.slotX = x + p.w / 2;
      x += p.w + TRAY_GAP;
    }
    this.totalTrayW = Math.max(0, x - TRAY_GAP + TRAY_PAD);
    this.maxScroll = Math.max(0, this.totalTrayW - this.W);
    this.scroll = Math.min(this.scroll, this.maxScroll);
    this._positionTray(true);
  }

  _bounce(p, dragged) {
    if (dragged) this._returnPiece(p);
    else this._shake(p);
  }

  _wrong(p, dragged, anchor) {
    // 1) the piece stays on the map while the consecutive number pulses red
    this.locked = true;
    if (this.dragPiece !== p) {
      this.trayGroup.remove(p.group);
      this.dragGroup.add(p.group);
      this.dragPiece = p;
    }
    const s = this._cellScreen(anchor[0], anchor[1]);
    const from = p.group.position.clone();
    const to = this._w(s.x, s.y);
    const fromScale = p.group.scale.x;
    this._tween(140, (k) => {
      const e = easeOut(k);
      p.group.position.lerpVectors(from, to, e);
      p.group.scale.setScalar(fromScale + (this.R - fromScale) * e);
    });
    const hold = Math.max(this._flashNeighbors(p, this._pieceCells(p, anchor)), 450);
    // 2) then the heart is lost and the piece goes back to the list
    this._tween(hold, () => {}, () => {
      this.hooks.onMistake?.();
      this.hearts -= 1;
      this.hooks.onHearts(this.hearts, true);
      this._returnPiece(p);
      if (this.hearts <= 0) {
        setTimeout(() => this.hooks.onFail(), 450);
      } else {
        this.locked = false;
      }
    });
  }

  _shake(p) {
    const base = p.group.position.x;
    this._tween(260, (k) => {
      p.group.position.x = base + Math.sin(k * Math.PI * 6) * 6 * (1 - k);
    }, () => (p.group.position.x = base));
  }

  _returnPiece(p) {
    if (!p) return;
    if (this.dragPiece === p) {
      this.dragGroup.remove(p.group);
      this.trayGroup.add(p.group);
      this.dragPiece = null;
    }
    this._dragCells = null;
    this._updateHighlights(null);
    this._positionTray(true);
  }

  _flash(cells) {
    const meshes = [];
    for (const [q, r] of cells) {
      if (!this.cellKeys.has(key(q, r))) continue;
      const s = this._cellScreen(q, r);
      const m = new THREE.Mesh(HEX_GEO, new THREE.MeshBasicMaterial({ color: COLORS.ghostBad, transparent: true, opacity: 0.55 }));
      m.scale.setScalar(this.R * 0.9);
      m.position.copy(this._w(s.x, s.y, this.R * 0.2));
      this.contentGroup.add(m);
      meshes.push(m);
    }
    this._tween(420, (k) => meshes.forEach((m) => (m.material.opacity = 0.55 * (1 - k))), () => {
      meshes.forEach((m) => {
        this.contentGroup.remove(m);
        m.material.dispose();
      });
    });
  }

  /** Soft red pulse on the map cells holding the numbers consecutive to the wrongly dropped piece. */
  _flashNeighbors(p, cells) {
    // the consecutive numbers (n-1 / n+1) of the dropped piece that already sit on the map;
    // for 2/3-cell pieces only the first number that has any is used
    const known = new Map();
    for (const [n, c] of Object.entries(this.level.givens)) known.set(Number(n), c);
    for (const [n, c] of this.placed) known.set(n, c);
    let best = [];
    for (const [i, n] of p.numbers.entries()) {
      const m = [n - 1, n + 1].find((x) => !p.numbers.includes(x) && known.has(x));
      if (m !== undefined) {
        best = [known.get(m), cells[i]]; // always exactly one pair: the neighbour on the map + the dropped tile
        break;
      }
    }
    if (!best.length) return 0;
    const meshes = [];
    for (const [q, r] of best) {
      const s = this._cellScreen(q, r);
      // drawn on top of everything (the dropped piece sits above the map)
      const mat = () => new THREE.MeshBasicMaterial({ color: COLORS.ghostBad, transparent: true, opacity: 0, depthTest: false });
      const fill = new THREE.Mesh(HEX_GEO, mat());
      fill.scale.setScalar(this.R * 0.96);
      fill.position.copy(this._w(s.x, s.y, this.R * 0.3));
      fill.position.y += this.R * TILE_TOP_LIFT * 0.5;
      const ring = new THREE.Mesh(TILE_RING_GEO, mat());
      ring.scale.setScalar(this.R);
      ring.position.copy(this._w(s.x, s.y, this.R * 0.31));
      ring.position.y += this.R * TILE_TOP_LIFT * 0.5; // tile top is lifted above its base
      fill.renderOrder = ring.renderOrder = 50;
      this.contentGroup.add(fill, ring);
      meshes.push(fill, ring);
    }
    // two quick pulses, starting right away together with the piece snapping in
    const DUR = 560;
    this._tween(DUR, (k) => {
      const a = Math.pow(Math.cos(k * Math.PI * 1.5), 2) * Math.min(1, k * 10) * (1 - k * 0.3);
      meshes.forEach((m, i) => (m.material.opacity = (i % 2 ? 1 : 0.55) * a));
    }, () => {
      meshes.forEach((m) => {
        this.contentGroup.remove(m);
        m.material.dispose();
      });
    });
    return DUR;
  }

  // ---------- highlights (ghost + optional hints) ----------
  _updateHighlights(drag) {
    this._clear(this.hlGroup);
    const settings = this.hooks.getSettings();
    const add = (q, r, color, opacity, z, outline = false) => {
      const s = this._cellScreen(q, r);
      const m = new THREE.Mesh(outline ? OUTLINE_GEO : HEX_GEO, basicMat(color, opacity));
      m.scale.setScalar(this.R * (outline ? 1 : 0.88));
      m.position.copy(this._w(s.x, s.y, z));
      this.hlGroup.add(m);
    };
    if (this.findMode) {
      for (const [q, r] of this._emptyCells()) {
        add(q, r, COLORS.hint, 0.32, this.R * 0.15);
        add(q, r, 0xe0932a, 0.95, this.R * 0.2, true);
      }
    }
    const active = drag?.piece || this.selected;
    if (settings.hints && active && !this.locked) {
      for (const anchor of this._candidateAnchors(active)) add(anchor[0], anchor[1], COLORS.hint, 0.55, this.R * 0.15);
    }
    if (drag) {
      const ok = this._fits(drag.cells);
      for (const [q, r] of drag.cells) {
        if (this.cellKeys.has(key(q, r))) add(q, r, ok ? COLORS.ghostOk : COLORS.ghostBad, 0.95, this.R * 0.25, true);
      }
    }
  }

  /** Soft hint: anchor cells where the piece fits and agrees with already-placed neighbours. */
  _candidateAnchors(p) {
    const known = new Map();
    for (const [n, c] of Object.entries(this.level.givens)) known.set(Number(n), c);
    for (const [n, c] of this.placed) known.set(n, c);
    const out = [];
    for (const [q, r] of this.level.cells) {
      const cells = this._pieceCells(p, [q, r]);
      if (!this._fits(cells)) continue;
      let ok = true;
      p.numbers.forEach((n, i) => {
        for (const m of [n - 1, n + 1]) {
          if (p.numbers.includes(m)) continue;
          const k = known.get(m);
          if (k && !areAdjacent(k, cells[i])) ok = false;
        }
      });
      if (ok) out.push([q, r]);
    }
    return out;
  }

  // ---------- win ----------
  _checkWin() {
    const N = this.level.cells.length;
    const filled = Object.keys(this.level.givens).length + this.placed.size;
    if (filled < N) return;
    this.locked = true;
    const token = ++this._winToken;
    this.hooks.onWinStart?.();
    // 1) gentle wave pulse over the chain (as before)
    const step = Math.min(22, 1000 / N);
    for (let n = 1; n <= N; n++) {
      const t = this.tileGroups.get(n);
      if (!t) continue;
      setTimeout(() => this._winToken === token && this._pulse(t), n * step);
    }
    // 2) numbers vanish, the tiles merge into one lawn, flowers sprout, the finish cell grows a cottage
    setTimeout(() => {
      if (this._winToken !== token) return;
      // garden growth and the result screen (with its map scale-to-fit) play together.
      // _growGarden builds the plan synchronously, so the fit already accounts for the cottage.
      this._growGarden();
      this.hooks.onWin();
    }, N * step + 120);
  }
  _pulse(t) {
    this._tween(220, (k) => t.scale.setScalar(this.R * (1 + 0.12 * Math.sin(k * Math.PI))));
  }

  // ---------- garden (win animation) ----------
  // timeline in ms: lawn fades in over the tiles 0-610, numbers fade 0-300, the cottage pops from 300,
  // plants sprout between 450 and ~2000.
  _clearGarden() {
    this._clear(this.gardenGroup);
    this.gardenPlan = null;
    this.gardenObjs = null;
    this.gardenT = 0;
    this.contentGroup.visible = true;
  }

  /** Random but stable-per-level plan, in cell-relative units so it survives relayouts. */
  _makeGardenPlan() {
    const level = this.level;
    const N = level.cells.length;
    const rnd = mulberry(level.id * 9973 + N * 31 + 7);
    const houseCell = level.solution[N];
    const plants = [];
    // unlocked collection plants (apple tree, mushroom) join the usual flower pool
    const found = this.hooks.getFound?.() ?? [];
    const kinds = [...FLOWER_KINDS, ...PLANT_SPECIES.filter((s) => found.includes(s))];
    for (const [q, r] of level.cells) {
      if (q === houseCell[0] && r === houseCell[1]) continue;
      // sparse: ~1/3 of the cells stay bare, most get a single plant, a few get two
      const roll = rnd();
      const count = roll < 0.35 ? 0 : roll < 0.9 ? 1 : 2;
      const placed = [];
      for (let i = 0; i < count; i++) {
        let dx = 0, dy = 0;
        for (let tries = 0; tries < 8; tries++) {
          const a = rnd() * Math.PI * 2;
          const rad = 0.66 * Math.sqrt(rnd());
          dx = Math.cos(a) * rad;
          dy = Math.sin(a) * rad;
          if (placed.every(([px, py]) => Math.hypot(px - dx, py - dy) > 0.6)) break;
        }
        placed.push([dx, dy]);
        // grass tufts removed (looked off); keep the rnd() draw so flower layout stays stable
        const tuft = rnd() < 0.42;
        if (tuft) { rnd(); rnd(); rnd(); rnd(); continue; }
        const kind = kinds[Math.floor(rnd() * kinds.length)];
        plants.push({
          q, r, dx, dy, kind,
          size: (kind === 'apple' ? 1.7 : 0.78) * (0.85 + rnd() * 0.35),
          flip: rnd() < 0.5 ? -1 : 1,
          delay: 450 + rnd() * 1250,
          ph: rnd() * 6.28,
        });
      }
    }
    const lawnDelay = {};
    for (const [q, r] of level.cells) lawnDelay[key(q, r)] = rnd() * 160;
    return { plants, houseCell, lawnDelay };
  }

  _gardenZ(screenY) {
    return this._tileZ(screenY) + this.R * 0.7;
  }

  _buildGardenObjs() {
    this._clear(this.gardenGroup);
    const plan = this.gardenPlan;
    const R = this.R;
    const objs = { lawn: [], plants: [], house: null };
    for (const [q, r] of this.level.cells) {
      const s = this._cellScreen(q, r);
      const cell = makeLawnCell(q, r, (a, b) => this.cellKeys.has(key(a, b)));
      cell.group.position.copy(this._w(s.x, s.y, this._gardenZ(s.y)));
      cell.group.scale.setScalar(R);
      cell.delay = plan.lawnDelay[key(q, r)] ?? 0;
      this.gardenGroup.add(cell.group);
      objs.lawn.push(cell);
    }
    for (const p of plan.plants) {
      const s = this._cellScreen(p.q, p.r);
      const sy = s.y - p.dy * R;
      const mesh = new THREE.Mesh(spriteGeo(1, 1, PLANT_ANCHOR.ax, PLANT_ANCHOR.ay), plantMaterial(p.kind));
      mesh.position.copy(this._w(s.x + p.dx * R, sy, this._gardenZ(sy) + R * 0.6));
      mesh.position.y += R * TILE_TOP_LIFT;
      mesh.visible = false;
      this.gardenGroup.add(mesh);
      objs.plants.push({ mesh, p });
    }
    const [hq, hr] = plan.houseCell;
    const hs = this._cellScreen(hq, hr);
    const house = new THREE.Mesh(spriteGeo(HOUSE_SIZE, HOUSE_SIZE, HOUSE_ANCHOR.ax, HOUSE_ANCHOR.ay), houseMaterial());
    house.position.copy(this._w(hs.x, hs.y, this._gardenZ(hs.y) + R * 0.6));
    house.position.y += R * TILE_TOP_LIFT;
    house.visible = false;
    this.gardenGroup.add(house);
    objs.house = house;
    // fish jumping out of the pond(s)
    objs.fish = [];
    const water = this.level.blocked || [];
    if (water.length && (this.hooks.getFound?.() ?? []).includes('koi')) {
      const rf = mulberry(this.level.id * 131 + 5);
      const picks = [...water].sort(() => rf() - 0.5).slice(0, Math.min(2, water.length));
      picks.forEach(([q, r], i) => {
        const s = this._cellScreen(q, r);
        const z = this._tileZ(s.y) + R * 1.4;
        const fish = new THREE.Mesh(spriteGeo(1, 1, 0.5, 0.5), fishMaterial());
        const ring = new THREE.Mesh(spriteGeo(1, 1, 0.5, 0.5), rippleMaterial().clone());
        fish.visible = ring.visible = false;
        this.gardenGroup.add(ring, fish);
        objs.fish.push({ fish, ring, s, z, per: 3600 + rf() * 1600, off: i * 1700 + rf() * 1500, dir: rf() < 0.5 ? 1 : -1 });
      });
    }
    // butterflies fluttering around the map
    objs.butterflies = [];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [q, r] of this.level.cells) {
      const s = this._cellScreen(q, r);
      x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y);
    }
    const rb = mulberry(this.level.id * 17 + 3);
    const foundIds = this.hooks.getFound?.() ?? [];
    const flyerDefs = [0, 1, 2, 3].map((i) => ({ mat: butterflyMaterial(i), size: 0.55, fm: 1, flap: 0.016, flapMin: 0.25, flip: false }));
    for (const id of foundIds) {
      const sp = CRITTERS[id];
      if (sp?.type === 'fly') flyerDefs.push({ mat: critterMaterial(id), size: sp.size, fm: sp.fm, flap: sp.flap, flapMin: sp.flapMin, flip: sp.flip });
    }
    // fliers stay over the map: lawn cells plus the ponds
    objs.mapKeys = new Set([...this.cellKeys, ...(this.level.blocked || []).map(([q, r]) => key(q, r))]);
    flyerDefs.forEach((d, i) => {
      const m = new THREE.Mesh(spriteGeo(1, 1, 0.5, 0.5), d.mat);
      m.visible = false;
      this.gardenGroup.add(m);
      objs.butterflies.push({
        m, d, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, ax: ((x1 - x0) / 2) * 0.72, ay: ((y1 - y0) / 2) * 0.72,
        fx: (0.00018 + rb() * 0.00014) * d.fm, fy: (0.00024 + rb() * 0.00016) * d.fm, px: rb() * 6.28, py: rb() * 6.28, fl: rb() * 6.28,
        z: this._tileZ(y1) + R * (2.2 + i * 0.05), rad: d.size * R * 0.5, dir: 1, x: 0, y: 0,
      });
    });
    // dog: a wide, looping, curvy route that sweeps the whole lawn but keeps clear of the cottage and the pond
    objs.dog = null;
    {
      const rd = mulberry(this.level.id * 71 + 11);
      const water = (this.level.blocked || []).map(([q, r]) => this._cellScreen(q, r));
      const hc = this._cellScreen(hq, hr);
      const pts = this.level.cells.map(([q, r]) => this._cellScreen(q, r));
      // keep the dog's whole body on the lawn: a ring around it must stay on land cells (not near the rim)
      const ring = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
      const onLawn = (p, m) => ring.every(([ux, uy]) => {
        const c = this._screenToCell(p.x + ux * R * 0.62 * m, p.y + uy * R * 0.42 * m);
        return this.cellKeys.has(key(c[0], c[1])) && !(c[0] === hq && c[1] === hr);
      });
      const free = (p, m, wk = 1.35) => {
        if (!onLawn(p, m)) return false;
        // the cottage is tall: treat it as a wide ellipse reaching well above its cell
        const hx = (p.x - hc.x) / (R * 1.75 * m), hy = (p.y - (hc.y - R * 0.5)) / (R * 1.75 * m);
        if (hx * hx + hy * hy < 1) return false;
        return water.every((o) => Math.hypot(p.x - o.x, p.y - o.y) > R * wk * m);
      };

      // closed Catmull-Rom through the waypoints, sampled into a fine polyline
      const spline = (w) => {
        const out = [];
        const n = w.length;
        for (let i = 0; i < n; i++) {
          const p0 = w[(i + n - 1) % n], p1 = w[i], p2 = w[(i + 1) % n], p3 = w[(i + 2) % n];
          for (let t = 0; t < 1; t += 1 / 16) {
            const t2 = t * t, t3 = t2 * t;
            const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
            out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
          }
        }
        return out;
      };
      let gx0 = Infinity, gx1 = -Infinity, gy0 = Infinity, gy1 = -Infinity;
      for (const p of pts) { gx0 = Math.min(gx0, p.x); gx1 = Math.max(gx1, p.x); gy0 = Math.min(gy0, p.y); gy1 = Math.max(gy1, p.y); }
      const grid = [];
      for (let gx = gx0 - R; gx <= gx1 + R; gx += R * 0.4) for (let gy = gy0 - R; gy <= gy1 + R; gy += R * 0.4) grid.push({ x: gx, y: gy });
      let cx = 0, cy = 0;
      for (const p of pts) { cx += p.x / pts.length; cy += p.y / pts.length; }
      let best = null;
      // try generous clearances first; on small maps relax them step by step
      for (const m of [1.0, 0.85, 0.7, 0.55, 0.4]) {
        if (best) break;
        const spots = grid.filter((p) => free(p, m));
        if (spots.length < 4) continue;
        for (let attempt = 0; attempt < 150 && !best; attempt++) {
          // pick 6-9 far-flung spots, ordered by angle around the lawn centre so the loop sweeps the whole map
          const want = 6 + Math.floor(rd() * 4);
          const chosen = [];
          for (let n = 0; n < 120 && chosen.length < want; n++) {
            const c = spots[Math.floor(rd() * spots.length)];
            if (chosen.every((o) => Math.hypot(c.x - o.x, c.y - o.y) > R * 1.8 * m)) chosen.push(c);
          }
          if (chosen.length < 4) continue;
          chosen.sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
          const path = spline(chosen);
          if (path.every((p) => free(p, m))) best = path;
        }
      }
      if (best) {
        const segs = [];
        let total = 0;
        for (let i = 0; i < best.length; i++) {
          const p = best[i], q = best[(i + 1) % best.length];
          const len = Math.hypot(q.x - p.x, q.y - p.y);
          segs.push({ a: p, b: q, len, at: total });
          total += len;
        }
        const mesh = new THREE.Mesh(spriteGeo(DOG_ASPECT, 1, DOG_ANCHOR.ax, DOG_ANCHOR.ay), dogMaterial(0));
        mesh.visible = false;
        this.gardenGroup.add(mesh);
        objs.dog = { mesh, segs, total, dir: 1, d: 0, run: 1, blockT: 0, rad: R * 0.37, x: best[0].x, y: best[0].y };
      }

      // ---- ground critters from the collection: wander the lawn on their own, never overlapping each other or the dog ----
      objs.walkers = [];
      const rw = mulberry(this.level.id * 53 + 19);
      const ids = (this.hooks.getFound?.() ?? []).filter((id) => CRITTERS[id]?.type === 'walk');
      for (const id of ids) {
        const sp = CRITTERS[id];
        const fox = id === 'fox';
        const m = Math.max(0.4, Math.min(1, sp.size / 0.62));
        const rad = sp.size * R * (fox ? 0.6 : 0.4);
        const wk = sp.pond && water.length ? 0.9 : 1.35;
        let spots = grid.filter((p) => free(p, m, wk));
        if (sp.pond && water.length) {
          const near = spots.filter((p) => water.some((o) => Math.hypot(p.x - o.x, p.y - o.y) < R * 2.3));
          if (near.length) spots = near;
        }
        if (spots.length < 2) continue;
        // start somewhere clear of the dog and of everyone already placed
        const others = [...objs.walkers, ...(objs.dog ? [objs.dog] : [])];
        let start = null;
        for (let n = 0; n < 80 && !start; n++) {
          const c = spots[Math.floor(rw() * spots.length)];
          if (others.every((o) => this._critterDist(c, o) > (o.rad + rad) * 1.3)) start = c;
        }
        if (!start) continue;
        const mesh = new THREE.Mesh(
          fox ? spriteGeo(DOG_ASPECT, 1, DOG_ANCHOR.ax, DOG_ANCHOR.ay) : spriteGeo(1, 1, CRITTER_ANCHOR.ax, CRITTER_ANCHOR.ay),
          fox ? dogMaterial(0, 'fox') : critterMaterial(id)
        );
        mesh.visible = false;
        this.gardenGroup.add(mesh);
        objs.walkers.push({
          id, sp, mesh, m, wk, rad, spots, fox, x: start.x, y: start.y, tx: start.x, ty: start.y,
          wait: 400 + rw() * 1500, burst: 0, dir: rw() < 0.5 ? 1 : -1, born: null, moving: false, hopK: 0, f: -1,
        });
      }
      objs.freeAt = free;
    }
    this.gardenObjs = objs;
  }

  /** Pure function of this.gardenT: lawn fade, label fade, plant growth, house pop. */
  _applyGarden() {
    const objs = this.gardenObjs;
    if (!objs) return;
    const t = this.gardenT;
    const R = this.R;
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const lawnDone = t >= 650;
    for (const cell of objs.lawn) setLawnOpacity(cell, clamp01((t - cell.delay) / 450));
    // numbers shrink away; the tiles underneath are hidden once the lawn fully covers them
    const labelK = clamp01(t / 300);
    for (const tile of this.tileGroups.values()) {
      const label = tile.children[4];
      if (!label) continue;
      if (!label.userData.own) {
        label.material = label.material.clone();
        label.userData.own = true;
      }
      label.material.opacity = 1 - labelK;
      label.scale.setScalar(0.72 * (1 - 0.4 * labelK));
    }
    this.contentGroup.visible = !lawnDone;
    for (const c of this.boardGroup.children) if (c.userData.land) c.visible = !lawnDone;
    // cottage
    const hk = clamp01((t - 300) / 650);
    objs.house.visible = hk > 0;
    if (hk > 0) {
      const e = easeOutBack(hk);
      objs.house.scale.set(R * (0.5 + 0.5 * e), R * Math.max(0.001, e), 1);
    }
    // plants
    for (const o of objs.plants) {
      const k = clamp01((t - o.p.delay) / 380);
      o.mesh.visible = k > 0;
      if (k > 0) {
        const e = easeOutBack(k);
        const sz = R * o.p.size;
        o.mesh.scale.set(sz * o.p.flip * (0.55 + 0.45 * e), sz * Math.max(0.001, e), 1);
      }
    }
  }

  /** Ambient life on the finished garden: koi leaping from the pond, butterflies drifting about. */
  _animateWildlife(now) {
    const R = this.R;
    const objs = this.gardenObjs;
    const dog = objs.dog;
    const dt = Math.max(0, Math.min(50, objs.lastT == null ? 16 : now - objs.lastT));
    objs.lastT = now;
    const walkers = objs.walkers || [];
    if (dog) {
      // speed up and slow down along the route (sprint / trot)
      const step = (R * 1.9 / 1000) * (1 + 0.37 * Math.sin(now / 1700)) * dt;
      const wrap = (v) => ((v % dog.total) + dog.total) % dog.total;
      const segOf = (d) => dog.segs.find((s) => d >= s.at && d < s.at + s.len) || dog.segs[0];
      const pos = (d) => {
        const s = segOf(d), k = (d - s.at) / s.len;
        return { x: s.a.x + (s.b.x - s.a.x) * k, y: s.a.y + (s.b.y - s.a.y) * k };
      };
      // never step into another critter: wait a moment, then run the loop the other way round
      const nd = wrap(dog.d + dog.run * step);
      const np = pos(nd);
      const hit = walkers.some((w) => {
        const dn = this._critterDist(np, w);
        return dn < dog.rad + w.rad && dn < this._critterDist(dog, w);
      });
      if (hit) {
        dog.blockT += dt;
        if (dog.blockT > 350) { dog.run = -dog.run; dog.blockT = 0; }
      } else {
        dog.blockT = 0;
        dog.d = nd;
      }
      const d = dog.d;
      const seg = segOf(d);
      const { x, y } = pos(d);
      dog.x = x;
      dog.y = y;
      const f = hit ? 0 : Math.floor(now / 70) % DOG_FRAMES;
      const bounce = Math.abs(Math.sin(now / 70 / DOG_FRAMES * Math.PI * 2)) * R * 0.07;
      dog.mesh.visible = true;
      if (dog.f !== f) { dog.mesh.material = dogMaterial(f); dog.f = f; }
      dog.mesh.position.copy(this._w(x, y - bounce, this._gardenZ(y) + R * 0.8));
      dog.mesh.position.y += R * TILE_TOP_LIFT;
      const h = R * 0.62;
      // look a little ahead so the facing follows the curve without flickering at the turns
      const ahead = segOf(wrap(d + dog.run * R * 0.5));
      const vx = (ahead.b.x - ahead.a.x) * dog.run;
      if (Math.abs(vx) > ahead.len * 0.25) dog.dir = vx >= 0 ? 1 : -1;
      dog.mesh.scale.set(dog.dir * h, h, 1);
    }
    for (const w of walkers) this._stepWalker(w, now, dt, walkers, dog);
    for (const f of this.gardenObjs.fish || []) {
      const ph = ((now + f.off) % f.per) / f.per;
      const jump = 0.26; // fraction of the cycle spent airborne
      if (ph > jump) { f.fish.visible = f.ring.visible = false; continue; }
      const k = ph / jump;
      const x = f.s.x + f.dir * (k - 0.5) * R * 0.9;
      const sy = f.s.y - 4 * k * (1 - k) * R * 1.0;
      f.fish.visible = k > 0.03 && k < 0.97;
      f.fish.position.copy(this._w(x, sy, f.z));
      // nose up while rising, down while falling
      f.fish.rotation.z = f.dir * (0.9 - 1.8 * k) * 0.8;
      f.fish.scale.set(R * 0.62 * f.dir, R * 0.62, 1);
      // ripple at take-off, then at landing
      const rk = k < 0.5 ? k / 0.5 : (k - 0.5) / 0.5;
      const rx = f.s.x + f.dir * ((k < 0.5 ? 0 : 1) - 0.5) * R * 0.9;
      f.ring.visible = true;
      f.ring.position.copy(this._w(rx, f.s.y + R * 0.1, f.z - 0.1));
      const rs = R * (0.25 + 0.55 * rk);
      f.ring.scale.set(rs, rs, 1);
      f.ring.material.opacity = 1 - rk;
    }
    // fliers (butterflies, bees, owls) drift on smooth loops; afterwards overlapping pairs are nudged apart
    const fliers = this.gardenObjs.butterflies || [];
    for (const b of fliers) {
      b.x = b.cx + Math.sin(now * b.fx + b.px) * b.ax + Math.sin(now * b.fx * 3.1) * R * 0.15;
      b.y = b.cy + Math.sin(now * b.fy + b.py) * b.ay + Math.sin(now * 0.006 + b.fl) * R * 0.05;
    }
    const mapKeys = this.gardenObjs.mapKeys;
    const inMap = (b) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([ux, uy]) => {
      const c = this._screenToCell(b.x + ux * b.rad * 0.8, b.y + uy * b.rad * 0.6);
      return mapKeys.has(key(c[0], c[1]));
    });
    const clampToMap = () => {
      for (const b of fliers) {
        for (let n = 0; n < 40 && !inMap(b); n++) {
          b.x += (b.cx - b.x) * 0.12;
          b.y += (b.cy - b.y) * 0.12;
        }
      }
    };
    clampToMap();
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < fliers.length; i++) {
        for (let j = i + 1; j < fliers.length; j++) {
          const a = fliers[i], c = fliers[j];
          let dx = c.x - a.x, dy = (c.y - a.y) * 1.4;
          let dist = Math.hypot(dx, dy);
          const min = (a.rad + c.rad) * 1.15;
          if (dist >= min) continue;
          if (dist < 1e-4) { dx = 1; dy = 0; dist = 1; }
          const push = (min - dist) / 2;
          const ux = dx / dist, uy = dy / dist / 1.4;
          // push both apart; whoever would leave the map stays put and the other takes the whole push
          const ax0 = a.x, ay0 = a.y, cx0 = c.x, cy0 = c.y;
          a.x -= ux * push; a.y -= uy * push;
          c.x += ux * push; c.y += uy * push;
          const aOut = !inMap(a), cOut = !inMap(c);
          if (aOut) { a.x = ax0; a.y = ay0; }
          if (cOut) { c.x = cx0; c.y = cy0; }
          if (aOut && !cOut) { c.x += ux * push; c.y += uy * push; if (!inMap(c)) { c.x = cx0; c.y = cy0; } }
          if (cOut && !aOut) { a.x -= ux * push; a.y -= uy * push; if (!inMap(a)) { a.x = ax0; a.y = ay0; } }
        }
      }
    }
    clampToMap();
    for (const b of fliers) {
      const vx = Math.cos(now * b.fx + b.px) * b.fx * b.ax;
      b.m.visible = true;
      b.m.position.copy(this._w(b.x, b.y, b.z));
      const flap = b.d.flapMin + (1 - b.d.flapMin) * Math.abs(Math.sin(now * b.d.flap + b.fl));
      if (b.d.flip && Math.abs(vx) > 1e-5) b.dir = vx >= 0 ? 1 : -1;
      b.m.scale.set(R * b.d.size * flap * b.dir, R * b.d.size, 1);
      b.m.rotation.z = -Math.max(-1, Math.min(1, vx * 6 * (b.d.fm > 1 ? 0.5 : 1))) * 0.35 * b.dir;
    }
  }

  /** Distance between two critters on the lawn (vertical gaps count more: sprites stack upward). */
  _critterDist(a, b) {
    return Math.hypot(a.x - b.x, (a.y - b.y) * 1.5);
  }

  /** Advance one ground critter: stand still, pick a nearby spot, walk / hop there, never touching another critter. */
  _stepWalker(w, now, dt, all, dog) {
    const R = this.R;
    const sp = w.sp;
    const objs = this.gardenObjs;
    if (w.born == null) w.born = now;
    const others = all.filter((o) => o !== w);
    if (dog) others.push(dog);
    const clear = (p) => others.every((o) => {
      const dn = this._critterDist(p, o);
      return dn >= w.rad + o.rad || dn >= this._critterDist(w, o);
    });
    const pickTarget = () => {
      const range = sp.range * R;
      for (let n = 0; n < 24; n++) {
        const c = w.spots[Math.floor(Math.random() * w.spots.length)];
        const dist = Math.hypot(c.x - w.x, c.y - w.y);
        if (dist < R * 0.35 || dist > range) continue;
        // the straight walk there must stay on the lawn
        let ok = true;
        for (let s = 1; s <= 5 && ok; s++) ok = objs.freeAt({ x: w.x + ((c.x - w.x) * s) / 5, y: w.y + ((c.y - w.y) * s) / 5 }, w.m, w.wk);
        if (ok) { w.tx = c.x; w.ty = c.y; return true; }
      }
      return false;
    };
    const rest = () => {
      w.wait = sp.pause[0] + Math.random() * (sp.pause[1] - sp.pause[0]);
      w.moving = false;
      w.hopK = 0;
    };
    if (w.moving === false && w.wait <= 0) {
      if (pickTarget()) { w.moving = true; w.burst = sp.hop || 1e9; } else rest();
    }
    if (w.moving) {
      const dx = w.tx - w.x, dy = w.ty - w.y;
      const dist = Math.hypot(dx, dy);
      if (dist < R * 0.05 || w.burst <= 0) {
        rest();
      } else {
        const stepLen = Math.min(dist, sp.speed * R * dt / 1000 * (sp.hop ? 1 + 0.6 * Math.sin(Math.PI * (1 - w.burst / sp.hop)) : 1));
        const np = { x: w.x + (dx / dist) * stepLen, y: w.y + (dy / dist) * stepLen };
        if (objs.freeAt(np, w.m, w.wk) && clear(np)) {
          w.x = np.x;
          w.y = np.y;
          if (Math.abs(dx) > Math.abs(dy) * 0.3) w.dir = dx >= 0 ? 1 : -1;
          w.burst -= dt;
          if (sp.hop) w.hopK = 1 - Math.max(0, w.burst) / sp.hop;
        } else {
          rest();
          w.wait = Math.min(w.wait, 500);
        }
      }
    } else {
      w.wait -= dt;
    }

    // ---- draw ----
    const h = R * sp.size;
    const born = Math.min(1, (now - w.born) / 450);
    const grow = born < 1 ? easeOutBack(born) : 1;
    const walkPhase = now / (sp.runner ? 90 : 260 + 600 * (1 - Math.min(1, sp.speed)));
    let lift = 0;
    if (sp.hop) lift = w.moving ? Math.sin(Math.PI * w.hopK) * R * 0.2 : 0;
    else if (w.moving && sp.bob) lift = Math.abs(Math.sin(walkPhase * 2)) * R * sp.bob;
    w.mesh.visible = true;
    w.mesh.position.copy(this._w(w.x, w.y - lift, this._gardenZ(w.y) + R * 0.8));
    w.mesh.position.y += R * TILE_TOP_LIFT;
    w.mesh.scale.set(w.dir * h * grow, h * Math.max(0.001, grow), 1);
    w.mesh.rotation.z = w.moving && sp.bob ? Math.sin(walkPhase * 2) * 0.05 * w.dir : sp.hop && w.moving ? (0.5 - w.hopK) * 0.5 * w.dir : 0;
    if (w.fox) {
      const f = w.moving ? Math.floor(now / 80) % DOG_FRAMES : 2;
      if (w.f !== f) { w.mesh.material = dogMaterial(f, 'fox'); w.f = f; }
    }
  }

  _growGarden(done) {
    this.gardenPlan = this._makeGardenPlan();
    this._buildGardenObjs();
    this.gardenT = 0;
    const TOTAL = 2150;
    this._applyGarden();
    this._tween(TOTAL, (k) => {
      this.gardenT = k * TOTAL;
      this._applyGarden();
    }, () => {
      this.gardenT = TOTAL + 1000;
      this._applyGarden();
      done?.();
    });
  }

  // ---------- result screens: camera fit on the finished map ----------
  enterResultView() {
    this.resultMode = true;
    this.trayGroup.visible = this.hlGroup.visible = this.dragGroup.visible = false;
    // fade the clear colour out so the sky backdrop behind the canvas shows through
    const token = this._winToken;
    this._tween(500, (k) => {
      if (!this.resultMode || token !== this._winToken) return;
      this.bgAlpha = 1 - k;
      this._applyClear();
    });
  }

  /** Zoom/pan the camera so the whole map (plus cottage) fits `rectFn()` — a rect in canvas CSS px. */
  fitView(rectFn, dur = 900) {
    this.view = { rectFn, e: 0 };
    const token = this._winToken;
    this._tween(dur, (k) => {
      if (!this.view || token !== this._winToken) return;
      this.view.e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this._applyView();
    });
  }

  exitResultView() {
    this.resultMode = false;
    this.view = null;
    this.bgAlpha = 1;
    this._applyClear();
    this.trayGroup.visible = this.hlGroup.visible = this.dragGroup.visible = true;
    this._applyView();
  }

  _viewBounds() {
    const R = this.R;
    const b = this.boardBox;
    let y0 = b.y0 - 0.5 * R;
    if (this.gardenPlan) {
      const hs = this._cellScreen(this.gardenPlan.houseCell[0], this.gardenPlan.houseCell[1]);
      y0 = Math.min(y0, hs.y - (TILE_TOP_LIFT + HOUSE_REACH) * R - 0.1 * R);
    }
    return { x0: b.x0 - 0.15 * R, x1: b.x1 + 0.15 * R, y0, y1: b.y1 + 0.3 * R };
  }

  _applyView() {
    const cam = this.camera;
    const { W, H } = this;
    const v = this.view;
    if (!v || !this.boardBox) {
      cam.left = 0; cam.right = W; cam.top = H; cam.bottom = 0;
      cam.updateProjectionMatrix();
      return;
    }
    const rect = v.rectFn();
    const b = this._viewBounds();
    const cw = b.x1 - b.x0, ch = b.y1 - b.y0;
    const s1 = Math.min(rect.width / cw, rect.height / ch, 2.4);
    const c0 = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
    const rc = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    const e = v.e;
    const s = 1 + (s1 - 1) * e;
    const px = c0.x + (rc.x - c0.x) * e;
    const py = c0.y + (rc.y - c0.y) * e;
    cam.left = c0.x - px / s;
    cam.right = cam.left + W / s;
    cam.top = H - c0.y + py / s;
    cam.bottom = cam.top - H / s;
    cam.updateProjectionMatrix();
  }

  // ---------- tween + loop ----------
  _tween(dur, update, done) {
    this.tweens.push({ t: 0, dur, update, done });
  }
  _loop(now) {
    const dt = now - this._last;
    this._last = now;
    for (const tw of [...this.tweens]) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.update(k);
      if (k >= 1) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.done?.();
      }
    }
    for (const m of this.revealMarks.values()) m.userData.fill.material.opacity = 0.15 + 0.08 * Math.sin(now / 420);
    for (const w of this.waves || []) {
      const t = now / 1600 + w.ph;
      w.mesh.position.x = w.bx + Math.sin(t) * 0.12;
      w.mesh.material.opacity = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.9 + 1));
    }
    if (this.gardenObjs && this.gardenT > 2200) {
      for (const o of this.gardenObjs.plants) o.mesh.rotation.z = Math.sin(now / 900 + o.p.ph) * (o.p.kind === 'tuft' ? 0.035 : 0.07);
    }
    if (this.gardenObjs && this.gardenT > 2200) this._animateWildlife(now);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._loop);
  }
}

// ---- utils ----
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeOutBack = (k) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};
function seededShuffle(arr, seed) {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
