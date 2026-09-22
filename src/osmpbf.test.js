'use strict';
// Автономные тесты читателя .osm.pbf: файл собирается прямо здесь, извлечения
// не нужны. Пишем блок без сжатия (поле 1 Blob) — читатель берёт и такой.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pbf = require('./osmpbf');

function varint(v) {
  const out = [];
  do { let b = v % 128; v = Math.floor(v / 128); out.push(b | (v ? 0x80 : 0)); } while (v);
  return Buffer.from(out);
}
const zig = (v) => (v < 0 ? -2 * v - 1 : 2 * v);
const key = (num, wire) => varint(num * 8 + wire);
const lenDelim = (num, buf) => Buffer.concat([key(num, 2), varint(buf.length), buf]);
const int = (num, v) => Buffer.concat([key(num, 0), varint(v)]);
const packedInts = (num, vs, sign) =>
  lenDelim(num, Buffer.concat(vs.map((v) => varint(sign ? zig(v) : v))));

// Строки блока; 0 — пустая, как требует формат.
const STRS = ['', 'addr:housenumber', '5', 'addr:street', 'Ledra', 'highway',
              'residential', 'name', 'Main'];

function block() {
  const st = lenDelim(1, Buffer.concat(STRS.map((s) => lenDelim(1, Buffer.from(s, 'utf8')))));
  // три узла: два без тегов, третий — дом 5 на улице Ledra
  const dense = Buffer.concat([
    packedInts(1, [10, 5, 5], true),                        // номера разностями
    packedInts(8, [351600000, 100, 100], true),             // широты разностями
    packedInts(9, [333500000, 200, 200], true),             // долготы
    packedInts(10, [0, 0, 1, 2, 3, 4, 0], false),           // теги: пусто, пусто, дом
  ]);
  const group1 = lenDelim(2, dense);
  // линия: дорога Main из узлов 10 и 15
  const way = Buffer.concat([
    int(1, 42),
    packedInts(2, [5, 7], false),
    packedInts(3, [6, 8], false),
    packedInts(8, [10, 5], true),
  ]);
  const group2 = lenDelim(3, way);
  return Buffer.concat([st, lenDelim(2, group1), lenDelim(2, group2),
                        int(17, 100), int(19, 0), int(20, 0)]);
}

function file() {
  const body = block();
  const blob = lenDelim(1, body);                            // без сжатия
  const hdr = Buffer.concat([lenDelim(1, Buffer.from('OSMData', 'latin1')), int(3, blob.length)]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(hdr.length, 0);
  return Buffer.concat([len, hdr, blob]);
}

function withFile(fn) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pbf-')), 't.osm.pbf');
  fs.writeFileSync(p, file());
  try { return fn(p); } finally { fs.rmSync(path.dirname(p), { recursive: true, force: true }); }
}

test('узлы читаются разностями, координаты в стотысячных градуса', () => {
  withFile((p) => {
    const idx = pbf.read(p, { node: () => false, way: () => false });
    assert.strictEqual(idx.n, 3, 'три узла');
    assert.deepStrictEqual(Array.from(idx.ids.subarray(0, 3)), [10, 15, 20], 'номера накопились');
    assert.deepStrictEqual(pbf.coord(idx, 10), [333500000, 351600000]);
    assert.deepStrictEqual(pbf.coord(idx, 15), [333500200, 351600100]);
    assert.strictEqual(pbf.coord(idx, 99), null, 'чужого узла нет');
  });
});

test('теги узла разбираются, отбор работает', () => {
  withFile((p) => {
    const idx = pbf.read(p, { node: (t) => t['addr:housenumber'] !== undefined, way: () => false });
    assert.strictEqual(idx.points.length, 1, 'дом один');
    assert.strictEqual(idx.points[0].id, 20);
    assert.deepStrictEqual(idx.points[0].tags,
      { 'addr:housenumber': '5', 'addr:street': 'Ledra' });
  });
});

test('линия читается с тегами и узлами, середина считается', () => {
  withFile((p) => {
    const idx = pbf.read(p, { node: () => false, way: (t) => t.highway !== undefined });
    assert.strictEqual(idx.ways.length, 1);
    assert.strictEqual(idx.ways[0].id, 42);
    assert.deepStrictEqual(idx.ways[0].tags, { highway: 'residential', name: 'Main' });
    assert.deepStrictEqual(idx.ways[0].refs, [10, 15], 'узлы накопились разностями');
    assert.deepStrictEqual(pbf.center(idx, idx.ways[0].refs), [333500100, 351600050]);
  });
});

test('зигзаг и варинт: границы', () => {
  assert.strictEqual(pbf.zig(0), 0);
  assert.strictEqual(pbf.zig(1), -1);
  assert.strictEqual(pbf.zig(2), 1);
  assert.strictEqual(pbf.varint(varint(0), 0)[0], 0);
  assert.strictEqual(pbf.varint(varint(127), 0)[0], 127);
  assert.strictEqual(pbf.varint(varint(128), 0)[0], 128);
  assert.strictEqual(pbf.varint(varint(300000000000), 0)[0], 300000000000, 'больше 32 бит');
});
