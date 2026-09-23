'use strict';
// Контейнер `LIT`/`PIT` целиком: заголовок, грамматика, каталог, блоки.
//
//   node src/litfile.js              разбор PIT и обратная сборка
//   node src/litfile.js --lit        то же для первого тома LIT (только разбор)
//
// Зачем. `src/lit.js` читает контейнер, `src/litblock.js` собирает блок, но
// собрать САМ ФАЙЛ мы не умели — а без этого кипрский `LIT` обречён оставаться
// заводским томом на 2,1 ГБ с нашими заплатами в чужих слотах. Цель — свой
// контейнер только с кипрскими блоками (см. README).
//
// ── Раскладка файла ───────────────────────────────────────────────────────
// Она вся выводится из заголовка, разобранного по `CISGdbLitMainDirectory::openLit`
// (`FUN_08cc4f58`), и сходится без остатка:
//
//   [0 … +0x38)        заголовок: магия `Lit\\x02`, версия, время сборки
//   [ttd … base)       грамматика `TTD` — та самая схема, которой читаются блоки
//   [base … base+N·R)  каталог: на блок смещение (fieldWidth байт) и размер
//                      (sizeWidth байт), запись длиной recSize
//   [первый блок … )   блоки подряд, без дыр и нахлёстов
//
// У `PIT` это 368 + 7896 + 4302 + блоки = 8 869 262 байта, ровно размер файла;
// дыр 0, нахлёстов 0, последний блок кончается на последнем байте файла.
//
// Ширины полей каталога объявлены в самом заголовке, поэтому от объёма файла
// они и зависят: у `PIT` смещение в 4 байта, у `LIT` — в 5, потому что его
// адресное пространство сквозное через четыре тома и доходит до 7 ГБ.
//
// Грамматика от покрытия не зависит и переносится как есть: это описание
// формата, а не данные.

const fs = require('fs');
const lit = require('./lit');

const MAGIC = lit.MAGIC;
const F = {                      // поля заголовка (смещения от начала заголовка)
  version: 4, timestamp: 8, ttd: 56, base: 68, count: 72,
  fieldOff: 76, fieldWidth: 77, sizeWidth: 78,
};
const recSizeAt = (version) => (version > 12 ? 81 : 79);

// Разобрать контейнер, лежащий в буфере (без обёртки FLDB).
function read(buf) {
  if (buf.readUInt32BE(0) !== MAGIC) throw new Error('не Lit\\x02');
  const version = buf.readUInt16BE(F.version) + 11;
  const h = {
    version,
    timestamp: buf.readUInt32BE(F.timestamp),
    ttd: buf.readUInt32BE(F.ttd),
    base: buf.readUInt32BE(F.base),
    count: buf.readUInt32BE(F.count),
    fieldOff: buf[F.fieldOff], fieldWidth: buf[F.fieldWidth], sizeWidth: buf[F.sizeWidth],
    recSize: buf[recSizeAt(version)],
  };
  const catalog = new Array(h.count);
  for (let i = 0; i < h.count; i++) {
    const p = h.base + i * h.recSize + h.fieldOff;
    catalog[i] = { off: Number(buf.readUIntBE(p, h.fieldWidth)),
                   size: buf.readUIntBE(p + h.fieldWidth, h.sizeWidth) };
  }
  return { header: h, head: buf.subarray(0, h.ttd), ttd: buf.subarray(h.ttd, h.base),
           catalog, blocks: catalog.map((e) => buf.subarray(e.off, e.off + e.size)) };
}

// Наименьшая ширина, которой хватит на значение.
function widthFor(v) {
  let w = 1;
  while (v >= Math.pow(2, 8 * w)) w++;
  return w;
}

// Собрать контейнер из заголовка-образца, грамматики и блоков.
//
// Ширины полей каталога подбираются под размер файла, если не заданы явно.
// Смещения блоков считаются от начала файла, блоки кладутся подряд.
function build(spec) {
  const head = Buffer.from(spec.head);
  const ttd = Buffer.from(spec.ttd);
  const blocks = spec.blocks;
  const version = spec.version === undefined ? head.readUInt16BE(F.version) + 11 : spec.version;

  const sizeWidth = spec.sizeWidth || widthFor(Math.max(1, ...blocks.map((b) => b.length)));
  const base = head.length + ttd.length;
  // Ширина смещения зависит от размера файла, а он — от ширины. Подбираем вверх.
  let fieldWidth = spec.fieldWidth || 1;
  for (;;) {
    const recSize = fieldWidth + sizeWidth;
    const end = base + blocks.length * recSize + blocks.reduce((a, b) => a + b.length, 0);
    if (fieldWidth >= widthFor(end)) break;
    if (spec.fieldWidth) throw new Error('заданной ширины смещения не хватает на ' + end);
    fieldWidth++;
  }
  const recSize = fieldWidth + sizeWidth;

  head.writeUInt32BE(spec.ttdOffset === undefined ? head.length : spec.ttdOffset, F.ttd);
  head.writeUInt32BE(base, F.base);
  head.writeUInt32BE(blocks.length, F.count);
  head[F.fieldOff] = 0;
  head[F.fieldWidth] = fieldWidth;
  head[F.sizeWidth] = sizeWidth;
  head[recSizeAt(version)] = recSize;
  if (spec.timestamp !== undefined) head.writeUInt32BE(spec.timestamp, F.timestamp);

  const cat = Buffer.alloc(blocks.length * recSize);
  let off = base + cat.length;
  blocks.forEach((b, i) => {
    cat.writeUIntBE(off, i * recSize, fieldWidth);
    cat.writeUIntBE(b.length, i * recSize + fieldWidth, sizeWidth);
    off += b.length;
  });

  return Buffer.concat([head, ttd, cat, ...blocks]);
}

module.exports = { read, build, widthFor, F, MAGIC };

if (require.main === module) {
  const path = require('path');
  const useLit = process.argv.includes('--lit');
  const file = useLit ? 'maps/pkgdb/LIT/EJ211Ga_L1.db' : 'maps/pkgdb/PIT/EJ211a.PIT';
  const raw = fs.readFileSync(file);
  const at = raw.indexOf(Buffer.from([0x4c, 0x69, 0x74, 0x02]));   // обёртка FLDB у LIT
  const buf = raw.subarray(at);
  const m = read(buf);
  const h = m.header;

  console.log(path.basename(file) + ': версия ' + h.version + ', блоков ' + h.count);
  console.log('заголовок ' + h.ttd + ' б, грамматика ' + (h.base - h.ttd) +
              ' б, каталог ' + (h.count * h.recSize) + ' б (запись ' + h.recSize +
              ': смещение ' + h.fieldWidth + ' + размер ' + h.sizeWidth + ')');
  const last = m.catalog[h.count - 1];
  console.log('блоки: первый @' + m.catalog[0].off + ', последний кончается на ' +
              (last.off + last.size) + ' из ' + buf.length + ' байт');
  let gaps = 0, over = 0;
  for (let i = 0; i + 1 < h.count; i++) {
    const d = m.catalog[i + 1].off - (m.catalog[i].off + m.catalog[i].size);
    if (d > 0) gaps++; else if (d < 0) over++;
  }
  console.log('дыр ' + gaps + ', нахлёстов ' + over);

  if (useLit) {                       // том 1 — часть сквозного адреса, сборка бессмысленна
    console.log('(первый том LIT: блоки за его границей лежат в других томах, обратной сборки нет)');
    process.exit(0);
  }
  const again = build({ head: m.head, ttd: m.ttd, blocks: m.blocks,
                        fieldWidth: h.fieldWidth, sizeWidth: h.sizeWidth });
  console.log('обратная сборка: ' + (again.equals(buf) ? 'байт в байт' : 'РАСХОЖДЕНИЕ') +
              ' (' + again.length + ' из ' + buf.length + ')');
  process.exit(again.equals(buf) ? 0 : 1);
}
