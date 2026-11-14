/* Hexablow Level Tool — SVG helpers shared by the editor board and the playtest board. */
(function (g) {
  const HB = g.HB;
  const V = (HB.view = { R: 26 });

  V.xy = (c, R) => HB.toPixel(c[0], c[1], R || V.R);

  /** viewBox string covering the cells with padding; keeps a minimum size so tiny boards are not huge. */
  V.vbFor = function (cells, R, minW) {
    R = R || V.R;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of cells) {
      const p = V.xy(c, R);
      x0 = Math.min(x0, p.x - R); x1 = Math.max(x1, p.x + R);
      y0 = Math.min(y0, p.y - R); y1 = Math.max(y1, p.y + R);
    }
    if (!isFinite(x0)) { x0 = -3 * R; x1 = 3 * R; y0 = -3 * R; y1 = 3 * R; }
    const pad = R * 0.6;
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    const mw = (minW || 5) * R * 1.8;
    if (x1 - x0 < mw) { const m = (x0 + x1) / 2; x0 = m - mw / 2; x1 = m + mw / 2; }
    if (y1 - y0 < mw) { const m = (y0 + y1) / 2; y0 = m - mw / 2; y1 = m + mw / 2; }
    return [x0, y0, x1 - x0, y1 - y0].map((v) => v.toFixed(1)).join(' ');
  };

  V.hex = function (c, cls, attrs, R) {
    R = R || V.R;
    const p = V.xy(c, R);
    return `<polygon class="${cls}" points="${HB.hexPoints(p.x, p.y, R - 1.5)}" data-q="${c[0]}" data-r="${c[1]}" ${attrs || ''}/>`;
  };
  V.text = function (c, s, cls, dy, R) {
    const p = V.xy(c, R || V.R);
    return `<text class="${cls || 'num'}" x="${p.x.toFixed(1)}" y="${(p.y + (dy || 0)).toFixed(1)}">${s}</text>`;
  };
  V.line = function (a, b, cls, R) {
    const p = V.xy(a, R || V.R), q = V.xy(b, R || V.R);
    return `<line class="${cls}" x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}"/>`;
  };
  V.circle = function (c, r, cls, R) {
    const p = V.xy(c, R || V.R);
    return `<circle class="${cls}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}"/>`;
  };

  // ---- mechanic overlays (editor board + playtest board) ----
  const PCOL = ['#18b5ae', '#e0529c', '#4d86ee', '#e08a1e'];
  V.portalColor = (i) => PCOL[i % PCOL.length];
  /** Twin portals: a coloured ring on both ends, a letter badge and a dashed link. `covered(k)` -> end is under a tile. */
  V.portalLayer = function (portals, R) {
    let h = '';
    (portals || []).forEach(([a, b], i) => {
      const col = V.portalColor(i), pa = V.xy(a, R), pb = V.xy(b, R), L = String.fromCharCode(65 + (i % 26));
      h += `<line class="plink" style="stroke:${col}" x1="${pa.x.toFixed(1)}" y1="${pa.y.toFixed(1)}" x2="${pb.x.toFixed(1)}" y2="${pb.y.toFixed(1)}"/>`;
      for (const c of [a, b]) {
        const p = V.xy(c, R);
        h += `<polygon class="pring" style="stroke:${col}" points="${HB.hexPoints(p.x, p.y, (R || V.R) - 4)}"/>`;
        h += `<circle class="pbadge" style="fill:${col}" cx="${(p.x + (R || V.R) * 0.55).toFixed(1)}" cy="${(p.y - (R || V.R) * 0.5).toFixed(1)}" r="8"/>`;
        h += `<text class="pbadgeT" x="${(p.x + (R || V.R) * 0.55).toFixed(1)}" y="${(p.y - (R || V.R) * 0.5).toFixed(1)}">${L}</text>`;
      }
    });
    return h;
  };
  /** Padlocks: dimmed cell with the number of cells still to solve (`left(lock)` overrides the label). */
  V.lockLayer = function (locks, label, R) {
    let h = '';
    for (const l of locks || []) {
      h += V.hex(l.cell, 'lockc', '', R);
      h += V.text(l.cell, '🔒' + (label ? label(l) : l.need), 'lockT', 0, R);
    }
    return h;
  };
  /** "?" mark on mystery givens. */
  V.mysteryLayer = function (cells, R) {
    return (cells || []).map((c) => V.hex(c, 'myst', '', R)).join('');
  };

  /** pointer event -> axial cell under it, for an <svg> drawn with V.* helpers (origin = axial 0,0) */
  V.pick = function (svg, clientX, clientY, R) {
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = pt.matrixTransform(m.inverse());
    return HB.fromPixel(p.x, p.y, R || V.R);
  };

  /** screen px per svg unit */
  V.scale = function (svg) {
    const m = svg.getScreenCTM();
    return m ? m.a : 1;
  };
})(typeof window !== 'undefined' ? window : globalThis);
