// Career simulation: one bot plays the game over several days with the real economy rules
// (reimplemented from src/progress.js + src/main.js, reading the same JSON configs).
// Keep in sync when these change: winReward/scoreRun, revive costs, booster prices/unlocks and lesson gift,
// daily reward table + streak chests, shop daily gift, album set bonuses, free hearts on levels 1-2.
import { playAttempt } from './bot.mjs';

const SOURCES = ['start', 'win', 'replay', 'daily', 'chest', 'shopGift', 'set', 'iap'];
const SINKS = ['booster', 'revive', 'cosmetic'];

export function simulateCareer(cfg, persona, rand, opts = {}) {
  const { levels, economy, shop, cosmetics, collection } = cfg;
  const car = { ...persona.career, ...(opts.days ? { days: opts.days } : {}) };
  const B = economy.boosters;
  const ids = B.order;

  const p = {
    coins: economy.startCoins,
    boosters: Object.fromEntries(ids.map((id) => [id, 0])),
    stars: {}, // level id -> best stars
    found: new Set(),
    setsClaimed: new Set(),
    owned: new Set(cosmetics.defaults.owned),
    bought: new Set(),
    streak: 0,
    lastClaim: -99,
    lastGift: -99,
  };
  const ledger = Object.fromEntries([...SOURCES, ...SINKS].map((k) => [k, 0]));
  ledger.start = economy.startCoins;
  const out = {
    persona: persona.id,
    churnedAt: null, // { day, level }
    daysPlayed: 0,
    revenue: 0,
    iapBuys: {},
    ads: 0,
    attempts: [], // per attempt: { level, day, win, stars, mistakes, revives, boosters, time, firstClear }
    coinsAfterClear: {}, // level id -> balance right after its first clear
    coinsByDay: [],
    maxLevelByDay: [],
    firstCosmetic: null, // { day, level, id }
    ledger,
    boostersAcquired: { bought: 0, ad: 0, gift: 0, iap: 0 },
  };

  const earn = (src, n) => { n = Math.max(0, Math.floor(n)); p.coins += n; ledger[src] += n; };
  const spend = (sink, n) => { if (p.coins < n) return false; p.coins -= n; ledger[sink] += n; return true; };
  const grantPack = (r) => {
    if (r.coins) earn(r.src || 'iap', r.coins);
    for (const [id, q] of Object.entries(r.boosters || {})) if (id in p.boosters) p.boosters[id] += q;
  };
  const maxCleared = () => {
    let m = 0;
    for (const lv of levels) if (p.stars[lv.id]) m = Math.max(m, lv.id);
    return m;
  };
  const curLevel = () => maxCleared();

  // real-money helpers (placeholder checkout in the game; here just counted)
  // a real-money purchase is considered at most once per day (the first time the bot runs short that day)
  let iapDay = -1;
  const iapChance = (prob) => {
    if (iapDay === day) return false;
    iapDay = day;
    return rand() < prob;
  };
  let adsDay = -1, adsToday = 0;
  const tryStarter = () => {
    const s = shop.special.find((x) => x.id === 'starter');
    if (!s || p.bought.has(s.id) || !iapChance(persona.shop.iap.starter)) return false;
    p.bought.add(s.id);
    out.revenue += s.price;
    out.iapBuys[s.id] = (out.iapBuys[s.id] || 0) + 1;
    grantPack({ coins: s.coins, boosters: s.boosters, src: 'iap' });
    out.boostersAcquired.iap += Object.values(s.boosters).reduce((a, b) => a + b, 0);
    return true;
  };
  const tryCoinPack = () => {
    if (!iapChance(persona.shop.iap.coinPack)) return false;
    const c = shop.coinPacks[0];
    out.revenue += c.price;
    out.iapBuys[c.id] = (out.iapBuys[c.id] || 0) + 1;
    earn('iap', c.coins);
    return true;
  };

  let day = 0;
  let frustration = 0;
  const churnAt = car.churnAt * (0.6 + rand() * 0.8);

  const playLevel = (lv) => {
    const cleared = !!p.stars[lv.id];
    let revivesUsed = 0;
    const lesson = !cleared ? ids.find((id) => B[id].unlockLevel === lv.id) || null : null;
    if (lesson) {
      const missing = 2 - p.boosters[lesson];
      if (missing > 0) { p.boosters[lesson] += missing; out.boostersAcquired.gift += missing; }
    }
    const freeHearts = lv.id <= 2 && !cleared;
    const meta = {
      unlocked: (id) => lv.id >= B[id].unlockLevel,
      stock: (id) => p.boosters[id],
      consume: (id) => { p.boosters[id]--; },
      acquire: (id) => {
        const price = B[id].price;
        if (p.coins >= price && rand() < persona.boosters.buyProb) {
          spend('booster', price);
          p.boosters[id]++;
          out.boostersAcquired.bought++;
          return true;
        }
        if (adsDay !== day) { adsDay = day; adsToday = 0; }
        if (adsToday < (persona.boosters.maxAdsPerDay ?? Infinity) && rand() < persona.boosters.adProb) {
          adsToday++;
          out.ads++;
          p.boosters[id]++;
          out.boostersAcquired.ad++;
          return true;
        }
        if (tryStarter()) return p.boosters[id] > 0;
        return false;
      },
      onFail: (st, board) => {
        const cost = economy.costs.revive[revivesUsed];
        const rv = persona.revive;
        if (cost == null || revivesUsed >= rv.max || board.filled < rv.minFilled || rand() >= rv.prob) return false;
        if (p.coins < cost && !tryCoinPack() && !tryStarter()) return false;
        if (!spend('revive', cost)) return false;
        revivesUsed++;
        return true;
      },
    };
    const st = playAttempt(lv, persona, rand, meta, { freeHearts, lesson });
    const rec = { level: lv.id, day, win: st.win, stars: 0, mistakes: st.mistakes, revives: st.revives, boosters: st.boosters, time: st.time, firstClear: false, guesses: st.guesses };
    if (st.win) {
      const stars = freeHearts ? 3 : Math.min(3, Math.max(1, st.hearts));
      const prev = p.stars[lv.id] || 0;
      rec.stars = stars;
      rec.firstClear = prev === 0;
      p.stars[lv.id] = Math.max(prev, stars);
      const full = economy.win.base + (economy.win.starBonus[stars] ?? 0);
      if (rec.firstClear) earn('win', full);
      else earn('replay', Math.max(1, Math.round(full * economy.win.replayMultiplier)));
      if (rec.firstClear) {
        const sp = collection.species.find((s) => s.level === lv.id);
        if (sp) p.found.add(sp.id);
        out.coinsAfterClear[lv.id] = p.coins;
      }
    }
    out.attempts.push(rec);
    return st;
  };

  const visitShopAndAlbum = () => {
    // album: claim finished sets
    for (const s of collection.sets) {
      if (p.setsClaimed.has(s.id)) continue;
      const list = collection.species.filter((x) => x.set === s.id);
      if (list.every((x) => p.found.has(x.id))) { p.setsClaimed.add(s.id); earn('set', s.bonus); }
    }
    if (rand() >= persona.shop.visitProb) return;
    if (shop.dailyFree && day - p.lastGift >= Math.ceil(shop.dailyFree.cooldownHours / 24)) {
      p.lastGift = day;
      earn('shopGift', shop.dailyFree.coins);
    }
    const next = cosmetics.items.filter((i) => !p.owned.has(i.id) && i.price > 0).sort((a, b) => a.price - b.price)[0];
    if (next && p.coins >= next.price + persona.shop.cosmeticReserve && rand() < persona.shop.cosmeticProb) {
      spend('cosmetic', next.price);
      p.owned.add(next.id);
      if (!out.firstCosmetic) out.firstCosmetic = { day, level: curLevel(), id: next.id };
    }
  };

  const claimDaily = () => {
    if (rand() >= car.dailyClaimProb) return;
    const cycle = economy.daily.milestones.at(-1).at;
    p.streak = p.lastClaim === day - 1 && p.streak < cycle ? p.streak + 1 : 1;
    p.lastClaim = day;
    const r = economy.daily.days[(p.streak - 1) % economy.daily.days.length];
    if (r.coins) earn('daily', r.coins);
    for (const [id, q] of Object.entries(r.boosters || {})) { p.boosters[id] += q; out.boostersAcquired.gift += q; }
    const m = economy.daily.milestones.find((x) => x.at === p.streak);
    if (m) {
      let coins = m.coins || 0;
      if (m.cosmetic) {
        if (!p.owned.has(m.cosmetic)) p.owned.add(m.cosmetic);
        else coins += m.ownedCoins || 0;
      }
      earn('chest', coins);
      for (const [id, q] of Object.entries(m.boosters || {})) { p.boosters[id] += q; out.boostersAcquired.gift += q; }
    }
  };

  for (day = 0; day < car.days; day++) {
    if (out.churnedAt) break;
    if (day > 0 && rand() >= car.playDayProb) {
      out.coinsByDay.push(p.coins);
      out.maxLevelByDay.push(maxCleared());
      continue;
    }
    out.daysPlayed++;
    claimDaily();
    const sessions = Math.floor(car.sessionsPerDay) + (rand() < car.sessionsPerDay % 1 ? 1 : 0);
    for (let s = 0; s < Math.max(1, sessions) && !out.churnedAt; s++) {
      visitShopAndAlbum();
      const budget = car.minutesPerSession * 60 * (0.6 + rand() * 0.8);
      let used = 0;
      let fails = 0;
      while (used < budget && !out.churnedAt) {
        const nextId = maxCleared() + 1;
        let lv = levels.find((l) => l.id === nextId);
        if (!lv || rand() < car.replayProb) {
          const cand = levels.filter((l) => p.stars[l.id] && p.stars[l.id] < 3);
          if (cand.length) lv = cand[Math.floor(rand() * cand.length)];
          else if (!lv) break; // nothing left to do today
        }
        const isNew = !p.stars[lv.id];
        const st = playLevel(lv);
        used += st.time;
        if (st.win) {
          fails = 0;
          frustration = Math.max(0, frustration - 1);
        } else {
          fails++;
          // only being blocked on NEW content builds up frustration; a failed replay just ends the session sooner
          if (isNew) frustration += 1;
          if (frustration >= churnAt) { out.churnedAt = { day, level: lv.id }; break; }
          if (fails >= car.quitAfterFails) break;
        }
      }
      visitShopAndAlbum();
    }
    out.coinsByDay.push(p.coins);
    out.maxLevelByDay.push(maxCleared());
  }
  out.final = { coins: p.coins, boosters: { ...p.boosters }, stars: { ...p.stars }, owned: [...p.owned], maxLevel: maxCleared() };
  return out;
}
