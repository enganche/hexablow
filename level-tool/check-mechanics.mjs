// node level-tool/check-mechanics.mjs [path/to/levels.json]
// Checks the mechanic rules for every level: <= 2 mechanics per level (the pond counts), the solver still says "logic",
// the draft -> compile round trip is lossless, portals are really used by the solution, a "?" can be opened by a tray
// tile, locks can be reached with the cells solvable without them, and levels >= 5 do not spiral.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
for (const f of ['hexcore', 'rules', 'solver', 'model']) vm.runInThisContext(readFileSync(join(here, 'js', f + '.js'), 'utf8'));
const file = resolve(process.argv[2] || join(here, '..', 'src', 'levels.json'));
const levels = JSON.parse(readFileSync(file, 'utf8'));
const key = (c) => c[0] + ',' + c[1];
let bad = 0;
const cfg = JSON.parse(readFileSync(join(here, '..', 'src', 'mechanics.json'), 'utf8'));
const UNLOCK = Object.fromEntries(['mystery', 'portal', 'lock'].map((m) => [m, cfg[m].unlockLevel])); // single source: src/mechanics.json
for (const lv of levels) {
  const used = [];
  if ((lv.blocked || []).length) used.push('water');
  if ((lv.mystery || []).length) used.push('mystery');
  if ((lv.portals || []).length) used.push('portal');
  if ((lv.locks || []).length) used.push('lock');
  const errs = [];
  if (used.length > 2) errs.push(`${used.length} mechanics (max 2)`);
  for (const m of used) if (UNLOCK[m] && lv.id < UNLOCK[m]) errs.push(`${m} before its unlock level ${UNLOCK[m]}`);
  const sv = HB.solve(lv).status;
  if (sv !== 'logic') errs.push(`solver: ${sv}`);
  const c = HB.compile(HB.draftFromLevel(lv));
  if (!c.ok) errs.push(...c.errors);
  else if (JSON.stringify(c.level) !== JSON.stringify({ ...lv, name: c.level.name })) {
    const a = c.level, b = lv;
    const diff = Object.keys({ ...a, ...b }).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    if (diff.length) errs.push('round trip differs: ' + diff.join(','));
  }
  if (c.warnings && lv.id >= 5) for (const w of c.warnings) errs.push('warning: ' + w);
  const num = new Map(Object.entries(lv.solution).map(([n, p]) => [key(p), +n]));
  for (const [a, b] of lv.portals || []) {
    if (Math.abs(num.get(key(a)) - num.get(key(b))) !== 1) errs.push(`portal ${key(a)}<->${key(b)} unused by the solution`);
  }
  for (const n of lv.mystery || []) {
    if (!lv.givens[n]) errs.push(`mystery ${n} is not a given`);
    const nb = [n - 1, n + 1].filter((m) => m >= 1 && m <= lv.cells.length && !lv.givens[m]);
    if (!nb.length) errs.push(`mystery ${n} has no tray neighbour: nothing can open it`);
  }
  if (lv.mystery?.includes(lv.cells.length)) errs.push('last number is a mystery');
  const tag = [lv.blocked.length ? `water(${lv.blocked.length})` : '', lv.mystery ? `mystery[${lv.mystery}]` : '', lv.portals ? `portals(${lv.portals.length})` : '', lv.locks ? `locks(${lv.locks.map((l) => l.need)})` : ''].filter(Boolean).join(' + ') || '-';
  console.log(`${String(lv.id).padStart(2)} ${(used.length + '').padStart(1)}  ${tag.padEnd(34)} ${errs.length ? 'FAIL ' + errs.join('; ') : 'ok'}`);
  bad += errs.length ? 1 : 0;
}
console.log(bad ? `\n${bad} level(s) with problems` : '\nall levels pass');
process.exit(bad ? 1 : 0);
