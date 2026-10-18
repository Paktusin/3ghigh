'use strict';
// Сборка тома GDB С НУЛЯ: байты тайла, кластера, уровня и всего файла.
//
// Прежние соседи (`gdbwrite.js`, `gdbroads.js`, `gdbstrip.js`) правили тайлы
// оригинала и сняты (docs/tools.md, «Снятые»). Здесь ни одного байта оригинала не
// копируется (кроме двух явно помеченных констант, происхождение которых
// неизвестно) — том собирается из описания.
//
// Раскладка, на которой всё держится (вся проверена на EJ211_v37a.gdb, цифры
// в docs/formats/gdb.md):
//
//   ── ШАПКА, 792 байта ──────────────────────────────────────────────────
//     +0    u32  DEADBEEF        +4  u32 версия (37)
//     +8    u32  идентификатор
//     +0x14 4×i32 рамка карты в мировых единицах
//     +0x24 u8   число уровней   +0x2D таблица 32 пар (u32 смещение, u32 размер)
//     +301  ff ff, дальше метка сборки «20220218092956» и имя набора «EJ211»
//     +577  u32  число записей каталога блобов  +581 u32 смещение  +585 u32 размер
//     +589  u32  конец области уровней = начало данных
//
//   ── УРОВЕНЬ ───────────────────────────────────────────────────────────
//     +0  u32 cellX  +4 u32 cellY  +8 u8 potX  +9 u8 potY
//     +10 u32 нижний порог масштаба  +14 u32 верхний
//     +18 16×i32 0x7FFFFFFF         +82 шесть байт-меток
//     +1163 ТАБЛИЦА КЛАСТЕРОВ до конца уровня: W·H записей {u32 смещение, u16 размер},
//           слот = cy·W + cx,  W = ceil((x1−x0) / (cellX·2^potX))
//
//   ── КЛАСТЕР ───────────────────────────────────────────────────────────
//     N записей по 19 байт подряд (N = размер/19), В ПОРЯДКЕ МОРТОНА по
//     (ix, iy) внутри кластера: u32 ключ (y<<16 | x, в ячейках уровня),
//     u16 lw, u16 lh (log2 размера тайла в ячейках), u8 флаг, u8 атрибут,
//     u8 ноль, u32 смещение блоба, u32 размер блоба. Поиск-таблицы на диске
//     нет: прошивка строит её в памяти (CGdbCluster::init_nach_laden).
//
//   ── ТАЙЛ ──────────────────────────────────────────────────────────────
//     заголовок 10 байт {u16 off0, u16 off1, u16 off2, u16 элементов, u16 0xE028}
//     [10 … off0)  поток элементов: многоугольники (море 0x50 — «рамка» —
//                  или суша 0x5F + море 0x50 треугольниками), затем C1 и
//                  линии группами «E0 v» — см. разделы «тайл», «суша и море»
//     [off0…off1)  S1 = 00 00     [off1…off2)  S2 = 00 00
//     байт +9 записи тайла — ширина координаты, +10 — путь записи точек
//     (0 — сжатый, L0; 1 — прямой, L1…L11)
//
//   node src/gdbgen.js --roads cy.geojson --out out/gdbgen [--name CY]
//   node src/gdbgen.js --demo --out out/gdbgen

const fs = require('fs');
const path = require('path');
const gm = require('./gdb');
const conf = require('./conf');
const dataset = require('./dataset');

// ── константы шапки ────────────────────────────────────────────────────────
const PROLOGUE = 792;                 // столько занимает шапка до первого уровня
const SIG = 0xDEADBEEF;
const VERSION = 37;
const FRAME = [-8978432, -196608, 16850000, 11517028];   // рамка карты EJ211

// Хвост шапки (+576…+792) оригинала: каталог блобов и таблица из 41 числа,
// назначение которой не установлено. Переносится как есть — кроме полей
// каталога и «начала данных», которые пересчитываются под собранный том.
// Это единственное место, где в сборку попадают байты чужого файла.
const TAIL_576 = Buffer.from(
  '000000aecb000d59da00057658000b774f0001e28b0000004000000002000000000000000000000000' +
  '00000000000000000007290000025f000005ee00000bdc000011ca000017b800002f710000472a0000' +
  '5ee30000769c0000b1ea0000ed38000163d50001da710002510e0002c7aa00033e460003b4e300042b' +
  '7f0004a21c0006a33800094438000de65400128870001bcca9002510e1002e551a003799520040dd8b' +
  '004a21c3005365fc005caa340073d4c1008aff4e00a229dc00b9546900e7a9830115fe9c0172a8d201' +
  'cf5308022bfd3c05f5e0ff', 'hex');

// Двенадцать уровней EJ211: размер ячейки, биты кластера, пороги масштаба,
// высота сетки H (ширина W считается из рамки) и шесть байт-меток с +82.
// H взято из оригинала: count = (размер уровня − 1163)/6 делится на W у всех
// уровней, кроме L4 (7990/102 = 78,33) — там берём 78 и говорим об этом вслух.
// simple — точки прямым путём (байт +10 записи тайла = 1): так у всех тайлов
// L1…L11 завода, у L0 — сжатый путь (0).
// lw/lh — размер тайла в ячейках (log2): у L0 это 5 при potX 7, то есть 4×4
// тайла в кластере; у грубых уровней lw = potX, то есть один тайл на кластер
// (на выборке по 200–235 кластеров с уровня — преобладающая форма).
const EUROPE_LEVELS = [
  { cellX: 789, cellY: 546, potX: 7, potY: 7, from: 0, to: 40000, H: 280, tag: '000700010c00', shift: 0, lw: 5, lh: 5 },
  { cellX: 1984, cellY: 1984, potX: 6, potY: 6, from: 40000, to: 150000, H: 155, tag: '030600010c00', shift: 3, lw: 6, lh: 6, simple: true },
  { cellX: 6336, cellY: 4416, potX: 6, potY: 6, from: 150000, to: 300000, H: 70, tag: '050600010c00', shift: 5, lw: 6, lh: 6, simple: true },
  { cellX: 6336, cellY: 4416, potX: 6, potY: 6, from: 300000, to: 460000, H: 70, tag: '060600010c00', shift: 6, lw: 6, lh: 6, simple: true },
  { cellX: 7936, cellY: 7936, potX: 5, potY: 5, from: 460000, to: 1500000, H: 78, tag: '070600010c00', shift: 7, lw: 5, lh: 5, simple: true },
  { cellX: 15360, cellY: 15360, potX: 6, potY: 6, from: 1500000, to: 2000000, H: 20, tag: '090600010c00', shift: 9, lw: 6, lh: 6, simple: true },
  { cellX: 15360, cellY: 15360, potX: 6, potY: 6, from: 2000000, to: 3500000, H: 20, tag: '090600010c00', shift: 9, lw: 6, lh: 6, simple: true },
  { cellX: 30720, cellY: 30720, potX: 5, potY: 5, from: 3500000, to: 4000000, H: 20, tag: '0a0600010c00', shift: 10, lw: 5, lh: 5, simple: true },
  { cellX: 63488, cellY: 63488, potX: 4, potY: 4, from: 4000000, to: 5900000, H: 20, tag: '0a0600010c00', shift: 10, lw: 4, lh: 4, simple: true },
  { cellX: 253952, cellY: 253952, potX: 3, potY: 3, from: 5900000, to: 8000000, H: 10, tag: '0b0600010c00', shift: 11, lw: 3, lh: 3, simple: true },
  { cellX: 253952, cellY: 253952, potX: 3, potY: 3, from: 8000000, to: 12500000, H: 10, tag: '0b0600010c00', shift: 11, lw: 3, lh: 3, simple: true },
  { cellX: 253952, cellY: 253952, potX: 3, potY: 3, from: 12500000, to: 2147483647, H: 10, tag: '0c0100010c00', shift: 12, lw: 3, lh: 3, simple: true },
];

// ── тайл ───────────────────────────────────────────────────────────────────
//
// Поток элементов — по коду прошивки (итератор FUN_08cb3f90, декодер точек
// FUN_092526f0; разбор и проверка — `gm.readElements`, docs/formats/gdb.md,
// «Дороги не рисуются…»). Тайл, как у завода:
//   1. многоугольники: морской тайл — рамка 0x50 по границе тайла, суша и
//      прибрежные тайлы — см. «суша и море» ниже;
//   2. `C1` — дальше линии (тип держится до смены);
//   3. на каждую группу — `E0 <v>` (поле +9 итератора), затем линии: головной
//      0x3D (id 0xFFFF, атрибут u32) у первой линии группы и 0x31 (атрибут
//      повторяется) у остальных, число точек байтом, точки.
// Точки — сжатым путём на L0 (байт w, якорь, смещения по w бит) и прямым на
// L1…L11 (по ширине тайла 8/12/16 бит) — ровно так раскладывает завод: байт
// +10 записи тайла 0 у всех тайлов L0 и 1 у всех тайлов L1…L11.
//
// S1/S2 пишутся пустыми («00 00»), как у общего пустого тайла. У заводских
// линий id всегда 0xFFFF, и счётчик S1 не равен числу элементов (у тайла
// Родоса 235 при 592) — связь линии с записью S1 из кода не выведена, поэтому
// имена на линии не вешаются: сначала рисование.

// Служебная рамка общего пустого тайла L0 (тайл 32×32 ячейки): то же, что
// gm.encodeFrame(25248, 17472). Оставлено константой как якорь для тестов.
const FRAME_ELEMENT = Buffer.from('4d000000508f00000000c5400003c54111020001110100000000', 'hex');

const MAGIC = 0xE028;
const MAX_BLOB = 0xffff;              // смещения секций — u16, длиннее тайл не бывает

// Формат тайла уровня: размах в сырых единицах, путь записи точек и ширина.
// Размах тайла = (ячейка << lw) >> сдвиг — целое у всех уровней EJ211.
function tileFormat(L, lw, lh) {
  const X = (L.cellX * (1 << lw)) >> L.shift, Y = (L.cellY * (1 << lh)) >> L.shift;
  const simple = !!L.simple;
  const m = Math.max(X, Y);
  const W = !simple ? 16 : m <= 0xff ? 8 : m <= 0xfff ? 12 : 16;
  return { X, Y, W, simple };
}

const L0_FORMAT = { X: 25248, Y: 17472, W: 16, simple: false };

// Собрать блоб тайла. roads — [{pts: [[x,y]…], cls, e9, attr?}] в сырых
// единицах ОТ НАЧАЛА ТАЙЛА (0…X, 0…Y). fmt — {X, Y, W, simple}; по умолчанию
// тайл 32×32 ячейки L0. Без дорог выходит ровно общий пустой тайл оригинала.
function tileBlob(roads = [], fmt = L0_FORMAT, area = null) {
  const f = Object.assign({}, L0_FORMAT, fmt);
  const elems = areaElements(area, f);
  const sorted = roads.map((r, i) => Object.assign({ i }, r))
    .sort((a, b) => (a.e9 - b.e9) || (attrOf(a) - attrOf(b)) || (a.i - b.i));
  let e9 = null, attr = null;
  sorted.forEach((r, k) => {
    const pre = [];
    if (k === 0) pre.push(0xc1);
    if (r.e9 !== e9) { pre.push(0xe0, r.e9); e9 = r.e9; attr = null; }
    const a = attrOf(r);
    const pts = r.pts || r.points.map(p => [p.x, p.y]);
    elems.push(Buffer.concat([Buffer.from(pre), gm.encodeLine(pts, a === attr ? null : a, f)]));
    attr = a;
  });
  const s1 = Buffer.from([0, 0]), s2 = Buffer.from([0, 0]);
  const stream = Buffer.concat(elems);
  const off0 = gm.TILE_HEAD + stream.length, off1 = off0 + s1.length, off2 = off1 + s2.length;
  if (off2 > MAX_BLOB) throw new Error('блоб тайла не влезает в u16: ' + off2 + ' б');
  const head = Buffer.alloc(gm.TILE_HEAD);
  head.writeUInt16BE(off0, 0);
  head.writeUInt16BE(off1, 2);
  head.writeUInt16BE(off2, 4);
  head.writeUInt16BE(elems.length, 6);       // только элементы: рамка + линии
  head.writeUInt16BE(MAGIC, 8);
  return Buffer.concat([head, stream, s1, s2]);
}

const attrOf = r => (r.attr === undefined ? r.cls : r.attr) >>> 0;

// ── суша и море ────────────────────────────────────────────────────────────
//
// Как у завода (docs/formats/gdb.md, «Суша и море»): морской тайл — один
// многоугольник 0x50 по границе тайла (это и есть «рамка»), тайл целиком на
// суше — один многоугольник 0x5F по границе, прибрежный — треугольники суши
// 0x5F и треугольники моря 0x50, каждый кусок тайла покрыт ровно одним из
// них. Многоугольник моря поверх суши не кладётся: у завода вода (0x50)
// рисуется ПОСЛЕ суши (озёра в тайле Германии идут последними).
const LAND = 0x5f, SEA = 0x50;
const MAX_TRIS = 21845;                  // 3·n ≤ 65535 точек в одном элементе

function areaElements(area, f) {
  if (!area || area.empty) return [gm.encodeFrame(f.X, f.Y, f.W, f.simple)];
  const out = [];
  const list = (attr, tris, edge, pre) => {
    for (let i = 0; i < tris.length; i += MAX_TRIS) {
      const part = tris.slice(i, i + MAX_TRIS);
      const el = gm.encodePolygon(part.flat(), gm.listFlags(part.length, edge), attr, f);
      out.push(i === 0 && pre ? Buffer.concat([pre, el]) : el);
    }
  };
  if (area.full) {
    const pts = f.simple ? [[f.X, f.Y], [0, f.Y], [0, 0], [f.X, 0]] : [[f.X, 0], [f.X, f.Y], [0, f.Y], [0, 0]];
    out.push(gm.encodePolygon(pts, [3, 2, 3, 2], LAND, f));      // веер, как рамка
  } else {
    list(LAND, area.land, true);
    list(SEA, area.sea, false);
  }
  // слои — в порядке завода; E0 держится до смены, у суши/моря/ступеней 0xFF
  let e9 = 0xff;
  for (const ly of area.layers || []) {
    const pre = ly.e9 !== e9 ? Buffer.from([0xe0, ly.e9]) : null;
    e9 = ly.e9;
    list(ly.attr, ly.tris, ly.attr !== SEA, pre);
  }
  return out;
}

const rectTris = (X, Y) => [[[0, 0], [X, 0], [X, Y]], [[0, 0], [X, Y], [0, Y]]];

// Отсечь кольцо прямоугольником [0,X]×[0,Y] (Сазерленд — Ходжмен). Кольцо
// вогнутое — на границе могут остаться «мостики» туда-обратно; при заливке по
// чёт-нечёт они взаимно гасятся.
function clipRing(ring, X, Y) {
  let pts = ring;
  const planes = [[p => p[0] >= 0, (a, b) => cutX(a, b, 0)], [p => p[0] <= X, (a, b) => cutX(a, b, X)],
                  [p => p[1] >= 0, (a, b) => cutY(a, b, 0)], [p => p[1] <= Y, (a, b) => cutY(a, b, Y)]];
  for (const [inside, cut] of planes) {
    if (!pts.length) break;
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[i];
      const ia = inside(a), ib = inside(b);
      if (ib) { if (!ia) out.push(cut(a, b)); out.push(b); } else if (ia) out.push(cut(a, b));
    }
    pts = out;
  }
  return pts;
}
const cutX = (a, b, x) => [x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])];
const cutY = (a, b, y) => [a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y];


// Область тайла X×Y, заданная кольцами (в сырых единицах ОТ НАЧАЛА ТАЙЛА):
// заливка по НЕНУЛЕВОЙ обмотке — внешние кольца против часовой, дыры по
// часовой; перекрытия объектов одного класса сливаются, а не гасятся.
// Разбиение на трапеции полосами между соседними y вершин; трапеции между
// одной и той же парой рёбер склеиваются по высоте. Возвращает {empty} |
// {full} | {inside: [[p,p,p]…], outside: [[p,p,p]…]} с целыми координатами.
function regionTris(rings, X, Y) {
  const near = rings.filter(r => r.bbox[0] <= X && r.bbox[2] >= 0 && r.bbox[1] <= Y && r.bbox[3] >= 0);
  if (!near.length) return { empty: true };
  const polys = near.map(r => clipRing(r.pts, X, Y).map(([x, y]) => [Math.round(x), Math.round(y)])).filter(p => p.length >= 3);
  const edges = [];
  for (const p of polys) {
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      if (a[1] !== b[1]) edges.push(a[1] < b[1] ? [a, b, 1] : [b, a, -1]);
    }
  }
  // кольца тайла не задевают — он целиком внутри или целиком снаружи
  if (!edges.length) return windingAt(near, X / 2, Y / 2) ? { full: true } : { empty: true };
  const ys = [...new Set([0, Y, ...polys.flat().map(q => q[1])])].sort((a, b) => a - b);
  const xAt = (e, y) => (e === 'L' ? 0 : e === 'R' ? X
    : Math.round(e[0][0] + (e[1][0] - e[0][0]) * (y - e[0][1]) / (e[1][1] - e[0][1])));
  const open = new Map();
  const done = [];
  for (let i = 0; i + 1 < ys.length; i++) {
    const y0 = ys[i], y1 = ys[i + 1], ym = (y0 + y1) / 2;
    const act = edges.filter(([a, b]) => a[1] <= y0 && b[1] >= y1)
      .map(e => ({ e, x: e[0][0] + (e[1][0] - e[0][0]) * (ym - e[0][1]) / (e[1][1] - e[0][1]) }))
      .sort((a, b) => a.x - b.x);
    const spans = [];
    let w = 0, from = 'L', fromIn = false;
    for (const q of act) {
      w += q.e[2];
      const nowIn = w !== 0;
      if (nowIn !== fromIn) { spans.push({ l: from, r: q.e, in: fromIn }); from = q.e; fromIn = nowIn; }
    }
    spans.push({ l: from, r: 'R', in: fromIn });
    const keys = new Set();
    for (const sp of spans) {
      const key = (sp.in ? 'I:' : 'O:') + edgeKey(sp.l) + '|' + edgeKey(sp.r);
      keys.add(key);
      const t = open.get(key);
      if (!t) open.set(key, { l: sp.l, r: sp.r, y0, y1, in: sp.in });
      else t.y1 = y1;
    }
    for (const k of [...open.keys()]) if (!keys.has(k)) { done.push(open.get(k)); open.delete(k); }
  }
  for (const t of open.values()) done.push(t);
  const inside = [], outside = [];
  for (const t of done) {
    const a = [xAt(t.l, t.y0), t.y0], b = [xAt(t.r, t.y0), t.y0], c = [xAt(t.r, t.y1), t.y1], d = [xAt(t.l, t.y1), t.y1];
    const dst = t.in ? inside : outside;
    for (const tri of [[a, b, c], [a, c, d]]) if (area2(tri) !== 0) dst.push(tri);
  }
  if (!inside.length) return { empty: true };
  if (!outside.length) return { full: true };
  return { inside, outside };
}

function windingAt(rings, x, y) {
  let w = 0;
  for (const r of rings) {
    const p = r.pts;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i], [xj, yj] = p[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) w += yj < yi ? 1 : -1;
    }
  }
  return w !== 0;
}

// Суша и море тайла: {empty} | {full} | {land, sea}
function landArea(rings, X, Y) {
  const r = regionTris(rings, X, Y);
  return r.inside ? { land: r.inside, sea: r.outside } : r;
}
const edgeKey = e => (typeof e === 'string' ? e : e[0].join(',') + '>' + e[1].join(','));
const area2 = ([a, b, c]) => (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);

// Дуглас — Пекер для замкнутого кольца (допуск в тех же единицах)
function simplifyRing(pts, tol) {
  if (pts.length < 8 || tol <= 0) return pts;
  const keep = new Uint8Array(pts.length);
  const stack = [[0, pts.length - 1]];
  keep[0] = keep[pts.length - 1] = 1;
  // кольцо режем на две дуги по самой дальней от первой точке
  let far = 0, fd = -1;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
  keep[far] = 1;
  stack.length = 0; stack.push([0, far], [far, pts.length - 1]);
  while (stack.length) {
    const [i0, i1] = stack.pop();
    const [ax, ay] = pts[i0], [bx, by] = pts[i1];
    const L = Math.hypot(bx - ax, by - ay) || 1;
    let mi = -1, md = tol;
    for (let i = i0 + 1; i < i1; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
      if (d > md) { md = d; mi = i; }
    }
    if (mi >= 0) { keep[mi] = 1; stack.push([i0, mi], [mi, i1]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// Кольца суши (градусы) → кольца уровня в сырых единицах от начала карты
// (ячейка·cellX >> сдвиг), упрощённые с допуском в 1,5 единицы уровня.
function landForLevel(rings, L, opt = {}) {
  const u = 1 << L.shift;
  const out = [];
  for (const r of rings || []) {
    let pts = r.map(([lon, lat]) => [cellXL(lon, L) * L.cellX / u, cellYL(lat, L) * L.cellY / u]);
    pts = simplifyRing(pts, opt.tol || 1.5);
    if (pts.length < 3) continue;
    // суша: всегда против часовой (обмотка +1); у площадных объектов
    // направление задано при разборе (дыры — по часовой)
    if (opt.ccw && ringArea(pts) < 0) pts = pts.reverse();
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    if (bbox[2] - bbox[0] < 2 && bbox[3] - bbox[1] < 2) continue;      // островок мельче единицы
    out.push({ pts, bbox });
  }
  return out;
}

function ringArea(p) {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1]);
  return a / 2;
}

// ── слои поверх суши ───────────────────────────────────────────────────────
//
// Классы и уровни — по заводу (docs/formats/gdb.md, «Площадные классы»):
//   0x60 | ступень<<8 — ступени рельефа, L4…L11, вложенные, по возрастанию;
//   0x51 лес, 0x52 парки/заповедники, 0x53 застройка, 0x54 промзоны,
//   0x56 аэродромы — L0…L4; 0x57 перроны — L0…L3; 0x50 вода — все уровни.
// Порядок в тайле: суша/море, ступени, лес, парки, застройка, промзоны,
// аэродромы, перроны, вода (у завода вода идёт последней, ступени — сразу за сушей).
const OVERLAY = [
  { cls: 'forest', attr: 0x51, maxLevel: 4, e9: () => 20 },
  { cls: 'park', attr: 0x52, maxLevel: 4, e9: () => 16 },
  { cls: 'built', attr: 0x53, maxLevel: 4, e9: a => (a >= 5 ? 22 : a >= 1 ? 18 : 13) },
  { cls: 'industrial', attr: 0x54, maxLevel: 4, e9: () => 19 },
  { cls: 'airport', attr: 0x56, maxLevel: 4, e9: () => 20 },
  { cls: 'apron', attr: 0x57, maxLevel: 3, e9: () => 18 },
  { cls: 'water', attr: 0x50, maxLevel: 11, e9: a => (a >= 5 ? 34 : a >= 0.5 ? 25 : 18) },
];

// Объект мельче ~4×4 единиц уровня на уровень не идёт
function minKm2(L) {
  const unit = (1 << L.shift) * 88.9 / 72000;          // км на сырую единицу по долготе у Кипра
  return Math.max(0.002, 16 * unit * unit);            // и не меньше 2000 м² — участки-крошки не берём
}
// Допуск упрощения слоёв: 6 единиц (на L0 ~7 м) — мельче глазу не видно, а
// тайл с лесом и застройкой Никосии иначе не влезает ни в какой размер
const LAYER_TOL = 6;

function layersForLevel(opts, lv, L) {
  const out = [];
  if (lv >= 4) {
    for (const b of (opts.bands || [])) {
      const rings = landForLevel(b.rings, L, { tol: LAYER_TOL });
      if (rings.length) out.push({ attr: (0x60 | (b.h << 8)) >>> 0, e9: 0xff, rings });
    }
  }
  const lim = minKm2(L);
  for (const o of OVERLAY) {
    if (lv > o.maxLevel) continue;
    const groups = new Map();
    for (const f of (opts.areas || [])) {
      if (f.cls !== o.cls || f.km2 < lim) continue;
      const e9 = o.e9(f.km2);
      if (!groups.has(e9)) groups.set(e9, []);
      groups.get(e9).push(...landForLevel(f.rings, L, { tol: LAYER_TOL }));
    }
    for (const [e9, rings] of [...groups].sort((a, b) => a[0] - b[0])) if (rings.length) out.push({ attr: o.attr, e9, rings });
  }
  return out;
}

// Кольца, сдвинутые к началу тайла (tx0, ty0 — в сырых единицах уровня)
const shiftRings = (rings, tx0, ty0) => rings.map(r => ({
  pts: r.pts.map(([x, y]) => [x - tx0, y - ty0]),
  bbox: [r.bbox[0] - tx0, r.bbox[1] - ty0, r.bbox[2] - tx0, r.bbox[3] - ty0],
}));

// Общий пустой тайл: та же сборка без дорог. Совпадает с оригинальным
// байт в байт — на этом держится проверка в тестах.
function emptyTile(fmt) { return tileBlob([], fmt); }

// Обратный разбор тайла настоящим читателем потока (gm.readElements).
// opts — {W, simple} записи тайла. Возвращает линии с точками и классами.
function readTileRoads(blob, opts = {}) {
  const r = gm.readElements(blob, { W: opts.W || 16, simple: !!opts.simple, points: true });
  if (!r.ok) throw new Error('поток элементов не сошёлся с off0: ' + r.end + ' ≠ ' + r.off0);
  const roads = r.els.filter(e => e.type === 1).map(e => ({
    points: e.pts.map(([x, y]) => ({ x, y })), cls: e.cls, attr: e.attr, e9: e.e9, head: e.head,
  }));
  return { count: blob.readUInt16BE(6), els: r.els, roads };
}

// ── кластер ────────────────────────────────────────────────────────────────

// Порядок тайлов в кластере — Мортон (биты ix и iy вперемежку). Проверено на
// 2422 кластерах L0 из шестнадцати тайлов: расхождений нет.
function mortonIndex(ix, iy) {
  let r = 0;
  for (let b = 0; b < 16; b++) r |= ((ix >> b & 1) << (2 * b)) | ((iy >> b & 1) << (2 * b + 1));
  return r >>> 0;
}

const CLUSTER_REC = 19;

// tiles: [{x, y, lw, lh, attr, flag, off, size}] — x,y в ячейках уровня.
// Порядок задаёт вызывающий (buildLevel раскладывает по Мортону).
function clusterBlob(tiles) {
  const b = Buffer.alloc(tiles.length * CLUSTER_REC);
  tiles.forEach((t, i) => {
    const o = i * CLUSTER_REC;
    b.writeUInt32BE(((t.y & 0xffff) << 16 | (t.x & 0xffff)) >>> 0, o);
    b.writeUInt16BE(t.lw, o + 4);
    b.writeUInt16BE(t.lh, o + 6);
    b[o + 8] = t.flag || 0;
    b[o + 9] = t.attr === undefined ? 0x10 : t.attr;   // ширина координаты
    b[o + 10] = t.b10 || 0;                            // 1 — точки прямым путём
    b.writeUInt32BE(t.off, o + 11);
    b.writeUInt32BE(t.size, o + 15);
  });
  return b;
}

// ── том целиком ────────────────────────────────────────────────────────────

// spec = {
//   id, stamp, name, frame,
//   levels: [{ cellX, cellY, potX, potY, from, to, H, tag,
//              clusters: [{ cx, cy, tiles: [{ ix, iy, lw, lh, attr, blob }] }] }]
// }
// Возвращает { gdb, gd2, map } — второй том пустой: сквозных ссылок за границу
// собранный файл не делает.
function build(spec) {
  const frame = spec.frame || FRAME;
  const levels = spec.levels || [];
  const h = { frame };

  // 1. размеры уровней: таблица начинается на +1163 и идёт до конца уровня
  // Сетка — по рамке, как считает прошивка (FUN_08cb181c): W·H записей, иначе
  // уровень не загружается. Таблица — два массива: count × {u32 смещение, u16
  // размер} и count × {u16 тайлов в кластере, u16 0}: 10 байт на запись.
  const plan = levels.map((L, i) => {
    const W = gm.gridW(h, L);
    const H = Math.floor((frame[3] - frame[1] - 1) / (L.cellY * (1 << L.potY))) + 1;
    const count = W * H;
    // ключи кластеров несут добавку уровня — без неё прошивка (и наш читатель)
    // ищут кластер не в том слоте; см. gm.keyOrigin
    const key0 = L.key0 || gm.keyOrigin(i);
    return { L, W, H, count, key0, size: gm.TABLE_AT + count * 10 };
  });
  // Уровни начинаются с кратного 4 смещения — так у всех 12 уровней Европы и
  // всех 8 Австралии (размер уровня ≡ 3 mod 4, отсюда «лишний» байт перед следующим).
  let at = PROLOGUE;
  for (const p of plan) { at = Math.ceil(at / 4) * 4; p.offset = at; at += p.size; }
  const regionEnd = at;

  // 2. данные: общий пустой тайл, затем по кластерам — их тайлы и запись-таблица
  const chunks = [];
  let pos = regionEnd;
  const put = buf => { const o = pos; chunks.push(buf); pos += buf.length; return o; };
  // Пустой тайл — свой на каждый формат (уровень и размер тайла): рамка в нём
  // по границе тайла и тем же путём записи точек, что у соседей. Тайл L0
  // 32×32 — ровно общий пустой тайл оригинала.
  const empties = new Map();
  const emptyFor = (L, lw, lh) => {
    const f = tileFormat(L, lw, lh);
    const blob = emptyTile(f);
    const k = blob.toString('hex') + ':' + f.W + ':' + f.simple;
    if (!empties.has(k)) empties.set(k, { off: put(blob), size: blob.length, attr: f.W, b10: f.simple ? 1 : 0 });
    return empties.get(k);
  };
  const e0 = emptyFor(EUROPE_LEVELS[0], 5, 5);

  const map = { emptyTile: { off: e0.off, size: e0.size }, levels: [] };
  for (const p of plan) {
    const entries = new Array(p.count).fill(null).map(() => ({ off: 0, sz: 0 }));
    const placed = [];
    for (const c of (p.L.clusters || [])) {
      if (c.cx < 0 || c.cx >= p.W || c.cy < 0 || c.cy >= p.H) {
        throw new Error('кластер (' + c.cx + ',' + c.cy + ') вне сетки ' + p.W + '×' + p.H);
      }
      const slot = c.cy * p.W + c.cx;
      // Тайлы кластера — сплошная сетка 2^(potX−lw) × 2^(potY−lh) в порядке
      // Мортона; клетки, для которых тайла не дали, ссылаются на общий пустой
      // тайл — ровно так устроены «морские» кластеры оригинала.
      const lw = c.lw === undefined ? 5 : c.lw, lh = c.lh === undefined ? 5 : c.lh;
      const byIdx = new Map();
      for (const t of c.tiles) byIdx.set(mortonIndex(t.ix, t.iy), t);
      const recs = [];
      // Порядок Мортона. Сетка тайлов бывает неквадратной (2^3×2^2 ячеек при
      // кластере 2^7: 16×32 тайла) — тогда обходим квадрат по большей стороне
      // и пропускаем клетки за краем (Z-порядок, как в квадродереве завода).
      // Раньше обход шёл по 2^(nx+ny) номерам, и у неквадратной сетки часть
      // тайлов в кластер не попадала.
      const nx = 1 << (p.L.potX - lw), ny = 1 << (p.L.potY - lh), side = Math.max(nx, ny);
      for (let k = 0; k < side * side; k++) {
        // обратный Мортон: чётные биты — ix, нечётные — iy
        let ix = 0, iy = 0;
        for (let b = 0; b < 8; b++) { ix |= (k >> (2 * b) & 1) << b; iy |= (k >> (2 * b + 1) & 1) << b; }
        if (ix >= nx || iy >= ny) continue;
        const x = p.key0.x0 + (c.cx << p.L.potX) + (ix << lw);
        const y = p.key0.y0 + (c.cy << p.L.potY) + (iy << lh);
        const t = byIdx.get(k);
        if (t) {
          const o = put(t.blob);
          const f = tileFormat(p.L, lw, lh);
          recs.push({ x, y, lw, lh, attr: t.attr === undefined ? f.W : t.attr,
                      b10: t.b10 === undefined ? (f.simple ? 1 : 0) : t.b10, flag: t.flag, off: o, size: t.blob.length });
        } else {
          const em = emptyFor(p.L, lw, lh);
          recs.push({ x, y, lw, lh, attr: em.attr, b10: em.b10, off: em.off, size: em.size });
        }
      }
      const blob = clusterBlob(recs);
      const off = put(blob);
      entries[slot] = { off, sz: blob.length };
      placed.push({ cx: c.cx, cy: c.cy, slot, off, size: blob.length, tiles: recs });
    }
    // Заводские кластеры как есть (опыт): записи тайлов байт в байт, кроме
    // смещения тайла, затем словарь имён кластера; его длина — второе поле слота.
    for (const c of (p.L.raw || [])) {
      const slot = c.cy * p.W + c.cx;
      if (entries[slot].sz) continue;
      const recs = Buffer.from(c.records);
      const moved = new Map();
      for (let o = 0; o < recs.length; o += CLUSTER_REC) {
        const old = recs.readUInt32BE(o + 11);
        if (!moved.has(old)) moved.set(old, put(c.tiles.get(old)));
        recs.writeUInt32BE(moved.get(old), o + 11);
      }
      const blob = Buffer.concat([recs, c.dict]);
      entries[slot] = { off: put(blob), sz: blob.length, tiles: recs.length / CLUSTER_REC, dict: c.dict.length };
      placed.push({ cx: c.cx, cy: c.cy, slot, raw: true });
    }
    // Пустых слотов у завода нет: «морской» кластер — свои ключи, все тайлы
    // ссылаются на общий пустой (у Европы и Австралии непусты все слоты).
    const lw = p.L.lw === undefined ? p.L.potX : p.L.lw, lh = p.L.lh === undefined ? p.L.potY : p.L.lh;
    for (let slot = 0; slot < p.count; slot++) {
      if (entries[slot].sz) continue;
      const cx = slot % p.W, cy = Math.floor(slot / p.W);
      const recs = [];
      for (let k = 0, n = 1 << (p.L.potX - lw + p.L.potY - lh); k < n; k++) {
        let ix = 0, iy = 0;
        for (let b = 0; b < 8; b++) { ix |= (k >> (2 * b) & 1) << b; iy |= (k >> (2 * b + 1) & 1) << b; }
        const em = emptyFor(p.L, lw, lh);
        recs.push({ x: p.key0.x0 + (cx << p.L.potX) + (ix << lw), y: p.key0.y0 + (cy << p.L.potY) + (iy << lh),
                    lw, lh, attr: em.attr, b10: em.b10, off: em.off, size: em.size });
      }
      const blob = clusterBlob(recs);
      entries[slot] = { off: put(blob), sz: blob.length };
    }
    p.entries = entries;
    map.levels.push({ i: map.levels.length, offset: p.offset, size: p.size, W: p.W, H: p.H, key0: p.key0, clusters: placed });
  }

  // 3. шапка
  const head = Buffer.alloc(PROLOGUE);
  head.writeUInt32BE(SIG, 0);
  head.writeUInt32BE(spec.version || VERSION, 4);
  head.writeUInt32BE(spec.id === undefined ? 1711366677 : spec.id, 8);
  // Разбор шапки в прошивке (FUN_08cb16b4): после 'f',01 идёт u32 по +0x0a, затем
  // u32 начала пролога (+0x0e) и u16 его длины (+0x12) — 0x14 и 0x0304 у Европы и
  // Австралии. По ним открытие тома (FUN_08cb20f0) читает каталог уровней.
  head.writeUInt16BE(spec.idTail === undefined ? 0x0bc8 : spec.idTail, 0x0c);
  head.writeUInt32BE(0x14, 0x0e);
  head.writeUInt16BE(PROLOGUE - 0x14, 0x12);
  frame.forEach((v, i) => head.writeInt32BE(v, 0x14 + i * 4));
  head[0x24] = plan.length;
  plan.forEach((p, i) => {
    head.writeUInt32BE(p.offset, 0x2D + i * 8);
    head.writeUInt32BE(p.size, 0x2D + i * 8 + 4);
  });
  head.writeUInt16BE(0xffff, 301);
  head.write(String(spec.stamp || '20220218092956').slice(0, 14), 303, 'latin1');
  // за 14 символами метки — два нулевых байта, имя с +319 (Европа и Австралия)
  head.write(String(spec.name || 'EJ211').slice(0, 8), 319, 'latin1');
  TAIL_576.copy(head, 576);
  head.writeUInt32BE(0, 577);          // каталога блобов у собранного тома нет
  head.writeUInt32BE(0, 581);
  head.writeUInt32BE(0, 585);
  head.writeUInt32BE(regionEnd, 589);  // начало данных

  // 4. уровни
  const levelBufs = plan.map(p => {
    const b = Buffer.alloc(p.size);
    b.writeUInt32BE(p.L.cellX, 0);
    b.writeUInt32BE(p.L.cellY, 4);
    b[8] = p.L.potX; b[9] = p.L.potY;
    b.writeUInt32BE(p.L.from, 10);
    b.writeUInt32BE(p.L.to, 14);
    for (let k = 0; k < 16; k++) b.writeInt32BE(0x7fffffff, 18 + k * 4);
    if (p.L.tag) Buffer.from(p.L.tag, 'hex').copy(b, 82);
    b.writeUInt32BE(p.count, gm.TABLE_AT - 4);
    const second = gm.TABLE_AT + p.count * 6;
    p.entries.forEach((e, i) => {
      b.writeUInt32BE(e.off, gm.TABLE_AT + i * 6);
      b.writeUInt16BE(e.sz, gm.TABLE_AT + i * 6 + 4);
      b.writeUInt16BE(e.tiles === undefined ? e.sz / CLUSTER_REC : e.tiles, second + i * 4);
      b.writeUInt16BE(e.dict || 0, second + i * 4 + 2);
    });
    return b;
  });

  // между уровнями — нулевые байты до выровненного смещения следующего
  const levelParts = [];
  let end = PROLOGUE;
  plan.forEach((p, i) => {
    levelParts.push(Buffer.alloc(p.offset - end), levelBufs[i]);
    end = p.offset + p.size;
  });
  return { gdb: Buffer.concat([head, ...levelParts, ...chunks]), gd2: Buffer.alloc(0), map, regionEnd };
}

// ── укладка дорог ──────────────────────────────────────────────────────────

const TILE_CELLS = 32;                                  // тайл L0 по умолчанию — 32×32 ячейки
// Калибровка — общая с XAC и с отсчётом от рамки карты, см. gm.cellOfLon
// (docs/formats/gdb.md, «Привязка вскрыта: система координат общая с XAC»).
const cellX = lon => gm.cellOfLon(lon, gm.CELL_X);
const cellY = lat => gm.cellOfLat(lat, gm.CELL_Y);

// Ячейка уровня по градусам: мировая единица у всех уровней общая, меняется
// только размер ячейки. У L0 (789×546) это в точности прежние cellX/cellY.
const cellXL = (lon, L) => gm.cellOfLon(lon, L.cellX);
const cellYL = (lat, L) => gm.cellOfLat(lat, L.cellY);

// градусы → мировые единицы от начала тайла
function degToTile(lon, lat, tcx, tcy) {
  return {
    x: Math.round((cellX(lon) - tcx) * gm.CELL_X),
    y: Math.round((cellY(lat) - tcy) * gm.CELL_Y),
  };
}

// То же для любого уровня: точка хранится в единицах, сдвинутых на L.shift —
// прошивка восстанавливает мировую как `начало_тайла + (сырая << сдвиг)`.
function degToTileL(lon, lat, tcx, tcy, L) {
  const u = 1 << L.shift;
  return {
    x: Math.round((cellXL(lon, L) - tcx) * L.cellX / u),
    y: Math.round((cellYL(lat, L) - tcy) * L.cellY / u),
  };
}

// Размеры тайла, которые перебирает подбор: X и Y уменьшаются по очереди —
// ровно такой ряд лежит в заводском томе.
const TILE_SIZES = [[5, 5], [5, 4], [4, 4], [4, 3], [3, 3], [3, 2], [2, 2], [2, 1], [1, 1], [1, 0]];

function tileSizes(L) {
  const out = [];
  let lw = L.lw, lh = L.lh;
  while (lw > 0 || lh > 0) {
    out.push([lw, lh]);
    if (lw > lh) lw--; else if (lh > 0) lh--; else lw--;
  }
  out.push([0, 0]);
  return out;
}

// Класс линии и значение E0 по уровню — сняты с заводского тома: какие классы
// и E0 лежат на известных дорогах Баварии (A9 у Ингольштадта, B13, B16; ж/д
// Мюнхен—Нюрнберг вдоль A9 — класс 8), см. docs/formats/gdb.md.
//   L0…L6 автобан — класс 1, E0 24 (съезды — класс 1, E0 20)
//   L7…L11 автобан — класс 0, E0 40 (на L11 у всех линий E0 0xFF)
//   L0…L3 крупные дороги (B13) — класс 2, E0 19; помельче (B16) — класс 3, E0 15
//   L4…L10 крупные дороги — класс 9, E0 34 (trunk) и 25 (primary)
//   L0 мелочь: класс 6 (E0 8) — tertiary, класс 4 (E0 8) — улицы
// Соответствие тегов OSM этим классам — догадка по плотности и геометрии.
function classFor(lv, hw) {
  // реки: класс 9 — в прошивке GDB_FLUSS (таблица 0x09a5f208, docs/formats/xar.md);
  // у завода реки идут им на всех уровнях с E0 18…40. Класс 10 — канал.
  if (hw === 'river') return { cls: 9, e9: 18 };
  const k = String(hw || '').replace(/_link$/, '');
  const link = /_link$/.test(String(hw || ''));
  if (k === 'motorway') {
    if (lv <= 6) return { cls: 1, e9: link ? 20 : 24 };
    return { cls: 0, e9: lv === 11 ? 0xff : 40 };
  }
  if (lv <= 3) {
    if (k === 'trunk' || k === 'primary') return { cls: 2, e9: 19 };
    if (k === 'secondary') return { cls: 3, e9: 15 };
    if (lv >= 1) return { cls: 3, e9: 15 };          // tertiary на L1
    if (k === 'tertiary') return { cls: 6, e9: 8 };
    return { cls: 4, e9: 8 };
  }
  // Обзорные уровни: класс 9 здесь НЕ дорога (это река, GDB_FLUSS) — прежняя
  // привязка к B16 спутала дорогу с идущим рядом Дунаем. У завода на L4+
  // дороги — магистрали 0/1 и редкие 2/3 с E0 30; главные дороги пишем 2/30.
  if (lv === 11) return { cls: 2, e9: 0xff };
  return { cls: k === 'secondary' ? 3 : 2, e9: 30 };
}

// Разрезать ломаную по сетке шага sx×sy (в тех же единицах): точки пересечения
// с линиями сетки вставляются, куски ложатся в свою клетку. Точка на границе
// принадлежит обоим соседним кускам — так у завода: первая точка линии лежит
// ровно на краю тайла (проверено: 14246 + 3226 = 17472 = высота тайла).
function splitGrid(pts, sx, sy) {
  const runs = [];
  let cur = null;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
    const ts = [0, 1];
    const cross = (a, b, s) => {
      if (a === b) return;
      const lo = Math.min(a, b), hi = Math.max(a, b);
      for (let k = Math.floor(lo / s) + 1; k * s < hi; k++) ts.push((k * s - a) / (b - a));
    };
    cross(x1, x2, sx); cross(y1, y2, sy);
    ts.sort((a, b) => a - b);
    for (let j = 1; j < ts.length; j++) {
      const t0 = ts[j - 1], t1 = ts[j];
      if (t1 - t0 < 1e-12) continue;
      const pa = [x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0], pb = [x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1];
      const tm = (t0 + t1) / 2;
      const gx = Math.floor((x1 + (x2 - x1) * tm) / sx), gy = Math.floor((y1 + (y2 - y1) * tm) / sy);
      if (!cur || cur.gx !== gx || cur.gy !== gy) { cur = { gx, gy, pts: [pa] }; runs.push(cur); }
      cur.pts.push(pb);
    }
  }
  return runs;
}

// Разложить ломаные (в градусах) по тайлам уровня и собрать его описание.
// Линии режутся по границам кластеров и тайлов, как у завода: все точки
// линии лежат внутри своего тайла [0, X] × [0, Y].
//
// Размер тайла подбирается ПО КЛАСТЕРУ: смещения секций внутри блоба — u16,
// и плотный тайл в 32 ячейки не влезает. Завод решает это так же — внутри
// кластера размер тайла один, а между кластерами он гуляет от 2^5 до 2^0.
//
// opts.level — номер уровня (по умолчанию 0).
function roadsToLevel(lines, opts = {}) {
  const lvNr = opts.level || 0;
  const L = Object.assign({}, EUROPE_LEVELS[lvNr]);
  const CW = 1 << L.potX, CH = 1 << L.potY;
  const u = 1 << L.shift;

  // 1. дороги по кластерам — в ячейках уровня (дробных)
  const perCluster = new Map();
  let skipped = 0;
  for (const ln of lines) {
    const coords = Array.isArray(ln) ? ln : ln.pts;
    if (!coords || coords.length < 2) { skipped++; continue; }
    const c = classFor(lvNr, Array.isArray(ln) ? null : ln.cls);
    const cells = coords.map(([lon, lat]) => [cellXL(lon, L), cellYL(lat, L)]);
    for (const run of splitGrid(cells, CW, CH)) {
      const k = run.gx + ',' + run.gy;
      if (!perCluster.has(k)) perCluster.set(k, { cx: run.gx, cy: run.gy, pieces: [] });
      perCluster.get(k).pieces.push({ cells: run.pts, cls: c.cls, e9: c.e9 });
    }
  }

  // 1б. суша: кольца уровня и кластеры, которых они касаются (в том числе
  //     без единой дороги — суша нужна и там)
  const land = landForLevel(opts.land, L, { ccw: true });
  const layers = layersForLevel(opts, lvNr, L);
  const CWr = CW * L.cellX / u, CHr = CH * L.cellY / u;       // кластер в сырых единицах
  for (const r of land) {
    for (let gx = Math.floor(r.bbox[0] / CWr); gx <= Math.floor(r.bbox[2] / CWr); gx++) {
      for (let gy = Math.floor(r.bbox[1] / CHr); gy <= Math.floor(r.bbox[3] / CHr); gy++) {
        const k = gx + ',' + gy;
        if (!perCluster.has(k)) perCluster.set(k, { cx: gx, cy: gy, pieces: [] });
      }
    }
  }
  let landTiles = 0;

  // 2. на каждый кластер — самый крупный размер тайла, при котором блобы влезают
  const clusters = [];
  let dropped = 0;
  const budget = opts.maxBlob || MAX_BLOB;
  for (const c of perCluster.values()) {
    let chosen = null;
    // кольца, заранее отсечённые прямоугольником кластера (с запасом)
    const cx0 = c.cx * CWr, cy0 = c.cy * CHr;
    const cut = rings => rings.filter(r => r.bbox[0] <= cx0 + CWr && r.bbox[2] >= cx0 && r.bbox[1] <= cy0 + CHr && r.bbox[3] >= cy0)
      .map(r => {
        const sh = shiftRings([r], cx0 - 1, cy0 - 1)[0];
        const pts = clipRing(sh.pts, CWr + 2, CHr + 2).map(([x, y]) => [x + cx0 - 1, y + cy0 - 1]);
        if (pts.length < 3) return null;
        const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
        return { pts, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], whole: r };
      }).filter(Boolean);
    const cland = cut(land);
    const clayers = layers.map(ly => Object.assign({}, ly, { rings: cut(ly.rings) })).filter(ly => ly.rings.length);
    for (const [lw, lh] of tileSizes(L)) {
      // размер кластера в таблице уровня — u16: не больше 3449 записей по 19 байт
      if ((L.potX - lw) + (L.potY - lh) > 11) break;
      const f = tileFormat(L, lw, lh);
      const step = [1 << lw, 1 << lh];
      const byTile = new Map();
      let out = 0;
      for (const pc of c.pieces) {
        for (const run of splitGrid(pc.cells, step[0], step[1])) {
          const tx = run.gx * step[0], ty = run.gy * step[1];
          const raw = [];
          for (const [x, y] of run.pts) {
            const q = [Math.min(f.X, Math.max(0, Math.round((x - tx) * L.cellX / u))),
                       Math.min(f.Y, Math.max(0, Math.round((y - ty) * L.cellY / u)))];
            const last = raw[raw.length - 1];
            if (!last || last[0] !== q[0] || last[1] !== q[1]) raw.push(q);
          }
          // на грубых уровнях единица крупная: кусок может схлопнуться в точку
          if (raw.length < 2) { out++; continue; }
          for (let s = 0; s < raw.length - 1; s += 0xfffe) {
            const k = tx + ',' + ty;
            if (!byTile.has(k)) byTile.set(k, { tx, ty, roads: [] });
            byTile.get(k).roads.push({ pts: raw.slice(s, s + 0xffff), cls: pc.cls, e9: pc.e9 });
          }
        }
      }
      // суша: каждый тайл кластера, которого касаются кольца или который
      // целиком внутри суши
      const areas = new Map();
      if (cland.length) {
        for (let ix = 0; ix < (1 << (L.potX - lw)); ix++) {
          for (let iy = 0; iy < (1 << (L.potY - lh)); iy++) {
            const tx = c.cx * CW + (ix << lw), ty = c.cy * CH + (iy << lh);
            const tx0 = tx * L.cellX / u, ty0 = ty * L.cellY / u;
            const near = cland.filter(r => r.bbox[0] <= tx0 + f.X && r.bbox[2] >= tx0 && r.bbox[1] <= ty0 + f.Y && r.bbox[3] >= ty0);
            let a;
            if (near.length) a = landArea(shiftRings(near, tx0, ty0), f.X, f.Y);
            else a = windingAt(cland.map(r => r.whole), tx0 + f.X / 2, ty0 + f.Y / 2) ? { full: true } : { empty: true };
            if (a.empty) continue;
            // слои поверх суши: ступени рельефа, лес, застройка, вода …
            a.layers = [];
            for (const ly of clayers) {
              const nearL = ly.rings.filter(r => r.bbox[0] <= tx0 + f.X && r.bbox[2] >= tx0 && r.bbox[1] <= ty0 + f.Y && r.bbox[3] >= ty0);
              let q;
              if (nearL.length) q = regionTris(shiftRings(nearL, tx0, ty0), f.X, f.Y);
              else q = windingAt(ly.rings.map(r => r.whole), tx0 + f.X / 2, ty0 + f.Y / 2) ? { full: true } : { empty: true };
              if (q.empty) continue;
              a.layers.push({ attr: ly.attr, e9: ly.e9, tris: q.full ? rectTris(f.X, f.Y) : q.inside });
            }
            const k = tx + ',' + ty;
            areas.set(k, a);
            if (!byTile.has(k)) byTile.set(k, { tx, ty, roads: [] });
          }
        }
      }
      let fits = true;
      const tiles = [];
      for (const t of byTile.values()) {
        let blob;
        const area = areas.get(t.tx + ',' + t.ty) || null;
        try { blob = tileBlob(t.roads, f, area); } catch (e) { fits = false; break; }
        if (blob.length > budget) { fits = false; break; }
        tiles.push({
          ix: (t.tx - c.cx * CW) >> lw, iy: (t.ty - c.cy * CH) >> lh,
          lw, lh, blob, attr: f.W, b10: f.simple ? 1 : 0, lines: t.roads.length, land: area ? (area.full ? 'full' : 'coast') : null,
        });
      }
      if (fits) { chosen = { lw, lh, tiles, out }; break; }
    }
    if (!chosen) { skipped += c.pieces.length; continue; }
    dropped += chosen.out;
    landTiles += chosen.tiles.filter(t => t.land).length;
    if (!chosen.tiles.length) continue;
    clusters.push({ cx: c.cx, cy: c.cy, lw: chosen.lw, lh: chosen.lh, tiles: chosen.tiles });
  }

  L.clusters = clusters;
  const tiles = clusters.reduce((a, c) => a + c.tiles.length, 0);
  const elements = clusters.reduce((a, c) => a + c.tiles.reduce((b, t) => b + t.lines, 0), 0);
  const sizes = {};
  for (const c of clusters) sizes['2^' + c.lw + 'x2^' + c.lh] = (sizes['2^' + c.lw + 'x2^' + c.lh] || 0) + 1;
  return { level: L, tiles, clusters: clusters.length, skipped, dropped, elements, sizes, landTiles };
}

// Классы дорог по уровням — та же пирамида, что у завода: чем мельче масштаб,
// тем меньше классов остаётся. Ключ — тег `highway` из OSM; дороги без класса
// считаются мелкими и выше L0 не идут.
const LEVEL_CLASSES = [
  null,                                                              // L0 — всё
  ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'],         // L1
  ['motorway', 'trunk', 'primary', 'secondary'],                     // L2
  ['motorway', 'trunk', 'primary', 'secondary'],                     // L3
  ['motorway', 'trunk', 'primary'],                                  // L4
  ['motorway', 'trunk', 'primary'],                                  // L5
  ['motorway', 'trunk', 'primary'],                                  // L6
  ['motorway', 'trunk'],                                             // L7
  ['motorway', 'trunk'],                                             // L8
  ['motorway'], ['motorway'], ['motorway'],                          // L9…L11
];

// Оставить для уровня только те дороги, чей класс на нём ещё рисуется.
function linesForLevel(lines, lv) {
  const cls = LEVEL_CLASSES[lv];
  // реки — только L1…L3: там их класс у завода установлен; на L0 — нет
  if (!cls) return lines.filter(ln => Array.isArray(ln) || ln.cls !== 'river');
  const set = new Set(cls.concat(cls.map(c => c + '_link'), lv >= 1 && lv <= 3 ? ['river'] : []));
  return lines.filter(ln => !Array.isArray(ln) && ln.cls && set.has(ln.cls));
}

// Том «только эти дороги». opts.levels — список номеров уровней (по умолчанию
// один L0); на каждый из них дороги раскладываются своей сеткой и своим
// сдвигом, прочие уровни остаются пустыми.
// Суша по умолчанию — out/cyp/land.json (`node src/coast.js`): так её получает
// и сборщик образа (src/mkcyprus.js), не зная о ней. opts.land = null — без суши.
const DEFAULT_LAND = 'out/cyp/land.json';
function defaultLand() {
  try { return JSON.parse(fs.readFileSync(DEFAULT_LAND, 'utf8')).rings; } catch (e) { return null; }
}

const DEFAULT_AREAS = 'out/cyp/areas.json', DEFAULT_BANDS = 'out/cyp/bands.json';
const readJson = (f, k) => { try { return JSON.parse(fs.readFileSync(f, 'utf8'))[k]; } catch (e) { return null; } };

function volumeFromRoads(lines, opts = {}) {
  if (opts.land === undefined) opts = Object.assign({}, opts, { land: defaultLand() });
  if (opts.areas === undefined) opts = Object.assign({}, opts, { areas: readJson(DEFAULT_AREAS, 'features') });
  if (opts.bands === undefined) opts = Object.assign({}, opts, { bands: readJson(DEFAULT_BANDS, 'bands') });
  if (opts.rivers === undefined) opts = Object.assign({}, opts, { rivers: readJson(DEFAULT_AREAS, 'rivers') });
  if (opts.rivers) lines = lines.concat(opts.rivers.map(pts => ({ cls: 'river', pts, name: null })));
  const want = opts.levels || [0];
  const stats = new Map();
  for (const lv of want) {
    const mine = linesForLevel(lines, lv);
    const st = roadsToLevel(mine, Object.assign({}, opts, { level: lv }));
    st.nr = lv; st.lines = mine.length;
    stats.set(lv, st);
  }
  const levels = EUROPE_LEVELS.map((L, i) => (stats.has(i)
    ? stats.get(i).level
    : Object.assign({}, L, { clusters: [] })))
    .map((L, i) => (opts.raw && opts.raw[i] ? Object.assign({}, L, { raw: opts.raw[i] }) : L));
  const r = stats.get(want[0]);
  return Object.assign({}, build(Object.assign({}, opts, { levels })), {
    stat: r, stats: [...stats.values()],
  });
}

// Компонент GDB в наборе: сам том и его .conf. Вынесено из CLI, потому что
// этим же путём кладёт том сборщик образа (src/mkimage.js).
//
// GDB2 в набор не кладём: второй том у нас пуст, сквозных ссылок за границу
// первого собранный том не делает, а нулевой файл установщику предъявлять
// незачем. Что GDB2 необязателен, видно по австралийскому набору — там его нет.
function component(outDir, v, opt) {
  const o = opt || {};
  const root = o.root || dataset.resolveRoot();
  const base = (o.name || 'EJ211') + '_v37a';
  const dir = path.join(outDir, 'pkgdb', 'GDB');
  fs.mkdirSync(dir, { recursive: true });
  const gdbPath = path.join(dir, base + '.gdb');
  fs.writeFileSync(gdbPath, v.gdb);
  const srcConf = path.join(root, 'pkgdb', 'GDB', 'GDB.conf');
  if (o.conf !== false && fs.existsSync(srcConf)) {
    const dstConf = path.join(dir, 'GDB.conf');
    fs.copyFileSync(srcConf, dstConf);
    const t = fs.readFileSync(dstConf, 'latin1').replace(/^name=.*\.gdb$/m, 'name=' + base + '.gdb');
    fs.writeFileSync(dstConf, Buffer.from(t, 'latin1'));
    conf.updateConf(dstConf, gdbPath);
  }
  return { dir, file: base + '.gdb', path: gdbPath, size: v.gdb.length };
}

module.exports = {
  landArea, regionTris, clipRing, simplifyRing, landForLevel, layersForLevel, OVERLAY, LAND, SEA,
  PROLOGUE, SIG, VERSION, FRAME, MAGIC, MAX_BLOB, FRAME_ELEMENT, EUROPE_LEVELS, CLUSTER_REC,
  tileBlob, emptyTile, readTileRoads, tileFormat, classFor, splitGrid, mortonIndex, clusterBlob, build,
  degToTile, degToTileL, cellX, cellY, cellXL, cellYL, roadsToLevel, volumeFromRoads,
  linesForLevel, LEVEL_CLASSES, TILE_CELLS, TILE_SIZES, tileSizes, component,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const outDir = opt('--out') || 'out/gdbgen';
  const roadsFile = opt('--roads');
  const demo = args.includes('--demo');
  if (!roadsFile && !demo) {
    console.error('нужен --roads <geojson> либо --demo');
    process.exit(2);
  }

  let lines;
  if (demo) {
    // две короткие дороги в районе Никосии — чтобы получить том за секунду
    lines = [
      { name: 'A1', cls: 'motorway', pts: [[33.30, 35.16], [33.32, 35.17], [33.34, 35.18]] },
      { name: 'A2', cls: 'motorway', pts: [[33.36, 35.16], [33.38, 35.15]] },
    ];
  } else {
    const j = JSON.parse(fs.readFileSync(roadsFile, 'utf8'));
    lines = j.features.filter(f => f.geometry && f.geometry.type === 'LineString').map(f => {
      const p = f.properties || {};
      return {
        name: ((p.ref || p.name || '') + '').trim().slice(0, 15) || 'CY',
        cls: p.highway || null,
        pts: f.geometry.coordinates,
      };
    });
  }

  console.log('=== сборка тома GDB с нуля ===');
  console.log('дорог на входе: ' + lines.length);
  // --levels 0,1,2  либо --levels all; по умолчанию один L0
  const lvArg = opt('--levels');
  const levels = !lvArg ? [0]
    : lvArg === 'all' ? EUROPE_LEVELS.map((_, i) => i)
      : lvArg.split(',').map(Number);
  const landFile = opt('--land');
  const land = args.includes('--no-land') ? null
    : landFile ? JSON.parse(fs.readFileSync(landFile, 'utf8')).rings : undefined;
  const v = volumeFromRoads(lines, { name: opt('--name') || 'EJ211', levels, land,
    areas: args.includes('--no-areas') ? null : undefined, bands: args.includes('--no-bands') ? null : undefined,
    rivers: args.includes('--no-areas') ? null : undefined });
  for (const st of v.stats) {
    console.log('  L' + String(st.nr).padStart(2) + ': дорог ' + String(st.lines).padStart(6) +
      ', тайлов ' + String(st.tiles).padStart(4) + ', кластеров ' + String(st.clusters).padStart(3) +
      ', линий ' + st.elements + (st.skipped ? ', пропущено ' + st.skipped : '') +
      (st.dropped ? ', схлопнулось ' + st.dropped : '') + ', тайлов с сушей ' + st.landTiles +
      '  размер тайла: ' + Object.entries(st.sizes).map(([k, n]) => k + '×' + n).join(' '));
  }
  console.log('область уровней до ' + v.regionEnd + ', том ' + v.gdb.length + ' б (' +
    (v.gdb.length / 1048576).toFixed(2) + ' МБ)');

  // самопроверка: собранный том читается штатным читателем
  const g = gm.openBuffer(v.gdb, v.gd2);
  const h = gm.header(g);
  const gr = gm.levelGrid(g, h, h.levels[0]);
  console.log('читается: ' + h.sig + ', версия ' + h.version + ', уровней ' + h.nLevels +
    ', сетка L0 ' + gr.W + '×' + gr.H + ', слоты ' + gr.gridOk + '/' + gr.gridN);
  // сверка по каждому записанному уровню: сдвиг на месте, кластеры находятся
  for (const st of v.stats) {
    const g2 = gm.levelGrid(g, h, h.levels[st.nr]);
    const real = g2.entries.filter(e => e.sz && e.off >= h.regionEnd && e.off !== v.map.emptyTile.off).length;
    console.log('  L' + String(st.nr).padStart(2) + ': сдвиг ' + String(g2.head.shift).padStart(2) +
      ', кластеров в таблице ' + real + ', слоты ' + g2.gridOk + '/' + g2.gridN);
  }

  const c = component(outDir, v, { name: opt('--name'), conf: !args.includes('--no-set') });
  console.log('записано: ' + c.path);

  if (!args.includes('--no-set')) {
    const root = dataset.resolveRoot();
    console.log('GDB/GDB.conf: имя файла, size, MD5 и пробы qa пересчитаны');
    for (const f of ['DBInfo.txt', 'config.nfm', 'build1']) {
      const q = path.join(root, f);
      if (fs.existsSync(q)) fs.copyFileSync(q, path.join(outDir, f));
    }
    const copyDir = d => {
      const from = path.join(root, 'pkgdb', d);
      if (!fs.existsSync(from)) return;
      const to = path.join(outDir, 'pkgdb', d);
      fs.mkdirSync(to, { recursive: true });
      for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(to, f));
    };
    const style = fs.readdirSync(path.join(root, 'pkgdb')).find(d => /^StyleDBMMI3G_/.test(d));
    if (style) copyDir(style);
    copyDir('NaviPersistence_ALL_3');
    // без --keep-pkg: манифест должен перечислять ровно то, что в наборе, иначе
    // LVM не активирует пакет и инициализация встаёт на 28 % (docs/device.md)
    console.log('дальше: node src/mkmeta.js ' + outDir);
  }
}
