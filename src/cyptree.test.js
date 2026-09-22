'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const T = require('./cyptree');

const pt = (x, y) => ({ x, y, name: 'P' + x + '_' + y, cat: 56 });

test('рамка набора точек', () => {
  assert.deepEqual(T.bbox([pt(10, 20), pt(30, 5), pt(20, 40)]),
                   { x0: 10, y0: 5, x1: 30, y1: 40 });
});

// Завод делит длинную сторону: у 327 узлов из 327 рамки потомков смыкаются
// ровно по одной оси. Делим так же.
test('деление идёт по длинной стороне', () => {
  const wide = [pt(0, 0), pt(100, 1), pt(200, 2), pt(300, 3)];
  const [a, b] = T.split(wide);
  assert.ok(Math.max(...a.map((p) => p.x)) <= Math.min(...b.map((p) => p.x)));
  const tall = [pt(0, 0), pt(1, 100), pt(2, 200), pt(3, 300)];
  const [c, d] = T.split(tall);
  assert.ok(Math.max(...c.map((p) => p.y)) <= Math.min(...d.map((p) => p.y)));
});

test('деление делит пополам и ничего не теряет', () => {
  const list = Array.from({ length: 9 }, (_, i) => pt(i * 10, 0));
  const [a, b] = T.split(list);
  assert.equal(a.length + b.length, 9);
  assert.equal(a.length, 4);
});

// Ключи раздаются обходом в глубину, и корень обязан получить НОЛЬ: родитель
// в заводском дереве уже указывает на (112447, 0), и менять его нельзя.
test('корень получает ключ ноль, ссылки на листья ведут в их блоки', () => {
  const tree = { a: { pois: [pt(0, 0), pt(10, 0)] },
                 b: { a: { pois: [pt(100, 0)] }, b: { pois: [pt(200, 0)] } } };
  const link = (leaf) => [1000 + leaf.pois[0].x, 0];
  const ns = T.nodes(tree, { x: 0, y: 0 }, link);
  assert.equal(ns.length, 2);                       // два внутренних узла
  assert.deepEqual(ns[0].a, [1000, 0]);             // A — лист
  assert.deepEqual(ns[0].b, [T.ROOT.block, 1]);     // B — второй узел, ключ 1
  assert.deepEqual(ns[1].a, [1100, 0]);
  assert.deepEqual(ns[1].b, [1200, 0]);
  assert.equal(ns[0].x79, null, 'лишние ссылки пишутся сбросом');
  assert.equal(ns[0].n42, 0);
});

test('рамка узла накрывает обе половины', () => {
  const tree = { a: { pois: [pt(0, 0)] }, b: { pois: [pt(100, 50)] } };
  const ns = T.nodes(tree, { x: 0, y: 0 }, () => [1, 0]);
  assert.deepEqual(ns[0].aMin, [0, 0]);
  assert.deepEqual(ns[0].aMax, [0, 0]);
  assert.deepEqual(ns[0].bMin, [100, 50]);
  assert.deepEqual(ns[0].bMax, [100, 50]);
});

// Сбор идёт по КАЖДОЙ подошедшей половине, а не по одной: точка на смыкании
// рамок иначе потерялась бы.
test('сбор по рамке обходит обе половины', () => {
  const blocks = {
    1: { origin: { x: 0, y: 0 },
         elems: [{}, { '#': 0x22, 0x61: [0, 0], 0x60: [100, 100],
                       0x64: [100, 0], 0x63: [200, 100],
                       0x5f: [2, 0], 0x62: [3, 0] }] },
    2: { origin: { x: 0, y: 0 }, elems: [{}, { '#': 0x23, 0x42: 1 }] },
    3: { origin: { x: 0, y: 0 }, elems: [{}, { '#': 0x23, 0x42: 1 }] },
  };
  const get = (i) => blocks[i];
  const one = T.collect(get, 1, 0, { x0: 10, y0: 10, x1: 20, y1: 20 }, new Set(), 0);
  assert.deepEqual([...one], [2]);
  const both = T.collect(get, 1, 0, { x0: 99, y0: 10, x1: 101, y1: 20 }, new Set(), 0);
  assert.deepEqual([...both].sort(), [2, 3]);
});

// Цепочка от корня — это потолок: точка вне любой её рамки не найдётся.
test('цепочка идёт по той половине, что накрыла точку', () => {
  const blocks = {
    1: { origin: { x: 0, y: 0 },
         elems: [{}, { '#': 0x22, 0x61: [0, 0], 0x60: [100, 100],
                       0x64: [100, 0], 0x63: [200, 100],
                       0x5f: [2, 0], 0x62: [9, 0] }] },
    2: { origin: { x: 0, y: 0 },
         elems: [{}, { '#': 0x22, 0x61: [0, 0], 0x60: [50, 100],
                       0x64: [50, 0], 0x63: [100, 100],
                       0x5f: [3, 0], 0x62: [4, 0] }] },
    3: { origin: { x: 0, y: 0 }, elems: [{}, { '#': 0x23, 0x42: 1 }] },
    4: { origin: { x: 0, y: 0 }, elems: [{}, { '#': 0x23, 0x42: 1 }] },
  };
  const ch = T.chain((i) => blocks[i], { block: 1, key: 0 }, 10, 10);
  assert.deepEqual(ch.map((c) => c.blk + ':' + c.key + c.half), ['1:0A', '2:0A']);
  assert.deepEqual(ch[0].box, { x0: 0, y0: 0, x1: 100, y1: 100 });
  const right = T.chain((i) => blocks[i], { block: 1, key: 0 }, 80, 10);
  assert.deepEqual(right.map((c) => c.half), ['A', 'B']);
});

test('цепочка останавливается, когда точка не попала ни в одну половину', () => {
  const blocks = {
    1: { origin: { x: 0, y: 0 },
         elems: [{}, { '#': 0x22, 0x61: [0, 0], 0x60: [10, 10],
                       0x64: [10, 0], 0x63: [20, 10], 0x5f: [2, 0], 0x62: [2, 0] }] },
    2: { origin: { x: 0, y: 0 }, elems: [{}, { '#': 0x23, 0x42: 1 }] },
  };
  assert.equal(T.chain((i) => blocks[i], { block: 1, key: 0 }, 500, 500).length, 0);
});
