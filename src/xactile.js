'use strict';
// Сборка файла тайла `.xac` из разделов.
//
// Файл — это просто разделы подряд, без оглавления: имя 16 байт, u32 BE длины
// полезной части, сама часть; полный размер раздела = длина + 20. Первым идёт
// `XAC HEADER` (196 байт), он же описывает файл. Проверено: разделы покрывают
// файл ровно до конца.
//
// Порядок разделов задан жёстко и проверен по всей базе (7136 тайлов, у всех):
//
//   XAC HEADER -> ZF-NAMEN -> VEKTORBLOCK x N -> LAYER 1 VERWEISE -> ZE-NAMEN
//   -> ZE-NAMEN-MMI -> HAUSNUMMERN -> LOCAL POIS -> RASTERINFOS
//
// Набор тайла — подпоследовательность этой цепочки, каждый вид лежит одним
// куском, зазоров и выравнивания между разделами нет.
//
// Поля `XAC HEADER`, которые считаются из самих разделов (сошлись на всех
// 7136 тайлах базы):
//
//   +0x18  код тайла, 4 символа            +0x70  число разделов VEKTORBLOCK
//   +0x1c  имя файла без расширения        +0x74  смещение первого из них
//   +0x54  рамка тайла: объединение        +0x78  суммарный их размер
//          рамок всех VEKTORBLOCK
//
// Остальное переносится из образца: время сборки (+0x2c, +0x3c), номер тайла
// в реестре XAC-STRUKTUR (+0x4c), индекс страны (+0x4e), границы групп
// (+0x7c…+0x88) и поля, назначение которых не установлено.
//
// Границы групп — накопленные размеры разделов VEKTORBLOCK (сходится у всех
// 6943 тайлов с блоками), но правило разбиения на группы не установлено;
// у одноблочного тайла они нулевые у 3532 из 3644, и нули мы и пишем.

const fs = require('fs');
const xac = require('./xac');

const HDR = 196;                    // размер раздела XAC HEADER
const NAME = 16;

// Смещения полей шапки — от начала файла, он же начало раздела.
const F = {
  len: 0x10, code: 0x18, file: 0x1c, built: 0x2c, dbBuilt: 0x3c,
  index: 0x4c, country: 0x4e, bbox: 0x54, count: 0x70, first: 0x74, size: 0x78,
  levels: 0x7c,
};

function str(buf, at, len) {
  return buf.toString('latin1', at, at + len).replace(/\0+$/, '');
}

// Разбор тайла: разделы, поля шапки, блоки.
function readTile(buf) {
  const s = xac.sections(buf);
  const head = s.list[0];
  if (!head || head.name !== 'XAC HEADER' || head.total !== HDR) return null;
  const vb = s.list.filter((x) => x.name === 'VEKTORBLOCK');
  return {
    sections: s.list, complete: s.complete, size: buf.length,
    code: str(buf, F.code, 4), file: str(buf, F.file, NAME),
    built: str(buf, F.built, 14), dbBuilt: str(buf, F.dbBuilt, 14),
    index: buf.readUInt16BE(F.index), country: buf.readUInt16BE(F.country),
    bbox: [0, 4, 8, 12].map((o) => buf.readInt32BE(F.bbox + o)),
    count: buf.readUInt32BE(F.count), first: buf.readUInt32BE(F.first),
    total: buf.readUInt32BE(F.size),
    levels: [0, 4, 8, 12].map((o) => buf.readUInt32BE(F.levels + o)),
    blocks: vb.map((x) => ({ offset: x.offset, size: x.total,
      version: buf.readUInt16BE(x.offset + 0x14) })),
  };
}

// Рамка тайла — объединение рамок блоков. Пустой тайл держит перевёрнутую
// рамку (min = 0x7fffffff, max = 0x80000000), так это и в заводских файлах.
function bboxOf(buf, vb) {
  const bb = [0x7fffffff, 0x7fffffff, -0x80000000, -0x80000000];
  for (const s of vb) {
    const b = buf.subarray(s.offset, s.offset + s.total);
    bb[0] = Math.min(bb[0], b.readInt32BE(0x18));
    bb[1] = Math.min(bb[1], b.readInt32BE(0x1c));
    bb[2] = Math.max(bb[2], b.readInt32BE(0x20));
    bb[3] = Math.max(bb[3], b.readInt32BE(0x24));
  }
  return bb;
}

// Обратный проход: собрать файл заново из разделов, пересчитав вычислимые поля
// шапки. Остальные байты шапки переносятся. Совпадение байт в байт означает,
// что вычислимые поля мы считаем так же, как сборщик карты.
function rebuild(buf) {
  const t = readTile(buf);
  if (!t) return null;
  const vb = t.sections.filter((x) => x.name === 'VEKTORBLOCK');
  const out = Buffer.concat(t.sections.map((x) => buf.subarray(x.offset, x.offset + x.total)));
  out.writeUInt32BE(HDR - 20, F.len);
  out.write(t.code.padEnd(4, '\0'), F.code, 4, 'latin1');
  out.write(t.file.padEnd(NAME, '\0'), F.file, NAME, 'latin1');
  const bb = bboxOf(buf, vb);
  bb.forEach((v, k) => out.writeInt32BE(v, F.bbox + k * 4));
  out.writeUInt32BE(vb.length, F.count);
  out.writeUInt32BE(vb.length ? vb[0].offset : 0xffffffff, F.first);
  out.writeUInt32BE(vb.reduce((a, x) => a + x.total, 0), F.size);
  return { out, same: out.equals(buf) };
}

// Раздел: имя 16 байт, u32 BE длины, полезная часть.
function section(name, payload) {
  const head = Buffer.alloc(20);
  head.write(name.padEnd(NAME, ' '), 0, NAME, 'ascii');
  head.writeUInt32BE(payload.length, 16);
  return Buffer.concat([head, payload]);
}

// Сборка тайла с нуля.
//
//   code      код тайла, четыре символа (`CY00`)
//   file      имя файла без расширения (`EJ211_CY00_1`)
//   index     номер тайла в реестре XAC-STRUKTUR
//   country   индекс страны (номер справочника .ort), см. оговорку в docs
//   built     время сборки тайла, 14 цифр; dbBuilt — время сборки базы
//   template  байты чужой шапки: из неё берутся поля, назначение которых не
//             установлено. Без образца они остаются нулями.
//   zf        готовый раздел ZF-NAMEN (без него тайл не бывает: он есть у всех
//             417 переписанных тайлов)
//   blocks    массив готовых разделов VEKTORBLOCK
function buildTile(spec) {
  const head = Buffer.alloc(HDR);
  if (spec.template) {
    if (spec.template.length < HDR) throw new Error('образец шапки короче 196 байт');
    spec.template.copy(head, 0, 0, HDR);
  } else {
    head.write('XAC HEADER'.padEnd(NAME, ' '), 0, NAME, 'ascii');
  }
  head.writeUInt32BE(HDR - 20, F.len);
  head.fill(0, F.code, F.bbox + 16);                 // чистим всё, что задаём сами
  head.write(String(spec.code || '').padEnd(4, '\0'), F.code, 4, 'latin1');
  head.write(String(spec.file || '').padEnd(NAME, '\0').slice(0, NAME), F.file, NAME, 'latin1');
  head.write(String(spec.built || '').padEnd(14, '\0').slice(0, 14), F.built, 14, 'latin1');
  head.write(String(spec.dbBuilt || spec.built || '').padEnd(14, '\0').slice(0, 14), F.dbBuilt, 14, 'latin1');
  head.writeUInt16BE(spec.index || 0, F.index);
  head.writeUInt16BE(spec.country || 0, F.country);

  const blocks = spec.blocks || [];
  const parts = [head];
  if (spec.zf) parts.push(spec.zf);
  parts.push(...blocks);
  const file = Buffer.concat(parts);

  // Поля, считаемые по разделам, — теми же формулами, что сверены на 536 тайлах.
  const vb = xac.sections(file).list.filter((x) => x.name === 'VEKTORBLOCK');
  const bb = bboxOf(file, vb);
  bb.forEach((v, k) => file.writeInt32BE(v, F.bbox + k * 4));
  file.writeUInt32BE(vb.length, F.count);
  file.writeUInt32BE(vb.length ? vb[0].offset : 0xffffffff, F.first);
  file.writeUInt32BE(vb.reduce((a, x) => a + x.total, 0), F.size);
  // Границы групп: у 375 однoблочных тайлов из 393 они нулевые — как здесь.
  // Правило группировки для многоблочных тайлов не установлено.
  if (spec.levels) spec.levels.forEach((v, k) => file.writeUInt32BE(v, F.levels + k * 4));
  else file.fill(0, F.levels, F.levels + 16);
  return file;
}

module.exports = { readTile, rebuild, buildTile, section, bboxOf, HDR, F };

if (require.main === module) {
  const fldb = require('./fldb');
  const db = fldb.open(process.argv[2] || 'maps/pkgdb/XAC/kN221EUx01_0.db');
  const list = fldb.entries(db);
  const tiles = list.filter((x) => /\.xac$/i.test(x.name));
  const step = Number(process.argv[3] || 7);
  let n = 0, same = 0, bad = [];
  for (let i = 0; i < tiles.length; i += step) {
    const buf = fldb.read(db, tiles[i]);
    const r = rebuild(buf);
    if (!r) continue;
    n++;
    if (r.same) same++; else bad.push(tiles[i].name);
  }
  console.log('тайлов %d: собрано байт в байт %d (%s%%)', n, same, (100 * same / n).toFixed(2));
  for (const x of bad.slice(0, 5)) console.log('  разошёлся:', x);
}
