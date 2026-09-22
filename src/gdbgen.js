'use strict';
// Сборка тома GDB С НУЛЯ: байты тайла, кластера, уровня и всего файла.
//
// Отличие от соседей: `gdbwrite.js` правит ломаную на месте, `gdbroads.js`
// дописывает элементы в существующий тайл, `gdbstrip.js` копирует область
// уровней оригинала и переписывает таблицу. Здесь ни одного байта оригинала не
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
//     [10 … off0)  поток элементов: сперва служебная рамка, затем наши ломаные
//     [off0…off1)  S1 — реестр: u16 счётчик (= элементов − 1), 0x02, u16 ноль,
//                  затем на каждый элемент запись «32 <u16 строка> f0»
//     [off1…off2)  S2 — имена: u16 счётчик, u16 ноль, затем «байт длины + байты»
//     [off2…конец) S3 — у собранных тайлов пуста
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
// lw/lh — размер тайла в ячейках (log2): у L0 это 5 при potX 7, то есть 4×4
// тайла в кластере; у грубых уровней lw = potX, то есть один тайл на кластер
// (на выборке по 200–235 кластеров с уровня — преобладающая форма).
const EUROPE_LEVELS = [
  { cellX: 789, cellY: 546, potX: 7, potY: 7, from: 0, to: 40000, H: 280, tag: '000700010c00', shift: 0, lw: 5, lh: 5 },
  { cellX: 1984, cellY: 1984, potX: 6, potY: 6, from: 40000, to: 150000, H: 155, tag: '030600010c00', shift: 3, lw: 6, lh: 6 },
  { cellX: 6336, cellY: 4416, potX: 6, potY: 6, from: 150000, to: 300000, H: 70, tag: '050600010c00', shift: 5, lw: 6, lh: 6 },
  { cellX: 6336, cellY: 4416, potX: 6, potY: 6, from: 300000, to: 460000, H: 70, tag: '060600010c00', shift: 6, lw: 6, lh: 6 },
  { cellX: 7936, cellY: 7936, potX: 5, potY: 5, from: 460000, to: 1500000, H: 78, tag: '070600010c00', shift: 7, lw: 5, lh: 5 },
  { cellX: 15360, cellY: 15360, potX: 6, potY: 6, from: 1500000, to: 2000000, H: 20, tag: '090600010c00', shift: 9, lw: 6, lh: 6 },
  { cellX: 15360, cellY: 15360, potX: 6, potY: 6, from: 2000000, to: 3500000, H: 20, tag: '090600010c00', shift: 9, lw: 6, lh: 6 },
  { cellX: 30720, cellY: 30720, potX: 5, potY: 5, from: 3500000, to: 4000000, H: 20, tag: '0a0600010c00', shift: 10, lw: 5, lh: 5 },
  { cellX: 63488, cellY: 63488, potX: 4, potY: 4, from: 4000000, to: 5900000, H: 20, tag: '0a0600010c00', shift: 10, lw: 4, lh: 4 },
  { cellX: 253952, cellY: 253952, potX: 3, potY: 3, from: 5900000, to: 8000000, H: 10, tag: '0b0600010c00', shift: 11, lw: 3, lh: 3 },
  { cellX: 253952, cellY: 253952, potX: 3, potY: 3, from: 8000000, to: 12500000, H: 10, tag: '0b0600010c00', shift: 11, lw: 3, lh: 3 },
  { cellX: 253952, cellY: 253952, potX: 3, potY: 3, from: 12500000, to: 2147483647, H: 10, tag: '0c0100010c00', shift: 12, lw: 3, lh: 3 },
];

// ── тайл ───────────────────────────────────────────────────────────────────

// Служебная рамка — первый элемент каждого тайла; записи в S1 у неё нет,
// поэтому счётчик реестра всегда на единицу меньше числа элементов. Байты
// взяты из общего пустого тайла и одинаковы у 2432 из 2500 осмотренных тайлов;
// смысл четырёх точек (50496,3) (50497,4354) (1,4353) (0,0) не установлен.
const FRAME_ELEMENT = Buffer.from('4d000000508f00000000c5400003c54111020001110100000000', 'hex');

const MAGIC = 0xE028;
const MAX_BLOB = 0xffff;              // смещения секций — u16, длиннее тайл не бывает
const MAX_NAME = 15;                  // в байте длины строки S2 значимы младшие 4 бита

function s1record(nameIdx) {
  const r = Buffer.alloc(4);
  r[0] = 0x32; r.writeUInt16BE(nameIdx, 1); r[3] = 0xf0;
  return r;
}

// Строки в тайлах оригинала однобайтные (латиница: «CALLE GENERAL SERRADOR»,
// «NAPOLI-CAGLIARI», коды стран). Всё, что в один байт latin1 не ложится,
// заменяем на «?» — молча портить имя хуже, чем показать пропуск.
function s2string(name) {
  const clean = [...String(name)].map(ch => (ch.charCodeAt(0) <= 0xff ? ch : '?')).join('');
  const s = Buffer.from(clean.slice(0, MAX_NAME), 'latin1');
  return Buffer.concat([Buffer.from([s.length]), s]);
}

// Собрать блоб тайла. roads — массив {points: [{x,y}…], name}: точки в мировых
// единицах ОТ НАЧАЛА ТАЙЛА (x беззнаковый u16, y знаковый i16).
// Без дорог выходит ровно общий пустой тайл оригинала — 40 байт.
function tileBlob(roads = [], opts = {}) {
  const frame = opts.frame || FRAME_ELEMENT;
  const s3 = opts.s3 || Buffer.alloc(0);
  const yConst = opts.yConst === undefined ? 0x50 : opts.yConst;

  const elems = [frame];
  const names = [];
  for (const r of roads) {
    const pts = r.points || r;
    elems.push(gm.encodePoints(pts, yConst));
    names.push((r.name === undefined || r.name === null || r.name === '') ? 'CY' : r.name);
  }

  // на каждое имя — одна строка в S2, повторы не плодим
  const uniq = [], idxOf = new Map();
  for (const nm of names) {
    const key = String(nm).slice(0, MAX_NAME);
    if (!idxOf.has(key)) { idxOf.set(key, uniq.length); uniq.push(key); }
  }

  const s1 = names.length
    ? Buffer.concat([
      (() => { const hbuf = Buffer.alloc(5); hbuf.writeUInt16BE(names.length, 0); hbuf[2] = 2; return hbuf; })(),
      ...names.map(nm => s1record(idxOf.get(String(nm).slice(0, MAX_NAME)))),
    ])
    : Buffer.from([0, 0]);
  const s2 = uniq.length
    ? Buffer.concat([
      (() => { const hbuf = Buffer.alloc(4); hbuf.writeUInt16BE(uniq.length, 0); return hbuf; })(),
      ...uniq.map(s2string),
    ])
    : Buffer.from([0, 0]);

  const stream = Buffer.concat(elems);
  const off0 = gm.TILE_HEAD + stream.length;
  const off1 = off0 + s1.length;
  const off2 = off1 + s2.length;
  const total = off2 + s3.length;
  if (total > MAX_BLOB) throw new Error('блоб тайла не влезает в u16: ' + total + ' б');

  const head = Buffer.alloc(gm.TILE_HEAD);
  head.writeUInt16BE(off0, 0);
  head.writeUInt16BE(off1, 2);
  head.writeUInt16BE(off2, 4);
  head.writeUInt16BE(elems.length, 6);       // рамка тоже считается элементом
  head.writeUInt16BE(MAGIC, 8);
  return Buffer.concat([head, stream, s1, s2, s3]);
}

// Общий пустой тайл: та же сборка без дорог. Совпадает с оригинальным
// байт в байт — на этом держится проверка в тестах.
function emptyTile() { return tileBlob([]); }

// Обратный разбор собранного тайла: все ломаные, а не только последняя (как
// в gm.tilePoints, который ищет один узор в конце потока). Разбирает только то,
// что умеет писать эта сборка: рамка + элементы вида
//   1d <u32 yConst> <u8 N> 8f 00 00 00 00   затем N × u32
function readTileRoads(blob) {
  const off0 = blob.readUInt16BE(0), off1 = blob.readUInt16BE(2), off2 = blob.readUInt16BE(4);
  const count = blob.readUInt16BE(6), magic = blob.readUInt16BE(8);
  if (magic !== MAGIC) throw new Error('не тайл: магия 0x' + magic.toString(16));

  // имена S2 — по порядку, чтобы подставить их разобранным дорогам
  const names = [];
  const s2 = blob.subarray(off1, off2);
  if (s2.length > 4) {
    let p = 4;
    for (let k = 0; k < s2.readUInt16BE(0) && p < s2.length; k++) {
      const len = s2[p] & 0x0f;
      names.push(s2.subarray(p + 1, p + 1 + len).toString('latin1'));
      p += 1 + len;
    }
  }
  const s1 = blob.subarray(off0, off1);
  const refs = [];
  if (s1.length > 5) {
    for (let p = 5; p + 4 <= s1.length; p += 4) {
      if (s1[p] !== 0x32 || s1[p + 3] !== 0xf0) break;      // запись иной формы — не наша
      refs.push(s1.readUInt16BE(p + 1));
    }
  }

  const roads = [];
  let p = gm.TILE_HEAD + FRAME_ELEMENT.length;              // рамку пропускаем
  const stream = blob.subarray(0, off0);
  while (p + 11 <= stream.length) {
    if (stream[p] !== 0x1d) break;
    const yConst = stream.readUInt32BE(p + 1), n = stream[p + 5];
    if (stream[p + 6] !== 0x8f) break;
    const at = p + 11;
    if (at + n * 4 > stream.length) break;
    const points = [];
    for (let i = 0; i < n; i++) {
      const v = stream.readUInt32BE(at + i * 4);
      points.push({ x: v >>> 16, y: ((v & 0xffff) << 16) >> 16 });
    }
    const idx = refs[roads.length];
    roads.push({ points, yConst, name: idx === undefined ? null : names[idx] });
    p = at + n * 4;
  }
  return { count, off0, off1, off2, roads, names, s1count: s1.length > 1 ? s1.readUInt16BE(0) : 0 };
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
    b[o + 9] = t.attr === undefined ? 0x10 : t.attr;
    b[o + 10] = 0;
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
  const plan = levels.map((L, i) => {
    const W = gm.gridW(h, L);
    const count = W * L.H;
    // ключи кластеров несут добавку уровня — без неё прошивка (и наш читатель)
    // ищут кластер не в том слоте; см. gm.keyOrigin
    const key0 = L.key0 || gm.keyOrigin(i);
    return { L, W, H: L.H, count, key0, size: gm.TABLE_AT + count * 6 };
  });
  let at = PROLOGUE;
  for (const p of plan) { p.offset = at; at += p.size; }
  const regionEnd = at;

  // 2. данные: общий пустой тайл, затем по кластерам — их тайлы и запись-таблица
  const chunks = [];
  let pos = regionEnd;
  const put = buf => { const o = pos; chunks.push(buf); pos += buf.length; return o; };
  const empty = emptyTile();
  const emptyAt = put(empty);

  const map = { emptyTile: { off: emptyAt, size: empty.length }, levels: [] };
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
      for (let k = 0, n = 1 << (p.L.potX - lw + p.L.potY - lh); k < n; k++) {
        // обратный Мортон: чётные биты — ix, нечётные — iy
        let ix = 0, iy = 0;
        for (let b = 0; b < 8; b++) { ix |= (k >> (2 * b) & 1) << b; iy |= (k >> (2 * b + 1) & 1) << b; }
        const x = p.key0.x0 + (c.cx << p.L.potX) + (ix << lw);
        const y = p.key0.y0 + (c.cy << p.L.potY) + (iy << lh);
        const t = byIdx.get(k);
        if (t) {
          const o = put(t.blob);
          recs.push({ x, y, lw, lh, attr: t.attr, flag: t.flag, off: o, size: t.blob.length });
        } else {
          recs.push({ x, y, lw, lh, off: emptyAt, size: empty.length });
        }
      }
      const blob = clusterBlob(recs);
      const off = put(blob);
      entries[slot] = { off, sz: blob.length };
      placed.push({ cx: c.cx, cy: c.cy, slot, off, size: blob.length, tiles: recs });
    }
    p.entries = entries;
    map.levels.push({ i: map.levels.length, offset: p.offset, size: p.size, W: p.W, H: p.H, key0: p.key0, clusters: placed });
  }

  // 3. шапка
  const head = Buffer.alloc(PROLOGUE);
  head.writeUInt32BE(SIG, 0);
  head.writeUInt32BE(spec.version || VERSION, 4);
  head.writeUInt32BE(spec.id === undefined ? 1711366677 : spec.id, 8);
  frame.forEach((v, i) => head.writeInt32BE(v, 0x14 + i * 4));
  head[0x24] = plan.length;
  plan.forEach((p, i) => {
    head.writeUInt32BE(p.offset, 0x2D + i * 8);
    head.writeUInt32BE(p.size, 0x2D + i * 8 + 4);
  });
  head.writeUInt16BE(0xffff, 301);
  head.write(String(spec.stamp || '20220218092956').slice(0, 14), 303, 'latin1');
  head.write(String(spec.name || 'EJ211').slice(0, 8), 317, 'latin1');
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
    p.entries.forEach((e, i) => {
      b.writeUInt32BE(e.off, gm.TABLE_AT + i * 6);
      b.writeUInt16BE(e.sz, gm.TABLE_AT + i * 6 + 4);
    });
    return b;
  });

  return { gdb: Buffer.concat([head, ...levelBufs, ...chunks]), gd2: Buffer.alloc(0), map, regionEnd };
}

// ── укладка дорог ──────────────────────────────────────────────────────────

const TILE_CELLS = 32;                                  // тайл L0 по умолчанию — 32×32 ячейки
const cellX = lon => 11264 + 93.1 * lon;                // калибровка из docs/formats/gdb.md
const cellY = lat => 934 + 181.8 * lat;

// Ячейка уровня по градусам: мировая единица у всех уровней общая, меняется
// только размер ячейки. У L0 (789×546) это в точности прежние cellX/cellY.
const cellXL = (lon, L) => gm.cellOfLon(lon, L.cellX);
const cellYL = (lat, L) => gm.cellOfLat(lat, L.cellY);

// градусы → мировые единицы от начала тайла (та же арифметика, что в gdbwrite)
function degToTile(lon, lat, tcx, tcy) {
  return {
    x: Math.round((cellX(lon) - tcx) * gm.CELL_X),
    y: Math.round((cellY(lat) - tcy) * gm.CELL_Y),
  };
}

// То же для любого уровня: точка хранится не в мировых единицах, а в сдвинутых
// на L.shift — прошивка восстанавливает мировую как `начало_тайла + (сырая <<
// сдвиг)`. Сдвиг лежит в заголовке уровня на +82 и равен 0 3 5 6 7 9 9 10 10
// 11 11 12; при нулевом сдвиге формула вырождается в прежнюю.
function degToTileL(lon, lat, tcx, tcy, L) {
  const u = 1 << L.shift;
  return {
    x: Math.round((cellXL(lon, L) - tcx) * L.cellX / u),
    y: Math.round((cellYL(lat, L) - tcy) * L.cellY / u),
  };
}

// Размеры тайла, которые перебирает подбор: X и Y уменьшаются по очереди.
// Ровно такой ряд и лежит в заводском томе — 2^5×2^5, 2^5×2^4, 2^4×2^4,
// 2^4×2^3, 2^3×2^3, 2^3×2^2, 2^2×2^2, 2^2×2^1, 2^1×2^1, 2^1×2^0.
const TILE_SIZES = [[5, 5], [5, 4], [4, 4], [4, 3], [3, 3], [3, 2], [2, 2], [2, 1], [1, 1], [1, 0]];

// Тот же ряд, но начиная с размера тайла этого уровня: у грубых уровней тайл
// крупнее (один на кластер), и начинать перебор с 2^5 незачем.
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

// Разложить ломаные (в градусах) по тайлам уровня и собрать его описание.
// Дорога целиком уходит в тайл, куда попадает юго-западный угол её рамки:
// x — беззнаковое слово от начала тайла, y — знаковое, запаса хватает, чтобы
// ломаная вылезла за край.
//
// Размер тайла подбирается ПО КЛАСТЕРУ, а не берётся постоянным. Смещения
// секций внутри блоба — u16, поэтому плотный тайл в 32 ячейки не влезает:
// на полной сети Кипра переполнялось 16 тайлов из 31. Завод решает это так же —
// внутри кластера размер тайла один (175 кластеров из 175 просмотренных), а
// между кластерами он гуляет от 2^5 до 2^0 по плотности.
//
// Грубые уровни. Точка тайла хранится не в мировых единицах, а в сдвинутых на
// L.shift (байт +82 заголовка уровня, значения 0 3 5 6 7 9 9 10 10 11 11 12) —
// прошивка восстанавливает мировую как `начало_тайла + (сырая << сдвиг)`.
// Именно поэтому тайл влезает в u16 на любом уровне: (ячейка << lw) >> сдвиг
// не превышает 25 248 ни у одного из 4695 проверенных заводских тайлов.
// Сдвиг заодно задаёт разрешение: 1 единица — это 1,2 м на L0, 10 м на L1 и
// 5 км на L11, поэтому на грубых уровнях соседние точки ломаной сливаются —
// совпавшие подряд выбрасываем (`opts.thin`, по умолчанию включено).
//
// opts.level — номер уровня (по умолчанию 0).
function roadsToLevel(lines, opts = {}) {
  const lvNr = opts.level || 0;
  const L = Object.assign({}, EUROPE_LEVELS[lvNr]);
  const CW = 1 << L.potX, CH = 1 << L.potY;
  const thin = opts.thin === undefined ? true : opts.thin;

  // 1. дороги по кластерам — кластер задан сеткой уровня и от размера тайла
  //    не зависит.
  //
  // Дорога привязывается к тайлу, в который попадает ЮГО-ЗАПАДНЫЙ угол её
  // рамки, а не первая точка. Причина: x точки — беззнаковое слово от начала
  // тайла, и дорога, начавшаяся у западного края и ушедшая на запад, даёт
  // отрицательный x и пропадает. По привязке к первой точке на кипрской сети
  // терялось 1407 дорог из 87 698, по углу рамки — ни одной.
  const perCluster = new Map();
  let skipped = 0;
  for (const ln of lines) {
    const coords = Array.isArray(ln) ? ln : ln.pts;
    if (!coords || coords.length < 2 || coords.length > 254) { skipped++; continue; }
    let ax = Infinity, ay = Infinity;
    for (const [lon, lat] of coords) {
      const x = cellXL(lon, L), y = cellYL(lat, L);
      if (x < ax) ax = x;
      if (y < ay) ay = y;
    }
    const cx = Math.floor(ax / CW), cy = Math.floor(ay / CH);
    const k = cx + ',' + cy;
    if (!perCluster.has(k)) perCluster.set(k, { cx, cy, roads: [] });
    perCluster.get(k).roads.push({ coords, anchor: [ax, ay],
      name: (Array.isArray(ln) ? null : ln.name) || opts.name || 'CY' });
  }

  // 2. на каждый кластер — самый крупный размер тайла, при котором блобы влезают
  const clusters = [];
  let lost = 0;
  const budget = opts.maxBlob || MAX_BLOB;
  for (const c of perCluster.values()) {
    let chosen = null;
    for (const [lw, lh] of tileSizes(L)) {
      const step = [1 << lw, 1 << lh];
      const byTile = new Map();
      let out = 0;
      for (const r of c.roads) {
        const tx = Math.floor(r.anchor[0] / step[0]) * step[0];
        const ty = Math.floor(r.anchor[1] / step[1]) * step[1];
        let points = r.coords.map(([lon, lat]) => degToTileL(lon, lat, tx, ty, L));
        // на грубых уровнях единица координаты крупная, и подряд идущие точки
        // ломаной сливаются в одну — держать их незачем
        if (thin) points = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
        if (points.length < 2) { out++; continue; }
        if (points.some(p => p.x < 0 || p.x > 0xffff || p.y < -32768 || p.y > 32767)) { out++; continue; }
        const k = tx + ',' + ty;
        if (!byTile.has(k)) byTile.set(k, { tx, ty, roads: [] });
        byTile.get(k).roads.push({ points, name: r.name });
      }
      let fits = true;
      const tiles = [];
      for (const t of byTile.values()) {
        let blob;
        try { blob = tileBlob(t.roads); } catch (e) { fits = false; break; }
        if (blob.length > budget) { fits = false; break; }
        tiles.push({
          ix: (t.tx - c.cx * CW) >> lw, iy: (t.ty - c.cy * CH) >> lh,
          lw, lh, blob,
        });
      }
      if (fits) { chosen = { lw, lh, tiles, out }; break; }
    }
    if (!chosen) { skipped += c.roads.length; continue; }
    lost += chosen.out;
    clusters.push({ cx: c.cx, cy: c.cy, lw: chosen.lw, lh: chosen.lh, tiles: chosen.tiles });
  }

  L.clusters = clusters;
  const tiles = clusters.reduce((a, c) => a + c.tiles.length, 0);
  const sizes = {};
  for (const c of clusters) sizes['2^' + c.lw + 'x2^' + c.lh] = (sizes['2^' + c.lw + 'x2^' + c.lh] || 0) + 1;
  return { level: L, tiles, clusters: clusters.length, skipped: skipped + lost, sizes };
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
  if (!cls) return lines;
  const set = new Set(cls.concat(cls.map(c => c + '_link')));
  return lines.filter(ln => !Array.isArray(ln) && ln.cls && set.has(ln.cls));
}

// Том «только эти дороги». opts.levels — список номеров уровней (по умолчанию
// один L0); на каждый из них дороги раскладываются своей сеткой и своим
// сдвигом, прочие уровни остаются пустыми.
function volumeFromRoads(lines, opts = {}) {
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
  return Object.assign({}, build(Object.assign({}, opts, { levels })), {
    stat: r, stats: [...stats.values()],
  });
}

module.exports = {
  PROLOGUE, SIG, VERSION, FRAME, MAGIC, MAX_BLOB, FRAME_ELEMENT, EUROPE_LEVELS, CLUSTER_REC,
  tileBlob, emptyTile, readTileRoads, mortonIndex, clusterBlob, build,
  degToTile, degToTileL, cellX, cellY, cellXL, cellYL, roadsToLevel, volumeFromRoads,
  linesForLevel, LEVEL_CLASSES, TILE_CELLS, TILE_SIZES, tileSizes,
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
  const v = volumeFromRoads(lines, { name: opt('--name') || 'EJ211', levels });
  for (const st of v.stats) {
    console.log('  L' + String(st.nr).padStart(2) + ': дорог ' + String(st.lines).padStart(6) +
      ', тайлов ' + String(st.tiles).padStart(4) + ', кластеров ' + String(st.clusters).padStart(3) +
      (st.skipped ? ', пропущено ' + st.skipped : '') +
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

  const dirGdb = path.join(outDir, 'pkgdb', 'GDB');
  fs.mkdirSync(dirGdb, { recursive: true });
  const base = (opt('--name') || 'EJ211') + '_v37a';
  const gdbPath = path.join(dirGdb, base + '.gdb');
  fs.writeFileSync(gdbPath, v.gdb);
  console.log('записано: ' + gdbPath);

  // Компонент GDB2 в набор не кладём: второй том у нас пуст, сквозных ссылок за
  // границу первого собранный том не делает, а нулевой файл установщику
  // предъявлять незачем. Что GDB2 необязателен, видно по австралийскому
  // набору — там его нет совсем.
  if (!args.includes('--no-set')) {
    const root = dataset.resolveRoot();
    const srcConf = path.join(root, 'pkgdb', 'GDB', 'GDB.conf');
    if (fs.existsSync(srcConf)) {
      const dstConf = path.join(dirGdb, 'GDB.conf');
      fs.copyFileSync(srcConf, dstConf);
      let t = fs.readFileSync(dstConf, 'latin1').replace(/^name=.*\.gdb$/m, 'name=' + base + '.gdb');
      fs.writeFileSync(dstConf, Buffer.from(t, 'latin1'));
      conf.updateConf(dstConf, gdbPath);
      console.log('GDB/GDB.conf: имя файла, size, MD5 и пробы qa пересчитаны');
    }
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
    console.log('дальше: node src/mkmeta.js ' + outDir + ' --keep-pkg');
    console.log('после установки на машине: tools/write_fixacios.sh');
  }
}
