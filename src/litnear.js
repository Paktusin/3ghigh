// Эмулятор поиска POI «рядом» (POI_EnterBySurrounding по категории) — путь
// прошивки, а не нашего писателя (docs/formats/lit.md, «Поиск POI рядом»):
//
//   CLimPoiSearcher (FUN_08efc994)  запрос LWT: +0xc = 1 (по типу), тип — номер
//                                   категории из описания места («…\t#N»,
//                                   FUN_08f045f0), подтип — вид кухни (0x4e)
//   FUN_08f1cb60 -> FUN_08f1d84c    вид 2 — «окрестность», CLwtSimpleSurroundingSearch
//   FUN_08f2a2d4                    корень (0,0) поле 0x4a -> шапка 0x20; виток с
//                                   0x49 = тип -> его 0x3c (заголовок слоя 0x21);
//                                   нет витка — «Type %d doesn't seem to exist»
//   FUN_08f2a524                    спуск: 0x21 -> следующий элемент (корень); у
//                                   узла 0x22 рамки A (0x61..0x60) и B (0x64..0x63),
//                                   попадание — ПОЛУОТКРЫТОЕ [x0,x1)×[y0,y1)
//                                   (FUN_08cd1464); вне обеих — при первом спуске
//                                   ближний центр, при расширении — отказ; рамка
//                                   всего слоя — (A.x0, A.y0)..(B.x1, B.y1) корня
//   FUN_08f2a400                    точки тайла 0x23 (0x42 штук следом): 0x24 с
//                                   0x4f = тип (и 0x4e = подтип, если задан)
//   FUN_08f2ab1c / FUN_08f2a838     обследованная рамка E растёт к ближней стороне:
//                                   полоса за краем E опрашивается спуском без
//                                   «ближнего центра», найденный тайл, не
//                                   пересекающий E (FUN_08f2a114), читается; край E
//                                   встаёт на ближний край найденных тайлов
//   FUN_08f2829c                    стоп, когда до ближней необследованной стороны
//                                   дальше радиуса или сторон не осталось
//
// Если в полосе спуск не находит тайла (дыра между рамками), прошивка берёт
// следующую точку опроса из нулевой рамки — это зацикливание; здесь оно
// останавливается пределом шагов и попадает в отчёт.
'use strict';

const KS = require('./litkeys');

const M_PER_X = 40000000 / 360 / 72000;          // метров в единице X на экваторе

// dirs — каталоги тома или уже открытый KS.open
function open(dirs) {
  const o = dirs.get ? dirs : KS.open(dirs);
  const org = new Map();
  const origin = (b) => {
    if (!org.has(b)) { const blk = o.L.block(o.cat[b]); org.set(b, { x: blk.readInt32BE(4), y: blk.readInt32BE(8) }); }
    return org.get(b);
  };
  return { get: o.get, origin, close: () => o.L.vols.forEach((v) => require('fs').closeSync(v.fd)) };
}

// Расстояние от (sx, sy) в метрах (приближение FUN_0827c708: X сжат косинусом).
function meters(sx, sy) {
  const cos = Math.cos(sy / (40000000 / 360) * Math.PI / 180);
  return (x, y) => Math.round(Math.hypot((x - sx) * M_PER_X * cos, y - sy));
}

// Заголовок слоя для типа — FUN_08f2a2d4.
function layerOf(db, type) {
  const root = db.get(0).map.get(0);
  const hp = root && root.f['4a'];
  if (!hp || hp[0] < 0) return null;
  // витки шапки: сперва типы (их число — поле 0x44 записи), затем слои; у слоя
  // 0x49 — номер слоя, поэтому сравниваются только витки типов (догадка: сколько
  // витков перебирает прошивка, +0x7ec, не прочитано — при всех 68 тип, равный
  // номеру слоя, попал бы в слой, где точек этого типа нет)
  const els = db.get(hp[0]).els.filter((x) => x.type === 0x20);
  // (поля 0x43/0x44 стоят до первого витка, litkeys их не кладёт; слоёв у EU 10)
  const n = els.length - 10;
  const e = els.slice(0, n).find((x) => x.f['49'] === type);
  return e ? e.f['3c'] : null;
}

function search(db, q) {
  const { type, sub, radius } = q;
  const sx = q.x, sy = q.y;
  const cos = Math.cos(sy / (40000000 / 360) * Math.PI / 180);
  const dist = meters(sx, sy);
  const rep = { type, found: [], tiles: 0, steps: 0, why: null };
  const lh = layerOf(db, type);
  if (!lh) { rep.why = 'типа нет в шапке'; return rep; }
  const hdr = db.get(lh[0]).map.get(lh[1]);
  if (!hdr || hdr.type !== 0x21) { rep.why = 'нет заголовка слоя'; return rep; }
  const rootPos = [lh[0], lh[1] + 1];
  const el = (p) => (p && p[0] >= 0 ? db.get(p[0]).map.get(p[1]) : null);
  const inR = (r, x, y) => r.x0 <= x && x < r.x1 && r.y0 <= y && y < r.y1;
  const overlap = (a, b) => ((a.x0 <= b.x0 && b.x0 < a.x1) || (b.x0 <= a.x0 && a.x0 < b.x1)) &&
                            ((a.y0 <= b.y0 && b.y0 < a.y1) || (b.y0 <= a.y0 && a.y0 < b.y1));
  let bb = null;
  // FUN_08f2a524: тайл для точки; first — разрешён «ближний центр»
  const tileAt = (x, y, first) => {
    let pos = rootPos, rect = null;
    for (let d = 0; d < 50; d++) {
      const e = el(pos);
      if (!e) return null;
      if (e.type === 0x23) return { pos, rect, e };
      if (e.type !== 0x22) return null;
      const o = db.origin(pos[0]);
      const box = (mn, mx) => ({ x0: o.x + e.f[mn][0], y0: o.y + e.f[mn][1], x1: o.x + e.f[mx][0], y1: o.y + e.f[mx][1] });
      const A = box('61', '60'), B = box('64', '63');
      if (d === 0) bb = { x0: A.x0, y0: A.y0, x1: B.x1, y1: B.y1 };
      let pick;
      if (inR(A, x, y)) pick = 'A';
      else if (inR(B, x, y)) pick = 'B';
      else if (!first) return null;
      else {
        const c = (r) => Math.abs(x - ((r.x0 + r.x1) >> 1)) + Math.abs(y - ((r.y0 + r.y1) >> 1));
        pick = c(A) < c(B) ? 'A' : 'B';
      }
      rect = pick === 'A' ? A : B;
      pos = pick === 'A' ? e.f['5f'] : e.f['62'];
    }
    return null;
  };
  // FUN_08f2a400: точки тайла
  const read = (t) => {
    rep.tiles++;
    const n = t.e.f['42'] || 0, o = db.origin(t.pos[0]);
    for (let k = 1; k <= n; k++) {
      const p = el([t.pos[0], t.pos[1] + k]);
      if (!p || p.type !== 0x24) break;
      if (p.f['4f'] !== type || (sub && p.f['4e'] !== sub)) continue;
      const x = o.x + p.f['22'][0], y = o.y + p.f['22'][1], dm = dist(x, y);
      if (dm < radius) rep.found.push({ pos: [t.pos[0], t.pos[1] + k], x, y, dist: dm });
    }
  };
  const t0 = tileAt(sx, sy, true);
  if (!t0) { rep.why = 'спуск не дошёл до тайла'; return rep; }
  const E = Object.assign({}, t0.rect);
  read(t0);
  for (;;) {
    // FUN_08f2ab1c: до ближней необследованной стороны
    const side = [];
    if (bb.x0 < E.x0) side.push([0, (sx - E.x0) * M_PER_X * cos]);
    if (E.x1 < bb.x1) side.push([1, (E.x1 - sx) * M_PER_X * cos]);
    if (bb.y0 < E.y0) side.push([2, sy - E.y0]);
    if (E.y1 < bb.y1) side.push([3, E.y1 - sy]);
    if (!side.length) { rep.why = 'слой обследован'; break; }
    if (Math.min(...side.map((s) => Math.max(0, s[1]))) > radius) { rep.why = 'радиус'; break; }
    // FUN_08f2a838: сторона — по расстоянию в единицах карты, как в коде
    let s = 4, best = 40000000;
    const raw = [sx - E.x0, E.x1 - sx, sy - E.y0, E.y1 - sy];
    const can = [E.x0 > bb.x0, E.x1 < bb.x1, E.y0 > bb.y0, E.y1 < bb.y1];
    for (let i = 0; i < 4; i++) if (can[i] && raw[i] < best) { best = raw[i]; s = i; }
    if (s === 4) { rep.why = 'слой обследован'; break; }
    const vert = s < 2;                            // полоса слева/справа — идём по y
    const fx = s === 0 ? E.x0 - 1 : s === 1 ? E.x1 : null;
    const fy = s === 2 ? E.y0 - 1 : s === 3 ? E.y1 : null;
    let r10 = [bb.x0, bb.x1, bb.y0, bb.y1][s];
    let v = vert ? E.y0 : E.x0;
    const end = vert ? E.y1 : E.x1;
    let guard = 0;
    while (v < end) {
      if (++guard > 10000 || ++rep.steps > 1e6) { rep.why = 'зацикливание: дыра между рамками у ' + (vert ? fx + ',' + v : v + ',' + fy); return rep; }
      const t = vert ? tileAt(fx, v, false) : tileAt(v, fy, false);
      const r = t ? t.rect : { x0: 0, y0: 0, x1: 0, y1: 0 };
      if (t && !overlap(E, r)) {
        read(t);
        if (s === 0) r10 = Math.max(r10, r.x0);
        else if (s === 1) r10 = Math.min(r10, r.x1);
        else if (s === 2) r10 = Math.max(r10, r.y0);
        else r10 = Math.min(r10, r.y1);
      }
      v = vert ? r.y1 : r.x1;
    }
    if (s === 0) E.x0 = r10; else if (s === 1) E.x1 = r10; else if (s === 2) E.y0 = r10; else E.y1 = r10;
  }
  rep.found.sort((a, b) => a.dist - b.dist);
  rep.E = E; rep.bb = bb;
  return rep;
}

// Сверка с двух концов: из точек каждого типа (до `per` штук) — поиск рядом
// путём прошивки, и он обязан найти ровно те точки типа, что лежат в листьях
// слоёв ближе радиуса (перебор). leaves — номера блоков-листьев.
function check(db, leaves, opt) {
  const o = Object.assign({ per: 3, radius: 100000 }, opt);
  const pts = [];
  for (const b of leaves) {
    const org = db.origin(b);
    for (const e of db.get(b).els)
      if (e.type === 0x24 && e.f['4f'] !== undefined)
        pts.push({ cat: e.f['4f'], x: org.x + e.f['22'][0], y: org.y + e.f['22'][1], pos: b + ':' + e.key });
  }
  const byCat = new Map();
  for (const p of pts) { if (!byCat.has(p.cat)) byCat.set(p.cat, []); byCat.get(p.cat).push(p); }
  const rep = { types: 0, searches: 0, ok: 0, found: 0, bad: [], noLayer: 0 };
  const one = (cat, s, radius, label) => {
    const d = meters(s.x, s.y);
    const want = new Set((byCat.get(cat) || []).filter((p) => d(p.x, p.y) < radius).map((p) => p.pos));
    const r = search(db, { type: cat, x: s.x, y: s.y, radius });
    const got = new Set(r.found.map((p) => p.pos.join(':')));
    rep.searches++; rep.found += got.size;
    const same = got.size === want.size && [...want].every((k) => got.has(k)) && r.found.length === got.size;
    if (same && !/^зацикл/.test(r.why) && (!want.size || !/^спуск|^нет|^типа/.test(r.why))) rep.ok++;
    else if (rep.bad.length < 5) rep.bad.push('тип ' + cat + ' ' + label + ': найдено ' + got.size + ' из ' + want.size + ' (' + r.why + ')');
    return got.size;
  };
  for (const [cat, list] of byCat) {
    if (!layerOf(db, cat)) { rep.noLayer += list.length; continue; }
    rep.types++;
    const step = Math.max(1, Math.floor(list.length / o.per));
    for (let i = 0; i < list.length && i < step * o.per; i += step) one(cat, list[i], o.radius, 'от ' + list[i].pos);
  }
  // именованные пробы: {name, type, lon, lat, radius} — тоже против перебора
  rep.probes = (o.probes || []).map((q) => ({ name: q.name,
    found: one(q.type, { x: Math.round(q.lon * 72000), y: Math.round(q.lat * 40000000 / 360) }, q.radius, q.name) }));
  return rep;
}

module.exports = { open, search, layerOf, check, meters };

//   node src/litnear.js <каталоги LIT через запятую> <тип> <долгота> <широта> [радиус, м]
if (require.main === module) {
  const [dirs, type, lon, lat, rad] = process.argv.slice(2);
  const db = open(dirs.split(','));
  const r = search(db, { type: Number(type), x: Math.round(lon * 72000), y: Math.round(lat * 40000000 / 360),
                         radius: Number(rad || 100000) });
  console.log('тип %d: найдено %d, тайлов прочитано %d, конец: %s', r.type, r.found.length, r.tiles, r.why);
  for (const p of r.found.slice(0, 10))
    console.log('  %s км  %s %s  %s', (p.dist / 1000).toFixed(1), (p.x / 72000).toFixed(5),
                (p.y / (40000000 / 360)).toFixed(5), p.pos.join(':'));
  db.close();
}
