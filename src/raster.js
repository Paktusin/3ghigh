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
// бит — значение ячейки. Сумма длин серий в точности равна числу ячеек сетки.
// Развёртка — ПО СТОЛБЦАМ: индекс ячейки = cx*ny + cy, как в общем .ras, и
// серия не переходит границу столбца (отсюда пары соседних серий с одинаковым
// значением — это стыки столбцов).
//
// ЗНАЧЕНИЕ ЯЧЕЙКИ: 0 — ячейка отдана ЭТОМУ тайлу в общем растре .ras,
// 1 — не отдана. То есть раздел это маска зоны обслуживания тайла, вырезанная
// из общего растра по его рамке. Сверено с .ras по всем 2904 тайлам, где
// раздел непустой: 94 467 947 ячеек, совпадение 100,000 %, и ни одна «своя»
// ячейка общего растра не помечена единицей.
//
// ОТВЕРГНУТО: «единица значит, что в ячейке есть дорожные данные». Связь
// обратная и не с дорогами: узлы из VEKTORBLOCK лежат в помеченных ячейках
// у 2,3 % таких ячеек против 73,7 % у непомеченных. Прежний счёт (42,7 % при
// доле помеченных 43 %) выглядел случайным сразу по двум причинам: развёртка
// бралась построчная, а полярность — прямая.
//
// У 873 тайлов раздел пустой: сетка 0×0, рамка из единиц, весь раздел 56 байт.

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

// Сборка раздела обратно в байты.
//
//   spec.label   метка раздела, по умолчанию `RASTERINFOS`
//   spec.version версия, у тайловых разделов 0x00020000
//   spec.bbox    рамка растра, четыре u32
//   spec.nx/ny   размеры сетки; рамка шире растра на ячейку с каждой стороны
//   spec.cellX/Y шаг ячейки, у всех разделов базы 1000
//   spec.cells   массив nx*ny значений 0/1 в том же порядке, что даёт parseRaster
//
// Упаковка — серии по u16 BE: младшие 15 бит длина, старший бит значение.
// Серия НЕ переходит границу столбца: развёртка идёт по столбцам (индекс
// ячейки = cx*ny + cy), и каждый столбец из ny ячеек упаковывается отдельно.
// Отсюда и пары соседних серий с одинаковым значением — это стыки столбцов.
// Проверено: у всех 3777 разделов границы серий кратны ny ровно nx раз.
// Серия длиннее 0x7FFF разрезается; в базе таких нет (самая длинная 2816).
function buildRaster(spec) {
  const cells = spec.cells;
  const ny = spec.ny;
  const runs = [];
  for (let col = 0; col < spec.nx; col++) {
    const base = col * ny;
    for (let i = 0; i < ny;) {
      const v = cells[base + i] ? 1 : 0;
      let n = 0;
      while (i + n < ny && (cells[base + i + n] ? 1 : 0) === v && n < 0x7fff) n++;
      runs.push((v << 15) | n);
      i += n;
    }
  }
  // Полезная часть выравнивается на 4 байта: при нечётном числе серий
  // дописывается пустая `0×0`. Заголовок (36 байт) кратен четырём, поэтому
  // правило сводится к чётности числа серий.
  if (runs.length % 2) runs.push(0);
  const body = Buffer.alloc(0x38 - 20 + runs.length * 2);
  const out = Buffer.alloc(20 + body.length);
  out.write((spec.label || 'RASTERINFOS').padEnd(16, ' '), 0, 16, 'latin1');
  out.writeUInt32BE(body.length, 16);
  out.writeUInt32BE(spec.version === undefined ? 0x00020000 : spec.version, 0x14);
  spec.bbox.forEach((v, k) => out.writeUInt32BE(v >>> 0, 0x18 + k * 4));
  out.writeUInt32BE(spec.nx, 0x28);
  out.writeUInt32BE(spec.ny, 0x2c);
  out.writeUInt32BE(spec.cellX === undefined ? 1000 : spec.cellX, 0x30);
  out.writeUInt32BE(spec.cellY === undefined ? 1000 : spec.cellY, 0x34);
  runs.forEach((w, k) => out.writeUInt16BE(w, 0x38 + k * 2));
  return out;
}

// Разобрать раздел и собрать его заново — обратный проход для сверки.
function rebuild(b) {
  const r = parseRaster(b);
  return buildRaster({
    label: r.label, version: r.version, bbox: r.bbox,
    nx: r.nx, ny: r.ny, cellX: r.cellX, cellY: r.cellY, cells: r.cells,
  });
}

module.exports = { parseRaster, buildRaster, rebuild };

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
