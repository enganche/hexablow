// Board runtime for the bot: the same rules as src/game.js (a tray piece keeps its shape, it may be
// dropped on any spot where every cell is free; it is correct only on its solution cells, anything else
// costs a heart) plus the player's "perception" of where each piece could go.
import { HB } from './hb.mjs';

const { key, parse, DIRS, dist } = HB;
const RULES = HB.DEFAULT_RULES; // strict anchor mode, same as the level tool

export class Board {
  /** trayOrder: array of piece number-lists in tray order (left to right). */
  constructor(level, trayOrder) {
    this.level = level;
    this.ctx = HB.ctx(level);
    const sol = this.ctx.sol;
    this.N = this.ctx.N;
    this.cellKeys = level.cells.map(([q, r]) => key(q, r));
    this.cellSet = this.ctx.cellSet;
    this.adj = new Map();
    for (const k of this.cellKeys) {
      const [q, r] = parse(k);
      this.adj.set(k, DIRS.map(([dq, dr]) => key(q + dq, r + dr)).filter((x) => this.cellSet.has(x)));
    }
    this.pieces = trayOrder.map((nums) => {
      const b = sol.get(nums[0]);
      return {
        nums,
        id: nums.join('+'),
        offs: nums.map((n) => [sol.get(n)[0] - b[0], sol.get(n)[1] - b[1]]),
        home: key(b[0], b[1]),
      };
    });
    this.grid = new Map(this.ctx.givens); // number -> [q,r] currently on the board
    this.occ = new Set([...this.grid.values()].map((c) => key(c[0], c[1])));
    this.revealed = new Map(); // number -> cell key (Reveal booster)
  }

  get done() {
    return this.pieces.length === 0;
  }
  get filled() {
    return this.grid.size / this.N;
  }

  cellsAt(p, t) {
    const [q, r] = typeof t === 'string' ? parse(t) : t;
    return p.offs.map(([dq, dr]) => key(q + dq, r + dr));
  }

  fits(p, t) {
    return this.cellsAt(p, t).every((k) => this.cellSet.has(k) && !this.occ.has(k));
  }

  /** Every spot the piece physically fits (what a blind drop could hit). */
  allFits(p) {
    const out = [];
    for (const k of this.cellKeys) if (this.fits(p, k)) out.push(k);
    return out;
  }

  isCorrect(p, t) {
    return t === p.home;
  }

  /** Commit a piece on its solution cells. */
  place(p) {
    const cells = this.cellsAt(p, p.home);
    p.nums.forEach((n, i) => {
      this.grid.set(n, parse(cells[i]));
      this.occ.add(cells[i]);
    });
    this.pieces = this.pieces.filter((x) => x !== p);
  }

  /** Owner piece of an empty cell (Find booster / Reveal). */
  ownerOf(cellKey) {
    return this.pieces.find((p) => this.cellsAt(p, p.home).includes(cellKey)) || null;
  }

  emptyCells() {
    return this.cellKeys.filter((k) => !this.occ.has(k));
  }

  /**
   * Depth 0 ("glance"): the level tool's rule — spots that hook onto a number already on the board and
   * touch every n-1 / n+1 present (strict). Orphans (nothing to hook onto) return null.
   */
  surface(p) {
    const info = HB.tileCandidates(this.ctx, p.nums, this.grid, RULES);
    if (info.orphan) return null;
    return info.cands.map((c) => key(c.t[0], c.t[1]));
  }

  /**
   * Bounded constraint propagation, mirroring level-tool/js/solver.js but stopping after `maxDepth` rounds
   * and keeping a snapshot per round: depth d = what a player can deduce with d "passes" of reasoning.
   * Depth 1 = distance-to-nearest-numbers + one pass of neighbour / shape checks.
   * Returns [snapshot for depth 1, depth 2, ...] (shorter when a fixpoint is reached).
   */
  domains(maxDepth) {
    const free = this.cellKeys.filter((k) => !this.occ.has(k));
    const gridKey = new Map([...this.grid].map(([n, c]) => [n, key(c[0], c[1])]));
    const gnums = [...this.grid.keys()].sort((a, b) => a - b);
    const dom = new Map();
    for (const p of this.pieces)
      for (const n of p.nums) {
        if (this.revealed.has(n)) {
          dom.set(n, new Set([this.revealed.get(n)]));
          continue;
        }
        let lo, hi;
        for (const x of gnums) {
          if (x < n) lo = x;
          else if (x > n) { hi = x; break; }
        }
        const d = new Set();
        for (const k of free) {
          const c = parse(k);
          if (lo !== undefined && dist(c, this.grid.get(lo)) > n - lo) continue;
          if (hi !== undefined && dist(c, this.grid.get(hi)) > hi - n) continue;
          d.add(k);
        }
        dom.set(n, d);
      }
    const snaps = [];
    for (let round = 0; round < maxDepth; round++) {
      const changed = this._round(dom, gridKey, free);
      snaps.push(new Map([...dom].map(([n, s]) => [n, new Set(s)])));
      if (!changed) break;
    }
    return snaps;
  }

  _round(dom, gridKey, free) {
    const N = this.N;
    let changed = false;
    // neighbour consistency: n needs n-1 and n+1 next to it (reach = cells adjacent to some candidate of m)
    const reach = new Map();
    const reachOf = (m) => {
      if (reach.has(m)) return reach.get(m);
      let s;
      if (gridKey.has(m)) s = new Set(this.adj.get(gridKey.get(m)));
      else {
        s = new Set();
        for (const k of dom.get(m) || []) for (const x of this.adj.get(k)) s.add(x);
      }
      reach.set(m, s);
      return s;
    };
    for (const [n, d] of dom) {
      for (const k of [...d]) {
        const okLo = n - 1 < 1 || reachOf(n - 1).has(k);
        const okHi = n + 1 > N || reachOf(n + 1).has(k);
        if (!okLo || !okHi) { d.delete(k); changed = true; }
      }
    }
    // a number pinned to one cell takes it away from everybody else
    for (const [n, d] of dom) {
      if (d.size !== 1) continue;
      const [k] = d;
      for (const [m, e] of dom) if (m !== n && e.size > 1 && e.delete(k)) changed = true;
    }
    // tray pieces keep their shape
    for (const p of this.pieces) {
      const doms = p.nums.map((n) => dom.get(n));
      const support = p.nums.map(() => new Set());
      for (const k of doms[0]) {
        const ks = this.cellsAt(p, k);
        if (ks.every((c, i) => doms[i].has(c))) ks.forEach((c, i) => support[i].add(c));
      }
      p.nums.forEach((n, i) => {
        for (const c of [...doms[i]]) if (!support[i].has(c)) { doms[i].delete(c); changed = true; }
      });
    }
    // a free cell that only one number can still take must be that number
    for (const k of free) {
      let owner = -1, c = 0;
      for (const [n, d] of dom) if (d.has(k)) { c++; owner = n; if (c > 1) break; }
      if (c === 1 && dom.get(owner).size > 1) { dom.set(owner, new Set([k])); changed = true; }
    }
    return changed;
  }

  /** Spots for piece p allowed by a domain snapshot. */
  fromDomains(p, snap) {
    const out = [];
    for (const k of snap.get(p.nums[0]) || []) {
      const ks = this.cellsAt(p, k);
      if (ks.every((c, i) => snap.get(p.nums[i])?.has(c) && !this.occ.has(c))) out.push(k);
    }
    return out;
  }
}
