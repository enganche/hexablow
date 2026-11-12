// node level-tool/regen.mjs [fromId=5]  — keeps map + path of each level >= fromId, regenerates givens + tray cut
// so the tile mix hits the per-level target below (rule: DIFFICULTY_RULES.md). Rewrites src/levels.json.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
for (const f of ['hexcore', 'rules', 'solver', 'model', 'generator']) vm.runInThisContext(readFileSync(join(here, 'js', f + '.js'), 'utf8'));
const file = join(here, '..', 'src', 'levels.json');
const levels = JSON.parse(readFileSync(file, 'utf8'));
const from = +process.argv[2] || 5;
// target [easy, medium, hard]: Easy falls and Hard rises every level, inside each tier band
const T = { 5: [.46,.40,.14], 6: [.44,.40,.16], 7: [.42,.40,.18], 8: [.38,.40,.22], 9: [.36,.40,.24], 10: [.34,.40,.26],
  11: [.32,.40,.28], 12: [.30,.40,.30], 13: [.28,.38,.34], 14: [.26,.36,.38], 15: [.22,.36,.42] };
const rules = HB.DEFAULT_RULES;
const out = [];
for (const lv of levels) {
  if (lv.id < from || !T[lv.id]) { out.push(lv); continue; }
  const d = HB.draftFromLevel(lv);
  const t = T[lv.id], target = { easy: t[0], medium: t[1], hard: t[2] };
  const tier = HB.tierFor(rules, lv.id);
  let best = null;
  for (let seed = 1; seed <= 40 && !best; seed++) {
    const res = await HB.generate({ base: d, target, tol: 0.06, maxPiece: 3, givenRange: [0.2, 0.4], maxOrphan: tier.orphan[1],
      keepPath: true, path: d.path, timeMs: 2500, seed, want: 6, rules });
    for (const r of res.results) {
      const c = HB.compile(r.draft);
      const a = HB.analyzeLevel(c.level, rules);
      if (c.ok && a.checks.ok && HB.solve(c.level).status === 'logic') { best = { c, a, r }; break; }
    }
  }
  if (!best) { console.log(`level ${lv.id}: NOT FOUND, kept old`); out.push(lv); continue; }
  best.c.level.difficulty = lv.difficulty;
  const m = best.a.metrics;
  console.log(`level ${lv.id}: E/M/H ${Math.round(m.easyPct*100)}/${Math.round(m.mediumPct*100)}/${Math.round(m.hardPct*100)} orphan ${m.orphan} 3x ${Math.round(m.size3Pct*100)}% idx ${m.index.toFixed(2)} givens ${m.givens}/${m.cells}`);
  out.push(best.c.level);
}
writeFileSync(file, JSON.stringify(out));
