// Level obstacles beyond the pond: mystery numbers, twin portals, locked cells.
// Level data (all optional, see GDD §6):
//   mystery: [n, ...]                        givens that show "?" until a tile is placed next to them
//   portals: [[[q,r],[q,r]], ...]            pairs of cells that count as neighbours
//   locks:   [{ cell: [q,r], need: K }, ...] cell opens once the player has solved K cells
import cfg from './mechanics.json';
import { areAdjacent, key } from './hex.js';

export const MECH_ORDER = cfg.order;
export const mechInfo = (id) => cfg[id];

/** Mechanics a level uses, in unlock order. */
export function mechanicsOf(level) {
  const used = new Set();
  if ((level.blocked || []).length) used.add('water');
  if ((level.mystery || []).length) used.add('mystery');
  if ((level.portals || []).length) used.add('portal');
  if ((level.locks || []).length) used.add('lock');
  return MECH_ORDER.filter((id) => used.has(id));
}

/** The mechanic whose intro screen opens before this level (the level where it unlocks), or null. */
export function introFor(level) {
  return MECH_ORDER.find((id) => cfg[id].intro && cfg[id].unlockLevel === level.id) ?? null;
}

/**
 * Win-screen progress toward the next mechanic. `cleared` = highest level cleared.
 * Returns null once everything is unlocked.
 * Example: pond unlocks at level 3, mystery at 7 -> after clearing level 4 the bar reads 2/4 (levels 3..6).
 */
export function unlockProgress(cleared) {
  const unlocks = MECH_ORDER.map((id) => ({ id, at: cfg[id].unlockLevel }));
  const next = unlocks.find((u) => u.at > cleared);
  if (!next) return null;
  const prev = [...unlocks].reverse().find((u) => u.at <= cleared);
  const from = prev ? prev.at : 1;
  const total = next.at - from;
  const filled = Math.max(0, Math.min(total, cleared - from + 1));
  return { id: next.id, at: next.at, filled, total, left: next.at - 1 - cleared };
}

/**
 * Map cell key -> { to: [q,r], idx, role } for every portal cell.
 * A portal is one-way for the number chain: the end holding the smaller solution number is the entrance
 * (role 'in'), the other the exit (role 'out'). Without a solution the pair's listed order decides.
 */
export function portalMap(level) {
  const m = new Map();
  const sol = level.solution || {};
  const numAt = (c) => Object.keys(sol).find((n) => sol[n][0] === c[0] && sol[n][1] === c[1]);
  (level.portals || []).forEach(([a, b], idx) => {
    const na = Number(numAt(a)), nb = Number(numAt(b));
    const [from, to] = Number.isFinite(na) && Number.isFinite(nb) && na > nb ? [b, a] : [a, b];
    m.set(key(from[0], from[1]), { to, idx, role: 'in' });
    m.set(key(to[0], to[1]), { to: from, idx, role: 'out' });
  });
  return m;
}

/**
 * Neighbours for the number chain: touching on the grid, or `lo` (the smaller number's cell) sitting on a
 * portal entrance whose exit holds `hi` (the next number). Never the other way round.
 */
export function linked(portals, lo, hi) {
  if (areAdjacent(lo, hi)) return true;
  const p = portals.get(key(lo[0], lo[1]));
  return !!p && p.role === 'in' && p.to[0] === hi[0] && p.to[1] === hi[1];
}
