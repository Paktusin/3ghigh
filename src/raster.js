'use strict';
// Растровый индекс RASTERINFOS.
// Использование: node src/raster.js <файл.xac | путь к .ras>
//
// Один и тот же формат у большого EJ211.ras (191 МБ) и у разделов RASTERINFOS
// внутри тайлов (десятки-сотни байт), различается только метка и поле версии.
//
//   +0x00  16 байт  метка: "DB RASTERINFOS  " или "RASTERINFOS     "
//   +0x10  u32      длина полезной части
//   +0x14  u32      версия: 0x00010000 у общего индекса, 0x00020000 у тайлов
//   +0x18  u32      xmin      рамка растра
//   +0x1C  u32      ymin
//   +0x20  u32      xmax
//   +0x24  u32      ymax
//   +0x28  u32      число ячеек по горизонтали
//   +0x2C  u32      число ячеек по вертикали
//   +0x30  u32      шаг ячейки по X, всегда 1000
//   +0x34  u32      шаг ячейки по Y, всегда 1000
//   +0x38  ...      упаковка длинами серий, слова u16 BE
//
// Размеры сетки связаны с рамкой как span/1000 - 2: рамка шире растра ровно
// на одну ячейку с каждой стороны. Проверено на всех рассмотренных тайлах.
//
// Полезная часть — поток слов, где младшие 15 бит это длина серии, а старший
// бит — значение ячейки. Сумма длин серий в точности равна числу ячеек сетки:
// проверено на 40 тайлах, совпадение 40 из 40.
//
// ЧТО ОЗНАЧАЕТ ЗНАЧЕНИЕ ЯЧЕЙКИ — НЕ УСТАНОВЛЕНО. Проверялась очевидная догадка
// «в ячейке есть дорожные данные»: узлы, декодированные из VEKTORBLOCK, попадают
// в помеченные ячейки в 42,7% случаев при доле помеченных ячеек 43%. То есть
// связи нет вовсе. Перебирались обе развёртки, оба направления строк и сдвиг
// на ячейку — лучший вариант не отличается от случайного.

const fs = require('fs');
const xac = require('./xac');

function parseRaster(b) {
  const u = o => b.readUInt32BE(o);
  const nx = u(0x28), ny = u(0x2c);
  const cells = new Uint8Array(nx * ny);
  let i = 0, words = 0;
  for (let o = 0x38; o + 2 <= b.length; o += 2) {
    const w = b.readUInt16BE(o);
    const run = w & 0x7fff, val = (w & 0x8000) ? 1 : 0;
    words++;
    for (let k = 0; k < run && i < cells.length; k++) cells[i++] = val;
  }
  return {
    label: b.toString('latin1', 0, 16).trim(),
    version: u(0x14),
    bbox: [u(0x18), u(0x1c), u(0x20), u(0x24)],
    nx, ny, cellX: u(0x30), cellY: u(0x34),
    words, unpacked: i, cells,
  };
}

module.exports = { parseRaster };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('использование: node src/raster.js <файл.xac>'); process.exit(1); }
  const buf = fs.readFileSync(file);
  const sec = xac.sections(buf).list.find(x => /RASTERINFOS/.test(x.name));
  const b = sec ? buf.subarray(sec.offset, sec.offset + sec.total) : buf;
  const r = parseRaster(b);
  const LAT = 40000000 / 360;

  console.log('метка     :', r.label);
  console.log('версия    : 0x' + r.version.toString(16).padStart(8, '0'));
  console.log('рамка     :', (r.bbox[1] / LAT).toFixed(4) + '..' + (r.bbox[3] / LAT).toFixed(4), 'с.ш.,',
    (r.bbox[0] / 72000).toFixed(4) + '..' + (r.bbox[2] / 72000).toFixed(4), 'в.д.');
  console.log('сетка     :', r.nx + ' x ' + r.ny, '=', r.nx * r.ny, 'ячеек, шаг', r.cellX + '/' + r.cellY);
  console.log('размах/шаг:', ((r.bbox[2] - r.bbox[0]) / r.cellX) + ' x ' + ((r.bbox[3] - r.bbox[1]) / r.cellY),
    '— на две ячейки больше сетки с каждой оси');
  console.log('серий     :', r.words, ' развёрнуто ячеек:', r.unpacked,
    r.unpacked === r.nx * r.ny ? '— сходится с сеткой' : '— НЕ сходится');
  let on = 0;
  for (const c of r.cells) on += c;
  console.log('помечено  :', on, '(' + (100 * on / r.cells.length).toFixed(1) + '%)');
}
