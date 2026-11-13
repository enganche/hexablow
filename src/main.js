import './style.css';
import { boosterArt } from './boosterArt.js';
import menuBgHoney from './assets/menu-bg/honey.webp';
import menuBgOcean from './assets/menu-bg/ocean.webp';
import menuBgLilac from './assets/menu-bg/lilac.webp';
import menuBgSnow from './assets/menu-bg/snow.webp';
import menuBgSakura from './assets/menu-bg/sakura.webp';
import menuBgAutumn from './assets/menu-bg/autumn.webp';
const MENU_BG = { 'tile-honey': menuBgHoney, 'tile-ocean': menuBgOcean, 'tile-lilac': menuBgLilac, 'tile-snow': menuBgSnow, 'tile-sakura': menuBgSakura, 'tile-autumn': menuBgAutumn };
import { initProfile } from './profile.js';
import levels from './levels.json';
import { Game } from './game.js';
import { AudioManager, vibrate } from './audio.js';
import { Praise } from './praise.js';
import { pickHint, HINT_IDLE_SECONDS } from './hint.js';
import { loadSettings, saveSettings, loadLevelIndex, saveLevelIndex, hasOpenedLevel } from './settings.js';
import economy from './economy.json';
import { winArt, loseArt, confetti } from './resultArt.js';
import { cosmeticItems, isOwned, equippedItem, buyItem, equipItem } from './progress.js';
import { collectionSets, collectionSpecies, speciesOfSet, setProgress, hasSpecies, foundCount, discoverForLevel, claimableSets, claimSet } from './progress.js';
import { boosterIds, boosterCount, buyBooster, useBooster, packPrice, grantBooster } from './progress.js';
import { grantPack, wasBought, dailyWait, markDaily } from './progress.js';
import { dailyDays, dailyMilestones, dailyStatus, dailyClaim, dailyChestClaim, todayStr, debugShiftDaily, debugResetDaily } from './progress.js';
import shopCfg from './shop.json';
import { plantMaterial, critterMaterial, fishMaterial, butterflyMaterial, dogMaterial, CRITTERS } from './garden.js';
import { shopArt } from './shopArt.js';
import { hasSeen, markSeen, scoreRun, loadProgress, recordWin, starsFor, totalStars, completedCount, resetProgress, coinsOf, canAfford, spend, earn, winReward } from './progress.js';

const $ = (id) => document.getElementById(id);

const settings = loadSettings();
const audio = new AudioManager(() => settings);
let levelIndex = loadLevelIndex(levels.length);
const progress = loadProgress();
initProfile(progress, audio, () => renderCoins());

// ---- HUD ----
const heartsEl = $('hearts');
const HEART_SVG =
  '<svg class="heart" viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 5 6 5c2.1 0 3.6 1.1 4.5 2.6h3C14.4 6.1 15.9 5 18 5c3.3 0 5.1 3.4 3.6 6.8C19.5 16.4 12 21 12 21z"/></svg>';

function heartBurst() {
  let s = '';
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.random() * 0.5;
    const d = 26 + Math.random() * 18;
    s += `<i style="--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d - 6).toFixed(1)}px"></i>`;
  }
  return `<b class="ring"></b>${s}`;
}

function renderHearts(left, animate) {
  $('stage').classList.toggle('low-hearts', left === 1); // calm warning: heartbeat + soft edge glow
  heartsEl.innerHTML = Array.from({ length: 3 }, () => `<span class="heart-wrap">${HEART_SVG}</span>`).join('');
  [...heartsEl.children].forEach((w, i) => {
    const lost = i >= left;
    w.classList.toggle('lost', lost);
    if (animate && i === left) {
      w.classList.add('breaking');
      w.insertAdjacentHTML('beforeend', heartBurst());
      heartsEl.classList.remove('hurt');
      void heartsEl.offsetWidth;
      heartsEl.classList.add('hurt');
      const flash = $('game').parentElement;
      flash.classList.remove('hurt-flash');
      void flash.offsetWidth;
      flash.classList.add('hurt-flash');
      setTimeout(() => {
        w.classList.remove('breaking');
        w.querySelectorAll('i,b').forEach((n) => n.remove());
        heartsEl.classList.remove('hurt');
        flash.classList.remove('hurt-flash');
      }, 900);
    }
  });
}

// ---- Cosmetics: apply equipped tile skin + background theme ----
function applyCosmetics() {
  const tile = equippedItem(progress, 'tile');
  const theme = tile; // each tile set carries its own garden background
  game.setTileSkin(tile);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(`--${k}`, v);
  root.style.setProperty('--bg', theme.game);
  root.style.setProperty('--sub-ink', theme.vars['sub-ink']);
  game.setBackground(theme.game);
  game.setSocketSkin(theme.socket);
  game.setRevealColors({ text: theme.vars['reveal-text'], fill: theme.vars['reveal-fill'], dash: theme.vars['reveal-dash'] });
  root.style.setProperty('--tile-a', tile.face[0]);
  root.style.setProperty('--tile-b', tile.face[1]);
  root.style.setProperty('--tile-rim', tile.rim[0]);
  root.style.setProperty('--tile-base', tile.base);
  root.style.setProperty('--menu-bg', `url(${MENU_BG[tile.id] || menuBgHoney})`);
}

// ---- Coins ----
const COIN = '<i class="coin"></i>';
const coinHud = $('coin-hud');
function renderCoins() {
  $('coin-count').textContent = coinsOf(progress);
  renderBoosters();
}
function shakeCoins() {
  coinHud.classList.remove('shake');
  void coinHud.offsetWidth;
  coinHud.classList.add('shake');
}
/** Show the coin balance just left of the settings button (only while the buy popup is open). */
function showCoinHud() {
  renderCoins();
  const s = $('settings-btn').getBoundingClientRect();
  const st = stage.getBoundingClientRect();
  coinHud.style.top = `${s.top - st.top + (s.height - 38) / 2}px`;
  coinHud.style.right = `${st.right - s.left + 10}px`;
  coinHud.classList.remove('hidden');
}

// ---- Boosters: Reveal (instant) / Find + Picker (interactive modes) ----
const BOOSTERS = economy.boosters;
const boostBar = $('boosters');
const boostTip = $('boost-tip');
const BOOST_TIP = { find: 'Tap an empty cell' };
const DEBUG_AUTOBUY_KEY = 'hexablow.debug.autobuy';
let debugAutoBuy = false;
let debugAutoPlay = false;
let debugAutoTimer = 0;
try { debugAutoBuy = localStorage.getItem(DEBUG_AUTOBUY_KEY) === '1'; } catch { /* ignore */ }

boostBar.innerHTML = BOOSTERS.order
  .map((id) => `<button type="button" class="boost" data-boost="${id}" data-id="${id}" aria-label="${BOOSTERS[id].name} (unlocks at level ${BOOSTERS[id].unlockLevel})">
      <span class="b-ic">${boosterArt[id]}</span><span class="b-nm">${BOOSTERS[id].name}</span><i class="b-badge"></i>
      <svg class="b-lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zm2 0h6V8a3 3 0 0 0-6 0z"/></svg><span class="b-unlock">Lv ${BOOSTERS[id].unlockLevel}</span>
    </button>`)
  .join('');

/** Booster unlock gate: each booster has a level to unlock at (see economy.json; 4 / 6 / 8). */
function boosterUnlocked(id) {
  return levels[levelIndex].id >= BOOSTERS[id].unlockLevel;
}

function renderBoosters() {
  for (const b of boostBar.querySelectorAll('.boost')) {
    const id = b.dataset.id;
    const n = boosterCount(progress, id);
    const locked = !boosterUnlocked(id);
    b.classList.toggle('locked', locked);
    b.classList.toggle('empty', !locked && n === 0);
    b.classList.toggle('on', game.mode === id);
    const badge = b.querySelector('.b-badge');
    badge.textContent = n > 0 ? n : '+';
    badge.classList.toggle('plus', n === 0);
  }
}

function shakeEl(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

/** Keep the chrome in step with the game's booster mode (picker panel open, find hint tip...). */
function syncModeUI() {
  const mode = game.mode;
  stage.classList.toggle('picker-mode', mode === 'picker');
  const tip = BOOST_TIP[mode];
  boostTip.textContent = tip ?? '';
  boostTip.classList.toggle('hidden', !tip);
  if (tip) boostTip.style.top = `${($('hud').getBoundingClientRect().bottom - stage.getBoundingClientRect().top) + 6}px`;
  renderBoosters();
}

// out-of-stock popup
const buyPop = $('buy-pop');
const buyCard = buyPop.querySelector('.buy-card');
let buyingId = null;
const AD_ICON = '<svg class="ad-ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="3.5" fill="currentColor"/><path d="M10 9.2v5.6l5-2.8z" fill="#fff"/></svg>';

/** Debug stand-in for a rewarded video ad. Swap for the ad SDK later: call onReward() once the ad is completed. */
function showFakeRewardedAd(onReward) {
  const pop = document.createElement('div');
  pop.className = 'os-pop ad-pop';
  pop.setAttribute('role', 'alertdialog');
  pop.setAttribute('aria-modal', 'true');
  pop.setAttribute('aria-label', 'Rewarded ad');
  pop.innerHTML = `<div class="os-sheet"><div class="os-head"><span class="os-icon">${AD_ICON}</span><div><b>Rewarded video</b><small>Fake ad (debug)</small></div></div><p class="os-note">DEBUG: a real rewarded video plays here. Tap Claim to pretend it finished.</p><div class="os-actions"><button type="button" class="os-cancel">Close</button><button type="button" class="os-ok">Claim reward</button></div></div>`;
  pop.querySelector('.os-cancel').onclick = () => { audio.tap(); pop.remove(); };
  pop.querySelector('.os-ok').onclick = () => { pop.remove(); onReward(); };
  pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') pop.remove(); });
  stageEl.append(pop);
  pop.querySelector('.os-ok').focus({ preventScroll: true });
}
function openBuyPop(id) {
  buyingId = id;
  const cfg = BOOSTERS[id];
  const pack = BOOSTERS.packSize;
  const packCost = packPrice(id);
  buyCard.innerHTML =
    `<h3 id="buy-title">${cfg.name}</h3>
     <button class="buy-x" type="button" aria-label="Close">×</button>
     <div class="buy-showcase"><div class="buy-ic b-${id}">${boosterArt[id]}</div><span class="buy-spark" aria-hidden="true">✦</span></div>
     <p class="buy-desc">${cfg.desc}</p>
     <div class="buy-actions">
       <button class="buy-opt ad" type="button"><span>×1</span><em>${AD_ICON}<b>Free</b></em></button>
       <button class="buy-opt best" type="button" data-qty="${pack}"><span>×${pack}</span><em>${COIN} ${packCost}</em></button>
     </div>`;
  const coinBtn = buyCard.querySelector('.buy-opt.best');
  coinBtn.classList.toggle('poor', !canAfford(progress, packCost));
  coinBtn.onclick = () => {
    if (!buyBooster(progress, id, pack)) return shakeEl(coinBtn);
    audio.tap();
    closeBuyPop();
    renderCoins();
  };
  buyCard.querySelector('.buy-opt.ad').onclick = () => {
    audio.tap();
    showFakeRewardedAd(() => {
      grantBooster(progress, id, 1);
      closeBuyPop();
      renderBoosters();
    });
  };
  buyCard.querySelector('.buy-x').onclick = () => { audio.tap(); closeBuyPop(); };
  buyPop.classList.remove('hidden');
  showCoinHud();
}
function closeBuyPop() {
  buyingId = null;
  coinHud.classList.add('hidden');
  buyPop.classList.add('hidden');
}
buyPop.addEventListener('click', (e) => { if (e.target === buyPop) closeBuyPop(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && buyingId) closeBuyPop(); });

function onBoosterTap(id, btn) {
  audio.unlock();
  if (!boosterUnlocked(id)) return shakeEl(btn);
  if (tut.active && tut.kind === 'booster' && id !== tut.booster) return shakeEl(btn); // lesson: only the new booster
  if (game.mode === id) { audio.tap(); return game.cancelMode(); } // tap again = cancel
  if (game.mode) game.cancelMode();
  if (!game.canBoost()) return shakeEl(btn);
  if (boosterCount(progress, id) <= 0) {
    if (!debugAutoBuy) return openBuyPop(id);
    // debug: buy on the fly, topping the wallet up when short
    const price = BOOSTERS[id].price;
    if (!canAfford(progress, price)) earn(progress, price - coinsOf(progress));
    buyBooster(progress, id, 1);
    renderCoins();
  }
  audio.tap();
  if (id === 'reveal') {
    if (game.reveal()) { useBooster(progress, id); renderBoosters(); tut.boosterUsed(id); } else shakeEl(btn);
  } else if (id === 'find') {
    game.beginFind();
  } else if (id === 'picker') {
    game.beginPicker();
  }
}
boostBar.addEventListener('click', (e) => {
  const btn = e.target.closest('.boost');
  if (btn) onBoosterTap(btn.dataset.id, btn);
});

// ---- Result screens: art -> map -> action ----
const stage = $('stage');
const result = $('result');
const resMap = $('res-map');
const STAR_SVG =
  '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>';
const HOME_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11.5L12 4l8.5 7.5M6 10v9.5h4.5V14h3v5.5H18V10"/></svg>';
let heartsLeft = 3;
let freeRun = false; // levels 1-2 on first play: no hearts, always 3 stars
let resultTimers = [];
const later = (fn, ms) => resultTimers.push(setTimeout(fn, ms));

/** Close the result screen and give the board back to normal play. Safe to call any time. */
function leaveResult() {
  resultTimers.forEach(clearTimeout);
  resultTimers = [];
  result.classList.add('hidden');
  $('res-find').classList.add('hidden');
  $('res-newfind').classList.add('hidden');
  result.classList.remove('show-art', 'show-map', 'show-actions');
  stage.classList.remove('result-mode', 'lose');
  result.querySelectorAll('.fly-coin').forEach((n) => n.remove());
  game.exitResultView();
}

/** Rect of the map slot, in canvas px. */
function mapRect() {
  const r = resMap.getBoundingClientRect();
  const c = $('game').getBoundingClientRect();
  return { x: r.left - c.left, y: r.top - c.top, width: r.width, height: r.height };
}

function coinBurst(btn) {
  const rb = btn.getBoundingClientRect();
  const rr = result.getBoundingClientRect();
  const scale = rr.width / stage.clientWidth || 1;
  for (let i = 0; i < 12; i++) {
    const c = document.createElement('i');
    c.className = 'fly-coin';
    const a = (i / 12) * Math.PI * 2;
    const d = 60 + Math.random() * 60;
    c.style.left = `${(rb.left + rb.width / 2 - rr.left) / scale}px`;
    c.style.top = `${(rb.top + rb.height / 2 - rr.top) / scale}px`;
    c.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    c.style.setProperty('--dy', `${Math.sin(a) * d - 50}px`);
    c.style.animationDelay = `${Math.random() * 0.1}s`;
    result.appendChild(c);
  }
}

let revivesUsed = 0; // revives spent in the current level attempt
const nextReviveCost = () => economy.costs.revive[revivesUsed] ?? null;

/**
 * win: { win:true, title, stars, sub, reward, next, onClaim }
 * fail: { win:false, title, sub, onRevive, onRetry, onHome }
 */
function showResult(o) {
  leaveResult();
  const btn = $('result-btn');
  const rev = $('result-revive');
  const home = $('result-home');
  $('res-art').innerHTML = o.win ? winArt(o) : loseArt(o);
  result.dataset.outcome = o.win ? 'win' : 'lose';
  result.setAttribute('aria-label', o.title);
  $('res-reward').innerHTML = '';
  home.innerHTML = `${HOME_SVG}${o.win ? '' : '<span>Home</span>'}`;
  if (o.win) confetti($('res-confetti'));
  else $('res-confetti').innerHTML = '';
  btn.disabled = false;
  if (o.win) {
    btn.innerHTML = `<span>${o.replay ? 'Claim' : 'Continue'}</span><em>${COIN} +${o.reward}</em>`;
    btn.classList.remove('alt');
    btn.onclick = () => {
      btn.disabled = true;
      audio.tap();
      coinBurst(btn);
      later(() => {
        leaveResult();
        o.onClaim();
      }, 520);
    };
    rev.classList.add('hidden');
    home.classList.add('hidden');
  } else {
    btn.textContent = '↻  Try again';
    btn.classList.add('alt');
    btn.onclick = () => { audio.tap(); o.onRetry(); };
    // escalating price per revive within this level; no tiers left = no more revives
    const cost = nextReviveCost();
    rev.classList.toggle('hidden', cost == null);
    if (cost != null) {
      rev.innerHTML = `<span>Keep growing</span><em>${cost} ${COIN}</em>`;
      rev.disabled = !canAfford(progress, cost);
      rev.title = rev.disabled ? `Revive needs ${cost} coins` : '';
    }
    rev.onclick = () => { audio.tap(); o.onRevive(); };
    home.classList.remove('hidden');
    home.onclick = () => { audio.tap(); o.onHome(); };
  }
  stage.classList.add('result-mode');
  stage.classList.toggle('lose', !o.win);
  result.classList.remove('hidden');
  game.enterResultView();
  void result.offsetWidth;
  // art and the map's scale-to-fit start together (win: the garden grows during the same move); then the buttons
  result.classList.add('show-art', 'show-map');
  game.fitView(mapRect, 800);
  later(() => result.classList.add('show-actions'), o.win ? 1200 : 800);
  const afterIntro = () => { if (o.win && o.find?.species) showFind(o.find); };
  if (o.win && o.starsIntro) later(() => showStarsIntro(afterIntro), 1500);
  else later(afterIntro, 1200); // together with the action row, so the layout settles once
}

/** Reward-style reveal for a newly discovered species: dim backdrop, glowing rays, big bounce-in icon. */
function showFind({ species, set }) {
  const { have, total } = setProgress(progress, set.id);
  const pips = Array.from({ length: total }, (_, i) => `<i class="${i < have ? 'on' : ''}"></i>`).join('');
  const el = $('res-newfind');
  el.innerHTML =
    `<div class="rn-ic">${species.icon}</div>` +
    '<div class="rn-tx">' +
    '<span class="rn-new">NEW!</span>' +
    `<b>${species.name}</b>` +
    `<small>${set.name} collection</small>` +
    `<div class="fp-pips" aria-label="${have} of ${total}">${pips}</div>` +
    '</div>';
  el.classList.remove('hidden');
  renderAlbumBadge();
  audio.win();
}

/** Level 3 first clear: explain how stars are earned. */
function showStarsIntro(done) {
  const el = $('res-find');
  const star = (on) => STAR_SVG.replace('<svg', `<svg class="${on ? 'on' : ''}"`);
  el.innerHTML =
    '<div class="fp-card si-card">' +
    '<div class="fp-rays"></div>' +
    '<span class="fp-new">STARS!</span>' +
    `<div class="si-stars">${star(1)}${star(1)}${star(1)}</div>` +
    '<h4>Earn up to 3 stars</h4>' +
    '<ul class="si-list">' +
    '<li><b>♥</b> Every heart you lose costs a star</li>' +
    '</ul>' +
    '<p class="fp-set">Replay a level from the map to earn the stars you missed.</p>' +
    '<button class="claim-btn fp-btn">Got it</button>' +
    '</div>';
  el.classList.remove('hidden', 'out');
  confetti($('res-confetti'));
  audio.win();
  el.querySelector('.fp-btn').onclick = () => {
    audio.tap();
    el.classList.add('out');
    later(() => { el.classList.add('hidden'); done?.(); }, 260);
  };
}

let pendingWin = null;
const praise = new Praise($('stage'), audio, () => settings);

// ---- Game ----
const game = new Game($('game'), {
  getSettings: () => settings,
  getFound: () => progress.found,
  onModeChange: () => syncModeUI(),
  onCellJump: (n, to) => { tut.cellJumped(n); hint.cellJumped(n, to); },
  gate: (type, data) => tut.allows(type, data),
  onBlocked: () => tut.nudge(),
  onBoosterUsed: (id) => {
    useBooster(progress, id);
    renderBoosters();
    tut.boosterUsed(id);
  },
  onHearts: (left, lostOne) => {
    heartsLeft = left;
    renderHearts(left, lostOne);
    audio.setLowHealth(left === 1, () => {
      const st = $('stage');
      return !st.matches('.result-mode, :has(#home:not(.hidden)), :has(#levels:not(.hidden)), :has(#shop:not(.hidden)), :has(#album:not(.hidden))');
    });
  },
  onPlace: (count, pos, isLast) => {
    audio.place(count);
    hint.reset(); // progress: restart the stuck timer
    tut.placed();
    vibrate(settings, 12);
    praise.hit(pos, count, isLast);
  },
  onMistake: () => {
    praise.miss();
    tut.placed();
    audio.wrong();
    vibrate(settings, 60);
  },
  onWinStart: () => {
    audio.setLowHealth(false);
    const stars = freeRun ? 3 : scoreRun(heartsLeft);
    audio.victory(stars);
    vibrate(settings, [20, 40, 20, 40, 80]);
    tut.stop();
    const last = levelIndex === levels.length - 1;
    const rec = recordWin(progress, levels[levelIndex].id, stars);
    const reward = winReward(stars, rec.firstClear);
    earn(progress, reward); // saved right away, so quitting mid-celebration never loses it
    const find = rec.firstClear ? discoverForLevel(progress, levels[levelIndex].id) : null;
    renderCoins();
    // "Play" on the home screen continues from the next level
    if (levelIndex < levels.length - 1) saveLevelIndex(levelIndex + 1);
    pendingWin = { last, stars, rec, reward, find, levelIdx: levelIndex };
  },
  onWin: () => {
    if (!pendingWin) return;
    const { last, stars, rec, reward, find, levelIdx } = pendingWin;
    pendingWin = null;
    const praise = ['', 'Good job!', 'Great!', 'Perfect!'][stars];
    const note = rec.firstClear ? 'First clear!' : rec.isNewBest ? 'New best!' : `Best ${rec.best}★`;
    showResult({
      win: true,
      title: last ? 'Garden Complete!' : 'Level Complete!',
      stars,
      reward,
      replay: !rec.firstClear,
      find,
      sub: `<b>${levels[levelIdx].name}</b> · ${praise} · ${note}`,
      starsIntro: rec.firstClear && levels[levelIdx].id === 3,
      next: last ? 'You grew every garden!' : `Next: ${levels[levelIdx + 1].name}`,
      onClaim: () => {
        // Opening flow: first clear of level 1 and 2 rolls straight into the next level (no menu until level 3 is cleared)
        if (rec.firstClear && levels[levelIdx].id <= 2 && !last) {
          startLevel(levelIdx + 1);
          playLevelIntro();
          return;
        }
        // Continue always leaves the level: back to the road map if it was opened from there, else home
        const toMap = startedFromMap;
        startedFromMap = false;
        showHome();
        if (!toMap) playHomeIntro();
        if (toMap) showLevels();
      },
      onHome: showHome,
    });
  },
  onFail: () => {
    tut.stop();
    audio.setLowHealth(false);
    setTimeout(() => audio.defeat(), 350); // after the wrong-drop thud
    vibrate(settings, [80, 60, 160]);
    showResult({
      win: false,
      title: 'Out of hearts',
      sub: 'So close! Give it another try.',
      onRevive: () => {
        const cost = nextReviveCost();
        if (cost != null && spend(progress, cost)) {
          revivesUsed++;
          leaveResult();
          game.revive();
          renderCoins();
        }
      },
      onRetry: () => { startLevel(levelIndex); playLevelIntro(); },
      onHome: showHome,
    });
  },
});

/** Level -> booster it unlocks (and teaches the first time). */
const BOOSTER_TUTORIAL = { 4: 'reveal', 6: 'find', 8: 'picker' };

// ---- Level 1 tutorial: place the missing numbers in order, guided by a bee + hand ----
const tut = {
  el: $('tutorial'),
  active: false,
  steps: [],
  texts: {
    first: 'Drag 2 next to 1',
    next: '{n} goes after {p}',
    last: '{n} goes between {p} and {s}',
  },
  kind: 'place', // 'place' (level 1) | 'jump' (level 2) | 'hearts' (level 3) | 'booster' (levels that unlock a booster)
  booster: null,
  boosterTexts: {
    reveal: { tap: 'New booster! Tap Reveal to see a cell\'s number' },
    find: { tap: 'New booster! Tap Find, then pick a cell', cell: 'Tap an empty cell', },
    picker: { tap: 'New booster! Tap Picker to browse all tiles', pick: 'Tap a tile to send it to its cell' },
  },
  start(level) {
    // only teach until the level has been cleared once; replays skip the tutorial
    const first = starsFor(progress, level.id) === 0;
    const bid = first ? BOOSTER_TUTORIAL[level.id] : null;
    const jump = !bid && first && level.id === 2 && game.maxScroll > 0;
    const hearts = !bid && first && level.id === 3 && !hasSeen(progress, 'hearts'); // once per save, even if the level is retried
    this.kind = bid ? 'booster' : hearts ? 'hearts' : jump ? 'jump' : 'place';
    this.booster = bid ?? null;
    if (hearts) {
      this.steps = [0];
    } else if (jump) {
      this.steps = [0];
      // [number to tap, neighbour the list jumps to]: the tray is ascending, so the jumps swing right / left / right
      this.jumpSteps = [[19, 18], [1, 2], [17, 16]];
      this.jumpIdx = 0;
      this.jumpPhase = 'tap';
    } else if (bid) {
      this.steps = [0];
      // gift 2: one is used in the lesson, one is left to play with afterwards (only once: restarts keep what's owned)
      const missing = 2 - boosterCount(progress, bid);
      if (missing > 0) { grantBooster(progress, bid, missing); renderBoosters(); }
    } else {
      this.steps = level.id === 1 && first ? Object.keys(level.solution).map(Number).filter((n) => !level.givens[n]) : [];
    }
    this.active = this.steps.length > 0;
    clearTimeout(this.fadeT);
    this.el.classList.remove('go', 'fade-out');
    heartsEl.classList.remove('hearts-intro', 'hearts-go');
    this.el.classList.toggle('hidden', !this.active);
    this.el.classList.toggle('compact', hearts); // hearts lesson: a slim pill that keeps clear of the board
    stageEl.classList.toggle('tutorial-mode', this.active && !bid && !hearts); // level 1 + level 2 hide the other UI
    for (const id of ['tut-from', 'tut-to', 'tut-hand']) $(id).style.display = '';
    this.t0 = performance.now();
    if (hearts) {
      this.t0 += 1100; // wait for the level intro to finish, then play the spotlight
      heartsEl.classList.add('hearts-intro');
    }
    if (this.active && !this.running) {
      this.running = true;
      this.tick();
    }
  },
  stop() {
    const hearts = this.active && this.kind === 'hearts';
    this.active = false;
    this.running = false;
    stageEl.classList.remove('tutorial-mode');
    heartsEl.classList.remove('hearts-intro', 'hearts-go');
    clearTimeout(this.fadeT);
    if (hearts) {
      // hearts lesson: the dim and the bubble fade away, then the level carries on as normal
      this.el.classList.add('fade-out');
      this.fadeT = setTimeout(() => this.hideNow(), 300);
      return;
    }
    this.hideNow();
  },
  hideNow() {
    this.el.classList.add('hidden');
    this.el.classList.remove('compact', 'go', 'fade-out');
  },
  tick() {
    if (!this.active) { this.running = false; return; }
    this.render();
    requestAnimationFrame(() => this.tick());
  },
  /** Booster lesson: ring + hand on the booster button, then (Find) on the target cell or (Picker) just a hint. */
  renderBooster() {
    const stRect = stageEl.getBoundingClientRect();
    const scale = stRect.width / stageEl.clientWidth || 1;
    const toStage = (x, y) => ({ x: (x - stRect.left) / scale, y: (y - stRect.top) / scale });
    const phase = game.mode === 'find' ? 'cell' : game.mode === 'picker' ? 'pick' : 'tap';
    const text = this.boosterTexts[this.booster][phase];
    if ($('tut-text').textContent !== text) $('tut-text').textContent = text;
    const from = $('tut-from'), to = $('tut-to'), hand = $('tut-hand');
    from.style.display = phase === 'tap' ? '' : 'none';
    to.style.display = phase === 'cell' ? '' : 'none';
    hand.style.display = phase === 'pick' ? 'none' : '';
    hand.style.opacity = '1';
    const bob = Math.sin(performance.now() / 180) * 6;
    if (phase === 'tap') {
      const r = boostBar.querySelector(`[data-id="${this.booster}"]`).getBoundingClientRect();
      const p = toStage(r.left + r.width / 2, r.top + r.height / 2);
      from.style.left = `${p.x}px`;
      from.style.top = `${p.y}px`;
      hand.style.transform = `translate(${p.x - 14}px, ${p.y + 6 + bob}px)`;
    } else if (phase === 'cell') {
      const info = game.pieces[0] && game.tutorialInfo(game.pieces[0].numbers[0]);
      if (info) {
        to.style.left = `${info.to.x}px`;
        to.style.top = `${info.to.y}px`;
        hand.style.transform = `translate(${info.to.x - 14}px, ${info.to.y - 4 + bob}px)`;
      }
    }
    $('tut-bubble').style.top = `${game._hudBottom() + 4}px`;
  },
  /** Level 2 lesson, 3 rounds: tap a board number -> the list jumps to its neighbour -> drag that tile in. */
  renderJump() {
    const step = this.jumpSteps[this.jumpIdx];
    if (!step) return this.stop();
    const [tapN, goalN] = step;
    if (game.placed.has(goalN)) { this.jumpIdx++; this.jumpPhase = 'tap'; this.t0 = performance.now(); return; }
    const from = $('tut-from'), to = $('tut-to'), hand = $('tut-hand');
    const setText = (text) => { if ($('tut-text').textContent !== text) $('tut-text').textContent = text; };
    if (this.jumpPhase === 'tap') {
      setText(`Tap ${tapN} to find the tile next to it`);
      const c = game.level.givens[tapN] ?? game.placed.get(tapN);
      const s = game._cellScreen(c[0], c[1]);
      from.style.display = 'none';
      to.style.display = '';
      hand.style.display = '';
      hand.style.opacity = '1';
      to.style.left = `${s.x}px`;
      to.style.top = `${s.y}px`;
      const bob = Math.sin(performance.now() / 180) * 6;
      hand.style.transform = `translate(${s.x - 14}px, ${s.y - 4 + bob}px)`;
      $('tut-bubble').style.top = `${game._hudBottom() + 4}px`;
      return;
    }
    // focus: ring on the tray tile and its cell, hand drags one to the other
    const info = game.tutorialInfo(goalN);
    if (!info) return; // mid-drag
    setText(goalN > tapN ? `${goalN} goes after ${tapN}. Drag it in!` : `${goalN} goes before ${tapN}. Drag it in!`);
    from.style.display = '';
    to.style.display = '';
    hand.style.display = '';
    from.style.left = `${info.from.x}px`; from.style.top = `${info.from.y}px`;
    to.style.left = `${info.to.x}px`; to.style.top = `${info.to.y}px`;
    const k = (((performance.now() - this.t0) % 1800) / 1800);
    const e = Math.min(1, k / 0.7);
    const sm = e * e * (3 - 2 * e);
    hand.style.transform = `translate(${info.from.x + (info.to.x - info.from.x) * sm - 14}px, ${info.from.y + (info.to.y - info.from.y) * sm - 4}px)`;
    hand.style.opacity = k > 0.9 ? String((1 - k) * 10) : '1';
    $('tut-bubble').style.top = `${info.hudBottom + 4}px`;
  },
  /** Level 3 lesson: ring + hand on the hearts. Over once the player places (or misplaces) a tile. */
  renderHearts() {
    const text = 'A wrong move costs a heart';
    if ($('tut-text').textContent !== text) $('tut-text').textContent = text;
    $('tut-from').style.display = 'none';
    $('tut-to').style.display = 'none';
    $('tut-hand').style.display = 'none';
    const t = performance.now() - this.t0;
    const go = t >= 0;
    this.el.classList.toggle('go', go);
    if (go) markSeen(progress, 'hearts');
    heartsEl.classList.toggle('hearts-go', go);
    if (t > 3300) return this.stop(); // spotlight for a few seconds, then back to the level
    // spotlight cut-out around the three hearts
    const stRect = stageEl.getBoundingClientRect();
    const scale = stRect.width / stageEl.clientWidth || 1;
    // size from the untransformed hearts (offset sizes), so the pop animation never resizes the box
    const c = heartsEl.getBoundingClientRect();
    const first = heartsEl.firstElementChild;
    const gap = parseFloat(getComputedStyle(heartsEl).columnGap) || 0;
    const w = heartsEl.children.length * first.offsetWidth + (heartsEl.children.length - 1) * gap;
    const h = first.offsetHeight;
    const cx = (c.left + c.width / 2 - stRect.left) / scale;
    const cy = (c.top + c.height / 2 - stRect.top) / scale;
    const spot = $('heart-spot');
    spot.style.left = `${cx - w / 2 - 8}px`;
    spot.style.top = `${cy - h / 2 - 3}px`;
    spot.style.width = `${w + 16}px`;
    spot.style.height = `${h + 6}px`;
    $('tut-bubble').style.top = `${cy + h / 2 + 10}px`;
  },
  /** A tile was placed or dropped wrong, or the player touched the stage: the hearts lesson is done. */
  placed() {
    if (this.active && this.kind === 'hearts') this.stop();
  },

  // ---- Locked flow: while a lesson runs the player can only do the step being asked for ----
  /** The one tile / cell the current step wants, or null when the step is not about placing. */
  target() {
    if (!this.active) return null;
    let n = null;
    if (this.kind === 'place') n = this.steps.find((s) => !game.placed.has(s));
    else if (this.kind === 'jump' && this.jumpPhase === 'focus') n = this.jumpSteps[this.jumpIdx]?.[1];
    return n == null ? null : { n, cell: game.level.solution[n] };
  },
  /** Booster lesson phase: 'tap' (press the booster) | 'cell' (Find) | 'pick' (Picker). */
  boosterPhase() {
    return game.mode === 'find' ? 'cell' : game.mode === 'picker' ? 'pick' : 'tap';
  },
  /** Game input gate: true when the lesson's current step allows this action. */
  allows(type, data) {
    if (!this.active || this.kind === 'hearts') return true; // hearts lesson is just a spotlight; lessons 1, 2 and boosters are locked
    const t = this.target();
    switch (type) {
      case 'grab': return !!t && data.piece.numbers[0] === t.n;
      case 'drop': return !!t && data.piece.numbers[0] === t.n && data.cell[0] === t.cell[0] && data.cell[1] === t.cell[1];
      case 'scroll': return this.kind === 'place' || (this.kind === 'jump' && this.jumpPhase === 'focus');
      case 'cell': return this.kind === 'jump' && this.jumpPhase === 'tap' && data.n === this.jumpSteps[this.jumpIdx]?.[0];
      case 'find': {
        const p = game.pieces[0];
        const c = p && game.level.solution[p.numbers[0]];
        return this.kind === 'booster' && this.booster === 'find' && !!c && data.cell[0] === c[0] && data.cell[1] === c[1];
      }
      case 'pick': return this.kind === 'booster' && this.booster === 'picker';
      default: return false; // 'dismiss' and anything unknown: stay in the lesson
    }
  },
  /** The player tried something off-script: shake the bubble so they look at it again. */
  nudge() {
    if (!this.active) return;
    const b = $('tut-text');
    b.classList.remove('nudge');
    void b.offsetWidth;
    b.classList.add('nudge');
  },
  /** Page-level UI (back, settings, boosters) during a lesson: only the booster being taught may be pressed. */
  allowsButton(el) {
    if (!this.active || this.kind !== 'booster') return true;
    const b = el.closest('.boost');
    return !!b && b.dataset.id === this.booster && this.boosterPhase() === 'tap';
  },
  /** The player tapped a board number and the list scrolled: show the tile it landed on. */
  cellJumped(n) {
    if (this.active && this.kind === 'jump' && this.jumpPhase === 'tap' && n === this.jumpSteps[this.jumpIdx]?.[0]) {
      this.jumpPhase = 'focus';
      this.t0 = performance.now();
    }
  },
  /** The booster being taught was used: lesson over. */
  boosterUsed(id) {
    if (this.active && this.kind === 'booster' && id === this.booster) this.stop();
  },
  render() {
    if (this.kind === 'hearts') return this.renderHearts();
    if (this.kind === 'jump') return this.renderJump();
    if (this.kind === 'booster') return this.renderBooster();
    const todo =this.steps.filter((n) => !game.placed.has(n));
    if (!todo.length) return this.stop();
    const n = todo[0];
    const info = game.tutorialInfo(n);
    if (!info) return; // mid-drag
    const done = this.steps.length - todo.length;
    const key = done === 0 ? 'first' : todo.length === 1 ? 'last' : 'next';
    const text = this.texts[key].replace('{n}', n).replace('{p}', n - 1).replace('{s}', n + 1);
    if ($('tut-text').textContent !== text) $('tut-text').textContent = text;
    const place = (el, p) => { el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; };
    place($('tut-from'), info.from);
    place($('tut-to'), info.to);
    // the hand loops from the tray tile to the target cell
    const k = (((performance.now() - this.t0) % 1800) / 1800);
    const e = Math.min(1, k / 0.7);
    const s = e * e * (3 - 2 * e);
    const x = info.from.x + (info.to.x - info.from.x) * s;
    const y = info.from.y + (info.to.y - info.from.y) * s;
    const hand = $('tut-hand');
    hand.style.transform = `translate(${x - 14}px, ${y - 4}px)`;
    hand.style.opacity = k > 0.9 ? String((1 - k) * 10) : '1';
    // keep the bubble clear of the board: just under the HUD
    $('tut-bubble').style.top = `${info.hudBottom + 4}px`;
  },
};

// ---- Auto hint: stuck for a while -> point at the easiest tile (by the difficulty rule), via tap-to-jump ----
// A hand asks the player to tap a number on the grid; the tap makes the list jump to the tile. That is the whole hint.
const NOT_PLAYING = '.result-mode, :has(#home:not(.hidden)), :has(#levels:not(.hidden)), :has(#shop:not(.hidden)), :has(#album:not(.hidden)), :has(#settings:not(.hidden))';
const hint = {
  active: false,
  info: null,
  last: performance.now(), // last time the player made progress (or the hint was reset)
  running: false,
  enabled: () => settings.hints !== false,
  canShow() {
    return this.enabled() && !tut.active && !!game.level && !game.locked && !game.resultMode && !game.dragPiece &&
      !game.selected && !game.mode && game.pieces.length > 0 && !stageEl.matches(NOT_PLAYING);
  },
  reset() {
    this.hide();
    this.last = performance.now();
  },
  hide() {
    if (!this.active) return;
    this.active = false;
    this.info = null;
    if (!tut.active) tut.el.classList.add('hidden');
    tut.el.classList.remove('hint-mode');
  },
  check() {
    if (document.hidden || !this.canShow()) { this.reset(); return; }
    if (this.active) {
      if (!game.pieces.includes(this.info.piece)) this.reset(); // placed (or level changed)
      return;
    }
    if (performance.now() - this.last < HINT_IDLE_SECONDS * 1000) return;
    const info = game.maxScroll > 0 ? pickHint(game.level, game.placed, game.pieces) : null; // nothing to scroll: nothing to show
    if (!info) { this.last = performance.now(); return; }
    game._jumpFrom = null; // so the first tap on the grid number lands on the hinted tile
    this.info = info;
    this.active = true;
    tut.el.classList.add('hint-mode');
    tut.el.classList.remove('hidden');
    if (!this.running) { this.running = true; this.tick(); }
  },
  tick() {
    if (!this.active) { this.running = false; return; }
    this.render();
    requestAnimationFrame(() => this.tick());
  },
  /** The list jumped after a tap on grid number n; `to` is the first number of the tile it landed on. */
  cellJumped(n, to) {
    // the player followed the hint: done (the timer restarts, so a new hint comes only if they stay stuck)
    if (this.active && n === this.info.tapNumber && to === this.info.piece.numbers[0]) this.reset();
  },
  /** Only the hand, bobbing on the grid number to tap. */
  render() {
    const { tapCell } = this.info;
    const hand = $('tut-hand');
    const DX = 14, DY = 28; // hand sits below-right of the target so the fingertip points at it without covering the number
    const s = game._cellScreen(tapCell[0], tapCell[1]);
    const bob = Math.sin(performance.now() / 180) * 6;
    hand.style.display = '';
    hand.style.transform = `translate(${s.x - 14 + DX}px, ${s.y - 4 + DY + bob}px)`;
    hand.style.opacity = '1';
  },
};
setInterval(() => hint.check(), 400);
// lessons lock the page UI: back / settings / other boosters / re-tapping the booster mid-lesson do nothing but nudge
$('stage').addEventListener('click', (e) => {
  if (!tut.active) return;
  const ui = e.target.closest('#back-btn, #settings-btn, #boosters, #coin-hud');
  if (!ui || tut.allowsButton(e.target)) return;
  e.stopPropagation();
  e.preventDefault();
  tut.nudge();
}, true);
window.addEventListener('keydown', (e) => {
  if (tut.active && tut.kind === 'booster' && e.key === 'Escape') e.stopImmediatePropagation();
}, true);
// the hearts lesson ends as soon as the player starts interacting with the play field
$('stage').addEventListener('pointerdown', () => tut.placed(), true);

function startLevel(i) {
  pendingWin = null;
  revivesUsed = 0;
  leaveResult();
  boostBar.classList.remove('hidden');
  levelIndex = i;
  saveLevelIndex(i);
  const level = levels[i];
  $('level-name').innerHTML = level.name + (level.difficulty === 'hard' ? ' <span class="hard-tag">HARD</span>' : '');
  // levels 1-2 keep an ascending tray order (gentle start); from level 3 the tray is shuffled each play
  praise.reset();
  const bare = level.id <= 2 && starsFor(progress, level.id) === 0; // levels 1-2 until first cleared: no top bar, no boosters
  stageEl.classList.toggle('bare-level', bare);
  freeRun = bare; // first play of levels 1-2: hearts are free and the result is always 3 stars
  game.loadLevel(level, { randomOrder: level.id > 2, bare, freeHearts: freeRun });
  syncModeUI();
  renderCoins();
  tut.start(level);
  hint.reset();
}

/** Where Continue goes: the first level not yet cleared (or the last one when everything is cleared). */
function continueIndex() {
  const i = levels.findIndex((l) => starsFor(progress, l.id) === 0);
  return i === -1 ? levels.length - 1 : i;
}

// ---- Home screen ----
const home = $('home');
function showHome() {
  tut.stop();
  stageEl.classList.remove('bare-level');
  game.cancelMode();
  closeBuyPop();
  boostBar.classList.add('hidden');
  leaveResult();
  const cur = continueIndex();
  $('home-level').textContent = `${levels[cur].name} · ★ ${totalStars(progress)}/${levels.length * 3}`;
  $('play-btn').querySelector('span').textContent = completedCount(progress) === 0 && cur === 0 ? 'Play' : 'Continue';
  home.classList.remove('leaving');
  home.classList.remove('hidden');
  offerDaily();
}
function hideHome() {
  home.classList.add('hidden');
}

// ---- Home -> level transition: home content slides away, then the HUD, board, tray and boosters build in ----
const stageEl = $('stage');
const calmMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let introTimer = 0;
let entering = false;
let returningHome = false;
/** "Wow" entrance for the main menu: logo drops in with a bounce, a shine ring bursts, hexes spin-pop one by one, buttons spring up. */
function playHomeIntro() {
  if (calmMotion) return [];
  const list = [];
  const spring = 'cubic-bezier(.34,1.56,.64,1)';
  const go = (el, frames, duration, delay = 0, easing = spring) => {
    if (el) list.push(el.animate(frames, { duration, delay, easing, fill: 'backwards' }));
  };
  go(home.querySelector('.h-brand'), [
    { opacity: 0, transform: 'translateY(-90px) scale(1.25) rotate(-3deg)' },
    { opacity: 1, transform: 'none' },
  ], 450);
  const hero = home.querySelector('.h-hero');
  if (hero) {
    const ring = document.createElement('div');
    ring.style.cssText = 'position:absolute;left:50%;top:50%;width:70%;aspect-ratio:1;margin:-35% 0 0 -35%;border-radius:50%;pointer-events:none;' +
      'background:radial-gradient(circle,rgba(255,255,255,.85) 0%,rgba(255,240,150,.45) 40%,transparent 70%);';
    if (getComputedStyle(hero).position === 'static') hero.style.position = 'relative';
    hero.prepend(ring);
    const a = ring.animate([
      { opacity: 0, transform: 'scale(.2)' },
      { opacity: 1, transform: 'scale(1.1)', offset: 0.35 },
      { opacity: 0, transform: 'scale(2.2)' },
    ], { duration: 600, delay: 120, easing: 'ease-out', fill: 'both' });
    a.finished.then(() => ring.remove(), () => ring.remove());
    list.push(a);
  }
  // the seven hexes pop in a spiral
  const hexes = [...home.querySelectorAll('.h-board > g > g')];
  hexes.forEach((g, i) => {
    g.style.transformBox = 'fill-box';
    g.style.transformOrigin = 'center';
    go(g, [
      { opacity: 0, scale: '0', rotate: '-140deg', translate: '0 -60px' },
      { opacity: 1, scale: '1', rotate: '0deg', translate: '0 0' },
    ], 420, 60 + i * 40);
  });
  const tail = 60 + hexes.length * 40;
  go($('play-btn'), [
    { transform: 'translateY(50px) scale(.5)', opacity: 0 },
    { transform: 'translateY(-6px) scale(1.12)', opacity: 1, offset: 0.6 },
    { transform: 'none', opacity: 1 },
  ], 420, tail - 120, 'ease-out');
  go($('home-level'), [{ opacity: 0, transform: 'translateY(30px) scale(.7)' }, { opacity: 1, transform: 'none' }], 340, tail + 40);
  go(stageEl.querySelector('.home-nav'), [{ opacity: 0, transform: 'translateY(100%)' }, { opacity: 1, transform: 'none' }], 380, tail - 60);
  home.querySelectorAll('.h-gear').forEach((el, i) => {
    go(el, [{ opacity: 0, scale: '0', rotate: '-90deg' }, { opacity: 1, scale: '1', rotate: '0deg' }], 320, tail - 60 + i * 40);
  });
  return list;
}
async function returnToHome() {
  if (returningHome || entering || !home.classList.contains('hidden')) return;
  if (calmMotion) { showHome(); $('play-btn').focus(); return; }
  returningHome = true;
  stageEl.inert = true;
  tut.stop();
  game.cancelMode();
  closeBuyPop();
  clearTimeout(introTimer);
  stageEl.classList.remove('intro');
  const animations = [];
  const animate = (el, frames, duration, delay = 0) => {
    if (!el) return;
    const animation = el.animate(frames, { duration, delay, easing:'cubic-bezier(.22,.75,.25,1)', fill:'both' });
    animations.push(animation);
    return animation;
  };
  try {
    animate($('game'), [{ opacity:1, transform:'scale(1)' }, { opacity:0, transform:'scale(.9) translateY(16px)' }], 280);
    animate($('hud'), [{ opacity:1, translate:'0 0' }, { opacity:0, translate:'0 -35px' }], 230);
    for (const id of ['tray-panel', 'tray-scroll', 'boosters']) {
      animate($(id), [{ opacity:1, translate:'0 0' }, { opacity:0, translate:'0 45px' }], 250);
    }
    animate($('play-bg'), [{ opacity:1 }, { opacity:0 }], 300);
    await Promise.all(animations.map((a) => a.finished));
    showHome();
    animations.splice(0).forEach((a) => a.cancel());
    animations.push(...playHomeIntro());
    await Promise.all(animations.map((a) => a.finished));
  } finally {
    animations.forEach((a) => a.cancel());
    stageEl.inert = false;
    returningHome = false;
    if (!home.classList.contains('hidden')) $('play-btn').focus({ preventScroll:true });
  }
}
function playLevelIntro() {
  if (calmMotion) return;
  stageEl.classList.remove('intro');
  void stageEl.offsetWidth;
  stageEl.classList.add('intro');
  game.playIntro();
  clearTimeout(introTimer);
  introTimer = setTimeout(() => stageEl.classList.remove('intro'), 1600);
}
/** Start level i from the home / level-picker screens with the entrance animation. */
let startedFromMap = false; // true when the current level was opened from the road map
function enterLevel(i) {
  if (entering || returningHome) return;
  startedFromMap = !levelsEl.classList.contains('hidden');
  if (calmMotion || home.classList.contains('hidden')) {
    hideLevels();
    hideHome();
    startLevel(i);
    return;
  }
  entering = true;
  const fromPicker = !levelsEl.classList.contains('hidden');
  home.classList.add('leaving');
  hideLevels();
  setTimeout(() => {
    hideHome();
    startLevel(i);
    playLevelIntro();
    entering = false;
  }, fromPicker ? 200 : 270);
}

// ---- Shop ----
const shopEl = $('shop');
function swatch(item) {
  const id = `sw-${item.id}`;
  const v = item.vars;
  return `<div class="sw sw-set" style="background:linear-gradient(${v['sky-a']},${v['sky-b']} 55%,${v['sky-c']})"><i style="background:${v['hill-2a']}"></i><b style="background:${v['hill-3']}"></b><svg viewBox="-40 -40 80 80"><defs><linearGradient id="${id}-f" x2="0" y2="1"><stop stop-color="${item.face[0]}"/><stop offset="1" stop-color="${item.face[1]}"/></linearGradient></defs><polygon points="0,-34 29,-17 29,17 0,34 -29,17 -29,-17" fill="${item.base}" transform="translate(0 4)"/><polygon points="0,-34 29,-17 29,17 0,34 -29,17 -29,-17" fill="url(#${id}-f)" stroke="${item.rim[0]}" stroke-width="3"/><text y="9" text-anchor="middle" font-size="26" font-weight="800" fill="#7a3d12" font-family="Nunito,sans-serif">7</text></svg></div>`;
}
// ---- Store sections (real-money packs + coin-bought boosters) ----
const money = (n) => `${n.toFixed(2)}$`;
const BOOST_ICON = (id, qty) => `<span class="rw"><span class="rw-ic">${boosterArt[id]}</span><b>x${qty}</b></span>`;
const rewardChips = (r) =>
  `${r.coins ? `<span class="rw"><span class="rw-ic rw-coin"><i class="coin"></i></span><b>${r.coins.toLocaleString('en-US')}</b></span>` : ''}${Object.entries(r.boosters ?? {}).map(([id, q]) => BOOST_ICON(id, q)).join('')}${r.skin ? `<span class="rw"><span class="rw-ic"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4 34 12v16L20 36 6 28V12Z" fill="#fffdf7" stroke="#7a9bb0" stroke-width="2.4" stroke-linejoin="round"/><path d="M20 11 28 16v8l-8 5-8-5v-8Z" fill="#bfe3f5"/></svg></span><b>${r.skin}</b></span>` : ''}`;
const offBadge = (off) => (off ? `<span class="shop-off" aria-label="${off}% off"><b>${off}%</b><i>OFF</i></span>` : '');
const priceBtn = (p, cls = '') =>
  `<button class="shop-buy ${cls}" type="button">${p.was ? `<s>${money(p.was)}</s>` : ''}<b>${money(p.price)}</b></button>`;
const sign = (title, note = '') => `<h3 class="shop-sign"><span>${title}</span>${note ? `<small>${note}</small>` : ''}</h3>`;

function showReward(title, rewards, art) {
  const pop = document.createElement('div');
  pop.className = 'shop-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-modal', 'true');
  pop.innerHTML = `<div class="shop-pop-card"><span class="shop-pop-rays" aria-hidden="true"></span><div class="shop-pop-art">${art}</div><h4>${title}</h4><div class="shop-pop-rw">${rewardChips(rewards)}</div><button class="shop-buy" type="button">Collect</button></div>`;
  const close = () => { audio.tap(); pop.remove(); };
  pop.querySelector('button').onclick = close;
  pop.addEventListener('click', (e) => { if (e.target === pop) close(); });
  stageEl.append(pop);
  pop.querySelector('button').focus({ preventScroll: true });
}

/** Fake OS purchase sheet so a stray tap never buys anything. Replace with the store SDK's own sheet later. */
function confirmPurchase(title, price, art, onConfirm) {
  const pop = document.createElement('div');
  pop.className = 'os-pop';
  pop.setAttribute('role', 'alertdialog');
  pop.setAttribute('aria-modal', 'true');
  pop.setAttribute('aria-label', 'Confirm purchase');
  pop.innerHTML = `<div class="os-sheet"><div class="os-head"><span class="os-icon">${art}</span><div><b>${title}</b><small>Gardendoku</small></div></div><div class="os-line"><span>Price</span><b>${money(price)}</b></div><p class="os-note">TEST MODE: this is a simulated purchase. You will not be charged.</p><div class="os-actions"><button type="button" class="os-cancel">Cancel</button><button type="button" class="os-ok">Buy ${money(price)}</button></div></div>`;
  const close = () => pop.remove();
  pop.querySelector('.os-cancel').onclick = () => { audio.tap(); close(); };
  pop.querySelector('.os-ok').onclick = () => { close(); onConfirm(); };
  pop.addEventListener('click', (e) => { if (e.target === pop) close(); });
  pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  stageEl.append(pop);
  pop.querySelector('.os-cancel').focus({ preventScroll: true });
}

function buyPack(p, art, once = false) {
  confirmPurchase(p.name ?? (p.coins ? `${p.coins.toLocaleString('en-US')} coins` : 'Purchase'), p.price, art, () => grantAndShow(p, art, once));
}

function grantAndShow(p, art, once) {
  if (!grantPack(progress, p.id, { coins: p.coins, boosters: p.boosters, noAds: p.id === shopCfg.removeAds.id }, once)) return;
  audio.tap();
  renderCoins();
  renderShop();
  showReward(p.name ?? (p.coins ? `${p.coins.toLocaleString('en-US')} coins` : 'Ads removed'), { coins: p.coins, boosters: p.boosters }, art);
}

function fmtWait(ms) {
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

function renderStore(body) {
  const add = (html) => body.insertAdjacentHTML('beforeend', html);

  // Boosters bought with in-game coins
  add(sign('Boosters'));
  add(`<div class="boost-shelf">${boosterIds.map((id) => {
    const cfg = BOOSTERS[id];
    return `<div class="boost-card" data-id="${id}"><span class="boost-own">${boosterCount(progress, id)}</span><div class="boost-art b-${id}">${boosterArt[id]}</div><span class="nm">${cfg.name}</span><button class="shop-btn best" data-qty="${BOOSTERS.packSize}" type="button">x${BOOSTERS.packSize} ${COIN} ${packPrice(id)}</button></div>`;
  }).join('')}</div>`);
  body.querySelectorAll('.boost-card').forEach((card) => {
    const id = card.dataset.id;
    card.querySelectorAll('.shop-btn').forEach((btn) => {
      const qty = Number(btn.dataset.qty);
      const cost = qty === BOOSTERS.packSize ? packPrice(id) : BOOSTERS[id].price * qty;
      btn.classList.toggle('poor', !canAfford(progress, cost));
      btn.onclick = () => {
        if (!buyBooster(progress, id, qty)) return shakeEl(btn);
        audio.tap();
        renderCoins();
        renderShop();
      };
    });
  });

  // Remove ads
  const ra = shopCfg.removeAds;
  if (ra.enabled) {
  add(sign('Remove Ads'));
  add(`<div class="shop-row tone-sky${progress.noAds ? ' done' : ''}"><div class="shop-panel noads-panel"><div class="row-art">${shopArt.noads}</div><span>Play ad-free forever</span></div>${progress.noAds ? '<span class="shop-owned">Active</span>' : priceBtn(ra)}${progress.noAds ? '' : offBadge(ra.off)}</div>`);
  if (!progress.noAds) body.querySelector('.noads-panel').parentElement.querySelector('.shop-buy').onclick = () => buyPack({ ...ra, name: 'Ads removed' }, shopArt.noads);
  }

  // Special (one-time offers)
  const specials = shopCfg.special.filter((s) => !s.once || !wasBought(progress, s.id));
  if (specials.length) {
    add(sign('Special'));
    for (const s of specials) {
      add(`<div class="shop-deal tone-${s.tone}" data-id="${s.id}"><div class="deal-art">${shopArt[s.art]}</div><div class="deal-name">${s.name}</div><div class="deal-rw">${rewardChips(s)}</div>${priceBtn(s)}${offBadge(s.off)}</div>`);
      body.querySelector(`.shop-deal[data-id="${s.id}"] .shop-buy`).onclick = () => buyPack(s, shopArt[s.art], true);
    }
  }

  // Bundles
  add(sign('Bundle'));
  for (const b of shopCfg.bundles) {
    add(`<div class="shop-deal tone-${b.tone}" data-id="${b.id}"><div class="deal-art">${shopArt[b.art]}</div><div class="deal-name">${b.name}</div><div class="deal-rw">${rewardChips(b)}</div>${priceBtn(b)}${offBadge(b.off)}</div>`);
    body.querySelector(`.shop-deal[data-id="${b.id}"] .shop-buy`).onclick = () => buyPack(b, shopArt[b.art]);
  }

  // Gold (coin packs)
  const jp = shopCfg.coinJackpot;
  const df = shopCfg.dailyFree;
  add(sign('Gold'));
  add(`<div class="shop-row tone-coral"><div class="shop-panel"><div class="row-art">${shopArt.jackpot}</div><span class="row-coins"><i class="coin"></i> ${jp.coins.toLocaleString('en-US')}</span></div>${priceBtn(jp)}${offBadge(jp.off)}</div>`);
  body.querySelector('.tone-coral .shop-buy').onclick = () => buyPack({ ...jp, name: `${jp.coins.toLocaleString('en-US')} coins` }, shopArt.jackpot);
  const wait = dailyWait(progress, df.cooldownHours);
  add(`<div class="coin-grid"><div class="coin-card free" data-id="daily"><div class="cc-top">${df.coins}</div><div class="cc-art">${shopArt.claim}</div><button class="shop-buy ${wait ? 'wait' : ''}" type="button" ${wait ? 'disabled' : ''}>${wait ? fmtWait(wait) : 'FREE'}</button></div>${shopCfg.coinPacks.map((c) => `<div class="coin-card" data-id="${c.id}"><div class="cc-top">${c.coins.toLocaleString('en-US')}</div><div class="cc-art">${shopArt[`coin${c.art}`]}</div>${priceBtn(c)}${offBadge(c.off)}</div>`).join('')}</div>`);
  const daily = body.querySelector('.coin-card.free .shop-buy');
  if (!wait) {
    daily.onclick = () => {
      grantPack(progress, 'daily', { coins: df.coins });
      markDaily(progress);
      audio.tap();
      renderCoins();
      renderShop();
      showReward('Daily gift', { coins: df.coins }, shopArt.claim);
    };
  }
  for (const c of shopCfg.coinPacks) {
    body.querySelector(`.coin-card[data-id="${c.id}"] .shop-buy`).onclick = () => buyPack({ ...c, name: `${c.coins.toLocaleString('en-US')} coins` }, shopArt[`coin${c.art}`]);
  }
}
function renderShop() {
  $('shop-coins').textContent = coinsOf(progress);
  const body = $('shop-body');
  const keepScroll = body.scrollTop;
  body.innerHTML = '';
  renderStore(body);
  for (const [type, title] of [['tile', 'Garden Sets']]) {
    const h = document.createElement('h3');
    h.className = 'shop-sign';
    h.innerHTML = `<span>${title}</span>`;
    body.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'shop-grid';
    for (const item of cosmeticItems.filter((i) => i.type === type)) {
      const owned = isOwned(progress, item.id);
      const on = progress.equipped[type] === item.id;
      const card = document.createElement('div');
      card.className = `shop-card${on ? ' on' : ''}`;
      const btn = document.createElement('button');
      btn.className = 'shop-btn';
      if (on) {
        btn.textContent = 'Equipped';
        btn.disabled = true;
      } else if (owned) {
        btn.textContent = 'Equip';
      } else {
        btn.innerHTML = `${COIN} ${item.price}`;
        btn.classList.toggle('poor', !canAfford(progress, item.price));
      }
      btn.onclick = () => {
        if (!owned && !buyItem(progress, item.id)) {
          btn.classList.remove('shake');
          void btn.offsetWidth;
          btn.classList.add('shake');
          return;
        }
        equipItem(progress, item.id);
        audio.tap();
        applyCosmetics();
        renderCoins();
        renderShop();
      };
      card.innerHTML = `${swatch(item)}<span class="nm">${item.name}</span>`;
      card.appendChild(btn);
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }
  body.scrollTop = keepScroll;
}
$('home-shop').addEventListener('click', () => {
  audio.unlock();
  audio.tap();
  void switchMenuTab('shop');
});


// ---- Garden album (collection) ----
const albumEl = $('album');
function renderAlbum() {
  $('album-total').textContent = `${foundCount(progress)}/${collectionSpecies.length}`;
  const body = $('album-body');
  body.innerHTML = '';
  for (const set of collectionSets) {
    const { have, total } = setProgress(progress, set.id);
    const h = document.createElement('h3');
    const ready = have === total && !progress.setsClaimed.includes(set.id);
    h.innerHTML = `<span class="al-name">${set.name}</span> <small>${have}/${total}${have < total ? ` · bonus ${set.bonus}` : ready ? ' · claim bonus!' : ' ✓'}</small>`;
    if (have < total || ready) h.querySelector('small').insertAdjacentHTML('beforeend', ` ${COIN}`);
    if (ready) { h.classList.add('claimable'); h.onclick = () => { audio.tap(); showClaim(set); }; }
    body.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'album-grid';
    for (const sp of speciesOfSet(set.id)) {
      const got = hasSpecies(progress, sp.id);
      const card = document.createElement(got ? 'button' : 'div');
      card.className = `album-card${got ? '' : ' unknown'}`;
      if (got) { card.type = 'button'; card.onclick = () => { audio.tap(); showGlossary(sp, set); }; }
      card.setAttribute('aria-label', got ? sp.name : `Undiscovered, clear level ${sp.level}`);
      card.innerHTML = `<span class="ic" aria-hidden="true">${sp.icon}</span><span class="nm">${got ? sp.name : `Level ${sp.level}`}</span>`;
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }
}
/** "!" on the Album tab while a completed set's bonus is waiting to be claimed. */
function renderAlbumBadge() {
  const btn = $('home-album');
  let dot = btn.querySelector('.nav-badge');
  if (!dot) {
    dot = document.createElement('i');
    dot.className = 'nav-badge';
    dot.textContent = '!';
    dot.setAttribute('role', 'img');
    btn.appendChild(dot);
  }
  const n = claimableSets(progress).length;
  dot.hidden = n === 0;
  dot.setAttribute('aria-label', `${n} bonus reward${n === 1 ? '' : 's'} to claim`);
}

/** Claim popup for a completed set; chains to the next unclaimed set when closed. */
function showClaim(set) {
  const el = $('album-pop');
  el.innerHTML =
    '<div class="fp-card si-card">' +
    '<div class="fp-rays"></div>' +
    '<span class="fp-new">COMPLETE!</span>' +
    `<h4>${set.name} set</h4>` +
    '<p class="fp-set">You found every species in this collection.</p>' +
    `<button class="claim-btn alt fp-btn" type="button"><span>Claim</span><em>${COIN} +${set.bonus}</em></button>` +
    '</div>';
  el.classList.remove('hidden', 'out');
  audio.win();
  const btn = el.querySelector('.fp-btn');
  btn.onclick = () => {
    btn.disabled = true;
    audio.tap();
    if (claimSet(progress, set.id)) renderCoins();
    renderAlbumBadge();
    renderAlbum();
    el.classList.add('out');
    setTimeout(() => {
      el.classList.add('hidden');
      const next = claimableSets(progress)[0];
      if (next && activeMenuTab === 'album') showClaim(next);
    }, 260);
  };
}
function offerClaims() {
  const next = claimableSets(progress)[0];
  if (next) showClaim(next);
}

// ---- Daily gifts: looping 7-day table + streak chests at 7/14/21/28 days ----
const dailyBtn = $('home-daily');
let dailyPop = null;
let dailyOfferedOn = '';

const giftArt = (r) => (r.coins && !r.boosters ? shopArt.coin1 : boosterArt[Object.keys(r.boosters)[0]]);
const giftIcon = (r) => (r.coins && !r.boosters ? '<i class="coin"></i>' : giftArt(r));
const giftLabel = (r) => (r.coins ? `+${r.coins}` : `x${Object.values(r.boosters)[0]}`);
const CHEST_ART = { 7: 'chest7', 14: 'chest14', 21: 'chest21', 28: 'chest28' };

const DAILY_UNLOCK_LEVEL = 5;
/** Daily gifts open once the player has reached level 5 (i.e. cleared level 4). */
function dailyUnlocked() {
  return levels.some((l) => l.id >= DAILY_UNLOCK_LEVEL - 1 && starsFor(progress, l.id) > 0);
}

function renderDailyBadge() {
  const open = dailyUnlocked();
  dailyBtn.classList.toggle('locked', !open);
  dailyBtn.setAttribute('aria-label', open ? 'Daily gifts' : `Daily gifts (unlocks at level ${DAILY_UNLOCK_LEVEL})`);
  let lock = dailyBtn.querySelector('.dl-lock');
  if (!lock) {
    lock = document.createElement('span');
    lock.className = 'dl-lock';
    lock.setAttribute('aria-hidden', 'true');
    lock.innerHTML = `${lockSvg}<b>Lv ${DAILY_UNLOCK_LEVEL}</b>`;
    dailyBtn.appendChild(lock);
  }
  let dot = dailyBtn.querySelector('.nav-badge');
  if (!dot) {
    dot = document.createElement('i');
    dot.className = 'nav-badge';
    dot.textContent = '!';
    dot.setAttribute('role', 'img');
    dailyBtn.appendChild(dot);
  }
  const st = dailyStatus(progress, todayStr());
  const n = (st.canClaim ? 1 : 0) + st.readyCount;
  dot.hidden = n === 0 || !open;
  dot.setAttribute('aria-label', st.canClaim ? 'Daily gift ready' : 'Streak chest ready');
}

function closeDaily() {
  if (!dailyPop) return;
  audio.tap();
  dailyPop.remove();
  dailyPop = null;
  home.inert = false;
  stageEl.querySelector('.home-nav').inert = false;
  renderDailyBadge();
  dailyBtn.focus({ preventScroll: true });
}

function renderDaily() {
  const st = dailyStatus(progress, todayStr());
  const days = dailyDays.map((r, i) => {
    const state = i < st.done ? 'done' : i === st.todayIdx ? 'today' : 'locked';
    return `<div class="dl-day ${state}${i === 6 ? ' wide' : ''}" aria-label="Day ${i + 1}${state === 'done' ? ', collected' : state === 'today' ? ', ready today' : ''}"><span class="dl-n">Day ${i + 1}</span><span class="dl-ic">${giftIcon(r)}</span><b class="dl-amt">${giftLabel(r)}</b>${state === 'done' ? '<i class="dl-check" aria-hidden="true">✓</i>' : ''}</div>`;
  }).join('');
  const chests = dailyMilestones.map((m, i) => {
    const state = st.chests[m.at];
    const fill = Math.max(0, Math.min(1, (st.streak - i * 7) / 7));
    return `<div class="dl-ms"><span class="dl-seg"><i style="width:${fill * 100}%"></i></span><button type="button" class="dl-chest ${state}" data-at="${m.at}" ${state === 'ready' ? '' : 'disabled'} aria-label="${m.at}-day chest, ${state === 'ready' ? 'tap to open' : state === 'done' ? 'opened' : 'locked'}"><span class="dl-chest-art">${shopArt[CHEST_ART[m.at]]}</span>${state === 'done' ? '<i class="dl-check" aria-hidden="true">✓</i>' : ''}</button><button type="button" class="dl-info" data-at="${m.at}" aria-label="What is in the ${m.at}-day chest?">!</button><b>${m.at} days</b></div>`;
  }).join('');
  const btn = st.canClaim
    ? `<button type="button" class="shop-buy dl-claim">Claim</button>`
    : `<button type="button" class="shop-buy dl-claim wait" disabled>Come back tomorrow</button>`;
  const note = st.canClaim && st.alive ? 'Claim today to keep your streak!' : 'Miss a day and your streak starts over.';
  dailyPop.querySelector('.dl-card').innerHTML =
    '<button type="button" class="dl-x" aria-label="Close">×</button>' +
    '<h4 id="dl-title">Daily gifts</h4>' +
    `<p class="dl-streak"><b>${st.streak}</b> day streak</p>` +
    `<div class="dl-grid">${days}</div>${btn}<p class="dl-note">${note}</p>` +
    `<div class="dl-track" aria-label="Streak chests">${chests}</div>`;
  const q = (sel) => dailyPop.querySelector(sel);
  q('.dl-x').onclick = closeDaily;
  const claim = q('.dl-claim:not(:disabled)');
  if (claim) {
    claim.onclick = () => {
      const res = dailyClaim(progress, todayStr());
      if (!res) return;
      audio.win();
      renderCoins();
      renderDaily();
      const art = giftArt(res.reward);
      showReward(`Day ${res.day} gift`, res.reward, art);
      dailyPop.querySelector('.dl-day.done:nth-child(' + res.day + ')')?.classList.add('pop');
    };
  }
  for (const c of dailyPop.querySelectorAll('.dl-chest.ready')) {
    c.onclick = () => {
      const res = dailyChestClaim(progress, Number(c.dataset.at));
      if (!res) return;
      audio.win();
      renderCoins();
      renderDaily();
      showReward(`${res.at}-day chest`, res, shopArt[CHEST_ART[res.at]]);
    };
  }
  const card = q('.dl-card');
  const tip = document.createElement('div');
  tip.className = 'dl-tip hidden';
  tip.setAttribute('role', 'status');
  card.append(tip);
  let tipAt = 0;
  for (const b of dailyPop.querySelectorAll('.dl-info')) {
    b.onclick = (e) => {
      e.stopPropagation();
      audio.tap();
      const at = Number(b.dataset.at);
      if (tipAt === at && !tip.classList.contains('hidden')) { tip.classList.add('hidden'); return; }
      tipAt = at;
      const m = dailyMilestones.find((x) => x.at === at);
      const skin = m.cosmetic ? cosmeticItems.find((i) => i.id === m.cosmetic) : null;
      const owned = skin ? isOwned(progress, skin.id) : false;
      const rewards = { coins: (m.coins ?? 0) + (owned ? m.ownedCoins ?? 0 : 0), boosters: m.boosters, skin: skin && !owned ? `${skin.name} tiles` : null };
      tip.innerHTML = `<b>${at}-day chest</b><div class="dl-tip-rw">${rewardChips(rewards)}</div><i class="dl-tip-arrow"></i>`;
      tip.classList.remove('hidden');
      const cr = card.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const w = tip.offsetWidth;
      const cx = br.left + br.width / 2 - cr.left;
      const left = Math.max(8, Math.min(cr.width - w - 8, cx - w / 2));
      tip.style.left = `${left}px`;
      tip.style.bottom = `${cr.bottom - br.top + 10}px`;
      tip.style.setProperty('--ax', `${cx - left}px`);
    };
  }
  (claim ?? dailyPop.querySelector('.dl-chest.ready') ?? q('.dl-x')).focus({ preventScroll: true });
}

function openDaily() {
  if (dailyPop) return;
  if (!dailyUnlocked()) {
    shakeEl(dailyBtn);
    home.querySelector('.dl-tip')?.remove();
    const tip = document.createElement('div');
    tip.className = 'dl-tip';
    tip.setAttribute('role', 'status');
    tip.textContent = `Unlocks at level ${DAILY_UNLOCK_LEVEL}`;
    home.append(tip);
    setTimeout(() => tip.remove(), 2000);
    return;
  }
  audio.unlock?.();
  audio.tap();
  dailyPop = document.createElement('div');
  dailyPop.className = 'dl-pop';
  dailyPop.setAttribute('role', 'dialog');
  dailyPop.setAttribute('aria-modal', 'true');
  dailyPop.setAttribute('aria-labelledby', 'dl-title');
  dailyPop.innerHTML = '<div class="dl-card"></div>';
  dailyPop.addEventListener('click', (e) => {
    if (e.target === dailyPop) closeDaily();
    else if (!e.target.closest('.dl-tip')) dailyPop.querySelector('.dl-tip')?.classList.add('hidden');
  });
  dailyPop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeDaily(); }
    if (e.key === 'Tab') {
      const items = [...dailyPop.querySelectorAll('button:not(:disabled)')];
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  home.inert = true;
  stageEl.querySelector('.home-nav').inert = true;
  stageEl.append(dailyPop);
  renderDaily();
}
dailyBtn.addEventListener('click', openDaily);

/** Once per day (per session) pop the gifts open when the player lands on Home with something to claim. */
function offerDaily() {
  renderDailyBadge();
  const today = todayStr();
  if (dailyOfferedOn === today || !dailyUnlocked() || !dailyStatus(progress, today).canClaim) return;
  dailyOfferedOn = today;
  setTimeout(() => { if (!home.classList.contains('hidden') && !dailyPop) openDaily(); }, 450);
}

/** Canvas holding the idle sprite of a species (same art the lawn uses). */
function speciesSprite(id) {
  let mat;
  if (id === 'koi') mat = fishMaterial();
  else if (id === 'butterfly') mat = butterflyMaterial(0);
  else if (id === 'fox') mat = dogMaterial(0, 'fox');
  else if (CRITTERS[id]) mat = critterMaterial(id);
  else mat = plantMaterial(id);
  const src = mat.map.image;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  c.className = `gl-sprite gl-${id}`;
  return c;
}

/** Glossary card: the animal idling on a hex of lawn, plus what we know about it. */
function showGlossary(sp, set) {
  const el = $('album-pop');
  el.innerHTML =
    '<div class="gl-card">' +
    '<button class="buy-x gl-x" type="button" aria-label="Close">×</button>' +
    `<h4>${sp.name}</h4>` +
    `<p class="gl-tag">${sp.kind} · ${set.name}</p>` +
    '<div class="gl-row"><div class="gl-stage"><svg class="gl-hex" viewBox="0 0 200 190" aria-hidden="true">' +
    '<path d="M39.4 115 100 150v11l-60.6-35Z" fill="#9c6836"/><path d="M100 150l60.6-35v11L100 161Z" fill="#7d4e28"/>' +
    '<path d="M39.4 115 100 150v5l-60.6-35Z" fill="#b57b43"/><path d="M100 150l60.6-35v5L100 155Z" fill="#a06a38"/>' +
    '<path d="M100 10l60.6 35v70L100 150 39.4 115V45Z" fill="#70c63f"/>' +
    '<g fill="#66bc38"><ellipse cx="76" cy="58" rx="14" ry="8"/><ellipse cx="132" cy="96" rx="16" ry="9"/><ellipse cx="116" cy="40" rx="9" ry="5"/></g>' +
    '<g fill="#7acd46"><ellipse cx="82" cy="104" rx="14" ry="7"/><ellipse cx="142" cy="60" rx="10" ry="6"/></g>' +
    '<g fill="#66bc38"><rect x="60" y="84" width="3" height="3"/><rect x="120" y="116" width="3" height="3"/><rect x="96" y="22" width="3" height="3"/><rect x="146" y="80" width="3" height="3"/></g></svg></div>' +
    '<ul class="gl-info">' +
    `<li><b>Habitat</b><span>${sp.habitat}</span></li>` +
    `<li><b>Found</b><span>Cleared Level ${sp.level}</span></li>` +
    '</ul>' +
    '</div>' +
    `<p class="gl-fact">${sp.fact}</p>` +
    '</div>';
  el.querySelector('.gl-stage').appendChild(speciesSprite(sp.id));
  el.classList.remove('hidden', 'out');
  const close = () => { el.classList.add('out'); setTimeout(() => el.classList.add('hidden'), 260); };
  el.querySelector('.gl-x').onclick = () => { audio.tap(); close(); };
  el.onclick = (e) => { if (e.target === el) close(); };
}
$('home-album').addEventListener('click', () => {
  audio.unlock();
  audio.tap();
  void switchMenuTab('album');
});


// ---- Shared Shop / Home / Album navigation ----
const menuPages = { shop:shopEl, home, album:albumEl };
const menuOrder = ['shop', 'home', 'album'];
const menuButtons = { shop:$('home-shop'), home:$('home-tab'), album:$('home-album') };
let activeMenuTab = 'home';
let slidingMenu = false;
async function switchMenuTab(next) {
  if (slidingMenu || entering || returningHome || next === activeMenuTab) return;
  const previous = activeMenuTab;
  const outgoing = menuPages[previous], incoming = menuPages[next];
  if (next === 'shop') renderShop();
  if (next === 'album') renderAlbum();
  slidingMenu = true;
  activeMenuTab = next;
  for (const [id, button] of Object.entries(menuButtons)) {
    button.classList.toggle('current', id === next);
    if (id === next) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  incoming.classList.remove('hidden');
  outgoing.inert = true;
  incoming.inert = true;
  stageEl.classList.add('menu-sliding');
  const direction = menuOrder.indexOf(next) > menuOrder.indexOf(previous) ? 1 : -1;
  const animations = [];
  try {
    if (!calmMotion) {
      const options = { duration:330, easing:'cubic-bezier(.22,.75,.25,1)', fill:'both' };
      animations.push(outgoing.animate([{ transform:'translateX(0)' }, { transform:`translateX(${-direction * 100}%)` }], options));
      animations.push(incoming.animate([{ transform:`translateX(${direction * 100}%)` }, { transform:'translateX(0)' }], options));
      await Promise.all(animations.map((animation) => animation.finished));
    }
  } finally {
    // Home stays mounted behind the other tabs to retain the menu/game visibility rules.
    if (previous !== 'home') outgoing.classList.add('hidden');
    incoming.inert = false;
    stageEl.classList.remove('menu-sliding');
    animations.forEach((animation) => animation.cancel());
    slidingMenu = false;
    menuButtons[next].focus({ preventScroll:true });
  }
  if (next === 'album') offerClaims();
}
renderAlbumBadge();
$('home-tab').addEventListener('click', () => { audio.tap(); void switchMenuTab('home'); });
let menuSwipe = null;
for (const page of Object.values(menuPages)) {
  page.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('button,input,select,textarea')) return;
    menuSwipe = { id:event.pointerId, x:event.clientX, y:event.clientY };
  });
  page.addEventListener('pointerup', (event) => {
    if (!menuSwipe || menuSwipe.id !== event.pointerId) return;
    const dx = event.clientX - menuSwipe.x, dy = event.clientY - menuSwipe.y;
    menuSwipe = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const next = menuOrder[menuOrder.indexOf(activeMenuTab) + (dx < 0 ? 1 : -1)];
    if (next) { audio.tap(); void switchMenuTab(next); }
  });
  page.addEventListener('pointercancel', () => { menuSwipe = null; });
}

// ---- Level select ----
const levelsEl = $('levels');
const lockSvg = '<svg class="lock" viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>';
/** A level is playable once the previous one is cleared (or it was already cleared itself). */
function isUnlocked(i) {
  return i === 0 || starsFor(progress, levels[i].id) > 0 || starsFor(progress, levels[i - 1].id) > 0;
}
// Level map: a winding trail, level 1 at the bottom. Coordinates live in a 100-wide viewBox so it scales uniformly.
const MAP_STEP = 34;
const MAP_PAD = 24;
const mapX = (i) => 50 + 22 * Math.sin((i * Math.PI) / 2);
function renderLevels() {
  const cur = continueIndex();
  $('levels-stars').textContent = `★ ${totalStars(progress)}/${levels.length * 3}`;
  const grid = $('levels-grid');
  grid.classList.add('lv-map');
  grid.innerHTML = '';
  const H = MAP_PAD * 2 + MAP_STEP * (levels.length - 1);
  const pos = (i) => ({ x: mapX(i), y: H - MAP_PAD - i * MAP_STEP });
  let trail = '', scenery = '';
  for (let i = 0; i < levels.length - 1; i++) {
    const p = pos(i), q = pos(i + 1), mid = (p.y + q.y) / 2;
    const d = `M${p.x} ${p.y} C${p.x} ${mid} ${q.x} ${mid} ${q.x} ${q.y}`;
    const done = starsFor(progress, levels[i].id) > 0;
    trail += `<path class="road-shadow" d="${d}"/><path class="road-rim" d="${d}"/><path class="road" d="${d}"/><path class="ribbon ${done ? 'done' : ''}" d="${d}"/><path class="stitches" d="${d}"/>`;
  }
  // Standalone flowers have a clear silhouette; ground details stay below the leaves.
  for (let i = 0; i < levels.length; i += 2) {
    const y = pos(i).y - 10;
    const flip = i % 4 === 0;
    scenery += `<g transform="translate(${flip ? 7 : 80} ${y})">
      <ellipse cx="7" cy="15" rx="8" ry="2.2" fill="#589b31" opacity=".2"/>
      <path d="M7 13V-5" fill="none" stroke="#378c35" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M6.6 7.5C2.5 7.5-.5 4.5 0 1C4 .8 6.5 4 6.6 7.5Z" fill="#80cf3c" stroke="#469b34" stroke-width=".55"/>
      <path d="M7.4 3.5C11.5 3.5 14-0.5 13.5-3C9.5-2.8 7.5.1 7.4 3.5Z" fill="#9cde48" stroke="#469b34" stroke-width=".55"/>
      <path d="m1.5 2.6 4.2 3.7m6.2-7.5L8.3 2" fill="none" stroke="#c6ef75" stroke-width=".45" stroke-linecap="round"/>
      <g transform="translate(7 -8)" fill="${flip ? '#ff76a7' : '#fff092'}" stroke="${flip ? '#d64d82' : '#e5af36'}" stroke-width=".55">
        <path d="M-2-2C-7-9 2-12 3-5C9-8 12 0 5 2C10 8 2 12 0 5C-6 10-11 3-5 0C-9-4-5-7-2-2Z"/>
        <circle r="2.8" fill="#ffd53e" stroke="#df9d26"/>
        <path d="M-1.5-1a1.7 1.7 0 0 1 2-.8" fill="none" stroke="#fff5ab" stroke-width=".7" stroke-linecap="round"/>
      </g>
      <path d="M2 14q-1-3-3-3m3 3q0-3 2-4m7 5q0-3 2-4" fill="none" stroke="#64b337" stroke-width=".65" stroke-linecap="round"/>
      <ellipse cx="17" cy="15" rx="2.1" ry="1.2" fill="#c6b586"/>
      <ellipse cx="16.7" cy="14.6" rx="1.6" ry=".7" fill="#f2e6bb"/>
    </g>`;
  }
  const wrap = document.createElement('div');
  wrap.className = 'lv-map-in';
  wrap.style.aspectRatio = `100 / ${H}`;
  wrap.innerHTML = `<svg class="lv-scenery" viewBox="0 0 100 ${H}" aria-hidden="true"><defs><pattern id="map-meadow" width="100" height="136" patternUnits="userSpaceOnUse"><path d="M0 0Q45 22 18 68T0 136Z" fill="#d5eaa2"/><path d="M100 0Q62 35 85 78T100 136Z" fill="#a3d66b"/><path d="M0 96Q22 82 30 103T0 125" fill="#e4efb4" opacity=".6"/><path d="m89 35 2-3m2 3 2-3M12 63l2-3m2 3 2-3" stroke="#fff9d1" stroke-width="1" stroke-linecap="round" opacity=".7"/></pattern></defs><path d="M0 0H100V${H}H0Z" fill="url(#map-meadow)"/></svg><svg class="lv-trail" viewBox="0 0 100 ${H}" aria-hidden="true">${trail}</svg><svg class="lv-scenery" viewBox="0 0 100 ${H}" aria-hidden="true">${scenery}</svg>`;
  levels.forEach((l, i) => {
    const locked = !isUnlocked(i);
    const stars = starsFor(progress, l.id);
    const b = document.createElement('button');
    const state = locked ? '' : stars >= 3 ? ' perfect' : stars > 0 ? ' partial' : '';
    b.className = `lv-node${locked ? ' locked' : ''}${state}${i === cur && !locked ? ' current' : ''}`;
    const p = pos(i);
    b.style.left = `${p.x}%`;
    b.style.top = `${(p.y / H) * 100}%`;
    b.setAttribute('aria-label', `Level ${l.id}${locked ? ', locked' : stars >= 3 ? ', completed with 3 stars' : stars > 0 ? `, ${stars} of 3 stars, replay for the missing ${3 - stars}` : ', not played yet'}`);
    b.innerHTML =
      (i === cur && !locked ? '<span class="lv-play-label">PLAY</span>' : '') +
      `<span class="lv-face"><span class="num">${l.id}</span></span>` +
      (l.difficulty === 'hard' ? '<span class="hard-tag lv-hard">HARD</span>' : '') +
      (locked
        ? lockSvg
        : `<span class="st">${[0, 1, 2].map((k) => STAR_SVG.replace('<svg', `<svg class="${k < stars ? 'on' : ''}"`)).join('')}</span>`);
    b.onclick = () => {
      if (locked) {
        b.classList.remove('shake');
        void b.offsetWidth;
        b.classList.add('shake');
        return;
      }
      audio.tap();
      enterLevel(i);
    };
    wrap.appendChild(b);
  });
  grid.appendChild(wrap);
}
function showLevels() {
  renderLevels();
  levelsEl.classList.remove('hidden');
  // open the map on the current level
  requestAnimationFrame(() => {
    const g = $('levels-grid');
    (g.querySelector('.lv-node.current') ?? g.querySelector('.lv-node'))?.scrollIntoView({ block: 'center' });
  });
}
function hideLevels() {
  levelsEl.classList.add('hidden');
}
$('home-level').addEventListener('click', () => {
  audio.unlock();
  audio.tap();
  showLevels();
});
$('levels-back').addEventListener('click', () => {
  audio.tap();
  hideLevels();
});
$('play-btn').addEventListener('click', () => {
  audio.unlock();
  audio.tap();
  enterLevel(continueIndex());
});
$('back-btn').addEventListener('click', () => {
  audio.tap();
  void returnToHome();
});

// ---- Settings ----
const panel = $('settings');
const note = $('settings-note');
const inputs = [...document.querySelectorAll('input[data-setting]')];
inputs.forEach((inp) => (inp.checked = !!settings[inp.dataset.setting]));

let settingsOpener = null;
function closeSettings() {
  audio.tap();
  panel.classList.add('hidden');
  settingsOpener?.focus();
}
for (const id of ['settings-btn', 'home-settings']) {
  $(id).addEventListener('click', () => {
    audio.unlock();
    audio.tap();
    note.textContent = '';
    settingsOpener = $(id);
    panel.classList.remove('hidden');
    $('settings-close').focus();
  });
}
$('settings-close').addEventListener('click', closeSettings);
// Delete account: two-tap confirm, then wipe all saved data and reload from scratch.
const delBtn = $('delete-account');
let delTimer = 0;
delBtn.addEventListener('click', () => {
  if (!delBtn.classList.contains('armed')) {
    delBtn.classList.add('armed');
    delBtn.textContent = 'Tap again to erase ALL progress';
    clearTimeout(delTimer);
    delTimer = setTimeout(() => { delBtn.classList.remove('armed'); delBtn.textContent = 'Delete account'; }, 4000);
    return;
  }
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('hexablow.') || k.startsWith('gardendoku.')) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
  location.reload();
});
panel.addEventListener('click', (e) => {
  if (e.target === panel) closeSettings();
});

panel.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeSettings(); }
  if (e.key === 'Tab') {
    const controls = [...panel.querySelectorAll('button, input')];
    const first = controls[0], last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

inputs.forEach((inp) =>
  inp.addEventListener('change', async () => {
    const name = inp.dataset.setting;
    settings[name] = inp.checked;
    note.textContent = '';

    if (name === 'notifications' && inp.checked) {
      if (!('Notification' in window)) {
        note.textContent = 'Notifications are not supported on this device.';
        settings.notifications = inp.checked = false;
      } else if (Notification.permission === 'default') {
        const p = await Notification.requestPermission();
        if (p !== 'granted') {
          note.textContent = 'Notifications are blocked in your browser settings.';
          settings.notifications = inp.checked = false;
        }
      } else if (Notification.permission === 'denied') {
        note.textContent = 'Notifications are blocked in your browser settings.';
        settings.notifications = inp.checked = false;
      }
    }

    saveSettings(settings);
    if (name === 'music') audio.syncMusic();
    if (name === 'hints') hint.reset();
    audio.tap();
    if (name === 'vibration') vibrate(settings, 20);
  })
);

// Browsers only allow audio after a gesture.
window.addEventListener('pointerdown', () => audio.unlock(), { once: false });

// debug handle (handy for testing)
window.__hexablow = { game, levels, startLevel, progress, resetProgress: () => resetProgress(progress) };

applyCosmetics();
showHome();
// very first launch: jump straight into level 1
if (!hasOpenedLevel() && completedCount(progress) === 0) {
  hideHome();
  startLevel(0);
  playLevelIntro();
}

// ---- Debug level picker: press ` (backtick) to toggle ----
// "Unlock all" needs a save; progress.js keeps save() private, so earn(0) triggers one.
const saveProgressNow = () => earn(progress, 0);
const dbg = document.createElement('div');
dbg.id = 'debug-levels';
dbg.style.cssText =
  'position:fixed;top:8px;left:8px;z-index:50;background:rgba(60,30,8,.92);color:#fff4df;' +
  'padding:10px;border-radius:12px;font:600 13px/1.3 system-ui,sans-serif;max-width:260px;';
function renderDebug() {
  dbg.innerHTML = '<div style="margin-bottom:6px;opacity:.8">DEBUG · levels (` to close)</div>';
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:4px;';
  levels.forEach((l, i) => {
    const b = document.createElement('button');
    b.textContent = l.id;
    b.title = `${l.cells.length} cells`;
    b.style.cssText =
      'padding:6px 0;border:0;border-radius:6px;cursor:pointer;font:inherit;' +
      (i === levelIndex ? 'background:#f5c84b;color:#482009;' : 'background:#8a5a2b;color:#fff4df;');
    b.onclick = () => {
      startLevel(i);
      renderDebug();
    };
    grid.appendChild(b);
  });
  dbg.appendChild(grid);

  // ---- cheats ----
  const row = (label, buttons) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:8px;';
    wrap.innerHTML = `<div style="opacity:.7;font-size:11px;margin-bottom:3px">${label}</div>`;
    const r = document.createElement('div');
    r.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
    for (const [text, fn, color] of buttons) {
      const b = document.createElement('button');
      b.textContent = text;
      b.style.cssText =
        `padding:6px 8px;border:0;border-radius:6px;cursor:pointer;font:inherit;background:${color || '#8a5a2b'};color:#fff4df;`;
      b.onclick = () => {
        fn();
        renderDebug();
      };
      r.appendChild(b);
    }
    wrap.appendChild(r);
    dbg.appendChild(wrap);
  };
  const inLevel = () => home.classList.contains('hidden') && result.classList.contains('hidden');
  const debugWin = (stars) => {
    if (!inLevel()) startLevel(levelIndex);
    heartsLeft = stars;
    game.locked = true;
    game.hooks.onWinStart();
    game.hooks.onWin();
  };
  const debugLose = () => {
    if (!inLevel()) startLevel(levelIndex);
    game.hearts = 0;
    heartsLeft = 0;
    renderHearts(0, true);
    game.locked = true;
    game.hooks.onFail();
  };
  const afterDaily = () => { renderDailyBadge(); if (dailyPop) renderDaily(); };
  row(`Daily gifts · ${todayStr()} · streak ${dailyStatus(progress).streak}`, [
    ['Next day', () => { debugShiftDaily(progress, 1); afterDaily(); }, '#3f7d3a'],
    ['Miss a day', () => { debugShiftDaily(progress, 2); afterDaily(); }, '#a8483a'],
    ['Reset', () => { debugResetDaily(progress); afterDaily(); }],
  ]);
  row('Coins', [
    ['+100', () => { earn(progress, 100); renderCoins(); }],
    ['+1000', () => { earn(progress, 1000); renderCoins(); }],
    ['+10000', () => { earn(progress, 10000); renderCoins(); }],
  ]);
  row('Boosters', [
    ['+3 each', () => { boosterIds.forEach((id) => grantBooster(progress, id, 3)); renderBoosters(); }],
    ['Clear', () => { boosterIds.forEach((id) => { progress.boosters[id] = 0; }); saveProgressNow(); renderBoosters(); }],
    [`Auto-buy: ${debugAutoBuy ? 'ON' : 'OFF'}`, () => {
      debugAutoBuy = !debugAutoBuy;
      try { localStorage.setItem(DEBUG_AUTOBUY_KEY, debugAutoBuy ? '1' : '0'); } catch { /* ignore */ }
    }, debugAutoBuy ? '#3f7d3a' : '#8a5a2b'],
  ]);
  row('Auto-solve', [
    ['Place next', () => game.autoPlaceNext()],
    [`Auto-play: ${debugAutoPlay ? 'ON' : 'OFF'}`, () => {
      debugAutoPlay = !debugAutoPlay;
      clearInterval(debugAutoTimer);
      if (debugAutoPlay) debugAutoTimer = setInterval(() => { if (!game.pieces.length) { debugAutoPlay = false; clearInterval(debugAutoTimer); renderDebug(); } else game.autoPlaceNext(); }, 650);
    }, debugAutoPlay ? '#3f7d3a' : '#8a5a2b'],
  ]);
  row('Instant win (stars)', [
    ['★', () => debugWin(1), '#3f7d3a'],
    ['★★', () => debugWin(2), '#3f7d3a'],
    ['★★★', () => debugWin(3), '#3f7d3a'],
  ]);
  row('Result', [['Instant lose', debugLose, '#a8402e']]);
  row('Progress', [
    ['Unlock all', () => { levels.forEach((l) => { if (!starsFor(progress, l.id)) progress.stars[l.id] = 1; }); saveProgressNow(); }],
    ['Reset progress', () => {
      resetProgress(progress);
      saveLevelIndex(0);
      levelIndex = 0;
      renderCoins();
      applyCosmetics();
      hideLevels();
      shopEl.classList.add('hidden');
      showHome();
    }, '#a8402e'],
  ]);

  const info = document.createElement('div');
  info.style.cssText = 'margin-top:6px;opacity:.8';
  info.textContent = `Now: ${levels[levelIndex].name} · ${levels[levelIndex].cells.length} cells · 🪙 ${coinsOf(progress)} · ★ ${totalStars(progress)} · ${boosterIds.map((id) => `${id} ${boosterCount(progress, id)}`).join(' / ')}`;
  dbg.appendChild(info);
}
dbg.style.display = 'none';
document.body.appendChild(dbg);
window.addEventListener('keydown', (e) => {
  if (e.key === '`' || e.code === 'Backquote') {
    e.preventDefault();
    dbg.style.display = dbg.style.display === 'none' ? '' : 'none';
    if (dbg.style.display !== 'none') renderDebug();
  } else if (dbg.style.display !== 'none' && (e.key === '[' || e.key === ']')) {
    const i = Math.max(0, Math.min(levels.length - 1, levelIndex + (e.key === ']' ? 1 : -1)));
    startLevel(i);
    renderDebug();
  }
});
