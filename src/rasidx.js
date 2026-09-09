'use strict';
// Общий растровый индекс <П>.ras: какой тайл покрывает точку.
// Использование:
//   node src/rasidx.js                       сводка и проверка по рамкам тайлов
//   node src/rasidx.js 33.36 35.17           тайл в точке (долгота, широта)
//   node src/rasidx.js VA01                  ячейки, занятые тайлом
//
// В отличие от тайловых RASTERINFOS, здесь нет упаковки: на каждую километровую
// ячейку ровно одно слово u16 BE. Значение — номер тайла в реестре XAC-STRUKTUR,
// 0xFFFE — тайла нет. Порядок по столбцам: индекс ячейки = cx * ny + cy.
//
// Заголовок общий с RASTERINFOS (см. src/raster.js), но рамка со знаком:
// xmin отрицательный, западнее Гринвича на 31 градус.
//
// Проверка по центрам рамок 535 тайлов: 460 совпали, 71 указали на соседний
// тайл (рамки перекрываются), 4 — море. 254 тайла в растре не упомянуты вовсе:
// это крошечные тайлы, целиком лежащие внутри другого (Ватикан внутри Рима).
// До них устройство добирается через таблицу соседей NACHBARN.

const fs = require('fs');
const path = require('path');
const fldb = require('./fldb');
const xac = require('./xac');
const dataset = require('./dataset');

const HEAD = 0x38;
const EMPTY = 0xfffe;

function open(root) {
  const pkgdb = path.join(root || dataset.resolveRoot(), 'pkgdb');
  for (const d of fs.readdirSync(pkgdb)) {
    if (!/^XAC/.test(d)) continue;
    for (const f of fs.readdirSync(path.join(pkgdb, d))) {
      if (!f.toLowerCase().endsWith('.db')) continue;
      const db = fldb.open(path.join(pkgdb, d, f));
      const e = fldb.entries(db).find(x => /[.]ras$/.test(x.name));
      if (e) return load(fldb.read(db, e), e.name);
    }
  }
  throw new Error('файл .ras в контейнерах XAC не найден');
}

function load(buf, name) {
  const r = {
    name,
    label: buf.toString('latin1', 0, 16).replace(/[^ -~]/g, '').trim(),
    version: buf.readUInt32BE(0x14),
    bbox: [0x18, 0x1c, 0x20, 0x24].map(o => buf.readInt32BE(o)),
    nx: buf.readUInt32BE(0x28), ny: buf.readUInt32BE(0x2c),
    step: [buf.readUInt32BE(0x30), buf.readUInt32BE(0x34)],
    grid: buf.subarray(HEAD),
  };
  if (r.grid.length !== r.nx * r.ny * 2) {
    throw new Error('размер сетки не сходится: ' + r.grid.length + ' против ' + r.nx * r.ny * 2);
  }
  return r;
}

// ячейка по координатам в единицах базы
function cellOf(r, x, y) {
  const cx = Math.floor((x - r.bbox[0]) / r.step[0]);
  const cy = Math.floor((y - r.bbox[1]) / r.step[1]);
  if (cx < 0 || cy < 0 || cx >= r.nx || cy >= r.ny) return null;
  return { cx, cy };
}

function get(r, cx, cy) { return r.grid.readUInt16BE((cx * r.ny + cy) * 2); }
function set(r, cx, cy, v) { r.grid.writeUInt16BE(v, (cx * r.ny + cy) * 2); }

function lookup(r, x, y) {
  const c = cellOf(r, x, y);
  if (!c) return null;
  const v = get(r, c.cx, c.cy);
  return v === EMPTY ? null : v;
}

// сколько ячеек занимает каждый тайл
function histogram(r) {
  const h = new Uint32Array(65536);
  for (let i = 0; i < r.nx * r.ny; i++) h[r.grid.readUInt16BE(i * 2)]++;
  return h;
}

// ячейки, накрываемые рамкой; fn(cx, cy, value)
function forBBox(r, bbox, fn) {
  const a = cellOf(r, bbox[0], bbox[1]) || { cx: 0, cy: 0 };
  const b = cellOf(r, bbox[2], bbox[3]) || { cx: r.nx - 1, cy: r.ny - 1 };
  for (let cx = a.cx; cx <= b.cx; cx++) for (let cy = a.cy; cy <= b.cy; cy++) fn(cx, cy, get(r, cx, cy));
}

// обратно в байты файла: заголовок и сетка
function serialize(r, headSrc) {
  const out = Buffer.alloc(HEAD + r.grid.length);
  headSrc.copy(out, 0, 0, HEAD);
  r.grid.copy(out, HEAD);
  return out;
}

module.exports = { open, load, lookup, cellOf, get, set, histogram, forBBox, serialize, EMPTY, HEAD };

if (require.main === module) {
  const st = require('./struktur');
  const idx = st.openIndex();
  const order = [...st.parse(idx.buf).keys()];
  const lv = st.parseLevels(idx.buf);
  const r = open();
  const a = process.argv[2], b = process.argv[3];

  const name = v => (v === EMPTY ? 'пусто' : order[v] || ('#' + v));

  if (a && b) {
    const x = xac.fromLon(Number(a)), y = xac.fromLat(Number(b));
    const c = cellOf(r, x, y);
    if (!c) { console.log('точка вне растра'); return; }
    const v = get(r, c.cx, c.cy);
    console.log('ячейка [' + c.cx + ', ' + c.cy + ']: ' + name(v));
    return;
  }

  if (a) {
    const li = order.indexOf(a.toUpperCase());
    if (li < 0) { console.error('тайл ' + a + ' в реестре не найден'); process.exit(1); }
    const h = histogram(r);
    console.log('тайл ' + order[li] + ' (#' + li + '): ячеек с его номером ' + h[li]);
    const seen = {};
    forBBox(r, lv[1].rows[li].bbox, (cx, cy, v) => { seen[v] = (seen[v] || 0) + 1; });
    console.log('в рамке L1 лежат ячейки:', Object.entries(seen).sort((p, q) => q[1] - p[1])
      .map(([k, n]) => name(Number(k)) + ':' + n).join(' '));
    return;
  }

  console.log('файл     :', r.name, ' метка', JSON.stringify(r.label), ' версия', r.version.toString(16));
  console.log('рамка    :', xac.toLon(r.bbox[0]).toFixed(2) + '..' + xac.toLon(r.bbox[2]).toFixed(2) + ' в.д., ' +
    xac.toLat(r.bbox[1]).toFixed(2) + '..' + xac.toLat(r.bbox[3]).toFixed(2) + ' с.ш.');
  console.log('сетка    :', r.nx + ' x ' + r.ny, ' шаг', r.step.join('x'));
  const h = histogram(r);
  const empty = h[EMPTY];
  let absent = 0;
  for (let i = 0; i < order.length; i++) if (!h[i]) absent++;
  console.log('ячеек    :', r.nx * r.ny, ' пусто', empty, ' занято', r.nx * r.ny - empty);
  console.log('тайлов без единой ячейки:', absent, 'из', order.length);
  let hit = 0, other = 0, sea = 0, n = 0;
  for (let i = 0; i < order.length; i++) {
    const row = lv[1].rows[i];
    if (row.empty) continue;
    const v = lookup(r, (row.bbox[0] + row.bbox[2]) / 2, (row.bbox[1] + row.bbox[3]) / 2);
    n++;
    if (v === i) hit++; else if (v === null) sea++; else other++;
  }
  console.log('центр рамки L1 -> свой тайл:', hit, ' соседний:', other, ' пусто:', sea, ' из', n);
}
