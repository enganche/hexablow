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

/** Map cell key -> { to: [q,r], idx } for every portal cell. */
export function portalMap(level) {
  const m = new Map();
  (level.portals || []).forEach(([a, b], idx) => {
    m.set(key(a[0], a[1]), { to: b, idx });
    m.set(key(b[0], b[1]), { to: a, idx });
  });
  return m;
}

/** Neighbours for the number chain: touching on the grid, or the two ends of a portal pair. */
export function linked(portals, a, b) {
  if (areAdjacent(a, b)) return true;
  const p = portals.get(key(a[0], a[1]));
  return !!p && p.to[0] === b[0] && p.to[1] === b[1];
}
