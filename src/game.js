import * as THREE from 'three';
import { axialToPixel, pixelToAxial, key, areAdjacent } from './hex.js';

// ---- Palette (simple, flat) ----
const COLORS = {
  bg: 0xf7f1e6,
  cell: 0xfffdf8,
  cellEdge: 0xe6dcc8,
  tile: 0x2fb8a8,
  tileBase: 0x1f8f82,
  given: 0xf2994a,
  givenBase: 0xc9762b,
  water: 0x8fd8ea,
  waterEdge: 0x6cc3d9,
  bar: 0x147d72,
  barGiven: 0xa85f1c,
  hint: 0xf5c84b,
  ghostOk: 0x2fb8a8,
  ghostBad: 0xef6f6c,
};

const MAX_HEARTS = 3;
const TRAY_PAD = 18;
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
const BAR_GEO = new THREE.PlaneGeometry(1, 1);
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
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const digits = String(n).length;
    const fs = digits >= 3 ? 52 : digits === 2 ? 64 : 76;
    g.font = `800 ${fs}px "Nunito", ui-rounded, system-ui, sans-serif`;
    g.fillText(String(n), size / 2, size / 2 + 4);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    labelCache.set(n, new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  }
  return labelCache.get(n);
}

/** One number tile in unit space: base (shadow), face, label. */
function makeTile(n, given) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(HEX_GEO, basicMat(given ? COLORS.givenBase : COLORS.tileBase));
  base.scale.setScalar(0.92);
  base.position.set(0, -0.1, 0.1);
  const face = new THREE.Mesh(HEX_GEO, basicMat(given ? COLORS.given : COLORS.tile));
  face.scale.setScalar(0.92);
  face.position.set(0, 0, 0.2);
  const label = new THREE.Mesh(LABEL_GEO, labelMaterial(n));
  label.scale.setScalar(0.62);
  label.position.set(0, 0, 0.5);
  g.add(base, face, label);
  return g;
}

/** Connector bar between two unit-space points (y-up). */
function makeBar(a, b, color) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const m = new THREE.Mesh(BAR_GEO, basicMat(color));
  m.scale.set(len, 0.2, 1);
  m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, 0.35);
  m.rotation.z = Math.atan2(dy, dx);
  return m;
}

// unit position helpers: y flipped so world is y-up
const unitPos = (q, r) => {
  const p = axialToPixel(q, r, 1);
  return { x: p.x, y: -p.y };
};

// ---- Level helpers ----
/** Split solution into tray pieces: runs of consecutive numbers that are not givens. */
function buildPieces(level) {
  const N = level.cells.length;
  const pieces = [];
  let run = [];
  for (let n = 1; n <= N + 1; n++) {
    if (n <= N && !level.givens[n]) run.push(n);
    else if (run.length) {
      pieces.push(run);
      run = [];
    }
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
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setClearColor(COLORS.bg, 1);
    this.scene = new THREE.Scene();
    // Deep depth range: tile groups are uniformly scaled by cell size, so z scales too.
    this.camera = new THREE.OrthographicCamera(0, 100, 100, 0, 1, 4000);
    this.camera.position.z = 2000;

    this.boardGroup = new THREE.Group();
    this.hlGroup = new THREE.Group();
    this.contentGroup = new THREE.Group();
    this.trayGroup = new THREE.Group();
    this.dragGroup = new THREE.Group();
    this.scene.add(this.boardGroup, this.hlGroup, this.contentGroup, this.trayGroup, this.dragGroup);
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
    this.resize();
    this._last = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // ---------- public ----------
  loadLevel(level) {
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
    this.pieces = seededShuffle(this.pieces, level.id * 7919);
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

  refreshHints() {
    this._updateHighlights(this._dragCells || null);
  }

  // ---------- layout ----------
  _layout() {
    const { W, H, level } = this;
    if (!level) return;
    const hud = document.getElementById('hud')?.getBoundingClientRect().bottom || 96;
    const trayH = Math.max(118, Math.min(170, H * 0.2));
    const trayBottomPad = 18;
    this.trayCenterY = H - trayBottomPad - trayH / 2;
    this.trayTop = H - trayBottomPad - trayH;
    const areaTop = hud + 8;
    const areaBottom = this.trayTop - 14;

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
    this.boardScreenY = (areaTop + areaBottom) / 2;

    this._buildBoard();
    this._buildContent(null);
    this._buildTray();
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
    this.cellKeys = new Set(this.level.cells.map(([q, r]) => key(q, r)));
    this.blockedKeys = new Set(this.level.blocked.map(([q, r]) => key(q, r)));
    const mk = (q, r, fill, edge) => {
      const s = this._cellScreen(q, r);
      const g = new THREE.Group();
      const e = new THREE.Mesh(HEX_GEO, basicMat(edge));
      e.scale.setScalar(0.95);
      const f = new THREE.Mesh(HEX_GEO, basicMat(fill));
      f.scale.setScalar(0.86);
      f.position.z = 0.05;
      g.add(e, f);
      g.position.copy(this._w(s.x, s.y));
      g.scale.setScalar(this.R);
      this.boardGroup.add(g);
    };
    for (const [q, r] of this.level.cells) mk(q, r, COLORS.cell, COLORS.cellEdge);
    for (const [q, r] of this.level.blocked) mk(q, r, COLORS.water, COLORS.waterEdge);
  }

  /** Rebuild given + placed tiles and connectors. `popNumbers`: numbers to animate in. */
  _buildContent(popNumbers) {
    this._clear(this.contentGroup);
    this.tileGroups.clear();
    const pos = new Map();
    for (const [n, c] of Object.entries(this.level.givens)) pos.set(Number(n), { c, given: true });
    for (const [n, c] of this.placed) pos.set(n, { c, given: false });

    // bars first (drawn under tile labels via z), then tiles
    const N = this.level.cells.length;
    for (let n = 1; n < N; n++) {
      const a = pos.get(n);
      const b = pos.get(n + 1);
      if (!a || !b || !areAdjacent(a.c, b.c)) continue;
      const sa = this._cellScreen(a.c[0], a.c[1]);
      const sb = this._cellScreen(b.c[0], b.c[1]);
      const bothGiven = a.given && b.given;
      const bar = makeBar(
        { x: 0, y: 0 },
        { x: (sb.x - sa.x) / this.R, y: -(sb.y - sa.y) / this.R },
        bothGiven ? COLORS.barGiven : COLORS.bar
      );
      const holder = new THREE.Group();
      holder.add(bar);
      holder.position.copy(this._w(sa.x, sa.y));
      holder.scale.setScalar(this.R);
      this.contentGroup.add(holder);
    }
    for (const [n, { c, given }] of pos) {
      const s = this._cellScreen(c[0], c[1]);
      const t = makeTile(n, given);
      t.position.copy(this._w(s.x, s.y));
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
    const trayH = this.H - 18 - this.trayTop;
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
    for (let i = 0; i < p.numbers.length - 1; i++) {
      g.add(makeBar(upos[i], upos[i + 1], COLORS.bar));
    }
    p.numbers.forEach((n, i) => {
      const t = makeTile(n, false);
      t.position.set(upos[i].x, upos[i].y, 0);
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

  _positionTray(animate = false) {
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
    this.hooks.onMistake?.();
    this.hearts -= 1;
    this.hooks.onHearts(this.hearts, true);
    if (dragged) this._returnPiece(p);
    else this._shake(p);
    // flash the attempted cells red briefly
    const cells = this._pieceCells(p, anchor);
    this._flash(cells);
    if (this.hearts <= 0) {
      this.locked = true;
      setTimeout(() => this.hooks.onFail(), 450);
    }
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

  // ---------- highlights (ghost + optional hints) ----------
  _updateHighlights(drag) {
    this._clear(this.hlGroup);
    const settings = this.hooks.getSettings();
    const add = (q, r, color, opacity, z) => {
      const s = this._cellScreen(q, r);
      const m = new THREE.Mesh(HEX_GEO, basicMat(color, opacity));
      m.scale.setScalar(this.R * 0.88);
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
        if (this.cellKeys.has(key(q, r))) add(q, r, ok ? COLORS.ghostOk : COLORS.ghostBad, 0.35, this.R * 0.18);
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
    // gentle wave pulse over the chain
    for (let n = 1; n <= N; n++) {
      const t = this.tileGroups.get(n);
      if (!t) continue;
      setTimeout(() => this._pulse(t), n * 22);
    }
    setTimeout(() => this.hooks.onWin(), N * 22 + 450);
  }
  _pulse(t) {
    this._tween(220, (k) => t.scale.setScalar(this.R * (1 + 0.12 * Math.sin(k * Math.PI))));
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
