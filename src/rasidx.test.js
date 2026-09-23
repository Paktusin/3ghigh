'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('./rasidx');

const spec = { bbox: [0, 0, 5000, 3000], step: [1000, 1000] };

test('пустая сетка считается из рамки и шага, все ячейки пусты', () => {
  const r = R.blank(spec);
  assert.equal(r.nx, 5);
  assert.equal(r.ny, 3);
  assert.equal(r.grid.length, 5 * 3 * 2);
  for (let cx = 0; cx < r.nx; cx++) {
    for (let cy = 0; cy < r.ny; cy++) assert.equal(R.get(r, cx, cy), R.EMPTY);
  }
});

test('заголовок собирается по своим смещениям', () => {
  const b = R.build(R.blank(spec));
  assert.equal(b.toString('latin1', 0, 16), 'DB RASTERINFOS  ');
  assert.equal(b.readUInt32BE(0x10), b.length - 20);     // длина как у разделов
  assert.equal(b.readUInt32BE(0x14), R.VERSION);
  assert.deepEqual([0x18, 0x1c, 0x20, 0x24].map((o) => b.readInt32BE(o)), spec.bbox);
  assert.equal(b.readUInt32BE(0x28), 5);
  assert.equal(b.readUInt32BE(0x2c), 3);
  assert.deepEqual([b.readUInt32BE(0x30), b.readUInt32BE(0x34)], [1000, 1000]);
});

test('отрицательная рамка пишется со знаком', () => {
  const b = R.build(R.blank({ bbox: [-2260168, 3029900, -2000000, 3100000] }));
  assert.equal(b.readInt32BE(0x18), -2260168);
});

test('собранное читается своим же читателем', () => {
  const r = R.blank(spec);
  R.set(r, 2, 1, 7);
  const back = R.load(R.build(r), 'проба.ras');
  assert.equal(back.nx, r.nx);
  assert.deepEqual(back.bbox, r.bbox);
  assert.equal(R.get(back, 2, 1), 7);
});

test('рамка тайла занимает свои ячейки, чужие не трогает', () => {
  const r = R.blank(spec);
  const a = R.fill(r, [0, 0, 2000, 1000], 1);
  assert.equal(a.busy, 0);
  assert.ok(a.taken > 0);
  const b = R.fill(r, [0, 0, 5000, 3000], 2);            // поверх занятого
  assert.equal(b.busy, a.taken, 'ячейки первого тайла пропускаются, а не переписываются');
  assert.equal(R.get(r, 0, 0), 1);
});

test('точка вне рамки тайла не находится', () => {
  const r = R.blank(spec);
  R.fill(r, [0, 0, 2000, 1000], 3);
  assert.equal(R.lookup(r, 500, 500), 3);
  assert.equal(R.lookup(r, 4500, 2500), null, 'пустая ячейка');
  assert.equal(R.lookup(r, 99999, 99999), null, 'за пределами сетки');
});
