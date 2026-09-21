'use strict';
// Проверка пересборки блоков тайла своими байтами. Тесты автономные: карта не
// нужна, тайл собирается здесь же, а читается настоящими читателями.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const xac = require('./xac');
const xv = require('./xacvec');
const xw = require('./xacwrite');
const tile = require('./xactile');
const xg = require('./xacgraph');

const X = (lon) => Math.round(lon * 72000);
const Y = (lat) => Math.round(lat * (40000000 / 360));

// Сетка улиц: узлы по решётке, связи вправо и вниз.
function grid(w, h, lon0, lat0) {
  const nodes = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    nodes.push({ x: X(lon0 + x * 0.002), y: Y(lat0 + y * 0.002), vectors: [] });
  }
  const at = (x, y) => y * w + x;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x + 1 < w) nodes[at(x, y)].vectors.push({ to: at(x + 1, y), idx: 0x164 });
    if (y + 1 < h) nodes[at(x, y)].vectors.push({ to: at(x, y + 1), idx: 0x1b2 });
  }
  return nodes;
}

const key = (e) => e.a.x + ',' + e.a.y + '->' + e.b.x + ',' + e.b.y;

test('граф снимается с блока: узлы, координаты и связи те же', () => {
  const nodes = grid(6, 5, 33.3, 35.1);
  const blk = xw.buildBlock({ nodes, origin: [X(33.32), Y(35.105)] });
  const g = xg.graphOf(blk);

  assert.equal(g.nodes.length, nodes.length, 'узлов столько же');
  assert.equal(g.cross, 0, 'межблочных ссылок в своём блоке нет');
  assert.equal(g.dangling, 0, 'висячих ссылок нет');
  assert.equal(g.local, nodes.reduce((a, n) => a + n.vectors.length, 0), 'векторов столько же');
  for (let i = 0; i < nodes.length; i++) {
    assert.equal(g.nodes[i].x, nodes[i].x, 'узел ' + i + ': X');
    assert.equal(g.nodes[i].y, nodes[i].y, 'узел ' + i + ': Y');
  }
});

test('блок пересобирается из своего графа: рёбра сохраняются все', () => {
  const nodes = grid(7, 6, 33.0, 34.9);
  const blk = xw.buildBlock({ nodes, origin: [X(33.02), Y(34.905)] });

  const g = xg.graphOf(blk);
  const again = xw.buildBlock({ nodes: g.nodes, origin: [g.ox, g.oy] });

  const was = new Set(xv.blockEdges(blk).map(key));
  const now = new Set(xv.blockEdges(again).map(key));
  assert.equal(now.size, was.size, 'рёбер столько же');
  for (const k of was) assert.ok(now.has(k), 'ребро потеряно: ' + k);
});

test('дополнение нулями не меняет ни разбор блока, ни его рёбра', () => {
  const nodes = grid(5, 4, 33.2, 35.0);
  const blk = xw.buildBlock({ nodes, origin: [X(33.21), Y(35.003)] });
  const padded = xg.regenBlock(blk, blk.length + 4096).block;

  assert.equal(padded.length, blk.length + 4096, 'раздел вырос ровно на дополнение');
  assert.equal(padded.readUInt32BE(0x10), padded.length - 20, 'длина полезной части объявлена');
  const s = xac.sections(padded);
  assert.equal(s.complete, true, 'раздел покрывает блок целиком');
  assert.equal(s.list.length, 1, 'раздел один: нули за таблицей новым не притворяются');

  const was = new Set(xv.blockEdges(blk).map(key));
  const now = new Set(xv.blockEdges(padded).map(key));
  assert.equal(now.size, was.size, 'рёбра не пострадали');
  for (const k of was) assert.ok(now.has(k), 'ребро потеряно: ' + k);
});

test('тайл пересобирается: длина файла, разделы и поля шапки прежние', () => {
  const nodes = grid(8, 7, 33.35, 35.15);
  const blk = xw.buildBlock({ nodes, origin: [X(33.36), Y(35.156)] });
  // раздел с запасом: у заводского блока хвост записей длиннее нашего
  const roomy = Buffer.concat([blk, Buffer.alloc(8192)]);
  roomy.writeUInt32BE(roomy.length - 20, 0x10);

  const file = tile.buildTile({ code: 'CY00', file: 'EJ211_CY00_1', index: 3776,
    country: 7, built: '20260921120000', zf: tile.section('ZF-NAMEN', Buffer.alloc(96)),
    blocks: [roomy] });

  const { out, stat } = xg.regenTile(file);
  assert.equal(out.length, file.length, 'длина файла не изменилась');
  assert.equal(stat.v5, 1, 'блок версии 5 пересобран');
  assert.equal(stat.edgesNow, stat.edgesWas, 'рёбра воспроизведены все');
  assert.ok(stat.edgesWas > 0, 'рёбра вообще есть');

  const a = xac.sections(file).list, b = xac.sections(out).list;
  assert.deepEqual(b.map((s) => s.name + ':' + s.total), a.map((s) => s.name + ':' + s.total),
    'имена и длины разделов те же');

  const ta = tile.readTile(file), tb = tile.readTile(out);
  for (const k of ['code', 'file', 'index', 'country', 'count', 'first', 'total']) {
    assert.equal(tb[k], ta[k], 'поле шапки ' + k);
  }
  assert.deepEqual(tb.bbox, ta.bbox, 'рамка тайла');
});

test('блок, которому не хватило места, остаётся заводским', () => {
  const nodes = grid(6, 6, 33.1, 35.2);
  const blk = xw.buildBlock({ nodes, origin: [X(33.11), Y(35.205)] });
  const r = xg.regenBlock(blk, 64);
  assert.equal(r.tooBig, true, 'коротким разделом сборка не прикрывается');
});
