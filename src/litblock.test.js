'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const B = require('./litblock');
const C = require('./cyppoi');
const P = require('./litpoi');
const D = require('./litdict');

// Ведущий байт записи-тайла — весь байт 0x96 (правило 32 диспетчера), за ним
// varint с числом точек, лежащих в этом же блоке.
test('запись-тайл — ведущий байт и счётчик точек', () => {
  assert.deepEqual([...B.writeTile(null, new Array(3))], [0x96, 3]);
  // varint каноничен: до 251 один байт, дальше escape 252 и два байта
  assert.deepEqual([...B.writeTile({ count: 251 })], [0x96, 251]);
  assert.deepEqual([...B.writeTile({ count: 365 })], [0x96, 252, 0x01, 0x6d]);
});

// Заголовок блока: u16 число элементов, байт 0, байт ширины, две опоры s32,
// байт числа кодов и сам словарь.
test('заголовок блока пишется по грамматике', () => {
  const dict = new Map([[1, Buffer.from('AB', 'latin1')]]);
  const h = B.writeHeader({ origin: { x: -2252800, y: 3067904 }, width: 12,
                            count: 5, dict: dict });
  assert.equal(h.readUInt16BE(0), 5);
  assert.equal(h[2], 0);
  assert.equal(h[3], 12);
  assert.equal(h.readInt32BE(4), -2252800);
  assert.equal(h.readInt32BE(8), 3067904);
  assert.equal(h[12], 1);
  assert.deepEqual(D.dict(h).codes.get(1), Buffer.from('AB', 'latin1'));
});

test('опора блока — минимум по осям, ширина наименьшая подходящая', () => {
  assert.deepEqual(B.fit([{ x: 100, y: 200 }, { x: 300, y: 250 }]),
                   { x0: 100, y0: 200, width: 8 });
  assert.deepEqual(B.fit([{ x: 0, y: 0 }, { x: 5000, y: 10 }]),
                   { x0: 0, y0: 0, width: 16 });
  assert.equal(B.fit([{ x: 0, y: 0 }, { x: 4000, y: 0 }]).width, 12);
});

// Подробности — строки с однобайтовым тегом, в том же порядке, что у завода.
test('подробности собираются по тегам', () => {
  assert.equal(B.detailText({ post: '8046', city: 'PAPHOS', street: 'APOSTOLOU PAVLOU',
                              house: '16', phone: '+(357)-26123456' }),
               '08046\n1PAPHOS\n2APOSTOLOU PAVLOU\n316\n4+(357)-26123456\n');
  assert.equal(B.detailText({}), '');
});

// Собранная модель обязана сойтись сама с собой: сколько точек положили,
// столько и объявлено в записи-тайле и в заголовке блока.
test('модель: счётчики сходятся, координаты в разрядности', () => {
  const pois = [
    { x: 2376000, y: 3888889, cat: 56, name: 'EKO', city: 'PAPHOS', id: 1 },
    { x: 2376100, y: 3888989, cat: 43, name: 'PHARMACY', id: 2 },
  ];
  const m = B.model(pois);
  assert.equal(m.tile.count, 2);
  assert.equal(m.count, 3);
  assert.equal(m.pois.length, 2);
  const span = Math.pow(2, m.width);
  for (const p of m.pois) {
    assert.ok(p.xy[0] >= 0 && p.xy[0] < span);
    assert.ok(p.xy[1] >= 0 && p.xy[1] < span);
  }
  assert.equal(m.pois[0].flags, B.F_FULL);
});

test('вид кухни взводит бит 0 флагов', () => {
  const m = B.model([{ x: 0, y: 0, cat: 46, name: 'PIZZA', food: 9, id: 1 }]);
  assert.equal(m.pois[0].flags, B.F_FULL | B.F_FOOD);
});

test('название и подробности сжимаются словарём блока', () => {
  const m = B.model([{ x: 0, y: 0, cat: 46, name: 'RESTAURANT ALPHA', city: 'LARNACA', id: 1 },
                     { x: 10, y: 10, cat: 46, name: 'RESTAURANT BETA', city: 'LARNACA', id: 2 }]);
  const back = (buf) => D.expand(m.dict, buf).toString('utf8');
  assert.equal(back(m.pois[0].name), 'RESTAURANT ALPHA');
  assert.equal(back(m.pois[1].name), 'RESTAURANT BETA');
  assert.ok(back(m.pois[0].details).includes('LARNACA'));
  assert.ok(m.dict.size > 0, 'словарь должен набраться');
});

// Хвостовые циклы (бит 1) встречаются у 444 записей из 27 329 и писателем не
// поддержаны — это должно быть отказом, а не молчаливой потерей данных.
test('хвостовые циклы писатель отвергает вслух', () => {
  const st = { x: 0, y: 0, base: 0, first: true };
  assert.throws(() => B.writePoi({ flags: B.F_TAIL, ref: [0, 0], xy: [0, 0] }, 12, st),
                /хвостовые циклы/);
});

// --- отбор точек Кипра ------------------------------------------------------

test('категории OSM переводятся в номера таблицы прошивки', () => {
  assert.equal(C.classify({ amenity: 'fuel' }).cat, 56);
  assert.equal(P.category(C.classify({ amenity: 'fuel' }).cat), 'TANKSTELLE');
  assert.equal(P.category(C.classify({ amenity: 'pharmacy' }).cat), 'APOTHEKE');
  assert.equal(P.category(C.classify({ amenity: 'police' }).cat), 'POLIZEIWACHE');
  assert.equal(C.classify({ amenity: 'recycling' }), null);   // мусорка машине не нужна
});

test('все категории таблицы соответствий есть в таблице прошивки', () => {
  for (const [, , name] of C.MAP) assert.ok(P.CATEGORIES.includes(name), name);
});

test('название берётся латиницей и приводится к прописной', () => {
  assert.equal(C.nameOf({ name: 'Λεμεσός' }), 'LEMESOS');
  assert.equal(C.nameOf({ name: 'Λεμεσός', 'name:en': 'Limassol' }), 'LIMASSOL');
  assert.equal(C.nameOf({ ref: 'A1' }), null);
});

// Отбор обязан оставлять каждую категорию: строгая важность даёт карту из
// одних заправок, а это бесполезно.
test('отбор чередует категории, важные чаще', () => {
  const many = (cat, rank, n) => Array.from({ length: n },
    (_, i) => ({ cat, rank, lon: i, name: 'X' + i }));
  const list = [...many(56, 0, 100), ...many(43, 3, 100), ...many(107, 41, 100)];
  const head = C.order(list).slice(0, 30);
  const by = new Map();
  for (const p of head) by.set(p.cat, (by.get(p.cat) || 0) + 1);
  assert.equal(by.size, 3, 'в первых тридцати должны быть все три категории');
  assert.ok(by.get(56) > by.get(107), 'заправок должно быть больше, чем зоопарков');
});
