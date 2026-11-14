// Auto-hint: when the player is stuck, point at the easiest tray tile "so far" under the difficulty rule
// (level-tool/DIFFICULTY_RULES.md): the tile with the fewest positions it can be dragged to such that it
// touches every n-1 / n+1 already on the grid ("strict" count). The player is asked to tap the grid number
// next to that tile; the game's tap-to-jump then scrolls the tray to it.
import tuning from './tuning.json';
import { DIRS, key, areAdjacent } from './hex.js';

/** Seconds without placing a tile before the hint appears. */
export const HINT_IDLE_SECONDS = tuning.hint.idleSeconds;

/**
 * Easiest tile to place right now.
 * @param level  {cells, givens: {n: [q,r]}}
 * @param placed Map number -> [q,r] of tiles the player already placed
 * @param pieces remaining tray pieces [{numbers, offsets}] (offsets relative to numbers[0])
 * @returns {piece, count, tapNumber, tapCell, partner} | null   (null: no tile has a number to hook onto yet)
 */
export function pickHint(level, placed, pieces) {
  const grid = new Map();
  for (const [n, c] of Object.entries(level.givens)) grid.set(Number(n), c);
  for (const [n, c] of placed) grid.set(n, c);
  const occ = new Set([...grid.values()].map((c) => key(c[0], c[1])));
  const cellSet = new Set(level.cells.map((c) => key(c[0], c[1])));
  const find = (m) => pieces.find((p) => p.numbers.includes(m));

  let best = null;
  for (const p of pieces) {
    const anchors = []; // [piece number, grid number it touches]
    const seen = new Set();
    let count = 0;
    p.numbers.forEach((m, i) => {
      for (const v of [m - 1, m + 1]) {
        if (!grid.has(v) || p.numbers.includes(v)) continue;
        anchors.push([m, v]);
        const vc = grid.get(v);
        for (const [dq, dr] of DIRS) {
          const t = [vc[0] + dq - p.offsets[i][0], vc[1] + dr - p.offsets[i][1]]; // where numbers[0] would sit
          const tk = key(t[0], t[1]);
          if (seen.has(tk)) continue;
          seen.add(tk);
          const cells = p.offsets.map(([oq, or]) => [t[0] + oq, t[1] + or]);
          if (!cells.every((c) => cellSet.has(key(c[0], c[1])) && !occ.has(key(c[0], c[1])))) continue; // covered / blocked / shape
          let ok = true;
          p.numbers.forEach((n, j) => {
            for (const w of [n - 1, n + 1]) if (grid.has(w) && !p.numbers.includes(w) && !areAdjacent(cells[j], grid.get(w))) ok = false;
          });
          if (ok) count++;
        }
      }
    });
    if (!anchors.length) continue; // orphan: nothing on the grid to tap yet
    if (!best || count < best.count || (count === best.count && p.numbers[0] < best.piece.numbers[0])) best = { piece: p, count, anchors };
  }
  if (!best) return null;

  // which grid number to tap: prefer one where the tray's first jump lands on this tile
  // (tap-to-jump goes to the tile holding n-1 first, else n+1)
  const first = (v) => find(v - 1) ?? find(v + 1);
  const pick = best.anchors.find(([, v]) => first(v) === best.piece) ?? best.anchors[0];
  return { piece: best.piece, count: best.count, tapNumber: pick[1], tapCell: grid.get(pick[1]), partner: pick[0] };
}
