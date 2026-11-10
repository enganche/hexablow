import './style.css';
import levels from './levels.json';
import { Game } from './game.js';
import { AudioManager, vibrate } from './audio.js';
import { loadSettings, saveSettings, loadLevelIndex, saveLevelIndex } from './settings.js';
import economy from './economy.json';
import { cosmeticItems, isOwned, equippedItem, buyItem, equipItem } from './progress.js';
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

// ---- Result card ----
const result = $('result');
const STAR_SVG =
  '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>';
let heartsLeft = 3;

function showResult({ win, stars = 0, note = '', reward = 0, title, text, button, onClick, onRevive }) {
  result.classList.toggle('win', win);
  result.classList.toggle('fail', !win);
  $('result-stars').innerHTML = win
    ? Array.from({ length: 3 }, (_, i) =>
        `<span class="star${i < stars ? ' on' : ''}" style="--i:${i}">${STAR_SVG}</span>`).join('')
    : `<span class="broken">${HEART_SVG}</span>`;
  $('result-title').textContent = title;
  $('result-text').textContent = text;
  $('result-stats').innerHTML = win
    ? `<span>Hearts left <b>${heartsLeft}/3</b></span>${note ? ` · <span>${note}</span>` : ''}${reward ? `<div class="reward">+${reward} ${COIN}</div>` : ''}`
    : '';
  const close = (fn) => () => {
    result.classList.add('hidden');
    audio.tap();
    fn();
  };
  $('result-btn').textContent = button;
  $('result-btn').onclick = close(onClick);
  $('result-replay').classList.toggle('hidden', !win);
  const rev = $('result-revive');
  rev.classList.toggle('hidden', win || !onRevive);
  if (onRevive) {
    rev.innerHTML = `Revive · ${economy.costs.revive} ${COIN}`;
    rev.disabled = !canAfford(progress, economy.costs.revive);
    rev.onclick = close(onRevive);
  }
  $('result-replay').onclick = close(() => startLevel(levelIndex));
  $('result-home').onclick = close(showHome);
  result.classList.remove('hidden');
}

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
  onWin: () => {
    audio.win();
    vibrate(settings, [20, 40, 20]);
    const last = levelIndex === levels.length - 1;
    const stars = Math.max(1, heartsLeft);
    const rec = recordWin(progress, levels[levelIndex].id, stars);
    const reward = winReward(stars, rec.firstClear);
    earn(progress, reward);
    renderCoins();
    const note = rec.firstClear ? 'First clear!' : rec.isNewBest ? '<b>New best!</b>' : `Best <b>${rec.best}★</b>`;
    // "Play" on the home screen continues from the next level
    if (levelIndex < levels.length - 1) saveLevelIndex(levelIndex + 1);
    showResult({
      win: true,
      stars,
      note,
      reward,
      title: last ? 'All levels complete!' : 'Level complete!',
      text: last
        ? `You finished all ${levels.length} levels.`
        : `${levels[levelIndex].name} solved. ${['', 'Good job!', 'Great!', 'Perfect!'][stars]}`,
      button: last ? 'Play again' : 'Next level',
      onClick: () => startLevel(last ? 0 : levelIndex + 1),
    });
  },
  onFail: () => {
    tut.stop();
    showResult({
      win: false,
      title: 'Out of hearts',
      text: 'So close! Give it another try.',
      onRevive: () => {
        if (spend(progress, economy.costs.revive)) {
          game.revive();
          renderCoins();
        }
      },
      button: 'Retry',
      onClick: () => startLevel(levelIndex),
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
    this.steps = level.id === 1 ? Object.keys(level.solution).map(Number).filter((n) => !level.givens[n]) : [];
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
  result.classList.add('hidden');
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
    b.className = `lv-card${locked ? ' locked' : ''}${i === cur && !locked ? ' current' : ''}`;
    b.setAttribute('aria-label', `Level ${l.id}${locked ? ', locked' : `, ${stars} of 3 stars`}`);
    b.innerHTML =
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

for (const id of ['settings-btn', 'home-settings']) {
  $(id).addEventListener('click', () => {
    audio.unlock();
    audio.tap();
    note.textContent = '';
    panel.classList.remove('hidden');
  });
}
$('settings-close').addEventListener('click', () => {
  audio.tap();
  panel.classList.add('hidden');
});
panel.addEventListener('click', (e) => {
  if (e.target === panel) panel.classList.add('hidden');
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

// ---- Debug level picker: press ` (backtick) to toggle ----
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
      result.classList.add('hidden');
      startLevel(i);
      renderDebug();
    };
    grid.appendChild(b);
  });
  dbg.appendChild(grid);
  const info = document.createElement('div');
  info.style.cssText = 'margin-top:6px;opacity:.8';
  info.textContent = `Now: ${levels[levelIndex].name} · ${levels[levelIndex].cells.length} cells`;
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
    result.classList.add('hidden');
    startLevel(i);
    renderDebug();
  }
});
