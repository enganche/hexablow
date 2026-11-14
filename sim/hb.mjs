// Loads the level tool's classic scripts (global `HB`: hex math, rules, solver) into Node,
// so the bot sees exactly the same candidate rule the level designers use.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const tool = join(here, '..', 'level-tool', 'js');
if (!globalThis.HB) {
  for (const f of ['hexcore', 'rules', 'solver']) {
    vm.runInThisContext(readFileSync(join(tool, f + '.js'), 'utf8'), { filename: f + '.js' });
  }
}
export const HB = globalThis.HB;

const src = join(here, '..', 'src');
export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const loadConfig = () => ({
  levels: readJson(join(src, 'levels.json')),
  economy: readJson(join(src, 'economy.json')),
  shop: readJson(join(src, 'shop.json')),
  cosmetics: readJson(join(src, 'cosmetics.json')),
  collection: readJson(join(src, 'collection.json')),
});
