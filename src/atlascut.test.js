'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('./atlascut');

// Раскладка SOAR: каждая точка сетки (2^n+1)^2 получает свой номер, одна и та
// же точка из двух соседних треугольников — один и тот же, номера плотные:
// последний (5·4^n + 4)/3.
test('номера точек SOAR плотные и однозначные', () => {
  for (let n = 1; n <= 6; n++) {
    const W = 2 ** n, seen = new Set();
    A.walk(n, [0, 0, W, W], (i) => seen.add(i));
    assert.equal(seen.size, (W + 1) ** 2, 'n=' + n);
    assert.equal(Math.min(...seen), 0);
    assert.equal(Math.max(...seen), (5 * 4 ** n + 4) / 3);
  }
});

test('при глубине 16 и контейнере 8192 выходит заводское число контейнеров', () => {
  assert.equal(Math.floor((5 * 4 ** A.N + 4) / 3 / A.CSIZE) + 1, 873814);
});

test('рамка Кипра лежит внутри сетки, контейнер корня в наборе', () => {
  const b = A.gridBox(A.CYPRUS), W = 2 ** A.N;
  assert.ok(b.every((v) => v > 0 && v < W));
  assert.ok(b[0] < b[2] && b[1] < b[3]);
  const keep = A.containersFor(A.CYPRUS);
  assert.ok(keep.has(0));
  assert.ok(keep.size > 500 && keep.size < 5000);
});
