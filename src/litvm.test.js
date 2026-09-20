'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('./litvm');

// Маленькие грамматики проверяют управление потоком без многогигабайтной базы.
const target = (i) => (i + 1) * 10;
const rule = (op, arg = 0, type = 0, to = 0, k = 0) =>
  [op, arg, type, 0, to, k, 0, 0, 0, 0];
const schema = (rules) => ({ words: Array(10).fill(0).concat(rules.flat()), first: 10, stride: 10 });

test('пустой 0xa2 исполняет переход завершающей 0x11', () => {
  const s = schema([
    rule(0x10), rule(0xa2), rule(0x26, 0, 1),
    rule(0x11, 0, 0, target(5)), rule(0xc3), rule(0x26, 0, 2),
  ]);
  const r = run(s, Buffer.from([42]), 0);
  assert.equal(r.why, 'данные кончились');
  assert.equal(r.pos, 1);
  assert.equal(r.records[0][2], 42);
  assert.equal(r.records[0][1], undefined);
});

test('пустой 0xa2 в подпрограмме возвращается через 0x11', () => {
  const s = schema([
    rule(0x10), rule(0xc1, 0, 0, target(4)), rule(0x26, 0, 2), rule(0xc3),
    rule(0x10), rule(0xa2), rule(0x26, 0, 1), rule(0x11), rule(0xc3),
  ]);
  const r = run(s, Buffer.from([73]), 0);
  assert.equal(r.why, 'данные кончились');
  assert.equal(r.records[0][2], 73);
});

test('пустой 0xa0 пропускает 0xa1, в отличие от 0xa2', () => {
  const s = schema([
    rule(0x10), rule(0xa0), rule(0x26, 0, 1), rule(0xa1), rule(0x26, 0, 2),
  ]);
  const r = run(s, Buffer.from([91]), 0);
  assert.equal(r.why, 'данные кончились');
  assert.equal(r.records[0][2], 91);
});

test('непустой 0xa2 читает заданное число элементов', () => {
  const s = schema([
    rule(0x10), rule(0x80, 8, 0, 0, 2), rule(0xa2), rule(0x26, 0, 1),
    rule(0x11, 0, 0, target(6)), rule(0xc3), rule(0x26, 0, 2),
  ]);
  const r = run(s, Buffer.from([10, 20, 30]), 0);
  assert.equal(r.why, 'данные кончились');
  assert.equal(r.records[0][1], 20);
  assert.equal(r.records[0][2], 30);
});

// Кадр чистится целиком (FUN_08cd066c) в двух местах: при вызове — у
// вызываемого, при переходе 0x11 по w4 — у текущего. Без этого регистр
// перетекал из записи в запись и условия читали чужие биты.

test('вызов отдаёт подпрограмме пустой регистр', () => {
  const s = schema([
    rule(0x10), rule(0x26, 4), rule(0xc1, 0, 0, target(5)), rule(0x26, 0, 2), rule(0xc3),
    rule(0x10), rule(0x81, 0, 1, 0, 8), rule(0x11),
  ]);
  const r = run(s, Buffer.from([0xab, 0x07]), 0);
  assert.equal(r.why, 'данные кончились');
  // 0x81 читает младший байт регистра уже в кадре подпрограммы
  assert.equal(r.records.find((x) => 1 in x)[1], 0);
  assert.equal(r.records.find((x) => 2 in x)[2], 7);
});

test('аргумент вызова переживает чистку кадра', () => {
  const s = schema([
    rule(0x10), rule(0xc1, 0, 0, target(3), 0x37), rule(0xc3),
    rule(0x10), rule(0x60, 0, 1), rule(0x11),
  ]);
  const r = run(s, Buffer.from([0x07]), 0);
  assert.equal(r.records.find((x) => 1 in x)[1], 0x37);
});

test('0x11 с w4 переходит, а не возвращается из подпрограммы', () => {
  const s = schema([
    rule(0x10), rule(0xc1, 0, 0, target(4)), rule(0x26, 0, 1), rule(0xc3),
    rule(0x10), rule(0x11, 0, 0, target(6)),
    rule(0x10), rule(0x26, 0, 2),
  ]);
  const r = run(s, Buffer.from([0x5a]), 0);
  assert.equal(r.why, 'данные кончились');
  assert.equal(r.records.find((x) => 2 in x)[2], 0x5a);   // ушли по w4
  assert.equal(r.records.find((x) => 1 in x), undefined); // а не вернулись за вызов
});

test('переход 0x11 по w4 чистит регистр текущего кадра', () => {
  const s = schema([
    rule(0x10), rule(0x26, 4), rule(0x11, 0, 0, target(3)),
    rule(0x10), rule(0x81, 0, 1, 0, 8), rule(0x26, 0, 2),
  ]);
  const r = run(s, Buffer.from([0xab, 0x07]), 0);
  assert.equal(r.why, 'данные кончились');
  assert.equal(r.records.find((x) => 1 in x)[1], 0);
  assert.equal(r.records.find((x) => 2 in x)[2], 7);
});
