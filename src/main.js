import './style.css';
import { boosterArt } from './boosterArt.js';
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
import { collectionSets, collectionSpecies, speciesOfSet, setProgress, hasSpecies, foundCount, discoverForLevel } from './progress.js';
import { boosterIds, boosterCount, buyBooster, useBooster, packPrice, grantBooster } from './progress.js';
import { loadProgress, recordWin, starsFor, totalStars, completedCount, resetProgress, coinsOf, canAfford, spend, earn, winReward } from './progress.js';

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
  const theme = equippedItem(progress, 'theme');
  game.setTileSkin(tile);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(`--${k}`, v);
  root.style.setProperty('--bg', theme.game);
  root.style.setProperty('--sub-ink', theme.vars['sub-ink']);
  game.setBackground(theme.game);
  game.setSocketSkin(theme.socket);
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
  coinHud.style.top = `${s.top - st.top + (s.height - 36) / 2}px`;
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
  .map((id) => `<button type="button" class="boost" data-boost="${id}" data-id="${id}" aria-label="${BOOSTERS[id].name}">
      <span class="b-ic">${boosterArt[id]}</span><span class="b-nm">${BOOSTERS[id].name}</span><i class="b-badge"></i>
      <svg class="b-lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>
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
function openBuyPop(id) {
  buyingId = id;
  const cfg = BOOSTERS[id];
  const pack = BOOSTERS.packSize;
  const packCost = packPrice(id);
  const saving = Math.round((1 - BOOSTERS.packDiscount) * 100);
  buyCard.innerHTML =
    `<h3 id="buy-title">Add ${cfg.name}</h3>
     <button class="buy-x" type="button" aria-label="Close">×</button>
     <div class="buy-showcase"><div class="buy-ic b-${id}">${boosterArt[id]}</div><span class="buy-spark" aria-hidden="true">✦</span></div>
     <p class="buy-desc">${cfg.desc}</p>
     <p class="buy-have">You have <b>${boosterCount(progress, id)}</b> · ${COIN} <b>${coinsOf(progress)}</b></p>
     <div class="buy-actions">
       <button class="buy-opt" type="button" data-qty="1"><span>Buy ×1</span><em>${COIN} ${cfg.price}</em></button>
       <button class="buy-opt best" type="button" data-qty="${pack}"><span>Buy ×${pack}</span><em>${COIN} ${packCost}</em><small>Save ${saving}%</small></button>
     </div>`;
  buyCard.querySelectorAll('.buy-opt').forEach((btn) => {
    const qty = Number(btn.dataset.qty);
    const cost = qty === pack ? packCost : cfg.price * qty;
    btn.classList.toggle('poor', !canAfford(progress, cost));
    btn.onclick = () => {
      if (!buyBooster(progress, id, qty)) return shakeEl(btn);
      audio.tap();
      closeBuyPop();
      renderCoins();
    };
  });
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
let resultTimers = [];
const later = (fn, ms) => resultTimers.push(setTimeout(fn, ms));

/** Close the result screen and give the board back to normal play. Safe to call any time. */
function leaveResult() {
  resultTimers.forEach(clearTimeout);
  resultTimers = [];
  result.classList.add('hidden');
  $('res-find').classList.add('hidden');
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
  $('res-reward').innerHTML = o.win ? `<strong>${COIN} +${o.reward}</strong>` : '';
  home.innerHTML = `${HOME_SVG}${o.win ? '' : '<span>Home</span>'}`;
  if (o.win) confetti($('res-confetti'));
  else $('res-confetti').innerHTML = '';
  btn.disabled = false;
  if (o.win) {
    btn.innerHTML = '<span>Continue</span><span aria-hidden="true">›</span>';
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
    home.classList.remove('hidden');
    home.onclick = () => { audio.tap(); o.onHome(); };
  } else {
    btn.textContent = '↻  Try again';
    btn.classList.add('alt');
    btn.onclick = () => { audio.tap(); o.onRetry(); };
    rev.classList.remove('hidden');
    rev.innerHTML = `<span>Keep growing</span><em>${economy.costs.revive} ${COIN}</em>`;
    rev.disabled = !canAfford(progress, economy.costs.revive);
    rev.title = rev.disabled ? `Revive needs ${economy.costs.revive} coins` : '';
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
  if (o.win && o.find?.species) later(() => showFind(o.find), 1500);
}

/** Reward-style reveal for a newly discovered species: dim backdrop, glowing rays, big bounce-in icon. */
function showFind({ species, set, bonus }) {
  const { have, total } = setProgress(progress, set.id);
  const pips = Array.from({ length: total }, (_, i) => `<i class="${i < have ? 'on' : ''}"></i>`).join('');
  const el = $('res-find');
  el.innerHTML =
    '<div class="fp-card">' +
    '<div class="fp-rays"></div>' +
    '<span class="fp-new">NEW!</span>' +
    `<div class="fp-ic">${species.icon}</div>` +
    `<h4>${species.name}</h4>` +
    `<p class="fp-set">${set.name} collection</p>` +
    `<div class="fp-pips" aria-label="${have} of ${total}">${pips}</div>` +
    (bonus ? `<div class="fp-bonus">Set complete! ${COIN} +${bonus}</div>` : '') +
    '<button class="claim-btn fp-btn">Collect</button>' +
    '</div>';
  el.classList.remove('hidden', 'out');
  confetti($('res-confetti'));
  audio.win();
  el.querySelector('.fp-btn').onclick = () => {
    audio.tap();
    el.classList.add('out');
    later(() => el.classList.add('hidden'), 260);
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
    vibrate(settings, 12);
    praise.hit(pos, count, isLast);
  },
  onMistake: () => {
    praise.miss();
    audio.wrong();
    vibrate(settings, 60);
  },
  onWinStart: () => {
    audio.setLowHealth(false);
    const stars = Math.max(1, heartsLeft);
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
      find,
      sub: `<b>${levels[levelIdx].name}</b> · ${praise} · ${note}`,
      next: last ? 'You grew every garden!' : `Next: ${levels[levelIdx + 1].name}`,
      onClaim: () => { startLevel(last ? 0 : levelIdx + 1); playLevelIntro(); },
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
        if (spend(progress, economy.costs.revive)) {
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
  kind: 'place', // 'place' (level 1) | 'booster' (levels that unlock a booster)
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
    this.kind = bid ? 'booster' : jump ? 'jump' : 'place';
    this.booster = bid ?? null;
    if (jump) {
      this.steps = [0];
      this.jumpSteps = [[1, 2], [3, 4], [6, 5]]; // [number to tap, neighbour the list jumps to]
      this.jumpIdx = 0;
      this.jumpPhase = 'tap';
      this.jumpSteps = [[1, 2], [3, 4], [6, 5]]; // [number to tap, neighbour the list jumps to]
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
    this.el.classList.toggle('hidden', !this.active);
    stageEl.classList.toggle('tutorial-mode', this.active && !bid); // level 1 + level 2 hide the other UI
    for (const id of ['tut-from', 'tut-to', 'tut-hand']) $(id).style.display = '';
    this.t0 = performance.now();
    if (this.active && !this.running) {
      this.running = true;
      this.tick();
    }
  },
  stop() {
    this.active = false;
    this.running = false;
    this.el.classList.add('hidden');
    stageEl.classList.remove('tutorial-mode');
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
// 1) a hand asks the player to tap a number on the grid  2) the list jumps to the tile  3) hand drags it in.
const NOT_PLAYING = '.result-mode, :has(#home:not(.hidden)), :has(#levels:not(.hidden)), :has(#shop:not(.hidden)), :has(#album:not(.hidden)), :has(#settings:not(.hidden))';
const hint = {
  active: false,
  phase: 'tap', // 'tap' (tap a grid number) | 'focus' (drag the tile in)
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
    const info = pickHint(game.level, game.placed, game.pieces);
    if (!info) { this.last = performance.now(); return; }
    game._jumpFrom = null; // so the first tap on the grid number lands on the hinted tile
    this.info = info;
    this.phase = game.maxScroll > 0 ? 'tap' : 'focus'; // nothing to scroll: go straight to showing the tile
    this.active = true;
    tut.el.classList.add('hint-mode');
    tut.el.classList.remove('hidden');
    this.t0 = performance.now();
    if (!this.running) { this.running = true; this.tick(); }
  },
  tick() {
    if (!this.active) { this.running = false; return; }
    this.render();
    requestAnimationFrame(() => this.tick());
  },
  /** The list jumped after a tap on grid number n; `to` is the first number of the tile it landed on. */
  cellJumped(n, to) {
    if (this.active && this.phase === 'tap' && n === this.info.tapNumber && to === this.info.piece.numbers[0]) {
      this.phase = 'focus';
      this.t0 = performance.now();
    }
  },
  /** Only the hand: on the grid number to tap, then dragging the tile from the list to its cell. */
  render() {
    const { piece, tapCell } = this.info;
    const hand = $('tut-hand');
    hand.style.display = '';
    if (this.phase === 'tap') {
      const s = game._cellScreen(tapCell[0], tapCell[1]);
      const bob = Math.sin(performance.now() / 180) * 6;
      hand.style.transform = `translate(${s.x - 14}px, ${s.y - 4 + bob}px)`;
      hand.style.opacity = '1';
      return;
    }
    const info = game.tutorialInfo(piece.numbers[0]);
    if (!info) return; // mid-drag
    const k = ((performance.now() - this.t0) % 1800) / 1800;
    const e = Math.min(1, k / 0.7);
    const sm = e * e * (3 - 2 * e);
    hand.style.transform = `translate(${info.from.x + (info.to.x - info.from.x) * sm - 14}px, ${info.from.y + (info.to.y - info.from.y) * sm - 4}px)`;
    hand.style.opacity = k > 0.9 ? String((1 - k) * 10) : '1';
  },
};
setInterval(() => hint.check(), 400);

function startLevel(i) {
  pendingWin = null;
  leaveResult();
  boostBar.classList.remove('hidden');
  levelIndex = i;
  saveLevelIndex(i);
  const level = levels[i];
  $('level-name').textContent = level.name;
  // levels 1-2 keep an ascending tray order (gentle start); from level 3 the tray is shuffled each play
  praise.reset();
  const bare = level.id <= 2 && starsFor(progress, level.id) === 0; // levels 1-2 until first cleared: no top bar, no boosters
  stageEl.classList.toggle('bare-level', bare);
  game.loadLevel(level, { randomOrder: level.id > 2, bare });
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
    animate(home.querySelector('.h-brand'), [{ opacity:0, translate:'0 -24px' }, { opacity:1, translate:'0 0' }], 380);
    animate(home.querySelector('.h-hero'), [{ opacity:0, scale:'.92' }, { opacity:1, scale:'1' }], 420, 40);
    animate(home.querySelector('.h-actions'), [{ opacity:0, translate:'0 24px' }, { opacity:1, translate:'0 0' }], 360, 90);
    animate(stageEl.querySelector('.home-nav'), [{ opacity:0, translate:'0 60%' }, { opacity:1, translate:'0 0' }], 520, 120);
    for (const el of home.querySelectorAll('.h-gear')) {
      animate(el, [{ opacity:0, scale:'.8' }, { opacity:1, scale:'1' }], 300, 80);
    }
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
function enterLevel(i) {
  if (entering || returningHome) return;
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
  if (item.type === 'tile') {
    const id = `sw-${item.id}`;
    return `<svg class="sw" viewBox="-40 -40 80 80"><defs><linearGradient id="${id}-f" x2="0" y2="1"><stop stop-color="${item.face[0]}"/><stop offset="1" stop-color="${item.face[1]}"/></linearGradient></defs><polygon points="0,-34 29,-17 29,17 0,34 -29,17 -29,-17" fill="${item.base}" transform="translate(0 4)"/><polygon points="0,-34 29,-17 29,17 0,34 -29,17 -29,-17" fill="url(#${id}-f)" stroke="${item.rim[0]}" stroke-width="3"/><text y="9" text-anchor="middle" font-size="26" font-weight="800" fill="#7a3d12" font-family="Nunito,sans-serif">7</text></svg>`;
  }
  const v = item.vars;
  return `<div class="sw sw-theme" style="background:linear-gradient(${v['sky-a']},${v['sky-b']} 55%,${v['sky-c']})"><i style="background:${v['hill-2a']}"></i><b style="background:${v['hill-3']}"></b></div>`;
}
function renderShop() {
  $('shop-coins').textContent = coinsOf(progress);
  const body = $('shop-body');
  body.innerHTML = '';
  for (const [type, title] of [['tile', 'Tile colours'], ['theme', 'Backgrounds']]) {
    const h = document.createElement('h3');
    h.textContent = title;
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
    h.innerHTML = `${set.name} <small>${have}/${total}${have === total ? ' ✓' : ` · bonus ${set.bonus}`}</small>`;
    if (have < total) h.querySelector('small').insertAdjacentHTML('beforeend', ` ${COIN}`);
    body.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'album-grid';
    for (const sp of speciesOfSet(set.id)) {
      const got = hasSpecies(progress, sp.id);
      const card = document.createElement('div');
      card.className = `album-card${got ? '' : ' unknown'}`;
      card.setAttribute('aria-label', got ? sp.name : `Undiscovered, clear level ${sp.level}`);
      card.innerHTML = `<span class="ic" aria-hidden="true">${sp.icon}</span><span class="nm">${got ? sp.name : `Level ${sp.level}`}</span>`;
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }
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
}
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
function renderLevels() {
  const cur = continueIndex();
  $('levels-stars').textContent = `★ ${totalStars(progress)}/${levels.length * 3}`;
  const grid = $('levels-grid');
  grid.innerHTML = '';
  levels.forEach((l, i) => {
    const locked = !isUnlocked(i);
    const stars = starsFor(progress, l.id);
    const b = document.createElement('button');
    const state = locked ? '' : stars >= 3 ? ' perfect' : stars > 0 ? ' partial' : '';
    b.className = `lv-card${locked ? ' locked' : ''}${state}${i === cur && !locked ? ' current' : ''}`;
    b.setAttribute('aria-label', `Level ${l.id}${locked ? ', locked' : stars >= 3 ? ', completed with 3 stars' : `, ${stars} of 3 stars, replay for the missing ${3 - stars}`}`);
    const badge = locked ? '' : stars >= 3
      ? '<span class="badge ok" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>'
      : stars > 0 ? `<span class="badge miss" aria-hidden="true">+${3 - stars}★</span>` : '';
    b.innerHTML =
      badge +
      `<span class="num">${l.id}</span>` +
      (locked
        ? lockSvg
        : `<span class="st">${[0, 1, 2].map((k) => STAR_SVG.replace('<svg', `<svg class="${k < stars ? 'on' : ''}"`)).join('')}</span>`) +
      `<span class="cells">${l.cells.length} cells</span>`;
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
    grid.appendChild(b);
  });
}
function showLevels() {
  renderLevels();
  levelsEl.classList.remove('hidden');
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
