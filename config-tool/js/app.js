// Hexablow config tool — a Unity-style inspector for the game's JSON config files.
// Plain script (no modules) so it also runs from file://.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const META = window.CONFIG_META;
  const FILES = window.CONFIG_FILES;
  const FMT = window.CfgFormat;

  const state = {
    files: {},          // name -> {def, data, baseObj, baseStr, inline, undo, redo, handle}
    current: null,
    open: new Set(),    // foldout keys "file|path"
    closed: new Set(),  // foldouts the user closed although they default open
    search: '',
    mode: 'none',       // 'server' | 'fs' | 'manual' | 'none'
    dir: null,          // directory handle in fs mode
  };

  // ------------------------------------------------------------------ helpers
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const isPrim = (v) => v === null || typeof v !== 'object';
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const getAt = (o, path) => path.reduce((x, k) => (x == null ? undefined : x[k]), o);
  const hexRe = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

  function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null) e.append(k);
    return e;
  }

  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show ' + (kind || '');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (t.className = ''), 3200);
  }

  const prettify = (k) => {
    if (/^\d+$/.test(k)) return k;
    const s = String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  // ------------------------------------------------------------------ metadata lookup
  const patCache = new Map();
  function compile(pattern) {
    let r = patCache.get(pattern);
    if (!r) {
      r = new RegExp('^' + pattern.split('.').map((s) => (s === '*' ? '[^.]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('\\.') + '$');
      patCache.set(pattern, r);
    }
    return r;
  }
  function metaFor(f, path) {
    const key = path.join('.');
    if (f.metaCache.has(key)) return f.metaCache.get(key);
    const m = {};
    for (const e of f.meta.fields) if (compile(e.path).test(key)) Object.assign(m, e);
    f.metaCache.set(key, m);
    return m;
  }

  // ------------------------------------------------------------------ editing core
  function beforeChange(f) {
    if (f.undoLock) return;
    f.undo.push(JSON.stringify(f.data));
    if (f.undo.length > 100) f.undo.shift();
    f.redo = [];
    f.undoLock = setTimeout(() => (f.undoLock = null), 700); // coalesce rapid edits (typing, dragging a slider)
    updateToolbar();
  }

  function setAt(f, path, value) {
    beforeChange(f);
    if (!path.length) f.data = value;
    else getAt(f.data, path.slice(0, -1))[path[path.length - 1]] = value;
    refreshDirty();
  }

  function structural(f, fn) { // add / remove / move: change data then rebuild the tree
    beforeChange(f);
    f.undoLock && clearTimeout(f.undoLock);
    f.undoLock = null;
    fn();
    render();
  }

  function undo(redo) {
    const f = cur();
    const from = redo ? f.redo : f.undo;
    const to = redo ? f.undo : f.redo;
    if (!from.length) return;
    to.push(JSON.stringify(f.data));
    f.data = JSON.parse(from.pop());
    f.undoLock = null;
    render();
  }

  const cur = () => state.files[state.current];

  // ------------------------------------------------------------------ dirty tracking (Unity "prefab override" style)
  function refreshDirty() {
    const f = cur();
    document.querySelectorAll('#inspector [data-path]').forEach((n) => {
      const path = JSON.parse(n.dataset.path);
      const now = getAt(f.data, path);
      const was = getAt(f.baseObj, path);
      n.classList.toggle('dirty', !same(now, was));
      n.classList.toggle('added', was === undefined);
    });
    for (const [name, ff] of Object.entries(state.files)) {
      const d = isDirty(ff);
      const dot = document.querySelector(`[data-file="${name}"] .dot`);
      if (dot) dot.classList.toggle('on', d);
    }
    updateToolbar();
  }
  const isDirty = (f) => JSON.stringify(f.data) !== f.baseStr;

  function updateToolbar() {
    const f = cur();
    if (!f) return;
    $('#undo').disabled = !f.undo.length;
    $('#redo').disabled = !f.redo.length;
    const dirtyCount = Object.values(state.files).filter(isDirty).length;
    $('#save').disabled = !isDirty(f);
    $('#saveAll').disabled = !dirtyCount;
    $('#saveAll').textContent = dirtyCount ? `Save all (${dirtyCount})` : 'Save all';
    $('#revert').disabled = !isDirty(f);
  }

  // ------------------------------------------------------------------ field controls
  function numberControl(f, path, value, meta) {
    const wrap = el('div', { class: 'ctl num' });
    const hasRange = meta.min != null && meta.max != null;
    const step = meta.step ?? (meta.int ? 1 : 'any');
    const input = el('input', { type: 'number', step, value });
    let slider = null;
    const check = () => {
      const v = Number(input.value);
      const bad = !!(input.value === '' || !Number.isFinite(v) || (meta.min != null && v < meta.min) || (meta.max != null && v > meta.max) || (meta.int && !Number.isInteger(v)));
      wrap.classList.toggle('warn', bad);
      wrap.title = bad ? `Expected ${meta.int ? 'an integer' : 'a number'}${meta.min != null ? ' from ' + meta.min : ''}${meta.max != null ? ' to ' + meta.max : ''}` : '';
    };
    if (hasRange) {
      slider = el('input', { type: 'range', min: meta.min, max: meta.max, step: meta.step ?? (meta.int ? 1 : (meta.max - meta.min) / 200), value });
      slider.addEventListener('input', () => { input.value = slider.value; commit(Number(slider.value)); });
      wrap.append(slider);
    }
    const commit = (v) => { setAt(f, path, v); check(); };
    input.addEventListener('input', () => {
      if (input.value === '' || !Number.isFinite(Number(input.value))) { check(); return; }
      let v = Number(input.value);
      if (meta.int) v = Math.round(v);
      if (slider) slider.value = v;
      commit(v);
    });
    input.addEventListener('change', () => { if (input.value !== '' && Number.isFinite(Number(input.value))) input.value = meta.int ? Math.round(Number(input.value)) : Number(input.value); });
    wrap.append(input);
    if (meta.unit) wrap.append(el('span', { class: 'unit', text: meta.unit }));
    check();
    return wrap;
  }

  function colorControl(f, path, value) {
    const wrap = el('div', { class: 'ctl color' });
    const norm = (s) => {
      if (!hexRe.test(s)) return '#000000';
      let h = s.slice(1);
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      return '#' + h.slice(0, 6).toLowerCase();
    };
    const picker = el('input', { type: 'color', value: norm(value) });
    const text = el('input', { type: 'text', value, spellcheck: 'false' });
    picker.addEventListener('input', () => {
      const alpha = hexRe.test(text.value) && text.value.length === 9 ? text.value.slice(7) : ''; // keep #rrggbbAA alpha
      text.value = picker.value + alpha;
      setAt(f, path, text.value);
    });
    text.addEventListener('input', () => {
      if (hexRe.test(text.value)) picker.value = norm(text.value);
      wrap.classList.toggle('warn', !hexRe.test(text.value));
      setAt(f, path, text.value);
    });
    wrap.append(picker, text);
    return wrap;
  }

  function valueControl(f, path, value, meta) {
    if (typeof value === 'boolean') {
      const c = el('input', { type: 'checkbox', checked: value });
      c.addEventListener('change', () => setAt(f, path, c.checked));
      return el('div', { class: 'ctl bool' }, c);
    }
    if (typeof value === 'number') return numberControl(f, path, value, meta);
    if (typeof value === 'string' && (meta.type === 'color' || hexRe.test(value))) return colorControl(f, path, value);
    if (meta.type === 'select') {
      const s = el('select', null, (meta.options || []).map((o) => el('option', { value: o, text: o, selected: o === value })));
      s.addEventListener('change', () => setAt(f, path, s.value));
      return el('div', { class: 'ctl' }, s);
    }
    if (value === null) value = '';
    const multi = meta.type === 'multiline' || String(value).length > 70;
    const i = multi ? el('textarea', { rows: 2, spellcheck: 'false' }) : el('input', { type: 'text', spellcheck: 'false' });
    i.value = value;
    i.addEventListener('input', () => setAt(f, path, i.value));
    return el('div', { class: 'ctl text' }, i);
  }

  // ------------------------------------------------------------------ tree rendering
  const keyOf = (f, path) => f.def.name + '|' + path.join('.');

  function labelFor(meta, key, path) {
    return meta.label || prettify(key);
  }

  function resetBtn(f, path) {
    return el('button', {
      class: 'reset', title: 'Revert this value to the saved one', type: 'button', text: '↺',
      onclick: (e) => {
        e.stopPropagation();
        const was = getAt(f.baseObj, path);
        if (was === undefined) return;
        structural(f, () => { getAt(f.data, path.slice(0, -1))[path[path.length - 1]] = clone(was); });
      },
    });
  }

  function fieldRow(f, path, key, value, removable) {
    const meta = metaFor(f, path);
    const row = el('div', { class: 'row', 'data-path': JSON.stringify(path), 'data-label': (labelFor(meta, key) + ' ' + path.join('.')).toLowerCase() });
    if (meta.header) row.append(el('div', { class: 'hdr', text: meta.header }));
    const line = el('div', { class: 'line' });
    line.append(
      el('label', { class: 'lbl', title: (meta.tip ? meta.tip + '\n\n' : '') + path.join('.') }, labelFor(meta, key), meta.tip ? el('span', { class: 'info', text: 'ⓘ' }) : null),
      valueControl(f, path, value, meta),
      resetBtn(f, path),
    );
    if (removable) line.append(el('button', { class: 'x', type: 'button', title: 'Remove', text: '✕', onclick: () => structural(f, () => delete getAt(f.data, path.slice(0, -1))[key]) }));
    row.append(line);
    return row;
  }

  function listRow(f, path, key, arr) { // array of plain values, edited inline
    const meta = metaFor(f, path);
    const itemMeta = metaFor(f, [...path, '0']);
    const row = el('div', { class: 'row list', 'data-path': JSON.stringify(path), 'data-label': (labelFor(meta, key) + ' ' + path.join('.')).toLowerCase() });
    const line = el('div', { class: 'line' });
    line.append(el('label', { class: 'lbl', title: (meta.tip ? meta.tip + '\n\n' : '') + path.join('.') }, labelFor(meta, key), meta.tip ? el('span', { class: 'info', text: 'ⓘ' }) : null));
    const items = el('div', { class: 'items' });
    arr.forEach((v, i) => {
      const p = [...path, String(i)];
      const m = metaFor(f, p);
      const one = el('div', { class: 'item', 'data-path': JSON.stringify(path.concat(i)) }, el('span', { class: 'ix', text: i }));
      one.dataset.path = JSON.stringify([...path, i]);
      const ctl = valueControl(f, [...path, i], v, m);
      one.append(ctl, el('button', { class: 'x', type: 'button', title: 'Remove', text: '✕', onclick: () => structural(f, () => getAt(f.data, path).splice(i, 1)) }));
      items.append(one);
    });
    items.append(el('button', {
      class: 'add small', type: 'button', text: '+',
      title: 'Add element',
      onclick: () => structural(f, () => {
        const a = getAt(f.data, path);
        a.push(a.length ? clone(a[a.length - 1]) : typeof itemMeta.min === 'number' ? 0 : '');
      }),
    }));
    line.append(items, resetBtn(f, path));
    row.append(line);
    return row;
  }

  function titleOf(f, path, item, idx) {
    const m = metaFor(f, path);
    const tpl = m.title;
    const fill = (t) => t.replace(/\{([^}]+)\}/g, (_, k) => (k === '#' ? idx + 1 : item && item[k] != null ? item[k] : '')).replace(/\s+/g, ' ').trim();
    if (tpl) { const s = fill(tpl); if (s) return s; }
    if (item && typeof item === 'object') for (const k of ['name', 'id', 'text', 'title', 'at']) if (item[k] != null) return String(item[k]);
    return '#' + (idx + 1);
  }

  function isOpen(f, path, meta) {
    const k = keyOf(f, path);
    if (state.open.has(k)) return true;
    if (state.closed.has(k)) return false;
    return !!meta.open || path.length <= 1;
  }

  function fold(f, path, key, title, bodyFn, opts) {
    const meta = metaFor(f, path);
    const k = keyOf(f, path);
    const d = el('details', { class: 'fold', 'data-path': JSON.stringify(path), 'data-label': (title + ' ' + path.join('.')).toLowerCase() });
    if (isOpen(f, path, meta)) d.open = true;
    d.addEventListener('toggle', () => {
      if (state.searchOpening) return;
      if (d.open) { state.open.add(k); state.closed.delete(k); } else { state.open.delete(k); state.closed.add(k); }
    });
    const sum = el('summary', null, el('span', { class: 'ft', title: (meta.tip ? meta.tip + '\n\n' : '') + path.join('.') }, title, meta.tip ? el('span', { class: 'info', text: 'ⓘ' }) : null), el('span', { class: 'spacer' }));
    if (opts && opts.buttons) sum.append(...opts.buttons);
    sum.append(resetBtn(f, path));
    d.append(sum);
    const body = el('div', { class: 'body' });
    d.append(body);
    let built = false;
    const build = () => { if (built) return; built = true; bodyFn(body); };
    if (d.open) build(); else d.addEventListener('toggle', build, { once: true });
    d.build = build;
    return d;
  }

  function nodeFor(f, path, key, value, removable, ctx) {
    if (Array.isArray(value)) {
      if (value.every(isPrim)) return listRow(f, path, key, value);
      return arrayNode(f, path, key, value);
    }
    if (value && typeof value === 'object') return objectNode(f, path, key, value, removable, ctx);
    return fieldRow(f, path, key, value, removable);
  }

  function objectChildren(f, path, obj, body) {
    const meta = metaFor(f, path);
    for (const [k, v] of Object.entries(obj)) {
      if (k === '_doc') { body.append(el('p', { class: 'doc', text: String(v) })); continue; }
      body.append(nodeFor(f, [...path, k], k, v, !!meta.dict));
    }
    if (meta.dict) {
      body.append(el('button', {
        class: 'add', type: 'button', text: '+ Add key',
        onclick: () => {
          const name = prompt('New key name:');
          if (!name) return;
          if (name in obj) { toast('Key already exists', 'err'); return; }
          structural(f, () => {
            const first = Object.values(obj)[0];
            obj[name] = typeof first === 'number' ? 0 : typeof first === 'string' ? '' : 0;
          });
        },
      }));
    }
  }

  function objectNode(f, path, key, obj, removable) {
    const meta = metaFor(f, path);
    const buttons = removable ? [el('button', { class: 'x', type: 'button', title: 'Remove', text: '✕', onclick: (e) => { e.preventDefault(); structural(f, () => delete getAt(f.data, path.slice(0, -1))[key]); } })] : [];
    return fold(f, path, key, labelFor(meta, key), (body) => objectChildren(f, path, obj, body), { buttons });
  }

  function arrayNode(f, path, key, arr) {
    const meta = metaFor(f, path);
    const wrap = fold(f, path, key, `${labelFor(meta, key)}  [${arr.length}]`, (body) => {
      arr.forEach((item, i) => {
        const p = [...path, String(i)];
        const im = metaFor(f, p);
        const move = (d) => (e) => { e.preventDefault(); structural(f, () => { const a = getAt(f.data, path); const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; }); };
        const buttons = [
          el('button', { class: 'ib', type: 'button', title: 'Move up', text: '↑', disabled: i === 0, onclick: move(-1) }),
          el('button', { class: 'ib', type: 'button', title: 'Move down', text: '↓', disabled: i === arr.length - 1, onclick: move(1) }),
          el('button', { class: 'ib', type: 'button', title: 'Duplicate', text: '⧉', onclick: (e) => { e.preventDefault(); structural(f, () => { const c = clone(item); if (c && typeof c.id === 'string') c.id += '-copy'; getAt(f.data, path).splice(i + 1, 0, c); }); } }),
          el('button', { class: 'ib x', type: 'button', title: 'Remove', text: '✕', onclick: (e) => { e.preventDefault(); if (confirm(`Remove "${titleOf(f, p, item, i)}"?`)) structural(f, () => getAt(f.data, path).splice(i, 1)); } }),
        ];
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const d = fold(f, p, String(i), titleOf(f, p, item, i), (b) => objectChildren(f, p, item, b), { buttons });
          d.classList.add('item-fold');
          body.append(d);
        } else {
          body.append(nodeFor(f, p, String(i), item, false));
        }
      });
      body.append(el('button', {
        class: 'add', type: 'button', text: '+ Add element',
        onclick: () => structural(f, () => {
          const a = getAt(f.data, path);
          if (!a.length) { a.push({}); return; }
          const c = clone(a[a.length - 1]);
          if (c && typeof c.id === 'string') c.id += '-new';
          a.push(c);
        }),
      }));
    });
    return wrap;
  }

  // ------------------------------------------------------------------ render + search
  function render() {
    const f = cur();
    const root = $('#inspector');
    const scroll = root.scrollTop;
    root.replaceChildren();
    root.append(el('div', { class: 'filehead' }, el('h2', { text: f.def.name }), el('span', { class: 'path', text: f.def.path })));
    if (f.meta.description) root.append(el('p', { class: 'doc', text: f.meta.description }));
    if (f.data && typeof f.data === 'object' && !Array.isArray(f.data)) {
      const box = el('div', { class: 'top' });
      objectChildren(f, [], f.data, box);
      root.append(box);
    } else {
      root.append(nodeFor(f, [], f.def.name, f.data, false));
    }
    root.append(el('p', { id: 'nomatch', class: 'doc', hidden: true, text: 'No field matches the search.' }));
    root.scrollTop = scroll;
    refreshDirty();
    applySearch();
  }

  function applySearch() {
    const q = state.search.trim().toLowerCase();
    const root = $('#inspector');
    root.classList.toggle('searching', !!q);
    const visit = (node) => {
      let any = false;
      for (const c of node.children) {
        if (c.matches('.row')) {
          const ok = !q || c.dataset.label.includes(q) || (c.querySelector('input[type=text],input[type=number],textarea') && [...c.querySelectorAll('input[type=text],input[type=number],textarea')].some((i) => i.value.toLowerCase().includes(q)));
          c.hidden = !ok;
          any ||= ok;
        } else if (c.matches('details.fold')) {
          if (q) { state.searchOpening = true; c.open = true; c.build && c.build(); state.searchOpening = false; }
          const body = c.querySelector(':scope > .body');
          const self = !q || c.dataset.label.includes(q);
          let sub = false;
          if (body) {
            if (self && q) { body.querySelectorAll('[hidden]').forEach((n) => (n.hidden = false)); sub = true; } else sub = visit(body);
          }
          c.hidden = !(self || sub);
          any ||= !c.hidden;
        } else if (c.matches('.doc,.add')) {
          c.hidden = !!q;
        }
      }
      return any;
    };
    visit(root.querySelector('.top') || root);
    if (q) $('#nomatch').hidden = !!root.querySelector('.row:not([hidden]), details.fold:not([hidden])'); else $('#nomatch').hidden = true;
  }

  // ------------------------------------------------------------------ files: load / save
  function registerFile(def, text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { toast(`${def.name}: invalid JSON (${e.message})`, 'err'); return; }
    state.files[def.name] = {
      def, data, baseObj: clone(data), baseStr: JSON.stringify(data),
      inline: FMT.detectInline(text), undo: [], redo: [],
      meta: META[def.name] || { fields: [] }, metaCache: new Map(), handle: state.files[def.name]?.handle,
    };
  }

  function buildSidebar() {
    const list = $('#files');
    list.replaceChildren();
    let group = '';
    for (const def of FILES) {
      if (!state.files[def.name]) continue;
      if (def.group !== group) { group = def.group; list.append(el('div', { class: 'grp', text: group })); }
      list.append(el('button', {
        class: 'file' + (def.name === state.current ? ' sel' : ''), type: 'button', 'data-file': def.name,
        onclick: () => select(def.name),
      }, el('span', { class: 'dot' + (isDirty(state.files[def.name]) ? ' on' : '') }), def.name));
    }
  }

  function select(name) {
    state.current = name;
    document.querySelectorAll('#files .file').forEach((b) => b.classList.toggle('sel', b.dataset.file === name));
    render();
  }

  function afterLoad() {
    $('#welcome').hidden = true;
    $('#app').hidden = false;
    buildSidebar();
    const first = state.current && state.files[state.current] ? state.current : FILES.find((d) => state.files[d.name])?.name;
    if (first) select(first);
    $('#mode').textContent = { server: 'Connected: saves straight to the project files', fs: 'Folder opened: saves straight to the project files', manual: 'Offline: Save downloads the file', none: '' }[state.mode];
    $('#mode').dataset.mode = state.mode;
  }

  async function loadFromServer() {
    const r = await fetch('/api/files', { cache: 'no-store' });
    if (!r.ok) throw new Error('no server');
    const { files } = await r.json();
    for (const f of files) if (f.text != null) registerFile(f, f.text);
    state.mode = 'server';
    afterLoad();
  }

  async function openFolder() {
    if (!window.showDirectoryPicker) { toast('This browser cannot open folders. Use "Open files" instead.', 'err'); return; }
    let dir;
    try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch { return; }
    state.dir = dir;
    let n = 0;
    for (const def of FILES) {
      try {
        let d = dir;
        const parts = def.path.split('/');
        for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
        const handle = await d.getFileHandle(parts.at(-1));
        const text = await (await handle.getFile()).text();
        registerFile(def, text);
        state.files[def.name].handle = handle;
        n++;
      } catch { /* not in this folder */ }
    }
    if (!n) { toast('Pick the hexablow project folder (the one that contains src/).', 'err'); return; }
    state.mode = 'fs';
    afterLoad();
  }

  async function openFiles(fileList) {
    let n = 0;
    for (const file of fileList) {
      const def = FILES.find((d) => d.name === file.name);
      if (!def) continue;
      registerFile(def, await file.text());
      n++;
    }
    if (!n) { toast('None of those files are known config files.', 'err'); return; }
    state.mode = 'manual';
    afterLoad();
  }

  async function saveFile(f) {
    const text = FMT.stringify(f.data, f.inline);
    if (state.mode === 'server') {
      const r = await fetch('/api/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: f.def.name, text }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    } else if (state.mode === 'fs' && f.handle) {
      const w = await f.handle.createWritable();
      await w.write(text);
      await w.close();
    } else {
      const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: f.def.name });
      document.body.append(a);
      a.click();
      a.remove();
    }
    f.baseObj = clone(f.data);
    f.baseStr = JSON.stringify(f.data);
  }

  async function save(all) {
    const targets = all ? Object.values(state.files).filter(isDirty) : [cur()];
    let ok = 0;
    for (const f of targets) {
      if (!isDirty(f)) continue;
      try { await saveFile(f); ok++; } catch (e) { toast(`Could not save ${f.def.name}: ${e.message}`, 'err'); return; }
    }
    if (ok) toast(state.mode === 'manual' ? `Downloaded ${ok} file(s). Copy them over the originals.` : `Saved ${ok} file(s).`, 'ok');
    refreshDirty();
    if (ok && $('#autoReload').checked) reloadPreview();
  }

  function revert() {
    const f = cur();
    if (!isDirty(f) || !confirm(`Discard all unsaved changes in ${f.def.name}?`)) return;
    beforeChange(f);
    f.data = clone(f.baseObj);
    f.undoLock = null;
    render();
  }

  // ------------------------------------------------------------------ live preview
  function reloadPreview() {
    const fr = $('#preview');
    if (!fr.src) fr.src = $('#previewUrl').value;
    else setTimeout(() => { try { fr.contentWindow.location.reload(); } catch { fr.src = fr.src; } }, 400);
  }

  function togglePreview(on) {
    $('#previewPane').hidden = !on;
    $('#togglePreview').classList.toggle('on', on);
    if (on) { const fr = $('#preview'); if (!fr.getAttribute('src')) fr.src = $('#previewUrl').value; }
    try { localStorage.setItem('hexablow.cfgtool.preview', on ? '1' : '0'); } catch { /* ignore */ }
  }

  // ------------------------------------------------------------------ wiring
  function init() {
    $('#undo').onclick = () => undo(false);
    $('#redo').onclick = () => undo(true);
    $('#save').onclick = () => save(false);
    $('#saveAll').onclick = () => save(true);
    $('#revert').onclick = revert;
    $('#openFolder').onclick = openFolder;
    $('#openFolder2').onclick = openFolder;
    $('#openFiles').onchange = (e) => openFiles(e.target.files);
    $('#openFiles2').onchange = (e) => openFiles(e.target.files);
    $('#search').addEventListener('input', (e) => { state.search = e.target.value; applySearch(); });
    $('#expandAll').onclick = () => {
      document.querySelectorAll('#inspector details.fold').forEach((d) => { state.searchOpening = true; d.open = true; d.build && d.build(); state.searchOpening = false; });
    };
    $('#collapseAll').onclick = () => { document.querySelectorAll('#inspector details.fold').forEach((d) => (d.open = false)); };
    $('#togglePreview').onclick = () => togglePreview($('#previewPane').hidden);
    $('#reloadPreview').onclick = () => { const fr = $('#preview'); fr.src = $('#previewUrl').value; };
    $('#previewUrl').addEventListener('change', () => { $('#preview').src = $('#previewUrl').value; });
    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (state.current) save(e.shiftKey); }
      else if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#search').focus(); $('#search').select(); }
      else if (mod && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(e.shiftKey); }
    });
    window.addEventListener('beforeunload', (e) => { if (Object.values(state.files).some(isDirty)) { e.preventDefault(); e.returnValue = ''; } });
    $('#fsHint').hidden = !!window.showDirectoryPicker;
    if (!window.showDirectoryPicker) $('#openFolder').hidden = $('#openFolder2').hidden = true;

    let wantPreview = false;
    try { wantPreview = localStorage.getItem('hexablow.cfgtool.preview') === '1'; } catch { /* ignore */ }
    if (location.protocol.startsWith('http')) {
      loadFromServer().then(() => togglePreview(wantPreview)).catch(() => { $('#welcome').hidden = false; });
    } else {
      $('#welcome').hidden = false;
    }
    window.__cfg = state; // for debugging in the console
  }

  init();
})();
