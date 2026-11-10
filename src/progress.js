// Persistent player progress (stars per level). Versioned so the shape can grow
// (coins, inventory, streak...) without breaking saves.
import economy from './economy.json';
import cosmetics from './cosmetics.json';

const KEY = 'hexablow.progress.v1';

// stars: { [levelId]: 1..3 }, coins: soft currency balance
const empty = () => ({
  v: 1,
  stars: {},
  coins: economy.startCoins,
  owned: [...cosmetics.defaults.owned],
  equipped: { ...cosmetics.defaults.equipped },
});

export function loadProgress() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && raw.v === 1 && raw.stars && typeof raw.stars === 'object') {
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
      return { v: 1, stars, coins: Number.isFinite(c) && c >= 0 ? c : economy.startCoins, owned, equipped };
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
