// Persistent player progress (stars per level). Versioned so the shape can grow
// (coins, inventory, streak...) without breaking saves.
import economy from './economy.json';
import cosmetics from './cosmetics.json';
import collection from './collection.json';

const KEY = 'hexablow.progress.v1';

// stars: { [levelId]: 1..3 }, coins: soft currency balance
const empty = () => ({
  v: 2,
  stars: {},
  found: [],
  setsClaimed: [],
  coins: economy.startCoins,
  owned: [...cosmetics.defaults.owned],
  equipped: { ...cosmetics.defaults.equipped },
});

export function loadProgress() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && (raw.v === 1 || raw.v === 2) && raw.stars && typeof raw.stars === 'object') {
      const stars = {};
      for (const [id, n] of Object.entries(raw.stars)) {
        const s = Math.round(Number(n));
        if (s >= 1 && s <= 3) stars[id] = s;
      }
      const c = Math.floor(Number(raw.coins));
      const known = new Set(cosmetics.items.map((i) => i.id));
      const owned = [...new Set([...cosmetics.defaults.owned, ...(Array.isArray(raw.owned) ? raw.owned : [])])].filter((id) => known.has(id));
      const equipped = { ...cosmetics.defaults.equipped };
      for (const [type, id] of Object.entries(raw.equipped ?? {})) {
        if (type in equipped && owned.includes(id)) equipped[type] = id;
      }
      const speciesIds = new Set(collection.species.map((x) => x.id));
      const setIds = new Set(collection.sets.map((x) => x.id));
      const found = [...new Set(Array.isArray(raw.found) ? raw.found : [])].filter((id) => speciesIds.has(id));
      const setsClaimed = [...new Set(Array.isArray(raw.setsClaimed) ? raw.setsClaimed : [])].filter((id) => setIds.has(id));
      return { v: 2, stars, found, setsClaimed, coins: Number.isFinite(c) && c >= 0 ? c : economy.startCoins, owned, equipped };
    }
  } catch {
    /* corrupt or unavailable storage: start fresh */
  }
  return empty();
}

function save(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function starsFor(p, levelId) {
  return p.stars[levelId] ?? 0;
}

export function totalStars(p) {
  return Object.values(p.stars).reduce((a, b) => a + b, 0);
}

export function completedCount(p) {
  return Object.keys(p.stars).length;
}

/** Record a win; keeps the best star count. Returns { prev, best, isNewBest, firstClear }. */
export function recordWin(p, levelId, stars) {
  const prev = starsFor(p, levelId);
  const best = Math.max(prev, stars);
  if (best !== prev) {
    p.stars[levelId] = best;
    save(p);
  }
  return { prev, best, isNewBest: best > prev, firstClear: prev === 0 };
}

export function resetProgress(p) {
  p.stars = {};
  p.found = [];
  p.setsClaimed = [];
  p.coins = economy.startCoins;
  p.owned = [...cosmetics.defaults.owned];
  p.equipped = { ...cosmetics.defaults.equipped };
  save(p);
}

// ---- wallet ----
export function coinsOf(p) {
  return p.coins;
}

export function canAfford(p, cost) {
  return p.coins >= cost;
}

/** Spend coins; returns false (and changes nothing) if the balance is too low. */
export function spend(p, cost) {
  if (!canAfford(p, cost)) return false;
  p.coins -= cost;
  save(p);
  return true;
}

export function earn(p, amount) {
  p.coins += Math.max(0, Math.floor(amount));
  save(p);
}

/** Coins for a win. Full reward on a first clear; replays pay a reduced amount (anti-farming). */
export function winReward(stars, firstClear) {
  const full = economy.win.base + (economy.win.starBonus[stars] ?? 0);
  return firstClear ? full : Math.max(1, Math.round(full * economy.win.replayMultiplier));
}

// ---- cosmetics ----
export const cosmeticItems = cosmetics.items;

export function isOwned(p, id) {
  return p.owned.includes(id);
}

export function equippedItem(p, type) {
  return cosmetics.items.find((i) => i.id === p.equipped[type]);
}

/** Buy an item with coins. Returns false (no change) if unknown, already owned, or too expensive. */
export function buyItem(p, id) {
  const item = cosmetics.items.find((i) => i.id === id);
  if (!item || isOwned(p, id) || !spend(p, item.price)) return false;
  p.owned.push(id);
  save(p);
  return true;
}

export function equipItem(p, id) {
  const item = cosmetics.items.find((i) => i.id === id);
  if (!item || !isOwned(p, id)) return false;
  p.equipped[item.type] = id;
  save(p);
  return true;
}

// ---- collection (Garden Album) ----
export const collectionSets = collection.sets;
export const collectionSpecies = collection.species;

export function hasSpecies(p, id) {
  return p.found.includes(id);
}

export function foundCount(p) {
  return p.found.length;
}

/** Species of a set, in album order. */
export function speciesOfSet(setId) {
  return collection.species.filter((s) => s.set === setId);
}

export function setProgress(p, setId) {
  const list = speciesOfSet(setId);
  return { have: list.filter((s) => hasSpecies(p, s.id)).length, total: list.length };
}

/**
 * Unlock the species tied to a level (first clear only; safe to call again).
 * Returns { species, set, bonus }: species is null when nothing new was found;
 * bonus is the coin reward (already paid) when this find completed its set.
 */
export function discoverForLevel(p, levelId) {
  const species = collection.species.find((s) => s.level === levelId);
  if (!species || hasSpecies(p, species.id)) return { species: null, set: null, bonus: 0 };
  p.found.push(species.id);
  const set = collection.sets.find((x) => x.id === species.set);
  let bonus = 0;
  const { have, total } = setProgress(p, set.id);
  if (have === total && !p.setsClaimed.includes(set.id)) {
    p.setsClaimed.push(set.id);
    p.coins += set.bonus;
    bonus = set.bonus;
  }
  save(p);
  return { species, set, bonus };
}
