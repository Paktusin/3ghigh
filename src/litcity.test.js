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
