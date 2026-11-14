// Debug "human" bot: plays the real game through the real UI like a normal player, so it exercises the tutorials,
// the intro screens, the result screens and the Next / Continue buttons (not just the engine).
//   - presses buttons with click(), moves tiles with synthetic pointer events on the canvas (tap-to-jump, drag, drop)
//   - follows each lesson (level 1 place, level 2 tap-to-jump, level 3 hearts spotlight, booster lessons)
//   - elsewhere it plays the way the auto hint suggests: easiest tile first, found with tap-to-jump, with a small
//     chance of a wrong drop (more careful at 1 heart), "thinks" for a moment before each move
//   - clicks away popups (daily gift, reward, mechanic intro, album) and presses Continue / Try again
// Not a solver: it reads the solution only to know where a deduced tile goes (a player would work that out).
import { pickHint } from './hint.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);

export function createHumanBot({ game, tut, $, onChange, lastLevelId }) {
  const bot = {
    running: false,
    speed: 4, // 1 = human pace, bigger = faster
    mistakeRate: 0.07,
    log: [],
    levels: [], // one row per attempt: { id, result, hearts, mistakes, ms, tut }
    counts: { taps: 0, drags: 0, jumps: 0, scrollFallback: 0, popups: 0, wrongDrops: 0 },
    last: '',
  };
  let busy = false;
  let timer = 0;
  let cur = null; // current attempt
  let lastProgressAt = 0;
  let lastSig = '';
  let pendingIntro = ''; // intro screen seen right before the next attempt

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms / bot.speed));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)); // UI animations do not speed up with the bot
  const say = (msg) => {
    bot.last = msg;
    bot.log.push(`${((performance.now() - t0) / 1000).toFixed(1)}s  ${msg}`);
    if (bot.log.length > 400) bot.log.shift();
    onChange?.();
  };
  let t0 = performance.now();

  const shown = (el) => !!el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none';
  const canvasRect = () => game.canvas.getBoundingClientRect();
  const ptr = (type, x, y) => {
    const r = canvasRect();
    game.canvas.dispatchEvent(new PointerEvent(type, { clientX: r.left + x, clientY: r.top + y, pointerId: 99, isPrimary: true, bubbles: true, cancelable: true }));
  };
  async function tapAt(x, y) {
    bot.counts.taps++;
    ptr('pointerdown', x, y);
    await sleep(70);
    ptr('pointerup', x, y);
  }
  async function dragFromTo(from, to) {
    bot.counts.drags++;
    ptr('pointerdown', from.x, from.y);
    await sleep(60);
    const steps = 9;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      ptr('pointermove', from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
      await sleep(28);
    }
    await sleep(120);
    ptr('pointerup', to.x, to.y);
  }
  const click = (el) => {
    bot.counts.popups++;
    el.click();
  };

  // ---------------------------------------------------------------- overlays and screens
  /** Returns true when it handled a screen (so the tick ends there). */
  async function handleScreens() {
    const dl = document.querySelector('.dl-pop');
    if (dl) {
      const claim = dl.querySelector('.dl-claim:not(:disabled)');
      const chest = dl.querySelector('.dl-chest.ready');
      await sleep(700);
      say(claim ? 'daily gift: Claim' : chest ? 'daily chest: open' : 'daily gift: close');
      click(claim ?? chest ?? dl.querySelector('.dl-x'));
      await wait(500);
      return true;
    }
    const reward = document.querySelector('.shop-pop button, .os-pop .os-cancel');
    if (reward) { await sleep(500); say('reward popup: Collect'); click(reward); await wait(400); return true; }
    const album = $('album-pop');
    if (shown(album) && album.querySelector('.fp-btn')) { await sleep(500); say('album claim'); click(album.querySelector('.fp-btn')); await wait(500); return true; }
    const intro = $('mech-intro');
    if (shown(intro) && intro.querySelector('.fp-btn')) {
      const title = intro.querySelector('h4')?.textContent;
      await sleep(1800); // reads it
      say(`intro screen "${title}": Got it`);
      pendingIntro = 'intro:' + title;
      click(intro.querySelector('.fp-btn'));
      await wait(700);
      return true;
    }
    const result = $('result');
    if (shown(result)) {
      if (!result.classList.contains('show-actions')) return true; // still animating
      const find = $('res-find');
      if (shown(find) && find.querySelector('.fp-btn')) { await sleep(900); say('stars intro: Got it'); click(find.querySelector('.fp-btn')); await wait(500); return true; }
      const win = result.dataset.outcome === 'win';
      const bar = $('res-unlock');
      await sleep(win ? 1500 : 600);
      const doneId = cur?.id;
      if (cur) finishAttempt(win ? 'win' : 'lose', win && shown(bar) ? bar.innerText.replace(/\s+/g, ' ') : '');
      say(win ? `Level complete → Continue${shown(bar) ? ` [unlock bar: ${bar.innerText.replace(/\s+/g, ' ')}]` : ''}` : 'Out of hearts → Try again');
      click($('result-btn'));
      await wait(1100);
      if (win && lastLevelId && doneId === lastLevelId) { say('all levels cleared'); bot.stop(); }
      return true;
    }
    if (shown($('home'))) {
      await sleep(500);
      say('home → Play / Continue');
      click($('play-btn'));
      await wait(1300);
      return true;
    }
    const levels = $('levels');
    if (shown(levels)) { say('level map open → back'); click($('levels-back')); await wait(500); return true; }
    return false;
  }

  function finishAttempt(result, note) {
    if (!cur) return;
    cur.result = result;
    cur.ms = Math.round(performance.now() - cur.t0);
    cur.tut = [...cur.tut].join(', ');
    cur.note = note || '';
    bot.levels.push(cur);
    cur = null;
  }

  // ---------------------------------------------------------------- playing
  const W = () => game.W;
  const pieceVisible = (p) => {
    const info = game.tutorialInfo(p.numbers[0]);
    return !!info && info.from.x > 18 && info.from.x < W() - 18;
  };
  /** Board number a player can tap to make the tray jump near piece p (n-1 or n+1 that is visible on the board). */
  const jumpNumber = (p) => {
    const visible = new Map();
    for (const [n, c] of Object.entries(game.level.givens)) if (!game._isHidden(Number(n))) visible.set(Number(n), c);
    for (const [n, c] of game.placed) visible.set(n, c);
    for (const n of p.numbers) for (const v of [n - 1, n + 1]) if (visible.has(v) && !p.numbers.includes(v)) return { v, c: visible.get(v) };
    return null;
  };
  async function ensureVisible(p) {
    for (let i = 0; i < 3 && !pieceVisible(p); i++) {
      const j = jumpNumber(p);
      if (!j) break;
      const s = game._cellScreen(j.c[0], j.c[1]);
      bot.counts.jumps++;
      await tapAt(s.x, s.y); // tap-to-jump (a second tap flips to the other neighbour)
      await sleep(520);
    }
    if (!pieceVisible(p)) {
      bot.counts.scrollFallback++;
      game.scroll = clamp(p.slotX - W() / 2, 0, game.maxScroll);
      game._positionTray();
      await sleep(250);
    }
  }
  async function placePiece(p, wrongSpot = null) {
    await ensureVisible(p);
    const info = game.tutorialInfo(p.numbers[0]);
    if (!info) return false;
    const target = wrongSpot ?? game.level.solution[p.numbers[0]];
    const s = game._cellScreen(target[0], target[1]);
    await dragFromTo(info.from, { x: s.x, y: s.y + game._dragLift() });
    return true;
  }

  /** A believable wrong drop: a legal-looking spot near the right one. */
  function wrongSpotFor(p) {
    const right = game.level.solution[p.numbers[0]];
    const spots = game._emptyCells()
      .filter(([q, r]) => !(q === right[0] && r === right[1]) && game._fits(game._pieceCells(p, [q, r])))
      .sort((a, b) => Math.hypot(a[0] - right[0], a[1] - right[1]) - Math.hypot(b[0] - right[0], b[1] - right[1]));
    const pool = spots.slice(0, 6);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  async function followLesson() {
    cur?.tut.add(tut.kind);
    if (tut.kind === 'hearts') {
      await sleep(1600); // reads the bubble; the lesson ends with the first touch
      return false;
    }
    if (tut.kind === 'place') {
      const t = tut.target();
      if (!t) { await sleep(200); return true; }
      const p = game.pieces.find((x) => x.numbers[0] === t.n);
      if (!p) return true;
      say(`tutorial: drag ${t.n} to its cell`);
      await sleep(900);
      await placePiece(p);
      return true;
    }
    if (tut.kind === 'jump') {
      const step = tut.jumpSteps[tut.jumpIdx];
      if (!step) return true;
      if (tut.jumpPhase === 'tap') {
        const c = game.level.givens[step[0]] ?? game.placed.get(step[0]);
        const s = game._cellScreen(c[0], c[1]);
        say(`tutorial: tap ${step[0]} (tray jumps)`);
        await sleep(900);
        bot.counts.jumps++;
        await tapAt(s.x, s.y);
        await sleep(700);
      } else {
        const p = game.pieces.find((x) => x.numbers[0] === step[1]);
        if (p) { say(`tutorial: drag ${step[1]} in`); await sleep(700); await placePiece(p); }
      }
      return true;
    }
    if (tut.kind === 'booster') {
      const phase = tut.boosterPhase();
      if (phase === 'tap') {
        say(`tutorial: press the ${tut.booster} booster`);
        await sleep(1000);
        click(document.querySelector(`.boost[data-id="${tut.booster}"]`));
      } else if (phase === 'cell') {
        const c = game.level.solution[game.pieces[0].numbers[0]];
        const s = game._cellScreen(c[0], c[1]);
        say('tutorial: tap the empty cell');
        await sleep(700);
        await tapAt(s.x, s.y);
      } else {
        const piv = game._trayPivot(game.pieces[0]);
        say('tutorial: pick the tile');
        await sleep(700);
        await tapAt(piv.x, piv.y);
      }
      await sleep(900);
      return true;
    }
    return false;
  }

  async function playMove() {
    const hearts = game.hearts;
    const hintInfo = pickHint(game.level, game.placed, game.pieces, { hidden: game.hiddenNumbers(), closed: game.closedLockKeys() });
    let p = hintInfo?.piece;
    if (!p) {
      // nothing to hook onto yet: a player deduces a tile from the gaps; take the lowest tile that is not behind a padlock
      p = [...game.pieces].filter((x) => !game._pieceLocked(x)).sort((a, b) => a.numbers[0] - b.numbers[0])[0];
    }
    if (!p) { await sleep(500); return; }
    await sleep(rnd(500, 1500)); // thinking
    const careless = !game.freeHearts && Math.random() < (hearts <= 1 ? 0.02 : bot.mistakeRate);
    if (careless) {
      const spot = wrongSpotFor(p);
      if (spot) {
        say(`drops ${p.numbers.join('+')} in the wrong place on purpose`);
        bot.counts.wrongDrops++;
        if (cur) cur.mistakes++;
        await placePiece(p, spot);
        await sleep(1600);
        return;
      }
    }
    say(`places ${p.numbers.join('+')}${hintInfo ? ` (hint count ${hintInfo.count})` : ' (deduced)'}`);
    await placePiece(p);
  }

  // ---------------------------------------------------------------- main tick
  async function tick() {
    if (busy || !bot.running) return;
    busy = true;
    try {
      if (await handleScreens()) return;
      if (!game.level || game.locked || game.resultMode || game.dragPiece) { await sleep(250); return; }
      if (!cur || cur.token !== game._winToken) {
        // loadLevel bumps _winToken: a new attempt (first load, next level or Try again)
        if (cur) finishAttempt('left', '');
        cur = { id: game.level.id, token: game._winToken, t0: performance.now(), mistakes: 0, tut: new Set(pendingIntro ? [pendingIntro] : []) };
        pendingIntro = '';
        say(`▶ Level ${game.level.id}${game.level.mystery ? ' [mystery]' : ''}${game.level.portals ? ' [portals]' : ''}${game.level.locks ? ' [locks]' : ''}`);
      }
      if (tut.active) {
        if (await followLesson()) return;
      }
      if (game.mode) { game.cancelMode(); return; }
      await playMove();
    } catch (e) {
      say('ERROR ' + (e && e.message));
      console.error(e);
    } finally {
      busy = false;
    }
  }

  function watchdog() {
    const sig = [game.level?.id, game.placed.size, game.hearts, shown($('result')), shown($('home')), shown($('mech-intro')), !!document.querySelector('.dl-pop')].join('|');
    if (sig !== lastSig) { lastSig = sig; lastProgressAt = performance.now(); return; }
    if (performance.now() - lastProgressAt > 45000 / bot.speed + 8000) {
      const diag = {
        level: game.level?.id, locked: game.locked, dragging: !!game.dragPiece, mode: game.mode, tutActive: tut.active, tutKind: tut.kind,
        pieces: game.pieces.length, placed: game.placed.size, hearts: game.hearts,
        result: shown($('result')) && $('result').className, home: shown($('home')),
      };
      say('STUCK ' + JSON.stringify(diag));
      bot.stuck = diag;
      bot.stop();
    }
  }

  bot.start = () => {
    if (bot.running) return;
    bot.running = true;
    bot.stuck = null;
    t0 = performance.now();
    lastProgressAt = performance.now();
    say('bot started');
    timer = setInterval(() => { tick(); watchdog(); }, 300);
    onChange?.();
  };
  bot.stop = () => {
    bot.running = false;
    clearInterval(timer);
    say('bot stopped');
    onChange?.();
  };
  bot.summary = () => {
    const rows = bot.levels.map((l) => `L${l.id} ${l.result} · ${(l.ms / 1000).toFixed(0)}s · mistakes ${l.mistakes}${l.tut ? ` · ${l.tut}` : ''}${l.note ? ` · ${l.note}` : ''}`);
    return rows.join('\n');
  };
  return bot;
}
