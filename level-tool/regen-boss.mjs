// node level-tool/regen-boss.mjs [--write]  — milestone "boss" levels (5, 10, 15): keeps map + path, searches givens + tray cut
// for FEW easy tiles, many hard/orphan tiles and many play-through steps with no single-position tile (needs chained
// deduction), still 'logic'-solvable. Marks them difficulty "hard".
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
for (const f of ['hexcore', 'rules', 'solver', 'model', 'generator']) vm.runInThisContext(readFileSync(join(here, 'js', f + '.js'), 'utf8'));
const file = join(here, '..', 'src', 'levels.json');
const levels = JSON.parse(readFileSync(file, 'utf8'));
const rules = HB.DEFAULT_RULES;
// target [easy, medium, hard] + max given share
const BOSS = { 5: { t: [.20, .40, .40], g: [.22, .30] }, 10: { t: [.14, .36, .50], g: [.18, .26] }, 15: { t: [.08, .32, .60], g: [.18, .26] } };
const write = process.argv.includes('--write');
const out = [];
for (const lv of levels) {
  const cfg = BOSS[lv.id];
  if (!cfg) { out.push(lv.difficulty === 'hard' ? { ...lv, difficulty: 'normal' } : lv); continue; }
  const d = HB.draftFromLevel(lv);
  let best = null;
  for (let seed = 1; seed <= 25; seed++) {
    const res = await HB.generate({ base: d, target: { easy: cfg.t[0], medium: cfg.t[1], hard: cfg.t[2] }, tol: 0.1, maxPiece: 3,
      givenRange: cfg.g, maxOrphan: 0.5, keepPath: true, path: d.path, timeMs: 2500, seed, want: 8, rules });
    for (const r of res.results) {
      const c = HB.compile(r.draft);
      if (!c.ok || HB.solve(c.level).status !== 'logic') continue;
      const a = HB.analyzeLevel(c.level, rules);
      const m = a.metrics;
      const blind = m.pt.steps.filter((s) => s.count >= 2 || s.stuck).length; // steps with no single-position tile
      const sc = m.hardPct * 2 + m.orphanPct - m.easyPct * 2 + blind / m.tiles * 2 + m.size3Pct * 0.5 - Math.max(0, m.givenPct - cfg.g[1]) * 4;
      if (!best || sc > best.sc) best = { sc, c, m, blind };
    }
  }
  if (!best) { console.log(`level ${lv.id}: NOT FOUND`); out.push(lv); continue; }
  best.c.level.difficulty = 'hard';
  const m = best.m;
  console.log(`level ${lv.id}: E/M/H ${m.easy}/${m.medium}/${m.hard} orphan ${m.orphan} 3x ${m.size3} idx ${m.index.toFixed(2)} givens ${m.givens}/${m.cells} peak ${m.pt.peak} stuck ${m.pt.stuck} noEasyStep ${best.blind}/${m.tiles}`);
  out.push(best.c.level);
}
if (write) writeFileSync(file, JSON.stringify(out)); else console.log('(dry run, --write to save)');
