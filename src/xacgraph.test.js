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

// --- тайл целиком: межблочные рёбра и нульвекторы --------------------------

// Таблица ATTRIBUTE: нужен один «простой» индекс, запись при нём четырёхбайтовая.
function attrTable() {
  const a = new Uint32Array(2048);
  a[0x164] = 0x00000005;
  a[0x1b2] = 0x00000005;
  a[0x2a] = 0x00000005;
  return a;
}

// Тайл из нескольких блоков: каждому разделу даём запас, как у заводского.
function tileOf(blocks, room) {
  const roomy = blocks.map((b) => {
    const r = Buffer.concat([b, Buffer.alloc(room === undefined ? 8192 : room)]);
    r.writeUInt32BE(r.length - 20, 0x10);
    return r;
  });
  return tile.buildTile({ code: 'CY00', file: 'EJ211_CY00_1', index: 3776,
    country: 7, built: '20260922100000', zf: tile.section('ZF-NAMEN', Buffer.alloc(96)),
    blocks: roomy });
}

test('тайл целиком: ребро через границу блоков переживает пересборку', () => {
  const A = grid(5, 4, 33.30, 35.10);
  const B = grid(5, 4, 33.32, 35.10);
  // Блоки нумеруются сквозь базу: тайл начинается со 100, значит A=100, B=101.
  const blkB = xw.buildBlock({ nodes: B, id: 101, tileBase: 100, flags: 0x95 });
  const refB = xg.firstEntries(B)[7];                  // первая запись узла B7
  A[3].vectors.push({ block: 101, ref: refB, idx: 0x2a });
  const blkA = xw.buildBlock({ nodes: A, id: 100, tileBase: 100, flags: 0x95 });

  const file = tileOf([blkA, blkB]);
  const was = xg.tileEdges([blkA, blkB]);
  const cross = A[3].x + ',' + A[3].y + '->' + B[7].x + ',' + B[7].y;
  assert.ok(was.edges.has(cross), 'межблочное ребро видно и до пересборки');

  const { out, stat } = xg.regenTile(file, { attr: attrTable() });
  assert.equal(stat.v5, 2, 'оба блока пересобраны');
  assert.equal(stat.cross, 1, 'межблочный вектор снят с графа');
  assert.equal(stat.edgesNow, stat.edgesWas, 'рёбра воспроизведены все');
  assert.equal(stat.edgesExtra, 0, 'лишних рёбер не появилось');

  const blocks = xac.sections(out).list.filter((s) => s.name === 'VEKTORBLOCK')
    .map((s) => out.subarray(s.offset, s.offset + s.total));
  assert.ok(xg.tileEdges(blocks).edges.has(cross), 'и после пересборки ведёт в тот же узел');
  assert.equal(out.length, file.length, 'длина файла прежняя');
});

test('тайл целиком: ссылка переписывается, когда у цели поехали номера', () => {
  // У блока B первый узел без векторов — его запись занимает один номер;
  // добавим ему рёбра, чтобы наша нумерация разошлась с исходной.
  const A = grid(4, 3, 33.30, 35.10);
  const B = grid(4, 3, 33.32, 35.10);
  const blkB0 = xw.buildBlock({ nodes: B, id: 101, tileBase: 100, flags: 0x95 });
  const target = 5;
  A[2].vectors.push({ block: 101, ref: xg.firstEntries(B)[target], idx: 0x2a });
  const blkA = xw.buildBlock({ nodes: A, id: 100, tileBase: 100, flags: 0x95 });

  const file = tileOf([blkA, blkB0]);
  const { out, stat } = xg.regenTile(file, { attr: attrTable() });
  assert.equal(stat.edgesNow, stat.edgesWas);

  // Прочитаем ссылку из пересобранного блока A и разрешим её как прошивка.
  const blocks = xac.sections(out).list.filter((s) => s.name === 'VEKTORBLOCK')
    .map((s) => out.subarray(s.offset, s.offset + s.total));
  const a2 = blocks[0], b2 = blocks[1];
  const tabA = a2.readUInt32BE(0x6c), cntA = a2.readUInt16BE(0x70);
  let found = null;
  for (let i = 1; i < cntA; i++) {
    const p = a2.readUInt16BE(tabA + i * 2) * 2;
    if (p <= 0 || p + 6 > a2.length) continue;
    if ((a2.readUInt16BE(p) & 0xc000) !== 0xc000) continue;
    if (((a2[p + 2] >> 6) & 1) === 0) continue;
    found = p; break;
  }
  assert.ok(found, 'межблочная запись на месте');
  assert.equal(a2.readUInt16BE(0x36) + (a2.readUInt16BE(found + 4) & 0x7fff), 101,
    'номер блока-цели прежний');
  const ref = a2.readUInt16BE(found) & 0x3fff;
  const c = xg.entryCoords(b2).coords[ref];
  assert.deepEqual([c.x, c.y], [B[target].x, B[target].y], 'ссылка привела в тот же узел');
});

test('тайл целиком: нульвекторы переносятся как есть', () => {
  const nv = require('./nullvec');
  const A = grid(4, 3, 33.30, 35.10);
  A[0].links = [{ level: 1, block: 900, ref: 12 }, { level: 2, block: 950, ref: 8 }];
  A[5].links = [{ level: 1, block: 901, ref: 4 }];
  const blkA = xw.buildBlock({ nodes: A, id: 100, tileBase: 100, flags: 0x95 });

  const g = xg.graphOf(blkA, { attr: attrTable() });
  assert.equal(g.links, 3, 'все три пары сняты с блока');

  const file = tileOf([blkA]);
  const { out, stat } = xg.regenTile(file, { attr: attrTable() });
  assert.equal(stat.links, 3, 'и перенесены в пересобранный блок');

  const blk = (() => {
    const s = xac.sections(out).list.find((x) => x.name === 'VEKTORBLOCK');
    return out.subarray(s.offset, s.offset + s.total);
  })();
  const m = xw.readBlock(blk, attrTable());
  const els = m.items.filter((x) => x.kind === 'null');
  assert.equal(els.length, 2, 'оба элемента на месте');
  const all = els.flatMap((e) => nv.pairs(blk, e.at, nv.wideMask(blk)).list.filter(Boolean))
    .map((q) => [q.level, q.block, q.ref]);
  assert.deepEqual(all.sort(), [[1, 900, 12], [1, 901, 4], [2, 950, 8]].sort(),
    'пары те же: они ведут в чужие тайлы, и переписывать их не надо');
});

test('тайл целиком: ссылку в блок, который не пересобирался, не трогают', () => {
  const v3 = require('./xacv3');
  // Сосед — блок версии 3: его нумерация не менялась, значит ссылка в него
  // должна остаться прежней. Так устроена и Мальта: пять блоков v5 и четыре v3.
  const A = grid(4, 3, 33.30, 35.10);
  const ref = 0x123;
  A[2].vectors.push({ block: 101, ref, idx: 0x2a });
  const blkA = xw.buildBlock({ nodes: A, id: 100, tileBase: 100, flags: 0x95 });
  const old = v3.buildBlock({ nodes: grid(3, 3, 33.32, 35.10), origin: [X(33.33), Y(35.11)] });

  const file = tileOf([blkA, old]);
  const { out, stat } = xg.regenTile(file, { attr: attrTable() });
  assert.equal(stat.v5, 1, 'пересобран только блок версии 5');

  const blk = xac.sections(out).list.filter((x) => x.name === 'VEKTORBLOCK')
    .map((x) => out.subarray(x.offset, x.offset + x.total))[0];
  const tab = blk.readUInt32BE(0x6c), cnt = blk.readUInt16BE(0x70);
  let seen = 0;
  for (let i = 1; i < cnt; i++) {
    const p = blk.readUInt16BE(tab + i * 2) * 2;
    if (p <= 0 || p + 6 > blk.length) continue;
    if ((blk.readUInt16BE(p) & 0xc000) !== 0xc000 || ((blk[p + 2] >> 6) & 1) === 0) continue;
    seen++;
    assert.equal(blk.readUInt16BE(p) & 0x3fff, ref, 'номер записи в чужом блоке прежний');
    assert.equal(blk.readUInt16BE(0x36) + (blk.readUInt16BE(p + 4) & 0x7fff), 101, 'и номер блока');
  }
  assert.equal(seen, 1, 'межблочная запись ровно одна');
});
