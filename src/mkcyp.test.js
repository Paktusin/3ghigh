'use strict';
// Проверка кусков сборки кипрского набора, для которых не нужна карта:
// подгонка файла тайла под чужой слот, маска зоны и заглушка уровня 2.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const mk = require('./mkcyp');
const xac = require('./xac');
const xv = require('./xacvec');
const xw = require('./xacwrite');
const tile = require('./xactile');
const raster = require('./raster');

const X = (lon) => Math.round(lon * 72000);
const Y = (lat) => Math.round(lat * (40000000 / 360));

function blockOf(n) {
  const nodes = [];
  for (let i = 0; i < n; i++) {
    nodes.push({ x: X(33.0 + i * 0.002), y: Y(35.0 + (i % 5) * 0.002), vectors: [] });
  }
  for (let i = 0; i + 1 < n; i++) nodes[i].vectors.push({ to: i + 1, idx: 0x2a });
  return xw.buildBlock({ nodes, id: 7, tileBase: 5, country: 113, flags: 0x95 });
}

function tileSpec(blocks, extra) {
  return { code: 'IS01', file: 'EJ211_IS01_1', index: 1798, country: 113,
           built: '20260922120000',
           zf: tile.section('ZF-NAMEN', Buffer.alloc(92)),
           blocks, extra };
}

test('подгонка под слот: длина ровно донорская, а разделы целы', () => {
  const blocks = [blockOf(20), blockOf(20)];
  const mask = mk.rasterSection([X(33.0), Y(35.0), X(33.2), Y(35.1)]);
  const spec = tileSpec(blocks, [mask]);
  const bare = tile.buildTile(spec);
  const target = bare.length + 4096;

  const out = mk.fitTile(spec, target);
  assert.equal(out.length, target, 'файл занял весь слот');
  const s = xac.sections(out);
  assert.equal(s.complete, true, 'разделы покрывают файл');
  assert.deepEqual(s.list.map((x) => x.name), xac.sections(bare).list.map((x) => x.name),
    'состав разделов не изменился');

  const vb = s.list.filter((x) => x.name === 'VEKTORBLOCK');
  assert.equal(vb[vb.length - 1].total, xac.sections(bare).list.filter((x) => x.name === 'VEKTORBLOCK')
    .slice(-1)[0].total + 4096, 'нули ушли в последний блок');
  const last = s.list[s.list.length - 1];
  assert.equal(last.name, 'RASTERINFOS', 'маска осталась последней');
  assert.equal(last.total, mask.length, 'и не выросла');
});

test('подгонка под слот: рёбра блоков переживают дополнение нулями', () => {
  const blocks = [blockOf(30)];
  const spec = tileSpec(blocks, [mk.rasterSection([X(33.0), Y(35.0), X(33.1), Y(35.05)])]);
  const was = xv.blockEdges(blocks[0]).map((e) => e.a.x + ',' + e.a.y + '->' + e.b.x + ',' + e.b.y);
  const out = mk.fitTile(spec, tile.buildTile(spec).length + 8192);
  const blk = xac.sections(out).list.filter((x) => x.name === 'VEKTORBLOCK')
    .map((x) => out.subarray(x.offset, x.offset + x.total))[0];
  const now = new Set(xv.blockEdges(blk).map((e) => e.a.x + ',' + e.a.y + '->' + e.b.x + ',' + e.b.y));
  assert.equal(now.size, was.length, 'рёбер столько же');
  for (const k of was) assert.ok(now.has(k), 'ребро потеряно: ' + k);
});

test('подгонка под слот: файл длиннее слота отвергается, а не обрезается', () => {
  const spec = tileSpec([blockOf(50)], []);
  assert.equal(mk.fitTile(spec, 100), null, 'втиснуть силой нельзя');
});

test('маска зоны: сетка считается по рамке, все ячейки свои', () => {
  const bbox = [X(33.0), Y(35.0), X(33.0) + 50000, Y(35.0) + 30000];
  const sec = mk.rasterSection(bbox);
  const r = raster.parseRaster(sec);          // смещения считаются от начала раздела
  assert.equal(r.nx, Math.floor(50000 / 1000) - 1, 'ячеек по горизонтали');
  assert.equal(r.ny, Math.floor(30000 / 1000) - 1, 'ячеек по вертикали');
  assert.deepEqual(r.bbox.map((v) => v >>> 0), bbox.map((v) => v >>> 0), 'рамка перенесена');
  assert.ok(r.cells.every((v) => v === 0), 'все ячейки отданы этому тайлу');
});

test('заглушка уровня 2: те самые 308 байт', () => {
  const b = mk.stubLevel2('IS01', 'EJ211_IS01_2', 1798, '20260922120000');
  assert.equal(b.length, 308, 'шапка плюс пустой ZF-NAMEN');
  const s = xac.sections(b);
  assert.equal(s.complete, true);
  assert.deepEqual(s.list.map((x) => x.name), ['XAC HEADER', 'ZF-NAMEN']);
  const t = tile.readTile(b);
  assert.equal(t.code, 'IS01');
  assert.equal(t.count, 0, 'блоков нет');
});
