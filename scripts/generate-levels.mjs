// Generates src/levels.json, modelled on the first 10 levels of the reference game:
//  * the solution path is REGULAR (few turns: spirals / snakes), not a random scribble;
//  * givens are spread evenly (alternating early on, gaps of up to 2-3 later), 1 and N given;
//  * the tray is single tiles (pairs only rarely, and not in early levels);
//  * every level must be solvable by pure logic (no guessing), checked by `logicSolve`.
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
function logicSolve(cells, givens) {
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

// ---------- Givens: evenly spread, then topped up until logic-solvable ----------
function makeGivens(cells, sol, N, maxGap, rand) {
  const g = new Map([[1, sol.get(1)]]);
  let n = 1;
  for (;;) {
    let m = 1;
    while (m < maxGap && rand() < 0.4) m++; // number of missing values until the next given
    n += m + 1;
    if (n >= N) break;
    g.set(n, sol.get(n));
  }
  g.set(N, sol.get(N));
  let guard = 0;
  while (!logicSolve(cells, g) && guard++ < N) {
    const ks = [...g.keys()].sort((a, b) => a - b);
    let best = null;
    for (let i = 0; i + 1 < ks.length; i++) {
      const gap = ks[i + 1] - ks[i] - 1;
      if (gap >= 1 && (!best || gap > best.gap)) best = { a: ks[i], gap };
    }
    if (!best) return null;
    const m = best.a + Math.ceil((best.gap + 1) / 2);
    g.set(m, sol.get(m));
  }
  return logicSolve(cells, g) ? g : null;
}

// ---------- Level builder ----------
function buildLevel(spec) {
  const { id, region, pond = [], seed, maxGap, ratio, pairProb = 0, difficulty = 'normal' } = spec;
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
    const givens = makeGivens(cells, sol, N, maxGap, mulberry32(seed * 77 + i));
    if (!givens) continue;
    if (!pick || givens.size < pick.givens.size) pick = { sol, givens, turns: cands[i].turns };
    if (givens.size <= Math.ceil(N * ratio)) break;
  }
  if (!pick) throw new Error(`could not build level ${id}`);
  const { sol, givens, turns } = pick;

  // tray: single tiles, pairs only occasionally
  const rand = mulberry32(seed * 31);
  const pieces = [];
  let run = [];
  const flush = () => {
    for (let i = 0; i < run.length; ) {
      if (i + 1 < run.length && rand() < pairProb) { pieces.push([run[i], run[i + 1]]); i += 2; }
      else { pieces.push([run[i]]); i += 1; }
    }
    run = [];
  };
  for (let m = 1; m <= N; m++) { if (givens.has(m)) flush(); else run.push(m); }
  flush();

  const givensObj = {};
  for (const m of [...givens.keys()].sort((a, b) => a - b)) givensObj[m] = givens.get(m);
  const solutionObj = {};
  for (let m = 1; m <= N; m++) solutionObj[m] = sol.get(m);
  const pairs = pieces.filter((p) => p.length > 1).length;
  console.log(`level ${id}: ${N} cells, ${givens.size} givens (${Math.round((givens.size / N) * 100)}%), ` +
    `${pieces.length} pieces (${pairs} pairs), ${turns} turns, logic-solvable`);
  return { id, name: `Level ${id}`, difficulty, cells, blocked: pond, givens: givensObj, pieces, solution: solutionObj };
}

// ---------- The 10 levels (ramp copied from the reference's first levels) ----------
// maxGap = longest stretch of missing numbers; ratio = target share of given cells.
const flower3 = minus(hexRegion(3), [[3, 0], [0, 3], [-3, 3], [-3, 0], [0, -3], [3, -3]]);
const specs = [
  { id: 1, region: hexRegion(1), seed: 21, maxGap: 1, ratio: 0.6 },
  { id: 2, region: hexRegion(2), seed: 22, maxGap: 1, ratio: 0.55 },
  { id: 3, region: hexRegion(2), pond: [[0, 0]], seed: 23, maxGap: 1, ratio: 0.55 },
  { id: 4, region: hexRegion(3), seed: 24, maxGap: 2, ratio: 0.5 },
  { id: 5, region: hexRegion(3), pond: [[-1, -1], [0, -1], [-1, 0]], seed: 25, maxGap: 2, ratio: 0.48 },
  { id: 6, region: flower3, pond: [[1, 0], [1, 1]], seed: 26, maxGap: 2, ratio: 0.46 },
  { id: 7, region: hexRegion(3), pond: [[-2, 0], [-2, 1], [2, -1], [2, 0]], seed: 27, maxGap: 3, ratio: 0.44 },
  { id: 8, region: hexRegion(2), seed: 28, maxGap: 3, ratio: 0.42, pairProb: 0.15, difficulty: 'hard' },
  { id: 9, region: hexRegion(3), seed: 29, maxGap: 3, ratio: 0.42, pairProb: 0.15 },
  { id: 10, region: hexRegion(4), pond: [[0, -3], [1, -3], [0, -2], [2, 0], [3, 0], [2, 1], [-3, 2], [-2, 2]], seed: 30, maxGap: 3, ratio: 0.42, pairProb: 0.15, difficulty: 'hard' },
];

const levels = specs.map(buildLevel);
writeFileSync(join(here, '..', 'src', 'levels.json'), JSON.stringify(levels));
console.log('wrote src/levels.json');
