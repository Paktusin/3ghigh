// Каталог стилей карты — служебная страница: все виды точек интереса, линий и
// площадей, как их нарисует прошивка (архив MapStyles, src/xar.js), с подписями,
// номерами растров и тем, какие теги OSM мы в каждый вид кладём. Нужна, чтобы
// видеть всё разом и решать, что на что заменить (значок категории, класс
// дороги, слой площади).
//
//   node src/catalog.js [архив.xar] [--out out/preview/catalog.html] [--no-counts]
//
// Без --no-counts считает, сколько точек Кипра попало в каждую категорию
// (разбор out/cyp/cyprus-latest.osm.pbf, десяток секунд).
const fs = require('fs');
const path = require('path');
const xar = require('./xar');
const litpoi = require('./litpoi');
const cyppoi = require('./cyppoi');
const gdbgen = require('./gdbgen');
const osmareas = require('./osmareas');
const litkeys = require('./litkeys');

const DEFAULT_XAR = 'maps/pkgdb/StyleDBMMI3G_ECE_94/MMI3G_MapArchive_H_04_01.xar';
const PBF = 'out/cyp/cyprus-latest.osm.pbf';
// индексы масштаба, на которых показываем образцы линий (0 — ближе всего)
const SAMPLE_SCALES = [0, 6, 12, 18, 23, 28, 34, 40];
const HIGHWAYS = ['motorway', 'motorway_link', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'river'];
// слой площадей генератора → атрибут GDB
const LAYER_ATTR = Object.fromEntries(gdbgen.OVERLAY.map(o => [o.cls, o.attr]));

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hexA = c => xar.rgb(c) + (xar.alpha(c) === 255 ? '' : Math.round(xar.alpha(c)).toString(16).padStart(2, '0'));
const range = e => e.from === e.to ? String(e.from) : e.from + '–' + e.to;

function bitmapUri(a, id, cache) {
  if (cache.has(id)) return cache.get(id);
  let uri = null;
  try { uri = 'data:image/png;base64,' + xar.png(xar.bitmap(a, id)).toString('base64'); } catch (e) { uri = null; }
  cache.set(id, uri);
  return uri;
}

// Наши правила: какие теги OSM ведут в категорию POI / класс линии / слой площади
// с учётом переназначений cyppoi.REMAP: у исходной категории — пометка «→ куда»
function ourPoiTags() {
  const m = new Map();
  const add = (n, x) => { if (!m.has(n)) m.set(n, []); m.get(n).push(...x); };
  for (const [name, tags] of cyppoi.BY_CATEGORY) {
    const to = cyppoi.REMAP[name];
    if (to) { add(cyppoi.catNo(name), ['→ ' + to]); add(cyppoi.catNo(to), tags); }
    else add(cyppoi.catNo(name), tags);
  }
  return m;
}
function ourLineTags() {
  const m = new Map();
  for (const hw of HIGHWAYS) {
    for (let lv = 0; lv < 12; lv++) {
      // только уровни, куда генератор этот вид дороги вообще пускает
      if (!gdbgen.linesForLevel([{ cls: hw }], lv).length) continue;
      const c = gdbgen.classFor(lv, hw);
      const key = c.cls;
      if (!m.has(key)) m.set(key, new Map());
      const byHw = m.get(key);
      if (!byHw.has(hw)) byHw.set(hw, []);
      byHw.get(hw).push(lv + (c.e9 === 0xff ? '' : '/' + c.e9));
    }
  }
  return m;
}
function ourAreaTags() {
  const m = new Map();
  for (const [layer, sels] of osmareas.AREA_TAGS) m.set(LAYER_ATTR[layer], { layer, sels });
  return m;
}

// Типы, которые карта вообще рисует: поле 0x49 шапки POI (структура 0x20) в LIT —
// по ним CLitPoiTileDb строит тайлы точек (docs/formats/xar.md). Точка другого
// типа на карту не попадает, даже если стиль у типа есть.
const LIT_DIR = 'out/cyprus/pkgdb/LIT';
function mapTypes() {
  if (!fs.existsSync(LIT_DIR)) return null;
  const o = litkeys.open([LIT_DIR]);
  for (let i = 0; i < o.cat.length; i++) {
    const k = o.get(i);
    if (!k.els.length || k.els[0].type !== 0x20) continue;
    const n = k.els[0].f['44'] !== undefined ? k.els[0].f['44'] : 58;
    const t = k.els.slice(1).map(e => e.f && e.f['49']).filter(v => v !== undefined);
    return new Set(t.slice(0, n));
  }
  return null;
}

function poiCounts() {
  const n = new Map();
  for (const p of cyppoi.collect(PBF)) n.set(p.cat, (n.get(p.cat) || 0) + 1);
  return n;
}

// ── разделы страницы ──────────────────────────────────────────────────────

function poiSection(a, day, night, counts, cache, onMap) {
  const tags = ourPoiTags();
  const nums = new Set([...day.styles.keys()]);
  for (let i = 1; i <= litpoi.CATEGORIES.length; i++) nums.add(i);
  const rows = [...nums].sort((x, y) => x - y).map(n => {
    const subs = day.styles.get(n);
    const nsubs = night.styles.get(n);
    const name = litpoi.category(n) || '—';
    const cnt = counts ? (counts.get(n) || 0) : null;
    const icons = subs ? [...subs].map(([s, es]) => {
      const e = es[0];
      const ne = nsubs && nsubs.get(s) && nsubs.get(s)[0];
      const img = id => { const u = bitmapUri(a, id, cache); return u ? '<img src="' + u + '" alt="" loading="lazy">' : '<span class="miss">?</span>'; };
      return '<figure><span class="pair">' + img(e.bitmap) + (ne && ne.bitmap !== e.bitmap ? '<span class="night">' + img(ne.bitmap) + '</span>' : '') + '</span>' +
        '<figcaption>sub' + s + '<br>#' + e.bitmap + ' ' + e.w + '×' + e.h + '<br>м ' + es.map(range).join(', ') + '</figcaption></figure>';
    }).join('') : '<span class="miss">стиля нет — значок не рисуется' + (cnt ? ': наши ' + cnt + ' точек на карте не видны' : '') + '</span>';
    const ours = tags.get(n);
    const shown = subs && (!onMap || onMap.has(n));
    const cls = shown ? '' : cnt ? ' class="nostyle lost"' : ' class="nostyle"';
    const mapCell = onMap ? '<td class="num">' + (onMap.has(n) ? '✓' : '') + '</td>' : '';
    return '<tr' + cls + '><td class="num">' + n + '</td><td>' + esc(name) + '</td>' + mapCell +
      '<td class="icons">' + icons + '</td>' +
      '<td>' + (ours ? (ours.length ? ours.map(t => '<code>' + esc(t) + '</code>').join(' ') : '<span class="miss">в OSM нет</span>') : '') + '</td>' +
      (counts ? '<td class="num">' + (cnt || '') + '</td>' : '') + '</tr>';
  }).join('\n');
  return '<h2 id="poi">Точки интереса: категории LIT → значки</h2>' +
    '<p>Номер — категория LIT (поле 0x4f, таблица NAVRESOURCE <code>XAC</code> с единицы). Ключ стиля — <code>poi&lt;номер&gt;/sub&lt;M&gt;</code>; у заправок M — бренд. ' +
    'Под значком: номер растра в архиве, размер, индексы масштаба, где значок виден. Тёмный значок справа — ночной, если отличается. ' +
    '«На карте» — тип есть в шапке POI нашего LIT (поле 0x49): только такие точки попадают в тайлы карты, остальные живут в поиске. ' +
    'Красным — категории, где у нас есть точки Кипра, но на карте их не видно (нет стиля или типа нет в шапке).</p>' +
    '<table><thead><tr><th>№</th><th>категория</th>' + (onMap ? '<th>на карте</th>' : '') + '<th>значки (день / ночь)</th><th>наши теги OSM</th>' + (counts ? '<th>точек Кипра</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function lineSvg(e) {
  if (!e) return '<span class="miss">—</span>';
  const w = 80, h = 28, y = h / 2;
  const casing = e.outerWidth > e.width ? '<line x1="6" y1="' + y + '" x2="' + (w - 6) + '" y2="' + y + '" stroke="' + hexA(e.outerColor) + '" stroke-width="' + e.outerWidth + '" stroke-linecap="round"/>' : '';
  return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + casing +
    '<line x1="6" y1="' + y + '" x2="' + (w - 6) + '" y2="' + y + '" stroke="' + hexA(e.color) + '" stroke-width="' + Math.max(e.width, 0.5) + '" stroke-linecap="round"/></svg>' +
    '<div class="cap">' + e.width + (e.outerWidth > e.width ? '/' + e.outerWidth : '') + '</div>';
}

function lineSection(day, night) {
  const ours = ourLineTags();
  const at = (es, i) => es.find(e => i >= e.from && i <= e.to);
  const rows = day.styles.map((s, i) => {
    const ns = night.styles[i];
    const cells = SAMPLE_SCALES.map(sc => '<td class="sample">' + lineSvg(at(s.entries, sc)) + '</td>').join('');
    const nightCell = '<td class="sample dark">' + lineSvg(at(ns.entries, 12)) + '</td>';
    const o = s.cls === null ? null : ours.get(s.cls);
    const oursTxt = o ? [...o].map(([hw, lv]) => '<code>' + hw + '</code> L' + lv.join(' L')).join('<br>') : '';
    return '<tr><td class="num">' + (s.cls === null ? '' : s.cls) + '</td><td>' + esc(s.gdb || '') + '<br><span class="sub">' + esc(s.name) + '</span></td>' +
      cells + nightCell + '<td class="small">' + oursTxt + '</td></tr>';
  }).join('\n');
  const rules = day.rules.map(r => '<code>' + esc(r.style) + '</code> при значении ' + r.value + ' маски 0x' + r.mask.toString(16)).join('; ');
  return '<h2 id="lines">Линии: классы GDB → стиль</h2>' +
    '<p>Класс — младшие 6 бит атрибута линии. Образцы — на индексах масштаба ' + SAMPLE_SCALES.join(', ') + ' (0 — ближе всего), подпись — ширина пера / каймы в пикселях экрана MMI. ' +
    'Справа — ночной стиль на индексе 12 и наши дороги OSM: уровни GDB и E0, где мы пишем этот класс. Строки <code>line0…4</code> — стили, на которые правила подменяют frc0…3 по битам атрибута улицы (' + rules + ').</p>' +
    '<table><thead><tr><th>класс</th><th>имя в прошивке / стиль</th>' + SAMPLE_SCALES.map(s => '<th>м ' + s + '</th>').join('') +
    '<th>ночь</th><th>наши дороги</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function swatches(es) {
  if (!es.length) return '<span class="miss">стиля нет</span>';
  return es.map(e => '<span class="sw" style="background:' + hexA(e.fill) + '" title="' + xar.rgb(e.fill) + ' α' + xar.alpha(e.fill) + '"></span><span class="cap">' + range(e) + ' ' + xar.rgb(e.fill) + (xar.alpha(e.fill) === 255 ? '' : ' α' + xar.alpha(e.fill)) + '</span>').join('<br>');
}

function areaSection(day, night) {
  const ours = ourAreaTags();
  const rows = day.classes.map((c, i) => {
    const o = ours.get(c.attr) || (c.attr === gdbgen.LAND ? { layer: 'суша', sels: ['natural=coastline (кольца)'] } : null);
    return '<tr><td class="num">0x' + c.attr.toString(16) + '</td><td>' + esc(c.gdb) + '<br><span class="sub">' + esc(c.name) + '</span></td>' +
      '<td>' + swatches(c.entries) + '</td><td class="dark">' + swatches(night.classes[i].entries) + '</td>' +
      '<td class="small">' + (o ? '<b>' + esc(o.layer) + '</b><br>' + o.sels.map(t => '<code>' + esc(t) + '</code>').join(' ') : '') + '</td></tr>';
  }).join('\n');
  const bands = day.heights.map((h, i) => {
    const lo = i ? day.thresholds[i - 1] : 0, hi = day.thresholds[i];
    return '<tr><td>' + esc(h.name) + '</td><td>' + lo + (hi ? '…' + hi : '+') + ' м</td><td>' + swatches(h.entries) + '</td><td class="dark">' + swatches(night.heights[i].entries) + '</td></tr>';
  }).join('\n');
  return '<h2 id="areas">Площади: классы GDB → заливка</h2>' +
    '<p>Атрибут многоугольника 0x40 | класс. Заливка по диапазонам индекса масштаба; α — прозрачность (0 — не видно). Справа — наши теги OSM (src/osmareas.js).</p>' +
    '<table><thead><tr><th>атрибут</th><th>имя в прошивке / стиль</th><th>день</th><th>ночь</th><th>наши теги</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<h3>Пояса высот (атрибут 0x60 | ступень&lt;&lt;8, ступень — десятки метров)</h3>' +
    '<p>Стиль — первый пояс, у которого высота меньше порога. Пороги: ' + day.thresholds.join(', ') + ' м. Пишем на уровнях L4…L11.</p>' +
    '<table><thead><tr><th>стиль</th><th>высоты</th><th>день</th><th>ночь</th></tr></thead><tbody>' + bands + '</tbody></table>';
}

function bitmapSection(a, cache) {
  const all = xar.bitmaps(a);
  const cells = all.map(m => {
    const u = bitmapUri(a, m.id, cache);
    return '<figure class="bm">' + (u ? '<img src="' + u + '" alt="" loading="lazy">' : '<span class="miss">?</span>') + '<figcaption>#' + m.id + '<br>' + (m.w || '') + (m.h ? '×' + m.h : '') + '</figcaption></figure>';
  }).join('');
  return '<h2 id="bitmaps">Все растры архива (' + all.length + ')</h2><p>Номер — тот, что стоит в стиле значка: им можно подменить значок категории.</p><div class="grid">' + cells + '</div>';
}

function build(file, opt = {}) {
  const a = xar.open(fs.readFileSync(file));
  const t = xar.tree(a);
  const cache = new Map();
  const counts = opt.counts && fs.existsSync(PBF) ? poiCounts() : null;
  const body = [
    poiSection(a, xar.poiStyles(t), xar.poiStyles(t, { night: true }), counts, cache, mapTypes()),
    lineSection(xar.lineStyles(t), xar.lineStyles(t, { night: true })),
    areaSection(xar.areaStyles(t), xar.areaStyles(t, { night: true })),
    bitmapSection(a, cache),
  ].join('\n');
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Каталог стилей карты</title>
<style>
:root{--bg:#fafaf7;--fg:#222;--panel:#fff;--line:#ddd;--muted:#666;--dark:#1d2430;--hl:#fff4d6}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#1b1c1e;--fg:#e6e6e6;--panel:#25272a;--line:#3a3c40;--muted:#9a9a9a;--hl:#3a3420}}
:root[data-theme="dark"]{--bg:#1b1c1e;--fg:#e6e6e6;--panel:#25272a;--line:#3a3c40;--muted:#9a9a9a;--hl:#3a3420}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.4 -apple-system,system-ui,sans-serif;padding:0 16px 40px}
nav{position:sticky;top:0;background:var(--bg);padding:10px 0;border-bottom:1px solid var(--line);display:flex;gap:16px;flex-wrap:wrap;align-items:center;z-index:1}
nav input{font:inherit;padding:4px 8px;min-width:200px}
h1{font-size:18px;margin:16px 0 4px} h2{font-size:16px;margin:28px 0 6px} h3{font-size:14px;margin:18px 0 6px}
p{max-width:900px;color:var(--muted)}
.wrap{overflow-x:auto}
table{border-collapse:collapse;margin:8px 0;min-width:600px}
th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
th{position:sticky;top:48px;background:var(--panel);font-weight:600;font-size:12px}
td.num{text-align:right;font-variant-numeric:tabular-nums;color:var(--muted)}
tr.nostyle td{opacity:.55}
.icons{display:flex;flex-wrap:wrap;gap:6px}
.pair{display:flex;gap:4px;align-items:center}
tr.lost td{opacity:1;background:#e6081022}
a{color:inherit}
figure{margin:0;display:inline-flex;flex-direction:column;align-items:center;min-width:58px;padding:4px;border:1px solid var(--line);border-radius:4px;background:var(--panel)}
figure img{image-rendering:pixelated;min-width:16px;min-height:16px}
figure .night{background:var(--dark);padding:2px;border-radius:3px;display:inline-flex}
figcaption{font-size:10px;color:var(--muted);text-align:center;line-height:1.2;margin-top:2px}
.grid{display:flex;flex-wrap:wrap;gap:6px}
.bm{min-width:64px}
.sample{text-align:center;background:#81a873}
.sample.dark,td.dark{background:var(--dark);color:#ccc}
.cap{font-size:10px;color:var(--muted)}
.sample .cap{color:#203018}
.sample.dark .cap{color:#aaa}
.sw{display:inline-block;width:28px;height:14px;border:1px solid var(--line);border-radius:2px;vertical-align:middle;margin-right:6px;background-image:linear-gradient(45deg,#0001 25%,transparent 25%,transparent 75%,#0001 75%)}
.sub{color:var(--muted);font-size:12px}
.small{font-size:12px}
code{font-size:12px;background:var(--hl);padding:0 3px;border-radius:2px}
.miss{color:var(--muted);font-style:italic;font-size:12px}
.hide{display:none}
</style></head><body>
<h1>Каталог стилей карты</h1>
<p>Архив: <code>${esc(path.basename(file))}</code>, день и ночь, 2D. Всё прочитано из архива так, как его ищет прошивка (docs/formats/xar.md); теги OSM — наши правила сборки.</p>
<nav><a href="#poi">Точки интереса</a><a href="#lines">Линии</a><a href="#areas">Площади</a><a href="#bitmaps">Растры</a>
<input id="q" type="search" placeholder="фильтр по строкам: имя, номер, тег"></nav>
<div class="wrap">${body}</div>
<script>
document.getElementById('q').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  for (const tr of document.querySelectorAll('tbody tr')) tr.classList.toggle('hide', !!q && !tr.textContent.toLowerCase().includes(q));
  for (const f of document.querySelectorAll('.bm')) f.classList.toggle('hide', !!q && !f.textContent.toLowerCase().includes(q));
});
</script>
</body></html>`;
}

module.exports = { build };

if (require.main === module) {
  const a = process.argv.slice(2);
  const flag = (n, d) => { const i = a.indexOf('--' + n); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
  const file = a.find((x, i) => !x.startsWith('--') && !(i > 0 && a[i - 1] === '--out')) || DEFAULT_XAR;
  const out = flag('out', 'out/preview/catalog.html');
  const html = build(file, { counts: !a.includes('--no-counts') });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log('записано: ' + out + ' (' + (html.length / 1048576).toFixed(1) + ' МБ)');
}
