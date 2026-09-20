// Читатель контейнера Lit\x02 — база POI (модули isdb\lit: loader, main, access, poitiles).
// Раскладка заголовка и арифметика каталога взяты из CISGdbLitMainDirectory::openLit
// (FUN_08cc4f58): магия 0x4C697402, подзаголовок 'TTD\0', версия = u16@4 + 11.
'use strict';
const fs = require('fs');
const path = require('path');

const MAGIC = 0x4c697402;

function findMagic(fd) {                       // заголовок лежит внутри обёртки FLDB
  const b = Buffer.alloc(8192);
  fs.readSync(fd, b, 0, b.length, 0);
  const i = b.indexOf(Buffer.from([0x4c, 0x69, 0x74, 0x02]));
  if (i < 0) throw new Error('магия Lit\\x02 не найдена');
  return i;
}

function readHeader(fd) {
  const at = findMagic(fd);
  const h = Buffer.alloc(0x60);
  fs.readSync(fd, h, 0, h.length, at);
  if (h.readUInt32BE(0) !== MAGIC) throw new Error('не Lit\\x02');
  const version = h.readUInt16BE(4) + 11;      // uVar13 = sVar7 + 0xb
  if (version < 3 || version > 13) throw new Error('версия ' + version + ' вне 3..13');
  // при version > 12 заголовок на два байта длиннее (ветка `if (0xc < uVar13)`)
  const recAt = version > 12 ? 81 : 79;
  return {
    at, version,
    timestamp: h.readUInt32BE(8),
    ttd:   h.readUInt32BE(56),                 // подзаголовок 'TTD\0'
    base:  h.readUInt32BE(68),                 // начало каталога
    count: h.readUInt32BE(72),                 // число блоков
    fieldOff:   h[76],                         // смещение поля внутри записи
    fieldWidth: h[77],                         // ширина поля, байт
    sizeWidth:  h[78],
    recSize:    h[recAt],
  };
}

// Тома LIT — один сквозной адрес: L1 .. L4 подряд, как .gdb + .gd2 у GDB.
// Но в адресное пространство входит НЕ весь том: файл добит нулями до кратности
// 2048, и добивка адресов не занимает. См. fixSeams.
function openVolumes(dirs, skip) {
  let acc = 0;
  return dirs.map((d) => {
    const name = fs.readdirSync(d).find((n) => /\.(db|PIT)$/i.test(n));
    const file = path.join(d, name);
    const fd = fs.openSync(file, 'r');
    // данные тома начинаются там же, где заголовок первого (обёртка FLDB; у PIT её нет)
    const len = fs.statSync(file).size - skip;
    const v = { file, fd, skip, start: acc, end: acc + len, size: len };
    acc += len;
    return v;
  });
}

// Точные швы между томами.
//
// Наивная склейка «размер файла минус обёртка» ошибается на добивку: у тома 1
// это 1436 нулевых байт, и блок 53404 попадал ровно в них, а за швом лежал
// нетронутый заголовок блока. Разошлось всё, что дальше, — 191 тысяча блоков
// из 245 518, и это выглядело как «другой формат без заголовка».
//
// Шов вычисляется из самого каталога, гадать не нужно. Блок физически лежит
// в одном файле, значит шов обязан совпасть с началом какого-то блока. А
// добивка меньше 2048, значит шов лежит в окне последних 2048 адресов тома.
// На всех трёх швах в это окно попадает ровно по одному началу блока —
// проверка сходится сама с собой, добивки выходят 1436, 962 и 1690 байт.
function fixSeams(vols, cat) {
  const offs = cat.map((e) => e.off);              // каталог монотонен, без разрывов
  const startsIn = (lo, hi) => {                   // начала блоков в (lo, hi]
    let a = 0, b = offs.length - 1, p = offs.length;
    while (a <= b) { const m = (a + b) >> 1; if (offs[m] > lo) { p = m; b = m - 1; } else a = m + 1; }
    const out = [];
    for (let i = p; i < offs.length && offs[i] <= hi; i++) out.push(offs[i]);
    return out;
  };
  let acc = 0;
  for (let k = 0; k < vols.length; k++) {
    vols[k].start = acc;
    let len = vols[k].size;                        // последний том обрезать не по чему
    if (k < vols.length - 1) {
      const c = startsIn(acc + len - 2048, acc + len);
      if (c.length !== 1) throw new Error('шов тома ' + (k + 1) + ': кандидатов ' + c.length);
      len = c[0] - acc;
    }
    vols[k].end = acc + len;
    vols[k].pad = vols[k].size - len;
    acc += len;
  }
  return vols;
}

function makeReader(vols) {
  return function read(off, n) {               // сквозное чтение через границы томов
    const out = Buffer.alloc(n);
    let done = 0;
    while (done < n) {
      const pos = off + done;
      const v = vols.find((x) => pos >= x.start && pos < x.end);
      if (!v) throw new Error('смещение ' + pos + ' вне томов');
      const take = Math.min(n - done, v.end - pos);
      fs.readSync(v.fd, out, done, take, v.skip + (pos - v.start));
      done += take;
    }
    return out;
  };
}

// Каталог: count записей по recSize байт. В записи — смещение блока (fieldWidth
// байт, big-endian) и следом его размер (sizeWidth байт). Блоки идут вплотную.
function readCatalog(read, h) {
  const raw = read(h.base, h.count * h.recSize);
  const out = new Array(h.count);
  for (let i = 0; i < h.count; i++) {
    const p = i * h.recSize + h.fieldOff;
    out[i] = {
      off:  Number(raw.readUIntBE(p, h.fieldWidth)),
      size: raw.readUIntBE(p + h.fieldWidth, h.sizeWidth),
    };
  }
  return out;
}

function open(dirs) {
  const probe = openVolumes(dirs, 0);
  const h = readHeader(probe[0].fd);
  probe.forEach((v) => fs.closeSync(v.fd));
  const vols = openVolumes(dirs, h.at);
  const read = makeReader(vols);
  // Каталог целиком лежит в первом томе (до 1 726 890 при томе на 2 ГБ),
  // поэтому читается ещё по наивным границам, а потом уточняет их сам.
  const cat = readCatalog(read, h);
  if (vols.length > 1) fixSeams(vols, cat);
  return { header: h, vols, read, catalog: () => cat,
           block: (e) => read(e.off, e.size) };
}

module.exports = { open, readHeader, MAGIC };
