'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const xl = require('./xaclevel');
const xw = require('./xacwrite');

test('слово длины: мантисса 12 бит со сдвигом на чётное число', () => {
  const back = (w) => (w & 0x0fff) << ((w & 0x7000) >> 11);
  assert.equal(back(xw.lengthWord(214)), 214);
  assert.equal(back(xw.lengthWord(16688)), 16688);                 // 0x2413 у завода
  assert.equal(xw.lengthWord(16688), 0x2413);
  assert.ok(Math.abs(back(xw.lengthWord(207552)) - 207552) <= 8);
});

test('LAYER 1 VERWEISE: записи A, списки и коридор читаются обратно', () => {
  const m = { nodes: [{}, {}, {}], vecs: [] };
  const v0 = { els: [{ vid: (2 << 16) | (292 * 2), fwd: 1, n: 5 }], corridor: [6] };
  const v1 = { els: [{ vid: (0 << 16) | (0x0f2 * 2), fwd: 1, n: 1 }, { vid: (3 << 16) | 10, fwd: 0, n: 2 }], corridor: [0, 1, 4, 300] };
  const lay = { list: [0, 1, 2], recs: [{ vecs: [v0] }, { vecs: [] }, { vecs: [v1] }], first: [1, 2, 3] };
  const r = xl.verweise(m, lay);
  const d = r.section;
  assert.equal(d.toString('latin1', 0, 16), 'LAYER 1 VERWEISE');
  assert.equal(d.readUInt32BE(0x1c), 48);
  const back = xl.readVerweise(d);
  assert.deepEqual(back.keys, [{ blk: 0, ref: 2 }, { blk: 0, ref: 6 }]);
  assert.equal(back.lists.length, 2);
  assert.deepEqual(back.lists[0].els.map((e) => [e.n, e.blk, e.fwd, e.start, e.ent]), [[5, 2, 1, 1, 292]]);
  assert.deepEqual(back.lists[1].els.map((e) => [e.n, e.blk, e.fwd, e.start, e.ent]), [[1, 0, 1, 1, 0xf2], [2, 3, 0, 0, 5]]);
  assert.deepEqual(back.lists[1].corridor.map((c) => c.blk), [0, 1, 4, 300]);
  assert.equal(r.count, 1 + 1 + 2 + 4);
});
