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

// Наша машина рвёт запись кодом 0x65, когда продолжение не начинается кодом
// 0x10 — так заголовок слоя выходит двумя кусками. Для прошивки это один
// элемент, и без слияния вся нумерация ключей после него съезжает на единицу.
test('записи без своего типа сливаются в предыдущую', () => {
  const recs = [
    { 0x25: -2252800, 0x26: 3067904 },              // заголовок блока
    { '#': 0x21, 0x41: 3999970 },                   // заголовок слоя
    { 0x62: [101201, 0] },                          // его же хвост
    { '#': 0x22, 0x5f: [101099, 2] },               // корневой узел
  ];
  const e = P.elemsOf(recs);
  assert.equal(e.length, 3);
  assert.deepEqual(e[1], { '#': 0x21, 0x41: 3999970, 0x62: [101201, 0] });
  assert.equal(e[2]['#'], 0x22);
});

test('ключ 0 — первый элемент после заголовка блока', () => {
  const e = P.elemsOf([{ 0x25: 0 }, { '#': 0x21 }, { '#': 0x22 }, { '#': 0x23 }]);
  assert.equal(P.elemAt(e, 0)['#'], 0x21);
  assert.equal(P.elemAt(e, 1)['#'], 0x22);
  assert.equal(P.elemAt(e, 2)['#'], 0x23);
});

// Спуск идёт по той половине, в которую попала точка; ссылка половины A — это
// поле 0x5f, половины B — 0x62.
test('спуск выбирает половину, накрывшую точку', () => {
  const blocks = {
    1: { origin: { x: 0, y: 0 },
         elems: [{}, { '#': 0x22, 0x61: [0, 0], 0x60: [72000, 200000],
                       0x64: [72000, 0], 0x63: [144000, 200000],
                       0x5f: [1, 1], 0x62: [2, 0] },
                 { '#': 0x23, 0x42: 7 }] },
    2: { origin: { x: 0, y: 0 }, elems: [{}, { '#': 0x23, 0x42: 9 }] },
  };
  const get = (i) => blocks[i];
  const left = P.descend(get, 0.5, 1.0, { block: 1, key: 0 });   // половина A
  assert.equal(left.why, 'лист');
  assert.equal(left.count, 7);
  const right = P.descend(get, 1.5, 1.0, { block: 1, key: 0 });  // половина B
  assert.equal(right.why, 'лист');
  assert.equal(right.block, 2);
  assert.equal(right.count, 9);
});
