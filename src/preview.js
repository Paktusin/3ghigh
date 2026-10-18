// Предпросмотр тома GDB в браузере: элементы читаются тем же читателем потока,
// что повторяет прошивку (gm.readElements), многоугольники раскладываются в
// треугольники её автоматом граней (gm.polyTriangles), и всё рисуется на
// canvas по классам. Видно ровно то, что устройство прочтёт из байтов.
//
//   node src/preview.js [корень-набора] [--out файл.html] [--box lon0,lat0,lon1,lat1]
//                       [--levels 0-11] [--palette файл.json]
//
// Корень — out/cyprus (наш) или maps (заводской; читается только рамка).
// Цвета и толщины — из архива стилей MapStyles того же набора (src/xar.js,
// docs/formats/xar.md), по выбранному индексу масштаба 0…43, как у прошивки;
// без архива — условные. --palette подменяет цвета:
// { "poly": {"0x5f": "#...", …}, "line": {"1": "#…"} }.
const fs = require('fs');
const path = require('path');
const gm = require('./gdb');
const xar = require('./xar');
const litpoi = require('./litpoi');
const litkeys = require('./litkeys');

const CYPRUS = [32.2, 34.5, 34.7, 35.75];

// Подписи — по разбору классов (docs/formats/gdb.md, «Площадные классы»);
// где смысл — догадка, так и сказано.
const POLY = {
  0x50: ['вода / море', '#9cc9ef'], 0x5f: ['суша (подробная)', '#f2efe6'],
  0x5d: ['суша (вне подробного покрытия)', '#e8e2cf'], 0x51: ['лес', '#b5d6a0'],
  0x52: ['парк, зелёная зона', '#cfe8b8'], 0x53: ['застройка', '#e3d3cf'],
  0x54: ['промзона, порт', '#d9d0e3'], 0x56: ['аэропорт', '#e0dccb'],
  0x57: ['перрон (догадка)', '#cfcabb'], 0x55: ['здания? (догадка)', '#c9b8a8'],
  0x5b: ['класс 0x5b (?)', '#f0c0c0'], 0x5c: ['класс 0x5c (?)', '#c0c0f0'],
};
const LINE = {
  0: ['автомагистраль (обзорные уровни)', '#d0543f', 3], 1: ['автомагистраль', '#d0543f', 3],
  2: ['дорога класса 2', '#e88a3c', 2.5], 3: ['дорога класса 3', '#f2c14e', 2],
  4: ['дорога класса 4', '#9a9a9a', 1], 6: ['дорога класса 6', '#b0b0b0', 1],
  7: ['дорога класса 7', '#c0c0c0', 1], 8: ['железная дорога (догадка)', '#555', 1],
  9: ['дорога класса 9', '#e88a3c', 2], 10: ['река', '#4a90d9', 1.5],
  12: ['государственная граница', '#8a3ca8', 1.5], 13: ['граница (догадка)', '#a87cc0', 1],
};
// пояса высот: 0x60 | s<<8, s×10 м
const isBand = a => (a & 0x7f) === 0x60 && (a >> 8) > 0;

function parseLevels(s) {
  const out = new Set();
  for (const part of String(s).split(',')) {
    const [a, b] = part.split('-').map(Number);
    for (let i = a; i <= (b === undefined ? a : b); i++) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

// Все тайлы уровня в рамке box: слоты кластеров по сетке, записи тайлов, без
// общего пустого тайла (самый частый адрес).
function tilesInBox(g, h, li, box) {
  const L = h.levels[li];
  const b = gm.read(g, L.offset, L.size);
  const hd = gm.levelHead(b);
  const W = gm.gridW(h, hd);
  const n = b.readUInt32BE(gm.TABLE_AT - 4);
  const cxs = [box[0], box[2]].map(v => Math.floor(gm.cellOfLon(v, hd.cellX) / (1 << hd.potX)));
  const cys = [box[1], box[3]].map(v => Math.floor(gm.cellOfLat(v, hd.cellY) / (1 << hd.potY)));
  const tiles = [];
  for (let cx = Math.max(0, cxs[0]); cx <= cxs[1]; cx++) {
    for (let cy = Math.max(0, cys[0]); cy <= cys[1]; cy++) {
      const slot = cy * W + cx;
      if (slot >= n) continue;
      const off = b.readUInt32BE(gm.TABLE_AT + slot * 6), sz = b.readUInt16BE(gm.TABLE_AT + slot * 6 + 4);
      tiles.push(...gm.cluster(g, h, off, sz).tiles);
    }
  }
  const freq = new Map();
  for (const t of tiles) freq.set(t.off, (freq.get(t.off) || 0) + 1);
  const empty = [...freq].sort((a, c) => c[1] - a[1])[0];
  return { hd, tiles: tiles.filter(t => !(empty && empty[1] > 1 && t.off === empty[0] && t.size < 64)) };
}

// Уровень → куски по тайлам: { b: [x0,y0,x1,y1], p: {attr: [треугольники]},
// l: {класс: [[линия]…]} } — координаты целые 1e-5°, от угла b (так короче).
// Куски нужны странице, чтобы рисовать только видимое и собирать контуры
// один раз.
function levelData(g, h, li, box) {
  const { hd, tiles } = tilesInBox(g, h, li, box);
  const k0 = gm.keyOrigin(li);
  const u = 1 << hd.shift;
  const chunks = [], count = { p: {}, l: {} }, stat = { tiles: tiles.length, bad: 0, illegal: 0, els: 0 };
  for (const t of tiles) {
    let r;
    try { r = gm.readElements(gm.read(g, t.off, t.size), { W: t.attr, simple: !!t.b10, points: true }); }
    catch (e) { stat.bad++; continue; }
    if (!r.ok) stat.bad++;
    const geo = ([x, y]) => [
      Math.round(gm.lonOfCellL((t.x - k0.x0) + (x * u) / hd.cellX, hd.cellX) * 1e5),
      Math.round(gm.latOfCellL((t.y - k0.y0) + (y * u) / hd.cellY, hd.cellY) * 1e5),
    ];
    const p = {}, l = {}, all = [];
    for (const el of r.els) {
      if (!el.pts) continue;
      stat.els++;
      if (el.type === 0) {
        const q = gm.polyTriangles(el.pts, el.flags || []);
        stat.illegal += q.illegal;
        const key = '0x' + el.attr.toString(16);
        count.p[key] = (count.p[key] || 0) + q.tris.length;
        const arr = p[key] || (p[key] = []);
        for (const tri of q.tris) for (const pt of tri) { const v = geo(pt); arr.push(v); all.push(v); }
      } else if (el.type === 1) {
        count.l[el.cls] = (count.l[el.cls] || 0) + 1;
        const pts = el.pts.map(geo);
        all.push(...pts);
        (l[el.cls] || (l[el.cls] = [])).push(pts);
      }
    }
    if (!all.length) continue;
    const b = [Math.min(...all.map(v => v[0])), Math.min(...all.map(v => v[1])),
               Math.max(...all.map(v => v[0])), Math.max(...all.map(v => v[1]))];
    const rel = v => [v[0] - b[0], v[1] - b[1]];
    for (const k of Object.keys(p)) p[k] = p[k].flatMap(rel);
    for (const k of Object.keys(l)) l[k] = l[k].map(pts => pts.flatMap(rel));
    chunks.push({ b, p, l });
  }
  return { chunks, count, stat };
}

function legend() {
  const poly = {}, line = {};
  for (const [k, v] of Object.entries(POLY)) poly['0x' + Number(k).toString(16)] = { name: v[0], color: v[1] };
  for (const [k, v] of Object.entries(LINE)) line[k] = { name: v[0], color: v[1], width: v[2] };
  return { poly, line };
}

// Стили из архива: площади по классу (0x50…0x5f), пояса высот по порогам,
// линии по классу 0…13 — каждая запись действует на диапазоне индексов масштаба.
function findXar(root) {
  for (const r of [root, 'maps']) {
    const dir = path.join(r, 'pkgdb');
    if (!fs.existsSync(dir)) continue;
    const st = fs.readdirSync(dir).find(d => /^StyleDBMMI3G_/.test(d));
    if (!st) continue;
    const f = fs.readdirSync(path.join(dir, st)).find(x => /\.xar$/i.test(x));
    if (f) return path.join(dir, st, f);
  }
  return null;
}

function xarStyles(file) {
  const t = xar.tree(xar.open(fs.readFileSync(file)));
  const col = c => [xar.rgb(c), xar.alpha(c)];
  const A = xar.areaStyles(t), Ls = xar.lineStyles(t);
  const area = {};
  for (const c of A.classes) if (c.entries.length) area['0x' + c.attr.toString(16)] = c.entries.map(e => [e.from, e.to, ...col(e.fill)]);
  return {
    file: path.basename(file),
    area,
    bands: { thresholds: A.thresholds, styles: A.heights.map(h => h.entries.map(e => [e.from, e.to, ...col(e.fill)])) },
    line: Object.fromEntries(Ls.styles.filter(x => x.cls !== null && x.entries.length).map(x => [x.cls,
      { name: x.name, entries: x.entries.map(e => [e.from, e.to, e.width, ...col(e.color), e.outerWidth, ...col(e.outerColor)]) }])),
  };
}

// Точки интереса из собранного LIT — листья дерева POI (блоки, что начинаются
// записью-тайлом 0x23), как их читает setcheck. Значок — по правилам прошивки
// (xar.iconFor, sub 0); «видна» — у типа есть значок и тип есть в шапке POI.
function litPois(root, styleFile) {
  const dir = path.join(root, 'pkgdb', 'LIT');
  if (!fs.existsSync(dir)) return null;
  const P = litpoi.open([dir]);
  const K = litkeys.open([dir]);
  const scales = litkeys.mapTypeScales(dir);
  const onMap = scales ? new Set(scales.keys()) : null;
  const ps = styleFile ? xar.poiStyles(xar.tree(xar.open(fs.readFileSync(styleFile)))) : null;
  const a = styleFile ? xar.open(fs.readFileSync(styleFile)) : null;
  const list = [], names = [], icons = {};
  for (let i = 0; i < P.catalog().length; i++) {
    if ((K.get(i).els[0] || {}).type !== 0x23) continue;
    for (const q of P.pois(i)) {
      list.push([Math.round(q.lon * 1e5), Math.round(q.lat * 1e5), q.cat || 0, names.length]);
      names.push(q.name || '');
      const c = q.cat || 0;
      if (icons[c] !== undefined) continue;
      const ic = ps && iconForSafe(ps, c);
      const visible = !!ic && (!onMap || onMap.has(c));
      let uri = null;
      if (ic) { try { uri = 'data:image/png;base64,' + xar.png(xar.bitmap(a, ic.bitmap)).toString('base64'); } catch (e) { uri = null; } }
      icons[c] = { name: litpoi.category(c) || String(c), visible, uri, max: scales && scales.has(c) ? scales.get(c) : null, from: ic ? ic.entries[0].from : 0,
                   to: ic ? ic.entries[ic.entries.length - 1].to : 43, w: ic ? ic.entries[0].w : 0, h: ic ? ic.entries[0].h : 0 };
    }
  }
  return { list, names, icons };
}
const iconForSafe = (ps, c) => { try { return xar.iconFor(ps, c, 0); } catch (e) { return null; } };

function build(root, opt = {}) {
  const box = opt.box || CYPRUS;
  const g = gm.openGdb(root);
  const h = gm.header(g);
  const levels = (opt.levels || parseLevels('0-11')).filter(i => i < h.levels.length);
  const data = {};
  for (const li of levels) {
    data[li] = levelData(g, h, li, box);
    if (opt.log) {
      const s = data[li].stat;
      opt.log('L' + li + ': тайлов ' + s.tiles + ', элементов ' + s.els +
              (s.bad ? ', НЕ дочитано ' + s.bad : '') + (s.illegal ? ', запрещённых переходов ' + s.illegal : ''));
    }
  }
  const pal = legend();
  if (opt.palette) {
    const p = JSON.parse(fs.readFileSync(opt.palette, 'utf8'));
    for (const [k, c] of Object.entries(p.poly || {})) pal.poly[k] = Object.assign(pal.poly[k] || { name: k }, { color: c });
    for (const [k, c] of Object.entries(p.line || {})) pal.line[k] = Object.assign(pal.line[k] || { name: 'класс ' + k, width: 1 }, { color: c });
  }
  const xf = opt.xar === undefined ? findXar(root) : opt.xar;
  const styles = xf ? xarStyles(xf) : null;
  if (opt.log) opt.log(styles ? 'стили: ' + xf : 'стили: архив не найден, цвета условные');
  const pois = opt.pois === false ? null : litPois(root, xf);
  if (opt.log && pois) opt.log('точек интереса: ' + pois.list.length + ', видимых типов ' +
    Object.values(pois.icons).filter(x => x.visible).length + ' из ' + Object.keys(pois.icons).length);
  // диапазон масштаба уровня из его шапки (+10 от, +14 до) — для порога типов POI
  const lvRange = {};
  for (const li of levels) {
    const b = gm.read(g, h.levels[li].offset, 18);
    lvRange[li] = [b.readUInt32BE(10), b.readUInt32BE(14)];
  }
  return page({ title: path.basename(path.resolve(root)), box, data, pal, styles, pois, lvRange });
}

function page(model) {
  const json = JSON.stringify(model).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Предпросмотр GDB</title>
<style>
:root{--bg:#fafaf7;--fg:#222;--panel:#fff;--line:#ddd;--muted:#666}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#1b1c1e;--fg:#e6e6e6;--panel:#25272a;--line:#3a3c40;--muted:#9a9a9a}}
:root[data-theme="dark"]{--bg:#1b1c1e;--fg:#e6e6e6;--panel:#25272a;--line:#3a3c40;--muted:#9a9a9a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.4 -apple-system,system-ui,sans-serif;display:flex;height:100vh}
aside{width:300px;max-width:45vw;overflow:auto;padding:12px 16px;border-right:1px solid var(--line);background:var(--panel)}
main{flex:1;position:relative;min-width:0}
canvas{position:absolute;inset:0;width:100%;height:100%;cursor:grab}
h1{font-size:16px;margin:0 0 8px} h2{font-size:13px;margin:14px 0 6px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
label{display:flex;align-items:center;gap:6px;margin:2px 0;cursor:pointer}
.sw{width:14px;height:14px;border-radius:3px;border:1px solid var(--line);flex:none}
.ln{width:18px;height:0;border-top:3px solid;flex:none}
.n{margin-left:auto;color:var(--muted);font-variant-numeric:tabular-nums}
select,button{font:inherit}
#info{position:absolute;left:8px;bottom:8px;background:var(--panel);border:1px solid var(--line);padding:4px 8px;border-radius:4px;font-variant-numeric:tabular-nums}
.stat{color:var(--muted);font-size:12px}
@media (max-width:640px){body{flex-direction:column}aside{width:auto;max-width:none;max-height:40vh;border-right:0;border-bottom:1px solid var(--line)}}
</style></head><body>
<aside>
<h1>Предпросмотр GDB: <span id="ttl"></span></h1>
<div>Уровень <select id="lvl"></select> масштаб <select id="sc"></select></div>
<div class="stat" id="st"></div>
<h2>Площади</h2><div id="lp"></div>
<h2>Линии</h2><div id="ll"></div>
<h2>Точки интереса</h2><div id="lpoi"></div>
<p class="stat" id="src"></p>
<p class="stat">Колесо — масштаб, перетаскивание — сдвиг. «Масштаб» — индекс 0…43 таблицы стилей: по нему прошивка выбирает цвет и толщину (у каждого уровня GDB свой диапазон; соответствие уровня индексу здесь — прикидка).</p>
</aside>
<main><canvas id="c"></canvas><div id="info"></div></main>
<script>
const M = ${json};
const $ = id => document.getElementById(id);
$('ttl').textContent = M.title;
const off = new Set();
let lv = Object.keys(M.data)[0];
for (const k of Object.keys(M.data)) { const o = document.createElement('option'); o.value = k; o.textContent = 'L' + k; $('lvl').append(o); }
const band = a => (parseInt(a) & 0x7f) === 0x60 && (parseInt(a) >> 8) > 0;
const S = M.styles;
// прикидка: какой индекс масштаба типичен для уровня GDB
const LVL_SCALE = [4, 12, 18, 21, 23, 25, 27, 30, 33, 36, 39, 42];
let sc = LVL_SCALE[lv] || 0;
for (let i = 0; i < 44; i++) { const o = document.createElement('option'); o.value = i; o.textContent = i; $('sc').append(o); }
$('src').textContent = S ? 'Стили: ' + S.file + ' (день, 2D).' : 'Архив стилей не найден — цвета условные.';
const at = (entries, i) => entries.find(e => i >= e[0] && i <= e[1]);
const css = (hex, a) => { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + (a / 255).toFixed(3) + ')'; };
function polyStyle(a) {
  const name = (M.pal.poly[a] || {}).name;
  if (S && S.area[a]) { const e = at(S.area[a], sc); return { name: name || 'класс ' + a, color: e ? css(e[2], e[3]) : 'rgba(0,0,0,0)' }; }
  if (S && band(a)) {
    const m = (parseInt(a) >> 8) * 10; let k = S.bands.thresholds.findIndex(t => m < t); if (k < 0) k = S.bands.styles.length - 1;
    const e = at(S.bands.styles[k] || [], sc); return { name: 'пояс высот ≥ ' + m + ' м (стиль height' + k + ')', color: e ? css(e[2], e[3]) : 'rgba(0,0,0,0)' };
  }
  if (M.pal.poly[a]) return M.pal.poly[a];
  if (band(a)) { const m = (parseInt(a) >> 8) * 10; const t = Math.min(1, m / 2000);
    return { name: 'пояс высот ≥ ' + m + ' м', color: 'rgba(' + Math.round(160 + 60 * t) + ',' + Math.round(140 - 40 * t) + ',' + Math.round(90 - 40 * t) + ',0.35)' }; }
  return { name: 'класс ' + a, color: '#f0f' };
}
function lineStyle(c) {
  const name = (M.pal.line[c] || {}).name || 'класс ' + c;
  if (S && S.line[c]) {
    const e = at(S.line[c].entries, sc);
    if (!e) return { name: name + ' (' + S.line[c].name + ')', color: 'rgba(0,0,0,0)', width: 0 };
    return { name: name + ' (' + S.line[c].name + ')', color: css(e[3], e[4]), width: e[2], casing: e[5] > e[2] ? css(e[6], e[7]) : null, cw: e[5] };
  }
  return M.pal.line[c] || { name, color: '#f0f', width: 1 };
}
// порядок площадей — как в тайле у завода: суша/море, пояса, наложения, вода
function polyOrder(keys) {
  const rank = a => { const v = parseInt(a); if (v === 0x5f || v === 0x5d) return 0; if (v === 0x50) return 9; if (band(a)) return 1 + (v >> 8) / 1e4; return 2 + (v & 0x3f) / 100; };
  return keys.sort((a, b) => rank(a) - rank(b));
}
function legend() {
  const d = M.data[lv];
  $('st').textContent = 'тайлов ' + d.stat.tiles + ', элементов ' + d.stat.els + (d.stat.bad ? ', не дочитано ' + d.stat.bad : '') + (d.stat.illegal ? ', запрещённых переходов ' + d.stat.illegal : '');
  $('lp').innerHTML = ''; $('ll').innerHTML = '';
  for (const a of polyOrder(Object.keys(d.count.p))) {
    const s = polyStyle(a), id = 'p' + a;
    const l = document.createElement('label');
    l.innerHTML = '<input type="checkbox"' + (off.has(id) ? '' : ' checked') + '><span class="sw" style="background:' + s.color + '"></span>' + a + ' ' + s.name + '<span class="n">' + d.count.p[a] + '</span>';
    l.querySelector('input').onchange = e => { e.target.checked ? off.delete(id) : off.add(id); redraw(); };
    $('lp').append(l);
  }
  for (const c of Object.keys(d.count.l).sort((a, b) => a - b)) {
    const s = lineStyle(c), id = 'l' + c;
    const l = document.createElement('label');
    l.innerHTML = '<input type="checkbox"' + (off.has(id) ? '' : ' checked') + '><span class="ln" style="border-color:' + s.color + '"></span>' + c + ' ' + s.name + '<span class="n">' + d.count.l[c] + '</span>';
    l.querySelector('input').onchange = e => { e.target.checked ? off.delete(id) : off.add(id); redraw(); };
    $('ll').append(l);
  }
  $('lpoi').innerHTML = '';
  if (!M.pois) { $('lpoi').textContent = 'LIT не найден'; return; }
  const vis = M.pois.list.filter(p => M.pois.icons[p[2]].visible).length;
  for (const [id, txt] of [['poiV', 'видимые на карте MMI (' + vis + ')'], ['poiH', 'невидимые: нет значка или типа нет в шапке (' + (M.pois.list.length - vis) + ')']]) {
    const l = document.createElement('label');
    l.innerHTML = '<input type="checkbox"' + (off.has(id) ? '' : ' checked') + '>' + txt;
    l.querySelector('input').onchange = e => { e.target.checked ? off.delete(id) : off.add(id); redraw(); };
    $('lpoi').append(l);
  }
  const p = document.createElement('p'); p.className = 'stat';
  p.textContent = 'Значок рисуется, если (1) выбранный индекс масштаба попадает в диапазон его стиля (по коду) и (2) порог типа из шапки POI больше начала диапазона уровня GDB' +
    (M.lvRange && M.lvRange[lv] ? ' (L' + lv + ': ' + M.lvRange[lv][0] + '–' + M.lvRange[lv][1] + ')' : '') + ' — догадка о единицах. Наведите на точку — имя, категория, порог.';
  $('lpoi').append(p);
}
// значки точек
const IMG = {};
if (M.pois) for (const [c, ic] of Object.entries(M.pois.icons)) if (ic.uri) { const im = new Image(); im.src = ic.uri; im.onload = () => redraw(); IMG[c] = im; }
const cv = $('c'), cx = cv.getContext('2d');
const [lon0, lat0, lon1, lat1] = M.box;
const kx = Math.cos((lat0 + lat1) / 2 * Math.PI / 180);
let view = null;
function fit() {
  const w = cv.clientWidth, h = cv.clientHeight;
  const s = Math.min(w / ((lon1 - lon0) * kx), h / (lat1 - lat0)) * 0.95 / 1e5;
  view = { s, x: w / 2 - ((lon0 + lon1) / 2 * 1e5) * kx * s, y: h / 2 + ((lat0 + lat1) / 2 * 1e5) * s };
}
// Контуры собираются один раз на кусок и класс (Path2D в мировых единицах),
// дальше их двигает и масштабирует преобразование холста; рисуются только
// куски, попавшие в окно. Пока карту тянут, сдвигается готовый снимок.
const paths = {};
function chunkPaths(li) {
  if (paths[li]) return paths[li];
  return paths[li] = M.data[li].chunks.map(c => {
    const [ox, oy] = c.b, p = {}, l = {};
    for (const [a, t] of Object.entries(c.p)) {
      const P = new Path2D();
      for (let i = 0; i < t.length; i += 6) { P.moveTo(ox + t[i], oy + t[i + 1]); P.lineTo(ox + t[i + 2], oy + t[i + 3]); P.lineTo(ox + t[i + 4], oy + t[i + 5]); P.closePath(); }
      p[a] = P;
    }
    for (const [k, ls] of Object.entries(c.l)) {
      const P = new Path2D();
      for (const q of ls) { P.moveTo(ox + q[0], oy + q[1]); for (let i = 2; i < q.length; i += 2) P.lineTo(ox + q[i], oy + q[i + 1]); }
      l[k] = P;
    }
    return { b: c.b, p, l };
  });
}
const snap = document.createElement('canvas');
function draw() {
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg'); cx.fillRect(0, 0, cv.width, cv.height);
  // видимая рамка в мировых единицах
  const vx0 = (0 - view.x) / view.s / kx, vx1 = (w - view.x) / view.s / kx;
  const vy1 = (view.y - 0) / view.s, vy0 = (view.y - h) / view.s;
  const vis = chunkPaths(lv).filter(c => c.b[2] >= vx0 && c.b[0] <= vx1 && c.b[3] >= vy0 && c.b[1] <= vy1);
  cx.setTransform(dpr * view.s * kx, 0, 0, -dpr * view.s, dpr * view.x, dpr * view.y);
  const unit = 1 / (view.s * Math.sqrt(kx));
  for (const a of polyOrder(Object.keys(M.data[lv].count.p))) {
    if (off.has('p' + a)) continue;
    // обводка в цвет заливки закрывает волосяные щели сглаживания между треугольниками
    cx.fillStyle = cx.strokeStyle = polyStyle(a).color; cx.lineWidth = 0.8 * unit;
    for (const c of vis) if (c.p[a]) { cx.fill(c.p[a]); cx.stroke(c.p[a]); }
  }
  cx.lineJoin = cx.lineCap = 'round';
  for (const k of Object.keys(M.data[lv].count.l).sort((a, b) => b - a)) {
    if (off.has('l' + k)) continue;
    const s = lineStyle(k);
    if (!s.width) continue;
    // толщины в архиве — пиксели экрана MMI; здесь вдвое тоньше, чтобы обзор не слипался
    if (s.casing) { cx.strokeStyle = s.casing; cx.lineWidth = s.cw / 2 * unit; for (const c of vis) if (c.l[k]) cx.stroke(c.l[k]); }
    cx.strokeStyle = s.color; cx.lineWidth = s.width / 2 * unit; for (const c of vis) if (c.l[k]) cx.stroke(c.l[k]);
  }
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (M.pois) {
    const sx = v => v * kx * view.s + view.x, sy = v => view.y - v * view.s;
    for (const p of M.pois.list) {
      if (p[0] < vx0 || p[0] > vx1 || p[1] < vy0 || p[1] > vy1) continue;
      const ic = M.pois.icons[p[2]];
      const x = sx(p[0]), y = sy(p[1]);
      if (ic.visible) {
        // порог типа (0x74 шапки POI) против начала диапазона уровня GDB — догадка о единицах
        if (off.has('poiV') || sc < ic.from || sc > ic.to || (ic.max !== null && M.lvRange && M.lvRange[lv] && M.lvRange[lv][0] >= ic.max)) continue;
        const im = IMG[p[2]];
        if (im && im.complete) cx.drawImage(im, x - ic.w / 2, y - ic.h / 2, ic.w, ic.h);
      } else {
        if (off.has('poiH')) continue;
        cx.fillStyle = 'rgba(120,120,120,0.6)'; cx.beginPath(); cx.arc(x, y, 2, 0, 7); cx.fill();
      }
    }
  }
  cx.setTransform(1, 0, 0, 1, 0, 0);
}
let queued = false;
const redraw = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; draw(); }); };
$('lvl').onchange = e => { lv = e.target.value; sc = LVL_SCALE[lv] || 0; $('sc').value = sc; legend(); redraw(); };
$('sc').onchange = e => { sc = +e.target.value; legend(); redraw(); };
$('sc').value = sc;
let drag = null;
let moved = [0, 0];
cv.onpointerdown = e => {
  drag = [e.clientX, e.clientY]; moved = [0, 0]; cv.setPointerCapture(e.pointerId);
  snap.width = cv.width; snap.height = cv.height; snap.getContext('2d').drawImage(cv, 0, 0);
};
cv.onpointerup = () => { if (drag) { drag = null; redraw(); } };
cv.onpointermove = e => {
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  let txt = (((px - view.x) / view.s / kx) / 1e5).toFixed(4) + '°E ' + (((view.y - py) / view.s) / 1e5).toFixed(4) + '°N';
  if (M.pois && !drag) {
    let best = null, bd = 64;
    for (const p of M.pois.list) {
      const dx = p[0] * kx * view.s + view.x - px, dy = view.y - p[1] * view.s - py, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = p; }
    }
    if (best) { const ic = M.pois.icons[best[2]]; txt += ' — ' + M.pois.names[best[3]] + ' · ' + best[2] + ' ' + ic.name + (ic.max ? ' · порог ' + ic.max : '') + (ic.visible ? '' : ' (на карте MMI не видна)'); }
  }
  $('info').textContent = txt;
  if (!drag) return;
  const dx = e.clientX - drag[0], dy = e.clientY - drag[1];
  view.x += dx; view.y += dy; moved[0] += dx; moved[1] += dy; drag = [e.clientX, e.clientY];
  const dpr = devicePixelRatio || 1;
  cx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg'); cx.fillRect(0, 0, cv.width, cv.height);
  cx.drawImage(snap, moved[0] * dpr, moved[1] * dpr);
};
cv.onwheel = e => {
  e.preventDefault();
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, f = Math.exp(-e.deltaY * 0.0015);
  view.x = px - (px - view.x) * f; view.y = py - (py - view.y) * f; view.s *= f; redraw();
};
addEventListener('resize', redraw);
fit(); legend(); draw();
</script></body></html>`;
}

module.exports = { build, levelData, tilesInBox, parseLevels, CYPRUS };

if (require.main === module) {
  const a = process.argv.slice(2);
  const flag = (n, d) => { const i = a.indexOf('--' + n); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
  const root = a.find((x, i) => !x.startsWith('--') && !(i > 0 && a[i - 1].startsWith('--'))) || 'out/cyprus';
  const out = flag('out', 'out/preview/' + path.basename(path.resolve(root)) + '.html');
  const html = build(root, {
    box: flag('box') ? flag('box').split(',').map(Number) : CYPRUS,
    levels: parseLevels(flag('levels', '0-11')),
    palette: flag('palette'),
    log: console.log,
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log('записано: ' + out + ' (' + (html.length / 1048576).toFixed(1) + ' МБ)');
}
