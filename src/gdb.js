'use strict';
// Контейнер GDB (карта для отрисовки): EJ211_v37a.gdb + EJ211_v37a.gd2 — один
// логический файл, смещения 40-битные и сквозные, .gd2 начинается там, где
// кончается .gdb. Раскладка — из раздела README «GDB и GDB2 — устройство»:
//
//   шапка   0x00 u32 сигнатура DEADBEEF   0x04 u32 версия (37)
//           0x14 4×i32 рамка?            0x24 u32 число уровней
//           0x2D таблица уровней: пары (смещение u32, размер u32)
//   уровень два u32 размера ячейки, два байта глубины, u32 масштаб от, u32 до
//   за таблицей уровней — каталог из двух записей по 32 байта (растр занятости
//           19022002 и 37 КБ неизвестного), затем каталог блоков — пары
//           (смещение, размер), 44 747 штук
//   индекс  с 0x13F68E02 до конца — поток записей по 19 байт:
//           u16 kx  u16 ky  u16 глубX  u16 глубY  u16 0x0010  u40 смещ  u32 размер
//   блок    три u16 смещения частей (третье = размер блока), u16 счётчик
//
// Все числа — BIG-endian (как в XAC): сигнатура DEADBEEF, версия 0x25, и
// рамка 0x14..0x20 совпадает с README только при BE-чтении. Инструмент читает и проверяет
// то, что известно, и печатает сводку; записывать пока не умеет.
//
//   node src/gdb.js [каталог набора]          сводка: шапка, уровни, каталог, индекс
//   node src/gdb.js ... --index N             показать N первых записей индекса
//   node src/gdb.js ... --block <смещение>    заголовок блока по 40-битному смещению

const fs = require('fs');
const path = require('path');
const dataset = require('./dataset');

const INDEX_START = 0x13F68E02;
const REC = 19;

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

// чтение по сквозному 40-битному смещению, с переходом через границу томов
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
  const nLevels = b[0x24]; // u8: 12 у Европы, 8 у Австралии
  const levels = [];
  for (let i = 0; i < nLevels; i++) {
    const o = 0x2D + i * 8;
    levels.push({ i, offset: b.readUInt32BE(o), size: b.readUInt32BE(o + 4) });
  }
  return { sig, version, frame, nLevels, levels, levelTableEnd: 0x2D + nLevels * 8 };
}

function level(g, lv) {
  const b = read(g, lv.offset, Math.min(lv.size, 64));
  return {
    cellX: b.readUInt32BE(0), cellY: b.readUInt32BE(4),
    depthX: b[8], depthY: b[9],
    scaleFrom: b.readUInt32BE(10), scaleTo: b.readUInt32BE(14),
  };
}

// каталог из двух записей по 32 байта за таблицей уровней, затем каталог блоков
function catalogs(g, h) {
  const at = h.levelTableEnd;
  const two = read(g, at, 64);
  const raster = { offset: two.readUInt32BE(0), size: two.readUInt32BE(4), raw: two.subarray(0, 32) };
  const second = { offset: two.readUInt32BE(32), size: two.readUInt32BE(36), raw: two.subarray(32, 64) };
  // каталог блоков: пары (u32 смещение, u32 размер) до первого блока данных.
  // Число пар в README — 44 747; считаем до тех пор, пока пары остаются
  // правдоподобными (смещение в пределах тома или нулевое).
  const start = at + 64;
  const chunk = read(g, start, 44747 * 8 + 4096);
  let pairs = 0, nonEmpty = 0, bytes = 0, first = null, last = null;
  for (let o = 0; o + 8 <= chunk.length; o += 8) {
    const off = chunk.readUInt32BE(o), sz = chunk.readUInt32BE(o + 4);
    if (off === 0 && sz === 0) { pairs++; continue; }
    if (off < start || off > g.total || sz > 64 * 1024 * 1024) break;
    pairs++; nonEmpty++; bytes += sz;
    if (first === null) first = off; last = off + sz;
  }
  return { raster, second, blockCatalog: { start, pairs, nonEmpty, bytes, first, last } };
}

// поток записей индекса по 19 байт
function* indexRecords(g, limit) {
  const CH = 1 << 20;
  let pos = INDEX_START, n = 0;
  let carry = Buffer.alloc(0);
  while (pos < g.total && (limit === undefined || n < limit)) {
    const want = Math.min(CH, g.total - pos);
    const buf = Buffer.concat([carry, read(g, pos, want)]);
    let o = 0;
    for (; o + REC <= buf.length; o += REC) {
      const r = {
        at: pos - carry.length + o,
        kx: buf.readUInt16BE(o), ky: buf.readUInt16BE(o + 2),
        dx: buf.readUInt16BE(o + 4), dy: buf.readUInt16BE(o + 6),
        tag: buf.readUInt16BE(o + 8),
        offset: buf.readUIntBE(o + 10, 5),
        size: buf.readUInt32BE(o + 15),
      };
      yield r; n++;
      if (limit !== undefined && n >= limit) return;
    }
    carry = buf.subarray(o);
    pos += want;
  }
}

function blockHeader(g, off) {
  const b = read(g, off, 16);
  return { parts: [b.readUInt16BE(0), b.readUInt16BE(2), b.readUInt16BE(4)], count: b.readUInt16BE(6), raw: b };
}

module.exports = { openGdb, read, header, level, catalogs, indexRecords, blockHeader, INDEX_START, REC };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const root = dataset.resolveRoot(args.find(a => !a.startsWith('--') && !/^\d/.test(a)));
  const g = openGdb(root);
  const h = header(g);
  console.log('=== GDB ===');
  console.log('тома      :', path.basename(g.p1), g.s1, g.p2 ? '+ ' + path.basename(g.p2) + ' ' + g.s2 : '', ' всего', g.total);
  console.log('сигнатура :', h.sig, ' версия', h.version, ' уровней', h.nLevels);
  console.log('рамка?    :', h.frame.join(' '));
  console.log('\n=== уровни ===');
  for (const lv of h.levels) {
    const L = level(g, lv);
    console.log('  L' + String(lv.i).padStart(2), 'ячейка', String(L.cellX).padStart(7) + ' × ' + String(L.cellY).padEnd(7),
      'глуб', L.depthX + '/' + L.depthY, ' масштаб', String(L.scaleFrom).padStart(9), '..', L.scaleTo === 0xFFFFFFFF ? '∞' : L.scaleTo,
      ' @' + lv.offset + ' (' + lv.size + ' б)');
  }
  // Шапка и уровни разобраны и сходятся с эталоном. Каталог блоков и индекс
  // (смещение 0x13F68E02, 44747 пар из «первого взгляда») в этом файле НЕ
  // воспроизводятся и требуют переопределения — печатаем только по флагу.
  console.log('\n=== каталог/индекс: не переопределены (см. README, фаза GDB) ===');
  const showCat = opt('--catalog');
  if (showCat) {
    const c = catalogs(g, h);
    console.log('растр занятости : @' + c.raster.offset + ' размер ' + c.raster.size);
    console.log('каталог блоков  : пар ' + c.blockCatalog.pairs + ', непустых ' + c.blockCatalog.nonEmpty);
  }
  const showIdx = opt('--index');
  if (showIdx) {
    console.log('\n=== индекс: первые ' + showIdx + ' записей с ' + INDEX_START + ' ===');
    for (const r of indexRecords(g, Number(showIdx)))
      console.log('  kx', String(r.kx).padStart(5), 'ky', String(r.ky).padStart(5), 'глуб', r.dx + '/' + r.dy,
        'tag', r.tag.toString(16), ' блок @' + r.offset + ' (' + r.size + ' б)');
  } else {
    let n = 0, big = 0, tags = new Map(), depths = new Map(), maxOff = 0;
    for (const r of indexRecords(g)) {
      n++; if (r.size > 1024) big++; tags.set(r.tag, (tags.get(r.tag) || 0) + 1);
      const d = r.dx + '/' + r.dy; if (depths.size < 2000) depths.set(d, (depths.get(d) || 0) + 1);
      if (r.offset > maxOff) maxOff = r.offset;
    }
    console.log('\n=== индекс ===');
    console.log('записей', n, '(ожидается 629 031), с блоком > 1 КБ:', big, '(ожидается 321)');
    console.log('теги   :', [...tags].map(([k, v]) => '0x' + k.toString(16) + '×' + v).join('  '));
    console.log('глубины:', [...depths].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + '×' + v).join('  '));
    console.log('макс. смещение блока', maxOff, ' (том .gdb кончается на', g.s1 + ')');
  }
  const blk = opt('--block');
  if (blk) {
    const bh = blockHeader(g, Number(blk));
    console.log('\n=== блок @' + blk + ' ===');
    console.log('части', bh.parts.join(' '), ' счётчик', bh.count, ' сырое', bh.raw.toString('hex'));
  }
}
