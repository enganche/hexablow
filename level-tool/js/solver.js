/* Hexablow Level Tool — solver.
 * Constraint propagation (arc consistency + "only one place left" + tray-piece shapes) = what a player can
 * deduce without guessing. If propagation alone finishes the board the level is `logic`-solvable.
 * Otherwise a bounded search counts solutions (0 / 1 / 2+) to tell "unique but needs guessing" from "ambiguous".
 */
(function (g) {
  const HB = g.HB;
  const { key, parse, DIRS, dist } = HB;

  /**
   * problem = { cells:[[q,r]], givens:Map num->[q,r], pieces:[{nums, offs}],
   *             portals?:[[[q,r],[q,r]]], mystery?:[{n, cell:[q,r]}] }
   * Portals add edges (the two ends count as neighbours). Mystery givens are NOT in `givens`: the player sees a "?"
   * on a known cell, and the number is one of the mystery numbers (found by elimination), so those numbers are
   * restricted to the mystery cells and no other number may use them.
   */
  function build(problem) {
    const { cells, givens, pieces } = problem;
    const mystery = problem.mystery || [];
    const N = cells.length;
    const keys = cells.map(([q, r]) => key(q, r));
    const cellSet = new Set(keys);
    const adj = new Map();
    for (const k of keys) {
      const [q, r] = parse(k);
      adj.set(k, new Set(DIRS.map(([dq, dr]) => key(q + dq, r + dr)).filter((x) => cellSet.has(x))));
    }
    for (const [a, b] of problem.portals || []) {
      const ka = key(a[0], a[1]), kb = key(b[0], b[1]);
      if (adj.has(ka) && adj.has(kb)) { adj.get(ka).add(kb); adj.get(kb).add(ka); }
    }
    // graph distance (walls, water and portals all count), used to prune domains
    const gd = new Map();
    for (const s of keys) {
      const d = new Map([[s, 0]]), qu = [s];
      for (let i = 0; i < qu.length; i++) for (const x of adj.get(qu[i])) if (!d.has(x)) { d.set(x, d.get(qu[i]) + 1); qu.push(x); }
      gd.set(s, d);
    }
    const dist = (a, b) => { const v = gd.get(key(a[0], a[1])).get(key(b[0], b[1])); return v === undefined ? 1e9 : v; };
    const givenKey = new Map([...givens].map(([n, c]) => [n, key(c[0], c[1])]));
    const taken = new Set(givenKey.values());
    const mysteryNums = new Set(mystery.map((m) => m.n));
    const mysteryKeys = new Set(mystery.map((m) => key(m.cell[0], m.cell[1])));
    const freeCells = keys.filter((k) => !taken.has(k));
    const gnums = [...givens.keys()].sort((a, b) => a - b);
    const dom = new Map();
    for (let n = 1; n <= N; n++) {
      if (givens.has(n)) continue;
      if (mysteryNums.has(n)) {
        // one of the "?" cells; the exact one is a deduction (this is where the elimination puzzle lives)
        dom.set(n, new Set(mysteryKeys));
        continue;
      }
      let lo, hi;
      for (const x of gnums) { if (x < n) lo = x; else if (x > n) { hi = x; break; } }
      const d = new Set();
      for (const k of freeCells) {
        if (mysteryKeys.has(k)) continue;
        const c = parse(k);
        if (lo !== undefined && dist(c, givens.get(lo)) > n - lo) continue;
        if (hi !== undefined && dist(c, givens.get(hi)) > hi - n) continue;
        d.add(k);
      }
      dom.set(n, d);
    }
    return { N, keys, adj, givens, givenKey, freeCells, pieces: pieces || [], dom };
  }

  /** Reduce domains in place. false = contradiction. */
  function propagate(P, dom) {
    const { adj, givens, givenKey, freeCells, N } = P;
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
        for (const [m, e] of dom) if (m !== n && e.delete(k)) { changed = true; if (e.size === 0) return false; }
      }
      // a tray piece keeps its shape: each of its cells must belong to a placement that fits everywhere
      for (const { nums, offs } of P.pieces) {
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
      // every free cell needs an owner; a cell with a single possible owner forces it
      for (const k of freeCells) {
        let owner = -1, c = 0;
        for (const [n, d] of dom) if (d.has(k)) { c++; owner = n; if (c > 1) break; }
        if (c === 0) return false;
        if (c === 1 && dom.get(owner).size > 1) { dom.set(owner, new Set([k])); changed = true; }
      }
    }
    return true;
  }

  const allSingle = (dom) => [...dom.values()].every((d) => d.size === 1);
  const cloneDom = (dom) => new Map([...dom].map(([n, s]) => [n, new Set(s)]));

  /** Core: opts.search=false -> only propagation. */
  HB.solveCore = function (problem, opts) {
    opts = opts || {};
    const P = build(problem);
    const dom = P.dom;
    if (!propagate(P, dom)) return { status: 'none', solutions: 0 };
    if (allSingle(dom)) return { status: 'logic', solutions: 1, dom };
    if (opts.search === false) return { status: 'stuck', solutions: -1 };
    const st = { count: 0, nodes: 0, max: opts.maxSol || 2, budget: opts.maxNodes || 20000, first: null };
    (function rec(d) {
      if (st.count >= st.max || st.nodes > st.budget) return;
      st.nodes++;
      let pick = null;
      for (const [n, s] of d) if (s.size > 1 && (!pick || s.size < d.get(pick).size)) pick = n;
      if (pick === null) { st.count++; if (!st.first) st.first = d; return; }
      for (const k of [...d.get(pick)]) {
        const c = cloneDom(d);
        c.set(pick, new Set([k]));
        if (propagate(P, c)) rec(c);
        if (st.count >= st.max || st.nodes > st.budget) return;
      }
    })(dom);
    if (st.nodes > st.budget && st.count < st.max) return { status: 'unknown', solutions: st.count };
    return { status: st.count === 0 ? 'none' : st.count === 1 ? 'unique' : 'multiple', solutions: st.count };
  };

  /** Compiled level (game format) -> solver status. */
  HB.solve = function (level, opts) {
    const sol = new Map(Object.entries(level.solution).map(([n, c]) => [+n, c]));
    const givens = new Map(Object.entries(level.givens).map(([n, c]) => [+n, c]));
    const hidden = new Set(level.mystery || []);
    for (const n of hidden) givens.delete(n);
    const mystery = [...hidden].map((n) => ({ n, cell: sol.get(n) }));
    return HB.solveCore({ cells: level.cells, givens, pieces: HB.shapesOf(level.pieces, sol), portals: level.portals || [], mystery }, opts);
  };

  HB.shapesOf = function (pieces, sol) {
    return pieces.map((nums) => ({
      nums,
      offs: nums.map((n) => [sol.get(n)[0] - sol.get(nums[0])[0], sol.get(n)[1] - sol.get(nums[0])[1]]),
    }));
  };

  HB.STATUS_LABEL = {
    logic: 'Giải được bằng suy luận (không cần đoán)',
    unique: 'Duy nhất nhưng phải thử-sai',
    multiple: 'Nhiều hơn 1 lời giải',
    none: 'Vô nghiệm',
    unknown: 'Không kết luận (quá tải)',
    stuck: 'Suy luận bị kẹt',
  };
})(typeof window !== 'undefined' ? window : globalThis);
