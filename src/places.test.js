'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('./places');

test('города: двойники по координате склеиваются, имя — по name:en', () => {
  const list = [
    { name: 'LEMESOS', lon: 33.0332657, lat: 34.6852901 },
    { name: 'LIMASSOL', lon: 33.0332657, lat: 34.6852901 },
    { name: 'DHALI', lon: null, lat: null },
    { name: 'PAFOS', lon: 32.42, lat: 34.77 },
  ];
  const en = new Map([[P.key(list[0]), 'LIMASSOL']]);
  assert.deepEqual(P.dedupe(list, en).map((p) => p.name), ['LIMASSOL', 'DHALI', 'PAFOS']);
  assert.deepEqual(P.dedupe(list, null).map((p) => p.name), ['LEMESOS', 'DHALI', 'PAFOS']);
});
