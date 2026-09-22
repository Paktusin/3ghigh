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

// ---------------------------------------------------------------------------
// Запись дома.

const hn = require('./hausnr');
const B = (...a) => Buffer.from(a);

// Один элемент списка ссылок в длинной форме: блок и ссылка, без продолжения.
function ref1(block, ref) {
  const v = ref >> 1;                       // в записи лежит «ссылка», а не номер
  return [0x40 | ((v >> 8) & 0x3f), v & 0xff, block & 0x7f];
}

test('запись дома: виды групп номеров разбираются по коду ниббла', () => {
  const cases = [
    // [байты payload, вид, ожидаемые от и до]
    [[0x0c], 1, 12, 12],
    [[0x05, 0x09], 2, 5, 9],
    [[0x01, 0x2c], 5, (1 << 7) | 0x2c, (1 << 7) | 0x2c],
    [[0x00, 0x20, 0x00, 0x30], 6, 0x20, 0x30],
    [[(22 + 0x20) << 2 & 0xfc | 0, 0x0a], 8, 10, 10 + 22],
    [[0x00, 0x64, 0x84], 10, 100, 104],
    [[0x00, 0x64, 0x82], 11, 100, 104],
  ];
  for (const [bytes, code, from, to] of cases) {
    const r = hn.group(Buffer.from(bytes), 0, code, null);
    assert.strictEqual(r.from, from, 'вид ' + code + ': от');
    assert.strictEqual(r.to, to, 'вид ' + code + ': до');
    assert.strictEqual(r.p, bytes.length, 'вид ' + code + ': длина');
  }
});

test('запись дома: вид 12 у правой группы — дельта от левой', () => {
  const left = { from: 10, to: 20 };
  const r = hn.group(B(((8 + 3) << 4) | (8 - 2)), 0, 12, left);
  assert.strictEqual(r.from, 13, 'левая плюс 3');
  assert.strictEqual(r.to, 18, 'левая минус 2');
});

test('список ссылок: длинная форма даёт блок и номер записи, короткая — сдвиг', () => {
  const long = ref1(5, 0x1234 & 0x7ffe);
  const bytes = B(long[0] | 0x80, long[1], long[2],   // с продолжением
                  0x10 + 3);                          // короткий сдвиг +3
  const st = { block: 0xffff, ref: -1 };
  const r = hn.refs(bytes, 0, st);
  assert.strictEqual(r.p, bytes.length, 'список съеден ровно');
  assert.strictEqual(r.list.length, 2);
  assert.strictEqual(r.list[0].block, 5);
  assert.strictEqual(r.list[0].rec, (0x1234 & 0x7ffe) >> 1);
  assert.strictEqual(r.list[1].block, 5, 'блок тянется от прежнего элемента');
  assert.strictEqual(r.list[1].rec, r.list[0].rec + 3, 'сдвиг считается по записям');
});

test('дома имени: записи читаются, поток съедается ровно', () => {
  const rec = (kind, payload, refs) => [kind, ...payload, ...refs];
  const data = Buffer.from([
    ...rec(0x01, [0x07], ref1(2, 0x20)),                 // дом 7, левая сторона
    ...rec(0x10, [0x08], ref1(2, 0x24)),                 // дом 8, правая сторона
  ]);
  const sec = section([0, data.length], data);
  const h = header(sec);
  const r = hn.housesOf(sec, 0, h);
  assert.strictEqual(r.redirect, null);
  assert.strictEqual(r.end, h.data.off + data.length, 'поток съеден ровно');
  assert.deepStrictEqual(r.rows.map((x) => x.left), [[7, 7], [null, null]]);
  assert.deepStrictEqual(r.rows.map((x) => x.right), [[null, null], [8, 8]]);
  assert.deepStrictEqual(r.rows.map((x) => x.refs.length), [1, 1]);
  assert.strictEqual(r.rows[0].refs[0].block, 2);
});

test('дома имени: нулевой первый байт — перенаправление на другое имя', () => {
  const data = Buffer.from([0x00, 0x03]);          // i - 1 - 3
  const sec = section([0, data.length], data);
  const r = hn.housesOf(sec, 0, header(sec));
  assert.strictEqual(r.redirect, 0 - 1 - 3);
  assert.deepStrictEqual(r.rows, []);
});

test('семибитное число: первый байт идёт в старшие разряды целиком', () => {
  assert.strictEqual(hn.num7(B(0x27, 0x0b), 0).from, (0x27 << 7) | 0x0b);
  assert.strictEqual(hn.num7(B(0x02, 0x30), 0).from, (0x02 << 7) | 0x30);
  assert.strictEqual(hn.num7(B(0x01, 0x81, 0x02), 0).p, 3, 'продолжение по биту 7');
});
