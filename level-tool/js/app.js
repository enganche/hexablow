/* Hexablow Level Tool — editor glue.
 * One always-visible board + a tool palette (no mode tabs). State lives in S; every edit goes through commit(). */
(function () {
  const HB = window.HB, V = HB.view;
  const { key, parse, adjacent } = HB;
  const $ = (id) => document.getElementById(id);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const LS_RULES = 'hbtool.rules.v1', LS_WS = 'hbtool.workspace.v1', LS_OPT = 'hbtool.opt.v1';
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  const GCOL = ['#2d6fd1', '#c0392b', '#8e44ad', '#16a085', '#d35400', '#7f8c8d', '#b8860b', '#c2185b'];
  const pct = (x) => Math.round(x * 100) + '%';

  const TOOL_HELP = {
    paint: 'Bấm hoặc kéo để vẽ ô chơi. Vẽ lên ô nước sẽ biến nó thành ô chơi.',
    water: 'Bấm hoặc kéo để vẽ ô nước (ô chặn nằm trong bản đồ).',
    erase: 'Bấm hoặc kéo để xoá ô.',
    path: 'Bấm ô số 1, rồi bấm hoặc kéo qua các ô kề nhau. Bấm ô cuối / kéo ngược để lùi, bấm ô đã vẽ để cắt đường tại đó.',
    given: 'Bấm một ô để bật/tắt given (số cho sẵn).',
    group: 'Kéo qua 2–3 ô kề nhau để ghép thành 1 ô khay.',
    split: 'Bấm một ô ghép để tách thành ô lẻ.',
    select: 'Bấm một ô khay để xem mọi vị trí nó kéo vào được (nét đứt; vị trí đúng viền xanh liền).',
    mystery: 'Bấm một ô given để bật/tắt "?": người chơi thấy dấu hỏi tới khi đặt một ô khay liền kề. Không dùng cho số cuối N.',
    portal: 'Bấm ô thứ nhất rồi ô thứ hai để nối cổng đôi (hai ô được tính là liền kề). Bấm một đầu cổng có sẵn để xoá. Lời giải phải đi qua cổng.',
    lock: 'Bấm một ô (không phải given) để khóa; ô mở khi người chơi đã giải đủ số ô ở ô "cần". Bấm lại để gỡ (đổi số cần thì bấm lại để cập nhật).',
  };

  const S = {
    levels: [], cur: 0, tool: 'paint', view: 'edit', rules: null, hist: [], fut: [], sel: -1,
    opt: { diff: true, nums: true, path: false },
    compiled: null, ana: null, solve: null, meta: [], drag: null, preview: null, hover: null,
    cam: { k: 1, dx: 0, dy: 0, base: null }, space: false, pathSeed: 1,
    gen: { stop: false, running: false, results: [] }, fileName: '',
  };

  function toast(msg, kind, ms) {
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), ms || 2800);
  }

  // ------------------------------------------------------------------ state helpers
  const D = () => S.levels[S.cur];
  const inCells = (k) => D().cells.some((c) => key(c[0], c[1]) === k);

  function loadRules() {
    let r = null;
    try { r = JSON.parse(lsGet(LS_RULES) || 'null'); } catch (e) { r = null; }
    S.rules = r && r.tile && r.tiers && r.weights ? r : clone(HB.DEFAULT_RULES);
  }
  const saveRules = () => lsSet(LS_RULES, JSON.stringify(S.rules));
  let saveT = null;
  function saveWS() {
    clearTimeout(saveT);
    saveT = setTimeout(() => lsSet(LS_WS, JSON.stringify({ levels: S.levels, cur: S.cur, file: S.fileName })), 400);
  }

  function metaFor(c, ana, solve) {
    if (!c.ok) return { state: 'inc', cells: 0 };
    const m = ana.metrics;
    return { state: ana.checks.ok && solve && solve.status === 'logic' ? 'ok' : 'fail', mix: [m.easyPct, m.mediumPct, m.hardPct], cells: m.cells, idx: m.index };
  }
  function evalDraft(d) {
    const c = HB.compile(d);
    if (!c.ok) return { c, ana: null, solve: null };
    return { c, ana: HB.analyzeLevel(c.level, S.rules), solve: HB.solve(c.level, { maxNodes: 4000 }) };
  }
  function refreshCur() {
    const r = evalDraft(D());
    S.compiled = r.c; S.ana = r.ana; S.solve = r.solve;
    S.meta[S.cur] = metaFor(r.c, r.ana, r.solve);
    if (S.sel >= (r.ana ? r.ana.tiles.length : 0)) S.sel = -1;
  }
  function refreshAllMeta() {
    S.levels.forEach((d, i) => { const r = evalDraft(d); S.meta[i] = metaFor(r.c, r.ana, r.solve); });
    refreshCur();
  }
  function pushHist() { S.hist.push(JSON.stringify(D())); if (S.hist.length > 150) S.hist.shift(); S.fut = []; }
  function undo() {
    if (!S.hist.length) return;
    S.fut.push(JSON.stringify(D()));
    S.levels[S.cur] = JSON.parse(S.hist.pop());
    commit(true);
  }
  function redo() {
    if (!S.fut.length) return;
    S.hist.push(JSON.stringify(D()));
    S.levels[S.cur] = JSON.parse(S.fut.pop());
    commit(true);
  }
  function commit(noNormalize) {
    if (!noNormalize) HB.normalize(D());
    refreshCur();
    render();
    saveWS();
  }

  // ------------------------------------------------------------------ loading / saving
  const mkStarter = () => { const d = HB.emptyDraft(1); d.cells = HB.hexRegion(2).map((c) => c.slice()); return d; };
  function loadLevels(data, name) {
    const arr = Array.isArray(data) ? data : [data];
    const drafts = arr.filter((x) => x && x.solution && x.cells).map(HB.draftFromLevel);
    if (!drafts.length) { toast('Không thấy level hợp lệ (cần cells, solution, givens, pieces).', 'err'); return false; }
    S.levels = drafts; S.cur = 0; S.hist = []; S.fut = []; S.sel = -1; S.fileName = name || '';
    $('fileInfo').textContent = (name ? name + ' · ' : '') + drafts.length + ' level';
    refreshAllMeta(); fit(); render(); saveWS();
    toast('Đã nạp ' + drafts.length + ' level', 'ok');
    return true;
  }
  const loadText = (text, name) => { try { loadLevels(JSON.parse(text), name); } catch (e) { toast('JSON lỗi: ' + e.message, 'err'); } };
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function copyText(t) {
    const fb = () => { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } ta.remove(); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).catch(fb); else fb();
    toast('Đã copy', 'ok', 1400);
  }

  // ------------------------------------------------------------------ tool / view
  function setTool(t) {
    S.tool = t;
    if (t !== 'select') S.sel = -1;
    S.preview = null;
    S.pend = null;
    document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    $('board').className = 't-' + t;
    $('toolHint').textContent = TOOL_HELP[t];
    drawBoard(); drawAnalyze();
  }
  function setView(v) {
    if (S.view === 'play' && v !== 'play') HB.playtest.stop();
    S.view = v;
    document.body.dataset.view = v;
    document.querySelectorAll('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    $('playWrap').hidden = v !== 'play';
    $('cardPlay').hidden = v !== 'play';
    if (v === 'play') startPlay(); else drawBoard();
  }

  // ------------------------------------------------------------------ camera
  function fit() {
    const d = D();
    const cells = d.cells.concat(d.blocked, HB.hexRegion(2));
    S.cam = { k: 1, dx: 0, dy: 0, base: V.vbFor(cells).split(' ').map(Number) };
    applyVB();
  }
  function applyVB() {
    const c = S.cam;
    if (!c.base) return;
    const [x, y, w, h] = c.base;
    const cx = x + w / 2 + c.dx, cy = y + h / 2 + c.dy;
    $('board').setAttribute('viewBox', [cx - w / (2 * c.k), cy - h / (2 * c.k), w / c.k, h / c.k].map((v) => v.toFixed(1)).join(' '));
  }
  function zoomAt(f, cx, cy) {
    const svg = $('board'), r = svg.getBoundingClientRect();
    if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    const pt = (px, py) => { const p = svg.createSVGPoint(); p.x = px; p.y = py; return p.matrixTransform(svg.getScreenCTM().inverse()); };
    const before = pt(cx, cy);
    S.cam.k = Math.max(0.4, Math.min(6, S.cam.k * f));
    applyVB();
    const after = pt(cx, cy);
    S.cam.dx += before.x - after.x; S.cam.dy += before.y - after.y;
    applyVB();
  }

  // ------------------------------------------------------------------ board drawing
  function tileCellMap() {
    const m = new Map();
    if (!S.ana) return m;
    S.ana.tiles.forEach((t, i) => t.nums.forEach((n) => { const c = S.compiled.level.solution[n]; m.set(key(c[0], c[1]), i); }));
    return m;
  }

  function drawBoard() {
    if (S.view === 'play') return;
    const d = D(), svg = $('board');
    if (!S.cam.base) fit(); else applyVB();
    const nm = new Map(d.path.map((k, i) => [k, i + 1]));
    const given = new Set(d.givenCells);
    const mapTool = ['paint', 'water', 'erase'].includes(S.tool);
    const tileOf = S.opt.diff && S.ana ? tileCellMap() : null;
    const inGroup = new Map();
    d.groups.forEach((g, gi) => g.forEach((k) => inGroup.set(k, gi)));
    let h = '';
    const have = new Set(d.cells.concat(d.blocked).map((c) => key(c[0], c[1])));
    if (mapTool || !d.cells.length) for (const c of HB.hexRegion(8)) if (!have.has(key(c[0], c[1]))) h += V.hex(c, 'ghost');
    for (const c of d.blocked) h += V.hex(c, 'water');

    for (const c of d.cells) {
      const k = key(c[0], c[1]);
      let cls = 'cell', style = '';
      if (given.has(k)) cls = 'given';
      else if (tileOf && tileOf.has(k)) { const t = S.ana.tiles[tileOf.get(k)]; cls = 'c-' + (t.orphan ? 'orphan' : t.cls); }
      if (inGroup.has(k)) {
        const col = GCOL[inGroup.get(k) % GCOL.length];
        style = cls === 'cell' ? `style="fill:${col}33;stroke:${col};stroke-width:3"` : `style="stroke:${col};stroke-width:3.5"`;
      }
      h += V.hex(c, cls, style);
    }
    d.groups.forEach((grp, gi) => {
      const col = GCOL[gi % GCOL.length];
      for (let i = 0; i < grp.length; i++)
        for (let j = i + 1; j < grp.length; j++)
          if (adjacent(parse(grp[i]), parse(grp[j]))) h += V.line(parse(grp[i]), parse(grp[j]), 'gbar').replace('class="gbar"', `class="gbar" style="stroke:${col}"`);
    });
    if (S.preview) for (const k of S.preview) h += V.hex(parse(k), 'preview');
    h += V.mysteryLayer((d.mysteryCells || []).map(parse));
    h += V.portalLayer(d.portals);
    h += V.lockLayer(d.locks);
    if (S.pend) h += V.hex(parse(S.pend), 'pend');
    if ((S.opt.path || S.tool === 'path') && d.path.length > 1)
      h += `<polyline class="path" points="${d.path.map((k) => { const p = V.xy(parse(k)); return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ')}"/>`;
    if (S.opt.nums || S.tool === 'path') {
      for (const c of d.cells) {
        const k = key(c[0], c[1]), n = nm.get(k), isG = given.has(k);
        if (n == null) { if (isG) h += V.text(c, 'G', 'num given'); continue; }
        h += V.text(c, n, 'num' + (isG ? ' given' : '') + (S.tool === 'path' ? ' small' : ''));
      }
    }
    for (const k of d.mysteryCells || []) h += V.text(parse(k), '?', 'mystT', -11);
    if (S.tool === 'path' && d.path.length) {
      h += V.circle(parse(d.path[0]), 21, 'endring');
      h += V.circle(parse(d.path[d.path.length - 1]), 21, 'sel');
    }
    if (S.ana && S.sel >= 0 && S.ana.tiles[S.sel]) {
      const t = S.ana.tiles[S.sel];
      for (const c of t.nums.map((n) => S.compiled.level.solution[n])) h += V.hex(c, 'sel');
      for (const a of t.anchors) h += V.circle(a.anchorCell, 22, 'anchor');
      t.cands.forEach((cd, j) => {
        const col = GCOL[j % GCOL.length];
        for (const c of cd.cells) h += V.hex(c, 'cand' + (cd.correct ? ' right' : ''), `style="stroke:${col}"`);
      });
      t.cands.forEach((cd, j) => {
        const p = V.xy(cd.cells[0]);
        const dx = ((j % 3) - 1) * 9, dy = -9 + Math.floor(j / 3) * 4;
        h += `<circle class="badge" cx="${p.x + dx}" cy="${p.y + dy}" r="8"/><text class="badgeT" x="${p.x + dx}" y="${p.y + dy}">${j + 1}</text>`;
      });
    }
    h += '<g id="hovg"></g>';
    svg.innerHTML = h;
    drawHover();
  }
  function drawHover() {
    const g = $('hovg');
    if (!g) return;
    g.innerHTML = S.hover && S.view === 'edit' && !S.drag ? V.hex(S.hover, 'hover') : '';
  }

  // ------------------------------------------------------------------ side panels
  function bandRow(it) {
    const hi = it.key === 'index' ? 3 : 1, lo = it.key === 'index' ? 1 : 0;
    const sc = (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
    const fmt = (v) => (it.pct ? pct(v) : v.toFixed(2));
    return `<div class="band ${it.ok ? '' : 'bad'}"><span>${it.label}</span>
      <div class="track"><div class="range" style="left:${sc(it.range[0])}%;width:${Math.max(1, sc(it.range[1]) - sc(it.range[0]))}%"></div><div class="val" style="left:${sc(it.value)}%"></div></div>
      <span class="t">${fmt(it.value)} <small>(${fmt(it.range[0])}–${fmt(it.range[1])})</small></span><span>${it.ok ? '✓' : it.dir === 'low' ? '↓' : '↑'}</span></div>`;
  }

  function drawAnalyze() {
    const sum = $('anaSummary'), tl = $('anaTiles'), st = $('anaSteps');
    $('anaMode').value = S.rules.tile.anchorMode;
    if (!S.ana) {
      $('diffBadge').innerHTML = '';
      sum.innerHTML = '<p class="hint">Hoàn tất bản đồ và đường đi (đủ N ô) để xem độ khó. ' + (S.compiled && !S.compiled.ok ? '<br>⚠ ' + S.compiled.errors.join(' ') : '') + '</p>';
      tl.innerHTML = ''; st.innerHTML = '';
      return;
    }
    const m = S.ana.metrics, ck = S.ana.checks;
    $('diffBadge').innerHTML = ck.tier ? `<span class="pill ${ck.ok ? 'ok' : 'fail'}">${ck.tier.name.split(' ')[0]} · ${ck.ok ? 'đạt' : 'lệch'}</span>` : '';
    sum.innerHTML = `<div class="sub-card"><b>${ck.tier ? ck.tier.name : 'Level này chưa có bậc'}</b>
      <div class="stack"><i class="easy" style="width:${m.easyPct * 100}%"></i><i class="medium" style="width:${m.mediumPct * 100}%"></i><i class="hard" style="width:${m.hardPct * 100}%"></i></div>
      <div class="muted">${m.tiles} ô khay · Dễ <b>${m.easy}</b> · TB <b>${m.medium}</b> · Khó <b>${m.hard}</b> (mồ côi ${m.orphan}) · given ${m.givens}/${m.cells} (${pct(m.givenPct)}) · chỉ số <b>${m.index.toFixed(2)}</b></div>
      ${ck.items.map(bandRow).join('')}</div>`;
    const rows = S.ana.tiles.map((t, i) => {
      const r = t.reasons;
      const why = t.orphan ? 'không có n±1 trên lưới' : `loại: che ${r.occupied} · chắn ${r.blocked} · hình ${r.shape}` + (r.strict ? ` · chặt ${r.strict}` : '');
      return `<tr class="row ${S.sel === i ? 'on' : ''}" data-i="${i}"><td><b>${t.nums.join('+')}</b></td><td>${t.anchors.length}</td><td><b>${t.orphan ? '–' : t.count}</b></td>
        <td><span class="pill ${t.orphan ? 'orphan' : t.cls}">${t.orphan ? 'Mồ côi' : HB.CLASS_LABEL[t.cls]}</span></td><td class="why">${why}</td></tr>`;
    }).join('');
    tl.innerHTML = `<table class="tiles"><tr><th>Ô</th><th>Mốc</th><th>Vị trí</th><th>Độ khó</th><th></th></tr>${rows}</table>`;
    tl.querySelectorAll('tr.row').forEach((tr) => (tr.onclick = () => {
      const i = +tr.dataset.i;
      if (S.tool !== 'select') setTool('select');
      S.sel = S.sel === i ? -1 : i; drawBoard(); drawAnalyze();
    }));
    const pt = m.pt;
    st.innerHTML = `<div class="stepsline">${pt.steps.map((s) => `<i class="${s.stuck ? 'orphan' : s.cls}" title="${s.nums.join('+')}">${s.stuck ? '?' : s.count}</i>`).join('')}</div>
      <p class="hint">Mỗi bước đặt ô ít vị trí nhất rồi đếm lại. Đỉnh <b>${pt.peak}</b> · kẹt <b>${pt.stuck}</b> lần.</p>`;
  }

  function drawStepper() {
    const d = D(), c = S.compiled;
    const complete = d.cells.length > 0 && d.path.length === d.cells.length;
    const steps = [
      { n: 1, label: 'Bản đồ', tool: 'paint', done: d.cells.length > 0, info: d.cells.length ? d.cells.length + ' ô' : '' },
      { n: 2, label: 'Đường đi', tool: 'path', done: complete, info: d.cells.length ? d.path.length + '/' + d.cells.length : '' },
      { n: 3, label: 'Given', tool: 'given', done: d.givenCells.length >= 2, info: d.givenCells.length + '' },
      { n: 4, label: 'Cắt ô', tool: 'group', done: d.groups.length > 0, info: d.groups.length ? d.groups.length + ' ô ghép' : 'tuỳ chọn' },
      { n: 5, label: 'Giải được', tool: 'given', done: !!(S.solve && S.solve.status === 'logic'), bad: !!(c && c.ok && S.solve && S.solve.status !== 'logic'), info: S.solve ? (S.solve.status === 'logic' ? '✓' : '✗') : '' },
      { n: 6, label: 'Đạt rule', tool: 'select', done: !!(S.ana && S.ana.checks.tier && S.ana.checks.ok), bad: !!(S.ana && S.ana.checks.tier && !S.ana.checks.ok), info: S.ana && S.ana.checks.tier ? (S.ana.checks.ok ? '✓' : '✗') : '' },
    ];
    const curN = (steps.slice(0, 5).find((s) => !s.done && s.n !== 4) || {}).n;
    $('stepper').innerHTML = steps.map((s) => `<span class="step ${s.done ? 'done' : ''} ${s.bad ? 'bad' : ''} ${s.n === curN ? 'cur' : ''}" data-tool="${s.tool}"><b>${s.done && !s.bad ? '✓' : s.n}</b>${s.label}${s.info ? ' <small>' + s.info + '</small>' : ''}</span>`).join('');
    $('stepper').querySelectorAll('.step').forEach((e) => (e.onclick = () => setTool(e.dataset.tool)));
  }

  function drawSide() {
    const d = D(), act = document.activeElement;
    if (act !== $('mId')) $('mId').value = d.id;
    if (act !== $('mName')) $('mName').value = d.name;
    $('mDiff').value = d.difficulty || 'normal';
    $('mapInfo').innerHTML = `Ô chơi <b>${d.cells.length}</b> · ô nước <b>${d.blocked.length}</b>`;
    const used = HB.mechanicsOf({ blocked: d.blocked, mystery: d.mysteryCells, portals: d.portals, locks: d.locks });
    const rows = [];
    if (d.blocked.length) rows.push(`<span><i class="mk" style="background:#8fd8ea"></i>Hồ nước: ${d.blocked.length} ô</span>`);
    if (d.mysteryCells.length) rows.push(`<span><i class="mk" style="background:#7f62b8"></i>Số bí ẩn: ${d.mysteryCells.length}</span>`);
    d.portals.forEach((p, i) => rows.push(`<span><i class="mk" style="background:${V.portalColor(i)}"></i>Cổng ${String.fromCharCode(65 + (i % 26))}: ${key(p[0][0], p[0][1])} ↔ ${key(p[1][0], p[1][1])}</span>`));
    d.locks.forEach((l) => rows.push(`<span><i class="mk" style="background:#4a3c2c"></i>Khóa ${key(l.cell[0], l.cell[1])}: cần ${l.need} ô</span>`));
    $('mechInfo').innerHTML = rows.join('') + (used.length > 2 ? '<span style="color:#a63a36">⚠ quá 2 cơ chế</span>' : '');
    const c = S.compiled, sizes = [0, 0, 0, 0];
    if (c && c.ok) c.level.pieces.forEach((p) => sizes[p.length]++);
    else {
      const inG = new Set(d.groups.flat()), gs = new Set(d.givenCells);
      d.cells.forEach((cc) => { const k = key(cc[0], cc[1]); if (!gs.has(k) && !inG.has(k)) sizes[1]++; });
      d.groups.forEach((g2) => sizes[g2.length]++);
    }
    $('cutInfo').innerHTML = `Given <b>${d.givenCells.length}</b> (${d.cells.length ? pct(d.givenCells.length / d.cells.length) : '0%'}) · ô khay: lẻ <b>${sizes[1]}</b> · đôi <b>${sizes[2]}</b> · ba <b>${sizes[3]}</b>` +
      (S.solve ? `<br>Bộ giải: <b>${HB.STATUS_LABEL[S.solve.status] || S.solve.status}</b>` : '');
    $('btnUndo').disabled = !S.hist.length; $('btnRedo').disabled = !S.fut.length;
    drawAnalyze();
  }

  function drawList() {
    const el = $('levelList');
    el.innerHTML = S.levels.map((d, i) => {
      const m = S.meta[i] || { state: 'inc' };
      const bar = m.mix ? `<span class="bar"><i style="width:${m.mix[0] * 100}%;background:var(--easy)"></i><i style="width:${m.mix[1] * 100}%;background:var(--medium)"></i><i style="width:${m.mix[2] * 100}%;background:var(--hard)"></i></span>` : '';
      return `<div class="lv ${i === S.cur ? 'cur' : ''}" data-i="${i}"><i class="dot ${m.state}"></i><span class="id">${d.id}</span><span class="sub">${d.cells.length} ô${m.idx ? ' · ' + m.idx.toFixed(1) : ''}</span>${bar}</div>`;
    }).join('');
    el.querySelectorAll('.lv').forEach((n) => (n.onclick = () => selectLevel(+n.dataset.i)));
  }

  function drawStatus() {
    const c = S.compiled, parts = [];
    if (!c) return;
    if (!c.ok) parts.push(...c.errors.map((e) => `<span class="err">⚠ ${e}</span>`));
    else {
      parts.push(...c.warnings.map((w) => `<span class="warn">⚠ ${w}</span>`));
      const ok = S.solve && S.solve.status === 'logic';
      parts.push(`<span class="${ok ? 'ok' : 'err'}">${ok ? '✓' : '✗'} ${HB.STATUS_LABEL[S.solve.status] || S.solve.status}</span>`);
      const ck = S.ana.checks;
      if (ck.tier) parts.push(`<span class="${ck.ok ? 'ok' : 'warn'}">${ck.tier.name}: ${ck.ok ? 'đạt rule độ khó' : 'lệch — ' + ck.items.filter((i) => !i.ok).map((i) => i.label + (i.dir === 'low' ? '↓' : '↑')).join(', ')}</span>`);
    }
    $('statusBar').innerHTML = parts.join('') || '&nbsp;';
  }

  function render() { drawStepper(); drawBoard(); drawSide(); drawList(); drawStatus(); }

  function selectLevel(i) {
    if (S.view === 'play') HB.playtest.stop();
    S.cur = i; S.hist = []; S.fut = []; S.sel = -1; S.gen.results = [];
    refreshCur(); fit();
    if (S.view === 'play') startPlay();
    render(); drawGenResults(); saveWS();
  }

  // ------------------------------------------------------------------ pointer tools
  const board = $('board');
  const dissolve = (k) => {
    const d = D(), gi = d.groups.findIndex((g) => g.includes(k));
    if (gi < 0) return;
    const rest = d.groups[gi].filter((x) => x !== k);
    d.groups.splice(gi, 1);
    for (const comp of HB.components(rest)) if (comp.length >= 2) d.groups.push(comp);
  };

  function onDown(c) {
    const d = D(), k = key(c[0], c[1]), t = S.tool;
    if (t === 'paint' || t === 'water' || t === 'erase') { pushHist(); applyMap(c); return; }
    if (!inCells(k)) { if (t === 'select' && S.sel >= 0) { S.sel = -1; drawBoard(); drawAnalyze(); } return; }
    if (t === 'path') {
      pushHist();
      const p = d.path, last = p[p.length - 1];
      if (!p.length) p.push(k);
      else if (k === last) S.drag.maybePop = true;
      else if (adjacent(parse(last), c) && !p.includes(k)) p.push(k);
      else if (p.includes(k)) p.length = p.indexOf(k) + 1;
      commit();
    } else if (t === 'given') {
      pushHist();
      const i = d.givenCells.indexOf(k);
      if (i >= 0) d.givenCells.splice(i, 1); else { d.givenCells.push(k); dissolve(k); }
      commit();
    } else if (t === 'split') {
      pushHist(); dissolve(k); commit();
    } else if (t === 'group') {
      if (!d.givenCells.includes(k)) { S.drag.stroke = [k]; S.preview = [k]; drawBoard(); }
      else toast('Ô given không ghép được — bỏ given trước.', '', 1800);
    } else if (t === 'mystery') {
      if (!d.givenCells.includes(k)) { toast('Chỉ ô given mới thành số bí ẩn — đặt given trước (G).', '', 2200); return; }
      const n = d.path.indexOf(k) + 1;
      if (n && n === d.cells.length) { toast('Số cuối N luôn phải hiện rõ.', 'err'); return; }
      pushHist();
      const i = d.mysteryCells.indexOf(k);
      if (i >= 0) d.mysteryCells.splice(i, 1); else d.mysteryCells.push(k);
      commit();
    } else if (t === 'portal') {
      const pi = d.portals.findIndex(([a, b]) => key(a[0], a[1]) === k || key(b[0], b[1]) === k);
      if (pi >= 0) { pushHist(); d.portals.splice(pi, 1); S.pend = null; commit(); return; }
      if (!S.pend) { S.pend = k; drawBoard(); return; }
      if (S.pend === k) { S.pend = null; drawBoard(); return; }
      const a = parse(S.pend);
      if (adjacent(a, c)) { toast('Hai đầu đang liền kề nhau — cổng sẽ vô nghĩa. Chọn ô xa hơn.', 'err', 2600); return; }
      pushHist(); d.portals.push([a, [c[0], c[1]]]); S.pend = null; commit();
    } else if (t === 'lock') {
      if (d.givenCells.includes(k)) { toast('Ô khóa không được là ô given.', 'err', 2000); return; }
      const li = d.locks.findIndex((l) => key(l.cell[0], l.cell[1]) === k), need = Math.max(1, +$('lockNeed').value || 1);
      pushHist();
      if (li >= 0 && d.locks[li].need !== need) d.locks[li].need = need;
      else if (li >= 0) d.locks.splice(li, 1);
      else d.locks.push({ cell: [c[0], c[1]], need });
      commit();
    } else if (t === 'select') {
      const ti = S.ana ? tileCellMap().get(k) : undefined;
      if (ti === undefined) { toast(S.ana ? 'Ô given không nằm trong khay.' : 'Cần đường đi hoàn chỉnh để soi ô.', '', 1800); return; }
      S.sel = S.sel === ti ? -1 : ti; drawBoard(); drawAnalyze();
    }
  }
  function onMove(c) {
    const d = D(), k = key(c[0], c[1]), t = S.tool;
    if (t === 'paint' || t === 'water' || t === 'erase') applyMap(c);
    else if (t === 'path') {
      S.drag.maybePop = false;
      const p = d.path;
      if (!p.length) return;
      if (k === p[p.length - 2]) { p.pop(); commit(); }
      else if (inCells(k) && !p.includes(k) && adjacent(parse(p[p.length - 1]), c)) { p.push(k); commit(); }
    } else if (t === 'group' && S.drag.stroke) {
      const s = S.drag.stroke;
      if (s.length < 3 && inCells(k) && !d.givenCells.includes(k) && !s.includes(k) && adjacent(parse(s[s.length - 1]), c)) { s.push(k); S.preview = s.slice(); drawBoard(); }
    }
  }
  function onUp() {
    const d = D();
    if (S.tool === 'path' && S.drag.maybePop) { d.path.pop(); commit(); }
    if (S.tool === 'group' && S.drag.stroke) {
      const s = S.drag.stroke;
      S.preview = null;
      if (s.length >= 2) { pushHist(); s.forEach(dissolve); d.groups.push(s.slice()); commit(); } else drawBoard();
    }
  }
  function applyMap(c) {
    const d = D(), k = key(c[0], c[1]), t = S.tool;
    if (Math.abs(c[0]) > 14 || Math.abs(c[1]) > 14 || Math.abs(c[0] + c[1]) > 14) return;
    const rm = (arr) => { const i = arr.findIndex((x) => key(x[0], x[1]) === k); if (i >= 0) arr.splice(i, 1); return i >= 0; };
    if (t === 'paint') { rm(d.blocked); if (!inCells(k)) d.cells.push([c[0], c[1]]); }
    else if (t === 'erase') { rm(d.cells); rm(d.blocked); }
    else { rm(d.cells); if (!d.blocked.some((x) => key(x[0], x[1]) === k)) d.blocked.push([c[0], c[1]]); }
    d.cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    commit();
  }

  function tipFor(c) {
    const d = D(), k = key(c[0], c[1]);
    if (!inCells(k)) return d.blocked.some((x) => key(x[0], x[1]) === k) ? 'Ô nước (chặn)' : null;
    const n = d.path.indexOf(k) + 1;
    let s = n ? `Số <b>${n}</b>` : 'Chưa có số';
    const pi = d.portals.findIndex(([a, b]) => key(a[0], a[1]) === k || key(b[0], b[1]) === k);
    if (pi >= 0) s += ` · cổng ${String.fromCharCode(65 + (pi % 26))}`;
    const lk = d.locks.find((l) => key(l.cell[0], l.cell[1]) === k);
    if (lk) s += ` · khóa: cần ${lk.need} ô`;
    if (d.mysteryCells.includes(k)) return s + ' · given bí ẩn (?)';
    if (d.givenCells.includes(k)) return s + ' · given';
    const ti = S.ana ? tileCellMap().get(k) : undefined;
    if (ti !== undefined) {
      const t = S.ana.tiles[ti];
      s += ` · ô khay <b>${t.nums.join('+')}</b><br>${t.orphan ? 'Mồ côi (chưa có mốc)' : HB.CLASS_LABEL[t.cls] + ' · ' + t.count + ' vị trí kéo vào được'}`;
    }
    return s;
  }
  function showTip(e, html) {
    const tip = $('tip');
    if (!html) { tip.hidden = true; return; }
    const r = $('stage').getBoundingClientRect();
    tip.innerHTML = html; tip.hidden = false;
    tip.style.left = Math.min(r.width - 250, e.clientX - r.left + 14) + 'px';
    tip.style.top = Math.max(4, e.clientY - r.top + 14) + 'px';
  }

  let panning = null;
  board.addEventListener('contextmenu', (e) => e.preventDefault());
  board.addEventListener('pointerdown', (e) => {
    if (S.view !== 'edit') return;
    if (e.button === 1 || e.button === 2 || S.space) {
      e.preventDefault(); panning = { x: e.clientX, y: e.clientY }; board.classList.add('pan');
      try { board.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      return;
    }
    if (e.button > 0) return;
    const c = V.pick(board, e.clientX, e.clientY);
    if (!c) return;
    e.preventDefault();
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    S.drag = { last: key(c[0], c[1]) };
    $('tip').hidden = true;
    onDown(c);
  });
  board.addEventListener('pointermove', (e) => {
    if (panning) {
      const sc = V.scale(board);
      S.cam.dx -= (e.clientX - panning.x) / sc; S.cam.dy -= (e.clientY - panning.y) / sc;
      panning = { x: e.clientX, y: e.clientY }; applyVB(); return;
    }
    const c = V.pick(board, e.clientX, e.clientY);
    if (!c) return;
    const k = key(c[0], c[1]);
    if (!S.drag) {
      if (!S.hover || key(S.hover[0], S.hover[1]) !== k) { S.hover = c; drawHover(); }
      showTip(e, tipFor(c));
      return;
    }
    if (k === S.drag.last) return;
    S.drag.last = k;
    onMove(c);
  });
  const endDrag = () => {
    if (panning) { panning = null; board.classList.remove('pan'); return; }
    if (!S.drag) return;
    onUp(); S.drag = null;
  };
  board.addEventListener('pointerup', endDrag);
  board.addEventListener('pointercancel', endDrag);
  board.addEventListener('pointerleave', () => { S.hover = null; drawHover(); $('tip').hidden = true; });
  board.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });

  // ------------------------------------------------------------------ playtest
  function startPlay() {
    const c = S.compiled;
    const els = { board: $('playBoard'), tray: $('playTray'), hud: $('playHud'), msg: $('playMsg'), restart: $('pRestart'), undo: $('pUndo'), hint: $('pHint') };
    $('playResult').hidden = true;
    if (!c || !c.ok) {
      $('playBoard').innerHTML = ''; $('playTray').innerHTML = '';
      $('playMsg').textContent = 'Level chưa hoàn chỉnh — hoàn tất đường đi rồi quay lại.';
      return;
    }
    els.onEnd = (s) => {
      const rows = Object.entries(s.byCls).map(([k, v]) => `<tr><td><span class="pill ${k}">${HB.CLASS_LABEL[k]}</span></td><td>${v.tiles} ô</td><td>${v.mistakes} lần sai</td></tr>`).join('');
      const html = `<h3>${s.win ? '🎉 Hoàn thành' : '💔 Thua'}</h3><div>Thời gian <b>${Math.round(s.time)}s</b> · sai <b>${s.mistakes}</b> · gợi ý <b>${s.hints}</b></div><table class="tiles">${rows}</table>`;
      $('playResult').innerHTML = html + '<div class="row"><button id="rClose">Đóng</button></div>';
      $('playResult').hidden = false;
      $('rClose').onclick = () => ($('playResult').hidden = true);
      $('playStats').innerHTML = `<div class="sub-card">${html}</div>` + $('playStats').innerHTML;
    };
    HB.playtest.start(els, c.level, S.rules, { showCls: $('pCls').checked });
  }

  // ------------------------------------------------------------------ generation
  function initGen() {
    const sel = $('gTier');
    sel.innerHTML = S.rules.tiers.map((t, i) => `<option value="${i}">${t.name} (L${t.from}–${t.to == null ? '∞' : t.to})</option>`).join('') + '<option value="-1">Tuỳ chỉnh</option>';
    const t = HB.tierFor(S.rules, D().id);
    sel.value = t ? String(S.rules.tiers.indexOf(t)) : '-1';
    applyTier();
  }
  function applyTier() {
    const i = +$('gTier').value;
    if (i >= 0) {
      const t = S.rules.tiers[i], tg = HB.targetFromTier(t);
      $('gE').value = Math.round(tg.easy * 100); $('gM').value = Math.round(tg.medium * 100); $('gH').value = Math.round(tg.hard * 100);
      $('gOrph').value = Math.round(t.orphan[1] * 100);
      $('gMax').value = t.size3[1] > 0 ? 3 : 2;
    }
    genLabels();
  }
  const genLabels = () => { $('gEv').textContent = $('gE').value + '%'; $('gMv').textContent = $('gM').value + '%'; $('gHv').textContent = $('gH').value + '%'; };

  async function runGen() {
    const d = D();
    if (!d.cells.length) { toast('Cần vẽ bản đồ trước.', 'err'); return; }
    if (S.gen.running) return;
    const e = +$('gE').value, m = +$('gM').value, hh = +$('gH').value, tot = e + m + hh || 1;
    const opts = {
      base: { id: d.id, name: d.name, difficulty: d.difficulty, cells: d.cells, blocked: d.blocked, portals: d.portals, mysteryCells: d.mysteryCells, locks: d.locks },
      target: { easy: e / tot, medium: m / tot, hard: hh / tot },
      tol: +$('gTol').value / 100, maxPiece: +$('gMax').value,
      givenRange: [+$('gGmin').value / 100, +$('gGmax').value / 100], maxOrphan: +$('gOrph').value / 100,
      keepPath: $('gKeepPath').checked && d.path.length === d.cells.length, path: d.path.slice(),
      keepGivens: $('gKeepGiv').checked, givenCells: d.givenCells.slice(),
      keepGroups: $('gKeepGrp').checked, groups: d.groups.map((g) => g.slice()),
      pathStyle: $('gStyle').value, timeMs: +$('gTime').value * 1000, seed: +$('gSeed').value || 1, want: 5, rules: S.rules,
      shouldStop: () => S.gen.stop,
    };
    if (opts.keepGivens && !d.givenCells.length) { toast('Chưa có given để giữ.', 'err'); return; }
    S.gen.running = true; S.gen.stop = false;
    $('gGo').disabled = true;
    const res = await HB.generate(opts, (p) => { $('gProg').textContent = `đã thử ${p.tried} · tìm được ${p.found} · ${(p.elapsed / 1000).toFixed(1)}s`; });
    S.gen.running = false; $('gGo').disabled = false;
    $('gProg').textContent = res.error ? res.error : `xong: thử ${res.tried}${res.closest ? ' · không trúng mục tiêu, hiện kết quả gần nhất' : ''}`;
    S.gen.results = res.results;
    $('gSeed').value = opts.seed + 1;
    drawGenResults();
  }
  function drawGenResults() {
    const box = $('gResults');
    box.innerHTML = S.gen.results.map((r, i) => {
      const m = r.metrics;
      return `<div class="sub-card"><b>#${i + 1}</b> <span class="pill ${r.hit ? 'ok' : 'inc'}">${r.hit ? 'trúng mục tiêu' : 'gần nhất'}</span>
        <div class="stack"><i class="easy" style="width:${m.easyPct * 100}%"></i><i class="medium" style="width:${m.mediumPct * 100}%"></i><i class="hard" style="width:${m.hardPct * 100}%"></i></div>
        <div class="muted">Dễ ${pct(m.easyPct)} · TB ${pct(m.mediumPct)} · Khó ${pct(m.hardPct)} · mồ côi ${m.orphan} · given ${m.givens} (${pct(m.givenPct)}) · chỉ số ${m.index.toFixed(2)}</div>
        <div class="row"><button data-apply="${i}" class="primary">Áp dụng</button></div></div>`;
    }).join('');
    box.querySelectorAll('[data-apply]').forEach((b) => (b.onclick = () => {
      const r = S.gen.results[+b.dataset.apply], d = D();
      pushHist();
      d.path = r.draft.path.slice(); d.givenCells = r.draft.givenCells.slice(); d.groups = r.draft.groups.map((g) => g.slice());
      commit(); toast('Đã áp dụng — Ctrl+Z để hoàn tác', 'ok');
    }));
  }

  // ------------------------------------------------------------------ wiring
  const parseW = (s) => { const a = s.split(/[:,\s]+/).map(Number).filter((x) => !isNaN(x)); while (a.length < 3) a.push(0); return a.slice(0, 3); };
  const needPath = () => { const d = D(); if (d.path.length !== d.cells.length || !d.cells.length) { toast('Cần vẽ xong đường đi trước (bước 2).', 'err'); return false; } return true; };

  function wire() {
    document.querySelectorAll('.tool').forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
    document.querySelectorAll('#viewSeg button').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
    $('btnOpen').onclick = () => $('fileIn').click();
    $('fileIn').onchange = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => loadText(r.result, f.name); r.readAsText(f); e.target.value = ''; };
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => loadText(r.result, f.name); r.readAsText(f); });
    $('btnFetch').onclick = () => fetch('../src/levels.json').then((r) => r.json()).then((j) => loadLevels(j, 'src/levels.json'))
      .catch(() => toast('Không nạp được (file:// không cho fetch). Dùng “Mở” hoặc chạy node level-tool/serve.mjs.', 'err', 4500));
    $('btnSave').onclick = () => {
      const out = [], bad = [];
      S.levels.forEach((d) => { const c = HB.compile(d); if (c.ok) out.push(c.level); else bad.push(d.id); });
      if (bad.length && !confirm(`Level ${bad.join(', ')} chưa hoàn chỉnh và sẽ bị bỏ qua. Vẫn lưu?`)) return;
      download('levels.json', JSON.stringify(out));
      toast('Đã tải levels.json (' + out.length + ' level)', 'ok');
    };
    $('btnCopy').onclick = () => { if (S.compiled && S.compiled.ok) copyText(JSON.stringify(S.compiled.level)); else toast('Level chưa hoàn chỉnh.', 'err'); };
    $('btnPaste').onclick = () => $('dlgPaste').showModal();
    $('pasteOk').onclick = () => { const t = $('pasteText').value; if (t.trim()) loadText(t, 'đã dán'); };
    $('btnUndo').onclick = undo; $('btnRedo').onclick = redo;
    $('zIn').onclick = () => zoomAt(1.25); $('zOut').onclick = () => zoomAt(1 / 1.25); $('zFit').onclick = () => { fit(); };

    const saveOpt = () => lsSet(LS_OPT, JSON.stringify(S.opt));
    $('optDiff').onchange = () => { S.opt.diff = $('optDiff').checked; saveOpt(); drawBoard(); };
    $('optNums').onchange = () => { S.opt.nums = $('optNums').checked; saveOpt(); drawBoard(); };
    $('optPath').onchange = () => { S.opt.path = $('optPath').checked; saveOpt(); drawBoard(); };

    window.addEventListener('keydown', (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (k === ' ') { S.space = true; e.preventDefault(); return; }
      if (S.view !== 'edit') return;
      const map = { b: 'paint', w: 'water', e: 'erase', p: 'path', g: 'given', h: 'group', x: 'split', v: 'select', m: 'mystery', o: 'portal', k: 'lock' };
      if (map[k]) setTool(map[k]);
      else if (k === 'f') fit();
      else if (k === 'd') { $('optDiff').checked = !$('optDiff').checked; $('optDiff').onchange(); }
      else if (k === 'escape') { S.sel = -1; S.preview = null; drawBoard(); drawAnalyze(); }
    });
    window.addEventListener('keyup', (e) => { if (e.key === ' ') S.space = false; });

    $('lvNew').onclick = () => { const id = Math.max(0, ...S.levels.map((d) => d.id)) + 1; S.levels.push(HB.emptyDraft(id)); S.meta.push({ state: 'inc' }); selectLevel(S.levels.length - 1); setTool('paint'); };
    $('lvDup').onclick = () => { const d = clone(D()); d.id = Math.max(...S.levels.map((x) => x.id)) + 1; d.name = 'Level ' + d.id; S.levels.push(d); S.meta.push({ state: 'inc' }); selectLevel(S.levels.length - 1); };
    $('lvDel').onclick = () => {
      if (!confirm(`Xoá level ${D().id}? (không hoàn tác được)`)) return;
      S.levels.splice(S.cur, 1); S.meta.splice(S.cur, 1);
      if (!S.levels.length) { S.levels.push(mkStarter()); S.meta.push({ state: 'inc' }); }
      selectLevel(Math.min(S.cur, S.levels.length - 1));
    };
    $('mId').onchange = () => { pushHist(); D().id = Math.max(1, +$('mId').value || 1); commit(); };
    $('mName').onchange = () => { pushHist(); D().name = $('mName').value; commit(); };
    $('mDiff').onchange = () => { pushHist(); D().difficulty = $('mDiff').value; commit(); };

    $('mapHex').onclick = () => { pushHist(); const d = D(); d.cells = HB.hexRegion(+$('mapRadius').value).map((c) => c.slice()); d.blocked = []; commit(); fit(); };
    $('mapFlower').onclick = () => { pushHist(); const d = D(); d.cells = HB.minus(HB.hexRegion(3), [[3, 0], [0, 3], [-3, 3], [-3, 0], [0, -3], [3, -3]]).map((c) => c.slice()); d.blocked = []; commit(); fit(); };
    $('mapClear').onclick = () => { pushHist(); const d = D(); d.cells = []; d.blocked = []; d.path = []; d.givenCells = []; d.groups = []; d.portals = []; d.mysteryCells = []; d.locks = []; commit(); };

    $('pathAuto').onclick = () => {
      const d = D();
      if (!d.cells.length) { toast('Vẽ bản đồ trước.', 'err'); return; }
      const style = $('pathStyle').value;
      const prefix = d.path.length && d.path.length < d.cells.length ? d.path.slice() : null;
      const portals = d.portals.map(([a, b]) => [key(a[0], a[1]), key(b[0], b[1])]); // the path must cross every portal
      const pOpt = { portals, requirePortals: portals.length > 0 };
      let got = HB.autoPath(d.cells, { style, tries: prefix ? 12 : 24, seed: S.pathSeed++, prefix, ...pOpt });
      if (!got && prefix) got = HB.autoPath(d.cells, { style, tries: 24, seed: S.pathSeed++, ...pOpt });
      if (!got) { toast('Không tìm được đường phủ kín bản đồ này (thử bỏ bớt ô).', 'err'); return; }
      pushHist(); d.path = got[0].path; commit();
    };
    $('pathRev').onclick = () => { pushHist(); D().path.reverse(); commit(); };
    $('pathClear').onclick = () => { pushHist(); D().path = []; commit(); };

    $('gvDensity').oninput = () => ($('gvDensityV').textContent = $('gvDensity').value + '%');
    $('gvAuto').onclick = () => {
      if (!needPath()) return;
      const d = D(), r = HB.autoGivens(d, { density: +$('gvDensity').value / 100, seed: S.pathSeed++ });
      if (!r) { toast('Không tạo được bộ given giải được.', 'err'); return; }
      pushHist(); d.givenCells = r.givenCells; commit();
    };
    $('gvTopUp').onclick = () => {
      if (!needPath()) return;
      const d = D(); pushHist();
      for (let i = 0; i < d.cells.length; i++) {
        const c = HB.compile(d);
        if (c.ok && HB.solve(c.level, { search: false }).status === 'logic') break;
        const num = new Map(d.path.map((k, j) => [k, j + 1]));
        const ns = [1, ...d.givenCells.map((k) => num.get(k)), d.cells.length].filter((v, j, a) => a.indexOf(v) === j).sort((a, b) => a - b);
        let best = null;
        for (let j = 0; j + 1 < ns.length; j++) if (ns[j + 1] - ns[j] > 1 && (!best || ns[j + 1] - ns[j] > best.g)) best = { a: ns[j], g: ns[j + 1] - ns[j] };
        if (!best) break;
        const k = d.path[best.a + Math.ceil(best.g / 2) - 1];
        d.givenCells.push(k); dissolve(k);
      }
      commit();
    };
    $('cutAuto').onclick = () => {
      if (!needPath()) return;
      const d = D(), r = HB.autoCut(d, { maxPiece: +$('cutMax').value, weights: parseW($('cutW').value), seed: S.pathSeed++ });
      if (!r) return;
      pushHist(); d.groups = r.groups; commit();
      if (!r.solvable) toast('Cách cắt này chưa giải được bằng suy luận — thêm given hoặc cắt lại.', 'err', 4000);
    };
    $('cutReset').onclick = () => { pushHist(); D().groups = []; commit(); };

    $('anaMode').onchange = () => { S.rules.tile.anchorMode = $('anaMode').value; saveRules(); refreshAllMeta(); render(); };
    $('pCls').onchange = () => HB.playtest.setShowCls($('pCls').checked);
    $('pRestart').addEventListener('click', () => { $('playResult').hidden = true; });

    $('gTier').onchange = applyTier;
    ['gE', 'gM', 'gH'].forEach((id) => ($(id).oninput = genLabels));
    $('gGo').onclick = runGen;
    $('gStop').onclick = () => (S.gen.stop = true);

    $('rulesText').value = JSON.stringify(S.rules, null, 2);
    $('rulesApply').onclick = () => {
      try {
        const r = JSON.parse($('rulesText').value);
        if (!r.tile || !r.weights || !Array.isArray(r.tiers)) throw new Error('thiếu tile / weights / tiers');
        S.rules = r; saveRules(); initGen(); refreshAllMeta(); render();
        $('rulesMsg').textContent = 'Đã áp dụng.';
      } catch (e) { $('rulesMsg').textContent = 'Lỗi: ' + e.message; }
    };
    $('rulesReset').onclick = () => { S.rules = clone(HB.DEFAULT_RULES); saveRules(); $('rulesText').value = JSON.stringify(S.rules, null, 2); initGen(); refreshAllMeta(); render(); };
    $('rulesCopy').onclick = () => copyText($('rulesText').value);
  }

  // ------------------------------------------------------------------ boot
  function boot() {
    loadRules();
    try { Object.assign(S.opt, JSON.parse(lsGet(LS_OPT) || '{}')); } catch (e) { /* ignore */ }
    $('optDiff').checked = S.opt.diff; $('optNums').checked = S.opt.nums; $('optPath').checked = S.opt.path;
    wire();
    let ws = null;
    try { ws = JSON.parse(lsGet(LS_WS) || 'null'); } catch (e) { ws = null; }
    if (ws && ws.levels && ws.levels.length) {
      S.levels = ws.levels; S.cur = Math.min(ws.cur || 0, ws.levels.length - 1); S.fileName = ws.file || '';
      S.levels.forEach((d) => { d.portals = d.portals || []; d.mysteryCells = d.mysteryCells || []; d.locks = d.locks || []; }); // older saved workspaces
      $('fileInfo').textContent = (S.fileName ? S.fileName + ' · ' : '') + S.levels.length + ' level (khôi phục)';
    } else {
      S.levels = [mkStarter()];
      if (location.protocol.startsWith('http'))
        fetch('../src/levels.json').then((r) => r.json()).then((j) => { if (loadLevels(j, 'src/levels.json')) { initGen(); setTool('select'); } }).catch(() => {});
    }
    refreshAllMeta(); fit(); initGen();
    const d = D();
    setTool(d.cells.length && d.path.length === d.cells.length ? 'select' : 'paint');
    setView('edit');
    render();
  }
  window.HBApp = { S, setTool, setView, selectLevel, loadLevels };
  boot();
})();
