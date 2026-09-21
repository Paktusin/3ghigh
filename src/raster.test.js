'use strict';
// Автономные тесты растрового индекса: собираем раздел и читаем обратно.
const test = require('node:test');
const assert = require('node:assert');
const { parseRaster, buildRaster, rebuild } = require('./raster');

function make(nx, ny, fn) {
  const cells = new Uint8Array(nx * ny);
  for (let cx = 0; cx < nx; cx++) for (let cy = 0; cy < ny; cy++) cells[cx * ny + cy] = fn(cx, cy) ? 1 : 0;
  return buildRaster({ bbox: [1000, 2000, 1000 + (nx + 2) * 1000, 2000 + (ny + 2) * 1000], nx, ny, cells });
}

test('раздел собирается и читается обратно теми же ячейками', () => {
  const nx = 7, ny = 5;
  const f = (cx, cy) => (cx + cy) % 3 === 0;
  const sec = make(nx, ny, f);
  const r = parseRaster(sec);
  assert.strictEqual(r.label, 'RASTERINFOS');
  assert.strictEqual(r.nx, nx);
  assert.strictEqual(r.ny, ny);
  assert.strictEqual(r.unpacked, nx * ny);
  for (let cx = 0; cx < nx; cx++) for (let cy = 0; cy < ny; cy++) {
    assert.strictEqual(r.cells[cx * ny + cy], f(cx, cy) ? 1 : 0, 'ячейка ' + cx + ',' + cy);
  }
});

test('серии не переходят границу столбца', () => {
  const sec = make(4, 6, () => true);            // все ячейки помечены
  const runs = [];
  for (let o = 0x38; o + 2 <= sec.length; o += 2) runs.push(sec.readUInt16BE(o));
  const real = runs.filter((w) => (w & 0x7fff) !== 0);
  assert.strictEqual(real.length, 4, 'по одной серии на столбец, а не одна сплошная');
  for (const w of real) assert.strictEqual(w, 0x8000 | 6);
});

test('полезная часть выравнена на 4 байта', () => {
  for (const [nx, ny] of [[3, 3], [5, 7], [9, 4], [1, 1]]) {
    const sec = make(nx, ny, (cx, cy) => (cx * cy) % 2 === 0);
    assert.strictEqual((sec.length - 20) % 4, 0, 'сетка ' + nx + 'x' + ny);
  }
});

test('обратный проход: разобранный раздел собирается в те же байты', () => {
  const sec = make(11, 9, (cx, cy) => cy < cx);
  assert.ok(rebuild(sec).equals(sec));
});

test('пустая сетка: раздел из одного заголовка', () => {
  const sec = buildRaster({ bbox: [0, 0, 0, 0], nx: 0, ny: 0, cells: new Uint8Array(0) });
  assert.strictEqual(sec.length, 56);
  assert.strictEqual(parseRaster(sec).unpacked, 0);
});
