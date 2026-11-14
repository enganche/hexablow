// node level-tool/regen-mechanics.mjs [--write]
// Adds the mechanics (mystery numbers, twin portals, locked cells) to levels 7-15, at most 2 per level (the pond counts).
//   mystery levels : keep map + path + tray, hide `k` givens as "?" (chosen so the tile mix barely changes and the level stays logic-solvable)
//   lock levels    : keep everything, lock `k` single-tile cells that would otherwise be easy to place
//   portal levels  : new Hamiltonian path that crosses the portal (so the portal is part of the solution), then givens + tray
//                    are searched for the usual difficulty band (levels 9, 12) or the boss band (level 15)
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
for (const f of ['hexcore', 'rules', 'solver', 'model', 'generator']) vm.runInThisContext(readFileSync(join(here, 'js', f + '.js'), 'utf8'));
const file = join(here, '..', 'src', 'levels.json');
const levels = JSON.parse(readFileSync(file, 'utf8'));
const write = process.argv.includes('--write');
const rules = HB.DEFAULT_RULES;
const key = (c) => c[0] + ',' + c[1];

// level -> mechanic plan. Intro levels (7 mystery, 9 portal, 11 lock) are kept gentle.
const PLAN = {
  7: { mystery: 1, intro: true },
  8: { mystery: 2 },
  9: { portals: 1, intro: true, target: [.44, .40, .16] },
  10: { mystery: 2 },
  11: { locks: [5], intro: true },
  12: { portals: 2, target: [.30, .40, .30] },
  13: { locks: [8, 14] },
  14: { mystery: 3 },
  15: { portals: 2, boss: { t: [.08, .32, .60], g: [.18, .26] } },
};

const metricsOf = (lv) => HB.analyzeLevel(lv, rules).metrics;
const solvable = (lv) => HB.solve(lv, { search: false }).status === 'logic';
const delta = (a, b) => Math.abs(a.easyPct - b.easyPct) + Math.abs(a.hardPct - b.hardPct) + 0.5 * Math.abs(a.orphanPct - b.orphanPct);
const numOfCell = (lv) => new Map(Object.entries(lv.solution).map(([n, c]) => [key(c), +n]));

// ---------------------------------------------------------------- mystery
function addMystery(lv, k, intro) {
  const N = lv.cells.length;
  const base = metricsOf(lv);
  const chosen = [];
  const inTray = (n) => n >= 1 && n <= N && !lv.givens[n];
  for (let step = 0; step < k; step++) {
    let best = null;
    for (const n of Object.keys(lv.givens).map(Number)) {
      if (n === N || n === 1 || chosen.includes(n)) continue;
      if (chosen.some((m) => Math.abs(m - n) <= 1 || HB.dist(lv.solution[m], lv.solution[n]) < 3)) continue;
      const trayNb = inTray(n - 1) + inTray(n + 1);
      if (!trayNb) continue; // nothing could ever open the pad
      if (intro && trayNb < 2) continue; // intro: both neighbours come from the tray
      const cand = { ...lv, mystery: [...chosen, n].sort((a, b) => a - b) };
      if (!solvable(cand)) continue;
      const sc = delta(base, metricsOf(cand)) - 0.02 * trayNb;
      if (!best || sc < best.sc) best = { n, sc };
    }
    if (!best) return null;
    chosen.push(best.n);
  }
  return { ...lv, mystery: chosen.sort((a, b) => a - b) };
}

// ---------------------------------------------------------------- locks
function addLocks(lv, needs) {
  const singles = lv.pieces.filter((p) => p.length === 1).map((p) => p[0]);
  const ctx = HB.ctx(lv);
  const grid = new Map(ctx.givens);
  const info = new Map(singles.map((n) => [n, HB.tileCandidates(ctx, [n], grid, rules)]));
  // a lock is most visible on a tile that WOULD be easy to place: it has an anchor, but the padlock holds it back
  const easy = singles.filter((n) => info.get(n).count === 1 && !info.get(n).orphan);
  const pool = (easy.length >= needs.length ? easy : singles.filter((n) => !info.get(n).orphan && info.get(n).count <= 3)).sort((a, b) => a - b);
  const picks = [];
  const N = lv.cells.length;
  for (const need of needs) {
    // spread the locks along the chain: aim for different thirds of the numbers
    const want = (N * (picks.length + 1)) / (needs.length + 1);
    const cand = pool.filter((n) => !picks.some((m) => HB.dist(lv.solution[m], lv.solution[n]) < 3)).sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
    if (!cand.length) return null;
    picks.push(cand[0]);
  }
  const locks = picks.map((n, i) => ({ cell: lv.solution[n].slice(), need: needs[i] }));
  const out = { ...lv, locks };
  const d = HB.draftFromLevel(out);
  const c = HB.compile(d);
  return c.ok ? out : null;
}

// ---------------------------------------------------------------- portals
function portalPairs(lv, count, rand) {
  const cells = lv.cells, water = new Set(lv.blocked.map(key));
  const pairs = [];
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const d = HB.dist(cells[i], cells[j]);
    if (d < 3 || d > 6) continue;
    // reward pairs that bridge water: the line between them crosses blocked cells
    const pa = HB.toPixel(cells[i][0], cells[i][1], 1), pb = HB.toPixel(cells[j][0], cells[j][1], 1);
    let wet = 0;
    for (let t = 1; t < 8; t++) {
      const x = pa.x + (pb.x - pa.x) * (t / 8), y = pa.y + (pb.y - pa.y) * (t / 8);
      if (water.has(key(HB.fromPixel(x, y, 1)))) wet++;
    }
    pairs.push({ a: cells[i], b: cells[j], sc: Math.min(wet, 4) * 2 - Math.abs(d - 4) + rand() * 2.5 });
  }
  pairs.sort((x, y) => y.sc - x.sc);
  const out = [];
  for (const p of pairs) {
    if (out.length >= 60) break;
    out.push(p);
  }
  // build `count`-pair combinations (pairs must not share a cell and should sit apart)
  if (count === 1) return out.map((p) => [[p.a, p.b]]);
  const combos = [];
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
    const P = out[i], Q = out[j];
    const cs = [P.a, P.b, Q.a, Q.b].map(key);
    if (new Set(cs).size < 4) continue;
    if (Math.min(HB.dist(P.a, Q.a), HB.dist(P.a, Q.b), HB.dist(P.b, Q.a), HB.dist(P.b, Q.b)) < 3) continue;
    combos.push({ pairs: [[P.a, P.b], [Q.a, Q.b]], sc: P.sc + Q.sc + rand() * 3 });
  }
  combos.sort((x, y) => y.sc - x.sc);
  return combos.slice(0, 80).map((c) => c.pairs);
}

async function addPortals(lv, plan) {
  const rand = HB.rng(lv.id * 104729);
  const d0 = HB.draftFromLevel(lv);
  const combos = portalPairs(lv, plan.portals, rand);
  const N = lv.cells.length;
  const t = plan.boss ? plan.boss.t : plan.target;
  const target = { easy: t[0], medium: t[1], hard: t[2] };
  const tier = HB.tierFor(rules, lv.id);
  let best = null, tried = 0;
  for (const pairs of combos) {
    if (best && !plan.boss) break;
    if (tried++ > 40) break;
    const pk = pairs.map(([a, b]) => [key(a), key(b)]);
    for (let s = 0; s < 8; s++) {
      const path = HB.findPath(lv.cells, HB.rng(lv.id * 7919 + tried * 31 + s), { portals: pk, requirePortals: true, turnW: [0.6, 0.3, 0, -0.2][s % 4], budget: 50000 });
      if (!path || HB.isSpiral(path)) continue;
      // each portal must be crossed away from the very ends of the chain
      const idx = pk.map(([a, b]) => Math.min(path.indexOf(a), path.indexOf(b)));
      if (idx.some((i) => i < 4 || i > N - 6)) continue;
      const base = { ...d0, path, portals: pairs.map(([a, b]) => [a.slice(), b.slice()]), givenCells: [], groups: [], mysteryCells: [], locks: [] };
      for (let seed = 1; seed <= 6; seed++) {
        const res = await HB.generate({ base, target, tol: plan.boss ? 0.1 : 0.06, maxPiece: 3,
          givenRange: plan.boss ? plan.boss.g : [0.2, 0.4], maxOrphan: plan.boss ? 0.5 : tier.orphan[1],
          keepPath: true, path, freeStart: true, timeMs: 1800, seed, want: 6, rules });
        for (const r of res.results) {
          const c = HB.compile(r.draft);
          if (!c.ok || c.warnings.some((w) => w.includes('không được lời giải dùng'))) continue;
          if (HB.solve(c.level).status !== 'logic') continue;
          const a = HB.analyzeLevel(c.level, rules), m = a.metrics;
          let sc;
          if (plan.boss) {
            const blind = m.pt.steps.filter((x) => x.count >= 2 || x.stuck).length;
            sc = m.hardPct * 2 + m.orphanPct - m.easyPct * 2 + blind / m.tiles * 2 + m.size3Pct * 0.5 - Math.max(0, m.givenPct - plan.boss.g[1]) * 4;
          } else {
            if (!a.checks.ok) continue;
            sc = -Math.abs(m.easyPct - target.easy) - Math.abs(m.hardPct - target.hard);
          }
          if (!best || sc > best.sc) best = { sc, c, m };
        }
        if (best && !plan.boss) break;
      }
      if (best && !plan.boss) break;
    }
  }
  if (!best) return null;
  best.c.level.difficulty = lv.difficulty;
  return best.c.level;
}

// ---------------------------------------------------------------- run
const out = [];
for (const lv of levels) {
  const plan = PLAN[lv.id];
  if (!plan) { out.push(lv); continue; }
  const clean = { ...lv };
  delete clean.mystery; delete clean.portals; delete clean.locks;
  let res = null;
  if (plan.mystery) res = addMystery(clean, plan.mystery, plan.intro);
  else if (plan.locks) res = addLocks(clean, plan.locks);
  else if (plan.portals) res = await addPortals(clean, plan);
  if (!res) { console.log(`level ${lv.id}: FAILED, kept old`); out.push(lv); continue; }
  const m0 = metricsOf(clean), m = metricsOf(res);
  const tags = [res.blocked.length ? 'water' : '', res.mystery ? `mystery[${res.mystery}]` : '', res.portals ? `portals${JSON.stringify(res.portals)}` : '', res.locks ? `locks${JSON.stringify(res.locks.map((l) => [l.cell, l.need]))}` : ''].filter(Boolean);
  const pct = (x) => Math.round(x * 100);
  console.log(`level ${lv.id}: ${tags.join(' + ')}\n   E/M/H ${pct(m0.easyPct)}/${pct(m0.mediumPct)}/${pct(m0.hardPct)} -> ${pct(m.easyPct)}/${pct(m.mediumPct)}/${pct(m.hardPct)}  orphan ${m0.orphan}->${m.orphan}  idx ${m0.index.toFixed(2)}->${m.index.toFixed(2)}  givens ${m.givens}/${m.cells}  solver ${HB.solve(res).status}`);
  out.push(res);
}
if (write) { writeFileSync(file, JSON.stringify(out)); console.log('wrote src/levels.json'); } else console.log('(dry run, --write to save)');
