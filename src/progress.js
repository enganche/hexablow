// Persistent player progress (stars per level). Versioned so the shape can grow
// (coins, inventory, streak...) without breaking saves.
import economy from './economy.json';
import cosmetics from './cosmetics.json';
import collection from './collection.json';

const KEY = 'hexablow.progress.v1';

const emptyBoosters = () => Object.fromEntries(economy.boosters.order.map((id) => [id, 0]));

// stars: { [levelId]: 1..3 }, coins: soft currency balance
const empty = () => ({
  v: 2,
  stars: {},
  found: [],
  setsClaimed: [],
  seen: [],
  coins: economy.startCoins,
  boosters: emptyBoosters(),
  owned: [...cosmetics.defaults.owned],
  equipped: { ...cosmetics.defaults.equipped },
  noAds: false,
  bought: [],
  daily: 0,
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
      const boosters = emptyBoosters();
      for (const id of Object.keys(boosters)) {
        const n = Math.floor(Number(raw.boosters?.[id]));
        if (Number.isFinite(n) && n > 0) boosters[id] = n;
      }
      const seen = [...new Set(Array.isArray(raw.seen) ? raw.seen.filter((x) => typeof x === 'string') : [])];
      const bought = [...new Set(Array.isArray(raw.bought) ? raw.bought.filter((x) => typeof x === 'string') : [])];
      const daily = Number.isFinite(Number(raw.daily)) ? Number(raw.daily) : 0;
      return { v: 2, stars, found, setsClaimed, seen, coins: Number.isFinite(c) && c >= 0 ? c : economy.startCoins, boosters, owned, equipped, noAds: raw.noAds === true, bought, daily };
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

/** One-time tips (e.g. the hearts lesson): shown once per save. */
export function hasSeen(p, id) {
  return p.seen.includes(id);
}

export function markSeen(p, id) {
  if (hasSeen(p, id)) return;
  p.seen.push(id);
  save(p);
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

/** Stars for a finished run: the hearts left (3 hearts -> 3 stars, 1 heart -> 1 star). */
export function scoreRun(heartsLeft) {
  return Math.min(3, Math.max(1, heartsLeft));
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
  p.seen = [];
  p.coins = economy.startCoins;
  p.boosters = emptyBoosters();
  p.owned = [...cosmetics.defaults.owned];
  p.equipped = { ...cosmetics.defaults.equipped };
  p.noAds = false;
  p.bought = [];
  p.daily = 0;
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
 * Returns { species, set }: species is null when nothing new was found.
 * Set bonuses are NOT paid here: the player claims them in the Album.
 */
export function discoverForLevel(p, levelId) {
  const species = collection.species.find((s) => s.level === levelId);
  if (!species || hasSpecies(p, species.id)) return { species: null, set: null };
  p.found.push(species.id);
  save(p);
  return { species, set: collection.sets.find((x) => x.id === species.set) };
}

/** Sets that are fully collected but whose bonus has not been claimed yet. */
export function claimableSets(p) {
  return collection.sets.filter((s) => {
    const { have, total } = setProgress(p, s.id);
    return have === total && !p.setsClaimed.includes(s.id);
  });
}

/** Pay out a completed set's bonus once. Returns the coins paid (0 if not claimable). */
export function claimSet(p, setId) {
  const set = claimableSets(p).find((s) => s.id === setId);
  if (!set) return 0;
  p.setsClaimed.push(set.id);
  p.coins += set.bonus;
  save(p);
  return set.bonus;
}

// ---- boosters (consumable inventory) ----
export const boosterIds = economy.boosters.order;

export function boosterCount(p, id) {
  return p.boosters[id] ?? 0;
}

/** Price of a pack of `packSize` boosters, with the bulk discount. */
export function packPrice(id) {
  return Math.round(economy.boosters[id].price * economy.boosters.packSize * economy.boosters.packDiscount);
}

/** Buy `qty` boosters (1 = single at list price, packSize = discounted pack). False if too expensive. */
export function buyBooster(p, id, qty = 1) {
  const cfg = economy.boosters[id];
  if (!cfg) return false;
  const cost = qty === economy.boosters.packSize ? packPrice(id) : cfg.price * qty;
  if (!spend(p, cost)) return false;
  p.boosters[id] = boosterCount(p, id) + qty;
  save(p);
  return true;
}

/** Use one booster from stock. False (no change) when none left. */
export function useBooster(p, id) {
  if (boosterCount(p, id) <= 0) return false;
  p.boosters[id] -= 1;
  save(p);
  return true;
}

export function grantBooster(p, id, qty) {
  p.boosters[id] = boosterCount(p, id) + qty;
  save(p);
}

// ---- store purchases (real-money packs; payment is a placeholder until a billing SDK is wired) ----
export function wasBought(p, id) {
  return p.bought.includes(id);
}

/** Grant a pack's contents: { coins, boosters: {id: qty}, noAds }. One-time packs are remembered. */
export function grantPack(p, id, rewards, once = false) {
  if (once && wasBought(p, id)) return false;
  if (rewards.coins) p.coins += Math.floor(rewards.coins);
  for (const [bid, qty] of Object.entries(rewards.boosters ?? {})) {
    if (bid in p.boosters) p.boosters[bid] += qty;
  }
  if (rewards.noAds) p.noAds = true;
  if (once && !p.bought.includes(id)) p.bought.push(id);
  save(p);
  return true;
}

/** Milliseconds until the free daily gift is ready (0 = ready now). */
export function dailyWait(p, cooldownHours) {
  return Math.max(0, p.daily + cooldownHours * 3600000 - Date.now());
}

export function markDaily(p) {
  p.daily = Date.now();
  save(p);
}
