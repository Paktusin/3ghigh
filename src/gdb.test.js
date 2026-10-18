'use strict';
// Проверка читателя GDB (src/gdb.js) и потока элементов по коду прошивки.
// Тесты автономные: карта не нужна — «том» собирается в памяти сборщиком
// gdbgen и читается тем же кодом, что читает EJ211_v37a.gdb с диска.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const gm = require('./gdb');
const G = require('./gdbgen');

const road = (n, x0 = 100, y0 = 50) => {
  const points = [];
  for (let i = 0; i < n; i++) points.push({ x: x0 + i * 10, y: y0 - i * 3 });
  return points;
};

// Тайл в РАННЕМ виде (снятые gdbwrite/gdbroads): рамка + элементы
// gm.encodePoints (по коду прошивки это многоугольники класса 0x50, см.
// docs/formats/gdb.md), S1/S2 пустые. gdbgen такие тайлы больше не пишет.
const legacyTile = roads => {
  const stream = Buffer.concat([G.FRAME_ELEMENT, ...roads.map(r => gm.encodePoints(r.points))]);
  const head = Buffer.alloc(10);
  const off0 = 10 + stream.length;
  head.writeUInt16BE(off0, 0); head.writeUInt16BE(off0 + 2, 2); head.writeUInt16BE(off0 + 4, 4);
  head.writeUInt16BE(roads.length + 1, 6); head.writeUInt16BE(0xE028, 8);
  return Buffer.concat([head, stream, Buffer.from([0, 0, 0, 0])]);
};

// том из одного тайла: сам блоб и есть весь «файл»
const tileVolume = roads => {
  const blob = legacyTile(roads);
  return { blob, g: gm.openBuffer(blob), size: blob.length };
};

// ── чтение по сквозному смещению ───────────────────────────────────────────

test('чтение: .gd2 продолжает .gdb, шов не виден', () => {
  const whole = Buffer.from(new Array(600).fill(0).map((_, i) => i & 0xff));
  const g = gm.openBuffer(whole.subarray(0, 250), whole.subarray(250));
  assert.equal(g.total, 600);
  assert.ok(gm.read(g, 0, 600).equals(whole), 'том читается целиком');
  assert.ok(gm.read(g, 240, 40).equals(whole.subarray(240, 280)), 'кусок ровно на шве');
  assert.ok(gm.read(g, 300, 10).equals(whole.subarray(300, 310)), 'кусок за швом');
});

test('чтение: за концом тома — ошибка, а не тишина', () => {
  const g = gm.openBuffer(Buffer.alloc(100));
  assert.throws(() => gm.read(g, 90, 20), /за концом тома/);
  assert.throws(() => gm.read(g, -1, 4), /за концом тома/);
});

// ── шапка и сетка ──────────────────────────────────────────────────────────

test('сетка: ширина из рамки совпадает с шириной всех двенадцати уровней EJ211', () => {
  const h = { frame: G.FRAME };
  const want = [256, 204, 64, 64, 102, 27, 27, 27, 26, 13, 13, 13];
  G.EUROPE_LEVELS.forEach((L, i) => {
    assert.equal(gm.gridW(h, L), want[i], 'L' + i);
  });
});

test('сетка: штатное начало таблицы кластеров — +1163', () => {
  assert.equal(gm.TABLE_AT, 1163);
  const v = G.build({ levels: [Object.assign({}, G.EUROPE_LEVELS[0], { clusters: [] })] });
  const g = gm.openBuffer(v.gdb, v.gd2);
  const h = gm.header(g);
  const t = gm.locateTable(g, h, h.levels[0]);
  assert.equal(t.start, gm.TABLE_AT);
  assert.equal(t.canonical, true);
  assert.equal(t.count, 256 * 168, 'W·H по рамке, как считает прошивка');
});

test('сетка: добавка уровня в ключах кластеров', () => {
  // Снято с EJ211: у 3309 кластеров всех двенадцати уровней — без исключений.
  assert.deepEqual(gm.keyOrigin(0), { x0: 0, y0: 0 });
  assert.deepEqual(gm.keyOrigin(1), { x0: 0x8000, y0: 0 });
  for (let i = 2; i < 12; i++) {
    assert.deepEqual(gm.keyOrigin(i), { x0: i << 12, y0: 0x8000 }, 'L' + i);
  }
});

test('сетка: слот считается с учётом добавки уровня', () => {
  const hd = G.EUROPE_LEVELS[5];                       // potX = potY = 6
  const grid = { W: 27, origin: gm.keyOrigin(5) };
  const cx = 9, cy = 4;
  const x = (5 << 12) + (cx << hd.potX), y = 0x8000 + (cy << hd.potY);
  assert.equal(gm.slotFor(grid, hd, x, y), cy * 27 + cx);
  // без добавки формула дала бы чушь — на это и натыкались раньше
  assert.notEqual((y >> hd.potY) * 27 + (x >> hd.potX), cy * 27 + cx);
});

test('калибровка: система координат общая с XAC, отсчёт от рамки, перевод обратим', () => {
  // мировая = рамка.min + ячейка*cell, долгота = мировая/72000, широта = мировая/111111,1
  const FX = gm.FRAME_X0, FY = gm.FRAME_Y0, UL = 72000, UT = 40000000 / 360;
  for (const lon of [-10, 0, 12.5, 33.36]) {
    assert.ok(Math.abs(gm.cellOfLon(lon, 789) - (lon * UL - FX) / 789) < 1e-6, 'долгота ' + lon);
  }
  for (const lat of [35.17, 48.86, 60]) {
    assert.ok(Math.abs(gm.cellOfLat(lat, 546) - (lat * UT - FY) / 546) < 1e-6, 'широта ' + lat);
  }
  // на грубом уровне ячейка другая, но перевод туда-обратно сходится
  for (const L of G.EUROPE_LEVELS) {
    const cx = gm.cellOfLon(33.36, L.cellX), cy = gm.cellOfLat(35.17, L.cellY);
    assert.ok(Math.abs(gm.lonOfCellL(cx, L.cellX) - 33.36) < 1e-9);
    assert.ok(Math.abs(gm.latOfCellL(cy, L.cellY) - 35.17) < 1e-9);
  }
});

// ── заголовок тайла ────────────────────────────────────────────────────────

test('тайл: заголовок ровно десять байт, дальше сразу элементы', () => {
  const { blob, g, size } = tileVolume([{ points: road(3), name: 'A1' }]);
  const th = gm.tileHeader(g, 0, size);
  assert.equal(gm.TILE_HEAD, 10);
  assert.deepEqual(th.geo, [10, th.off0]);
  assert.equal(blob[10], 0x4d, 'первый байт потока — головной байт рамки');
  assert.equal(th.ok, true);
});

test('тайл: чужая магия и перепутанные смещения не признаются', () => {
  const { blob, size } = tileVolume([{ points: road(3) }]);
  const bad = Buffer.from(blob);
  bad.writeUInt16BE(0x1234, 8);
  assert.equal(gm.tileHeader(gm.openBuffer(bad), 0, size).ok, false, 'магия');
  const bad2 = Buffer.from(blob);
  bad2.writeUInt16BE(bad2.readUInt16BE(2) + 10, 0);           // off0 > off1
  assert.equal(gm.tileHeader(gm.openBuffer(bad2), 0, size).ok, false, 'порядок секций');
});

// ── точки элемента ─────────────────────────────────────────────────────────

test('точки: кодирование и чтение сходятся, y знаковый', () => {
  const pts = [{ x: 0, y: 0 }, { x: 65535, y: -32768 }, { x: 1, y: 32767 }, { x: 25000, y: -1 }];
  const { g, size } = tileVolume([{ points: pts, name: 'A1' }]);
  const pr = gm.tilePoints(g, 0, size);
  assert.deepEqual(pr.points, pts);
});

test('точки: элемент собирается обратно байт в байт', () => {
  const { g, size } = tileVolume([{ points: road(16), name: 'A1' }]);
  const rt = gm.roundTrip(g, 0, size);
  assert.equal(rt.ok, true);
  assert.equal(rt.count, 16);
  assert.equal(rt.bytes, 11 + 16 * 4);
});

test('точки: больше 254 не кодируются — счётчик однобайтный', () => {
  assert.throws(() => gm.encodePoints(road(255)), /254/);
});

test('точки: перевод клетки в градусы обратим', () => {
  const lon = 33.37, lat = 35.17;
  const cx = gm.cellOfLon(lon, gm.CELL_X), cy = gm.cellOfLat(lat, gm.CELL_Y);
  assert.ok(Math.abs(gm.lonOfCell(cx) - lon) < 1e-9);
  assert.ok(Math.abs(gm.latOfCell(cy) - lat) < 1e-9);
});

// ── поток элементов по коду прошивки ───────────────────────────────────────

test('элементы: рамка общего пустого тайла — многоугольник 0x50 по границе тайла 32×32', () => {
  assert.deepEqual(gm.encodeFrame(25248, 17472), G.FRAME_ELEMENT);
  const r = gm.readElements(G.emptyTile(), { points: true });
  assert.equal(r.ok, true);
  assert.equal(r.els.length, 1);
  const f = r.els[0];
  assert.deepEqual([f.type, f.attr, f.cls, f.e9], [0, 0x50, 16, 0xff]);
  assert.deepEqual(f.pts, [[25248, 0], [25248, 17472], [0, 17472], [0, 0]], 'x:15, y:15, два бита признаков');
});

test('элементы: рамки прямого пути совпадают с заводскими (L1, L4)', () => {
  // сняты с EJ211: пустой тайл L1 (W16) и L4 (W12)
  assert.equal(gm.encodeFrame(15872, 15872, 16, true).toString('hex'), '4d000000503e003e0000003e00000000003e000000bb');
  assert.equal(gm.encodeFrame(1984, 1984, 12, true).toString('hex'), '4d00000050c0c07700c070000000c00007bb');
});

test('элементы: заводская линия Родоса читается до off0 и упирается в край тайла', () => {
  // тайл EJ211 @356344157 (88 б): рамка, затем e0 08 c1 1d 010e2004 …
  const blob = Buffer.from('003c004e00580002e0284d000000508f000000000001110300000002c5400003c5411102e008c11d010e20040e2903315be67400093403eb00012e50000102000016604ea74100002108320001f00001000005a52dec091a', 'hex');
  const r = gm.readElements(blob, { points: true });
  assert.equal(r.ok, true);
  const ln = r.els[1];
  assert.deepEqual([ln.type, ln.attr, ln.cls, ln.e9, ln.n], [1, 0x010e2004, 4, 8, 3]);
  assert.deepEqual(ln.ctl, [0xe0, 0xc1]);
  assert.ok(ln.pts.every(([x, y]) => x >= 0 && x <= 25248 && y >= 0 && y <= 17472), 'точки внутри тайла');
});

test('элементы: линия записывается и читается обратно — оба пути, все ширины', () => {
  const pts = [[0, 17472], [9000, 2500], [25248, 0], [12, 13]];
  for (const [W, simple, lim] of [[16, false, 25248], [16, true, 15872], [12, true, 1984], [8, true, 248]]) {
    const q = pts.map(([x, y]) => [Math.round(x / 25248 * lim), Math.round(y / 25248 * lim)]);
    const el = Buffer.concat([Buffer.from([0xc1, 0xe0, 24]), gm.encodeLine(q, 1, { W, simple }),
                              gm.encodeLine(q.slice(1), null, { W, simple })]);
    const head = Buffer.alloc(10);
    head.writeUInt16BE(10 + el.length, 0); head.writeUInt16BE(12 + el.length, 2); head.writeUInt16BE(14 + el.length, 4);
    head.writeUInt16BE(2, 6); head.writeUInt16BE(0xE028, 8);
    const blob = Buffer.concat([head, el, Buffer.alloc(4)]);
    const r = gm.readElements(blob, { W, simple, points: true });
    assert.equal(r.ok, true, 'W' + W + (simple ? ' прямой' : ' сжатый'));
    assert.deepEqual(r.els.map(e => [e.type, e.attr, e.e9, e.head]), [[1, 1, 24, 0x3d], [1, 1, 24, 0x31]]);
    assert.deepEqual(r.els[0].pts, q);
    assert.deepEqual(r.els[1].pts, q.slice(1));
  }
});

test('элементы: длинная линия — счётчик 0xFF + u16', () => {
  const q = new Array(300).fill(0).map((_, i) => [i * 10, (i * 7) % 900]);
  const b = gm.encodeLine(q, 4);
  assert.equal(b[5], 0xff);
  assert.equal(b.readUInt16BE(6), 300);
});

// Сверка с заводским томом, если он есть рядом (maps/ — только чтение).
const fs = require('fs');
const factory = fs.existsSync('maps/pkgdb/GDB/EJ211_v37a.gdb');
test('элементы: заводские тайлы всех 12 уровней читаются ровно до off0', { skip: !factory && 'нет maps/' }, () => {
  const g = gm.openGdb('maps');
  const h = gm.header(g);
  for (let lv = 0; lv < 12; lv++) {
    const grid = gm.levelGrid(g, h, h.levels[lv]);
    let n = 0, ok = 0;
    for (let s = 0; s < grid.entries.length && n < 150; s += 97) {
      const e = grid.entries[s];
      if (!e.sz || e.off < h.regionEnd) continue;
      for (const t of gm.cluster(g, h, e.off, e.sz).tiles) {
        n++;
        if (gm.readElements(gm.read(g, t.off, t.size), { W: t.attr, simple: !!t.b10 }).ok) ok++;
      }
    }
    assert.ok(n > 0, 'L' + lv + ': есть тайлы');
    assert.equal(ok, n, 'L' + lv + ': сошлось ' + ok + ' из ' + n);
  }
});

// ── многоугольники: треугольники по автомату признаков ─────────────────────

const triArea = t => Math.abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])) / 2;
const sgn = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
const inTri = (t, x, y) => {
  const d1 = sgn(t[0], t[1], [x, y]), d2 = sgn(t[1], t[2], [x, y]), d3 = sgn(t[2], t[0], [x, y]);
  return (d1 > 0 && d2 > 0 && d3 > 0) || (d1 < 0 && d2 < 0 && d3 < 0);
};
// каждая точка сетки покрыта ровно одним треугольником
const coveredOnce = (tris, X, Y, N = 40) => {
  let bad = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = (i + 0.53) * X / N, y = (j + 0.41) * Y / N;
    if (tris.filter(t => inTri(t, x, y)).length !== 1) bad++;
  }
  return bad;
};

test('многоугольники: рамка — веер из двух треугольников на весь тайл', () => {
  const f = gm.readElements(G.emptyTile(), { points: true }).els[0];
  const r = gm.polyTriangles(f.pts, f.flags);
  assert.equal(r.illegal, 0);
  assert.equal(r.tris.length, 2);
  assert.equal(r.tris.reduce((s, t) => s + triArea(t), 0), 25248 * 17472);
});

test('многоугольники: заводской прибрежный тайл Кипра — суша 0x5D и море 0x50 делят тайл без зазоров', () => {
  // EJ211 @346900808 (178 б), северный берег Кипра
  const blob = Buffer.from('009800aa00b20002e0281d0000005d0eaf172125c87b25bf9e78f2dfc00002324be905008062087f27741efa324847f56f10723ade231a5bdd40dea028807d86ad01f108fa0a1f059406d818301d00000050108f00000000c5400003c540a3e8c1d4a0e5b7b6a249b3d49dcdb1de9721aaea97717946c6e56b00ddd55904f4c54988fb0d410b04e9370b05192e431101000111010000000200010200001681dce4f100002128320000f00001000003435950', 'hex');
  const r = gm.readElements(blob, { points: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.els.map(e => [e.type, e.attr]), [[0, 0x5d], [0, 0x50]]);
  const tris = r.els.flatMap(e => { const q = gm.polyTriangles(e.pts, e.flags); assert.equal(q.illegal, 0); return q.tris; });
  assert.equal(coveredOnce(tris, 25248, 17472), 0);
});

test('многоугольники: список треугольников пишется и читается обоими путями', () => {
  const tris = [[[0, 0], [100, 0], [0, 100]], [[100, 0], [100, 100], [0, 100]], [[5, 5], [9, 5], [5, 9]]];
  for (const [W, simple] of [[16, false], [16, true], [12, true], [8, true]]) {
    const el = gm.encodePolygon(tris.flat(), gm.listFlags(3, true), 0x5f, { W, simple });
    const head = Buffer.alloc(10);
    head.writeUInt16BE(10 + el.length, 0); head.writeUInt16BE(12 + el.length, 2); head.writeUInt16BE(14 + el.length, 4);
    head.writeUInt16BE(1, 6); head.writeUInt16BE(0xE028, 8);
    const r = gm.readElements(Buffer.concat([head, el, Buffer.alloc(4)]), { W, simple, points: true });
    assert.equal(r.ok, true, 'W' + W);
    assert.deepEqual([r.els[0].type, r.els[0].attr], [0, 0x5f]);
    const back = gm.polyTriangles(r.els[0].pts, r.els[0].flags);
    assert.equal(back.illegal, 0);
    assert.deepEqual(back.tris, tris, 'W' + W + (simple ? ' прямой' : ' сжатый'));
  }
});

// ── подписи ────────────────────────────────────────────────────────────────

test('подписи: заводской прибрежный тайл Кипра — суша 0x5D подписана «CYP»', () => {
  const blob = Buffer.from('009800aa00b20002e0281d0000005d0eaf172125c87b25bf9e78f2dfc00002324be905008062087f27741efa324847f56f10723ade231a5bdd40dea028807d86ad01f108fa0a1f059406d818301d00000050108f00000000c5400003c540a3e8c1d4a0e5b7b6a249b3d49dcdb1de9721aaea97717946c6e56b00ddd55904f4c54988fb0d410b04e9370b05192e431101000111010000000200010200001681dce4f100002128320000f00001000003435950', 'hex');
  const n = gm.readNames(blob, null);
  assert.equal(n.records.length, 1);
  assert.deepEqual([n.records[0].el, n.records[0].text, n.records[0].nid, n.records[0].b21], [0, 'CYP', 0x81dce4f1, 0x28]);
});

test('подписи: словарь кластера раскрывает коды, пустые записи оставляют байт', () => {
  // словарь: код 1 → «AGIOS », код 2 → «ODOS »
  const dict = Buffer.alloc(510 + 11);
  dict.writeUInt16BE(6, 0); dict.writeUInt16BE(11, 2);
  for (let i = 2; i < 255; i++) dict.writeUInt16BE(11, i * 2);
  dict.write('AGIOS ODOS ', 510, 'latin1');
  const { s1, s2 } = gm.encodeNames([[0, { text: '\x01NIKOLAOS', hi: 0x60, f02: 0 }, 8], [1, { text: '\x02X', hi: 0x60, f02: 0 }, 8]]);
  const blob = Buffer.concat([Buffer.alloc(10), s1, s2]);
  blob.writeUInt16BE(10, 0); blob.writeUInt16BE(10 + s1.length, 2); blob.writeUInt16BE(10 + s1.length + s2.length, 4);
  const n = gm.readNames(blob, dict);
  assert.deepEqual(n.records.map(r => [r.el, r.text]), [[0, 'AGIOS NIKOLAOS'], [1, 'ODOS X']]);
});

test('подписи: реестр и строки пишутся и читаются обратно, блоки по 16 и 256', () => {
  const named = [];
  for (let i = 0; i < 600; i++) named.push([i, { text: 'ODOS ' + String(i).padStart(4, '0'), hi: 0x60, f02: 0 }, 8]);
  named.push([3, { text: 'A1', hi: 0x32, f02: 354 }, 24]);
  const { s1, s2 } = gm.encodeNames(named);
  const blob = Buffer.concat([Buffer.alloc(10), s1, s2]);
  blob.writeUInt16BE(10, 0); blob.writeUInt16BE(10 + s1.length, 2); blob.writeUInt16BE(10 + s1.length + s2.length, 4);
  const n = gm.readNames(blob, null);
  assert.equal(n.records.length, 601);
  const got = new Map(n.records.filter(r => !r.f02).map(r => [r.el, r.text]));
  for (let i = 0; i < 600; i++) assert.equal(got.get(i), 'ODOS ' + String(i).padStart(4, '0'));
  const sign = n.records.find(r => r.f02);
  assert.deepEqual([sign.el, sign.text, sign.f02, sign.nid >>> 24, sign.b21], [3, 'A1', 354, 0x32, 24]);
});
