// Generates src/levels.json.
// For each level: build a hex region, find a Hamiltonian path (the solution),
// then pick the fewest "given" numbers that still leave a UNIQUE solution
// (verified by an exhaustive solver). Run: npm run levels
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

// ---------- Hamiltonian path (random DFS, Warnsdorff order, connectivity prune) ----------
function findPath(cells, rand, budget = 400000) {
  const set = new Set(cells.map(([q, r]) => key(q, r)));
  const N = cells.length;
  const nbrs = (k) => {
    const [q, r] = k.split(',').map(Number);
    return DIRS.map(([dq, dr]) => key(q + dq, r + dr)).filter((x) => set.has(x));
  };
  const adj = new Map();
  for (const k of set) adj.set(k, nbrs(k));
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
    const opts = adj.get(cur).filter((n) => !visited.has(n));
    const scored = shuffle(opts, rand).map((n) => ({ n, d: adj.get(n).filter((m) => !visited.has(m)).length }));
    scored.sort((a, b) => a.d - b.d);
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
    if (dfs(s)) return path.map((k) => k.split(',').map(Number));
  }
  return null;
}

// ---------- Solver: count solutions (stops at `limit`) ----------
// givens: Map number -> [q,r]. Number 1 and N must be given.
function countSolutions(cells, givens, limit = 2, budget = 3000000) {
  const N = cells.length;
  const set = new Set(cells.map(([q, r]) => key(q, r)));
  const givenKeys = new Set([...givens.values()].map(([q, r]) => key(q, r)));
  const sortedGiven = [...givens.keys()].sort((a, b) => a - b);
  const nextGiven = new Array(N + 2).fill(null); // first given number >= n
  for (let n = N; n >= 1; n--) nextGiven[n] = givens.has(n) ? n : nextGiven[n + 1];

  let count = 0;
  let nodes = 0;
  let exceeded = false;
  const visited = new Set();

  const step = (n, cell) => {
    if (count >= limit || exceeded) return;
    if (n === N) { count++; return; }
    if (++nodes > budget) { exceeded = true; return; }
    const m = n + 1;
    if (givens.has(m)) {
      const t = givens.get(m);
      if (hexDistance(cell, t) === 1 && !visited.has(key(t[0], t[1]))) {
        visited.add(key(t[0], t[1]));
        step(m, t);
        visited.delete(key(t[0], t[1]));
      }
      return;
    }
    const g = nextGiven[m];
    for (const [dq, dr] of DIRS) {
      const c = [cell[0] + dq, cell[1] + dr];
      const k = key(c[0], c[1]);
      if (!set.has(k) || visited.has(k) || givenKeys.has(k)) continue;
      if (g !== null && hexDistance(c, givens.get(g)) > g - m) continue;
      visited.add(k);
      step(m, c);
      visited.delete(k);
    }
  };

  const start = givens.get(1);
  visited.add(key(start[0], start[1]));
  step(1, start);
  return { count, exceeded };
}

// ---------- Level builder ----------
function buildLevel(spec) {
  const { id, region, pond = [], seed, minGivens } = spec;
  const pondKeys = new Set(pond.map(([q, r]) => key(q, r)));
  const cells = region.filter(([q, r]) => !pondKeys.has(key(q, r)));
  const N = cells.length;

  for (let attempt = 0; attempt < 400; attempt++) {
    const rand = mulberry32(seed * 1000 + attempt);
    const path = findPath(cells, rand);
    if (!path) continue;
    const sol = new Map(path.map((c, i) => [i + 1, c]));

    const givens = new Map([[1, sol.get(1)], [N, sol.get(N)]]);
    const ok = (g) => {
      const res = countSolutions(cells, g);
      return !res.exceeded && res.count === 1;
    };

    // add givens until unique
    let guard = 0;
    while (!ok(givens) && guard++ < N) {
      const free = shuffle([...sol.keys()].filter((n) => !givens.has(n)), rand);
      givens.set(free[0], sol.get(free[0]));
    }
    if (!ok(givens)) continue;

    // greedily drop givens while still unique, down to minGivens
    for (const n of shuffle([...givens.keys()].filter((n) => n !== 1 && n !== N), rand)) {
      if (givens.size <= minGivens) break;
      const trial = new Map(givens);
      trial.delete(n);
      if (ok(trial)) givens.delete(n);
    }
    if (givens.size < minGivens) {
      // pad back up so easy levels stay easy
      const free = shuffle([...sol.keys()].filter((n) => !givens.has(n)), rand);
      while (givens.size < minGivens && free.length) {
        const n = free.pop();
        givens.set(n, sol.get(n));
      }
    }

    const givensObj = {};
    for (const n of [...givens.keys()].sort((a, b) => a - b)) givensObj[n] = givens.get(n);
    const solutionObj = {};
    for (let n = 1; n <= N; n++) solutionObj[n] = sol.get(n);
    console.log(`level ${id}: ${N} cells, ${givens.size} givens (attempt ${attempt})`);
    return { id, name: `Level ${id}`, cells, blocked: pond, givens: givensObj, solution: solutionObj };
  }
  throw new Error(`could not build level ${id}`);
}

// ---------- The 5 levels ----------
const specs = [
  { id: 1, region: hexRegion(1), seed: 1, minGivens: 3 },
  { id: 2, region: hexRegion(2), seed: 2, minGivens: 5 },
  { id: 3, region: hexRegion(2), pond: [[0, 0], [1, 0], [0, 1]], seed: 3, minGivens: 4 },
  { id: 4, region: hexRegion(3), pond: [[1, -1], [2, -2], [1, 0], [0, 1], [-1, 1]], seed: 4, minGivens: 5 },
  { id: 5, region: hexRegion(3), pond: [[0, 0], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]], seed: 5, minGivens: 4 },
];

const levels = specs.map(buildLevel);
writeFileSync(join(here, '..', 'src', 'levels.json'), JSON.stringify(levels));
console.log('wrote src/levels.json');
