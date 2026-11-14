/* Hexablow Level Tool — hex core. Classic script (no ES modules) so the tool opens straight from file://.
 * Everything lives on the global `HB`. In Node the same file works through vm / globalThis. */
(function (g) {
  const HB = (g.HB = g.HB || {});

  HB.DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  HB.key = (q, r) => q + ',' + r;
  HB.parse = (k) => k.split(',').map(Number);
  HB.dist = (a, b) => {
    const dq = a[0] - b[0], dr = a[1] - b[1];
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  };
  HB.adjacent = (a, b) => HB.dist(a, b) === 1;
  HB.neighbors = (c) => HB.DIRS.map(([dq, dr]) => [c[0] + dq, c[1] + dr]);

  /** Twin portals: cell key -> partner cell [q,r]. `portals` = [[[q,r],[q,r]], ...]. */
  HB.portalMap = function (portals) {
    const m = new Map();
    for (const [a, b] of portals || []) { m.set(HB.key(a[0], a[1]), b); m.set(HB.key(b[0], b[1]), a); }
    return m;
  };
  /** Neighbours for the number chain: touching on the grid, or the two ends of a portal pair. */
  HB.linked = function (pmap, a, b) {
    if (HB.adjacent(a, b)) return true;
    const p = pmap && pmap.get(HB.key(a[0], a[1]));
    return !!p && p[0] === b[0] && p[1] === b[1];
  };

  HB.rng = function (seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  HB.shuffle = function (arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  HB.hexRegion = function (radius) {
    const cells = [];
    for (let q = -radius; q <= radius; q++)
      for (let r = -radius; r <= radius; r++) if (Math.abs(q + r) <= radius) cells.push([q, r]);
    return cells;
  };
  HB.minus = function (region, holes) {
    const h = new Set(holes.map(([q, r]) => HB.key(q, r)));
    return region.filter(([q, r]) => !h.has(HB.key(q, r)));
  };

  // pointy-top, screen style (y down)
  const S3 = Math.sqrt(3);
  HB.toPixel = (q, r, R) => ({ x: S3 * R * (q + r / 2), y: 1.5 * R * r });
  HB.fromPixel = function (x, y, R) {
    const qf = ((S3 / 3) * x - y / 3) / R, rf = ((2 / 3) * y) / R, sf = -qf - rf;
    let q = Math.round(qf), r = Math.round(rf), s = Math.round(sf);
    const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
    if (dq > dr && dq > ds) q = -r - s;
    else if (dr > ds) r = -q - s;
    return [q + 0, r + 0];
  };
  HB.hexPoints = function (cx, cy, R) {
    const p = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      p.push((cx + R * Math.cos(a)).toFixed(2) + ',' + (cy + R * Math.sin(a)).toFixed(2));
    }
    return p.join(' ');
  };

  /** connected components of a set of cell keys (6-neighbourhood) */
  HB.components = function (keys) {
    const left = new Set(keys), out = [];
    while (left.size) {
      const s = left.values().next().value;
      const comp = [s], st = [s];
      left.delete(s);
      while (st.length) {
        const [q, r] = HB.parse(st.pop());
        for (const [dq, dr] of HB.DIRS) {
          const k = HB.key(q + dq, r + dr);
          if (left.has(k)) { left.delete(k); comp.push(k); st.push(k); }
        }
      }
      out.push(comp);
    }
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
