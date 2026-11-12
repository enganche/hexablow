/* Hexablow Level Tool — difficulty rules.
 * Implements the rule from DIFFICULTY_RULES.md:
 *   tile (tray piece) difficulty = number of positions it can be dragged to so that it forms a valid
 *   consecutive pair with a number already on the grid.
 *   1 position = Easy, 2..3 = Medium, >3 = Hard (0 = no anchor on the grid yet = "orphan").
 */
(function (g) {
  const HB = g.HB;
  const { key, DIRS, adjacent } = HB;

  // ---------------------------------------------------------------- default rule set (editable in the tool)
  HB.DEFAULT_RULES = {
    version: 1,
    tile: {
      easyMax: 1,            // count <= easyMax            -> Easy
      mediumMax: 3,          // easyMax < count <= mediumMax -> Medium, above -> Hard
      anchorMode: 'strict',  // 'strict': placement must touch EVERY n-1 / n+1 already on the grid
                             // 'loose' : placement only has to touch ONE n-1 / n+1 on the grid
      orphanClass: 'hard',   // a tile with no n-1 / n+1 on the grid at all counts as this class
    },
    weights: { easy: 1, medium: 2, hard: 3 },   // difficulty index = mean weight over tiles (1.00 .. 3.00)
    // Level bands (a priori proposal — GD should tune). `from`/`to` are level ids; to=null means "and up".
    // Each range is [min, max] as a share of the tray (0..1); index is the mean weight.
    tiers: [
      { name: 'T1 Làm quen',  from: 1,  to: 3,    easy: [0.60, 1], medium: [0, 0.40], hard: [0, 0.10], orphan: [0, 0.10], index: [1.00, 1.40], size3: [0, 0] },
      { name: 'T2 Khởi động', from: 4,  to: 7,    easy: [0.35, 0.80], medium: [0.15, 0.50], hard: [0, 0.25], orphan: [0, 0.25], index: [1.20, 1.80], size3: [0, 0.25] },
      { name: 'T3 Trung bình', from: 8, to: 11,   easy: [0.20, 0.55], medium: [0.20, 0.50], hard: [0.10, 0.40], orphan: [0, 0.35], index: [1.60, 2.20], size3: [0, 0.40] },
      { name: 'T4 Khó',       from: 12, to: null, easy: [0.10, 0.40], medium: [0.20, 0.50], hard: [0.25, 0.55], orphan: [0, 0.45], index: [1.90, 2.50], size3: [0.05, 0.60] },
    ],
  };

  HB.tierFor = function (rules, id) {
    return (rules.tiers || []).find((t) => id >= t.from && (t.to == null || id <= t.to)) || null;
  };

  // ---------------------------------------------------------------- context
  /** Normalise a compiled level (game format) into lookup tables. */
  HB.ctx = function (level) {
    const sol = new Map(Object.entries(level.solution).map(([n, c]) => [+n, c]));
    const givens = new Map(Object.entries(level.givens).map(([n, c]) => [+n, c]));
    return {
      level,
      N: level.cells.length,
      sol,
      givens,
      cellSet: new Set(level.cells.map((c) => key(c[0], c[1]))),
      blockedSet: new Set((level.blocked || []).map((c) => key(c[0], c[1]))),
    };
  };

  // ---------------------------------------------------------------- one tile
  /**
   * All positions a tray tile can be dragged to (see DIRECTIVES in the doc).
   * @param grid Map number -> [q,r] of numbers currently on the grid (givens + already placed tiles)
   * @returns {count, cands:[{t, cells, correct}], anchors, reasons, orphan}
   */
  HB.tileCandidates = function (ctx, nums, grid, rules) {
    const mode = rules.tile.anchorMode;
    const base = ctx.sol.get(nums[0]);
    const offs = nums.map((n) => [ctx.sol.get(n)[0] - base[0], ctx.sol.get(n)[1] - base[1]]);
    const occ = new Set();
    for (const c of grid.values()) occ.add(key(c[0], c[1]));
    const inPiece = new Set(nums);

    const anchors = [];
    const seen = new Set();
    const cands = [];
    const reasons = { occupied: 0, blocked: 0, shape: 0, strict: 0 };

    nums.forEach((m, i) => {
      for (const v of [m - 1, m + 1]) {
        if (!grid.has(v) || inPiece.has(v)) continue;
        const vc = grid.get(v);
        anchors.push({ num: m, anchorNum: v, anchorCell: vc });
        for (const [dq, dr] of DIRS) {
          const hook = [vc[0] + dq, vc[1] + dr];                 // where number m would sit
          const t = [hook[0] - offs[i][0], hook[1] - offs[i][1]]; // where the tile's first number would sit
          const tk = key(t[0], t[1]);
          if (seen.has(tk)) continue;
          seen.add(tk);
          const cells = offs.map(([oq, or]) => [t[0] + oq, t[1] + or]);

          // exclusion 1/2/3: covered by another number, blocked by wall/outside, or the tile's own shape
          let bad = null;
          for (let j = 0; j < cells.length && !bad; j++) {
            const k = key(cells[j][0], cells[j][1]);
            const hooking = j === i;
            if (!ctx.cellSet.has(k)) bad = hooking ? 'blocked' : 'shape';
            else if (occ.has(k)) bad = hooking ? 'occupied' : 'shape';
          }
          if (bad) { reasons[bad]++; continue; }

          // strict mode: also touch every other n-1 / n+1 already on the grid
          if (mode === 'strict') {
            let ok = true;
            for (let j = 0; j < nums.length && ok; j++)
              for (const w of [nums[j] - 1, nums[j] + 1])
                if (grid.has(w) && !inPiece.has(w) && !adjacent(cells[j], grid.get(w))) { ok = false; break; }
            if (!ok) { reasons.strict++; continue; }
          }
          const correct = tk === key(base[0], base[1]);
          cands.push({ t, cells, correct });
        }
      }
    });
    return { nums, count: cands.length, cands, anchors, reasons, orphan: anchors.length === 0, hasCorrect: cands.some((c) => c.correct) };
  };

  HB.classify = function (info, rules) {
    if (info.orphan) return rules.tile.orphanClass;
    if (info.count <= rules.tile.easyMax) return 'easy';
    if (info.count <= rules.tile.mediumMax) return 'medium';
    return 'hard';
  };

  // ---------------------------------------------------------------- whole level
  function givenGrid(ctx) {
    return new Map(ctx.givens);
  }

  /** Static analysis: every tray tile against the board that only holds the givens (the rule). */
  HB.analyzePieces = function (ctx, rules, pieces, grid) {
    pieces = pieces || ctx.level.pieces;
    grid = grid || givenGrid(ctx);
    return pieces.map((nums, idx) => {
      const info = HB.tileCandidates(ctx, nums, grid, rules);
      info.idx = idx;
      info.size = nums.length;
      info.cls = HB.classify(info, rules);
      return info;
    });
  };

  /**
   * Play-through: always place the tile with the FEWEST candidates (smallest number on ties) at its true
   * position, then re-count. Shows how the difficulty evolves while a sensible player fills the board.
   * `stuck` = no remaining tile has any anchor (needs extra deduction).
   */
  HB.playthrough = function (ctx, rules) {
    const grid = givenGrid(ctx);
    let left = ctx.level.pieces.map((p) => p.slice());
    const steps = [];
    while (left.length) {
      const infos = left.map((nums) => {
        const i = HB.tileCandidates(ctx, nums, grid, rules);
        i.cls = HB.classify(i, rules);
        return i;
      });
      let pick = -1;
      infos.forEach((inf, i) => {
        if (inf.orphan) return;
        if (pick < 0 || inf.count < infos[pick].count || (inf.count === infos[pick].count && inf.nums[0] < infos[pick].nums[0])) pick = i;
      });
      const stuck = pick < 0;
      if (stuck) {
        pick = 0;
        infos.forEach((inf, i) => { if (inf.nums[0] < infos[pick].nums[0]) pick = i; });
      }
      const chosen = infos[pick];
      steps.push({ nums: chosen.nums, count: stuck ? 0 : chosen.count, cls: stuck ? 'orphan' : chosen.cls, stuck });
      chosen.nums.forEach((n) => grid.set(n, ctx.sol.get(n)));
      left.splice(pick, 1);
    }
    return steps;
  };

  /** Metrics of a level + band check. */
  HB.analyzeLevel = function (level, rules, opts) {
    rules = rules || HB.DEFAULT_RULES;
    const ctx = HB.ctx(level);
    const tiles = HB.analyzePieces(ctx, rules);
    const n = tiles.length || 1;
    const cnt = { easy: 0, medium: 0, hard: 0 };
    let orphan = 0, sumCount = 0, anchored = 0, sizes = [0, 0, 0, 0];
    for (const t of tiles) {
      cnt[t.cls]++;
      if (t.orphan) orphan++; else { sumCount += t.count; anchored++; }
      sizes[t.size]++;
    }
    const w = rules.weights;
    const index = tiles.length ? (cnt.easy * w.easy + cnt.medium * w.medium + cnt.hard * w.hard) / tiles.length : 0;
    const steps = opts && opts.fast ? [] : HB.playthrough(ctx, rules);
    const metrics = {
      cells: ctx.N,
      givens: ctx.givens.size,
      givenPct: ctx.givens.size / ctx.N,
      tiles: tiles.length,
      easy: cnt.easy, medium: cnt.medium, hard: cnt.hard, orphan,
      easyPct: cnt.easy / n, mediumPct: cnt.medium / n, hardPct: cnt.hard / n, orphanPct: orphan / n,
      size1: sizes[1], size2: sizes[2], size3: sizes[3],
      size3Pct: sizes[3] / n,
      index,
      avgCandidates: anchored ? sumCount / anchored : 0,
      maxCandidates: Math.max(0, ...tiles.filter((t) => !t.orphan).map((t) => t.count)),
      // play-through (bottleneck) view
      pt: {
        steps,
        stuck: steps.filter((s) => s.stuck).length,
        peak: Math.max(0, ...steps.map((s) => s.count)),
        hardSteps: steps.filter((s) => s.cls === 'hard').length,
      },
    };
    return { ctx, tiles, metrics, checks: HB.checkTier(level.id, metrics, rules) };
  };

  /** Compare metrics with the tier band of the level id. */
  HB.checkTier = function (id, m, rules) {
    const tier = HB.tierFor(rules, id);
    if (!tier) return { tier: null, items: [], ok: true };
    const rows = [
      ['easy', 'Ô dễ', m.easyPct, tier.easy, true],
      ['medium', 'Ô trung bình', m.mediumPct, tier.medium, true],
      ['hard', 'Ô khó', m.hardPct, tier.hard, true],
      ['orphan', 'Ô mồ côi (không mốc)', m.orphanPct, tier.orphan, true],
      ['size3', 'Ô ba (3 số)', m.size3Pct, tier.size3, true],
      ['index', 'Chỉ số độ khó', m.index, tier.index, false],
    ];
    const items = rows
      .filter((r) => r[3])
      .map(([k, label, value, range, pct]) => {
        const eps = 1e-9;
        const ok = value >= range[0] - eps && value <= range[1] + eps;
        return { key: k, label, value, range, pct, ok, dir: value < range[0] - eps ? 'low' : value > range[1] + eps ? 'high' : '' };
      });
    return { tier, items, ok: items.every((i) => i.ok) };
  };

  HB.CLASS_LABEL = { easy: 'Dễ', medium: 'Trung bình', hard: 'Khó', orphan: 'Mồ côi' };
})(typeof window !== 'undefined' ? window : globalThis);
