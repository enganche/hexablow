import './style.css';
import levels from './levels.json';
import { Game } from './game.js';
import { AudioManager, vibrate } from './audio.js';
import { loadSettings, saveSettings, loadLevelIndex, saveLevelIndex, hasOpenedLevel } from './settings.js';
import economy from './economy.json';
import { winArt, loseArt, confetti } from './resultArt.js';
import { cosmeticItems, isOwned, equippedItem, buyItem, equipItem } from './progress.js';
import { collectionSets, collectionSpecies, speciesOfSet, setProgress, hasSpecies, foundCount, discoverForLevel } from './progress.js';
import { loadProgress, recordWin, starsFor, totalStars, completedCount, resetProgress, coinsOf, canAfford, spend, earn, winReward } from './progress.js';

const $ = (id) => document.getElementById(id);

const settings = loadSettings();
const audio = new AudioManager(() => settings);
let levelIndex = loadLevelIndex(levels.length);
const progress = loadProgress();

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
const toolbar = $('toolbar');
function renderCoins() {
  $('coin-count').textContent = coinsOf(progress);
  $('hint-cost').textContent = economy.costs.hint;
  $('hint-btn').classList.toggle('poor', !canAfford(progress, economy.costs.hint));
}
function shakeCoins() {
  const pill = document.querySelector('.coin-pill');
  pill.classList.remove('shake');
  void pill.offsetWidth;
  pill.classList.add('shake');
}
$('hint-btn').addEventListener('click', () => {
  const cost = economy.costs.hint;
  if (!canAfford(progress, cost)) return shakeCoins();
  if (!game.hint()) return;
  spend(progress, cost);
  audio.tap();
  renderCoins();
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

// ---- Game ----
const game = new Game($('game'), {
  getSettings: () => settings,
  onLayout: ({ trayTop }) => {
    toolbar.style.top = `${trayTop - 46}px`;
  },
  onHearts: (left, lostOne) => {
    heartsLeft = left;
    renderHearts(left, lostOne);
  },
  onPlace: (count) => {
    audio.place(count);
    vibrate(settings, 12);
  },
  onMistake: () => {
    audio.wrong();
    vibrate(settings, 60);
  },
  onWinStart: () => {
    audio.win();
    vibrate(settings, [20, 40, 20]);
    tut.stop();
    const last = levelIndex === levels.length - 1;
    const stars = Math.max(1, heartsLeft);
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
      onClaim: () => startLevel(last ? 0 : levelIdx + 1),
      onHome: showHome,
    });
  },
  onFail: () => {
    tut.stop();
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
      onRetry: () => startLevel(levelIndex),
      onHome: showHome,
    });
  },
});

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
  start(level) {
    // only teach until level 1 has been cleared once; replays skip the tutorial
    this.steps = level.id === 1 && starsFor(progress, level.id) === 0 ? Object.keys(level.solution).map(Number).filter((n) => !level.givens[n]) : [];
    this.active = this.steps.length > 0;
    this.el.classList.toggle('hidden', !this.active);
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
  },
  tick() {
    if (!this.active) { this.running = false; return; }
    this.render();
    requestAnimationFrame(() => this.tick());
  },
  render() {
    const todo = this.steps.filter((n) => !game.placed.has(n));
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

function startLevel(i) {
  pendingWin = null;
  leaveResult();
  toolbar.classList.remove('hidden');
  renderCoins();
  levelIndex = i;
  saveLevelIndex(i);
  const level = levels[i];
  $('level-name').textContent = level.name;
  // level 1 keeps its fixed tray order (tutorial); later levels shuffle the tray randomly
  game.loadLevel(level, { randomOrder: level.id !== 1 });
  tut.start(level);
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
  toolbar.classList.add('hidden');
  leaveResult();
  const cur = continueIndex();
  $('home-level').textContent = `${levels[cur].name} · ★ ${totalStars(progress)}/${levels.length * 3}`;
  $('play-btn').querySelector('span').textContent = completedCount(progress) === 0 && cur === 0 ? 'Play' : 'Continue';
  home.classList.remove('hidden');
}
function hideHome() {
  home.classList.add('hidden');
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
  renderShop();
  shopEl.classList.remove('hidden');
});
$('shop-back').addEventListener('click', () => {
  audio.tap();
  shopEl.classList.add('hidden');
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
  renderAlbum();
  albumEl.classList.remove('hidden');
});
$('album-back').addEventListener('click', () => {
  audio.tap();
  albumEl.classList.add('hidden');
});

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
      hideLevels();
      hideHome();
      startLevel(i);
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
  startLevel(continueIndex());
  hideHome();
});
$('back-btn').addEventListener('click', () => {
  audio.tap();
  showHome();
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
    if (name === 'hints') game.refreshHints();
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
  startLevel(0);
  hideHome();
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
  info.textContent = `Now: ${levels[levelIndex].name} · ${levels[levelIndex].cells.length} cells · 🪙 ${coinsOf(progress)} · ★ ${totalStars(progress)}`;
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
