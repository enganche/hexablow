// Generates src/levels.json, modelled on the first 10 levels of the reference game:
//  * the solution path is REGULAR (few turns: spirals / snakes), not a random scribble;
//  * givens are spread evenly (alternating early on, gaps of up to 2-3 later), 1 and N given;
//  * drawing the path and cutting the tray are TWO INDEPENDENT steps (like the reference game): the board
//    is cut into random groups of 1-3 ADJACENT cells, which may hold non-consecutive numbers (a 2 next
//    to a 26). A piece keeps the exact shape it has in the solution, so it can bend in ANY direction;
//  * every level must be solvable by pure logic (no guessing), checked by `logicSolve`, which also
//    uses the shape of the tray pieces (a 3-chain only fits where its shape fits).
// Run: npm run levels
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DIRS, key, hexDistance } from '../src/hex.js';

const here = dirname(fileURLToPath(import.meta.url));

// ---------- helpers ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function hexRegion(radius) {
  const cells = [];
  for (let q = -radius; q <= radius; q++)
    for (let r = -radius; r <= radius; r++)
      if (Math.abs(q + r) <= radius) cells.push([q, r]);
  return cells;
}
const minus = (region, holes) => {
  const h = new Set(holes.map(([q, r]) => key(q, r)));
  return region.filter(([q, r]) => !h.has(key(q, r)));
};
const parse = (k) => k.split(',').map(Number);
const dirIdx = (a, b) => {
  const [aq, ar] = parse(a);
  const [bq, br] = parse(b);
  return DIRS.findIndex(([dq, dr]) => dq === bq - aq && dr === br - ar);
};
const turnCost = (d1, d2) => {
  const t = Math.abs(d1 - d2) % 6;
  return Math.min(t, 6 - t);
};
/** number of direction changes along a path of [q,r] cells (lower = more regular) */
function pathTurns(path) {
  let turns = 0, prev = -1;
  for (let i = 1; i < path.length; i++) {
    const d = dirIdx(key(...path[i - 1]), key(...path[i]));
    if (prev >= 0 && d !== prev) turns++;
    prev = d;
  }
  return turns;
}

// ---------- Hamiltonian path (random DFS, Warnsdorff + straightness, connectivity prune) ----------
function findPath(cells, rand, budget = 300000) {
  const set = new Set(cells.map(([q, r]) => key(q, r)));
  const N = cells.length;
  const adj = new Map();
  for (const k of set) {
    const [q, r] = parse(k);
    adj.set(k, DIRS.map(([dq, dr]) => key(q + dq, r + dr)).filter((x) => set.has(x)));
  }
  let nodes = 0;
  const visited = new Set();
  const path = [];

  const connected = (from) => {
    const seen = new Set([from]);
    const stack = [from];
    while (stack.length) {
      const c = stack.pop();
      for (const n of adj.get(c)) if (!visited.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
    }
    return seen.size === N - visited.size + 1;
  };

  const dfs = (cur) => {
    if (path.length === N) return true;
    if (++nodes > budget) return false;
    const prev = path.length > 1 ? dirIdx(path[path.length - 2], cur) : -1;
    const opts = adj.get(cur).filter((n) => !visited.has(n));
    const scored = shuffle(opts, rand).map((n) => ({
      n,
      s: adj.get(n).filter((m) => !visited.has(m)).length + (prev < 0 ? 0 : turnCost(prev, dirIdx(cur, n)) * 0.7),
    }));
    scored.sort((a, b) => a.s - b.s);
    for (const { n } of scored) {
      visited.add(n);
      path.push(n);
      if (connected(n) && dfs(n)) return true;
      path.pop();
      visited.delete(n);
      if (nodes > budget) return false;
    }
    return false;
  };

  const starts = shuffle([...set], rand);
  for (const s of starts.slice(0, 12)) {
    nodes = 0;
    visited.clear();
    path.length = 0;
    visited.add(s);
    path.push(s);
    if (dfs(s)) return path.map(parse);
  }
  return null;
}

// ---------- Logic solver: arc-consistency + singles (what a human can deduce) ----------
// Returns true iff the level is fully solved by propagation alone (=> unique, no guessing).
function logicSolve(cells, givens, pieces = []) {
  const N = cells.length;
  const keys = cells.map(([q, r]) => key(q, r));
  const cellSet = new Set(keys);
  const adj = new Map();
  for (const k of keys) {
    const [q, r] = parse(k);
    adj.set(k, new Set(DIRS.map(([dq, dr]) => key(q + dq, r + dr)).filter((x) => cellSet.has(x))));
  }
  const givenKey = new Map([...givens].map(([n, c]) => [n, key(c[0], c[1])]));
  const takenByGiven = new Set(givenKey.values());
  const freeCells = keys.filter((k) => !takenByGiven.has(k));
  const gnums = [...givens.keys()].sort((a, b) => a - b);

  const dom = new Map();
  for (let n = 1; n <= N; n++) {
    if (givens.has(n)) continue;
    const lo = [...gnums].reverse().find((g) => g < n);
    const hi = gnums.find((g) => g > n);
    const d = new Set();
    for (const k of freeCells) {
      const c = parse(k);
      if (lo !== undefined && hexDistance(c, givens.get(lo)) > n - lo) continue;
      if (hi !== undefined && hexDistance(c, givens.get(hi)) > hi - n) continue;
      d.add(k);
    }
    dom.set(n, d);
  }
  const neighbourOk = (k, m) => {
    if (m < 1 || m > N) return true;
    if (givens.has(m)) return adj.get(k).has(givenKey.get(m));
    for (const x of dom.get(m)) if (adj.get(k).has(x)) return true;
    return false;
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const [n, d] of dom) {
      for (const k of [...d]) {
        if (!neighbourOk(k, n - 1) || !neighbourOk(k, n + 1)) { d.delete(k); changed = true; }
      }
      if (d.size === 0) return false;
    }
    for (const [n, d] of dom) {
      if (d.size !== 1) continue;
      const [k] = d;
      for (const [m, e] of dom) if (m !== n && e.delete(k)) changed = true;
    }
    // piece shapes: a chain keeps its offsets, so every cell must belong to a valid placement
    for (const { nums, offs } of pieces) {
      const doms = nums.map((n) => dom.get(n));
      const support = nums.map(() => new Set());
      for (const k of doms[0]) {
        const [q, r] = parse(k);
        const ks = offs.map(([dq, dr]) => key(q + dq, r + dr));
        if (ks.every((c, i) => doms[i].has(c))) ks.forEach((c, i) => support[i].add(c));
      }
      nums.forEach((n, i) => {
        for (const c of [...doms[i]]) if (!support[i].has(c)) { doms[i].delete(c); changed = true; }
      });
      if (doms.some((d) => d.size === 0)) return false;
    }
    for (const k of freeCells) {
      const owners = [...dom].filter(([, d]) => d.has(k)).map(([n]) => n);
      if (owners.length === 0) return false;
      if (owners.length === 1 && dom.get(owners[0]).size > 1) {
        dom.set(owners[0], new Set([k]));
        changed = true;
      }
    }
  }
  return [...dom.values()].every((d) => d.size === 1);
}

// ---------- Tray pieces: the CUT is a spatial cut of the board, independent of the path ----------
// Like the reference game, drawing the path and cutting the tiles are two separate steps:
//   1. the path is drawn (numbers 1..N over the cells);
//   2. the board is cut into random groups of 1..3 ADJACENT cells. A group is a piece of the tray and
//      may hold NON-consecutive numbers (e.g. a "2" touching a "26"), because it is cut by position,
//      not by counting. Givens are removed from the groups afterwards.
// sizes = [w1, w2, w3] relative weights of 1-, 2- and 3-cell groups; levels ramp from lone tiles only,
// to pairs appearing, to triples appearing (see the specs below).
// CONSEC_P: chance that a neighbour with a consecutive number is taken anyway (the cut is blind to the
// path, but a pure random cut would glue n,n+1 together far too often).
const CONSEC_P = 0.2;
// `num` (cell key -> number) is used to mostly AVOID gluing consecutive numbers (n, n+1) together: a cut
// that follows the path would make the tray predictable, so neighbours are taken across the path.
function cutBoard(cells, sizes, rand, num) {
  const consec = (a, b) => Math.abs(num.get(a) - num.get(b)) === 1;
  const keys = cells.map(([q, r]) => key(q, r));
  const free = new Set(keys);
  const groups = [];
  const w = sizes;
  const maxSize = w[2] > 0 ? 3 : w[1] > 0 ? 2 : 1; // pieces never exceed the sizes this level allows
  const pMerge = (w[1] + w[2]) / (w[0] + w[1] + w[2]); // levels that want lone tiles keep them
  for (const start of shuffle(keys, rand)) {
    if (!free.has(start)) continue;
    let x = rand() * w.reduce((p, q) => p + q, 0), want = 1;
    for (let k = 0; k < 3; k++) { if ((x -= w[k]) < 0) { want = k + 1; break; } }
    const group = [start];
    free.delete(start);
    while (group.length < want) {
      const opts = [];
      for (const c of group) {
        const [q, r] = parse(c);
        for (const [dq, dr] of DIRS) { const k = key(q + dq, r + dr); if (free.has(k)) opts.push(k); }
      }
      // consecutive numbers MAY share a piece, just not by default: only CONSEC_P of the time
      const apart = opts.filter((k) => !group.some((c) => consec(c, k)));
      const pool = apart.length && rand() >= CONSEC_P ? apart : opts;
      if (!pool.length) break;
      const nx = pool[Math.floor(rand() * pool.length)];
      group.push(nx);
      free.delete(nx);
    }
    groups.push(group);
  }
  // leftover lone tiles: glue each onto a touching group that still has room (max 3 cells)
  const touching = (g, h) => g.some((c) => {
    const [q, r] = parse(c);
    return DIRS.some(([dq, dr]) => h.includes(key(q + dq, r + dr)));
  });
  for (const g of shuffle(groups.filter((x) => x.length === 1), rand)) {
    if (g.length !== 1 || rand() >= pMerge) continue; // g may already have received another lone tile
    const hosts = groups.filter((h) => h !== g && h.length < maxSize && touching(g, h));
    const apartHosts = hosts.filter((h) => !h.some((c) => consec(c, g[0])));
    if (apartHosts.length && rand() >= CONSEC_P) hosts.splice(0, hosts.length, ...apartHosts);
    if (!hosts.length) continue;
    hosts.sort((u, v) => u.length - v.length || rand() - 0.5); // prefer lone tile -> pair
    // growing a pair into a triple only happens as often as the level's triple weight says
    if (hosts[0].length >= 2 && rand() >= w[2] / (w[1] + w[2])) continue;
    hosts[0].push(g[0]);
    groups.splice(groups.indexOf(g), 1);
  }
  return groups;
}
/** groups of free cells -> tray pieces (numbers ascending) */
function derivePieces(groups, sol) {
  const num = new Map([...sol].map(([n, c]) => [key(c[0], c[1]), n]));
  return groups
    .map((g) => g.map((k) => num.get(k)).sort((x, y) => x - y))
    .sort((x, y) => x[0] - y[0]);
}
const withShapes = (pieces, sol) =>
  pieces.map((nums) => ({
    nums,
    offs: nums.map((n) => [sol.get(n)[0] - sol.get(nums[0])[0], sol.get(n)[1] - sol.get(nums[0])[1]]),
  }));

// ---------- Givens: evenly spread, then topped up until logic-solvable (with the pieces) ----------
function makeGivens(cells, sol, N, maxGap, gapP, sizes, seed, rand) {
  const g = new Map([[1, sol.get(1)]]);
  let n = 1;
  for (;;) {
    let m = 1;
    while (m < maxGap && rand() < gapP) m++; // number of missing values until the next given
    n += m + 1;
    if (n >= N) break;
    g.set(n, sol.get(n));
  }
  g.set(N, sol.get(N));
  const solved = () => {
    // cut the cells still free (not given), by position only: blind to the numbers
    const free = cells.filter(([q, r]) => ![...g.keys()].some((n) => sol.get(n)[0] === q && sol.get(n)[1] === r));
    // try several random cuts; keep the solvable one whose mix best matches the level (pairs lead)
    let best = null;
    const num = new Map([...sol].map(([n, c]) => [key(c[0], c[1]), n]));
    for (let t = 0; t < 150; t++) {
      const pieces = derivePieces(cutBoard(free, sizes, mulberry32(seed + t * 101), num), sol);
      const c = [1, 2, 3].map((k) => pieces.filter((x) => x.length === k).length);
      // closeness of the mix to the level's weights; a level that allows triples must show at least one
      const tot = c[0] + c[1] + c[2], sum = sizes[0] + sizes[1] + sizes[2];
      const runs = pieces.reduce((a, x) => a + x.filter((n, i) => i && n - x[i - 1] === 1).length, 0);
      const multi = pieces.filter((x) => x.length > 1).length;
      const score = -3 * Math.abs(runs - CONSEC_P * multi) - 6 * [0, 1, 2].reduce((a, k) => a + Math.abs(c[k] / tot - sizes[k] / sum), 0) -
        (sizes[2] > 0 && c[2] === 0 ? 1 : 0) - (sizes[2] === 0 ? 5 * c[2] : 0);
      if ((!best || score > best.score) && logicSolve(cells, g, withShapes(pieces, sol))) best = { pieces, score };
    }
    return best ? best.pieces : null;
  };
  let guard = 0, pieces;
  while (!(pieces = solved()) && guard++ < N) {
    const ks = [...g.keys()].sort((x, y) => x - y);
    let best = null;
    for (let i = 0; i + 1 < ks.length; i++) {
      const gap = ks[i + 1] - ks[i] - 1;
      if (gap >= 1 && (!best || gap > best.gap)) best = { a: ks[i], gap };
    }
    if (!best) return null;
    const m = best.a + Math.ceil((best.gap + 1) / 2);
    g.set(m, sol.get(m));
  }
  return pieces ? { givens: g, pieces } : null;
}

// ---------- Level builder ----------
function buildLevel(spec) {
  const { id, region, pond = [], seed, maxGap, gapP = 0.6, ratio, sizes = [1, 0, 0], difficulty = 'normal' } = spec;
  const pondKeys = new Set(pond.map(([q, r]) => key(q, r)));
  const cells = region.filter(([q, r]) => !pondKeys.has(key(q, r)));
  const N = cells.length;

  // candidate paths, most regular (fewest turns) first
  const cands = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    const path = findPath(cells, mulberry32(seed * 1000 + attempt));
    if (path) cands.push({ path, turns: pathTurns(path) });
  }
  cands.sort((a, b) => a.turns - b.turns);
  if (!cands.length) throw new Error(`no path for level ${id}`);

  let pick = null;
  for (let i = 0; i < Math.min(cands.length, 12); i++) {
    const sol = new Map(cands[i].path.map((c, j) => [j + 1, c]));
    const made = makeGivens(cells, sol, N, maxGap, gapP, sizes, seed * 13 + i, mulberry32(seed * 77 + i));
    if (!made) continue;
    if (!pick || made.givens.size < pick.givens.size) pick = { sol, ...made, turns: cands[i].turns };
    if (made.givens.size <= Math.ceil(N * ratio)) break;
  }
  if (!pick) throw new Error(`could not build level ${id}`);
  const { sol, givens, pieces, turns } = pick;
  // sanity: every piece is a group of ADJACENT cells, and givens + pieces cover every number exactly once
  const covered = [...givens.keys(), ...pieces.flat()].sort((a, b) => a - b);
  if (covered.length !== N || covered.some((v, i) => v !== i + 1)) throw new Error(`level ${id}: pieces do not cover the path`);
  for (const nums of pieces) {
    const cs = nums.map((n) => sol.get(n));
    const seen = new Set([0]), st = [0];
    while (st.length) {
      const i = st.pop();
      cs.forEach((c, j) => { if (!seen.has(j) && hexDistance(cs[i], c) === 1) { seen.add(j); st.push(j); } });
    }
    if (seen.size !== nums.length) throw new Error(`level ${id}: piece ${nums.join('+')} is not made of adjacent cells`);
  }

  const givensObj = {};
  for (const m of [...givens.keys()].sort((a, b) => a - b)) givensObj[m] = givens.get(m);
  const solutionObj = {};
  for (let m = 1; m <= N; m++) solutionObj[m] = sol.get(m);
  const cnt = [1, 2, 3].map((k) => pieces.filter((p) => p.length === k).length);
  console.log(`level ${id}: ${N} cells, ${givens.size} givens (${Math.round((givens.size / N) * 100)}%), ` +
    `${pieces.length} pieces (1x${cnt[0]} 2x${cnt[1]} 3x${cnt[2]}), ${turns} turns, logic-solvable`);
  return { id, name: `Level ${id}`, difficulty, cells, blocked: pond, givens: givensObj, pieces, solution: solutionObj };
}

// ---------- The 10 levels (ramp copied from the reference's first levels) ----------
// maxGap = longest stretch of missing numbers; gapP = chance to extend a stretch; ratio = target share of givens.
const flower3 = minus(hexRegion(3), [[3, 0], [0, 3], [-3, 3], [-3, 0], [0, -3], [3, -3]]);
const r4 = minus(hexRegion(4), [[4, 0], [0, 4], [-4, 4], [-4, 0], [0, -4], [4, -4]]); // 55 cells
/** pond = the n cells of `region` closest to `center` (a compact blob) */
const blob = (region, center, n) =>
  region.slice().sort((a, b) => hexDistance(a, center) - hexDistance(b, center) || a[0] - b[0] || a[1] - b[1]).slice(0, n);

// Pacing follows the reference: 7 -> 19 cells in the first two levels, then a slow climb;
// ~37 cells around level 11, 50+ only at the end ("hard" levels are labelled).
// sizes = [w1, w2, w3]: relative weight of 1-, 2-, 3-tile chains in the tray (max chain = 3).
const specs = [
  { id: 1, region: hexRegion(1), seed: 21, maxGap: 2, ratio: 0.5, sizes: [1, 0, 0] },
  { id: 2, region: hexRegion(2), seed: 22, maxGap: 5, ratio: 0.45, sizes: [1, 0, 0] },
  { id: 3, region: hexRegion(2), pond: [[0, 0]], seed: 23, maxGap: 5, ratio: 0.45, sizes: [3, 2, 0] },
  { id: 4, region: flower3, pond: blob(flower3, [0, 0], 5), seed: 24, maxGap: 5, ratio: 0.42, sizes: [2, 3, 0] },
  { id: 5, region: flower3, pond: blob(flower3, [1, 0], 3), seed: 25, maxGap: 5, ratio: 0.4, sizes: [1, 4, 0] },
  { id: 6, region: flower3, pond: [[1, 0], [1, 1]], seed: 26, maxGap: 5, ratio: 0.38, sizes: [1, 5, 1] },
  { id: 7, region: flower3, pond: [[0, 0]], seed: 27, maxGap: 5, ratio: 0.36, sizes: [1, 5, 1] },
  { id: 8, region: flower3, seed: 28, maxGap: 5, ratio: 0.34, sizes: [1, 5, 1.5], difficulty: 'hard' },
  { id: 9, region: hexRegion(3), pond: [[-2, 0], [-2, 1], [2, -1], [2, 0]], seed: 29, maxGap: 5, ratio: 0.34, sizes: [1, 5, 2] },
  { id: 10, region: hexRegion(3), pond: [[-1, -1], [0, -1], [-1, 0]], seed: 30, maxGap: 5, ratio: 0.33, sizes: [1, 5, 2] },
  { id: 11, region: hexRegion(3), seed: 31, maxGap: 5, ratio: 0.32, sizes: [1, 5, 2.5] },
  { id: 12, region: r4, pond: blob(r4, [0, 0], 14), seed: 32, maxGap: 5, ratio: 0.32, sizes: [1, 5, 3] },
  { id: 13, region: r4, pond: blob(r4, [1, -1], 10), seed: 33, maxGap: 5, ratio: 0.3, sizes: [1, 5, 3] },
  { id: 14, region: r4, pond: blob(r4, [-1, 1], 6), seed: 34, maxGap: 5, ratio: 0.3, sizes: [1, 5, 3.5] },
  { id: 15, region: r4, pond: blob(r4, [0, 0], 2), seed: 35, maxGap: 5, ratio: 0.28, sizes: [1, 5, 4], difficulty: 'hard' },
];

const levels = specs.map(buildLevel);
writeFileSync(join(here, '..', 'src', 'levels.json'), JSON.stringify(levels));
console.log('wrote src/levels.json');
