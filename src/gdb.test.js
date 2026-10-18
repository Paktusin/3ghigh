'use strict';
// Проверка читателя GDB и двух писателей поверх него (gdbwrite, gdbroads).
// Тесты автономные: карта не нужна — «том» собирается в памяти сборщиком
// gdbgen и читается тем же кодом, что читает EJ211_v37a.gdb с диска.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const gm = require('./gdb');
const G = require('./gdbgen');
const gw = require('./gdbwrite');
const gr = require('./gdbroads');

const road = (n, x0 = 100, y0 = 50) => {
  const points = [];
  for (let i = 0; i < n; i++) points.push({ x: x0 + i * 10, y: y0 - i * 3 });
  return points;
};

// Тайл в РАННЕМ виде, который правят gdbwrite/gdbroads: рамка + элементы
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

// ── gdbwrite: правка на месте и наращивание ────────────────────────────────

test('правка на месте: длина сохраняется, координаты меняются', () => {
  // начало тайла берём по калибровке: 33,3°E 35,2°N лежит в этом тайле L0
  const tcx = Math.floor(gm.cellOfLon(33.30, gm.CELL_X) / 32) * 32;
  const tcy = Math.floor(gm.cellOfLat(35.20, gm.CELL_Y) / 32) * 32;
  const deg = [[33.30, 35.20], [33.33, 35.22], [33.36, 35.25]];
  const was = deg.map(([lo, la]) => gw.degToTile(lo, la, tcx, tcy));
  const { g, size } = tileVolume([{ points: was, name: 'A1' }]);

  const now = [[33.31, 35.21], [33.34, 35.23], [33.37, 35.26]]
    .map(([lo, la]) => gw.degToTile(lo, la, tcx, tcy));
  const r = gw.buildReplacement(g, 0, size, now, tcx, tcy);
  assert.equal(r.patched.length, r.orig.length, 'длина элемента не меняется');
  assert.notDeepEqual([...r.patched], [...r.orig], 'байты всё же другие');

  const patched = Buffer.from(gm.read(g, 0, size));
  r.patched.copy(patched, r.fileOffset);
  const pr = gm.tilePoints(gm.openBuffer(patched), 0, size);
  assert.deepEqual(pr.points, now, 'из починенного тайла читаются новые точки');
});

test('правка на месте: другое число точек отвергается', () => {
  const { g, size } = tileVolume([{ points: road(4), name: 'A1' }]);
  assert.throws(() => gw.buildReplacement(g, 0, size, road(5), 0, 0), /число точек/);
});

test('правка на месте: координаты за границей u16/i16 ловятся заранее', () => {
  assert.deepEqual(gw.checkRange([{ x: 10, y: -10 }]), []);
  const bad = gw.checkRange([{ x: -1, y: 0 }, { x: 70000, y: 0 }, { x: 0, y: 40000 }]);
  assert.equal(bad.length, 3);
});

test('наращивание: элементов на один больше, смещения пересчитаны', () => {
  const { g, size } = tileVolume([{ points: road(4), name: 'A1' }]);
  const before = gm.tileHeader(g, 0, size);
  const add = road(100, 300, -50);
  const { blob, total, elemCount } = gw.buildGrownTile(g, 0, size, add);

  assert.equal(total, blob.length);
  assert.equal(elemCount, before.count + 1);
  const th = gm.tileHeader(gm.openBuffer(blob), 0, blob.length);
  assert.equal(th.count, before.count + 1);
  assert.equal(th.off0, before.off0 + 11 + add.length * 4, 'поток вырос ровно на элемент');
  assert.equal(th.off1 - th.off0, before.off1 - before.off0, 'S1 перенесена как есть');
  assert.equal(th.off2, blob.length, 'секции по-прежнему покрывают блоб');
  assert.deepEqual(gm.tilePoints(gm.openBuffer(blob), 0, blob.length).points, add);
});

test('наращивание: блоб больше 64 КБ отвергается', () => {
  // набиваем тайл почти под предел u16, дальше одна дорога его переполняет
  const big = [];
  do { big.push({ points: road(100), name: 'R' }); } while (legacyTile(big).length < 64600);
  const { g, size } = tileVolume(big);
  assert.ok(size <= 0xffff, 'исходный тайл ещё влезает: ' + size);
  assert.throws(() => gw.buildGrownTile(g, 0, size, road(254)), /u16/);
});

// ── gdbroads: набор дорог с записями реестра ───────────────────────────────

test('дороги: каждая получает запись в S1 и имя в S2', () => {
  // начало тайла берём по калибровке: 33,3°E 35,2°N лежит в этом тайле L0
  const tcx = Math.floor(gm.cellOfLon(33.30, gm.CELL_X) / 32) * 32;
  const tcy = Math.floor(gm.cellOfLat(35.20, gm.CELL_Y) / 32) * 32;
  const { g, size } = tileVolume([]);                        // пустой тайл, как у морской клетки
  const lines = [
    { name: 'A1', pts: [[33.30, 35.20], [33.31, 35.21]] },
    { name: 'A1', pts: [[33.32, 35.22], [33.33, 35.23]] },
    { name: 'B9', pts: [[33.34, 35.24], [33.35, 35.25]] },
  ];
  const r = gr.buildTile(g, 0, size, lines, tcx, tcy);
  assert.equal(r.added, 3);
  assert.equal(r.skipped, 0);
  assert.equal(r.s1count, 3, 'записей реестра столько же, сколько дорог');
  assert.equal(r.names, 2, 'повторное имя строку не плодит');

  // по коду прошивки такие элементы — многоугольники класса 0x50, а не линии
  const back = gm.readElements(r.blob);
  assert.equal(back.ok, true, 'поток сходится с off0');
  assert.equal(back.els.length, 4, 'рамка плюс три дороги');
  assert.deepEqual(back.els.map(e => [e.type, e.attr]), new Array(4).fill([0, 0x50]));
});

test('дороги: раскладка по тайлам — по первой точке ломаной', () => {
  const byTile = gr.groupByTile([
    { name: 'A1', pts: [[33.30, 35.16], [33.31, 35.17]] },
    { name: 'A2', pts: [[33.305, 35.162], [33.32, 35.17]] },
    { name: 'A6', pts: [[32.45, 34.77], [32.46, 34.78]] },
    { name: 'точка', pts: [[33.30, 35.16]] },
  ]);
  assert.equal(byTile.size, 2);
  const keys = [...byTile.values()].map(v => [v.tx, v.ty, v.lines.length]);
  assert.deepEqual(keys.map(k => k[2]).sort(), [1, 2], 'одна дорога в дальнем тайле, две в ближнем');
  for (const [tx, ty] of keys) {
    assert.equal(tx % gr.TILE, 0, 'начало тайла кратно 32 клеткам');
    assert.equal(ty % gr.TILE, 0);
  }
});

test('дороги: собранный тайл читается штатным читателем', () => {
  // начало тайла берём по калибровке: 33,3°E 35,2°N лежит в этом тайле L0
  const tcx = Math.floor(gm.cellOfLon(33.30, gm.CELL_X) / 32) * 32;
  const tcy = Math.floor(gm.cellOfLat(35.20, gm.CELL_Y) / 32) * 32;
  const { g, size } = tileVolume([]);
  const deg = [[33.30, 35.20], [33.31, 35.21], [33.32, 35.215]];
  const r = gr.buildTile(g, 0, size, [{ name: 'A1', pts: deg }], tcx, tcy);
  const g2 = gm.openBuffer(r.blob);
  const th = gm.tileHeader(g2, 0, r.blob.length);
  assert.equal(th.ok, true);
  const pr = gm.tilePoints(g2, 0, r.blob.length, tcx, tcy);
  assert.equal(pr.count, 3);
  pr.points.forEach((p, i) => {
    assert.ok(Math.abs(p.lon - deg[i][0]) < 0.01, 'точка ' + i + ': долгота');
    assert.ok(Math.abs(p.lat - deg[i][1]) < 0.01, 'точка ' + i + ': широта');
  });
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
