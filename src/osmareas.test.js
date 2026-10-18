'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('./osmareas');

test('площадные: теги OSM → классы GDB', () => {
  assert.equal(A.classify({ natural: 'water', water: 'reservoir' }), 'water');
  assert.equal(A.classify({ natural: 'water', water: 'salt' }), 'water');
  assert.equal(A.classify({ landuse: 'forest' }), 'forest');
  assert.equal(A.classify({ natural: 'wood' }), 'forest');
  assert.equal(A.classify({ boundary: 'national_park' }), 'park');
  assert.equal(A.classify({ landuse: 'residential' }), 'built');
  assert.equal(A.classify({ landuse: 'industrial' }), 'industrial');
  assert.equal(A.classify({ aeroway: 'aerodrome' }), 'airport');
  assert.equal(A.classify({ landuse: 'farmland' }), null);
});

test('площадные: линии мультиполигона сшиваются в кольцо, в том числе развёрнутые', () => {
  const rings = A.stitch([{ refs: [1, 2, 3] }, { refs: [5, 4, 3] }, { refs: [5, 6, 1] }]);
  assert.equal(rings.length, 1);
  assert.equal(rings[0][0], rings[0][rings[0].length - 1]);
  assert.equal(new Set(rings[0]).size, 6);
});
