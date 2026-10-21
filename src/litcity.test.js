'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const LC = require('./litcity');

const EU = ['LIT', 'LIT2', 'LIT3', 'LIT4'].map((d) => 'maps/pkgdb/' + d);
const AU = ['maps_small/pkgdb/LIT3GP_AN', 'maps_small/pkgdb/LIT3GP2_AN'];
const has = (ds) => ds.every((d) => fs.existsSync(d));

// Эмулятор пути прошивки сверен на заводе: перечисление по 0x2d, переход в
// следующий список только при 0x38 == 0 и граница 0x2b дают ровно столько
// имён, сколько у индекса в 0x65 (NZ 6796), и все имена малых стран.
test('завод EU: Ватикан 19 имён, Сан-Марино 25, все ведут на города', { skip: !has(EU) }, () => {
  const va = LC.cities(EU, 'VATICAN');
  assert.equal(va.cities.length, 19);
  assert.ok(va.cities.every((c) => c.type === 3));
  const sm = LC.cities(EU, 'SAN MARINO');
  assert.equal(sm.cities.length, 25);
});

test('завод AU: Новая Зеландия — 6796 имён = 0x65 индекса', { skip: !has(AU) }, () => {
  assert.equal(LC.cities(AU, 'NEW ZEALAND').cities.length, 6796);
  assert.equal(LC.countryByCode(AU, 130, 2).name, 'NEW ZEALAND');
});

test('FUN_08ccd098: у EU есть Сан-Марино, Кипра (113) нет', { skip: !has(EU) }, () => {
  assert.equal(LC.countryByCode(EU, 18, 3).why, 'ок');
  assert.match(LC.countryByCode(EU, 113, 3).why, /нет в наборе/);
});

// Дерево категорий (селектор 20): у Ватикана страна 176815:0 (имена — 18) и
// город 176815:238 (имена — 1) — группы 39, 41, 44…48, 8 категорий, 11 точек;
// список каждой группы — ровно объединение её категорий.
test('завод EU: поиск по категории у Ватикана — страна и город', { skip: !has(EU) }, () => {
  const KS = require('./litkeys');
  const o = KS.open(EU);
  const get = (b) => o.get(b);
  assert.deepEqual(LC.selectors(get, [176815, 0]).map((x) => x.sel), [9, 18, 20]);
  for (const [node, sel] of [[[176815, 0], 18], [[176815, 238], 1]]) {
    const r = LC.catSearch(get, node, sel);
    assert.equal(r.bad.length, 0);
    assert.deepEqual([...r.groups.keys()], [39, 41, 44, 45, 46, 47, 48]);
    assert.deepEqual(r.groups.get(39).cats, [7, 9, 10, 13, 21, 34, 40, 43]);
    assert.deepEqual(r.groups.get(47).cats, [10, 43]);
    assert.equal(r.groups.get(39).pois.size, 11);
    for (const [, e] of r.groups) {
      const u = new Set([].concat(...e.cats.map((c) => [...r.cats.get(c)])));
      assert.deepEqual([...u].sort(), [...e.pois].sort());
    }
  }
  o.L.vols.forEach((v) => fs.closeSync(v.fd));
});
