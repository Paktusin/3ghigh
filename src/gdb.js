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
  const out = Buffer.alloc(len);
  let done = 0;
  while (done < len) {
    const at = off + done;
    if (at < g.s1) {
      const n = Math.min(len - done, g.s1 - at);
      fs.readSync(g.fd1, out, done, n, at); done += n;
    } else {
      if (!g.fd2) throw new Error('смещение ' + at + ' за концом .gdb, а .gd2 нет');
      const n = len - done;
      fs.readSync(g.fd2, out, done, n, at - g.s1); done += n;
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

// заголовок уровня: размер ячейки и число бит на кластер
function levelHead(b) {
  return { cellX: b.readUInt32BE(0), cellY: b.readUInt32BE(4), potX: b[8], potY: b[9] };
}

// запись таблицы кластеров считается «чистой», если это пустой маркер или
// правдоподобный указатель в область данных (.gdb-хвост или .gd2)
function cleanEntry(off, sz, regionEnd, total) {
  if (off === 0 || off === 16) return true;                       // пустой слот
  if (off >= regionEnd && off < total && sz > 0 && sz <= 0x10000) return true; // тайлы
  return false;
}

// вывести ширину сетки W из ключей реальных кластеров и долю согласия
// slot == cy*W + cx. Возвращает {W, ok, n}. Пустые/общий тайл пропускаются.
function gridScore(g, h, b, start, count, potX, potY, sampleMax) {
  const pts = [];
  const share = new Map();
  for (let i = 0; i < count; i++) {
    const off = b.readUInt32BE(start + i * 6);
    if (off >= h.regionEnd) share.set(off, (share.get(off) || 0) + 1);
  }
  let emptyOff = 0, emptyN = 0;
  for (const [o, c] of share) if (c > emptyN) { emptyN = c; emptyOff = o; }
  for (let i = 0; i < count && pts.length < (sampleMax || 1500); i++) {
    const off = b.readUInt32BE(start + i * 6);
    if (off < h.regionEnd || off === emptyOff) continue;
    const key = read(g, off, 4).readUInt32BE(0);
    pts.push({ i, cx: (key & 0xffff) >> potX, cy: (key >>> 16) >> potY });
  }
  let W = 0;
  for (let a = 0; a < pts.length && !W; a++)
    for (let b2 = a + 1; b2 < pts.length; b2++)
      if (pts[b2].cy !== pts[a].cy) {
        const w = Math.round((pts[b2].i - pts[a].i - (pts[b2].cx - pts[a].cx)) / (pts[b2].cy - pts[a].cy));
        if (w > 0) { W = w; break; }
      }
  let ok = 0; for (const p of pts) if (W && p.cy * W + p.cx === p.i) ok++;
  return { W, ok, n: pts.length, emptyOff, emptyN };
}

// найти начало таблицы кластеров. Разгонов «чистых» записей много (паддинг
// из нулей тоже «чистый»), поэтому кандидат выбирается по согласию сеточной
// формулы slot == cy*W + cx — она однозначно ловит верное выравнивание.
function locateTable(g, h, L) {
  const b = read(g, L.offset, L.size);
  const end = b.length;
  const potX = b[8], potY = b[9];
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
  const sc = gridScore(g, h, t.b, t.start, t.count, hd.potX, hd.potY, 1500);
  const distinct = new Set(entries.filter(e => e.off >= h.regionEnd && e.off !== sc.emptyOff).map(e => e.off));
  return {
    head: hd, table: t, entries, W: sc.W, H: sc.W ? Math.round(t.count / sc.W) : 0,
    gridOk: sc.ok, gridN: sc.n, emptyOff: sc.emptyOff, emptyN: sc.emptyN, realClusters: distinct.size,
  };
}

// мировая ячейка (x,y) → слот кластера на уровне
function slotFor(grid, hd, x, y) {
  return (y >> hd.potY) * grid.W + (x >> hd.potX);
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
    tiles.push({ x, y, lw, lh, flag: r[8], attr: r[9], off: toff, size: tsz, sub: key >>> 28 });
  }
  const searchStart = tiles.length * 19;
  return { tiles, searchStart, searchBytes: sz - searchStart };
}

module.exports = { openGdb, read, header, levelHead, locateTable, levelGrid, slotFor, cluster };

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
        console.log('  тайл (' + t.x + ',' + t.y + ') 2^' + t.lw + '×2^' + t.lh + ' fl=' + t.flag + ' attr=' + t.attr.toString(16) + ' данные @' + t.off + ' (' + t.size + ' б)');
      if (c.tiles.length > 12) console.log('  … ещё ' + (c.tiles.length - 12));
    }
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
      ' таблица @+' + String(gr.table.start).padStart(4) + '×' + String(gr.table.count).padStart(5),
      ' реальных ' + String(gr.realClusters).padStart(5) + ' пустых ' + String(gr.emptyN).padStart(5),
      ' ' + grid);
  }
}
