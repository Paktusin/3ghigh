'use strict';
// Высоты (Terrarium PNG) и контуры ступеней рельефа: без сети, на синтетике.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const dem = require('./dem');

// собрать PNG 8-бит RGB с заданным фильтром строк
function png(w, h, rgb, filter) {
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8);
    return b;                                  // CRC наш читатель не проверяет
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    row[0] = filter;
    for (let i = 0; i < w * 3; i++) {
      const cur = rgb[y * w * 3 + i], left = i >= 3 ? rgb[y * w * 3 + i - 3] : 0, up = y ? rgb[(y - 1) * w * 3 + i] : 0;
      row[1 + i] = (filter === 1 ? cur - left : filter === 2 ? cur - up : cur) & 0xff;
    }
    rows.push(row);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

test('высоты: PNG Terrarium разбирается — все фильтры строк, высота = R·256 + G + B/256 − 32768', () => {
  const w = 4, h = 3, rgb = [];
  const hs = [];
  for (let k = 0; k < w * h; k++) { const m = 32768 + k * 137; hs.push(m - 32768); rgb.push(m >> 8, m & 0xff, 0); }
  for (const f of [0, 1, 2]) {
    const d = dem.decodePng(png(w, h, rgb, f));
    assert.deepEqual([...d.hgt], hs, 'фильтр ' + f);
  }
});

test('ступени: контур маски — внешнее кольцо против часовой, дыра по часовой', () => {
  // квадрат 4×4 с дырой 1×1 в середине (сетка 6×6)
  const nx = 6, ny = 6, m = new Uint8Array(nx * ny);
  for (let j = 1; j <= 4; j++) for (let i = 1; i <= 4; i++) m[j * nx + i] = 1;
  m[2 * nx + 2] = 0;
  const rings = dem.traceMask(m, nx, ny);
  const area = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; };
  assert.deepEqual(rings.map(area).sort((a, b) => a - b), [-1, 16]);
});
