'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('./fegruppen');
const X = require('./xah');

// Головка раздела: от +0x14 (версия) до начала записей GR. Смещения и счётчики
// в ней пересчитывает build, поэтому в образце они могут быть любыми.
function model(groups, lands, headLen) {
  return { head: Buffer.alloc(headLen === undefined ? 16 : headLen),
           version: 4, gap: 0, tail: 0, groups, lands };
}

const wrap = (data) => X.build([{ name: F.SEC, data }]);

test('запись группы: тег, длина 8 + 2 на тайл, номера тайлов', () => {
  const b = F.build(model([{ id: 7, tiles: [1, 2, 3] }], []));
  const at = 16;                                  // головка длиной 16
  assert.equal(b.toString('latin1', at, at + 2), 'GR');
  assert.equal(b.readUInt16BE(at + 2), 14);       // 8 + 3*2
  assert.equal(b.readUInt16BE(at + 4), 7);
  assert.equal(b.readUInt16BE(at + 6), 3);
  assert.deepEqual([b.readUInt16BE(at + 8), b.readUInt16BE(at + 10), b.readUInt16BE(at + 12)],
                   [1, 2, 3]);
});

test('запись страны: длина 14 + 2 на тайл, поля на своих местах', () => {
  const land = { id: 113, byte6: 5, flags: 2, value: 42, tiles: [9] };
  const b = F.build(model([], [land]));
  const at = 16;
  assert.equal(b.toString('latin1', at, at + 2), 'LD');
  assert.equal(b.readUInt16BE(at + 2), 16);       // 14 + 1*2
  assert.equal(b.readUInt16BE(at + 4), 113);
  assert.equal(b[at + 6], 5);
  assert.equal(b[at + 7], 2);
  assert.equal(b.readUInt32BE(at + 8), 42);
  assert.equal(b.readUInt16BE(at + 12), 1);
  assert.equal(b.readUInt16BE(at + 14), 9);
});

test('смещения и счётчики в головке пересчитываются сами', () => {
  const m = model([{ id: 0, tiles: [1, 2] }, { id: 1, tiles: [3] }],
                  [{ id: 113, byte6: 0, flags: 0, value: 0, tiles: [1, 2, 3] }]);
  const b = F.build(m);
  const got = F.read(wrap(b));
  assert.equal(got.grOff, 20 + 16);
  assert.equal(got.groups.length, 2);
  assert.equal(got.lands.length, 1);
  assert.equal(got.ldOff, got.grOff + (8 + 4) + (8 + 2));
});

test('собранное читается обратно теми же значениями', () => {
  const m = model([{ id: 0, tiles: [0, 1, 2] }, { id: 3, tiles: [7] }],
                  [{ id: 113, byte6: 8, flags: 2, value: 12525, tiles: [0, 1, 2, 7] }]);
  const got = F.read(wrap(F.build(m)));
  assert.deepEqual(got.groups, m.groups);
  assert.deepEqual(got.lands, m.lands);
});

test('чужая метка вместо GR отвергается не молча', () => {
  const b = F.build(model([{ id: 0, tiles: [1] }], []));
  b.write('XX', 16, 'latin1');
  assert.throws(() => F.read(wrap(b)), /не GR/);
});
