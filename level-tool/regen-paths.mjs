// node level-tool/regen-paths.mjs [fromId=5] [--check]
// 1. flags levels whose solution path is a SPIRAL (ring distance from the centre drifts steadily with the number),
// 2. gives each flagged level a fresh, non-spiral Hamiltonian path on the SAME map,
// 3. re-cuts givens + tray for every level >= fromId with only the LAST number forced to be a given (1 may be in the tray).
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
for (const f of ['hexcore', 'rules', 'solver', 'model', 'generator']) vm.runInThisContext(readFileSync(join(here, 'js', f + '.js'), 'utf8'));
const file = join(here, '..', 'src', 'levels.json');
const levels = JSON.parse(readFileSync(file, 'utf8'));
const from = +process.argv.slice(2).find((a) => !a.startsWith('--')) || 5;
const checkOnly = process.argv.includes('--check');

const spiral = (cells) => HB.spiralScore(cells.map((c) => c[0] + ',' + c[1]));
const isSpiral = (cells) => HB.isSpiral(cells.map((c) => c[0] + ',' + c[1]));
const pathOf = (lv) => { const p = []; for (let i = 1; i <= lv.cells.length; i++) p.push(lv.solution[i]); return p; };

for (const lv of levels) if (lv.id >= from) {
  const s = spiral(pathOf(lv));
  console.log(`level ${lv.id}: corr ${s.corr.toFixed(2)} ringReversals ${s.rev} ${isSpiral(pathOf(lv)) ? 'SPIRAL' : 'ok'}`);
}
if (checkOnly) process.exit(0);

const T = { 5: [.46,.40,.14], 6: [.44,.40,.16], 7: [.42,.40,.18], 8: [.38,.40,.22], 9: [.36,.40,.24], 10: [.34,.40,.26],
  11: [.32,.40,.28], 12: [.30,.40,.30], 13: [.28,.38,.34], 14: [.26,.36,.38], 15: [.22,.36,.42] };
const rules = HB.DEFAULT_RULES;
const key = (c) => c[0] + ',' + c[1];
const out = [];
for (const lv of levels) {
  if (lv.id < from || !T[lv.id]) { out.push(lv); continue; }
  const base = HB.draftFromLevel(lv);
  let path = base.path;
  if (isSpiral(pathOf(lv))) {
    // fresh path: random DFS with weak straightness, keep the least spiral-like with a calm number of turns
    let best = null;
    for (let a = 0; a < 400; a++) {
      const p = HB.findPath(lv.cells, HB.rng ? HB.rng(lv.id * 7919 + a) : mulberry(lv.id * 7919 + a), { turnW: [0.5, 0.2, 0, -0.2][a % 4], budget: 40000 });
      if (!p) continue;
      const cs = p.map((k) => k.split(',').map(Number));
      const s = spiral(cs);
      if (isSpiral(cs)) continue;
      const sc = Math.abs(s.corr) - Math.min(s.rev, 40) / 100 + HB.turns(p) / 200;
      if (!best || sc < best.sc) best = { p, sc, s, t: HB.turns(p) };
    }
    if (!best) { console.log(`level ${lv.id}: no non-spiral path found`); out.push(lv); continue; }
    path = best.p;
    console.log(`level ${lv.id}: new path corr ${best.s.corr.toFixed(2)} reversals ${best.s.rev} turns ${best.t}`);
  }
  const t = T[lv.id], target = { easy: t[0], medium: t[1], hard: t[2] };
  const tier = HB.tierFor(rules, lv.id);
  let found = null;
  for (let seed = 1; seed <= 40 && !found; seed++) {
    const res = await HB.generate({ base, target, tol: 0.06, maxPiece: 3, givenRange: [0.2, 0.4], maxOrphan: tier.orphan[1],
      keepPath: true, path, freeStart: true, timeMs: 2500, seed, want: 6, rules });
    for (const r of res.results) {
      const c = HB.compile(r.draft);
      const a = HB.analyzeLevel(c.level, rules);
      if (c.ok && a.checks.ok && HB.solve(c.level).status === 'logic') { found = { c, a }; break; }
    }
  }
  if (!found) { console.log(`level ${lv.id}: NOT FOUND, kept old`); out.push(lv); continue; }
  found.c.level.difficulty = lv.difficulty;
  const m = found.a.metrics, g = found.c.level.givens;
  console.log(`level ${lv.id}: E/M/H ${Math.round(m.easyPct*100)}/${Math.round(m.mediumPct*100)}/${Math.round(m.hardPct*100)} givens ${m.givens}/${m.cells} has1=${!!g[1]} hasN=${!!g[m.cells]}`);
  out.push(found.c.level);
}
writeFileSync(file, JSON.stringify(out));
console.log('wrote src/levels.json');
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
