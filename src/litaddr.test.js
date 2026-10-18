'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const A = require('./litaddr');
const CL = require('./cyplit');

const LIT = 'maps/pkgdb/LIT/EJ211Ga_L1.db';
const FACTORY = ['LIT', 'LIT2', 'LIT3', 'LIT4'].map((d) => path.join('maps/pkgdb', d));
const haveMaps = fs.existsSync(LIT) && FACTORY.every((d) => fs.existsSync(d));

// Ключи: структура — K, виток i — K + 1 + i; список из n имён съедает n + 1.
test('раздача ключей: список из трёх имён занимает четыре ключа', () => {
  const blocks = [{ blk: 7, origin: { x: 0, y: 0 }, width: 24, records: [
    A.list('a', [{ name: 'A', target: null }, { name: 'B', target: null }, { name: 'C', target: null }],
           { direct: true, owner: null }),
    A.street('s', { center: [1, 1] }),
  ] }];
  const pos = A.layout(blocks);
  assert.deepEqual(pos.get('a'), [7, 0]);
  assert.deepEqual(pos.get('a#0'), [7, 1]);
  assert.deepEqual(pos.get('a#2'), [7, 3]);
  assert.deepEqual(pos.get('s'), [7, 4]);
  assert.equal(blocks[0].count, 5);
});

test('имя: байт приставки и длины, приставка от предыдущего имени', () => {
  const r = A.list('l', [{ name: 'LIMASSOL', target: null }, { name: 'LIMNI', target: null }],
                   { direct: true, owner: null });
  const t = r.tokens();
  assert.equal(t[0].u8, 0xd1, 'бит 0 — список висит прямо на объекте');
  assert.equal(t[1].u8, 2, 'без владельца, два имени');
  assert.equal(t[2].u8, 8);                              // приставка 0, длина 8
  assert.equal(t[5].u8, (3 << 5) | 2);                   // LIM + NI
  assert.equal(t[6].raw.toString(), 'NI');
});

test('больше 50 имён: индекс по первой букве и списки не длиннее 50', () => {
  const items = [];
  for (let i = 0; i < 130; i++) items.push({ name: String.fromCharCode(65 + (i % 5)) + 'X' + String(i).padStart(3, '0') });
  const r = A.names('t', items, 'owner');
  const idx = r.records[0];
  assert.equal(idx.sym, 't:idx');
  assert.equal(idx.n, 5, 'по ветви на букву');
  for (const rec of r.records.slice(1)) {
    assert.ok(rec.n <= A.LIST_MAX);
    assert.equal(rec.tokens()[0].u8, 0xd0, 'списки под индексом — бит 0 сброшен');
  }
  assert.equal(r.records.slice(1).reduce((s, x) => s + x.n, 0), 130);
});

test('не больше 50 имён: список прямо на объекте, без индекса', () => {
  const r = A.names('t', [{ name: 'B' }, { name: 'A' }], 'owner');
  assert.equal(r.records.length, 1);
  assert.equal(r.head, 't:l0');
  assert.equal(r.last, 't:l0#1');
});

// Синтетика с обоими путями: страна с индексом городов (60 > 50), город с
// индексом улиц (120) и город с тремя улицами. Читаем обратно грамматикой
// заводского TTD и обходим, как ввод цели.
function model() {
  const places = [], streets = [];
  for (let i = 0; i < 60; i++) {
    places.push({ name: String.fromCharCode(65 + (i % 7)) + 'TOWN ' + i, x: 2340000 + i * 900, y: 3860000 + (i % 9) * 700 });
  }
  for (let j = 0; j < 120; j++) {
    const x = 2340000 + j * 10, y = 3860000 + j * 7;
    streets.push({ name: String.fromCharCode(65 + (j % 9)) + ' STREET ' + j, place: 0, pts: [[x, y], [x + 50, y + 30]] });
  }
  for (let j = 0; j < 3; j++) streets.push({ name: 'ROAD ' + j, place: 5, pts: [[2344500, 3863500], [2344600, 3863600]] });
  return { code: 113, iso2: 'CY', iso3: 'CYP', places, streets };
}

const pois = (n) => Array.from({ length: n }, (_, i) => ({
  x: 2318400 + (i % 30) * 370, y: 3833333 + Math.floor(i / 30) * 410, name: 'POI ' + i, cat: 56,
}));

test('справочник читается обратно: страна -> 60 городов -> 123 улицы', { skip: !haveMaps }, () => {
  const r = CL.build(pois(300), { template: CL.template(LIT), addr: model(), cap: 1500 });
  const rep = CL.verify(r.buf, r, pois(300));
  assert.equal(rep.keysOk, rep.blocks, 'число ключей совпало с заголовком у каждого блока');
  assert.equal(rep.parsedOk, rep.blocks, 'каждый блок дочитан до конца');
  assert.equal(rep.addr.code, 113);
  assert.deepEqual(rep.addr.iso, ['CY', 'CYP']);
  assert.equal(rep.addr.cities.length, 60);
  assert.equal(rep.addr.streets, 123);
  assert.deepEqual(rep.addr.errors, []);
  assert.equal(rep.hit, rep.seen, 'дерево POI с заголовком слоя находится от ключа 1');
  assert.ok(!rep.bad);
});

test('с заводскими частями: таблицы, заголовок POI и языки корня', { skip: !haveMaps }, () => {
  const r = CL.build(pois(300), { template: CL.template(LIT), addr: model(), factory: FACTORY, cap: 1500 });
  assert.equal(r.poiHeader, 31);
  const rep = CL.verify(r.buf, r, pois(300));
  assert.equal(rep.poiPath, true, 'корень 0x4a -> 0x20 -> 0x21');
  assert.equal(rep.addr.cities.length, 60);
  assert.ok(!rep.bad);
});
