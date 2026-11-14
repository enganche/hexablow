// Bot player: plays ONE attempt of a level the way a person would.
//
// Each turn the bot
//   1. glances at the first `scan` pieces of the tray at its base reasoning `depth`
//      (0 = only "where does it hook onto a number I can see", 1+ = rounds of deduction, see Board.domains);
//   2. if no piece has a single obvious spot it may "think harder" (prob. `persist` per step):
//      first by looking at the whole tray, then one more round of deduction, up to `maxDepth`;
//   3. a single spot -> places it (but slips onto a wrong spot with prob. `slip`);
//      several spots -> "stuck": maybe uses a booster, otherwise guesses one of the spots.
// A wrong drop costs a heart (not on free-heart runs) and the bot remembers that spot with prob. `memory`.
// At 0 hearts the meta layer decides revive / give up.
import { HB } from './hb.mjs';
import { Board } from './board.mjs';

const pickOne = (arr, rand) => arr[Math.floor(rand() * arr.length)];

/** Tray order like src/game.js: level 1 fixed shuffle, level 2 ascending, level 3+ random per play. */
export function trayOrder(level, rand) {
  const pieces = level.pieces.map((p) => p.slice());
  if (level.id === 2) return pieces;
  if (level.id === 1) return HB.shuffle(pieces, HB.rng(level.id * 7919)); // fixed (game uses its own seeded shuffle)
  return HB.shuffle(pieces, rand);
}

/**
 * meta (optional) — hooks into the economy layer:
 *   unlocked(id) -> bool, stock(id) -> n, acquire(id) -> bool (buy / ad / IAP, policy lives in meta),
 *   consume(id), onFail(state) -> bool (true = revived with 1 heart)
 * opts: { freeHearts, lesson: boosterId|null }
 */
export function playAttempt(level, persona, rand, meta = null, opts = {}) {
  const sk = persona.skill;
  const tm = persona.time;
  const board = new Board(level, trayOrder(level, rand));
  const memory = new Map(); // piece id -> Set(anchor keys known to be wrong)
  const st = {
    win: false, hearts: 3, moves: 0, mistakes: 0, slips: 0, guesses: 0, guessesRight: 0, thinks: 0,
    stuckTurns: 0, peak: 0, time: 0, revives: 0, boosters: {}, counts: [], lostAt: null,
  };

  const excluded = (p) => memory.get(p.id) || new Set();
  const revealedAnchor = (p) => {
    for (let i = 0; i < p.nums.length; i++) {
      const c = board.revealed.get(p.nums[i]);
      if (c) {
        const [q, r] = HB.parse(c);
        return HB.key(q - p.offs[i][0], r - p.offs[i][1]);
      }
    }
    return null;
  };

  const useBooster = (id, focus) => {
    meta.consume(id);
    st.boosters[id] = (st.boosters[id] || 0) + 1;
    st.time += tm.booster;
    if (id === 'reveal') {
      const open = board.emptyCells().filter((k) => ![...board.revealed.values()].includes(k));
      if (!open.length) return;
      const k = pickOne(open, rand);
      const owner = board.ownerOf(k);
      if (owner) {
        const cells = board.cellsAt(owner, owner.home);
        owner.nums.forEach((n, i) => { if (cells[i] === k) board.revealed.set(n, k); });
      }
    } else if (id === 'find') {
      // the player taps one of the cells they hesitate about; whatever belongs there flies in
      const spot = focus && focus.cands.length ? pickOne(focus.cands, rand) : null;
      const cell = spot ? pickOne(board.cellsAt(focus.p, spot).filter((k) => board.cellSet.has(k) && !board.occ.has(k)), rand) : null;
      const owner = (cell && board.ownerOf(cell)) || board.ownerOf(pickOne(board.emptyCells(), rand));
      if (owner) { board.place(owner); st.moves++; }
    } else if (id === 'picker') {
      board.place(focus ? focus.p : board.pieces[0]);
      st.moves++;
    }
  };

  // booster lesson on the level that unlocks it: the game gifts 2 and makes the player use one
  if (opts.lesson && meta) useBooster(opts.lesson, { p: board.pieces[0], cands: [board.pieces[0].home] });

  let guard = 0;
  while (!board.done && guard++ < 2000) {
    let snaps = null;
    const evaluate = (scope, depth) => {
      let best = null;
      for (const p of scope) {
        let cands;
        const ra = revealedAnchor(p);
        if (ra && board.fits(p, ra)) cands = [ra];
        else if (depth === 0) cands = board.surface(p);
        else {
          snaps ||= board.domains(sk.maxDepth);
          cands = board.fromDomains(p, snaps[Math.min(depth, snaps.length) - 1]);
        }
        if (!cands) continue; // orphan at a glance: the player does not consider it
        const ex = excluded(p);
        cands = cands.filter((t) => !ex.has(t));
        if (!best || cands.length < best.cands.length || (cands.length === best.cands.length && p.nums[0] < best.p.nums[0])) best = { p, cands };
      }
      return best;
    };

    const tray = board.pieces;
    let scope = tray.slice(0, Math.min(tray.length, sk.scan));
    let depth = sk.depth;
    let best = evaluate(scope, depth);
    st.time += tm.base + tm.perPiece * scope.length;
    while (!best || best.cands.length > 1) {
      const canWiden = scope.length < tray.length;
      const canDeepen = depth < sk.maxDepth && (depth === 0 || !snaps || depth < snaps.length);
      if (!(canWiden || canDeepen) || rand() >= sk.persist) break;
      if (canWiden) scope = tray;
      else depth++;
      st.thinks++;
      st.time += tm.think;
      const b = evaluate(scope, depth);
      if (b && (!best || b.cands.length <= best.cands.length)) best = b;
    }
    if (!best) {
      // everything left is an orphan at a glance: fall back to "where does it physically fit"
      for (const p of tray) {
        const ex = excluded(p);
        const cands = board.allFits(p).filter((t) => !ex.has(t));
        if (!best || cands.length < best.cands.length) best = { p, cands };
      }
    }
    const count = best.cands.length;
    st.counts.push(count);
    st.peak = Math.max(st.peak, count);
    st.time += tm.perCand * Math.log2(1 + count);

    let target;
    if (count <= 1) {
      target = best.cands[0] ?? best.p.home;
      if (rand() < sk.slip) {
        const wrong = board.allFits(best.p).filter((t) => t !== best.p.home);
        if (wrong.length) { target = pickOne(wrong, rand); st.slips++; }
      }
    } else {
      st.stuckTurns++;
      if (meta && boosterWanted(persona, st, count)) {
        const id = pickBooster(persona, meta);
        if (id) { useBooster(id, best); continue; }
      }
      target = pickOne(best.cands, rand);
      st.guesses++;
      if (target === best.p.home) st.guessesRight++;
    }

    st.moves++;
    if (board.isCorrect(best.p, target)) {
      board.place(best.p);
      continue;
    }
    // wrong drop
    st.mistakes++;
    st.time += tm.mistake;
    if (rand() < sk.memory) {
      if (!memory.has(best.p.id)) memory.set(best.p.id, new Set());
      memory.get(best.p.id).add(target);
    }
    if (opts.freeHearts) continue;
    st.hearts--;
    if (st.hearts > 0) continue;
    if (meta && meta.onFail(st, board)) {
      st.revives++;
      st.hearts = 1;
      continue;
    }
    st.lostAt = board.filled;
    return st;
  }
  st.win = board.done;
  return st;
}

function boosterWanted(persona, st, count) {
  const b = persona.boosters;
  if (b.when === 'never') return false;
  if (count < b.minCands) return false;
  const used = Object.values(st.boosters).reduce((a, n) => a + n, 0);
  if (used >= (b.maxPerAttempt ?? Infinity)) return false;
  if (b.when === 'stuck') return true;
  if (b.when === 'lastHeart') return st.hearts === 1;
  return false;
}

function pickBooster(persona, meta) {
  const order = persona.boosters.prefer;
  for (const id of order) if (meta.unlocked(id) && meta.stock(id) > 0) return id;
  for (const id of order) if (meta.unlocked(id) && meta.acquire(id)) return id;
  return null;
}
