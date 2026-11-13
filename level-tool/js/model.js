/* Hexablow Level Tool — editable draft model <-> game level format.
 *
 * The designer edits a DRAFT:
 *   cells    [[q,r]]   playable cells          blocked [[q,r]]  water / wall cells
 *   path     ["q,r"]   the drawn path, path[0] is number 1 (may be partial while drawing)
 *   givenCells ["q,r"] cells whose number is pre-filled (the number is whatever the path puts there)
 *   groups   [["q,r"]] tray pieces of 2-3 ADJACENT cells (every other free cell is a lone tile)
 * Drawing the path and cutting the tray are independent steps, exactly like the game generator.
 *
 * compile(draft) produces the level object the game loads from src/levels.json:
 *   { id, name, difficulty, cells, blocked, givens:{n:[q,r]}, pieces:[[n..]], solution:{n:[q,r]} }
 */
(function (g) {
  const HB = g.HB;
  const { key, parse, adjacent, components } = HB;

  HB.emptyDraft = function (id) {
    return { id: id || 1, name: 'Level ' + (id || 1), difficulty: 'normal', cells: [], blocked: [], path: [], givenCells: [], groups: [] };
  };

  HB.draftFromLevel = function (lv) {
    const N = lv.cells.length;
    const path = [];
    for (let n = 1; n <= N; n++) path.push(key(lv.solution[n][0], lv.solution[n][1]));
    const givenCells = Object.values(lv.givens).map((c) => key(c[0], c[1]));
    const groups = (lv.pieces || [])
      .filter((p) => p.length > 1)
      .map((p) => p.map((n) => key(lv.solution[n][0], lv.solution[n][1])));
    return {
      id: lv.id, name: lv.name || 'Level ' + lv.id, difficulty: lv.difficulty || 'normal',
      cells: lv.cells.map((c) => c.slice()), blocked: (lv.blocked || []).map((c) => c.slice()),
      path, givenCells, groups,
    };
  };

  /** Drop everything that no longer fits the map; keep groups valid (adjacent, 2-3, not given). */
  HB.normalize = function (d) {
    const cellSet = new Set(d.cells.map((c) => key(c[0], c[1])));
    // path: cut at the first cell that is off-map / repeated / not adjacent to the previous one
    const path = [], seen = new Set();
    for (const k of d.path) {
      if (!cellSet.has(k) || seen.has(k)) break;
      if (path.length && !adjacent(parse(path[path.length - 1]), parse(k))) break;
      path.push(k); seen.add(k);
    }
    d.path = path;
    d.givenCells = [...new Set(d.givenCells.filter((k) => cellSet.has(k)))];
    const given = new Set(d.givenCells);
    const used = new Set();
    const groups = [];
    for (const grp of d.groups) {
      const keep = grp.filter((k) => cellSet.has(k) && !given.has(k) && !used.has(k));
      for (const comp of components(keep)) {
        if (comp.length < 2) continue;
        const take = comp.slice(0, 3);          // a piece never holds more than 3 tiles
        take.forEach((k) => used.add(k));
        groups.push(take);
        // anything that does not fit becomes lone tiles automatically
      }
    }
    d.groups = groups;
    return d;
  };

  /** Draft -> game level. Returns {ok, level, errors:[], warnings:[]}. */
  HB.compile = function (d) {
    const errors = [], warnings = [];
    const N = d.cells.length;
    if (!N) return { ok: false, errors: ['Chưa có ô nào trên bản đồ.'], warnings };
    if (d.path.length !== N) errors.push(`Đường đi mới có ${d.path.length}/${N} ô.`);
    for (let i = 1; i < d.path.length; i++)
      if (!adjacent(parse(d.path[i - 1]), parse(d.path[i]))) { errors.push(`Bước ${i} → ${i + 1} không liền kề.`); break; }
    if (errors.length) return { ok: false, errors, warnings };

    const num = new Map(d.path.map((k, i) => [k, i + 1]));
    const givenSet = new Set(d.givenCells);
    const givens = {}, solution = {};
    d.path.forEach((k, i) => { solution[i + 1] = parse(k); if (givenSet.has(k)) givens[i + 1] = parse(k); });
    // luật: chỉ số cuối N bắt buộc là given; số 1 có thể nằm trong khay
    if (!givens[N]) warnings.push(`Số ${N} (cuối) chưa là given (GDD: N luôn là given).`);

    const inGroup = new Set();
    const pieces = [];
    for (const grp of d.groups) {
      const nums = grp.filter((k) => !givenSet.has(k)).map((k) => num.get(k)).sort((a, b) => a - b);
      if (nums.length) { pieces.push(nums); grp.forEach((k) => inGroup.add(k)); }
    }
    for (const k of d.path) if (!givenSet.has(k) && !inGroup.has(k)) pieces.push([num.get(k)]);
    pieces.sort((a, b) => a[0] - b[0]);
    for (const p of pieces) {
      if (p.length > 3) errors.push(`Ô ${p.join('+')} dài hơn 3.`);
      if (components(p.map((n) => d.path[n - 1])).length !== 1) errors.push(`Ô ${p.join('+')} không liền kề nhau.`);
    }
    const level = {
      id: d.id, name: d.name || 'Level ' + d.id, difficulty: d.difficulty || 'normal',
      cells: d.cells.map((c) => c.slice()), blocked: d.blocked.map((c) => c.slice()),
      givens, pieces, solution,
    };
    if (d.id >= 5 && HB.isSpiral(d.path)) warnings.push('Đường đi dạng xoắn ốc (dễ đoán) — nên đổi đường khác (luật: level ≥ 5 không xoắn ốc).');
    return { ok: errors.length === 0, level, errors, warnings };
  };

  /**
   * Spiral detector. Ring = hex distance from the map centre (0,0). A spiral drifts steadily in or out
   * (|corr(step, ring)| high) and almost never turns back (few ring reversals). Rule: levels >= 5 must NOT be spirals.
   */
  HB.spiralScore = function (pathKeys) {
    const r = pathKeys.map((k) => { const [q, s] = parse(k); return Math.max(Math.abs(q), Math.abs(s), Math.abs(q + s)); });
    const n = r.length, mi = (n - 1) / 2, mr = r.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    r.forEach((v, i) => { sxy += (i - mi) * (v - mr); sxx += (i - mi) ** 2; syy += (v - mr) ** 2; });
    let rev = 0, last = 0;
    for (let i = 1; i < n; i++) { const d = Math.sign(r[i] - r[i - 1]); if (d && last && d !== last) rev++; if (d) last = d; }
    return { corr: syy ? sxy / Math.sqrt(sxx * syy) : 0, rev };
  };
  HB.isSpiral = function (pathKeys) {
    if (pathKeys.length < 12) return false;
    const s = HB.spiralScore(pathKeys);
    return Math.abs(s.corr) > 0.45 || s.rev < pathKeys.length / 6;
  };

  HB.turns = function (pathKeys) {
    let t = 0, prev = -1;
    for (let i = 1; i < pathKeys.length; i++) {
      const a = parse(pathKeys[i - 1]), b = parse(pathKeys[i]);
      const di = HB.DIRS.findIndex(([dq, dr]) => dq === b[0] - a[0] && dr === b[1] - a[1]);
      if (prev >= 0 && di !== prev) t++;
      prev = di;
    }
    return t;
  };
})(typeof window !== 'undefined' ? window : globalThis);
