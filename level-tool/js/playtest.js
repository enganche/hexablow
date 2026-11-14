/* Hexablow Level Tool — playtest. Same rules as the game:
 *  - drag a tray piece onto the board (middle tile of the piece sits under the pointer), or tap piece then tap cell
 *  - doesn't fit (off-board / water / occupied)  -> bounces back, no penalty
 *  - fits but is not the solution position      -> mistake, -1 heart (3 hearts)
 *  - all pieces placed                           -> win
 * Also records mistakes per tile difficulty class, which is what the designer wants from a playtest.
 */
(function (g) {
  const HB = g.HB;
  const V = HB.view, { key } = HB;
  const PR = 15; // tray radius

  const P = (HB.playtest = {});
  let el = null, st = null;

  P.start = function (els, level, rules, opts) {
    el = els;
    opts = opts || {};
    const ctx = HB.ctx(level);
    const tiles = HB.analyzePieces(ctx, rules);
    const order = tiles.map((t, i) => i);
    const rand = HB.rng(level.id * 7919 + (opts.round || 0));
    const pieces = HB.shuffle(order, rand).map((i) => ({
      nums: level.pieces[i],
      offs: level.pieces[i].map((n) => [level.solution[n][0] - level.solution[level.pieces[i][0]][0], level.solution[n][1] - level.solution[level.pieces[i][0]][1]]),
      cls: tiles[i].orphan ? 'orphan' : tiles[i].cls,
      count: tiles[i].count,
      placed: false, mistakes: 0,
    }));
    st = {
      level, ctx, rules, pieces,
      placed: new Map(),         // num -> cell
      revealed: new Map(),       // mystery givens that a placed tile has opened: num -> cell
      hearts: 3, mistakes: 0, moves: 0, hints: 0, undone: 0,
      history: [], sel: -1, preview: null, flash: null, over: null,
      t0: Date.now(), showCls: !!opts.showCls, ghost: null, drag: null,
    };
    bind();
    render();
    tick();
  };
  P.stop = function () { if (st && st.timer) clearInterval(st.timer); st = null; if (el) { el.board.onpointerdown = null; } };
  P.setShowCls = function (v) { if (st) { st.showCls = v; renderTray(); } };

  function bind() {
    el.board.onpointerdown = (e) => {
      if (!st || st.over || st.sel < 0) return;
      const c = V.pick(el.board, e.clientX, e.clientY);
      attempt(st.sel, c);
    };
    el.restart.onclick = () => P.start(el, st.level, st.rules, { showCls: st.showCls, round: (st.round || 0) + 1 });
    el.undo.onclick = undo;
    el.hint.onclick = hint;
    if (st.timer) clearInterval(st.timer);
    st.timer = setInterval(tick, 500);
  }

  /** Mystery givens open once a placed tile sits next to them. */
  const recomputeReveal = (all) => {
    st.revealed = new Map();
    for (const [n, c] of st.ctx.hidden) if (all || st.placed.has(n - 1) || st.placed.has(n + 1)) st.revealed.set(n, c);
  };
  /** Cells behind a padlock that has not been opened yet (the player has not solved enough cells). */
  const closedLocks = () => {
    const out = new Map();
    for (const l of st.level.locks || []) if (st.placed.size < l.need) out.set(key(l.cell[0], l.cell[1]), l.need - st.placed.size);
    return out;
  };
  const pieceLocked = (p) => { const cl = closedLocks(); return p.nums.some((n) => cl.has(key(st.level.solution[n][0], st.level.solution[n][1]))); };
  const visibleGrid = () => new Map([...st.ctx.givens, ...st.revealed, ...st.placed]);

  const occupiedKeys = () => {
    const s = new Set(st.ctx.hiddenCells);
    for (const c of st.ctx.givens.values()) s.add(key(c[0], c[1]));
    for (const c of st.placed.values()) s.add(key(c[0], c[1]));
    return s;
  };
  const cellsFor = (p, pivotCell) => {
    const pv = Math.floor(p.nums.length / 2);
    const a = [pivotCell[0] - p.offs[pv][0], pivotCell[1] - p.offs[pv][1]];
    return p.offs.map(([dq, dr]) => [a[0] + dq, a[1] + dr]);
  };
  const fits = (cells) => {
    const occ = occupiedKeys(), cl = closedLocks();
    return cells.every((c) => st.ctx.cellSet.has(key(c[0], c[1])) && !occ.has(key(c[0], c[1])) && !cl.has(key(c[0], c[1])));
  };

  function attempt(i, pivotCell) {
    const p = st.pieces[i];
    if (!p || p.placed || !pivotCell) return;
    const cells = cellsFor(p, pivotCell);
    if (!fits(cells)) {
      flash(cells, 'bounce');
      const cl = closedLocks(), hit = cells.map((c) => cl.get(key(c[0], c[1]))).find(Boolean);
      setMsg(hit ? `Ô bị khóa: cần giải thêm ${hit} ô.` : 'Không đặt được (ra ngoài / nước / đã có ô).');
      return;
    }
    const ok = p.nums.every((n, j) => st.level.solution[n][0] === cells[j][0] && st.level.solution[n][1] === cells[j][1]);
    st.moves++;
    if (!ok) {
      st.mistakes++; p.mistakes++; st.hearts--;
      flash(cells, 'wrong');
      setMsg('Sai vị trí! −1 tim');
      if (st.hearts <= 0) end(false);
      render();
      return;
    }
    p.placed = true;
    p.nums.forEach((n, j) => st.placed.set(n, cells[j]));
    st.history.push(i);
    st.sel = -1;
    const wasOpen = closedLocks().size, wasHidden = st.ctx.hidden.size - st.revealed.size;
    recomputeReveal();
    flash(cells, 'good');
    setMsg(st.ctx.hidden.size - st.revealed.size < wasHidden ? '❓ Ô bí ẩn đã mở!' : closedLocks().size < wasOpen ? '🔓 Ô khóa đã mở!' : '');
    if (st.pieces.every((x) => x.placed)) end(true);
    render();
  }

  function undo() {
    if (!st || st.over || !st.history.length) return;
    const i = st.history.pop();
    const p = st.pieces[i];
    p.placed = false;
    p.nums.forEach((n) => st.placed.delete(n));
    recomputeReveal();
    st.undone++;
    render();
  }

  function hint() {
    if (!st || st.over) return;
    const grid = visibleGrid();
    let best = null;
    st.pieces.forEach((p, i) => {
      if (p.placed || pieceLocked(p)) return;
      const inf = HB.tileCandidates(st.ctx, p.nums, grid, st.rules);
      const c = inf.orphan ? 99 : inf.count;
      if (!best || c < best.c) best = { i, c };
    });
    if (!best) return;
    st.hints++;
    const p = st.pieces[best.i];
    const cells = p.nums.map((n) => st.level.solution[n]);
    p.placed = true;
    p.nums.forEach((n, j) => st.placed.set(n, cells[j]));
    st.history.push(best.i);
    flash(cells, 'good');
    if (st.pieces.every((x) => x.placed)) end(true);
    render();
  }

  function end(win) {
    st.over = win ? 'win' : 'lose';
    if (win) recomputeReveal(true);
    st.elapsed = (Date.now() - st.t0) / 1000;
    const byCls = {};
    for (const p of st.pieces) {
      const c = (byCls[p.cls] = byCls[p.cls] || { tiles: 0, mistakes: 0 });
      c.tiles++; c.mistakes += p.mistakes;
    }
    st.summary = { win, time: st.elapsed, mistakes: st.mistakes, hints: st.hints, moves: st.moves, byCls };
    if (el.onEnd) el.onEnd(st.summary);
  }

  function flash(cells, kind) {
    st.flash = { cells, kind };
    clearTimeout(st.flashT);
    st.flashT = setTimeout(() => { if (st) { st.flash = null; renderBoard(); } }, 450);
    renderBoard();
  }
  function setMsg(s) { el.msg.textContent = s; }
  function tick() {
    if (!st) return;
    const t = st.over ? st.elapsed : (Date.now() - st.t0) / 1000;
    el.hud.querySelector('[data-hud=time]').textContent = Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  }

  // ------------------------------------------------------------------ rendering
  function render() {
    renderBoard();
    renderTray();
    el.hud.querySelector('[data-hud=hearts]').textContent = '♥'.repeat(Math.max(0, st.hearts)) + '♡'.repeat(3 - Math.max(0, st.hearts));
    el.hud.querySelector('[data-hud=mist]').textContent = st.mistakes;
    el.hud.querySelector('[data-hud=left]').textContent = st.pieces.filter((p) => !p.placed).length;
    el.undo.disabled = !st.history.length || !!st.over;
    el.hint.disabled = !!st.over;
    if (st.over) setMsg(st.over === 'win' ? '🎉 Thắng!' : '💔 Hết tim.');
  }

  function renderBoard() {
    if (!st) return;
    const lv = st.level;
    const svg = el.board;
    svg.setAttribute('viewBox', V.vbFor(lv.cells.concat(lv.blocked)));
    let h = '';
    for (const c of lv.blocked) h += V.hex(c, 'water');
    const gk = new Set([...st.ctx.givens.values(), ...st.ctx.hidden.values()].map((c) => key(c[0], c[1])));
    const placedAt = new Map([...st.placed].map(([n, c]) => [key(c[0], c[1]), n]));
    for (const c of lv.cells) {
      const k = key(c[0], c[1]);
      h += V.hex(c, gk.has(k) ? 'given' : placedAt.has(k) ? 'placed' : 'cell');
    }
    // connector bars between consecutive visible numbers (a portal jump is drawn dashed)
    const pos = visibleGrid();
    for (const [n, c] of pos) if (pos.has(n + 1)) h += V.line(c, pos.get(n + 1), HB.adjacent(c, pos.get(n + 1)) ? 'bar' : 'plink');
    h += V.portalLayer(lv.portals);
    for (const [n, c] of pos) h += V.text(c, n, gk.has(key(c[0], c[1])) ? 'num given' : 'num');
    for (const [n, c] of st.ctx.hidden) if (!st.revealed.has(n)) h += V.hex(c, 'myst') + V.text(c, '?', 'mystT');
    h += V.lockLayer((lv.locks || []).filter((l) => st.placed.size < l.need), (l) => l.need - st.placed.size);
    if (st.preview) for (const c of st.preview.cells) if (st.ctx.cellSet.has(key(c[0], c[1]))) h += V.hex(c, 'ghostcell ' + (st.preview.ok ? 'ok' : 'bad'));
    if (st.flash) for (const c of st.flash.cells) if (st.ctx.cellSet.has(key(c[0], c[1]))) h += V.hex(c, 'flash ' + st.flash.kind);
    svg.innerHTML = h;
  }

  function pieceSVG(p, R, cls) {
    const cs = p.offs;
    const pts = cs.map((c) => HB.toPixel(c[0], c[1], R));
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    const x0 = Math.min(...xs) - R, x1 = Math.max(...xs) + R, y0 = Math.min(...ys) - R, y1 = Math.max(...ys) + R;
    let s = `<svg class="pc ${cls || ''}" width="${(x1 - x0).toFixed(0)}" height="${(y1 - y0).toFixed(0)}" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${(x1 - x0).toFixed(1)} ${(y1 - y0).toFixed(1)}">`;
    cs.forEach((c, j) => { s += V.hex(c, 'tile', '', R); });
    p.nums.forEach((n, j) => { if (j && p.nums[j] - p.nums[j - 1] === 1 && HB.adjacent(cs[j], cs[j - 1])) s += V.line(cs[j - 1], cs[j], 'bar', R); });
    p.nums.forEach((n, j) => { s += V.text(cs[j], n, 'num', 0, R).replace('class="num"', `class="num" style="font-size:${R * 0.78}px"`); });
    return s + '</svg>';
  }

  function renderTray() {
    const t = el.tray;
    t.innerHTML = '';
    st.pieces.forEach((p, i) => {
      if (p.placed) return;
      const d = document.createElement('div');
      d.className = 'trayitem' + (pieceLocked(p) ? ' locked' : '') + (st.sel === i ? ' sel' : '') + (st.showCls ? ' c-' + p.cls : '');
      d.innerHTML = pieceSVG(p, PR);
      d.title = st.showCls ? `${HB.CLASS_LABEL[p.cls]} (${p.count} vị trí)` : '';
      d.onpointerdown = (e) => startDrag(e, i, d);
      t.appendChild(d);
    });
  }

  // ------------------------------------------------------------------ drag
  function startDrag(e, i, node) {
    if (!st || st.over) return;
    e.preventDefault();
    const p = st.pieces[i];
    const sx = e.clientX, sy = e.clientY;
    let moved = false, ghost = null;
    const scale = V.scale(el.board);
    const R = V.R * scale;
    const mv = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      if (!moved) {
        moved = true;
        ghost = document.createElement('div');
        ghost.className = 'ghostpiece';
        ghost.innerHTML = pieceSVG(p, R);
        document.body.appendChild(ghost);
        node.style.opacity = 0.35;
      }
      const pv = Math.floor(p.nums.length / 2);
      const pc = HB.toPixel(p.offs[pv][0], p.offs[pv][1], R);
      const minx = Math.min(...p.offs.map((c) => HB.toPixel(c[0], c[1], R).x)) - R;
      const miny = Math.min(...p.offs.map((c) => HB.toPixel(c[0], c[1], R).y)) - R;
      ghost.style.left = ev.clientX - (pc.x - minx) + 'px';
      ghost.style.top = ev.clientY - (pc.y - miny) + 'px';
      const cell = V.pick(el.board, ev.clientX, ev.clientY);
      const r = el.board.getBoundingClientRect();
      const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (inside && cell) { const cells = cellsFor(p, cell); st.preview = { cells, ok: fits(cells) }; } else st.preview = null;
      renderBoard();
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      node.style.opacity = '';
      if (ghost) ghost.remove();
      const pv = st && st.preview;
      st.preview = null;
      if (!moved) { st.sel = st.sel === i ? -1 : i; renderTray(); renderBoard(); return; }
      renderBoard();
      if (pv) {
        const piv = Math.floor(p.nums.length / 2);
        attempt(i, [pv.cells[piv][0], pv.cells[piv][1]]);
      }
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }
})(typeof window !== 'undefined' ? window : globalThis);
