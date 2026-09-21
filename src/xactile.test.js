'use strict';
// Проверка сборки файла тайла .xac. Тесты автономные: карта не нужна,
// разделы собираются здесь же, а читаются настоящими читателями.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const xac = require('./xac');
const v3 = require('./xacv3');
const tile = require('./xactile');

const X = (lon) => Math.round(lon * 72000);
const Y = (lat) => Math.round(lat * (40000000 / 360));

// Кипрский кусок сети: пять узлов, четыре ребра.
function cyprusBlock() {
  const pts = [[33.0413, 34.6841], [33.0455, 34.6862], [33.0502, 34.6890],
               [33.0549, 34.6912], [33.0480, 34.6820]];
  const nodes = pts.map(([lo, la]) => ({ x: X(lo), y: Y(la), vectors: [] }));
  nodes[0].vectors.push({ to: 1, idx: 0x164 });
  nodes[1].vectors.push({ to: 2, idx: 0x164 });
  nodes[1].vectors.push({ to: 4, idx: 0x1b2 });
  nodes[2].vectors.push({ to: 3, idx: 0x164 });
  return { block: v3.buildBlock({ nodes, block: 0, first: 0, country: 113 }), pts, nodes };
}

test('тайл собирается: разделы покрывают файл, поля шапки считаются', () => {
  const { block, pts } = cyprusBlock();
  const zf = tile.section('ZF-NAMEN', Buffer.alloc(96));
  const file = tile.buildTile({ code: 'CY00', file: 'EJ211_CY00_1', index: 3777,
    country: 7, built: '20260921120000', zf, blocks: [block] });

  const s = xac.sections(file);
  assert.equal(s.complete, true, 'разделы покрывают файл ровно до конца');
  assert.deepEqual(s.list.map((x) => x.name), ['XAC HEADER', 'ZF-NAMEN', 'VEKTORBLOCK']);

  const t = tile.readTile(file);
  assert.equal(t.code, 'CY00');
  assert.equal(t.file, 'EJ211_CY00_1');
  assert.equal(t.built, '20260921120000');
  assert.equal(t.index, 3777);
  assert.equal(t.country, 7);
  assert.equal(t.count, 1);
  assert.equal(t.first, tile.HDR + zf.length);       // смещение первого VEKTORBLOCK
  assert.equal(t.total, block.length);
  // рамка тайла — объединение рамок блоков
  assert.equal(t.bbox[0], Math.min(...pts.map((p) => X(p[0]))));
  assert.equal(t.bbox[2], Math.max(...pts.map((p) => X(p[0]))));
  assert.equal(t.bbox[1], Math.min(...pts.map((p) => Y(p[1]))));
  assert.equal(t.bbox[3], Math.max(...pts.map((p) => Y(p[1]))));
});

test('тайл читается обратно: блок отдаёт те же рёбра и код страны', () => {
  const { block, pts } = cyprusBlock();
  const file = tile.buildTile({ code: 'CY00', file: 'EJ211_CY00_1',
    zf: tile.section('ZF-NAMEN', Buffer.alloc(96)), blocks: [block] });
  const t = tile.readTile(file);
  const s = file.subarray(t.blocks[0].offset, t.blocks[0].offset + t.blocks[0].size);
  const b = v3.readBlock(s);
  assert.equal(b.version, 3);
  assert.equal(b.fail, 0);
  assert.equal(b.nodes.length, 5);
  assert.equal(b.nodes.length, b.count.nodes);
  assert.equal(b.country, 113);                      // Кипр: запись COUNTRY 112 плюс один
  const edges = v3.blockEdges(s);
  assert.equal(edges.length, 4);
  for (const e of edges) {
    assert.ok(pts.some((p) => X(p[0]) === e.a.x && Y(p[1]) === e.a.y));
    assert.ok(pts.some((p) => X(p[0]) === e.b.x && Y(p[1]) === e.b.y));
  }
});

test('обратный проход: свой файл пересобирается байт в байт', () => {
  const { block } = cyprusBlock();
  const file = tile.buildTile({ code: 'CY00', file: 'EJ211_CY00_1',
    zf: tile.section('ZF-NAMEN', Buffer.alloc(96)), blocks: [block] });
  assert.equal(tile.rebuild(file).same, true);
});

test('тайл без блоков: перевёрнутая рамка и смещение 0xffffffff', () => {
  const file = tile.buildTile({ code: 'CY01', file: 'EJ211_CY01_2',
    zf: tile.section('ZF-NAMEN', Buffer.alloc(92)) });
  const t = tile.readTile(file);
  assert.equal(t.count, 0);
  assert.equal(t.first, 0xffffffff);
  assert.equal(t.total, 0);
  assert.deepEqual(t.bbox, [0x7fffffff, 0x7fffffff, -0x80000000, -0x80000000]);
  assert.equal(xac.sections(file).complete, true);
});

test('образец шапки: чужие поля переносятся, свои перезаписываются', () => {
  const template = Buffer.alloc(tile.HDR);
  template.write('XAC HEADER      ', 0, 16, 'ascii');
  template.write('ZZ99', tile.F.code, 4, 'latin1');   // должно быть затёрто
  template.writeUInt32BE(0xdeadbeef, 0xa4);           // поле без назначения — переносится
  const file = tile.buildTile({ code: 'CY00', file: 'EJ211_CY00_1', template,
    zf: tile.section('ZF-NAMEN', Buffer.alloc(92)) });
  assert.equal(tile.readTile(file).code, 'CY00');
  assert.equal(file.readUInt32BE(0xa4), 0xdeadbeef);
});
