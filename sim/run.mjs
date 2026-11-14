// Hexablow bot simulator — CLI.
//   node sim/run.mjs                       # lab (difficulty) + career (economy), all personas
//   node sim/run.mjs --plays 200 --bots 300 --days 21 --seed 7
//   node sim/run.mjs --only lab|career --persona casual,newbie --levels path/to/levels.json
// Writes sim/out/report.json and sim/out/report.html.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HB, loadConfig, readJson } from './hb.mjs';
import { playAttempt } from './bot.mjs';
import { simulateCareer } from './career.mjs';
import { renderHtml } from './report.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const PLAYS = +arg('plays', 120);
const BOTS = +arg('bots', 200);
const DAYS = arg('days') ? +arg('days') : null;
const SEED = +arg('seed', 1);
const ONLY = arg('only', 'all');
const OUT = resolve(arg('out', join(here, 'out')));
const MAX_ATTEMPTS = 10;

const cfg = loadConfig();
if (arg('levels')) cfg.levels = readJson(resolve(arg('levels')));
let personas = readJson(join(here, 'personas.json')).personas;
if (arg('persona')) {
  const want = arg('persona').split(',');
  personas = personas.filter((p) => want.includes(p.id));
}
const shareSum = personas.reduce((a, p) => a + p.share, 0);
const W = Object.fromEntries(personas.map((p) => [p.id, p.share / shareSum]));
const levels = cfg.levels;

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const quant = (a, q) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const hashSeed = (...xs) => xs.reduce((h, x) => (Math.imul(h ^ x, 2654435761) >>> 0), SEED >>> 0);
const mixOf = (byPersona, f) => personas.reduce((a, p) => a + W[p.id] * f(byPersona[p.id]), 0);

const t0 = Date.now();
const report = { meta: { date: new Date().toISOString(), seed: SEED, plays: PLAYS, bots: BOTS, personas: personas.map(({ id, name, share }) => ({ id, name, share: W[id] })), levels: levels.map((l) => ({ id: l.id, difficulty: l.difficulty, cells: l.cells.length, pieces: l.pieces.length })) } };

// ------------------------------------------------------------------ LAB: pure difficulty
// Every persona plays every level PLAYS times from a clean state: no boosters, no revive, hearts on
// (also on levels 1-2, to measure the puzzle itself), retry until it is won (max MAX_ATTEMPTS).
if (ONLY === 'all' || ONLY === 'lab') {
  const lab = [];
  for (const lv of levels) {
    const row = { level: lv.id, difficulty: lv.difficulty, cells: lv.cells.length, by: {} };
    for (const per of personas) {
      const firstWin = [], attempts = [], mistakes = [], time = [], timeToWin = [], guesses = [], peak = [], three = [], lostAt = [];
      for (let i = 0; i < PLAYS; i++) {
        const rand = HB.rng(hashSeed(lv.id, i, per.id.length * 131 + per.id.charCodeAt(0)));
        let n = 0, total = 0, won = false;
        while (n < MAX_ATTEMPTS && !won) {
          const st = playAttempt(lv, per, rand);
          n++;
          total += st.time;
          mistakes.push(st.mistakes);
          time.push(st.time);
          guesses.push(st.guesses);
          peak.push(st.peak);
          if (!st.win) lostAt.push(st.lostAt);
          if (n === 1) firstWin.push(st.win ? 1 : 0);
          if (st.win) { won = true; three.push(st.hearts === 3 ? 1 : 0); }
        }
        attempts.push(won ? n : MAX_ATTEMPTS + 1);
        if (won) timeToWin.push(total);
      }
      row.by[per.id] = {
        firstWin: mean(firstWin),
        attempts: mean(attempts),
        mistakes: mean(mistakes),
        guesses: mean(guesses),
        peak: quant(peak, 0.5),
        threeStar: mean(three),
        time: mean(time),
        timeToWin: quant(timeToWin, 0.5),
        lostAt: mean(lostAt),
        giveUp: attempts.filter((a) => a > MAX_ATTEMPTS).length / PLAYS,
      };
    }
    row.mix = {
      firstWin: mixOf(row.by, (x) => x.firstWin),
      attempts: mixOf(row.by, (x) => x.attempts),
      mistakes: mixOf(row.by, (x) => x.mistakes),
      threeStar: mixOf(row.by, (x) => x.threeStar),
      timeToWin: mixOf(row.by, (x) => x.timeToWin),
    };
    lab.push(row);
  }
  // flags: difficulty spikes and label mismatches
  lab.forEach((r, i) => {
    r.flags = [];
    const fail = 1 - r.mix.firstWin;
    const prev = i ? 1 - lab[i - 1].mix.firstWin : 0;
    if (fail - prev > 0.25) r.flags.push(`spike +${Math.round((fail - prev) * 100)}% fail`);
    if (r.difficulty === 'hard' && fail < 0.15) r.flags.push('labelled hard but easy');
    if (r.difficulty !== 'hard' && fail > 0.4) r.flags.push('not labelled hard but >40% fail');
    if (r.mix.timeToWin > 300) r.flags.push('median clear > 5 min');
  });
  report.lab = lab;

  console.log(`\n== LAB: độ khó thuần (${PLAYS} lượt/persona/level, không booster, không revive)`);
  console.log('Lv  diff   cells | thắng lần 1 (mix) | lần thử | sai/lượt | 3★ | t.gian thắng | ' + personas.map((p) => p.id.slice(0, 7).padStart(7)).join(' ') + ' | cờ');
  for (const r of lab) {
    console.log(
      `${String(r.level).padStart(2)}  ${r.difficulty.padEnd(6)} ${String(r.cells).padStart(5)} | ` +
      `${(r.mix.firstWin * 100).toFixed(0).padStart(16)}% | ${r.mix.attempts.toFixed(2).padStart(7)} | ${r.mix.mistakes.toFixed(2).padStart(8)} | ` +
      `${(r.mix.threeStar * 100).toFixed(0).padStart(2)}% | ${(r.mix.timeToWin / 60).toFixed(1).padStart(9)} ph | ` +
      personas.map((p) => ((r.by[p.id].firstWin * 100).toFixed(0) + '%').padStart(7)).join(' ') + ` | ${r.flags.join('; ')}`
    );
  }
}

// ------------------------------------------------------------------ CAREER: economy + funnel
if (ONLY === 'all' || ONLY === 'career') {
  const runs = {};
  for (const per of personas) {
    runs[per.id] = [];
    for (let b = 0; b < BOTS; b++) runs[per.id].push(simulateCareer(cfg, per, HB.rng(hashSeed(9001, b, per.id.charCodeAt(1))), { days: DAYS }));
  }
  const days = Math.max(...personas.map((p) => DAYS ?? p.career.days));
  const career = { byPersona: {}, levels: [] };
  for (const per of personas) {
    const rs = runs[per.id];
    const ledgerKeys = Object.keys(rs[0].ledger);
    const coinsByDay = [];
    const levelByDay = [];
    for (let d = 0; d < days; d++) {
      const vals = rs.filter((r) => r.coinsByDay.length > d);
      coinsByDay.push({ p25: quant(vals.map((r) => r.coinsByDay[d]), 0.25), p50: quant(vals.map((r) => r.coinsByDay[d]), 0.5), p75: quant(vals.map((r) => r.coinsByDay[d]), 0.75), active: vals.length / rs.length });
      levelByDay.push(quant(vals.map((r) => r.maxLevelByDay[d]), 0.5));
    }
    const fc = rs.filter((r) => r.firstCosmetic);
    career.byPersona[per.id] = {
      ledger: Object.fromEntries(ledgerKeys.map((k) => [k, mean(rs.map((r) => r.ledger[k]))])),
      finalCoins: { p25: quant(rs.map((r) => r.final.coins), 0.25), p50: quant(rs.map((r) => r.final.coins), 0.5), p75: quant(rs.map((r) => r.final.coins), 0.75) },
      finishedAll: rs.filter((r) => r.final.maxLevel === levels.at(-1).id).length / rs.length,
      churned: rs.filter((r) => r.churnedAt).length / rs.length,
      daysPlayed: mean(rs.map((r) => r.daysPlayed)),
      revenue: mean(rs.map((r) => r.revenue)),
      payers: rs.filter((r) => r.revenue > 0).length / rs.length,
      ads: mean(rs.map((r) => r.ads)),
      boostersAcquired: Object.fromEntries(Object.keys(rs[0].boostersAcquired).map((k) => [k, mean(rs.map((r) => r.boostersAcquired[k]))])),
      boostersLeft: mean(rs.map((r) => Object.values(r.final.boosters).reduce((a, b) => a + b, 0))),
      firstCosmetic: { share: fc.length / rs.length, day: quant(fc.map((r) => r.firstCosmetic.day + 1), 0.5), level: quant(fc.map((r) => r.firstCosmetic.level), 0.5) },
      coinsByDay,
      levelByDay,
      maxLevel: quant(rs.map((r) => r.final.maxLevel), 0.5),
    };
  }
  for (const lv of levels) {
    const row = { level: lv.id, by: {} };
    for (const per of personas) {
      const rs = runs[per.id];
      const att = rs.flatMap((r) => r.attempts.filter((a) => a.level === lv.id));
      const first = att.filter((a) => a.firstClear);
      const reached = rs.filter((r) => r.attempts.some((a) => a.level === lv.id)).length;
      const cleared = rs.filter((r) => r.final.stars[lv.id]).length;
      const bUsed = att.reduce((a, x) => a + Object.values(x.boosters).reduce((s, v) => s + v, 0), 0);
      const coinsAfter = rs.map((r) => r.coinsAfterClear[lv.id]).filter((x) => x != null);
      row.by[per.id] = {
        reached: reached / rs.length,
        cleared: cleared / rs.length,
        attemptsPerClear: mean(rs.map((r) => r.attempts.filter((a) => a.level === lv.id).findIndex((a) => a.firstClear) + 1).filter((n) => n > 0)),
        failRate: att.length ? att.filter((a) => !a.win).length / att.length : 0,
        revivesPerClear: cleared ? att.reduce((a, x) => a + x.revives, 0) / cleared : 0,
        boostersPerClear: cleared ? bUsed / cleared : 0,
        threeStar: first.length ? first.filter((a) => a.stars === 3).length / first.length : 0,
        churnHere: rs.filter((r) => r.churnedAt?.level === lv.id).length / rs.length,
        coinsAfter: quant(coinsAfter, 0.5),
      };
    }
    row.mix = {
      reached: mixOf(row.by, (x) => x.reached),
      cleared: mixOf(row.by, (x) => x.cleared),
      failRate: mixOf(row.by, (x) => x.failRate),
      attemptsPerClear: mixOf(row.by, (x) => x.attemptsPerClear),
      boostersPerClear: mixOf(row.by, (x) => x.boostersPerClear),
      revivesPerClear: mixOf(row.by, (x) => x.revivesPerClear),
      churnHere: mixOf(row.by, (x) => x.churnHere),
    };
    career.levels.push(row);
  }
  career.days = days;
  career.cosmeticPrices = cfg.cosmetics.items.filter((i) => i.price > 0).map((i) => ({ id: i.id, name: i.name, price: i.price })).sort((a, b) => a.price - b.price);
  career.boosterPrices = Object.fromEntries(cfg.economy.boosters.order.map((id) => [id, cfg.economy.boosters[id].price]));
  report.career = career;

  console.log(`\n== CAREER: kinh tế + phễu (${BOTS} bot/persona, ${days} ngày)`);
  console.log('persona      xong 15lv  rời game  ngày chơi  lv(median)  xu cuối p50  xu kiếm/bot  xu tiêu/bot  booster mua/ads/quà  cosmetic đầu (tỉ lệ, ngày)  $/bot   payer');
  for (const per of personas) {
    const c = career.byPersona[per.id];
    const L = c.ledger;
    const earned = L.start + L.win + L.replay + L.daily + L.chest + L.shopGift + L.set + L.iap;
    const spent = L.booster + L.revive + L.cosmetic;
    const ba = c.boostersAcquired;
    console.log(
      `${per.id.padEnd(12)} ${(c.finishedAll * 100).toFixed(0).padStart(8)}% ${(c.churned * 100).toFixed(0).padStart(8)}% ${c.daysPlayed.toFixed(1).padStart(10)} ${String(c.maxLevel).padStart(11)} ` +
      `${String(c.finalCoins.p50).padStart(12)} ${earned.toFixed(0).padStart(12)} ${spent.toFixed(0).padStart(12)}  ` +
      `${ba.bought.toFixed(1)}/${ba.ad.toFixed(1)}/${ba.gift.toFixed(1)}`.padEnd(20) +
      `${(c.firstCosmetic.share * 100).toFixed(0)}%, ngày ${c.firstCosmetic.day || '-'}`.padEnd(28) +
      `${c.revenue.toFixed(2).padStart(5)}  ${(c.payers * 100).toFixed(1)}%`
    );
  }
  console.log('\nLv  tới  qua  thua/lượt  booster/qua  revive/qua  rời game tại đây (mix)');
  for (const r of career.levels) {
    const m = r.mix;
    console.log(`${String(r.level).padStart(2)} ${(m.reached * 100).toFixed(0).padStart(4)}% ${(m.cleared * 100).toFixed(0).padStart(3)}% ${(m.failRate * 100).toFixed(0).padStart(9)}% ${m.boostersPerClear.toFixed(2).padStart(12)} ${m.revivesPerClear.toFixed(2).padStart(11)} ${(m.churnHere * 100).toFixed(1).padStart(10)}%`);
  }
}

report.meta.ms = Date.now() - t0;
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
writeFileSync(join(OUT, 'report.html'), renderHtml(report));
console.log(`\nĐã ghi ${join(OUT, 'report.json')} và report.html (${(report.meta.ms / 1000).toFixed(1)} s)`);
