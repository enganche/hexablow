// node level-tool/analysis-table.mjs [--write]
// Builds the summary table of ANALYSIS_15_LEVELS.md from the static rule check (analyze.mjs) and the bot lab results
// (sim/out/report.json, made by: node sim/run.mjs --plays 100 --bots 150 --seed 1).
// Without --write it prints the table; with --write it replaces the block between the two <!-- table --> markers.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
for (const f of ['hexcore', 'rules', 'solver', 'model']) vm.runInThisContext(readFileSync(join(here, 'js', f + '.js'), 'utf8'));
const levels = JSON.parse(readFileSync(join(here, '..', 'src', 'levels.json'), 'utf8'));
const simFile = join(here, '..', 'sim', 'out', 'report.json');
if (!existsSync(simFile)) { console.error('Missing sim/out/report.json — run: node sim/run.mjs --plays 100 --bots 150 --seed 1'); process.exit(1); }
const sim = JSON.parse(readFileSync(simFile, 'utf8'));
const rules = HB.DEFAULT_RULES;
const LABEL = { water: 'nước', mystery: 'ẩn', portal: 'cổng', lock: 'khóa' };
const p0 = (x) => Math.round(x * 100);

const rows = [];
let ok = 0;
for (const lv of levels) {
  const a = HB.analyzeLevel(lv, rules), m = a.metrics, s = sim.lab.find((r) => r.level === lv.id);
  const bad = a.checks.items.filter((i) => !i.ok).map((i) => `${i.label.replace(' (không mốc)', '')} ${i.dir === 'low' ? '↓' : '↑'}`);
  if (a.checks.ok) ok++;
  const hard = lv.difficulty === 'hard';
  const b = (t) => (hard ? `**${t}**` : t);
  const hidden = (lv.mystery || []).length;
  rows.push(
    `| ${lv.id} | ${hard ? '**hard**' : lv.difficulty} | ${HB.mechanicsOf(lv).map((x) => LABEL[x]).join(' + ') || '–'} | ${m.cells} | ${m.givens}${hidden ? ` (${hidden} ẩn)` : ''} | ${m.tiles} | ` +
    `${m.easy} / ${m.medium} / ${m.hard}${m.orphan ? ` (${m.orphan})` : ''} | ${m.index.toFixed(2)} | ${a.checks.ok ? '✅' : '❌ ' + bad.join(', ')} | ${m.pt.peak} | ` +
    `${b(p0(s.mix.firstWin) + '%')} | ${p0(s.by.newbie.firstWin)} / ${p0(s.by.casual.firstWin)} | ${s.mix.mistakes.toFixed(2)} | ${p0(s.mix.threeStar)}% | ${(s.mix.timeToWin / 60).toFixed(1)} ph |`
  );
}
const table =
  '| Lv | Nhãn | Cơ chế | Ô | Given | Ô khay | Dễ / TB / Khó | Index | Rule | Đỉnh play-through | Bot: thắng lần đầu (mix) | Người mới / Phổ thông | Sai mỗi lượt | 3★ | Thời gian tới khi thắng |\n' +
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n' + rows.join('\n');
const summary = `Theo rule tĩnh, **${ok} / ${levels.length} level đạt dải bậc**.`;
console.log(table + '\n\n' + summary);

if (process.argv.includes('--write')) {
  const f = join(here, 'ANALYSIS_15_LEVELS.md');
  let t = readFileSync(f, 'utf8');
  const a = t.indexOf('<!-- table:start -->'), z = t.indexOf('<!-- table:end -->');
  if (a < 0 || z < 0) { console.error('Markers <!-- table:start --> / <!-- table:end --> not found in ' + f); process.exit(1); }
  t = t.slice(0, a) + '<!-- table:start -->\n' + table + '\n<!-- table:end -->' + t.slice(z + '<!-- table:end -->'.length);
  writeFileSync(f, t);
  console.log('\nwrote ' + f);
}
