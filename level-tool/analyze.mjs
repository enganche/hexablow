// Node CLI: node level-tool/analyze.mjs [path/to/levels.json] [--loose] [--detail]
// Static rule check (DIFFICULTY_RULES.md) of every level, with the mechanics each level uses (pond, mystery, portal, lock).
// Mystery givens are not anchors until opened, portals add a hook cell, locks only change the ORDER (not counted here).
// The markdown table of ANALYSIS_15_LEVELS.md comes from: node level-tool/analysis-table.mjs
// Loads the same browser scripts (classic, global `HB`) and prints the rule check for every level.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
for (const f of ['hexcore', 'rules', 'solver', 'model']) {
  try { vm.runInThisContext(readFileSync(join(here, 'js', f + '.js'), 'utf8'), { filename: f + '.js' }); } catch (e) { if (f !== 'solver') throw e; }
}
const args = process.argv.slice(2);
const file = resolve(args.find((a) => !a.startsWith('--')) || join(here, '..', 'src', 'levels.json'));
const levels = JSON.parse(readFileSync(file, 'utf8'));
const rules = JSON.parse(JSON.stringify(HB.DEFAULT_RULES));
if (args.includes('--loose')) rules.tile.anchorMode = 'loose';

const pct = (x) => String(Math.round(x * 100)).padStart(3) + '%';
console.log(`rules: anchorMode=${rules.tile.anchorMode}  file=${file}\n`);
console.log('Lv cells giv  tiles  E/M/H(orph)   E%   M%   H%   orph  idx   3x%  tier        result   solver cơ chế');
for (const lv of levels) {
  const a = HB.analyzeLevel(lv, rules);
  const m = a.metrics;
  const sv = HB.solve ? HB.solve(lv) : null;
  const mech = HB.mechanicsOf(lv).map((m) => ({ water: 'nước', mystery: 'ẩn', portal: 'cổng', lock: 'khóa' }[m])).join('+') || '-';
  const bad = a.checks.items.filter((i) => !i.ok).map((i) => `${i.label}${i.dir === 'low' ? '↓' : '↑'}`);
  console.log(
    `${String(lv.id).padStart(2)} ${String(m.cells).padStart(5)} ${String(m.givens).padStart(3)} ${String(m.tiles).padStart(5)}  ` +
    `${m.easy}/${m.medium}/${m.hard}(${m.orphan})`.padEnd(13) +
    `${pct(m.easyPct)} ${pct(m.mediumPct)} ${pct(m.hardPct)} ${pct(m.orphanPct)}  ${m.index.toFixed(2)} ${pct(m.size3Pct)}  ` +
    `${(a.checks.tier ? a.checks.tier.name.slice(0, 10) : '-').padEnd(11)} ${a.checks.ok ? 'OK  ' : 'FAIL'} ${(sv ? sv.status : '').padEnd(6)} ${mech.padEnd(10)} ${bad.join(', ')}`
  );
}

if (args.includes('--detail')) {
  for (const lv of levels) {
    const a = HB.analyzeLevel(lv, rules);
    console.log(`\n== Level ${lv.id} (${lv.difficulty}) — ${a.metrics.cells} ô, given ${a.metrics.givens}, bậc ${a.checks.tier ? a.checks.tier.name : '-'}`);
    const byCls = { easy: [], medium: [], hard: [], orphan: [] };
    for (const t of a.tiles) byCls[t.orphan ? 'orphan' : t.cls].push(`${t.nums.join('+')}(${t.orphan ? '-' : t.count})`);
    for (const k of Object.keys(byCls)) if (byCls[k].length) console.log(`  ${HB.CLASS_LABEL[k].padEnd(11)} ${byCls[k].join(' ')}`);
    console.log(`  play-through: ${a.metrics.pt.steps.map((s) => (s.stuck ? '?' : s.count)).join(' ')}  | peak ${a.metrics.pt.peak}, kẹt ${a.metrics.pt.stuck}`);
  }
}
