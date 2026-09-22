'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('./litpoi');

// Таблица категорий взята из ресурса NAVRESOURCE `XAC` прошивки и считается
// с единицы. Номера ниже проверены содержимым живых блоков: аптеки на Мальте,
// полицейские участки `PULIZIJA`, заправки в Боснии, медцентры в Португалии.
test('категории считаются с единицы', () => {
  assert.equal(P.category(43), 'APOTHEKE');
  assert.equal(P.category(45), 'POLIZEIWACHE');
  assert.equal(P.category(46), 'RESTAURANT');
  assert.equal(P.category(56), 'TANKSTELLE');
  assert.equal(P.category(174), 'ÄRZTL. DIENST');
  assert.equal(P.CATEGORIES.length, 192);
  assert.equal(P.category(1), 'ANSCHLUSSSTELLE');
  assert.equal(P.category(192), 'AUTOHOF');
});

// `getDetailLine` (0x08c9e3b8) сравнивает ПЕРВЫЙ байт строки с тегом и отдаёт
// остаток до перевода строки. Теги — цифры.
test('подробности разбираются по тегам строк', () => {
  const d = P.details('0FRN\n1FLORIANA\n2PJAZZA SAN KALĊIDONJU\n4+(356)-21236719\n');
  assert.deepEqual(d, { post: 'FRN', city: 'FLORIANA',
                        street: 'PJAZZA SAN KALĊIDONJU', phone: '+(356)-21236719' });
});

test('номер дома, бренд и вид кухни — свои теги', () => {
  const d = P.details('3371\n6SIXT\n79\n');
  assert.equal(d.house, '371');
  assert.equal(d.brand, 'SIXT');
  assert.equal(d.food, '9');
});

test('незнакомый тег не теряется, а складывается в unknown', () => {
  const d = P.details('1PORTO\nZнечто\n');
  assert.equal(d.city, 'PORTO');
  assert.deepEqual(d.unknown, { Z: 'нечто' });
});

// Опорная точка блока — два знаковых четырёхбайтовых числа заголовка,
// ширина координат — байт 3 (правило 3 грамматики).
test('опорная точка и ширина читаются из заголовка блока', () => {
  const b = Buffer.alloc(16);
  b[3] = 12;
  b.writeInt32BE(1042883, 4);
  b.writeInt32BE(3987452, 8);
  assert.deepEqual(P.origin(b), { x: 1042883, y: 3987452, width: 12 });
});

test('проекция та же, что у XAC', () => {
  assert.ok(Math.abs(1042883 / 72000 - 14.4845) < 0.001);
  assert.ok(Math.abs(3987452 / P.DEG - 35.8871) < 0.001);
});
