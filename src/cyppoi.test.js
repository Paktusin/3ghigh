'use strict';
const test = require('node:test');
const assert = require('node:assert');
const c = require('./cyppoi');

test('точечные правила: AlphaGrand — AUDI SERVICE, салон Audi — AUDI ZENTRUM, раньше общего соответствия', () => {
  assert.equal(c.classify({ name: 'AlphaGrand AutoService', shop: 'car_repair' }).category, 'AUDI SERVICE');
  assert.equal(c.classify({ name: 'Unicars', shop: 'car', brand: 'Audi;Volkswagen' }).category, 'AUDI ZENTRUM');
  assert.equal(c.classify({ name: 'VW', shop: 'car', brand: 'Volkswagen' }).category, 'AUTOHÄNDLER');
});

test('переназначения: храмы — KULTURDENKMAL, супермаркеты — LEBENSMITTEL, одежда остаётся в своей категории', () => {
  assert.equal(c.classify({ amenity: 'place_of_worship' }).category, 'KULTURDENKMAL');
  assert.equal(c.classify({ shop: 'supermarket' }).category, 'LEBENSMITTEL');
  assert.equal(c.classify({ shop: 'clothes' }).category, 'BEKLEIDUNG');
  assert.equal(c.classify({ shop: 'department_store' }).category, 'EINKAUFSZENTRUM');
});

test('TOURIST INFO — только офисы, щиты и указатели не берём', () => {
  assert.equal(c.classify({ tourism: 'information', information: 'office' }).category, 'TOURIST INFO');
  assert.equal(c.classify({ tourism: 'information', information: 'board' }), null);
  assert.equal(c.classify({ tourism: 'information' }), null);
});
