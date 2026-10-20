'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('./xacsplit');
const roads = require('./xacroads');
const nv = require('./nullvec');
const xg = require('./xacgraph');

// Сетка 4×1 ячейки по 1000 единиц; узлы гуще слева, ребро 1–2 пересекает x = 2000.
const grid = { x0: 0, y0: 0, nx: 4, ny: 1, step: 1000 };
const graph = {
  nodes: [{ x: 100, y: 500 }, { x: 900, y: 500 }, { x: 3100, y: 600 }, { x: 3500, y: 300 }],
  edges: [{ a: 0, b: 1, frc: 4, name: 0, raw: -1 }, { a: 1, b: 2, frc: 4, name: 1, raw: -1 },
          { a: 2, b: 3, frc: 4, name: -1, raw: -1 }],
  names: ['A', 'B'], rawNames: [],
};

test('зоны делятся по узлам и по границе ячеек', () => {
  assert.deepEqual(S.zones(graph, grid, 4), [[0, 0, 4, 1]]);
  assert.deepEqual(S.zones(graph, grid, 2), [[0, 0, 3, 1], [3, 0, 4, 1]]);
  assert.deepEqual(S.neighbors([[0, 0, 1, 1], [1, 0, 4, 1], [5, 5, 6, 6]]), [[1], [0], []]);
});

test('ребро на границе режется: точка разреза в обоих тайлах, по записи у каждой копии', () => {
  const sp = S.cut(graph, grid, [[0, 0, 2, 1], [2, 0, 4, 1]]);
  assert.deepEqual(sp.where.map((w) => w.tile), [0, 0, 1, 1]);
  assert.equal(sp.halves[1].length, 2);
  const [l0] = sp.tiles[0].links, [l1] = sp.tiles[1].links;
  assert.deepEqual([l0.tile, l1.tile, l0.twin, l1.twin], [1, 0, l1.node, l0.node]);
  const m0 = sp.tiles[0].nodes[l0.node], m1 = sp.tiles[1].nodes[l1.node];
  assert.deepEqual(m0, m1, 'одна координата');
  assert.equal(m0.x, 1999, 'внутри своей зоны, у самой границы');
  for (const [t, n] of [[0, l0.node], [1, l1.node]]) {
    assert.equal(sp.tiles[t].edges.filter((e) => e.a === n || e.b === n).length, 1);
  }
  // направление ребра сохраняется: a -> разрез, разрез -> b
  const h0 = sp.tiles[0].edges[sp.halves[1][0].edge], h1 = sp.tiles[1].edges[sp.halves[1][1].edge];
  assert.deepEqual([h0.a, h0.b, h1.a, h1.b], [sp.where[1].local, l0.node, l1.node, sp.where[2].local]);
  // имена перенумерованы по тайлу
  assert.deepEqual(sp.tiles[0].names, ['A', 'B']);
  assert.deepEqual(sp.tiles[1].names, ['B']);
  assert.equal(h1.name, 0);
  // запрет поворота в узле 2 из куска ребра 1 в ребро 2
  const bans = S.bansByTile(sp, new Map([[2, [{ from: 1, to: 2 }]]]));
  assert.deepEqual(bans[1].get(sp.where[2].local), [{ from: sp.halves[1][1].edge, to: sp.halves[2][0].edge }]);
});

test('нульвекторы двух тайлов разрешаются в двойника в обе стороны', () => {
  const sp = S.cut(graph, grid, [[0, 0, 2, 1], [2, 0, 4, 1]]);
  const attrIdx = { 4: 1 };
  const plan = sp.tiles.map((tl) => roads.buildBlocks(tl, { attrIdx }));
  const base = [0, plan[0].blocks.length];
  const built = sp.tiles.map((tl, t) => {
    const tw = new Map(tl.links.map((l) => [l.node, l]));
    return roads.buildBlocks(tl, { attrIdx, base: base[t], links: (n) => {
      const l = tw.get(n);
      if (!l) return undefined;
      const P = plan[l.tile], k = P.blockOf[l.twin];
      return [{ level: 1, block: base[l.tile] + k, ref: 2 * P.firsts[k].first[P.localOf[l.twin]] }];
    } });
  });
  for (const t of [0, 1]) {
    const l = sp.tiles[t].links[0], me = sp.tiles[t].nodes[l.node];
    const b = built[t].blocks[built[t].blockOf[l.node]];
    // элемент 0x0000 стоит сразу за единственной записью узла
    const g = xg.graphOf(b);
    const ni = g.nodes.findIndex((n) => n.x === me.x && n.y === me.y);
    const e = g.entryNode.indexOf(ni), p = b.readUInt16BE(b.readUInt32BE(0x6c) + e * 2) * 2;
    const len = (b.readUInt16BE(p) >>> 14) === 1 ? 2 : 4;    // своя встречная 2 байта, прочее 4
    const q = nv.pairs(b, p + len, true).list[0];
    const u = 1 - t, target = built[u].blocks[q.block - base[u]];
    const got = nv.resolve(target, q.ref);
    assert.deepEqual([got.c.x, got.c.y], [me.x, me.y], 'тайл ' + t);
  }
});
