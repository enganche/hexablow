import * as THREE from 'three';
import { axialToPixel, pixelToAxial, key, areAdjacent, DIRS } from './hex.js';
import {
  LIFT, mulberry, makeLawnCell, setLawnOpacity, spriteGeo, plantMaterial, PLANT_ANCHOR, FLOWER_KINDS,
  houseMaterial, HOUSE_SIZE, HOUSE_ANCHOR, HOUSE_REACH,
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
const TUTORIAL_GAP = 60; // HUD bottom -> board top; the tutorial bubble (~44px) lives in here
const TRAY_GAP = 20;

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

const WAX_RIM = waxSurface(0xfbe3ad, 0xf5d596, TILE_BODY_GEO);
const WAX_WALL = waxSurface(0xdfb479, 0xfce4b3);
const WAX_FLOOR = waxSurface(0xe9be7f, 0xfce1aa);
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
function labelMaterial(n) {
  if (!labelCache.has(n)) {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#7a3d12';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const digits = String(n).length;
    const fs = digits >= 3 ? 70 : digits === 2 ? 88 : 104;
    g.font = `900 ${fs}px "Nunito", ui-rounded, system-ui, sans-serif`;
    g.strokeStyle = '#7a3d12';
    g.lineJoin = 'round';
    g.lineWidth = 6;
    g.strokeText(String(n), size / 2, size / 2 + 5);
    g.fillText(String(n), size / 2, size / 2 + 5);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    labelCache.set(n, new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  }
  return labelCache.get(n);
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
const GARDEN_Z = 12; // lift the lawn above the board / water layer
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
  const label = new THREE.Mesh(LABEL_GEO, labelMaterial(n));
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
    this.renderer.setClearColor(this.bgColor, 1);
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
    this.scene.add(this.boardGroup, this.hlGroup, this.contentGroup, this.gardenGroup, this.trayGroup, this.dragGroup);
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
    this.hooks.onHearts(this.hearts, false);
    this.pieces = buildPieces(level).map((p) => ({ ...p, group: null, slot: { x: 0, y: 0 }, scale: 1 }));
    // deterministic shuffle so the tray order is not the solution order
    this.pieces = seededShuffle(this.pieces, opts.randomOrder ? Math.floor(Math.random() * 4294967296) : level.id * 7919);
    this._layout();
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
      hudBottom: document.getElementById('hud')?.getBoundingClientRect().bottom || 96,
    };
  }

  /** Paid helper: place the piece holding the lowest missing number. Returns false if busy/nothing to place. */
  hint() {
    if (!this.level || this.locked || this.dragPiece || !this.pieces.length) return false;
    const p = this.pieces.reduce((a, b) => (Math.min(...b.numbers) < Math.min(...a.numbers) ? b : a));
    const cells = this._pieceCells(p, this.level.solution[p.numbers[0]]);
    this._commit(p, cells);
    return true;
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
  setBackground(hex) {
    this.bgColor = new THREE.Color(hex);
    this.renderer.setClearColor(this.bgColor, this.bgAlpha);
  }

  refreshHints() {
    this._updateHighlights(this._dragCells || null);
  }

  // ---------- layout ----------
  _layout() {
    const { W, H, level } = this;
    if (!level) return;
    const hud = document.getElementById('hud')?.getBoundingClientRect().bottom || 96;
    const trayH = Math.max(118, Math.min(170, H * 0.2));
    const trayBottomPad = 44;
    this.trayCenterY = H - trayBottomPad - trayH / 2;
    this.trayTop = H - trayBottomPad - trayH;
    // fixed gap under the HUD (room for the tutorial bubble) so the board never moves when it shows
    const areaTop = hud + TUTORIAL_GAP;
    const areaBottom = this.trayTop - 54; // room for the coin / hint toolbar above the tray

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
    const padX = 20;
    this.R = Math.min((W - padX * 2) / bw, (areaBottom - areaTop) / bh, 58);
    this.boardCx = (minX + maxX) / 2;
    this.boardCy = (minY + maxY) / 2;
    this.boardScreenX = W / 2;
    this.boardScreenY = areaTop + (bh * this.R) / 2; // anchored to the top, not centred
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
    this.hooks.onLayout?.({ trayTop: this.trayTop });
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
      t.position.copy(this._w(s.x, s.y, (s.y - this.boardScreenY) * TILE_ROW_DEPTH));
      t.scale.setScalar(this.R);
      this.contentGroup.add(t);
      this.tileGroups.set(n, t);
      if (popNumbers && popNumbers.includes(n)) {
        t.scale.setScalar(this.R * 0.6);
        this._tween(150, (k) => t.scale.setScalar(this.R * (0.6 + 0.4 * easeOutBack(k))));
      }
    }
  }

  // ---------- tray ----------
  _buildTray() {
    this._clear(this.trayGroup);
    this._clear(this.dragGroup);
    const bounds = this.pieces.map((p) => pieceBounds(p.offsets));
    const maxH = Math.max(1, ...bounds.map((b) => b.h));
    const trayH = this.H - 44 - this.trayTop;
    this.Rt = Math.max(13, Math.min(this.R * 0.8, (trayH * 0.92) / maxH, 34));

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
    const show = this.maxScroll > 1 && this.pieces.length > 0;
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
    for (const p of this.pieces) {
      if (p === this.dragPiece) continue;
      const s = this._trayPivot(p);
      p.group.visible = true;
      if (animate) {
        const from = { x: p.group.position.x, y: this.H - p.group.position.y, k: p.group.scale.x };
        this._tween(180, (k) => {
          const e = easeOut(k);
          p.group.position.copy(this._w(from.x + (s.x - from.x) * e, from.y + (s.y - from.y) * e));
          p.group.scale.setScalar(from.k + (this.Rt - from.k) * e);
        });
      } else {
        p.group.position.copy(this._w(s.x, s.y));
        p.group.scale.setScalar(this.Rt);
      }
      if (p === this.selected) p.group.position.y += 8;
    }
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
    this.ptr = {
      id: e.pointerId,
      start: pt,
      piece: this._pieceAt(pt),
      mode: null,
      scrollStart: this.scroll,
    };
  }

  _move(e) {
    const s = this.ptr;
    if (!s || s.id !== e.pointerId) return;
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
    if (s.mode === 'drag') {
      if (cancelled) this._returnPiece(this.dragPiece);
      else this._drop(pt);
      return;
    }
    if (s.mode) return; // scroll / none
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
    this.hooks.onPlace?.(p.numbers.length);
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
      this._growGarden(() => {
        setTimeout(() => this._winToken === token && this.hooks.onWin(), 500);
      });
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
    for (const [q, r] of level.cells) {
      if (q === houseCell[0] && r === houseCell[1]) continue;
      const count = 2 + (rnd() < 0.45 ? 1 : 0);
      const placed = [];
      for (let i = 0; i < count; i++) {
        let dx = 0, dy = 0;
        for (let tries = 0; tries < 8; tries++) {
          const a = rnd() * Math.PI * 2;
          const rad = 0.66 * Math.sqrt(rnd());
          dx = Math.cos(a) * rad;
          dy = Math.sin(a) * rad;
          if (placed.every(([px, py]) => Math.hypot(px - dx, py - dy) > 0.42)) break;
        }
        placed.push([dx, dy]);
        const tuft = rnd() < 0.42;
        const kind = tuft ? 'tuft' : FLOWER_KINDS[Math.floor(rnd() * FLOWER_KINDS.length)];
        plants.push({
          q, r, dx, dy, kind,
          size: (tuft ? 0.62 : 0.78) * (0.85 + rnd() * 0.35),
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
    return GARDEN_Z + (screenY - this.boardScreenY) * TILE_ROW_DEPTH;
  }

  _buildGardenObjs() {
    this._clear(this.gardenGroup);
    const plan = this.gardenPlan;
    const R = this.R;
    const objs = { lawn: [], plants: [], house: null };
    for (const [q, r] of this.level.cells) {
      const s = this._cellScreen(q, r);
      const cell = makeLawnCell(q, r);
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
      this.renderer.setClearColor(this.bgColor, this.bgAlpha);
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
    this.renderer.setClearColor(this.bgColor, 1);
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
    for (const w of this.waves || []) {
      const t = now / 1600 + w.ph;
      w.mesh.position.x = w.bx + Math.sin(t) * 0.12;
      w.mesh.material.opacity = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.9 + 1));
    }
    if (this.gardenObjs && this.gardenT > 2200) {
      for (const o of this.gardenObjs.plants) o.mesh.rotation.z = Math.sin(now / 900 + o.p.ph) * (o.p.kind === 'tuft' ? 0.035 : 0.07);
    }
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
