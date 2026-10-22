'use strict';
// Контейнер GDB (карта для отрисовки): EJ211_v37a.gdb + EJ211_v37a.gd2 — один
// логический файл. Смещения сквозные и 40-битные: .gd2 логически продолжает
// .gdb (данные тайлов лежат в .gd2). Все числа BIG-endian (как в XAC).
//
// Раскладка вскрыта декомпиляцией MMI3GApplication (классы IsDb::CGdb*,
// исходники Q:\platform\common\isdb\gdb\...). Ключевые функции:
//   CGdbCluster::init_nach_laden  FUN_08caf3c4 — читает тайлы кластера с диска
//   CGdbCluster::setze_such_tabellen_eintrag FUN_08caf140 — заполняет поиск-таблицу
//   CGdbLevel::loadObject FUN_08cae6cc — грузит кластер по индексу (cte 20 байт)
//   CGdbTile::CGdbTile FUN_08cabdb8 — конструктор тайла из заголовка
//
//   ── ШАПКА (смещение 0) ────────────────────────────────────────────────
//     0x00 u32 сигнатура DEADBEEF   0x04 u32 версия (37)
//     0x14 4×i32 рамка карты (мировые координаты, единицы «GDB»)
//     0x24 u8  число уровней (12 у Европы)   0x2D таблица уровней:
//              пары (u32 смещение, u32 размер) на каждый уровень
//
//   ── УРОВЕНЬ (пирамида по масштабу экрана) ─────────────────────────────
//     +0x00 u32 cellX  +0x04 u32 cellY — размер ЯЧЕЙКИ в мировых единицах
//     +0x08 u8  potX   +0x09 u8  potY  — log2 числа ячеек в кластере (7 → 128)
//     затем область рамки/паддинга, за ней ТАБЛИЦА КЛАСТЕРОВ до конца уровня.
//
//   ── ТАБЛИЦА КЛАСТЕРОВ ─────────────────────────────────────────────────
//     Массив 6-байтных записей {u32 смещение, u16 размер}, ровно W*H штук:
//     регулярная сетка W столбцов × H строк. Кластер (cx,cy) лежит в слоте
//        slot = cy*W + cx        (проверено 3000/3000 реальных кластеров L0)
//     где cx = global_x >> potX, cy = global_y >> potY. Смещение 0/16 — слот
//     без данных; большинство «морских» слотов ссылаются на ОДИН общий пустой
//     тайл. ~0.3% слотов — вариантная кодировка (мелкое смещение-ссылка или
//     нулевой размер), пока не разобрана.
//
//   ── КЛАСТЕР ───────────────────────────────────────────────────────────
//     Таблица тайлов: 19-байтные записи (при версии ≥ 0x23; иначе короче):
//        u32 ключ (x = ключ & 0xFFFF, y = ключ >> 16; старшие биты — подтайл),
//        байты lw@5 / lh@7 (log2 размера тайла в ячейках), флаги @8..10,
//        u32 смещение данных @11, u32 размер данных @15.
//     За таблицей тайлов — поиск-таблица 2^(potX+potY) элементов (байт/u16/u32
//     по числу тайлов) с индексом тайла для каждой ячейки кластера.
//
// Инструмент читает и проверяет структуру; записывать (перенос тайла) пока
// не умеет — для этого нужен ещё формат самих данных тайла (CGdbTileContent).
//
//   node src/gdb.js [каталог]              сводка: шапка, уровни, сетки
//   node src/gdb.js ... --level N          детально уровень N (таблица+сетка)
//   node src/gdb.js ... --cluster N[:L]    разобрать кластер (слот N, уровень L)
//   node src/gdb.js ... --find X Y [L]     слот для мировой ячейки X,Y на уровне L

const fs = require('fs');
const path = require('path');
const dataset = require('./dataset');

// Тот же читатель поверх буферов в памяти: «том» не обязан лежать на диске —
// так его читают сборщик (self-check) и тесты.
function openBuffer(b1, b2) {
  const s1 = b1.length, s2 = b2 ? b2.length : 0;
  return { p1: '<память>', p2: b2 ? '<память>' : null, s1, s2, total: s1 + s2, b1, b2: b2 || null };
}

function openGdb(root) {
  const dir = path.join(root, 'pkgdb');
  const v1 = fs.readdirSync(path.join(dir, 'GDB')).find(f => /[.]gdb$/i.test(f));
  const v2d = path.join(dir, 'GDB2');
  const v2 = fs.existsSync(v2d) ? fs.readdirSync(v2d).find(f => /[.]gd2$/i.test(f)) : null;
  const p1 = path.join(dir, 'GDB', v1), s1 = fs.statSync(p1).size;
  const p2 = v2 ? path.join(v2d, v2) : null, s2 = p2 ? fs.statSync(p2).size : 0;
  const fd1 = fs.openSync(p1, 'r'), fd2 = p2 ? fs.openSync(p2, 'r') : null;
  return { p1, p2, s1, s2, total: s1 + s2, fd1, fd2 };
}

// чтение по сквозному смещению, с переходом через границу .gdb → .gd2
function read(g, off, len) {
  if (off < 0 || off + len > g.total) {
    throw new Error('чтение [' + off + ', ' + (off + len) + ') за концом тома (' + g.total + ')');
  }
  const out = Buffer.alloc(len);
  let done = 0;
  while (done < len) {
    const at = off + done;
    if (at < g.s1) {
      const n = Math.min(len - done, g.s1 - at);
      if (g.b1) g.b1.copy(out, done, at, at + n);
      else fs.readSync(g.fd1, out, done, n, at);
      done += n;
    } else {
      if (!g.fd2 && !g.b2) throw new Error('смещение ' + at + ' за концом .gdb, а .gd2 нет');
      const n = len - done;
      if (g.b2) g.b2.copy(out, done, at - g.s1, at - g.s1 + n);
      else fs.readSync(g.fd2, out, done, n, at - g.s1);
      done += n;
    }
  }
  return out;
}

function header(g) {
  const b = read(g, 0, 0x100);
  const sig = b.readUInt32BE(0).toString(16).toUpperCase();
  const version = b.readUInt32BE(4);
  const frame = [0x14, 0x18, 0x1c, 0x20].map(o => b.readInt32BE(o));
  const nLevels = b[0x24];
  const levels = [];
  for (let i = 0; i < nLevels; i++) {
    const o = 0x2D + i * 8;
    levels.push({ i, offset: b.readUInt32BE(o), size: b.readUInt32BE(o + 4) });
  }
  const regionEnd = levels.reduce((m, l) => Math.max(m, l.offset + l.size), 0);
  return { sig, version, frame, nLevels, levels, regionEnd };
}

// заголовок уровня: размер ячейки, число бит на кластер и СДВИГ КООРДИНАТЫ.
//
// Сдвиг (+82) — та самая величина, из-за которой дороги писались только в L0.
// Точка тайла хранится не в мировых единицах, а в сдвинутых:
//     мировая = начало_тайла + (сырая << сдвиг)
// Прошивка берёт его так: CGdbCluster::init_nach_laden (FUN_08caf3c4) кладёт
// в запись тайла байт уровня `level+0x78 & 0x7f`, конструктор CGdbTile
// (FUN_08cabdb8) переносит его в заголовок тайла +0x11, а инициализация
// декодера точек (FUN_09253334) — в поле +0x16 своего контекста, где его и
// применяет арифметика `(сырая << сдвиг) + основа` (0x09252f..).
// Значения по уровням: 0 3 5 6 7 9 9 10 10 11 11 12.
function levelHead(b) {
  return {
    cellX: b.readUInt32BE(0), cellY: b.readUInt32BE(4), potX: b[8], potY: b[9],
    shift: b[LEVEL_SHIFT_AT], tag: b.subarray(LEVEL_SHIFT_AT, LEVEL_SHIFT_AT + 6).toString('hex'),
  };
}

const LEVEL_SHIFT_AT = 82;

// запись таблицы кластеров считается «чистой», если это пустой маркер или
// правдоподобный указатель в область данных (.gdb-хвост или .gd2)
function cleanEntry(off, sz, regionEnd, total) {
  if (off === 0 || off === 16) return true;                       // пустой слот
  if (off >= regionEnd && off < total && sz > 0 && sz <= 0x10000) return true; // тайлы
  return false;
}

// вывести ширину сетки W из ключей реальных кластеров и долю согласия
// slot == cy*W + cx. Возвращает {W, ok, n}. Пустые/общий тайл пропускаются.
function gridScore(g, h, b, start, count, potX, potY, sampleMax, forceW, origin) {
  const { x0, y0 } = origin || { x0: 0, y0: 0 };
  const pts = [];
  const share = new Map();
  for (let i = 0; i < count; i++) {
    const off = b.readUInt32BE(start + i * 6);
    if (off >= h.regionEnd && off < g.total) share.set(off, (share.get(off) || 0) + 1);
  }
  // «общий пустой» — самый многократно повторённый указатель. Одиночный
  // указатель пустым не считается: в разреженном (собранном) томе настоящий
  // кластер может быть единственным, и его нельзя выкидывать из выборки.
  let emptyOff = 0, emptyN = 0;
  for (const [o, c] of share) if (c > emptyN && c > 1) { emptyN = c; emptyOff = o; }
  for (let i = 0; i < count && pts.length < (sampleMax || 1500); i++) {
    const off = b.readUInt32BE(start + i * 6);
    if (off < h.regionEnd || off === emptyOff || off + 4 > g.total) continue;
    const key = read(g, off, 4).readUInt32BE(0);
    pts.push({ i, cx: ((key & 0xffff) - x0) >> potX, cy: ((key >>> 16) - y0) >> potY });
  }
  let W = forceW || 0;
  for (let a = 0; a < pts.length && !W; a++)
    for (let b2 = a + 1; b2 < pts.length; b2++)
      if (pts[b2].cy !== pts[a].cy) {
        const w = Math.round((pts[b2].i - pts[a].i - (pts[b2].cx - pts[a].cx)) / (pts[b2].cy - pts[a].cy));
        if (w > 0) { W = w; break; }
      }
  let ok = 0; for (const p of pts) if (W && p.cy * W + p.cx === p.i) ok++;
  return { W, ok, n: pts.length, emptyOff, emptyN };
}

// Штатное начало таблицы кластеров. У всех двенадцати уровней Европы таблица
// начинается на +1163 и тянется до конца уровня: (размер уровня − 1163) делится
// на 6 у всех двенадцати, а у L0 частное равно ровно 256×280 = 71 680 — той
// сетке, которую независимо даёт формула slot = cy·W + cx.
const TABLE_AT = 1163;

// Начало отсчёта ключей в кластере зависит от уровня. Проверено на 3309
// кластерах всех двенадцати уровней — совпало у всех до единого:
//
//   уровень 0      ключ = (cx<<potX,            cy<<potY)
//   уровень 1      ключ = (0x8000 + cx<<potX,   cy<<potY)
//   уровни 2…11    ключ = ((N<<12) + cx<<potX,  0x8000 + cy<<potY)
//
// Похоже, номер уровня пишется в старшие разряды x, а когда местная часть в
// 12 разрядов не влезает (L0 нужно 15, L1 — 14), метку ставят иначе. Именно
// из-за этой добавки формула slot = cy·W + cx раньше «не сходилась» на грубых
// уровнях: сетка была верной, а отсчёт — сдвинутым.
function keyOrigin(level) {
  if (level === 0) return { x0: 0, y0: 0 };
  if (level === 1) return { x0: 0x8000, y0: 0 };
  return { x0: level << 12, y0: 0x8000 };
}

// Ширина сетки считается из рамки карты и размера кластера — без выборки:
//   W = ceil((x1 − x0) / (cellX · 2^potX))
// Совпала с шириной, подобранной по ключам кластеров, на всех 12 уровнях
// (256, 204, 64, 64, 102, 27, 27, 27, 26, 13, 13, 13).
function gridW(h, hd) {
  return Math.ceil((h.frame[2] - h.frame[0]) / (hd.cellX * (1 << hd.potX)));
}

// найти начало таблицы кластеров. Сперва проверяется штатное +1163; если по
// нему записи «чистые», перебор не нужен. Иначе — старый поиск: разгонов
// «чистых» записей много (паддинг из нулей тоже «чистый»), поэтому кандидат
// выбирается по согласию сеточной формулы slot == cy*W + cx.
function locateTable(g, h, L) {
  const b = read(g, L.offset, L.size);
  const end = b.length;
  const potX = b[8], potY = b[9];

  // Штатное начало проверяется не «чистотой» записей (мусорных вариантов в
  // таблице до 0,3 %, и они сбивают любой такой фильтр), а сеточной формулой:
  // если с началом +1163 слоты сходятся с ключами, начало верное.
  // Штатная раскладка (прошивка, FUN_08cb181c): u32 число записей по +1159
  // (= W·H по рамке), затем count × {u32 смещение, u16 размер} и count ×
  // {u16 тайлов в кластере, u16 0}. Сошлось на всех 20 уровнях Европы и Австралии.
  const declared = b.readUInt32BE(TABLE_AT - 4);
  if (declared > 0 && TABLE_AT + declared * 10 <= end) {
    return { b, start: TABLE_AT, count: declared, potX, potY, lowGrid: false, canonical: true };
  }
  if (end > TABLE_AT + 6 && (end - TABLE_AT) % 6 === 0) {
    const count = (end - TABLE_AT) / 6;
    const hd = levelHead(b);
    // делимость count на W не требуется: у L4 в конце таблицы лишние 34 записи
    // (204 байта), назначение которых не установлено, а сетка при этом верна.
    const W = gridW(h, hd);
    const sc = gridScore(g, h, b, TABLE_AT, count, potX, potY, 300, W, keyOrigin(L.i));
    // пустая таблица (ни одного кластера) тоже штатная — проверять нечем,
    // поэтому берём её, но честно помечаем сетку невыверенной
    if (sc.n === 0 || sc.ok / sc.n >= 0.5) {
      return { b, start: TABLE_AT, count, potX, potY, lowGrid: sc.n === 0, canonical: true };
    }
  }

  let byGrid = null, byRun = null;
  for (let s = 80; s < Math.min(2400, end - 24); s++) {
    if ((end - s) % 6 > 5) continue;
    // дешёвый предфильтр: первые 32 записи «чистые» и хотя бы одна — реальный
    // указатель в данные (у истинного начала entry[0] уже указывает в .gd2)
    let cleanHead = true, hasReal = false;
    for (let k = 0; k < 32 && s + k * 6 + 6 <= end; k++) {
      const off = b.readUInt32BE(s + k * 6), sz = b.readUInt16BE(s + k * 6 + 4);
      if (!cleanEntry(off, sz, h.regionEnd, g.total)) { cleanHead = false; break; }
      if (off >= h.regionEnd) hasReal = true;
    }
    if (!cleanHead || !hasReal) continue;
    const count = Math.floor((end - s) / 6);
    // длина чистого разгона (для запасного варианта, когда сетка не сходится)
    let run = 0; for (let o = s; o + 6 <= end; o += 6) { if (!cleanEntry(b.readUInt32BE(o), b.readUInt16BE(o + 4), h.regionEnd, g.total)) break; run++; }
    const sc = gridScore(g, h, b, s, count, potX, potY, 300);
    const frac = sc.n ? sc.ok / sc.n : 0;
    if (!byGrid || frac > byGrid.frac) byGrid = { start: s, count, frac };
    if (!byRun || run > byRun.run) byRun = { start: s, count, run };
  }
  // L0 — правильная глобальная сетка (slot=cy*W+cx). Грубые уровни, похоже,
  // обрезаны по рамке данных (иное начало отсчёта): сетка не сходится — тогда
  // берём таблицу по самому длинному чистому разгону и честно помечаем lowGrid.
  if (byGrid && byGrid.frac >= 0.5) return { b, start: byGrid.start, count: byGrid.count, potX, potY, lowGrid: false };
  if (byRun && byRun.run > 50) return { b, start: byRun.start, count: byRun.count, potX, potY, lowGrid: true };
  return null;
}

// разобрать таблицу кластеров уровня и вывести сетку
function levelGrid(g, h, L) {
  const t = locateTable(g, h, L);
  if (!t) return null;
  const hd = levelHead(t.b);
  const entries = [];
  for (let i = 0; i < t.count; i++) {
    const o = t.start + i * 6;
    entries.push({ off: t.b.readUInt32BE(o), sz: t.b.readUInt16BE(o + 4) });
  }
  const Wc = t.canonical ? gridW(h, hd) : 0;
  const sc = gridScore(g, h, t.b, t.start, t.count, hd.potX, hd.potY, 1500, Wc, keyOrigin(L.i));
  const distinct = new Set(entries.filter(e => e.off >= h.regionEnd && e.off !== sc.emptyOff).map(e => e.off));
  // у штатной таблицы ширина берётся из рамки (не из выборки): так она известна
  // и когда настоящих кластеров в томе всего один-два.
  const W = Wc || sc.W;
  return {
    head: hd, table: t, entries, W, H: W ? Math.floor(t.count / W) : 0,
    gridOk: sc.ok, gridN: sc.n, emptyOff: sc.emptyOff, emptyN: sc.emptyN, realClusters: distinct.size,
    level: L.i, origin: keyOrigin(L.i),
  };
}

// ячейка уровня (x,y) → слот кластера. x,y — как в ключе кластера, вместе с
// добавкой уровня: её снимает keyOrigin.
function slotFor(grid, hd, x, y) {
  const o = grid.origin || { x0: 0, y0: 0 };
  return (((y - o.y0) >> hd.potY) * grid.W) + (((x - o.x0) >> hd.potX));
}


// разобрать один кластер: таблица 19-байтных тайлов (до поиск-таблицы)
function cluster(g, h, off, sz) {
  const b = read(g, off, sz);
  const tiles = [];
  for (let i = 0; i * 19 + 19 <= sz; i++) {
    const r = b.subarray(i * 19, i * 19 + 19);
    const key = r.readUInt32BE(0);
    const x = key & 0xffff, y = key >>> 16;
    const lw = r[5], lh = r[7], toff = r.readUInt32BE(11), tsz = r.readUInt32BE(15);
    // конец таблицы тайлов: запись перестаёт быть правдоподобной
    if (r[4] !== 0 || r[6] !== 0 || lw > 12 || lh > 12 || toff >= g.total || tsz > 0x400000) break;
    tiles.push({ x, y, lw, lh, flag: r[8], attr: r[9], b10: r[10], off: toff, size: tsz, sub: key >>> 28 });
  }
  const searchStart = tiles.length * 19;
  return { tiles, searchStart, searchBytes: sz - searchStart };
}

// заголовок блоба тайла — РОВНО 10 БАЙТ (проверено: у тайлов с одним элементом
// off0 = 36 = 10 + 26 у 2496/2496, а байт +10 у 3000/3000 — головной, 0x4d или 0x1d):
//   +0 u16 off0  +2 u16 off1  +4 u16 off2(≈размер)  +6 u16 счётчик элементов
//   +8 u16 0xE028 (константа-магия)
// поток элементов = [10 .. off0); хвостовые секции S1[off0..off1) S2[off1..off2)
// S3[off2..size) — реестр/имена/строки. Тайл НЕ сжат.
// Прежнее «+14 u16 m_size_daten» было ошибкой чтения: эти байты принадлежат
// первому элементу (служебной рамке), а не заголовку.
const TILE_HEAD = 10;

function tileHeader(g, off, size) {
  const b = read(g, off, TILE_HEAD);
  const off0 = b.readUInt16BE(0), off1 = b.readUInt16BE(2), off2 = b.readUInt16BE(4);
  const count = b.readUInt16BE(6), magic = b.readUInt16BE(8);
  return {
    off0, off1, off2, count, magic,
    geo: [TILE_HEAD, off0], s1: [off0, off1], s2: [off1, off2], s3: [off2, size],
    ok: TILE_HEAD <= off0 && off0 <= off1 && off1 <= off2 && off2 <= size && magic === 0xE028,
  };
}

// ── Привязка координат ─────────────────────────────────────────────────────
//
// Система координат у GDB ОБЩАЯ С XAC (docs/formats/xac.md): равнопромежуточная
// цилиндрическая, долгота = X / 72 000, широта = Y / (40 000 000 / 360). Там
// она выведена по микрогосударствам и проверена на Ватикане с точностью около
// 100 метров.
//
// Отсчёт ячеек идёт ОТ РАМКИ КАРТЫ (шапка +0x14), а не от нуля: прошивка
// считает номер кластера как `(мировая − рамка.min) / (cell << pot)`
// (FUN_08cb2bf4), а начало тайла — как `кластер.x0 + местная_ячейка * cellX`
// (CGdbCluster::berechne_kachel_bereich, FUN_08cafc18). Отсюда
//
//     мировая_x = рамка.x0 + ячейка_x * cellX      долгота = мировая_x / 72 000
//     мировая_y = рамка.y0 + ячейка_y * cellY      широта  = мировая_y / 111 111,1
//
// Прежняя калибровка (`11264 + 93,1·долгота`, `934 + 181,8·широта`) была
// выведена по меткам стран за краем покрытия и рамку не учитывала; по широте
// она ошибалась почти на градус. Сверка на 36 городах Европы: у новой привязки
// у всех 36 в пределах ±0,6° лежит тайл толще 25 КБ (центр города), у прежней —
// у 27, а медиана промаха вдвое меньше (25 км против 50 при размере тайла
// 26×18 км). Средний промах новой: −0,3 км по долготе, +2,3 км по широте.
const CELL_X = 789, CELL_Y = 546;                  // размер ячейки L0 в мировых единицах
const UNITS_PER_LON = 72000, UNITS_PER_LAT = 40000000 / 360;
// рамка набора EJ211 (шапка +0x14). У другого набора она своя, поэтому все
// функции принимают её отдельными аргументами, а эти числа — значения по умолчанию.
const FRAME_X0 = -8978432, FRAME_Y0 = -196608;

// градусы ↔ ячейка уровня (cellX/cellY из заголовка уровня; у L0 — 789/546)
const lonOfCellL = (cx, cellX, fx) => ((fx === undefined ? FRAME_X0 : fx) + cx * (cellX || CELL_X)) / UNITS_PER_LON;
const latOfCellL = (cy, cellY, fy) => ((fy === undefined ? FRAME_Y0 : fy) + cy * (cellY || CELL_Y)) / UNITS_PER_LAT;
const cellOfLon = (lon, cellX, fx) => (lon * UNITS_PER_LON - (fx === undefined ? FRAME_X0 : fx)) / (cellX || CELL_X);
const cellOfLat = (lat, cellY, fy) => (lat * UNITS_PER_LAT - (fy === undefined ? FRAME_Y0 : fy)) / (cellY || CELL_Y);
// короткие формы для L0
const lonOfCell = cx => lonOfCellL(cx, CELL_X);
const latOfCell = cy => latOfCellL(cy, CELL_Y);

// УСТАРЕЛО (18.10): `tilePoints`/`encodePoints` — ранний разбор одного узора,
// оставлен для истории и тестов (писатели gdbwrite/gdbroads сняты). По коду прошивки это МНОГОУГОЛЬНИК (тип 0) с
// атрибутом 0x50 (класс 16 — рамка тайла), а u32 «точки» прошивка читает как
// x:15 бит, y:15 бит и два бита признаков, не как x:u16/y:i16. Настоящий разбор
// потока — `readElements` ниже.
//
// Точки последнего элемента тайла. Проверено на береговой линии Кипра: узор
//   1d <u32 Y> <u8 N> 8f 00 00 00 00   затем ровно N × u32
// где 0x1d — головной байт (X-режим 1 «константа», Y-режим 0xC «читать u32»,
// поле счётчика = 1 → счётчик следующим байтом). Каждый u32 — одна точка:
// старшие 16 бит — x (беззнаковый), младшие — y (ЗНАКОВЫЙ i16). Это сырые
// координаты; в мировые они переводятся сдвигом уровня (см. levelHead):
//     мировая = начало_тайла + (сырая << сдвиг)
// У L0 сдвиг равен нулю, поэтому прежние числа не меняются. Четыре u32 на
// точку — это ширина координаты 16 бит; у грубых уровней заводские тайлы
// бывают и на 12, и на 8 бит (байт +9 записи тайла), такие тут не разбираются.
//
// `lv` — {cellX, cellY, shift} уровня; без него берётся L0.
function tilePoints(g, off, size, tileCellX, tileCellY, lv) {
  const th = tileHeader(g, off, size);
  if (!th.ok) return null;
  const s = read(g, off, size).subarray(TILE_HEAD, th.off0);
  for (let p = 0; p + 11 <= s.length; p++) {
    if (s[p] !== 0x1d) continue;
    const n = s[p + 5];
    // Две встреченные формы одного элемента:
    //   A (L0): после счётчика пять байт «8f 00 00 00 00», дальше ровно N × u32
    //           и элемент кончается вместе с потоком;
    //   B (грубые уровни): после счётчика сразу N × u32, а за ними хвост
    //           ceil(N/4) байт (у кипрского тайла L1: 21 байт на 82 точки и
    //           20 на 80). Что в хвосте — не установлено.
    let start = null;
    if (s.readUInt32BE(p + 1) === 0x50 && s[p + 6] === 0x8f && s.readUInt32BE(p + 7) === 0
        && s.length - (p + 11) === n * 4) start = p + 11;
    else if (s.length - (p + 6) === n * 4 + Math.ceil(n / 4)) start = p + 6;
    if (start === null) continue;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const v = s.readUInt32BE(start + i * 4);
      const x = v >>> 16, y = ((v & 0xffff) << 16) >> 16;   // y — знаковый
      const p2 = { x, y };
      if (tileCellX !== undefined) {
        const cx = (lv && lv.cellX) || CELL_X, cy = (lv && lv.cellY) || CELL_Y;
        const sh = (lv && lv.shift) || 0;
        p2.lon = lonOfCellL(tileCellX + (x * (1 << sh)) / cx, cx);
        p2.lat = latOfCellL(tileCellY + (y * (1 << sh)) / cy, cy);
      }
      pts.push(p2);
    }
    return { at: TILE_HEAD + p, count: n, pointsAt: TILE_HEAD + start, points: pts };
  }
  return null;
}

// Кодирование элемента-ломаной в том же виде, в каком он лежит в карте:
//   1d <u32 yConst> <u8 N> 8f 00 00 00 00   затем N × u32 (x:u16, y:i16)
// Счётчик — один байт, поэтому точек не больше 254 (255 = признак расширенного
// счётчика, он пока не реализован). Обратная операция к `tilePoints`.
function encodePoints(points, yConst = 0x50) {
  if (points.length > 254) throw new Error('точек больше 254 — нужен расширенный счётчик');
  const out = Buffer.alloc(11 + points.length * 4);
  out[0] = 0x1d;
  out.writeUInt32BE(yConst, 1);
  out[5] = points.length;
  out[6] = 0x8f;
  out.writeUInt32BE(0, 7);
  points.forEach((p, i) => {
    const x = p.x & 0xffff, y = p.y & 0xffff;
    out.writeUInt32BE((((x << 16) >>> 0) | y) >>> 0, 11 + i * 4);
  });
  return out;
}

// Round-trip: элемент читается и записывается обратно байт-в-байт?
function roundTrip(g, off, size) {
  const pr = tilePoints(g, off, size);
  if (!pr) return null;
  const th = tileHeader(g, off, size);
  const orig = read(g, off, size).subarray(pr.at, th.off0);
  const again = encodePoints(pr.points, 0x50);
  return { ok: orig.equals(again), bytes: orig.length, count: pr.count };
}

// ── Поток элементов тайла — по коду прошивки ──────────────────────────────
//
// Итератор `CGdbTileElementIterator::next` (FUN_08cb3f90, сброс FUN_08cb3e70)
// и декодер точек FUN_092526f0 (инициализация FUN_09253334, читатели точек
// 0x0925183c / 0x092519a0 / 0x092518a0, читатели ширины 0x0925174c…). Сверено:
// заводской том EJ211 читается до off0 у 100 % выборки на всех 12 уровнях.
//
//   управляющие байты (≥0x80) до головного:
//     0xC0|t   тип: 0 многоугольник, 1 линия, 2 точка (держится до смены; в
//              начале тайла 0)
//     0xE0 b   поле +9 итератора («E0»; в начале тайла 0xFF), 0xE1/0xE2 — +10/+11,
//     0xE3 u16
//     0xA0|d   правка накопителя (d==0 → u16 целиком)
//   многоугольник/линия, головной байт:
//     &3   id: 0 повтор, 1 = 0xFFFF, 2 предыдущий + i16, 3 u32
//     &0xC атрибут: 0 повтор, 4 — байт-индекс, 8 — u16-индекс в таблицу u32
//          (секция S3), 0xC — u32 BE. Младшие 6 бит атрибута — класс.
//     число точек: многоугольник (h>>4)&7, 1 → байт; линия &0x30: 0→2,
//          0x10→3, 0x20→4, 0x30→байт; байт 255 → дальше u16
//     линия, бит 6 — общий доп. блок (FUN_09252288)
//   точки, сжатый путь (байт +10 записи тайла = 0, так у L0):
//     байт: w = &0x1f, формат (b>>5)&3, бит 7 — признак многоугольника
//     якорь: x,y по ширине тайла (байт +9 записи: 8/12/16/24/32)
//     формат 0: n точек по (w + w [+2 бита признаков у многоугольника]) бит,
//               смещения от якоря без знака, старший бит первым
//     формат 1: wx:5, wy:5, первая точка = якорь + (w,w) бит [+2], дальше n−1
//               точек «знак+модуль» (1+wx, 1+wy) [+2] — приращения
//     формат 2: ровно 2 точки, 2w + 2 бита (линия) / 2w + 6 (многоугольник)
//   точки, прямой путь (байт +10 записи = 1, так у L1…L11): без байта формата,
//     n точек по ширине тайла как есть; у многоугольника за ними ceil(n/4) байт
//     признаков, у линии — z-байты, если в атрибуте заданы биты 15–16/30
//   точка (тип 2): атрибут в головном (&0x3f, 0x3d/0x3e/0x3f — расширение),
//     u32 id, одна точка прямым путём.
// Мировая координата = начало тайла + (сырая << сдвиг уровня).

function readBits(b, bit, n) {
  let v = 0;
  for (let i = 0; i < n; i++, bit++) v = v * 2 + ((b[bit >> 3] >> (7 - (bit & 7))) & 1);
  return v;
}

// точка по ширине тайла (FUN_0925174c — 8, 0x0925176e — 12, FUN_080b611c — 16)
function rawPoint(b, p, W) {
  if (W === 8) return [b[p], b[p + 1]];
  if (W === 12) return [b[p] | (b[p + 2] & 0xf) << 8, b[p + 1] | (b[p + 2] >> 4) << 8];
  if (W === 16) return [b.readUInt16BE(p), b.readUInt16BE(p + 2)];
  return [readBits(b, p * 8, W), readBits(b, p * 8 + W, W)];
}

// z-ширина линии: биты 15–16 и 30 атрибута (FUN_09253294 → FUN_092526f0)
function zWidth(attr) {
  const f = (attr >>> 15) & 3;
  return (attr >>> 30) & 1 ? f * 8 + 8 : (f === 3 ? 4 : f);
}

function pointData(b, p, type, n, W, zw, want, simple) {
  if (simple) {
    const tail = type === 1 ? Math.ceil(n * zw / 8) : type === 0 ? Math.ceil(n / 4) : 0;
    const r = { w: W, fmt: 'raw', end: p + (n * W >> 2) + tail };
    if (want) {
      r.pts = [];
      for (let i = 0; i < n; i++) r.pts.push(rawPoint(b, p + i * W / 4, W));
      // признаки многоугольника — по 2 бита на точку, младшие биты байта
      // первыми (FUN_09250f64: значение = байт & 3, затем байт >>= 2)
      if (type === 0) { r.flags = []; const q = p + (n * W >> 2); for (let i = 0; i < n; i++) r.flags.push((b[q + (i >> 2)] >> (2 * (i & 3))) & 3); }
    }
    return r;
  }
  const start = p, h = b[p++];
  if (type === 0 && !(h & 0x80)) throw new Error('многоугольник без признака @' + start);
  if (type === 1 && (h & 0x80)) throw new Error('линия с признаком многоугольника @' + start);
  const w = h & 0x1f, fmt = (h >> 5) & 3;
  const [ax, ay] = rawPoint(b, p, W);
  p += W / 4;
  const bit0 = p * 8, ex = type === 0 ? 2 : 0;
  let nb;
  if (fmt === 0) nb = n * (2 * w + ex);
  else if (fmt === 1) nb = 10 + 2 * w + ex + (n - 1) * (readBits(b, bit0, 5) + readBits(b, bit0 + 5, 5) + 2 + ex);
  else if (fmt === 2) { if (n !== 2) throw new Error('двухточечный формат при n=' + n); nb = 2 * w + (type === 0 ? 6 : 2); }
  else throw new Error('формат упаковки 3 @' + start);
  const r = { w, fmt, anchor: [ax, ay], end: p + Math.ceil(nb / 8) + (type === 1 ? Math.ceil(n * zw / 8) : 0) };
  if (want && fmt === 0) {
    r.pts = [];
    r.flags = [];
    for (let i = 0, bit = bit0; i < n; i++, bit += 2 * w + ex) {
      r.pts.push([ax + readBits(b, bit, w), ay + readBits(b, bit + w, w)]);
      if (ex) r.flags.push(readBits(b, bit + 2 * w, 2));
    }
  } else if (want && fmt === 1) {
    const wx = readBits(b, bit0, 5), wy = readBits(b, bit0 + 5, 5);
    let bit = bit0 + 10, x = ax + readBits(b, bit, w), y = ay + readBits(b, bit + w, w);
    r.flags = ex ? [readBits(b, bit + 2 * w, 2)] : [];
    bit += 2 * w + ex;
    r.pts = [[x, y]];
    for (let i = 1; i < n; i++) {
      const sx = readBits(b, bit, 1), dx = readBits(b, bit + 1, wx); bit += 1 + wx;
      const sy = readBits(b, bit, 1), dy = readBits(b, bit + 1, wy); bit += 1 + wy + ex;
      if (ex) r.flags.push(readBits(b, bit - 2, 2));
      x += sx ? -dx : dx; y += sy ? -dy : dy;
      r.pts.push([x, y]);
    }
  }
  return r;
}

// Разобрать поток элементов блоба тайла. opts: W — ширина координаты (байт +9
// записи тайла), simple — прямой путь (байт +10), points — вернуть точки.
function readElements(blob, opts = {}) {
  const W = opts.W || 16;
  const off0 = blob.readUInt16BE(0), off2 = blob.readUInt16BE(4), cnt = blob.readUInt16BE(6);
  const attrTable = blob.subarray(off2);
  let p = TILE_HEAD, type = 0, id = 0, attr = 0, e9 = 0xff;
  const cntOf = n => { if (n !== -1) return n; n = blob[p++]; if (n === 255) { n = blob.readUInt16BE(p); p += 2; } return n; };
  const els = [];
  for (let k = 0; k < cnt; k++) {
    const ctl = [];
    let c = blob[p++];
    while (c & 0x80) {
      ctl.push(c);
      const g = c & 0xe0;
      if (g === 0xc0) type = c & 0x0f;
      else if (g === 0xe0) {
        if (c === 0xe0) e9 = blob[p++];
        else if (c === 0xe1 || c === 0xe2) p++;
        else if (c === 0xe3) p += 2;
        else throw new Error('управляющий 0x' + c.toString(16) + ' @' + (p - 1));
      } else if (g === 0xa0) { if ((c & 0x1f) === 0) p += 2; }
      else throw new Error('управляющий 0x' + c.toString(16) + ' @' + (p - 1));
      c = blob[p++];
    }
    const el = { at: p - 1, type, ctl, head: c, e9 };
    if (type === 2) {
      let a = c & 0x3f;
      if (a === 0x3e) a = blob[p++];
      else if (a === 0x3f) { a = blob.readUInt16BE(p); p += 2; }
      else if (a === 0x3d) { a = blob.readUIntBE(p, 3); p += 3; }
      el.attr = a; el.cls = a & 0x3f; el.id = blob.readUInt32BE(p); p += 4; el.n = 1;
      if (opts.points) el.pts = [rawPoint(blob, p, W)];
      p += W / 4;
      els.push(el);
      continue;
    }
    if (type > 1) throw new Error('тип элемента ' + type + ' @' + el.at);
    const im = c & 3;
    if (im === 1) id = 0xffff;
    else if (im === 2) { id += blob.readInt16BE(p); p += 2; }
    else if (im === 3) { id = blob.readUInt32BE(p); p += 4; }
    const am = c & 0xc;
    if (am === 4) attr = attrTable.readUInt32BE(blob[p++] * 4);
    else if (am === 8) { attr = attrTable.readUInt32BE(blob.readUInt16BE(p) * 4); p += 2; }
    else if (am === 0xc) { attr = blob.readUInt32BE(p); p += 4; }
    el.id = id; el.attr = attr; el.cls = attr & 0x3f;
    let n;
    if (type === 0) { n = (c >> 4) & 7; n = cntOf(n === 1 ? -1 : n); }
    else {
      const m = c & 0x30;
      n = cntOf(m === 0 ? 2 : m === 0x10 ? 3 : m === 0x20 ? 4 : -1);
      if (c & 0x40) {                     // общий доп. блок линии
        const x = blob[p];
        let len;
        if (x & 0x80) len = 4;
        else if (!(x & 0x40)) len = blob.readUInt16BE(p + 2);
        else { const m2 = (x & 0x20) ? 1 : blob[p + 1]; len = (m2 === 1 ? 1 : 2) + ((x & 8) ? m2 : 2 * m2) + 4 * m2 + 4; }
        p += len;
      }
    }
    el.n = n;
    const r = pointData(blob, p, type, n, W, type === 1 ? zWidth(attr) : 0, opts.points, opts.simple);
    el.w = r.w; el.fmt = r.fmt;
    if (r.anchor) el.anchor = r.anchor;
    if (r.pts) el.pts = r.pts;
    if (r.flags && r.flags.length) el.flags = r.flags;
    p = r.end;
    els.push(el);
  }
  return { els, end: p, off0, ok: p === off0 || cnt === 0 };
}

// ── запись элементов ──────────────────────────────────────────────────────

function bitWriter() {
  const bytes = [];
  let cur = 0, nb = 0;
  return {
    put(v, n) {
      for (let i = n - 1; i >= 0; i--) {
        cur = (cur << 1) | (Math.floor(v / 2 ** i) & 1);
        if (++nb === 8) { bytes.push(cur); cur = 0; nb = 0; }
      }
    },
    done() { if (nb) bytes.push(cur << (8 - nb)); return Buffer.from(bytes); },
  };
}

function writeRaw(x, y, W) {
  if (x < 0 || y < 0 || x >= 2 ** W || y >= 2 ** W) throw new Error('точка ' + x + ',' + y + ' не влезает в ' + W + ' бит');
  if (W === 8) return Buffer.from([x, y]);
  if (W === 12) return Buffer.from([x & 0xff, y & 0xff, (x >> 8) | ((y >> 8) << 4)]);
  if (W === 16) { const b = Buffer.alloc(4); b.writeUInt16BE(x, 0); b.writeUInt16BE(y, 2); return b; }
  const bw = bitWriter(); bw.put(x, W); bw.put(y, W); return bw.done();
}

const bitLen = v => (v <= 0 ? 0 : Math.floor(Math.log2(v)) + 1);

// Точки линии. Сжатый путь (simple=false, как у L0 завода): байт w (бит 7 = 0,
// формат 0), якорь = минимум по x и по y, затем смещения по w бит. Прямой путь:
// точки по ширине тайла как есть. pts — [[x,y]…] в сырых единицах тайла, ≥ 0.
function encodeLinePoints(pts, W = 16, simple = false) {
  if (simple) return Buffer.concat(pts.map(([x, y]) => writeRaw(x, y, W)));
  const ax = Math.min(...pts.map(q => q[0])), ay = Math.min(...pts.map(q => q[1]));
  const w = Math.max(1, ...pts.map(([x, y]) => Math.max(bitLen(x - ax), bitLen(y - ay))));
  if (w > 31) throw new Error('смещение не влезает в 31 бит');
  const bw = bitWriter();
  for (const [x, y] of pts) { bw.put(x - ax, w); bw.put(y - ay, w); }
  return Buffer.concat([Buffer.from([w]), writeRaw(ax, ay, W), bw.done()]);
}

// Линия целиком: головной 0x3d (id 0xFFFF, атрибут u32, число точек байтом)
// или 0x31 (атрибут повторяется). Число точек ≥ 2; 255 и больше — 0xFF + u16.
function encodeLine(pts, attr, opt = {}) {
  if (pts.length < 2 || pts.length > 0xffff) throw new Error('точек в линии: ' + pts.length);
  const parts = [];
  const rep = attr === null || attr === undefined;
  parts.push(Buffer.from([rep ? 0x31 : 0x3d]));
  if (!rep) { const a = Buffer.alloc(4); a.writeUInt32BE(attr >>> 0, 0); parts.push(a); }
  if (pts.length < 255) parts.push(Buffer.from([pts.length]));
  else { const c = Buffer.alloc(3); c[0] = 255; c.writeUInt16BE(pts.length, 1); parts.push(c); }
  parts.push(encodeLinePoints(pts, opt.W || 16, !!opt.simple));
  return Buffer.concat(parts);
}

// Рамка тайла — многоугольник класса 16 (атрибут 0x50) по границе тайла X×Y,
// как у завода. Сжатый путь (L0): 4d 00000050, w=15, якорь 0,0, точки
// (X,0)(X,Y)(0,Y)(0,0) с признаками 3,2,1,0 — у тайла 32×32 ячейки L0 это
// ровно 26 байт общего пустого тайла. Прямой путь (L1…): точки (X,Y)(0,Y)(0,0)
// (X,0) по ширине тайла и байт признаков 0xBB.
function encodeFrame(X, Y, W = 16, simple = false) {
  const head = Buffer.from([0x4d, 0, 0, 0, 0x50]);
  if (simple) {
    return Buffer.concat([head, writeRaw(X, Y, W), writeRaw(0, Y, W), writeRaw(0, 0, W), writeRaw(X, 0, W), Buffer.from([0xbb])]);
  }
  const bw = bitWriter();
  for (const [x, y, f] of [[X, 0, 3], [X, Y, 2], [0, Y, 1], [0, 0, 0]]) { bw.put(x, 15); bw.put(y, 15); bw.put(f, 2); }
  return Buffer.concat([head, Buffer.from([0x8f]), writeRaw(0, 0, W), bw.done()]);
}

// ── многоугольники: треугольники по признакам точек ───────────────────────
//
// Многоугольник с битом 0x40 атрибута (суша 0x5F, море 0x50 и все прочие у
// завода) рисуется ТРЕУГОЛЬНИКАМИ, а не контуром: младший бит признака точки
// (+0x74) ведёт автомат «состояния грани» FUN_09251044, а тип грани по
// состоянию отдаёт FUN_09251ce0 (выгрузка точек — FUN_0924c164, «Illegal
// triangle face state» при запрещённом переходе). Переходы [бит 0, бит 1]:
const FACE = { 0: [7, 5], 1: [7, 5], 2: [7, 5], 3: [11, 9], 4: [7, 5], 5: [6, 11],
               6: [1, 6], 7: [10, 8], 8: [2, 8], 9: [11, 10], 10: [4, 3] };
// Прочитано по данным и сверено разбиением тайла (каждая точка тайла покрыта
// ровно одним треугольником суши или моря — 100 % у прибрежных тайлов L0,
// L1, L3, L4, L11): состояния 5/7 — первая точка нового примитива; 5 → веер
// (6 — продолжение, 1 — последняя точка), 7 + бит 1 → полоса (8, 2 —
// последняя), 7 + бит 0 → список треугольников (10, 3, 9 …, 4 — конец).
// Старший бит признака (+0x78) уходит дальше флагом 0x80 — у суши завода он
// почти всегда 1, у моря чаще 0; смысл (видимость ребра?) — догадка.
function polyTriangles(pts, flags) {
  const out = [];
  let s = 0, prim = [], mode = null, bad = 0;
  for (let i = 0; i < pts.length; i++) {
    const ns = (FACE[s] || [11, 11])[flags[i] & 1];
    if (ns === 11) bad++;
    if (ns === 5 || ns === 7) { prim = [pts[i]]; mode = ns === 5 ? 'fan' : null; }
    else {
      if (prim.length === 1 && mode === null) mode = ns === 8 ? 'strip' : 'list';
      prim.push(pts[i]);
      const n = prim.length;
      if (mode === 'fan' && n >= 3) out.push([prim[0], prim[n - 2], prim[n - 1]]);
      else if (mode === 'strip' && n >= 3) out.push([prim[n - 3], prim[n - 2], prim[n - 1]]);
      else if (mode === 'list' && n % 3 === 0) out.push([prim[n - 3], prim[n - 2], prim[n - 1]]);
    }
    s = ns;
  }
  return { tris: out, illegal: bad };
}

// Многоугольник целиком: головной 0x1D (id 0xFFFF, атрибут u32, число точек
// байтом) или 0x11 (атрибут повторяется); точки — сжатым путём (байт 0x80|w,
// якорь, по w+w бит и 2 бита признака) или прямым (точки по ширине тайла,
// затем признаки по 2 бита, младшие биты байта первыми).
function encodePolygon(pts, flags, attr, opt = {}) {
  const n = pts.length;
  if (n < 3 || n > 0xffff) throw new Error('точек в многоугольнике: ' + n);
  const W = opt.W || 16;
  const rep = attr === null || attr === undefined;
  const parts = [Buffer.from([rep ? 0x11 : 0x1d])];
  if (!rep) { const a = Buffer.alloc(4); a.writeUInt32BE(attr >>> 0, 0); parts.push(a); }
  if (n < 255) parts.push(Buffer.from([n]));
  else { const c = Buffer.alloc(3); c[0] = 255; c.writeUInt16BE(n, 1); parts.push(c); }
  if (opt.simple) {
    parts.push(...pts.map(([x, y]) => writeRaw(x, y, W)));
    const tail = Buffer.alloc(Math.ceil(n / 4));
    flags.forEach((f, i) => { tail[i >> 2] |= (f & 3) << (2 * (i & 3)); });
    parts.push(tail);
  } else {
    const ax = Math.min(...pts.map(q => q[0])), ay = Math.min(...pts.map(q => q[1]));
    const w = Math.max(1, ...pts.map(([x, y]) => Math.max(bitLen(x - ax), bitLen(y - ay))));
    const bw = bitWriter();
    pts.forEach(([x, y], i) => { bw.put(x - ax, w); bw.put(y - ay, w); bw.put(flags[i] & 3, 2); });
    parts.push(Buffer.from([0x80 | w]), writeRaw(ax, ay, W), bw.done());
  }
  return Buffer.concat(parts);
}

// Признаки списка треугольников: бит 0 — [0,0,c, 1,1,c, …], c = 1, пока
// дальше есть треугольник; бит 1 — по образцу завода (суша 0,1,1; море 0).
function listFlags(nTris, edge) {
  const f = [];
  for (let t = 0; t < nTris; t++) {
    const more = t < nTris - 1 ? 1 : 0;
    const b0 = t === 0 ? [0, 0, more] : [1, 1, more];
    const b1 = edge ? [0, 1, 1] : [0, 0, 0];
    for (let k = 0; k < 3; k++) f.push(b0[k] | (b1[k] << 1));
  }
  return f;
}

// ── подписи: реестр S1, строки S2, словарь кластера ───────────────────────
//
// Реестр S1 [off0, off1) — «таблица имён» (итератор FUN_0924f284, разбор в
// пакете CGdbTileElementBag::initNameLists FUN_08cab28c): u16 число записей,
// затем поля с тегом «старшая тетрада — поле, младшая — длина»:
//   0x02 u16  тип щита (0 — имя; 354, 174, 173… — номер дороги)
//   0x16 u32 u16  номер имени (nid) и индекс строки в S2
//   0x21 u8   класс подписи (у линий завода = E0 элемента)
//   0x32 u16  номер элемента в тайле
//   0x41 u8   (не разобрано)
//   0xF0      конец записи: (элемент, текущие поля) — поля держатся до смены
// Строки S2 [off1, off2) — CGdbTile::get_string (FUN_08cac2b8): u16 число,
// затем записи; перед каждой 256-й — длина «сверхблока», перед каждой 16-й —
// длина блока (байт; 255 → u16; у последнего блока/сверхблока 0), запись —
// байт (общий префикс с предыдущей строкой << 5 | длина хвоста; хвост 31 → u16)
// и хвост. Затем CGdbTile::uncompressString (FUN_08cac1e4): каждый байт строки
// с конца сверяется со словарём кластера (FUN_08cb0264): 255 u16 концов
// записей, строки с +510; код 1 → [0, t[0]), код c ≥ 2 → [t[c−2], t[c−1]);
// пустая запись — байт остаётся как есть. Строки — UTF-8, прописные.
function readNames(blob, dict) {
  const off0 = blob.readUInt16BE(0), off1 = blob.readUInt16BE(2), off2 = blob.readUInt16BE(4);
  const recs = [];
  let p = off0;
  if (off1 - off0 >= 2) {
    const cnt = blob.readUInt16BE(p); p += 2;
    const cur = { f02: 0, nid: 0, nameIdx: -1, b21: 0, b41: 0 };
    let el = -1;
    while (p < off1 && recs.length < cnt) {
      const t = blob[p++], hi = t >> 4, lo = t & 15;
      if (t === 0x02) { cur.f02 = blob.readUInt16BE(p); p += 2; }
      else if (t === 0x16) { cur.nid = blob.readUInt32BE(p); cur.nameIdx = blob.readUInt16BE(p + 4); p += 6; }
      else if (t === 0x21) cur.b21 = blob[p++];
      else if (t === 0x32) { el = blob.readUInt16BE(p); p += 2; }
      else if (t === 0x41) cur.b41 = blob[p++];
      else if (hi === 15) { recs.push(Object.assign({ el }, cur)); el = -1; }
      else p += lo;
    }
  }
  const strings = [];
  p = off1;
  if (off2 - off1 >= 2) {
    const cnt = blob.readUInt16BE(p); p += 2;
    let prev = Buffer.alloc(0);
    const len = () => { let L = blob[p++]; if (L === 255) { L = blob.readUInt16BE(p); p += 2; } return L; };
    for (let i = 0; i < cnt; i++) {
      if (i % 256 === 0) len();
      if (i % 16 === 0) len();
      const h = blob[p++];
      let n = h & 0x1f;
      if (n === 0x1f) { n = blob.readUInt16BE(p); p += 2; }
      prev = Buffer.concat([prev.subarray(0, h >> 5), blob.subarray(p, p + n)]);
      p += n;
      strings.push(prev);
    }
  }
  const expand = buf => {
    if (!dict || dict.length < 510) return buf;
    const arr = [...buf];
    const end = i => dict.readUInt16BE(i * 2);
    for (let i = arr.length - 1; i >= 0; i--) {
      const c = arr[i];
      if (!c) continue;
      const a = c === 1 ? 0 : end(c - 2), e = end(c - 1);
      if (e > a) { const rep = [...dict.subarray(510 + a, 510 + e)]; arr.splice(i, 1, ...rep); i += rep.length; }
    }
    return Buffer.from(arr);
  };
  const text = strings.map(b => expand(b).toString('utf8'));
  for (const r of recs) r.text = text[r.nameIdx];
  return { records: recs, strings: text };
}

// Записать подписи: named = [[номер элемента, {text, hi, f02}, E0]…].
// Строки — по возрастанию (hi, текст), nid = hi<<24 | номер; записи реестра
// — по nid, как у завода (там они тоже по возрастанию nid).
function encodeNames(named) {
  if (!named.length) return { s1: Buffer.from([0, 0]), s2: Buffer.from([0, 0]) };
  const keys = new Map();
  for (const [, lb] of named) keys.set(lb.hi + '|' + lb.f02 + '|' + lb.text, lb);
  const uniq = [...keys.values()].sort((a, b) => (a.hi - b.hi) || (a.text < b.text ? -1 : a.text > b.text ? 1 : a.f02 - b.f02));
  const idx = new Map(uniq.map((lb, i) => [lb.hi + '|' + lb.f02 + '|' + lb.text, i]));
  const recs = named.map(([el, lb, e9]) => ({ el, i: idx.get(lb.hi + '|' + lb.f02 + '|' + lb.text), lb, e9 }))
    .sort((a, b) => (a.i - b.i) || (a.el - b.el));
  const s1 = [];
  const u16 = v => [v >> 8 & 0xff, v & 0xff];
  s1.push(...u16(recs.length), 0x02, 0, 0);
  let f02 = 0, b21 = 0, cur = -1;
  for (const r of recs) {
    if (r.lb.f02 !== f02) { s1.push(0x02, ...u16(r.lb.f02)); f02 = r.lb.f02; }
    if (r.i !== cur) {
      const nid = ((r.lb.hi << 24) | (r.i + 1)) >>> 0;
      s1.push(0x16, nid >>> 24, nid >> 16 & 0xff, nid >> 8 & 0xff, nid & 0xff, ...u16(r.i));
      cur = r.i;
    }
    if (r.e9 !== b21) { s1.push(0x21, r.e9 & 0xff); b21 = r.e9; }
    s1.push(0x32, ...u16(r.el), 0xf0);
  }
  // S2: блоки по 16 и сверхблоки по 256 с длинами; префиксное сжатие ≤ 7
  const ents = [];
  let prev = Buffer.alloc(0);
  for (const lb of uniq) {
    const b = Buffer.from(lb.text, 'utf8');
    let pre = 0;
    while (pre < 7 && pre < b.length && pre < prev.length && b[pre] === prev[pre]) pre++;
    const tail = b.subarray(pre);
    ents.push(Buffer.concat([tail.length < 31 ? Buffer.from([pre << 5 | tail.length]) : Buffer.from([pre << 5 | 31, ...u16(tail.length)]), tail]));
    prev = b;
  }
  const lenBytes = L => (L < 255 ? [L] : [255, ...u16(L)]);
  const out = [...u16(ents.length)];
  for (let sb = 0; sb < ents.length; sb += 256) {
    const blocks = [];
    for (let bk = sb; bk < Math.min(sb + 256, ents.length); bk += 16) {
      const body = Buffer.concat(ents.slice(bk, Math.min(bk + 16, ents.length)));
      const last = bk + 16 >= ents.length;
      blocks.push(Buffer.concat([Buffer.from(lenBytes(last ? 0 : body.length)), body]));
    }
    const sbody = Buffer.concat(blocks);
    const lastSb = sb + 256 >= ents.length;
    out.push(...lenBytes(lastSb ? 0 : sbody.length), ...sbody);
  }
  return { s1: Buffer.from(s1), s2: Buffer.from(out) };
}

// Таблица ссылок XAC → GDB (CGdbRefTable, читатель FUN_08cb5cf0, версия тома
// > 0x22; docs/formats/gdb.md, «Таблицы ссылок»). Возвращает уровни: null —
// уровня нет, иначе [{ key, refs: [{ tile, el, a, z, d }] }]; z = −1 — до конца
// линии. Состояние тайла, элемента и ключа — сквозное по уровню, как в коде.
function readRefTable(t) {
  const s8 = b => (b > 127 ? b - 256 : b);
  const nl = t[1], levels = [];
  for (let L = 0; L < nl; L++) {
    let p = t.readUInt16BE(2 + 2 * L);
    if (!p) { levels.push(null); continue; }
    const cnt = t.readUInt16BE(p); p += 2;
    let key = 0x80000000, tile = 0xffffffff, el = 0x80000000, run = 0, hdr = 0, prev = null;
    const out = [];
    for (let k = 0; k < cnt; k++) {
      const fresh = run === 0;
      if (run > 0) run--; else hdr = t[p++];
      if (hdr & 0x80) key += t[p++]; else { key = t.readUIntBE(p, 3); p += 3; }
      if (hdr & 0x40) { if (fresh) run = (hdr & 7) - 1; out.push({ key, refs: prev }); continue; }
      let n = hdr & 7;
      if (n === 7) { n = t[p++]; if (n === 0xff) { n = t.readUInt16BE(p); p += 2; } }
      let bm = null;
      if (n > 3) { const kk = (n + 4) >> 3; bm = t.subarray(p, p + kk); p += kk; }
      const refs = [];
      for (let i = 0; i < n; i++) {
        const b = t[p++], c = b & 0xc0;
        if (c === 0x80) tile = ((tile & 0xffff0000) + s8(t[p++]) * 0x20000 | (tile & 0xffff)) >>> 0;
        else if (c === 0x40) tile = ((tile & 0xffff0000) | ((s8(t[p++]) * 2 + tile) & 0xffff)) >>> 0;
        else if (c === 0xc0) { tile = t.readUInt32BE(p); p += 4; }
        const e = b & 0x38;
        if (e === 0x20) { el = t.readUInt16BE(p); p += 2; }
        else if (e === 0x28) el += s8(t[p++]);
        else if (e === 0x30) el -= 2;
        else if (e === 0x38) el -= 1;
        else el += (b >> 3) & 3;
        let a, z;
        switch (b & 7) {
          case 0: a = 0; z = -1; break;
          case 1: a = 0; z = t[p++]; break;
          case 2: a = t[p++]; z = -1; break;
          case 3: a = t[p] & 15; z = t[p] >> 4; p++; break;
          case 4: a = t[p]; z = t[p + 1]; p += 2; break;
          case 5: a = t.readUInt16BE(p); z = t.readUInt16BE(p + 2); p += 4; if (z === 0) z = -1; break;
          case 6: a = t[p++]; z = a + 1; break;
          default: a = t.readUInt16BE(p); z = a + 1; p += 2;
        }
        const d = i < 3 ? (hdr >> (i + 3)) & 1 : (bm[(i - 3) >> 3] >> ((i - 3) & 7)) & 1;
        refs.push({ tile, el: el & 0xffff, a, z, d });
      }
      prev = refs;
      out.push({ key, refs });
    }
    levels.push(out);
  }
  return levels;
}

module.exports = {
  readElements, readRefTable, readBits, rawPoint, encodeLine, encodeLinePoints, encodeFrame, writeRaw,
  polyTriangles, encodePolygon, listFlags, FACE, readNames, encodeNames,
  openGdb, openBuffer, read, header, levelHead, locateTable, levelGrid, slotFor, cluster,
  tileHeader, tilePoints, encodePoints, roundTrip, lonOfCell, latOfCell,
  CELL_X, CELL_Y, TILE_HEAD, TABLE_AT, LEVEL_SHIFT_AT, FRAME_X0, FRAME_Y0, gridW, keyOrigin,
  cellOfLon, cellOfLat, lonOfCellL, latOfCellL, UNITS_PER_LON, UNITS_PER_LAT,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const optIdx = k => args.indexOf(k);
  const opt = k => { const i = optIdx(k); return i >= 0 ? args[i + 1] : null; };
  const root = dataset.resolveRoot(args.find(a => !a.startsWith('--') && !/^\d/.test(a)));
  const g = openGdb(root);
  const h = header(g);
  console.log('=== GDB ===');
  console.log('тома      :', path.basename(g.p1), g.s1, g.p2 ? '+ ' + path.basename(g.p2) + ' ' + g.s2 : '', ' всего', g.total);
  console.log('сигнатура :', h.sig, ' версия', h.version, ' уровней', h.nLevels);
  console.log('рамка     :', h.frame.join(' '));

  const findArgs = optIdx('--find');
  if (findArgs >= 0) {
    const x = Number(args[findArgs + 1]), y = Number(args[findArgs + 2]);
    const lv = Number(args[findArgs + 3] || 0);
    const gr = levelGrid(g, h, h.levels[lv]);
    console.log('\nмировая ячейка (' + x + ',' + y + ') на L' + lv + ' → слот', slotFor(gr, gr.head, x, y),
      '(cx=' + (x >> gr.head.potX) + ' cy=' + (y >> gr.head.potY) + '), сетка ' + gr.W + '×' + gr.H);
    process.exit(0);
  }

  const clArg = opt('--cluster');
  if (clArg) {
    const [slotS, lvS] = clArg.split(':');
    const lv = Number(lvS || 0), slot = Number(slotS);
    const gr = levelGrid(g, h, h.levels[lv]);
    const e = gr.entries[slot];
    console.log('\n=== L' + lv + ' слот ' + slot + ' (cx=' + (slot % gr.W) + ' cy=' + Math.floor(slot / gr.W) + ') ===');
    console.log('запись: смещение ' + e.off + ' размер ' + e.sz + (e.off === gr.emptyOff ? '  [общий пустой тайл]' : ''));
    if (e.off >= h.regionEnd && e.sz > 0) {
      const c = cluster(g, h, e.off, e.sz);
      console.log('тайлов ' + c.tiles.length + ', поиск-таблица с +' + c.searchStart + ' (' + c.searchBytes + ' б)');
      for (const t of c.tiles.slice(0, 12))
        console.log('  тайл (' + t.x + ',' + t.y + ') 2^' + t.lw + '×2^' + t.lh + ' fl=' + t.flag +
          ' ширина ' + t.attr + ' бит  данные @' + t.off + ' (' + t.size + ' б)');
      if (c.tiles.length > 12) console.log('  … ещё ' + (c.tiles.length - 12));
    }
    process.exit(0);
  }

  const tileArg = opt('--tile');
  if (tileArg) {
    const [offS, szS] = tileArg.split(':');
    const off = Number(offS), size = Number(szS || 65536);
    const t = tileHeader(g, off, size);
    console.log('\n=== тайл @' + off + ' (размер ' + (szS ? size : '?') + ') ===');
    console.log('заголовок: off0=' + t.off0 + ' off1=' + t.off1 + ' off2=' + t.off2 +
      ' элементов=' + t.count + ' магия=0x' + t.magic.toString(16) +
      (t.ok ? '  [ok]' : '  [не сходится]'));
    console.log('секции: поток[' + t.geo[0] + '..' + t.geo[1] + ')=' + (t.geo[1] - t.geo[0]) + 'б  ' +
      'S1[' + t.s1[0] + '..' + t.s1[1] + ')=' + (t.s1[1] - t.s1[0]) + '  ' +
      'S2[' + t.s2[0] + '..' + t.s2[1] + ')=' + (t.s2[1] - t.s2[0]) + '  ' +
      'S3[' + t.s3[0] + '..' + t.s3[1] + ')=' + (t.s3[1] - t.s3[0]));
    const b = read(g, off, Math.min(size, 48));
    console.log('первые байты потока (@+10): ' + b.subarray(TILE_HEAD, Math.min(b.length, 48)).toString('hex'));
    const cellArg = opt('--cell');
    // --level N: без него координаты переводятся по L0 (сдвиг 0)
    const lvArgT = opt('--level');
    const lvT = lvArgT == null ? null : levelHead(read(g, h.levels[Number(lvArgT)].offset, 100));
    if (lvT) console.log('уровень L' + lvArgT + ': ячейка ' + lvT.cellX + '×' + lvT.cellY + ', сдвиг ' + lvT.shift);
    const pr = cellArg
      ? tilePoints(g, off, size, Number(cellArg.split(',')[0]), Number(cellArg.split(',')[1]), lvT)
      : tilePoints(g, off, size);
    if (pr) {
      console.log('\nточки последнего элемента: ' + pr.count + ' шт, узор @+' + pr.at + ', данные @+' + pr.pointsAt);
      for (const q of pr.points.slice(0, 20))
        console.log('  x=' + String(q.x).padStart(6) + ' y=' + String(q.y).padStart(7) +
          (q.lon !== undefined ? '   ' + q.lon.toFixed(4) + '°E ' + q.lat.toFixed(4) + '°N' : ''));
      if (pr.points.length > 20) console.log('  … ещё ' + (pr.points.length - 20));
    } else console.log('\nточки: узор последнего элемента не распознан');
    process.exit(0);
  }

  const lvArg = opt('--level');
  const list = lvArg != null ? [h.levels[Number(lvArg)]] : h.levels;
  console.log('\n=== уровни (таблица кластеров = регулярная сетка W×H, слот = cy*W+cx) ===');
  for (const L of list) {
    const gr = levelGrid(g, h, L);
    if (!gr) { console.log('  L' + L.i + ' @' + L.offset + ': таблица не найдена'); continue; }
    const grid = gr.table.lowGrid ? '(обрезан по данным, сетка не сходится)' : 'сетка ' + gr.W + '×' + gr.H + ' slot=cy·W+cx ' + gr.gridOk + '/' + gr.gridN;
    console.log('  L' + String(L.i).padStart(2),
      'ячейка ' + String(gr.head.cellX).padStart(7) + '×' + String(gr.head.cellY).padEnd(7),
      'кластер 2^' + gr.head.potX + '×2^' + gr.head.potY,
      ' сдвиг ' + String(gr.head.shift).padStart(2),
      ' таблица @+' + String(gr.table.start).padStart(4) + '×' + String(gr.table.count).padStart(5),
      ' реальных ' + String(gr.realClusters).padStart(5) + ' пустых ' + String(gr.emptyN).padStart(5),
      ' ' + grid);
  }
}
