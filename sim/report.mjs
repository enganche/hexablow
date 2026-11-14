// Static HTML report for sim/run.mjs (self-contained: data embedded, charts drawn as inline SVG in the page).
export function renderHtml(report) {
  const data = JSON.stringify(report).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hexablow Bot Report</title>
<style>
:root{color-scheme:light;--bg:#f6f5f1;--surface:#fcfcfb;--line:#e4e2dc;--grid:#ecebe6;--text:#0b0b0b;--text2:#52514e;--muted:#8a8984;
--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--warn:#b25e00;--bad:#c62f2f;--good:#1f7a3a}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])){color-scheme:dark;--bg:#121211;--surface:#1a1a19;--line:#2e2d2b;--grid:#262624;--text:#f0efec;--text2:#c3c2b7;--muted:#8d8c86;
--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--warn:#e39a3b;--bad:#ef6b6b;--good:#5cc27a}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#121211;--surface:#1a1a19;--line:#2e2d2b;--grid:#262624;--text:#f0efec;--text2:#c3c2b7;--muted:#8d8c86;
--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--warn:#e39a3b;--bad:#ef6b6b;--good:#5cc27a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 6px}
.sub{color:var(--text2);margin:0 0 12px}.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px;margin:10px 0;overflow-x:auto}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;font-size:13px}th,td{padding:5px 8px;border-bottom:1px solid var(--grid);text-align:right;white-space:nowrap}
th{color:var(--text2);font-weight:600}th:first-child,td:first-child{text-align:left}td.l{text-align:left;white-space:normal}
.flag{color:var(--warn)}.bad{color:var(--bad);font-weight:600}.good{color:var(--good)}
.legend{display:flex;flex-wrap:wrap;gap:14px;color:var(--text2);font-size:13px;margin:4px 0 6px}.legend i{display:inline-block;width:14px;height:3px;border-radius:2px;vertical-align:middle;margin-right:6px}
.chart{position:relative}.chart svg{display:block;width:100%;height:auto}.tip{position:absolute;pointer-events:none;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:6px 9px;font-size:12px;box-shadow:0 4px 14px rgba(0,0,0,.12);display:none;white-space:nowrap}
.tip b{display:block;margin-bottom:2px}.tip span{display:inline-block;width:10px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.kpi{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 12px}.kpi b{font-size:20px;display:block}.kpi small{color:var(--text2)}
code{font-size:12px}
</style></head><body><main>
<h1>Hexablow — báo cáo bot</h1>
<p class="sub" id="meta"></p>
<div class="kpis" id="kpis"></div>

<section id="lab"><h2>1. Độ khó thuần (lab)</h2>
<p class="sub">Mỗi persona chơi mỗi level nhiều lượt từ đầu, không booster, không revive, 3 tim (kể cả level 1–2), thua thì chơi lại. "Mix" = trung bình theo tỉ trọng persona.</p>
<div class="card"><b>Tỉ lệ thắng ngay lần đầu</b><div class="legend" id="lg1"></div><div class="chart" id="c1"></div></div>
<div class="card"><table id="t1"></table></div></section>

<section id="career"><h2>2. Phễu & hành vi trong career</h2>
<p class="sub">Bot chơi theo ngày với kinh tế thật: daily reward, quà shop, revive tốn xu, mua booster, xem ads, mua cosmetic, có thể bỏ game khi nản.</p>
<div class="card"><b>Tỉ lệ người chơi đi tới level</b><div class="legend" id="lg2"></div><div class="chart" id="c2"></div></div>
<div class="card"><table id="t2"></table></div>

<h2>3. Kinh tế</h2>
<div class="card"><b>Số xu (median) theo ngày</b><div class="legend" id="lg3"></div><div class="chart" id="c3"></div></div>
<div class="card"><b>Nguồn / tiêu xu trung bình mỗi bot</b><table id="t3"></table></div>
<div class="card"><b>Tổng kết theo persona</b><table id="t4"></table></div></section>
</main>
<script>
const R = ${data};
const P = R.meta.personas;
const COL = (i) => 'var(--s' + (i + 1) + ')';
const pct = (x) => (x * 100).toFixed(0) + '%';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

$('meta').textContent = 'Seed ' + R.meta.seed + ' · ' + R.meta.plays + ' lượt lab/persona/level · ' + R.meta.bots + ' bot career/persona · ' + R.meta.levels.length + ' level · ' + new Date(R.meta.date).toLocaleString();

function legend(el) { el.innerHTML = P.map((p, i) => '<span><i style="background:' + COL(i) + '"></i>' + esc(p.name) + ' (' + pct(p.share) + ')</span>').join(''); }

/** Line chart with crosshair tooltip. series: [{name, color, values}], xs labels. */
function lineChart(el, xs, series, o) {
  const w = 900, h = 300, m = { l: 46, r: 14, t: 12, b: 30 };
  const iw = w - m.l - m.r, ih = h - m.t - m.b;
  const max = o.max ?? Math.max(1, ...series.flatMap((s) => s.values.filter((v) => v != null)));
  const x = (i) => m.l + (xs.length < 2 ? iw / 2 : (i * iw) / (xs.length - 1));
  const y = (v) => m.t + ih - (v / max) * ih;
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const v = (max * k) / 4, yy = y(v);
    g += '<line x1="' + m.l + '" x2="' + (w - m.r) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--grid)"/>';
    g += '<text x="' + (m.l - 6) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="11" fill="var(--muted)">' + o.fmt(v) + '</text>';
  }
  xs.forEach((lab, i) => { g += '<text x="' + x(i) + '" y="' + (h - 10) + '" text-anchor="middle" font-size="11" fill="var(--muted)">' + esc(lab) + '</text>'; });
  for (const s of series) {
    const pts = s.values.map((v, i) => (v == null ? null : x(i) + ',' + y(v))).filter(Boolean);
    g += '<polyline fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linejoin="round" points="' + pts.join(' ') + '"/>';
    s.values.forEach((v, i) => { if (v != null) g += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="3" fill="' + s.color + '" stroke="var(--surface)" stroke-width="2"/>'; });
  }
  g += '<line id="xh" y1="' + m.t + '" y2="' + (m.t + ih) + '" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/>';
  el.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(o.label) + '">' + g + '<rect x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '" fill="transparent"/></svg><div class="tip"></div>';
  const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), xh = svg.querySelector('#xh');
  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * w;
    const i = Math.max(0, Math.min(xs.length - 1, Math.round(((px - m.l) / iw) * (xs.length - 1))));
    xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('visibility', 'visible');
    tip.innerHTML = '<b>' + esc(o.xName + ' ' + xs[i]) + '</b>' + series.map((s) => '<div><span style="background:' + s.color + '"></span>' + esc(s.name) + ': ' + (s.values[i] == null ? '–' : o.fmt(s.values[i])) + '</div>').join('');
    tip.style.display = 'block';
    const left = (x(i) / w) * r.width;
    tip.style.left = Math.min(left + 12, r.width - tip.offsetWidth - 4) + 'px';
    tip.style.top = '8px';
  });
  svg.addEventListener('pointerleave', () => { tip.style.display = 'none'; xh.setAttribute('visibility', 'hidden'); });
}

function table(el, head, rows) {
  el.innerHTML = '<thead><tr>' + head.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.map((r) => '<tr>' + r.map((c) => '<td' + (c && c.cls ? ' class="' + c.cls + '"' : '') + '>' + (c && c.v != null ? c.v : c) + '</td>').join('') + '</tr>').join('') + '</tbody>';
}

const kpis = [];
if (R.lab) {
  const lab = R.lab;
  legend($('lg1'));
  lineChart($('c1'), lab.map((r) => r.level), P.map((p, i) => ({ name: p.name, color: COL(i), values: lab.map((r) => r.by[p.id].firstWin) })), { max: 1, fmt: pct, xName: 'Level', label: 'Tỉ lệ thắng lần đầu theo level' });
  table($('t1'), ['Lv', 'Nhãn', 'Ô', 'Cơ chế', 'Thắng lần 1', 'Lần thử TB', 'Sai / lượt', '3★ khi thắng', 'T.gian tới thắng', ...P.map((p) => esc(p.name)), 'Cờ'],
    lab.map((r) => [r.level, r.difficulty, r.cells, (r.mech || []).join(' + ') || '–', { v: pct(r.mix.firstWin), cls: r.mix.firstWin < 0.5 ? 'bad' : '' }, r.mix.attempts.toFixed(2), r.mix.mistakes.toFixed(2), pct(r.mix.threeStar), (r.mix.timeToWin / 60).toFixed(1) + ' ph',
      ...P.map((p) => pct(r.by[p.id].firstWin)), { v: r.flags.map(esc).join('<br>'), cls: 'l flag' }]));
  const hardest = [...lab].sort((a, b) => a.mix.firstWin - b.mix.firstWin)[0];
  kpis.push(['Level khó nhất', 'Lv ' + hardest.level, pct(hardest.mix.firstWin) + ' thắng lần đầu']);
  kpis.push(['Cờ cảnh báo', lab.reduce((a, r) => a + r.flags.length, 0), 'spike / lệch nhãn / quá lâu']);
}
if (R.career) {
  const C = R.career;
  legend($('lg2')); legend($('lg3'));
  lineChart($('c2'), C.levels.map((r) => r.level), P.map((p, i) => ({ name: p.name, color: COL(i), values: C.levels.map((r) => r.by[p.id].reached) })), { max: 1, fmt: pct, xName: 'Level', label: 'Tỉ lệ người chơi tới mỗi level' });
  table($('t2'), ['Lv', 'Tới (mix)', 'Qua', 'Thua / lượt', 'Lượt tới khi qua', 'Booster / lần qua', 'Revive / lần qua', 'Bỏ game tại đây', ...P.map((p) => 'Xu sau qua · ' + esc(p.name))],
    C.levels.map((r) => [r.level, pct(r.mix.reached), pct(r.mix.cleared), { v: pct(r.mix.failRate), cls: r.mix.failRate > 0.4 ? 'bad' : '' }, r.mix.attemptsPerClear.toFixed(2), r.mix.boostersPerClear.toFixed(2), r.mix.revivesPerClear.toFixed(2),
      { v: (r.mix.churnHere * 100).toFixed(1) + '%', cls: r.mix.churnHere > 0.03 ? 'bad' : '' }, ...P.map((p) => r.by[p.id].coinsAfter || '–')]));
  const days = Array.from({ length: C.days }, (_, d) => d + 1);
  lineChart($('c3'), days, P.map((p, i) => ({ name: p.name, color: COL(i), values: C.byPersona[p.id].coinsByDay.map((x) => (x.active > 0 ? x.p50 : null)) })), { fmt: (v) => Math.round(v), xName: 'Ngày', label: 'Số xu median theo ngày' });
  const src = ['start', 'win', 'replay', 'daily', 'chest', 'shopGift', 'set', 'iap'], sink = ['booster', 'revive', 'cosmetic'];
  const lab2 = { start: 'Khởi đầu', win: 'Thắng lần đầu', replay: 'Chơi lại', daily: 'Daily', chest: 'Rương streak', shopGift: 'Quà shop', set: 'Bộ sưu tập', iap: 'IAP', booster: '− Booster', revive: '− Revive', cosmetic: '− Cosmetic' };
  table($('t3'), ['Persona', ...[...src, ...sink].map((k) => lab2[k]), 'Ròng'], P.map((p) => {
    const L = C.byPersona[p.id].ledger;
    const net = src.reduce((a, k) => a + L[k], 0) - sink.reduce((a, k) => a + L[k], 0);
    return [esc(p.name), ...[...src, ...sink].map((k) => Math.round(L[k])), Math.round(net)];
  }));
  table($('t4'), ['Persona', 'Xong hết', 'Bỏ game', 'Ngày chơi', 'Level (p50)', 'Xu cuối p25/p50/p75', 'Booster mua / ads / quà / IAP', 'Booster tồn', 'Cosmetic đầu tiên', 'Ads / bot', '$ / bot', 'Payer'],
    P.map((p) => {
      const c = C.byPersona[p.id], b = c.boostersAcquired;
      return [esc(p.name), pct(c.finishedAll), { v: pct(c.churned), cls: c.churned > 0.2 ? 'bad' : '' }, c.daysPlayed.toFixed(1), c.maxLevel, c.finalCoins.p25 + ' / ' + c.finalCoins.p50 + ' / ' + c.finalCoins.p75,
        [b.bought, b.ad, b.gift, b.iap].map((x) => x.toFixed(1)).join(' / '), c.boostersLeft.toFixed(1),
        c.firstCosmetic.share ? pct(c.firstCosmetic.share) + ' · ngày ' + c.firstCosmetic.day + ' · lv ' + c.firstCosmetic.level : '–', c.ads.toFixed(1), '$' + c.revenue.toFixed(2), pct(c.payers)];
    }));
  const mixW = Object.fromEntries(P.map((p) => [p.id, p.share]));
  const churn = P.reduce((a, p) => a + mixW[p.id] * C.byPersona[p.id].churned, 0);
  const done = P.reduce((a, p) => a + mixW[p.id] * C.byPersona[p.id].finishedAll, 0);
  const cheapest = C.cosmeticPrices[0];
  kpis.push(['Hoàn thành 15 level', pct(done), 'mix, sau ' + C.days + ' ngày']);
  kpis.push(['Bỏ game', pct(churn), 'mix']);
  if (cheapest) kpis.push(['Set rẻ nhất', cheapest.price + ' xu', esc(cheapest.name)]);
}
$('kpis').innerHTML = kpis.map(([a, b, c]) => '<div class="kpi"><small>' + a + '</small><b>' + b + '</b><small>' + c + '</small></div>').join('');
if (!R.lab) $('lab').remove();
if (!R.career) $('career').remove();
</script></body></html>`;
}
