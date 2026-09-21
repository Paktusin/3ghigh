'use strict';
// Автономные тесты индекса номеров домов.
const test = require('node:test');
const assert = require('node:assert');
const { header, at, chunkOf, varint, buildIndex, REC } = require('./hausnr');

function section(offsets, data) {
  const idx = buildIndex(offsets);
  const out = Buffer.alloc(48 + idx.length + data.length);
  out.write('HAUSNUMMERN'.padEnd(16, ' '), 0, 16, 'latin1');
  out.writeUInt32BE(out.length - 20, 0x10);
  out.writeUInt32BE(0x00050000, 0x14);
  out.writeUInt32BE(offsets.length, 0x18);
  out.writeUInt32BE(48, 0x1c);
  out.writeUInt32BE(idx.length, 0x20);
  out.writeUInt32BE(7, 0x24);
  out.writeUInt32BE(48 + idx.length, 0x28);
  out.writeUInt32BE(data.length, 0x2c);
  idx.copy(out, 48);
  data.copy(out, 48 + idx.length);
  return out;
}

test('индекс: у имени без номеров пустой кусок, у остальных свой', () => {
  const data = Buffer.from([1, 2, 3, 4, 5, 6]);
  const sec = section([0, 2, 2, 6], data);          // три имени, у второго номеров нет
  const h = header(sec);
  assert.strictEqual(h.count, 4);
  assert.strictEqual(h.index.len, 4 * REC);
  assert.deepStrictEqual([...chunkOf(sec, 0, h)], [1, 2]);
  assert.strictEqual(chunkOf(sec, 1, h).length, 0);
  assert.deepStrictEqual([...chunkOf(sec, 2, h)], [3, 4, 5, 6]);
});

test('замыкающая запись индекса равна длине области данных', () => {
  const sec = section([0, 3, 5], Buffer.alloc(5));
  const h = header(sec);
  assert.strictEqual(at(sec, h, h.count - 1), h.data.len);
});

test('число переменной длины: семь бит на байт', () => {
  assert.deepStrictEqual(varint(Buffer.from([0x05]), 0), [5, 1]);
  assert.deepStrictEqual(varint(Buffer.from([0x7f]), 0), [127, 1]);
  assert.deepStrictEqual(varint(Buffer.from([0x81, 0x00]), 0), [128, 2]);
  assert.deepStrictEqual(varint(Buffer.from([0x88, 0x07]), 0), [1031, 2]);
});

test('смещение больше 16 бит переживает сборку индекса', () => {
  const big = 0x123456;
  const idx = buildIndex([0, big]);
  const sec = section([0, big], Buffer.alloc(0));
  assert.strictEqual(at(sec, header(sec), 1), big);
  assert.strictEqual(idx.length, 2 * REC);
});
