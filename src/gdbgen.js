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
//     +577  u32  число записей каталога таблиц ссылок  +581 u32 смещение  +585 u32 размер
//     +589…+604  каталог блобов: смещение, размер, 64, число — у нас нули (блобов нет)
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

// Хвост шапки (+576…+792) оригинала: каталоги и таблица из 41 числа,
// назначение которой не установлено. Переносится как есть — кроме каталога
// таблиц ссылок (+577…+588, пересчитывается) и каталога блобов (+589…+604, нули).
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
  const named = [];                          // [номер элемента, подпись, E0]
  sorted.forEach((r, k) => {
    const pre = [];
    if (k === 0) pre.push(0xc1);
    if (r.e9 !== e9) { pre.push(0xe0, r.e9); e9 = r.e9; attr = null; }
    const a = attrOf(r);
    const pts = r.pts || r.points.map(p => [p.x, p.y]);
    for (const lb of r.labels || []) named.push([elems.length, lb, r.e9]);
    roads[r.i].el = elems.length;                 // номер элемента — для таблиц ссылок
    elems.push(Buffer.concat([Buffer.from(pre), gm.encodeLine(pts, a === attr ? null : a, f)]));
    attr = a;
  });
  const { s1, s2 } = gm.encodeNames(named);
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
// У завода во всей Европе нет многоугольника больше 1818 точек — кусок
// крупнее режется на элементы по 1500 точек (по границам примитивов)
const MAX_PTS = 1500;

// Как у завода (docs/formats/gdb.md, «Площади: элемент — связный кусок
// объекта»): элемент — один связный кусок одного объекта в тайле, его
// треугольники уложены веерами, полосами и списком одиночных треугольников.
// area — {empty} | {full} | {land: [кусок…], sea: [кусок…], layers: [{attr, e9,
// parts}]}, кусок — массив треугольников.
function areaElements(area, f) {
  if (!area || area.empty) return [gm.encodeFrame(f.X, f.Y, f.W, f.simple)];
  const out = [];
  let e9 = 0xff, attr = null;
  const put = (a, parts, ly9) => {
    for (const part of parts) {
      for (const el of polyElements(part, a === LAND || a === SEA ? f.simple : false)) {
        const pre = [];
        if (ly9 !== e9) { pre.push(0xe0, ly9); e9 = ly9; }
        out.push(Buffer.concat([Buffer.from(pre), gm.encodePolygon(el.pts, el.flags, a === attr ? null : a, f)]));
        attr = a;
      }
    }
  };
  if (area.full) {
    const pts = f.simple ? [[f.X, f.Y], [0, f.Y], [0, 0], [f.X, 0]] : [[f.X, 0], [f.X, f.Y], [0, f.Y], [0, 0]];
    out.push(gm.encodePolygon(pts, [3, 2, 3, 2], LAND, f));      // веер, как рамка
    attr = LAND;
  } else {
    put(LAND, area.land, 0xff);
    put(SEA, area.sea, 0xff);
  }
  // слои — в порядке завода; E0 держится до смены, у суши/моря/ступеней 0xFF
  for (const ly of area.layers || []) put(ly.attr, ly.parts, ly.e9);
  return out;
}

// Кусок (треугольники) → элементы: примитивы (stripify), не больше MAX_PTS
// точек в элементе, признаки точек. Бит 0 ведёт автомат граней
// (gm.polyTriangles): веер 1,0,1…1,0; полоса 0,1…1,0; список 0,0,c,1,1,c….
// Бит 1 — по заводу (Крит L0, 99 %): 1, если ребро внутреннее (у двух
// треугольников элемента): веер — ребро к следующей точке (последняя — к
// центру), полоса — (i−1, i+1), у первой (0,1), у последней (n−2, n−1),
// список — ребро треугольника к следующей вершине. У суши и моря выше L0
// завод ставит 1 всем точкам (hide).
function polyElements(tris, hide) {
  const els = [];
  let cur = null;
  const flush = () => { if (cur) els.push(cur); cur = null; };
  for (const pr of stripify(tris)) {
    let pts = pr.pts;
    for (;;) {
      if (cur && cur.n + (pr.mode === 'list' ? 3 : pts.length) > MAX_PTS) flush();
      if (!cur) cur = { n: 0, prims: [] };
      let take = Math.min(pts.length, MAX_PTS - cur.n);
      if (pr.mode === 'list') take -= take % 3;
      cur.prims.push({ mode: pr.mode, pts: pts.slice(0, take) });
      cur.n += take;
      if (take === pts.length) break;
      // остаток: веер — с центра и последней точки, полоса — с двух последних
      pts = pr.mode === 'list' ? pts.slice(take) : pr.mode === 'fan' ? [pts[0], ...pts.slice(take - 1)] : pts.slice(take - 2);
      flush();
    }
  }
  flush();
  return els.map(e => {
    const tr = [];
    for (const p of e.prims) tr.push(...primTris(p));
    const cnt = new Map();
    for (const t of tr) for (let k = 0; k < 3; k++) { const q = edgeId(t[k], t[(k + 1) % 3]); cnt.set(q, (cnt.get(q) || 0) + 1); }
    const inner = (a, b) => (hide || cnt.get(edgeId(a, b)) > 1 ? 1 : 0);
    const pts = [], flags = [];
    for (const { mode, pts: q } of e.prims) {
      const n = q.length;
      q.forEach((p, i) => {
        let b0, b1;
        if (mode === 'fan') { b0 = i === 0 ? 1 : i === 1 || i === n - 1 ? 0 : 1; b1 = inner(p, q[(i + 1) % n]); }
        else if (mode === 'strip') { b0 = i === 0 || i === n - 1 ? 0 : 1; b1 = i === 0 ? inner(q[0], q[1]) : i === n - 1 ? inner(q[n - 2], q[n - 1]) : inner(q[i - 1], q[i + 1]); }
        else { const k = i % 3; b0 = i < 3 ? (k < 2 ? 0 : +(i + 1 < n)) : (k < 2 ? 1 : +(i + 1 < n)); b1 = inner(p, q[i - k + (k + 1) % 3]); }
        pts.push(p); flags.push(b0 | (b1 << 1));
      });
    }
    return { pts, flags };
  });
}

const primTris = ({ mode, pts: q }) => {
  const t = [];
  if (mode === 'fan') for (let i = 2; i < q.length; i++) t.push([q[0], q[i - 1], q[i]]);
  else if (mode === 'strip') for (let i = 2; i < q.length; i++) t.push([q[i - 2], q[i - 1], q[i]]);
  else for (let i = 2; i < q.length; i += 3) t.push([q[i - 2], q[i - 1], q[i]]);
  return t;
};
const ptId = p => p[0] * 65536 + p[1];
const edgeId = (a, b) => { const p = ptId(a), q = ptId(b); return p < q ? p + ':' + q : q + ':' + p; };

// Треугольники → веера, полосы и список одиночных — жадно, как отрисовка сетки
// в тесселяторе GLU (render.c: из трёх вееров и трёх полос у каждого
// треугольника берётся самый длинный, одиночные собираются в один список).
// Завод выдаёт ровно эти три вида примитивов (Крит L0: вееров 15 775, полос
// 9 738, списков 1 218 у леса) — что у него GLU, догадка.
function stripify(tris) {
  const byEdge = new Map();
  tris.forEach((t, i) => {
    for (let k = 0; k < 3; k++) {
      const e = edgeId(t[k], t[(k + 1) % 3]);
      if (!byEdge.has(e)) byEdge.set(e, []);
      byEdge.get(e).push(i);
    }
  });
  const used = new Uint8Array(tris.length);
  const nb = (i, a, b, seen) => { for (const j of byEdge.get(edgeId(a, b))) if (j !== i && !used[j] && !seen.has(j)) return j; return -1; };
  const third = (j, a, b) => { const pa = ptId(a), pb = ptId(b); return tris[j].find(p => ptId(p) !== pa && ptId(p) !== pb); };
  const fan = (i, c, a, b) => {
    const seen = new Set([i]), fw = [], bw = [];
    for (let j, cur = i, x = b; (j = nb(cur, c, x, seen)) >= 0; cur = j) { seen.add(j); x = third(j, c, x); fw.push([j, x]); }
    for (let j, cur = i, x = a; (j = nb(cur, c, x, seen)) >= 0; cur = j) { seen.add(j); x = third(j, c, x); bw.push([j, x]); }
    bw.reverse();
    return { mode: 'fan', ids: [...bw.map(q => q[0]), i, ...fw.map(q => q[0])], pts: [c, ...bw.map(q => q[1]), a, b, ...fw.map(q => q[1])] };
  };
  const strip = (i, a, b, c) => {
    const seen = new Set([i]), ids = [i], pts = [a, b, c];
    for (let j; (j = nb(ids[ids.length - 1], pts[pts.length - 2], pts[pts.length - 1], seen)) >= 0;) {
      seen.add(j); ids.push(j); pts.push(third(j, pts[pts.length - 2], pts[pts.length - 1]));
    }
    for (let j; (j = nb(ids[0], pts[0], pts[1], seen)) >= 0;) { seen.add(j); ids.unshift(j); pts.unshift(third(j, pts[0], pts[1])); }
    return { mode: 'strip', ids, pts };
  };
  const out = [], lonely = [];
  tris.forEach((t, i) => {
    if (used[i]) return;
    let best = null;
    for (let k = 0; k < 3; k++) {
      const a = t[k], b = t[(k + 1) % 3], c = t[(k + 2) % 3];
      for (const q of [fan(i, a, b, c), strip(i, a, b, c)]) if (!best || q.ids.length > best.ids.length) best = q;
    }
    for (const j of best.ids) used[j] = 1;
    if (best.ids.length === 1) lonely.push(...t);
    else out.push({ mode: best.mode, pts: best.pts });
  });
  if (lonely.length) out.push({ mode: 'list', pts: lonely });
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
// {full} | {inside: [кусок…], outside: [кусок…]}, кусок — связные треугольники
// с целыми координатами.
function regionParts(rings, X, Y) {
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
  for (const col of columns(done, xAt)) (col.in ? inside : outside).push(...col.tris);
  if (!inside.length) return { empty: true };
  if (!outside.length) return { full: true };
  return { inside: pieces(inside), outside: pieces(outside) };
}

// То же, но треугольники одним списком (для проверок площади)
function regionTris(rings, X, Y) {
  const r = regionParts(rings, X, Y);
  return r.inside ? { inside: r.inside.flat(), outside: r.outside.flat() } : r;
}

// Трапеции → столбцы: верх трапеции совпадает с низом следующей — это одна
// y-монотонная область. Точки на ребре между вершинами («лишние», от чужих
// вершин на той же высоте) выбрасываются, если ни один столбец не начинается и
// не кончается в них — так соседние столбцы делят ребро с одними и теми же
// точками, и суша с морем закрывают тайл без щелей. Столбец режется на
// треугольники без новых точек (monoTris); не сошлась площадь — на трапеции.
function columns(traps, xAt) {
  for (const t of traps) {
    t.bl = [xAt(t.l, t.y0), t.y0]; t.br = [xAt(t.r, t.y0), t.y0];
    t.tl = [xAt(t.l, t.y1), t.y1]; t.tr = [xAt(t.r, t.y1), t.y1];
  }
  const spanKey = (inn, a, b) => (inn ? 'I' : 'O') + a[1] + ':' + a[0] + ':' + b[0];
  const bottoms = new Map(), tops = new Map();
  const add = (m, k, t) => m.set(k, m.has(k) ? null : t);
  for (const t of traps) {
    if (t.bl[0] !== t.br[0]) add(bottoms, spanKey(t.in, t.bl, t.br), t);
    if (t.tl[0] !== t.tr[0]) add(tops, spanKey(t.in, t.tl, t.tr), t);
  }
  const next = new Map(), hasPrev = new Set();
  for (const [k, t] of tops) {
    const u = t && bottoms.get(k);
    if (u) { next.set(t, u); hasPrev.add(u); }
  }
  const cols = [];
  for (const t of traps) {
    if (hasPrev.has(t)) continue;
    const c = [t];
    while (next.has(c[c.length - 1])) c.push(next.get(c[c.length - 1]));
    cols.push(c);
  }
  const corner = new Set();
  for (const c of cols) for (const p of [c[0].bl, c[0].br, c[c.length - 1].tl, c[c.length - 1].tr]) corner.add(ptId(p));
  const chain = (c, side) => {
    const out = [c[0][side === 'l' ? 'bl' : 'br']];
    c.forEach((t, i) => {
      const p = t[side === 'l' ? 'tl' : 'tr'];
      if (i + 1 < c.length && edgeKey(t[side]) === edgeKey(c[i + 1][side]) && !corner.has(ptId(p))) return;
      const q = out[out.length - 1];
      if (q[0] !== p[0] || q[1] !== p[1]) out.push(p);
    });
    return out;
  };
  return cols.map(c => {
    let tris = monoTris(chain(c, 'l'), chain(c, 'r'));
    if (!tris) {
      tris = [];
      for (const t of c) for (const tri of [[t.bl, t.br, t.tr], [t.bl, t.tr, t.tl]]) if (area2(tri) !== 0) tris.push(tri);
    }
    return { in: c[0].in, tris };
  });
}

// y-монотонный многоугольник (левая и правая цепи снизу вверх) → треугольники
// на его же вершинах (монотонная триангуляция со стеком, порядок — по y, затем
// по x). Возвращает null, если площадь не сошлась с многоугольником.
function monoTris(left, right) {
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const u0 = left[0], uN = right[right.length - 1];
  const A = right.slice(same(right[0], u0) ? 1 : 0, -1).map(p => ({ p, c: 'A' }));
  const B = left.slice(1, same(left[left.length - 1], uN) ? -1 : undefined).map(p => ({ p, c: 'B' }));
  const ring = [u0, ...A.map(q => q.p), uN, ...B.map(q => q.p).reverse()];
  if (ring.length < 3) return [];
  const u = [{ p: u0, c: 'S' }, ...A.concat(B).sort((a, b) => a.p[1] - b.p[1] || a.p[0] - b.p[0]), { p: uN, c: 'S' }];
  for (let i = 1; i < u.length; i++) if (same(u[i].p, u[i - 1].p)) return null;
  const tris = [];
  const emit = (a, b, c) => { if (area2([a, b, c]) !== 0) tris.push([a, b, c]); };
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const st = [u[0], u[1]];
  for (let j = 2; j < u.length - 1; j++) {
    const v = u[j];
    if (v.c !== st[st.length - 1].c) {
      while (st.length > 1) { const w = st.pop(); emit(v.p, w.p, st[st.length - 1].p); }
      st.pop();
      st.push(u[j - 1], v);
    } else {
      let last = st.pop();
      while (st.length) {
        const top = st[st.length - 1], x = cross(top.p, last.p, v.p);
        if (v.c === 'A' ? x <= 0 : x >= 0) break;
        emit(v.p, last.p, top.p);
        last = st.pop();
      }
      st.push(last, v);
    }
  }
  const v = u[u.length - 1];
  while (st.length > 1) { const w = st.pop(); emit(v.p, w.p, st[st.length - 1].p); }
  const want = Math.abs(ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0));
  const got = tris.reduce((s, t) => s + Math.abs(area2(t)), 0);
  return got === want ? tris : null;
}

// Треугольники → связные куски (общая вершина): у завода элемент — связный
// кусок (Крит L0: 100 % элементов, L1: 99 %)
function pieces(tris) {
  const par = new Map();
  const find = k => { while (par.get(k) !== k) { par.set(k, par.get(par.get(k))); k = par.get(k); } return k; };
  for (const t of tris) for (const p of t) if (!par.has(ptId(p))) par.set(ptId(p), ptId(p));
  for (const t of tris) { const r = find(ptId(t[0])); par.set(find(ptId(t[1])), r); par.set(find(ptId(t[2])), find(r)); }
  const by = new Map();
  for (const t of tris) { const r = find(ptId(t[0])); if (!by.has(r)) by.set(r, []); by.get(r).push(t); }
  return [...by.values()];
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
  const r = regionParts(rings, X, Y);
  return r.inside ? { land: r.inside, sea: r.outside } : r;
}
const edgeKey = e => (typeof e === 'string' ? e : e[0].join(',') + '>' + e[1].join(','));
const area2 = ([a, b, c]) => (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);

// Дуглас — Пекер для ломаной: концы остаются (допуск в тех же единицах)
// fixed(p) — точка остаётся всегда (развилка, через которую склеена линия).
function simplifyLine(pts, tol, fixed) {
  if (pts.length < 3 || tol <= 0) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [];
  let from = 0;
  for (let i = 1; i < pts.length; i++) if (i === pts.length - 1 || (fixed && fixed(pts[i]))) { keep[i] = 1; stack.push([from, i]); from = i; }
  while (stack.length) {
    const [i0, i1] = stack.pop();
    const [ax, ay] = pts[i0], [bx, by] = pts[i1];
    const L = Math.hypot(bx - ax, by - ay);
    let mi = -1, md = tol;
    for (let i = i0 + 1; i < i1; i++) {
      // замкнутая линия (кольцо развязки): концы совпали — меряем от точки, иначе
      // кольцо схлопывалось в две одинаковые точки (330 линий L1 рисовались точкой)
      const d = L ? Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L
        : Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
      if (d > md) { md = d; mi = i; }
    }
    if (mi >= 0) { keep[mi] = 1; stack.push([i0, mi], [mi, i1]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// То же для замкнутого кольца: режем на две дуги по самой дальней от первой точке
function simplifyRing(pts, tol) {
  if (pts.length < 8 || tol <= 0) return pts;
  let far = 0, fd = -1;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
  return simplifyLine(pts.slice(0, far + 1), tol).concat(simplifyLine(pts.slice(far), tol).slice(1));
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
// min — наименьшая площадь объекта (км²) по уровням L0…L4: у завода мелочь
// выше L0 отсеяна — 10-й процентиль площади элемента (Греция и Балканы,
// 19–27° в. д., 36–42° с. ш.): застройка L1 0,10, L2 0,39, L3 0,67, L4 0,79;
// лес 0,03 / 0,05 / 0,06 / 0,07; парки 0,08 / 0,37 / 1,96 / 0,15; вода
// 0,008 / 0,005 / 0,01 / 0,03 (docs/formats/gdb.md, «Мелкие площади выше L0»)
const GREEN_MIN = [0, 0.03, 0.05, 0.06, 0.07];
const OVERLAY = [
  { cls: 'forest', attr: 0x51, maxLevel: 4, e9: () => 20, min: GREEN_MIN },
  { cls: 'park', attr: 0x52, maxLevel: 4, e9: () => 16, min: [0, 0.08, 0.37, 1.96, 0.15] },
  { cls: 'built', attr: 0x53, maxLevel: 4, e9: a => (a >= 5 ? 22 : a >= 1 ? 18 : 13), min: [0, 0.1, 0.39, 0.67, 0.79] },
  { cls: 'industrial', attr: 0x54, maxLevel: 4, e9: () => 19, min: GREEN_MIN },
  { cls: 'airport', attr: 0x56, maxLevel: 4, e9: () => 20, min: GREEN_MIN },
  { cls: 'apron', attr: 0x57, maxLevel: 3, e9: () => 18, min: GREEN_MIN },
  { cls: 'water', attr: 0x50, maxLevel: 11, e9: a => (a >= 5 ? 34 : a >= 0.5 ? 25 : 18), min: [0, 0.008, 0.008, 0.01, 0.03] },
];

// Объект мельче ~4×4 единиц уровня (выше L0 — 8×8) на уровень не идёт
function minKm2(L) {
  const unit = (1 << L.shift) * 88.9 / 72000;          // км на сырую единицу по долготе у Кипра
  const side = L.shift ? 8 : 4;
  return Math.max(0.002, side * side * unit * unit);   // и не меньше 2000 м² — участки-крошки не берём
}
// Допуск упрощения слоёв: 6 единиц (на L0 ~7 м) — мельче глазу не видно, а
// тайл с лесом и застройкой Никосии иначе не влезает ни в какой размер
const LAYER_TOL = 6;
// Выше L0 — грубее: с допуском 6 и крошками 4×4 площади давали тайлам L1–L2
// вдвое больше тайлов на кластер, чем у завода
const layerTol = L => (L.shift ? 16 : LAYER_TOL);
// Допуск упрощения линий выше L0 — 1,5 единицы уровня, как у суши
const LINE_TOL = 1.5;

function layersForLevel(opts, lv, L) {
  const out = [];
  if (lv >= 4) {
    for (const b of (opts.bands || [])) {
      const rings = landForLevel(b.rings, L, { tol: layerTol(L) });
      if (rings.length) out.push({ attr: (0x60 | (b.h << 8)) >>> 0, e9: 0xff, rings });
    }
  }
  // площади — слиянием объектов класса (по обмотке): элемент — связный кусок
  // слияния в тайле, как у завода (docs/formats/gdb.md, «Площади: элемент —
  // связный кусок»)
  const lim = minKm2(L);
  for (const o of OVERLAY) {
    if (lv > o.maxLevel) continue;
    const groups = new Map();
    for (const f of (opts.areas || [])) {
      if (f.cls !== o.cls || f.km2 < Math.max(lim, o.min[Math.min(lv, 4)])) continue;
      const e9 = o.e9(f.km2);
      if (!groups.has(e9)) groups.set(e9, []);
      groups.get(e9).push(...landForLevel(f.rings, L, { tol: layerTol(L) }));
    }
    for (const [e9, rings] of [...groups].sort((a, b) => a[0] - b[0])) if (rings.length) out.push({ attr: o.attr, e9, rings });
  }
  for (const ly of out) {
    ly.bbox = [Math.min(...ly.rings.map(r => r.bbox[0])), Math.min(...ly.rings.map(r => r.bbox[1])),
               Math.max(...ly.rings.map(r => r.bbox[2])), Math.max(...ly.rings.map(r => r.bbox[3]))];
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
  const nm = gm.readNames(blob, opts.dict);
  const byEl = new Map();
  for (const rc of nm.records) { if (!byEl.has(rc.el)) byEl.set(rc.el, []); byEl.get(rc.el).push({ text: rc.text, f02: rc.f02, b21: rc.b21, nid: rc.nid }); }
  const roads = [];
  r.els.forEach((e, i) => {
    if (e.type !== 1) return;
    roads.push({ points: e.pts.map(([x, y]) => ({ x, y })), cls: e.cls, attr: e.attr, e9: e.e9, head: e.head, labels: byEl.get(i) || [] });
  });
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

// ── таблицы ссылок XAC → GDB (линия маршрута) ──────────────────────────────
//
// Линию маршрута рисует не отдельная ломаная: CGdbConvRoute::convertVectors
// (0x08cc148c) переводит каждый вектор XAC в ссылку на линию GDB через
// таблицу ссылок его блока (CGdbRefTableMainDirectory::getRefTable, номер
// блока — twid >> 16). Нет каталога — поиск даёт код 1 (& 0x67), и перевод
// маршрута обрывается с −1: маршрут считается, а линии нет.
// Шапка +577 число, +581 смещение, +585 размер каталога: на блок XAC запись
// {u32 смещение, u32 размер} таблицы. Пустая таблица завода «01 00 00 00»
// (522 штуки в EJ211): уровней 0, ключ не найден — и на L0 срабатывает
// поиск по координатам (FUN_08cb6578): линия GDB, где ТОЧНО лежат оба конца
// вектора. Так у завода переводится ~97 % векторов L0 (docs/formats/gdb.md,
// «Таблицы ссылок»).
const EMPTY_REF_TABLE = Buffer.from('01000000', 'hex');
// tables — необязательный массив готовых таблиц по номеру блока (refTable)
function refDirectory(blocks, put, tables) {
  if (!blocks) return { count: 0, offset: 0, size: 0 };
  const dir = Buffer.alloc(blocks * 8);
  for (let i = 0; i < blocks; i++) {
    const t = (tables && tables[i]) || EMPTY_REF_TABLE;
    dir.writeUInt32BE(put(t), i * 8);
    dir.writeUInt32BE(t.length, i * 8 + 4);
  }
  return { count: blocks, offset: put(dir), size: dir.length };
}

// Таблица ссылок блока XAC (читатель — FUN_08cb5cf0, версия тома > 0x22):
// u8 1, u8 уровней, уровни × u16 смещение данных (0 — уровень пуст), затем на
// уровень u16 число записей и записи по возрастанию ключа (2·номер записи XAC).
// Запись: заголовок (0x80 — ключ += u8, иначе u24; биты 3…5 — направление
// ссылок 0…2; младшие три — число ссылок, 7 → u8), при n > 3 битовая карта
// направлений ссылок 3…, затем ссылки: байт (тайл: 0 тот же, 0x40 x += 2·s8,
// 0x80 y += 2·s8, 0xc0 u32; элемент: 0…3 += k, 0x38 −1, 0x30 −2, 0x28 += s8,
// 0x20 u16; точки: 3 полубайты, 6 u8,+1, 7 u16,+1, 4 u8,u8, 5 u16,u16) и его
// поля в том же порядке. Состояние тайла и элемента — сквозное по уровню.
// levels[L] = [{ key, refs: [{ tile, el, a, z, d }] }], d = 1 — линия идёт от
// узла записи к цели (у завода так 4125 из 5189 ссылок L1 MJ00, обратные — d 0).
function refLevel(entries) {
  const out = [];
  const u16 = v => out.push(v >> 8 & 0xff, v & 0xff);
  u16(entries.length);
  let key = -1, tile = 0xffffffff, el = 0x80000000;
  for (const e of entries) {
    const n = e.refs.length;
    let h = n < 7 ? n : 7;
    e.refs.slice(0, 3).forEach((r, i) => { h |= r.d << (i + 3); });
    const dk = e.key - key;
    if (key >= 0 && dk > 0 && dk < 256) out.push(h | 0x80, dk);
    else out.push(h, e.key >> 16 & 0xff, e.key >> 8 & 0xff, e.key & 0xff);
    key = e.key;
    if (n >= 7) { if (n < 255) out.push(n); else { out.push(0xff); u16(n); } }
    if (n > 3) {
      const bm = new Array((n + 4) >> 3).fill(0);
      e.refs.slice(3).forEach((r, i) => { bm[i >> 3] |= r.d << (i & 7); });
      out.push(...bm);
    }
    for (const r of e.refs) {
      const f = [];
      let b = 0;
      const dx = ((r.tile & 0xffff) - (tile & 0xffff)) / 2, dy = ((r.tile >>> 16) - (tile >>> 16)) / 2;
      if (r.tile === tile) b = 0;
      else if (r.tile >>> 16 === tile >>> 16 && Number.isInteger(dx) && Math.abs(dx) < 128) { b = 0x40; f.push(dx & 0xff); }
      else if ((r.tile & 0xffff) === (tile & 0xffff) && Number.isInteger(dy) && Math.abs(dy) < 128) { b = 0x80; f.push(dy & 0xff); }
      else { b = 0xc0; f.push(r.tile >>> 24, r.tile >> 16 & 0xff, r.tile >> 8 & 0xff, r.tile & 0xff); }
      tile = r.tile;
      const de = r.el - el;
      if (de >= 0 && de <= 3) b |= de << 3;
      else if (de === -1) b |= 0x38;
      else if (de === -2) b |= 0x30;
      else if (de >= -128 && de < 128) { b |= 0x28; f.push(de & 0xff); }
      else { b |= 0x20; f.push(r.el >> 8, r.el & 0xff); }
      el = r.el;
      const { a, z } = r;
      if (a < 16 && z < 16) { b |= 3; f.push(z << 4 | a); }
      else if (z === a + 1 && a < 256) { b |= 6; f.push(a); }
      else if (z === a + 1) { b |= 7; f.push(a >> 8, a & 0xff); }
      else if (z < 256) { b |= 4; f.push(a, z); }
      else { b |= 5; f.push(a >> 8, a & 0xff, z >> 8, z & 0xff); }
      out.push(b, ...f);
    }
  }
  return Buffer.from(out);
}

function refTable(levels) {
  let nl = levels.length;
  while (nl && !(levels[nl - 1] && levels[nl - 1].length)) nl--;
  if (!nl) return EMPTY_REF_TABLE;
  const head = Buffer.alloc(2 + nl * 2);
  head[0] = 1; head[1] = nl;
  const parts = [head];
  let at = head.length;
  for (let L = 0; L < nl; L++) {
    if (!levels[L] || !levels[L].length) continue;
    const b = refLevel(levels[L]);
    if (at > 0xffff) throw new Error('таблица ссылок: смещение уровня ' + L + ' за u16');
    head.writeUInt16BE(at, 2 + L * 2);
    parts.push(b);
    at += b.length;
  }
  return Buffer.concat(parts);
}

// Векторы XAC -> записи уровня. Вектор a→z ищется на линии уровня, где есть обе
// его точки (узлы XAC и точки GDB округлены одинаково, см. roadsToLevel), и
// переводится в куски этой линии по тайлам: «тайл, элемент, точки от…до». На
// грубых уровнях точки линии прорежены — кусок берётся с ближайших оставшихся
// точек снаружи, так что вектор накрыт всегда; схлопнутый в точку не пишется.
// vectors — [{ block, rec, a: {x, y}, z: {x, y} }]; возвращает Map блок -> записи.
// Концы вектора бывают и на разных линиях: XAC выбрасывает узел, где сходятся
// две линии GDB, не склеенные из-за разных классов или имён (у нас 376 векторов
// на L1). Тогда вектор идёт по первой линии до общей точки и по второй от неё —
// как два элемента в поиске по координатам у завода (FUN_08cb6578).
const JOIN_REACH = 64;                           // на сколько точек искать общую
// skip(v, refs) — вектор не записывать (на L0 его найдёт поиск по координатам).
function refsForLevel(st, vectors, skip) {
  const bySrc = new Map();
  for (const p of st.pieces) {
    if (!bySrc.has(p.src)) bySrc.set(p.src, []);
    bySrc.get(p.src).push(p);
  }
  for (const l of bySrc.values()) l.sort((p, q) => p.ts[0] - q.ts[0]);
  // куски линии src между её точками i и j (по ходу от i к j)
  const cover = (src, i, j) => {
    const lo = Math.min(i, j), hi = Math.max(i, j), fwd = i < j, refs = [];
    for (const p of bySrc.get(src) || []) {
      const ts = p.ts, n = ts.length;
      if (ts[0] >= hi || ts[n - 1] <= lo) continue;
      let a = 0, z = n - 1;
      while (a + 1 < n && ts[a + 1] <= lo) a++;
      while (z - 1 >= 0 && ts[z - 1] >= hi) z--;
      if (a < z) refs.push({ tile: p.tile, el: p.el, a, z, d: fwd ? 1 : 0 });
    }
    return fwd ? refs : refs.reverse();
  };
  const out = new Map();
  for (const v of vectors) {
    const la = st.vertex.get(v.a.x + ',' + v.a.y), lz = st.vertex.get(v.z.x + ',' + v.z.y);
    if (!la || !lz) continue;
    let best = null;
    for (let i = 0; i < la.length; i += 2) {
      for (let j = 0; j < lz.length; j += 2) {
        if (la[i] !== lz[j] || la[i + 1] === lz[j + 1]) continue;
        const span = Math.abs(la[i + 1] - lz[j + 1]);
        if (!best || span < best.span) best = { src: la[i], ia: la[i + 1], iz: lz[j + 1], span };
      }
    }
    let refs;
    if (best) refs = cover(best.src, best.ia, best.iz);
    else {
      let join = null;
      for (let i = 0; i < la.length; i += 2) {
        const ka = st.keys[la[i]];
        for (let j = 0; j < lz.length; j += 2) {
          if (la[i] === lz[j]) continue;
          const kz = new Map();
          st.keys[lz[j]].forEach((w, k) => { if (Math.abs(k - lz[j + 1]) <= JOIN_REACH && !kz.has(w)) kz.set(w, k); });
          for (let k = Math.max(0, la[i + 1] - JOIN_REACH); k <= Math.min(ka.length - 1, la[i + 1] + JOIN_REACH); k++) {
            if (!kz.has(ka[k])) continue;
            const span = Math.abs(k - la[i + 1]) + Math.abs(kz.get(ka[k]) - lz[j + 1]);
            if (!join || span < join.span) join = { a: la[i], ia: la[i + 1], ja: k, z: lz[j], jz: kz.get(ka[k]), iz: lz[j + 1], span };
          }
        }
      }
      if (join) refs = cover(join.a, join.ia, join.ja).concat(cover(join.z, join.jz, join.iz));
    }
    if (!refs || !refs.length || (skip && skip(v, refs))) continue;
    if (!out.has(v.block)) out.set(v.block, []);
    out.get(v.block).push({ key: v.rec * 2, refs });
  }
  for (const l of out.values()) l.sort((p, q) => p.key - q.key);
  return out;
}

// Найдёт ли вектор без записи поиск по координатам на L0 — как у завода.
// Без записи на L0 перевод даёт «сырую» ссылку (FUN_08caddf4(…, 1), флаг 4),
// и при отрисовке CGdbRouteMatcher (FUN_08cb9cb8) зовёт поиск FUN_08cb6578:
// тайл у каждого конца, в нём линии, у которых ОБА конца вектора — точки
// линии (точное равенство), число совпадений > 1 — отдельный код. Запись не
// нужна, только когда этот поиск однозначно найдёт ту же линию: оба конца
// строго внутри одного тайла (на границе тайл выбирает прошивка), ровно одна
// линия тайла несёт обе точки, и каждую ровно один раз (у кольца начало = конец).
// У завода записи L0 у ~5 % векторов (docs/formats/gdb.md, «Сверка 23.10»).
function coordSearchFinds(st) {
  const byTile = new Map();
  for (const p of st.pieces) {
    if (!byTile.has(p.tile)) byTile.set(p.tile, { rect: p.rect, lines: [] });
    const cnt = new Map();
    for (const k of p.ts) { const w = st.keys[p.src][k]; if (w) cnt.set(w, (cnt.get(w) || 0) + 1); }
    byTile.get(p.tile).lines.push({ el: p.el, cnt });
  }
  return (v, refs) => {
    const t = refs.length === 1 && byTile.get(refs[0].tile);
    if (!t) return false;
    const [x0, y0, x1, y1] = t.rect;
    const inside = q => q.x > x0 && q.x < x1 && q.y > y0 && q.y < y1;
    if (!inside(v.a) || !inside(v.z)) return false;
    const a = v.a.x + ',' + v.a.y, z = v.z.x + ',' + v.z.y;
    const hits = t.lines.filter(l => l.cnt.has(a) && l.cnt.has(z));
    return hits.length === 1 && hits[0].el === refs[0].el && hits[0].cnt.get(a) === 1 && hits[0].cnt.get(z) === 1;
  };
}

// Таблицы всех блоков: уровни из stats (номер -> итог roadsToLevel). На L0
// записи только там, где поиск по координатам не справится (coordSearchFinds).
// Таблица длиннее заводского максимума (65 000 б) теряет L0 целиком.
const REF_TABLE_MAX = 65000;
function refTables(stats, vectors, blocks) {
  const per = new Map();                           // уровень -> Map блок -> записи
  let byCoord = 0;
  for (const [L, st] of stats) {
    const finds = L === 0 ? coordSearchFinds(st) : null;
    per.set(L, refsForLevel(st, vectors, finds && ((v, refs) => finds(v, refs) && ++byCoord)));
  }
  const tables = [];
  let refs = 0, noL0 = 0;
  for (let b = 0; b < blocks; b++) {
    const levels = [];
    for (const [L, m] of per) levels[L] = m.get(b) || [];
    let t = refTable(levels);
    if (t.length > REF_TABLE_MAX) { levels[0] = []; t = refTable(levels); noL0++; }
    if (t.length > REF_TABLE_MAX) throw new Error('таблица ссылок блока ' + b + ': ' + t.length + ' б');
    tables[b] = t;
  }
  for (const m of per.values()) for (const l of m.values()) refs += l.length;
  return { tables, refs, noL0, byCoord, max: Math.max(0, ...tables.map(t => t.length)),
           total: tables.reduce((a, t) => a + t.length, 0) };
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
      // листья kd-дерева (roadsToLevel): начало в ячейках от угла кластера,
      // размер у каждого свой, порядок — Мортон начала
      if (c.leaves) {
        const recs = c.leaves.slice().sort((a, b) => mortonIndex(a.ix, a.iy) - mortonIndex(b.ix, b.iy)).map(t => {
          const x = p.key0.x0 + (c.cx << p.L.potX) + t.ix, y = p.key0.y0 + (c.cy << p.L.potY) + t.iy;
          if (t.t) return { x, y, lw: t.lw, lh: t.lh, attr: t.t.attr, b10: t.t.b10, off: put(t.t.blob), size: t.t.blob.length };
          const em = emptyFor(p.L, t.lw, t.lh);
          return { x, y, lw: t.lw, lh: t.lh, attr: em.attr, b10: em.b10, off: em.off, size: em.size };
        });
        const blob = clusterBlob(recs);
        const off = put(blob);
        entries[slot] = { off, sz: blob.length };
        placed.push({ cx: c.cx, cy: c.cy, slot, off, size: blob.length, tiles: recs });
        continue;
      }
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
  const refs = refDirectory(spec.xacBlocks || 0, put, spec.refTables);
  head.writeUInt32BE(refs.count, 577);
  head.writeUInt32BE(refs.offset, 581);
  head.writeUInt32BE(refs.size, 585);
  // +589 смещение, +593 размер, +597, +601 число записей каталога блобов
  // (FUN_08cb20f0 → read_blob_table FUN_08cb1fd8, зовётся только при числе > 0).
  // В хвосте завода они указывают на его блобы (растр 9000 и 9200), у нас по
  // этому смещению лежали бы наши тайлы. Нули — «GDB has no blobs at all»,
  // успешный выход открытия базы (docs/formats/gdb.md, «Каталог блобов…»).
  head.fill(0, 589, 605);

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

// ── подписи ────────────────────────────────────────────────────────────────
//
// Как у завода (docs/formats/gdb.md, «Подписи»): имя улицы — запись реестра
// S1 с номером имени 0x60xxxxxx и полем 0x02 = 0; номер дороги — отдельная
// запись с номером 0x32xxxxxx/0x33xxxxxx и полем 0x02 = тип щита (354 —
// автомагистраль «A71», 174 — национальная дорога «74»). Имена — на L0…L2,
// номера — на L0…L4 (на L3–L4 у завода почти одни номера).
const SIGN_MOTORWAY = { hi: 0x32, f02: 354 }, SIGN_NATIONAL = { hi: 0x33, f02: 174 };
const R = require('./xacroads');

function labelsFor(lv, ln) {
  const out = [];
  if (ln.cls === 'river') return out;
  const name = ln.name ? R.latinize(ln.name) : '';
  if (lv <= 2 && name && name !== 'CY') out.push({ text: name, hi: 0x60, f02: 0 });
  if (lv <= 4 && ln.ref) {
    for (const ref of String(ln.ref).split(';').map(x => R.latinize(x).replace(/\s+/g, '')).filter(Boolean)) {
      const sg = /^A\d/.test(ref) ? SIGN_MOTORWAY : SIGN_NATIONAL;
      out.push({ text: ref, hi: sg.hi, f02: sg.f02 });
    }
  }
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
      // третья координата (номер точки исходной линии, см. roadsToLevel) — тоже по t
      const at = t => pts[i - 1].map((v, d) => v + (pts[i][d] - v) * t);
      const pa = at(t0), pb = at(t1);
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
// Склейка линий: пути OSM одного класса и с одной подписью, сходящиеся концами
// ровно вдвоём, становятся одной линией. Без этого тайл набирался из тысяч
// коротких обрезков — элементов втрое больше заводского максимума, а каждый
// элемент занимает место в куче NDL (5 МиБ).
function mergeLines(lines, lv) {
  const items = lines.map((ln) => {
    const raw = Array.isArray(ln);
    const c = classFor(lv, raw ? null : ln.cls);
    const labels = raw ? [] : labelsFor(lv, ln);
    return { pts: (raw ? ln : ln.pts) || [], c, labels,
             key: c.cls + '|' + c.e9 + '|' + labels.map(l => l.hi + ':' + l.text).join(';') };
  });
  const at = new Map();                        // группа + точка -> концы [линия, 0 | 1]
  items.forEach((it, i) => {
    if (it.pts.length < 2) return;
    [it.pts[0], it.pts[it.pts.length - 1]].forEach((p, e) => {
      const k = it.key + '@' + p[0] + ',' + p[1];
      if (!at.has(k)) at.set(k, []);
      at.get(k).push([i, e]);
    });
  });
  // пары концов в узле: два конца — склеиваются всегда; развилка (три и больше)
  // выше L0 — по самым прямым продолжениям (поворот меньше 60°). У завода линии
  // идут сквозь перекрёстки: Крит L1, класс 3 — 20 точек на линию, у нас без
  // этого было 7 (docs/formats/gdb.md, «Линии: классы по уровням и склейка»)
  const pair = new Map();
  const link = (u, v) => { pair.set(u.join(':'), v); pair.set(v.join(':'), u); };
  const dir = ([i, e]) => {
    const q = items[i].pts, a = q[e ? q.length - 1 : 0], b = q[e ? q.length - 2 : 1];
    const dx = (b[0] - a[0]) * 0.82, dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
    return [dx / d, dy / d];
  };
  for (const l of at.values()) {
    if (l.length === 2) { if (l[0][0] !== l[1][0]) link(l[0], l[1]); continue; }
    if (lv < 1 || l.length < 3) continue;
    const ds = l.map(dir), cand = [];
    for (let u = 0; u < l.length; u++) {
      for (let v = u + 1; v < l.length; v++) {
        const cos = ds[u][0] * ds[v][0] + ds[u][1] * ds[v][1];
        if (l[u][0] !== l[v][0] && cos < -0.5) cand.push([cos, u, v]);
      }
    }
    const taken = new Set();
    for (const [, u, v] of cand.sort((x, y) => x[0] - y[0])) {
      if (taken.has(u) || taken.has(v)) continue;
      taken.add(u); taken.add(v); link(l[u], l[v]);
    }
  }
  const used = new Uint8Array(items.length);
  // нарастить линию с дальнего конца (линия i, конец e), пока у него есть пара
  const grow = (i, e, pts) => {
    for (let q; (q = pair.get(i + ':' + e)) && !used[q[0]];) {
      used[q[0]] = 1;
      const add = items[q[0]].pts;
      pts = pts.concat((q[1] === 0 ? add : add.slice().reverse()).slice(1));
      i = q[0]; e = 1 - q[1];
    }
    return pts;
  };
  const out = [];
  items.forEach((it, i) => {
    if (used[i]) return;
    used[i] = 1;
    const pts = it.pts.length < 2 ? it.pts : grow(i, 0, grow(i, 1, it.pts.slice()).reverse()).reverse();
    out.push({ pts, c: it.c, labels: it.labels });
  });
  return out;
}

// Заводские рамки тайла по уровням (сверка 23.10, вся Европа): тайл L0 —
// 99 % не больше 28 820 б (максимум 59 816), L1–L3 — 99 % до 33 756 б (макс.
// 38 513), L4+ — до 42 523 б (макс. 51 238). Подбор берёт самый крупный тайл,
// который влезает в рамку, — поэтому рамка и задаёт размер тайла.
const LEVEL_BUDGET = [32768, 36000, 36000, 36000, 42000, 42000, 42000, 42000, 42000, 42000, 42000, 42000];
// log2 заводского максимума тайлов на кластер: 1 145, 115, 315, 111, 29, 66,
// 58, 17, 16, 12, 11, 4 (см. «Тайлов на кластер»)
const LEVEL_BITS = [10, 6, 8, 6, 4, 6, 5, 4, 4, 3, 3, 2];
// Заводской максимум элементов в тайле по уровням: каждый элемент — место в
// куче NDL (5 МиБ, docs/firmware.md), тайл сверх него делится, как по байтам
const LEVEL_ELS = [3723, 927, 1143, 1445, 1341, 1010, 1007, 1045, 1347, 1063, 1554, 952];

function roadsToLevel(lines, opts = {}) {
  const lvNr = opts.level || 0;
  const L = Object.assign({}, EUROPE_LEVELS[lvNr]);
  const CW = 1 << L.potX, CH = 1 << L.potY;
  const u = 1 << L.shift;

  // 1. дороги по кластерам — в ячейках уровня (дробных)
  const perCluster = new Map();
  let skipped = 0;
  // для таблиц ссылок XAC → GDB: точка линии (мировые единицы) -> [линия, номер
  // точки]; у каждой точки тайла третья координата — её место на линии
  const vertex = new Map(), pieces = [], keys = [];
  const merged = mergeLines(lines, lvNr);
  merged.forEach((ln, mi) => {
    ln.keep = new Set();
    if (ln.pts.length < 2) { skipped++; return; }
    keys[mi] = ln.pts.map(([lon, lat], k) => {
      const w = Math.round(lon * gm.UNITS_PER_LON) + ',' + Math.round(lat * gm.UNITS_PER_LAT);
      if (!vertex.has(w)) vertex.set(w, []);
      vertex.get(w).push(mi, k);
      return w;
    });
    // точка сперва округляется до мировой единицы ТАК ЖЕ, как узел XAC
    // (xacroads: Math.round(lon·72000)): линия маршрута на L0 ищется по точному
    // совпадению концов вектора с точками линии GDB (FUN_08cb6578), и прежнее
    // округление через дробные ячейки расходилось на единицу у ~0,7 % узлов
    const cells = ln.pts.map(([lon, lat]) => [
      (Math.round(lon * gm.UNITS_PER_LON) - FRAME[0]) / L.cellX,
      (Math.round(lat * gm.UNITS_PER_LAT) - FRAME[1]) / L.cellY]);
    cells.forEach((q, k) => q.push(k));
    for (const run of splitGrid(cells, CW, CH)) {
      const k = run.gx + ',' + run.gy;
      if (!perCluster.has(k)) perCluster.set(k, { cx: run.gx, cy: run.gy, pieces: [] });
      perCluster.get(k).pieces.push({ cells: run.pts, cls: ln.c.cls, e9: ln.c.e9, labels: ln.labels, src: mi, keep: ln.keep });
    }
  });
  // точки, общие с другой линией (стыки, развилки), упрощение выше L0 не
  // трогает: через них таблицы ссылок стыкуют вектор с соседней линией
  // (refsForLevel, JOIN), а склейка через развилки делает их внутренними
  for (const l of vertex.values()) {
    if (l.length < 4 || l.every((m, i) => i % 2 || m === l[0])) continue;
    for (let i = 0; i < l.length; i += 2) merged[l[i]].keep.add(l[i + 1]);
  }

  // 1б. суша: кольца уровня и кластеры, которых они касаются (в том числе
  //     без единой дороги — суша нужна и там)
  // берег выше L0 грубее (4 единицы): с 1,5 он давал половину самых тяжёлых тайлов L1
  const land = landForLevel(opts.land, L, { ccw: true, tol: L.shift ? 4 : 1.5 });
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
  let landTiles = 0, unlabeled = 0;

  // 2. на каждый кластер — самый крупный размер тайла, при котором блобы влезают
  const clusters = [];
  let dropped = 0;
  const budget = opts.maxBlob || LEVEL_BUDGET[lvNr];
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
    const clayers = layers.filter(ly => ly.bbox[0] <= cx0 + CWr && ly.bbox[2] >= cx0 && ly.bbox[1] <= cy0 + CHr && ly.bbox[3] >= cy0)
      .map(ly => Object.assign({}, ly, { rings: cut(ly.rings) })).filter(ly => ly.rings.length);
    // куски линий по сетке тайлов размера lw×lh (кэш на размер)
    let runsCache = new Map(), tileCache = new Map();
    const runsFor = (lw, lh) => {
      const ck = lw + 'x' + lh;
      if (runsCache.has(ck)) return runsCache.get(ck);
      const f = tileFormat(L, lw, lh), step = [1 << lw, 1 << lh];
      const byTile = new Map(), out = new Map();
      const bump = k => out.set(k, (out.get(k) || 0) + 1);
      for (const pc of c.pieces) {
        for (const run of splitGrid(pc.cells, step[0], step[1])) {
          const tx = run.gx * step[0], ty = run.gy * step[1], k = tx + ',' + ty;
          const raw = [];
          for (const [x, y, t] of run.pts) {
            const q = [Math.min(f.X, Math.max(0, Math.round((x - tx) * L.cellX / u))),
                       Math.min(f.Y, Math.max(0, Math.round((y - ty) * L.cellY / u))), t];
            const last = raw[raw.length - 1];
            if (!last || last[0] !== q[0] || last[1] !== q[1]) raw.push(q);
          }
          // на грубых уровнях единица крупная: кусок может схлопнуться в точку
          if (raw.length < 2) { bump(k); continue; }
          // выше L0 линии упрощаются, как площади: у завода детальность
          // уровня — его единица, точки OSM как есть раздувают тайлы L1–L4
          const line = lvNr > 0 ? simplifyLine(raw, LINE_TOL, q => pc.keep && pc.keep.has(q[2])) : raw;
          if (line.length === 2 && line[0][0] === line[1][0] && line[0][1] === line[1][1]) { bump(k); continue; }
          for (let s = 0; s < line.length - 1; s += 0xfffe) {
            if (!byTile.has(k)) byTile.set(k, []);
            const part = line.slice(s, s + 0xffff);
            byTile.get(k).push({ pts: part.map(q => [q[0], q[1]]), ts: part.map(q => q[2]),
                                 src: pc.src, cls: pc.cls, e9: pc.e9, labels: pc.labels });
          }
        }
      }
      const r = { byTile, out };
      runsCache.set(ck, r);
      return r;
    };
    // суша и слои тайла: кольца задевают тайл или он целиком внутри суши
    const areaOf = (tx, ty, f) => {
      if (!cland.length) return null;
      const tx0 = tx * L.cellX / u, ty0 = ty * L.cellY / u;
      const near = cland.filter(r => r.bbox[0] <= tx0 + f.X && r.bbox[2] >= tx0 && r.bbox[1] <= ty0 + f.Y && r.bbox[3] >= ty0);
      let a;
      if (near.length) a = landArea(shiftRings(near, tx0, ty0), f.X, f.Y);
      else a = windingAt(cland.map(r => r.whole), tx0 + f.X / 2, ty0 + f.Y / 2) ? { full: true } : { empty: true };
      if (a.empty) return null;
      // слои поверх суши: ступени рельефа, лес, застройка, вода …
      a.layers = [];
      for (const ly of clayers) {
        if (ly.bbox[0] > tx0 + f.X || ly.bbox[2] < tx0 || ly.bbox[1] > ty0 + f.Y || ly.bbox[3] < ty0) continue;
        const nearL = ly.rings.filter(r => r.bbox[0] <= tx0 + f.X && r.bbox[2] >= tx0 && r.bbox[1] <= ty0 + f.Y && r.bbox[3] >= ty0);
        let q;
        if (nearL.length) q = regionParts(shiftRings(nearL, tx0, ty0), f.X, f.Y);
        else q = windingAt(ly.rings.map(r => r.whole), tx0 + f.X / 2, ty0 + f.Y / 2) ? { full: true } : { empty: true };
        if (q.empty) continue;
        a.layers.push({ attr: ly.attr, e9: ly.e9, parts: q.full ? [rectTris(f.X, f.Y)] : q.inside });
      }
      return a;
    };
    // тайл (tx, ty — в ячейках уровня) или null, если в нём ничего нет
    const makeTile = (tx, ty, lw, lh) => {
      const tk = lw + 'x' + lh + '@' + tx + ',' + ty;
      if (tileCache.has(tk)) return tileCache.get(tk);
      const f = tileFormat(L, lw, lh), R = runsFor(lw, lh), k = tx + ',' + ty;
      const roads = R.byTile.get(k) || [], area = areaOf(tx, ty, f);
      let t = null;
      if (roads.length || area) {
        let blob = null;
        try { blob = tileBlob(roads, f, area); } catch (e) { blob = null; }
        t = { roads, tx, ty, lw, lh, blob, attr: f.W, b10: f.simple ? 1 : 0, lines: roads.length,
              land: area ? (area.full ? 'full' : 'coast') : null };
      }
      tileCache.set(tk, t);
      return t;
    };
    // Деление — как у завода: kd-дерево внутри кластера. Тайл, не влезающий в
    // рамку, делится пополам — по X, если он шире (lw > lh), иначе по Y; листья
    // разного размера, порядок записей — Мортон начала (у завода так все 1 947
    // кластеров L0 со смешанным размером, docs/formats/gdb.md, «Кластер: kd-дерево»).
    // Попытки: заводская рамка и заводское число тайлов на кластер; затем до
    // пределов формата (u16); затем до 2048 тайлов; затем без подписей.
    for (let attempt = 0; attempt < 4 && !chosen; attempt++) {
      const cap = attempt === 0 ? budget : MAX_BLOB;
      const maxLeaves = 1 << (attempt < 2 ? LEVEL_BITS[lvNr] : 11);
      if (attempt === 3) { for (const pc of c.pieces) pc.labels = []; unlabeled++; runsCache = new Map(); tileCache = new Map(); }
      const leaves = [];
      let fail = false;
      const place = (tx, ty, lw, lh) => {
        if (fail) return;
        const t = makeTile(tx, ty, lw, lh);
        if (!t || (t.blob && t.blob.length <= cap && (attempt > 1 || t.blob.readUInt16BE(6) <= LEVEL_ELS[lvNr]))) { leaves.push(t || { tx, ty, lw, lh }); if (leaves.length > maxLeaves) fail = true; return; }
        if (!lw && !lh) { fail = true; return; }
        if (lw > lh) { place(tx, ty, lw - 1, lh); place(tx + (1 << (lw - 1)), ty, lw - 1, lh); }
        else { place(tx, ty, lw, lh - 1); place(tx, ty + (1 << (lh - 1)), lw, lh - 1); }
      };
      for (let iy = 0; iy < 1 << (L.potY - L.lh); iy++) {
        for (let ix = 0; ix < 1 << (L.potX - L.lw); ix++) place(c.cx * CW + (ix << L.lw), c.cy * CH + (iy << L.lh), L.lw, L.lh);
      }
      if (!fail) chosen = { leaves, out: leaves.reduce((s, t) => s + (runsFor(t.lw, t.lh).out.get(t.tx + ',' + t.ty) || 0), 0) };
    }
    if (!chosen) { skipped += c.pieces.length; continue; }
    const tilesOf = chosen.leaves.filter(t => t.blob);
    // куски линий в тайлах: ключ тайла, номер элемента (его дал tileBlob) и
    // места точек на исходной линии
    const k0 = gm.keyOrigin(lvNr);
    for (const t of tilesOf) {
      const tile = (((k0.y0 + t.ty) << 16) | (k0.x0 + t.tx)) >>> 0;
      const x0 = FRAME[0] + t.tx * L.cellX, y0 = FRAME[1] + t.ty * L.cellY;
      const rect = [x0, y0, x0 + (L.cellX << t.lw), y0 + (L.cellY << t.lh)];
      for (const r of t.roads) if (r.src !== undefined) pieces.push({ src: r.src, tile, el: r.el, ts: r.ts, rect });
    }
    dropped += chosen.out;
    landTiles += tilesOf.filter(t => t.land).length;
    if (!tilesOf.length) continue;
    clusters.push({ cx: c.cx, cy: c.cy, lw: L.lw, lh: L.lh, tiles: tilesOf.map(t => ({
      ix: t.tx - c.cx * CW, iy: t.ty - c.cy * CH, lw: t.lw, lh: t.lh, blob: t.blob, attr: t.attr, b10: t.b10,
      lines: t.lines, land: t.land })),
      leaves: chosen.leaves.map(t => ({ ix: t.tx - c.cx * CW, iy: t.ty - c.cy * CH, lw: t.lw, lh: t.lh, t: t.blob ? t : null })) });
  }

  L.clusters = clusters;
  const tiles = clusters.reduce((a, c) => a + c.tiles.length, 0);
  const elements = clusters.reduce((a, c) => a + c.tiles.reduce((b, t) => b + t.lines, 0), 0);
  const sizes = {};
  for (const c of clusters) for (const t of c.tiles) sizes['2^' + t.lw + 'x2^' + t.lh] = (sizes['2^' + t.lw + 'x2^' + t.lh] || 0) + 1;
  return { level: L, tiles, clusters: clusters.length, skipped, dropped, elements, sizes, landTiles, unlabeled,
           vertex, pieces, keys };
}

// Классы дорог по уровням — правило завода (вся Европа и Крит, сверка 23.10):
// L1–L2 — классы 0…3, L3 — 0…2 (класса 3 на всю Европу 56 линий), L4 и выше —
// 0…1 (класса 2 — 14–25 линий). Наши классы (classFor): автомагистраль — 1
// (на L7+ — 0), trunk/primary — 2, secondary и tertiary выше L0 — 3. Ключ —
// тег `highway` из OSM; дороги без класса считаются мелкими и выше L0 не идут.
const LEVEL_CLASSES = [
  null,                                                              // L0 — всё
  ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'],         // L1
  ['motorway', 'trunk', 'primary', 'secondary'],                     // L2
  ['motorway', 'trunk', 'primary'],                                  // L3: классы 0…2
  ['motorway'], ['motorway'], ['motorway'], ['motorway'],            // L4…L7: классы 0…1
  ['motorway'], ['motorway'], ['motorway'], ['motorway'],            // L8…L11
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

// Точки разреза тайлов XAC (src/xacsplit.js) — узлы, которых в OSM нет: ребро
// a→b разрезано в mids. Поиск линии маршрута на L0 (FUN_08cb6578) требует, чтобы
// ОБА конца вектора были точками одной линии GDB, поэтому точки разреза
// вставляются в линию, где лежат a и b, — на ближайший отрезок между ними.
// cuts: [{ a: {x, y}, b: {x, y}, mids: [{x, y}] }] в мировых единицах.
function insertCuts(lines, cuts) {
  const U = gm.UNITS_PER_LON, V = gm.UNITS_PER_LAT;
  const key = ([lon, lat]) => Math.round(lon * U) + ',' + Math.round(lat * V);
  const at = new Map();
  lines.forEach((ln, li) => (ln.pts || []).forEach((p, k) => {
    const s = key(p);
    if (!at.has(s)) at.set(s, []);
    at.get(s).push([li, k]);
  }));
  const out = lines.map(ln => Object.assign({}, ln));
  const extra = new Map();                       // линия -> [{k, d, p}] вставки после точки k
  let done = 0;
  for (const c of cuts) {
    const la = at.get(c.a.x + ',' + c.a.y) || [], lb = at.get(c.b.x + ',' + c.b.y) || [];
    let hit = null;
    for (const [li, i] of la) for (const [lj, j] of lb) if (li === lj && !hit) hit = [li, Math.min(i, j), Math.max(i, j)];
    if (!hit) continue;
    const [li, i, j] = hit, pts = lines[li].pts;
    for (const m of c.mids) {
      let best = i, bd = Infinity;
      for (let k = i; k < j; k++) {
        const ax = pts[k][0] * U, ay = pts[k][1] * V, bx = pts[k + 1][0] * U, by = pts[k + 1][1] * V;
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
        const t = L2 ? Math.max(0, Math.min(1, ((m.x - ax) * dx + (m.y - ay) * dy) / L2)) : 0;
        const d = (ax + t * dx - m.x) ** 2 + (ay + t * dy - m.y) ** 2;
        if (d < bd) { bd = d; best = k + Math.min(t, 0.999999); }
      }
      if (!extra.has(li)) extra.set(li, []);
      extra.get(li).push({ k: best, p: [m.x / U, m.y / V] });
    }
    done++;
  }
  for (const [li, ins] of extra) {
    const pts = lines[li].pts, list = [];
    pts.forEach((p, k) => list.push({ k, p }));
    out[li].pts = list.concat(ins).sort((a, b) => a.k - b.k).map(q => q.p);
  }
  return { lines: out, done };
}

function volumeFromRoads(lines, opts = {}) {
  if (opts.cuts && opts.cuts.length) lines = insertCuts(lines, opts.cuts).lines;
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
    : Object.assign({}, L, { clusters: [] })));
  const r = stats.get(want[0]);
  const rt = opts.vectors && opts.xacBlocks ? refTables(stats, opts.vectors, opts.xacBlocks) : null;
  for (const st of stats.values()) { delete st.vertex; delete st.pieces; delete st.keys; }
  return Object.assign({}, build(Object.assign({}, opts, { levels, refTables: rt && rt.tables })), {
    stat: r, stats: [...stats.values()], refs: rt,
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
  landArea, regionTris, regionParts, stripify, polyElements, clipRing, simplifyRing, landForLevel, layersForLevel, OVERLAY, LAND, SEA,
  PROLOGUE, SIG, VERSION, FRAME, MAGIC, MAX_BLOB, FRAME_ELEMENT, EUROPE_LEVELS, CLUSTER_REC,
  insertCuts, refDirectory, refTable, refLevel, refsForLevel, tileBlob, emptyTile, readTileRoads, tileFormat, classFor, splitGrid, mergeLines, mortonIndex, clusterBlob, build,
  degToTile, degToTileL, cellX, cellY, cellXL, cellYL, roadsToLevel, volumeFromRoads,
  linesForLevel, labelsFor, LEVEL_CLASSES, TILE_CELLS, TILE_SIZES, tileSizes, component,
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
      return { name: R.roadName(p), ref: p.ref || null, cls: p.highway || null, pts: f.geometry.coordinates };
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
      (st.unlabeled ? ', кластеров без подписей ' + st.unlabeled : '') +
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
