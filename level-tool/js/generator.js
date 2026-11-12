/* Hexablow Level Tool — generators.
 *  autoPath   : Hamiltonian path over the map (random DFS + Warnsdorff + straightness, optional prefix)
 *  autoGivens : evenly spread givens, topped up until the level is logic-solvable
 *  autoCut    : cut the free cells into tray pieces of 1..3 adjacent cells
 *  generate   : search (simulated annealing) for givens + cut whose tile mix hits a target difficulty
 */
(function (g) {
  const HB = g.HB;
  const { key, parse, DIRS, shuffle, rng, adjacent } = HB;

  // ------------------------------------------------------------------ path
  const dirIdx = (a, b) => {
    const [aq, ar] = parse(a), [bq, br] = parse(b);
    return DIRS.findIndex(([dq, dr]) => dq === bq - aq && dr === br - ar);
  };
  const turnCost = (d1, d2) => { const t = Math.abs(d1 - d2) % 6; return Math.min(t, 6 - t); };

  /** One Hamiltonian path attempt. opts: {budget, prefix:[keys], turnW} -> [keys] | null */
  HB.findPath = function (cells, rand, opts) {
    opts = opts || {};
    const budget = opts.budget || 200000, turnW = opts.turnW == null ? 0.7 : opts.turnW;
    const set = new Set(cells.map(([q, r]) => key(q, r)));
    const N = set.size;
    const adj = new Map();
    for (const k of set) {
      const [q, r] = parse(k);
      adj.set(k, DIRS.map(([dq, dr]) => key(q + dq, r + dr)).filter((x) => set.has(x)));
    }
    let nodes = 0;
    const visited = new Set(), path = [];
    const connected = (from) => {
      const seen = new Set([from]), st = [from];
      while (st.length) {
        const c = st.pop();
        for (const n of adj.get(c)) if (!visited.has(n) && !seen.has(n)) { seen.add(n); st.push(n); }
      }
      return seen.size === N - visited.size + 1;
    };
    const dfs = (cur) => {
      if (path.length === N) return true;
      if (++nodes > budget) return false;
      const prev = path.length > 1 ? dirIdx(path[path.length - 2], cur) : -1;
      const scored = shuffle(adj.get(cur).filter((n) => !visited.has(n)), rand).map((n) => ({
        n, s: adj.get(n).filter((m) => !visited.has(m)).length + (prev < 0 ? 0 : turnCost(prev, dirIdx(cur, n)) * turnW),
      }));
      scored.sort((a, b) => a.s - b.s);
      for (const { n } of scored) {
        visited.add(n); path.push(n);
        if (connected(n) && dfs(n)) return true;
        path.pop(); visited.delete(n);
        if (nodes > budget) return false;
      }
      return false;
    };
    if (opts.prefix && opts.prefix.length) {
      const pre = opts.prefix;
      if (!pre.every((k) => set.has(k))) return null;
      pre.forEach((k) => { visited.add(k); path.push(k); });
      return dfs(pre[pre.length - 1]) ? path.slice() : null;
    }
    for (const s of shuffle([...set], rand).slice(0, 12)) {
      nodes = 0; visited.clear(); path.length = 0;
      visited.add(s); path.push(s);
      if (dfs(s)) return path.slice();
    }
    return null;
  };

  /** best of `tries` random paths. style: 'straight' (fewest turns) | 'wiggly' (most turns) | 'any' */
  HB.autoPath = function (cells, opts) {
    opts = opts || {};
    const style = opts.style || 'straight', tries = opts.tries || 24;
    const turnW = style === 'straight' ? 0.7 : style === 'wiggly' ? -0.4 : 0;
    const out = [];
    for (let i = 0; i < tries; i++) {
      const p = HB.findPath(cells, rng((opts.seed || 1) * 1000 + i), { prefix: opts.prefix, turnW, budget: opts.budget || 60000 });
      if (p) out.push({ path: p, turns: HB.turns(p) });
      if (opts.prefix && out.length >= 4) break;
    }
    if (!out.length) return null;
    if (style === 'straight') out.sort((a, b) => a.turns - b.turns);
    else if (style === 'wiggly') out.sort((a, b) => b.turns - a.turns);
    return out;
  };

  // ------------------------------------------------------------------ givens / cut helpers
  /** numbers that become givens: 1 and N, then gaps of 1..maxGap missing numbers (avg = avgMissing). */
  HB.spreadGivens = function (N, avgMissing, rand, maxGap) {
    const s = new Set([1, N]);
    let n = 1;
    for (;;) {
      const gap = Math.max(1, Math.min(maxGap || 6, Math.round(avgMissing + (rand() - 0.5) * 2 * Math.min(1.5, avgMissing))));
      n += gap + 1;
      if (n >= N) break;
      s.add(n);
    }
    return s;
  };

  /** groups of 2..maxPiece adjacent free cells; weights = relative [w1,w2,w3]. consecP = chance to glue n,n+1. */
  HB.cutFree = function (freeKeys, maxPiece, weights, rand, numOf, consecP) {
    const free = new Set(freeKeys), groups = [];
    const w = [weights[0], maxPiece >= 2 ? weights[1] : 0, maxPiece >= 3 ? weights[2] : 0];
    const tot = w[0] + w[1] + w[2];
    if (tot <= 0 || maxPiece < 2) return groups;
    const consec = (a, b) => numOf && Math.abs(numOf.get(a) - numOf.get(b)) === 1;
    for (const start of shuffle(freeKeys, rand)) {
      if (!free.has(start)) continue;
      let x = rand() * tot, want = 1;
      for (let k = 0; k < 3; k++) { if ((x -= w[k]) < 0) { want = k + 1; break; } }
      if (want < 2) continue;
      const grp = [start];
      free.delete(start);
      while (grp.length < want) {
        const opts = [];
        for (const c of grp) {
          const [q, r] = parse(c);
          for (const [dq, dr] of DIRS) { const k = key(q + dq, r + dr); if (free.has(k)) opts.push(k); }
        }
        const apart = opts.filter((k) => !grp.some((c) => consec(c, k)));
        const pool = apart.length && rand() >= (consecP == null ? 0.2 : consecP) ? apart : opts;
        if (!pool.length) break;
        const nx = pool[Math.floor(rand() * pool.length)];
        grp.push(nx);
        free.delete(nx);
      }
      if (grp.length >= 2) groups.push(grp);
    }
    return groups;
  };

  const numMap = (path) => new Map(path.map((k, i) => [k, i + 1]));
  const mkDraft = (base, path, givenSet, groups) => ({
    id: base.id, name: base.name, difficulty: base.difficulty,
    cells: base.cells, blocked: base.blocked, path,
    givenCells: path.filter((k, i) => givenSet.has(i + 1)), groups,
  });
  /** givens as a Set of numbers -> logic status of the resulting level */
  function logicOK(base, path, givenNums, groups) {
    const c = HB.compile(mkDraft(base, path, givenNums, groups));
    return c.ok ? HB.solve(c.level, { search: false }).status === 'logic' : false;
  }

  /** add givens (largest gap first) until the level is logic-solvable. returns false when impossible. */
  function topUp(base, path, givenNums, groups, maxAdd) {
    const N = path.length;
    for (let i = 0; i <= (maxAdd || N); i++) {
      const cleaned = dropGivenFromGroups(groups, path, givenNums);
      if (logicOK(base, path, givenNums, cleaned)) return cleaned;
      const ks = [...givenNums].sort((a, b) => a - b);
      let best = null;
      for (let j = 0; j + 1 < ks.length; j++) {
        const gap = ks[j + 1] - ks[j] - 1;
        if (gap >= 1 && (!best || gap > best.gap)) best = { a: ks[j], gap };
      }
      if (!best) return null;
      givenNums.add(best.a + Math.ceil((best.gap + 1) / 2));
    }
    return null;
  }
  function dropGivenFromGroups(groups, path, givenNums) {
    const gk = new Set(path.filter((k, i) => givenNums.has(i + 1)));
    const out = [];
    for (const grp of groups) {
      const keep = grp.filter((k) => !gk.has(k));
      for (const comp of HB.components(keep)) if (comp.length >= 2) out.push(comp);
    }
    return out;
  }

  /** Auto givens for a draft that already has a full path. Returns new givenCells or null. */
  HB.autoGivens = function (draft, opts) {
    opts = opts || {};
    const N = draft.path.length;
    if (N !== draft.cells.length) return null;
    const rand = rng(opts.seed || 1);
    const avgMissing = Math.max(1, 1 / Math.max(0.08, opts.density || 0.35) - 1);
    let best = null;
    for (let t = 0; t < 12; t++) {
      const nums = HB.spreadGivens(N, avgMissing, rand, opts.maxGap || 5);
      const groups = dropGivenFromGroups(draft.groups, draft.path, nums);
      if (opts.requireLogic === false) return { givenCells: draft.path.filter((k, i) => nums.has(i + 1)), solvable: null };
      const fixed = topUp(draft, draft.path, nums, groups);
      if (fixed && (!best || nums.size < best.nums.size)) best = { nums: new Set(nums) };
      if (best && best.nums.size <= Math.ceil(N * (opts.density || 0.35)) + 1) break;
    }
    if (!best) return null;
    return { givenCells: draft.path.filter((k, i) => best.nums.has(i + 1)), solvable: true };
  };

  /** Auto cut: tray pieces for the current givens. weights=[w1,w2,w3]. Returns {groups, solvable}. */
  HB.autoCut = function (draft, opts) {
    opts = opts || {};
    const rand = rng(opts.seed || 1);
    const given = new Set(draft.givenCells);
    const free = draft.path.filter((k) => !given.has(k));
    const nm = numMap(draft.path);
    const maxPiece = opts.maxPiece || 3, weights = opts.weights || [1, 5, 2];
    let best = null;
    for (let t = 0; t < (opts.tries || 40); t++) {
      const groups = HB.cutFree(free, maxPiece, weights, rand, nm, opts.consecP);
      const c = HB.compile({ ...draft, groups });
      if (!c.ok) continue;
      const solvable = HB.solve(c.level, { search: false }).status === 'logic';
      if (!best || (solvable && !best.solvable)) best = { groups, solvable };
      if (solvable && !opts.preferMore) break;
    }
    return best;
  };

  // ------------------------------------------------------------------ difficulty-targeted generation
  const midOf = (r) => (r[0] + r[1]) / 2;
  /** target {easy,medium,hard} (sums to 1) from a tier band */
  HB.targetFromTier = function (tier) {
    const e = midOf(tier.easy), m = midOf(tier.medium), h = midOf(tier.hard), s = e + m + h || 1;
    return { easy: e / s, medium: m / s, hard: h / s };
  };

  function score(m, target, cons) {
    let s = Math.abs(m.easyPct - target.easy) + Math.abs(m.mediumPct - target.medium) + Math.abs(m.hardPct - target.hard);
    if (cons.givenRange) s += 2 * Math.max(0, cons.givenRange[0] - m.givenPct, m.givenPct - cons.givenRange[1]);
    if (cons.maxOrphan != null) s += 2 * Math.max(0, m.orphanPct - cons.maxOrphan);
    return s;
  }
  function hit(m, target, cons, tol) {
    const e = 1e-9;
    return Math.abs(m.easyPct - target.easy) <= tol && Math.abs(m.mediumPct - target.medium) <= tol &&
      Math.abs(m.hardPct - target.hard) <= tol &&
      (!cons.givenRange || (m.givenPct >= cons.givenRange[0] - e && m.givenPct <= cons.givenRange[1] + e)) &&
      (cons.maxOrphan == null || m.orphanPct <= cons.maxOrphan + e);
  }
  const sig = (st) => [...st.givens].sort((a, b) => a - b).join('.') + '|' + st.groups.map((x) => x.slice().sort().join('+')).sort().join(';');
  const cloneSt = (st) => ({ givens: new Set(st.givens), groups: st.groups.map((x) => x.slice()) });
  const yieldUI = () => new Promise((r) => setTimeout(r, 0));

  /**
   * opts: { base:{id,name,difficulty,cells,blocked}, path? , keepPath, keepGivens, keepGroups, givenCells, groups,
   *         target:{easy,medium,hard}, tol, maxPiece, givenRange:[a,b], maxOrphan, requireLogic, seed, timeMs,
   *         pathStyle, want, rules }
   * onProgress({tried, found, best})   returns { results:[{draft, metrics, score, hit}], tried }
   */
  HB.generate = async function (opts, onProgress) {
    const rules = opts.rules || HB.DEFAULT_RULES;
    const base = opts.base, N = base.cells.length;
    const rand = rng(opts.seed || 1);
    const tol = opts.tol == null ? 0.08 : opts.tol;
    const maxPiece = opts.maxPiece || 3;
    const cons = { givenRange: opts.givenRange, maxOrphan: opts.maxOrphan };
    const requireLogic = opts.requireLogic !== false;
    const want = opts.want || 5;
    const t0 = Date.now(), deadline = t0 + (opts.timeMs || 6000);
    let tried = 0;

    // 1. candidate paths
    let paths = [];
    if (opts.keepPath && opts.path && opts.path.length === N) paths = [opts.path.slice()];
    else {
      const got = HB.autoPath(base.cells, { style: opts.pathStyle || 'straight', tries: 14, seed: opts.seed || 1, budget: 40000 });
      if (!got) return { results: [], tried: 0, error: 'Không tìm được đường đi phủ kín bản đồ.' };
      paths = got.slice(0, 4).map((x) => x.path);
    }

    const results = [], seenSig = new Set();
    let bestAny = null;
    const consider = (draft, m, sc, isHit) => {
      const r = { draft, metrics: m, score: sc, hit: isHit };
      if (isHit) { results.push(r); }
      if (!bestAny || sc < bestAny.score) bestAny = r;
    };

    for (let pi = 0; pi < paths.length && Date.now() < deadline && results.length < want && !(opts.shouldStop && opts.shouldStop()); pi++) {
      const path = paths[pi];
      const nm = numMap(path);
      const sliceEnd = Date.now() + Math.max(250, (deadline - Date.now()) / (paths.length - pi));
      const isEnd = (k) => k === path[0] || k === path[N - 1];

      // initial state
      const density = opts.givenRange ? midOf(opts.givenRange) : 0.3;
      let st;
      for (let tries = 0; tries < 40; tries++) {
        const givens = opts.keepGivens
          ? new Set(path.map((k, i) => (opts.givenCells.includes(k) ? i + 1 : 0)).filter(Boolean))
          : HB.spreadGivens(N, Math.max(1, 1 / density - 1), rand, 5);
        let groups;
        if (opts.keepGroups) groups = opts.groups.map((x) => x.slice());
        else {
          const gk = new Set(path.filter((k, i) => givens.has(i + 1)));
          const w = [1, 2 + rand() * 4, rand() * 3];
          groups = HB.cutFree(path.filter((k) => !gk.has(k)), maxPiece, w, rand, nm, 0.2);
        }
        groups = dropGivenFromGroups(groups, path, givens);
        if (requireLogic && !opts.keepGivens) {
          const fixed = topUp(base, path, givens, groups);
          if (!fixed) continue;
          groups = fixed;
        } else if (requireLogic && !logicOK(base, path, givens, groups)) {
          if (opts.keepGivens && opts.keepGroups) break;
        }
        st = { givens, groups };
        break;
      }
      if (!st) continue;

      const evalSt = (s) => {
        const c = HB.compile(mkDraft(base, path, s.givens, s.groups));
        if (!c.ok) return null;
        const a = HB.analyzeLevel(c.level, rules, { fast: true });
        return { draft: mkDraft(base, path, s.givens, s.groups), metrics: a.metrics, score: score(a.metrics, opts.target, cons) };
      };
      const solvable = (s) => !requireLogic || logicOK(base, path, s.givens, s.groups);

      let cur = evalSt(st);
      if (!cur) continue;
      let curOK = solvable(st);
      if (curOK) {
        const h = hit(cur.metrics, opts.target, cons, tol);
        if (h && !seenSig.has(sig(st))) { seenSig.add(sig(st)); consider(cur.draft, cur.metrics, cur.score, true); }
        else consider(cur.draft, cur.metrics, cur.score, false);
      }
      let iter = 0, lastYield = Date.now();
      const total = Math.max(1, sliceEnd - Date.now());
      const canG = !opts.keepGivens, canP = !opts.keepGroups && maxPiece > 1;
      if (!canG && !canP) { continue; }

      while (Date.now() < sliceEnd && results.length < want && !(opts.shouldStop && opts.shouldStop())) {
        iter++; tried++;
        const temp = 0.06 * (1 - (Date.now() - (sliceEnd - total)) / total) + 0.005;
        const nx = mutate(cloneSt(st), { rand, path, nm, maxPiece, canG, canP, isEnd });
        if (!nx) continue;
        const sg = sig(nx);
        const ev = evalSt(nx);
        if (!ev) continue;
        if (ev.score <= cur.score + rand() * temp) {
          if (!solvable(nx)) continue;
          st = nx; cur = ev;
          if (hit(ev.metrics, opts.target, cons, tol) && !seenSig.has(sg)) { seenSig.add(sg); consider(ev.draft, ev.metrics, ev.score, true); }
          else consider(ev.draft, ev.metrics, ev.score, false);
        }
        if (Date.now() - lastYield > 40) {
          lastYield = Date.now();
          if (onProgress) onProgress({ tried, found: results.length, best: bestAny ? bestAny.score : null, elapsed: Date.now() - t0 });
          await yieldUI();
        }
      }
    }
    // nothing within tolerance: hand back the closest solvable state so the GD still sees something
    if (!results.length && bestAny) results.push(bestAny);
    results.sort((a, b) => a.score - b.score);
    return { results: results.slice(0, want), tried, closest: !results.some((r) => r.hit) };
  };

  // ------------------------------------------------------------------ mutation
  function groupIndex(groups, k) { return groups.findIndex((x) => x.includes(k)); }
  function dissolveCell(st, k) {
    const gi = groupIndex(st.groups, k);
    if (gi < 0) return;
    const rest = st.groups[gi].filter((x) => x !== k);
    st.groups.splice(gi, 1);
    for (const comp of HB.components(rest)) if (comp.length >= 2) st.groups.push(comp);
  }
  function mutate(st, ctx) {
    const { rand, path, nm, maxPiece, canG, canP, isEnd } = ctx;
    const ops = [];
    if (canG) ops.push('addG', 'remG', 'movG');
    if (canP) ops.push('merge', 'merge', 'split');
    const op = ops[Math.floor(rand() * ops.length)];
    const given = (k) => st.givens.has(nm.get(k));
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    if (op === 'addG' || op === 'movG') {
      if (op === 'movG') {
        const gs = path.filter((k) => given(k) && !isEnd(k));
        if (!gs.length) return null;
        st.givens.delete(nm.get(pick(gs)));
      }
      const cs = path.filter((k) => !given(k));
      if (!cs.length) return null;
      const k = pick(cs);
      dissolveCell(st, k);
      st.givens.add(nm.get(k));
      return st;
    }
    if (op === 'remG') {
      const gs = path.filter((k) => given(k) && !isEnd(k));
      if (!gs.length) return null;
      st.givens.delete(nm.get(pick(gs)));
      return st;
    }
    if (op === 'split') {
      if (!st.groups.length) return null;
      const gi = Math.floor(rand() * st.groups.length);
      const grp = st.groups[gi];
      st.groups.splice(gi, 1);
      if (grp.length === 3) {
        const keep = grp.slice();
        keep.splice(Math.floor(rand() * 3), 1);
        for (const comp of HB.components(keep)) if (comp.length >= 2) st.groups.push(comp);
      }
      return st;
    }
    if (op === 'merge') {
      const inG = new Set(st.groups.flat());
      const singles = path.filter((k) => !given(k) && !inG.has(k));
      if (!singles.length) return null;
      const s = pick(singles);
      const [q, r] = parse(s);
      const nb = HB.DIRS.map(([dq, dr]) => key(q + dq, r + dr)).filter((k) => nm.has(k) && !given(k));
      if (!nb.length) return null;
      const t = pick(nb);
      const gi = groupIndex(st.groups, t);
      if (gi < 0) { st.groups.push([s, t]); return st; }
      if (st.groups[gi].length >= maxPiece) return null;
      st.groups[gi].push(s);
      return st;
    }
    return null;
  }
})(typeof window !== 'undefined' ? window : globalThis);
