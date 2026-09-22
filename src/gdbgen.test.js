'use strict';
// Проверка сборки тома GDB. Тесты автономные: карта не нужна, всё собирается
// в памяти. Каждый собранный кусок читается НАСТОЯЩИМ читателем — тем же
// `src/gdb.js`, что разбирает EJ211_v37a.gdb с диска.
//
// Две привязки к оригиналу оставлены нарочно, как якоря: пустой тайл и первый
// кластер сняты с настоящей карты, и собранные байты обязаны с ними совпасть.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const gm = require('./gdb');
const G = require('./gdbgen');

// Общий пустой тайл из EJ211_v37a.gdb (@334 925 620, 40 байт) — на него
// ссылаются ~13 580 «морских» клеток L0.
const EMPTY_TILE_HEX =
  '00240026002800' + '01' + 'e028' +
  '4d000000508f00000000c5400003c54111020001110100000000' +
  '0000' + '0000';

// Первый кластер L0 оригинала (@0x13F68E04): 16 тайлов 32×32 ячейки,
// все — общий пустой тайл. Ключи идут в порядке Мортона.
const CLUSTER0_KEYS = [
  [0, 0], [32, 0], [0, 32], [32, 32], [64, 0], [96, 0], [64, 32], [96, 32],
  [0, 64], [32, 64], [0, 96], [32, 96], [64, 64], [96, 64], [64, 96], [96, 96],
];

const road = (n, x0 = 100, y0 = 50) => {
  const points = [];
  for (let i = 0; i < n; i++) points.push({ x: x0 + i * 10, y: y0 - i * 3 });
  return points;
};

// ── тайл ───────────────────────────────────────────────────────────────────

test('тайл: без дорог собирается ровно общий пустой тайл оригинала', () => {
  const b = G.emptyTile();
  assert.equal(b.length, 40);
  assert.equal(b.toString('hex'), EMPTY_TILE_HEX, 'байт в байт как в EJ211');
});

test('тайл: заголовок 10 байт, секции стыкуются без зазоров', () => {
  const blob = G.tileBlob([{ points: road(4), name: 'A1' }, { points: road(3), name: 'A2' }]);
  const g = gm.openBuffer(blob);
  const th = gm.tileHeader(g, 0, blob.length);
  assert.equal(th.ok, true, 'читатель признаёт заголовок');
  assert.equal(th.magic, 0xE028);
  assert.equal(th.count, 3, 'рамка плюс две дороги');
  assert.equal(th.geo[0], 10, 'поток элементов начинается сразу за заголовком');
  assert.equal(th.off0, 10 + G.FRAME_ELEMENT.length + (11 + 4 * 4) + (11 + 3 * 4));
  assert.equal(th.off2, blob.length, 'S3 пуста — секции покрывают блоб целиком');
});

test('тайл: счётчик реестра S1 на единицу меньше числа элементов', () => {
  for (const n of [0, 1, 2, 5]) {
    const roads = [];
    for (let i = 0; i < n; i++) roads.push({ points: road(2), name: 'R' + i });
    const blob = G.tileBlob(roads);
    const r = G.readTileRoads(blob);
    assert.equal(r.count, n + 1, n + ' дорог: элементов');
    assert.equal(r.s1count, n, n + ' дорог: счётчик S1 (рамка записи не имеет)');
  }
});

test('тайл: дороги читаются обратно теми же точками и именами', () => {
  const roads = [
    { points: road(2), name: 'A1' },
    { points: road(16, 500, -200), name: 'LEFKOSIA' },
    { points: road(7, 40, 3), name: 'A1' },
  ];
  const blob = G.tileBlob(roads);
  const r = G.readTileRoads(blob);
  assert.equal(r.roads.length, 3);
  r.roads.forEach((got, i) => {
    assert.deepEqual(got.points, roads[i].points, 'дорога ' + i + ': точки');
  });
  assert.deepEqual(r.roads.map(x => x.name), ['A1', 'LEFKOSIA', 'A1']);
  assert.equal(r.names.length, 2, 'повторное имя не плодит строку в S2');
});

test('тайл: последнюю дорогу достаёт и независимый читатель gdb.js', () => {
  const pts = road(12, 1000, -300);
  const blob = G.tileBlob([{ points: road(3), name: 'A1' }, { points: pts, name: 'A2' }]);
  const g = gm.openBuffer(blob);
  const pr = gm.tilePoints(g, 0, blob.length);
  assert.ok(pr, 'узор ломаной распознан');
  assert.equal(pr.count, pts.length);
  assert.deepEqual(pr.points, pts);
});

test('тайл: пустое имя заменяется на CY, длинное режется, не-латиница — на «?»', () => {
  const blob = G.tileBlob([
    { points: road(2), name: '' },
    { points: road(2), name: 'A'.repeat(40) },
    { points: road(2), name: 'ЛЕВКОСИЯ' },
  ]);
  const r = G.readTileRoads(blob);
  assert.deepEqual(r.names, ['CY', 'A'.repeat(15), '????????']);
});

test('тайл: точек больше 254 и блоб больше 64 КБ отвергаются', () => {
  assert.throws(() => G.tileBlob([{ points: road(255) }]), /254/);
  const many = [];
  for (let i = 0; i < 700; i++) many.push({ points: road(100), name: 'R' });
  assert.throws(() => G.tileBlob(many), /u16/);
});

// ── кластер ────────────────────────────────────────────────────────────────

test('кластер: порядок Мортона совпадает с настоящим кластером L0', () => {
  CLUSTER0_KEYS.forEach(([x, y], k) => {
    assert.equal(G.mortonIndex(x / 32, y / 32), k, 'ключ (' + x + ',' + y + ')');
  });
});

test('кластер: записи по 19 байт читаются обратно gdb.js', () => {
  const tiles = CLUSTER0_KEYS.map(([x, y]) => ({ x, y, lw: 5, lh: 5, off: 1000000, size: 40 }));
  const blob = G.clusterBlob(tiles);
  assert.equal(blob.length, 16 * G.CLUSTER_REC);
  // кластер лежит в томе так, чтобы 1000000 попадало в «данные»
  const vol = Buffer.alloc(1100000);
  blob.copy(vol, 900000);
  const g = gm.openBuffer(vol);
  const c = gm.cluster(g, { regionEnd: 0 }, 900000, blob.length);
  assert.equal(c.tiles.length, 16);
  assert.deepEqual(c.tiles.map(t => [t.x, t.y]), CLUSTER0_KEYS);
  assert.deepEqual(c.tiles.map(t => t.off), new Array(16).fill(1000000));
  assert.equal(c.searchBytes, 0, 'поиск-таблицы на диске нет');
});

// ── том целиком ────────────────────────────────────────────────────────────

// Кипр: кластер (112,57) — тот же, в котором лежат настоящие кипрские тайлы.
function cyprusVolume(roads) {
  const L = Object.assign({}, G.EUROPE_LEVELS[0], {
    clusters: [{
      cx: 112, cy: 57,
      tiles: [{ ix: 0, iy: 3, lw: 5, lh: 5, blob: G.tileBlob(roads) }],
    }],
  });
  const levels = G.EUROPE_LEVELS.map((l, i) => (i === 0 ? L : Object.assign({}, l, { clusters: [] })));
  return G.build({ levels });
}

test('том: шапка и таблица уровней читаются штатным читателем', () => {
  const v = cyprusVolume([{ points: road(5), name: 'A1' }]);
  const g = gm.openBuffer(v.gdb, v.gd2);
  const h = gm.header(g);
  assert.equal(h.sig, 'DEADBEEF');
  assert.equal(h.version, 37);
  assert.equal(h.nLevels, 12);
  assert.deepEqual(h.frame, G.FRAME);
  assert.equal(h.levels[0].offset, G.PROLOGUE, 'первый уровень идёт сразу за шапкой');
  for (let i = 1; i < 12; i++) {
    assert.equal(h.levels[i].offset, h.levels[i - 1].offset + h.levels[i - 1].size,
      'уровень ' + i + ' встык к предыдущему');
  }
  assert.equal(h.regionEnd, v.regionEnd);
  assert.equal(v.gdb.readUInt32BE(589), v.regionEnd, 'поле «начало данных» в шапке');
});

test('том: заголовки уровней те же, что у EJ211 (ячейка и пороги масштаба)', () => {
  const v = cyprusVolume([{ points: road(3) }]);
  const g = gm.openBuffer(v.gdb, v.gd2);
  const h = gm.header(g);
  h.levels.forEach((L, i) => {
    const b = gm.read(g, L.offset, 96);
    const hd = gm.levelHead(b);
    const want = G.EUROPE_LEVELS[i];
    assert.deepEqual([hd.cellX, hd.cellY, hd.potX, hd.potY],
      [want.cellX, want.cellY, want.potX, want.potY], 'L' + i + ': ячейка и биты кластера');
    assert.equal(b.readUInt32BE(10), want.from, 'L' + i + ': нижний порог');
    assert.equal(b.readUInt32BE(14), want.to, 'L' + i + ': верхний порог');
    assert.equal(b.readInt32BE(18), 0x7fffffff, 'L' + i + ': рамка из 0x7FFFFFFF');
    assert.equal((L.size - gm.TABLE_AT) % 6, 0, 'L' + i + ': таблица кластеров целая');
  });
});

test('том: сетка L0 — 256×280 и слот считается по формуле', () => {
  const v = cyprusVolume([{ points: road(4), name: 'A1' }]);
  const g = gm.openBuffer(v.gdb, v.gd2);
  const h = gm.header(g);
  const gr = gm.levelGrid(g, h, h.levels[0]);
  assert.equal(gr.W, 256);
  assert.equal(gr.H, 280);
  assert.equal(gr.table.start, gm.TABLE_AT);
  assert.equal(gr.gridOk, gr.gridN, 'все настоящие кластеры стоят в своих слотах');
  assert.equal(gr.gridN, 1);
  assert.equal(gm.slotFor(gr, gr.head, 14336, 7392), 57 * 256 + 112);
});

test('том: тайл с дорогой лежит там, где его ищет читатель', () => {
  const pts = road(9, 700, -120);
  const v = cyprusVolume([{ points: pts, name: 'A1' }]);
  const g = gm.openBuffer(v.gdb, v.gd2);
  const h = gm.header(g);
  const gr = gm.levelGrid(g, h, h.levels[0]);
  const e = gr.entries[57 * 256 + 112];
  assert.ok(e.off >= h.regionEnd && e.sz === 16 * G.CLUSTER_REC, 'слот указывает на кластер');

  const c = gm.cluster(g, h, e.off, e.sz);
  assert.equal(c.tiles.length, 16);
  // ix=0, iy=3 → ячейка (112·128, 57·128 + 3·32) = (14336, 7392)
  const t = c.tiles.find(x => x.x === 14336 && x.y === 7392);
  assert.ok(t, 'тайл с нужным ключом есть в кластере');
  const th = gm.tileHeader(g, t.off, t.size);
  assert.equal(th.ok, true);
  const pr = gm.tilePoints(g, t.off, t.size);
  assert.deepEqual(pr.points, pts, 'из тома вычитываются ровно наши точки');

  // остальные 15 клеток кластера — общий пустой тайл, один на всех
  const holes = c.tiles.filter(x => x !== t);
  assert.equal(new Set(holes.map(x => x.off)).size, 1, 'дырки ссылаются на один блоб');
  assert.equal(holes[0].size, 40);
  assert.equal(holes[0].off, v.map.emptyTile.off);
});

test('том: незанятые слоги таблицы нулевые, а не мусор', () => {
  const v = cyprusVolume([{ points: road(2) }]);
  const g = gm.openBuffer(v.gdb, v.gd2);
  const h = gm.header(g);
  const gr = gm.levelGrid(g, h, h.levels[0]);
  const filled = gr.entries.filter(e => e.off !== 0 || e.sz !== 0);
  assert.equal(filled.length, 1, 'занят ровно один слот');
  assert.equal(gr.entries[0].off, 0);
  assert.equal(gr.entries[gr.entries.length - 1].sz, 0);
});

test('том: кластер вне сетки отвергается не молча', () => {
  const L = Object.assign({}, G.EUROPE_LEVELS[0], {
    clusters: [{ cx: 500, cy: 57, tiles: [{ ix: 0, iy: 0, lw: 5, lh: 5, blob: G.emptyTile() }] }],
  });
  assert.throws(() => G.build({ levels: [L] }), /вне сетки/);
});

test('том: кластер на грубом уровне получает ключ с добавкой уровня', () => {
  // L5: кластер (9,4), один тайл на кластер (lw = potX)
  const lvl = 5, cx = 9, cy = 4;
  const levels = G.EUROPE_LEVELS.map((l, i) => Object.assign({}, l, {
    clusters: i === lvl
      ? [{ cx, cy, lw: l.lw, lh: l.lh, tiles: [{ ix: 0, iy: 0, lw: l.lw, lh: l.lh, blob: G.tileBlob([{ points: road(5), name: 'L5' }]) }] }]
      : [],
  }));
  const v = G.build({ levels });
  const g = gm.openBuffer(v.gdb, v.gd2);
  const h = gm.header(g);
  const gr = gm.levelGrid(g, h, h.levels[lvl]);
  assert.equal(gr.W, 27);
  assert.deepEqual(gr.origin, gm.keyOrigin(lvl));

  const e = gr.entries[cy * gr.W + cx];
  assert.ok(e.off >= h.regionEnd && e.sz === G.CLUSTER_REC, 'кластер из одного тайла');
  const t = gm.cluster(g, h, e.off, e.sz).tiles[0];
  assert.equal(t.x, (lvl << 12) + (cx << gr.head.potX), 'в ключе добавка уровня по x');
  assert.equal(t.y, 0x8000 + (cy << gr.head.potY), 'и по y');
  assert.equal(gm.slotFor(gr, gr.head, t.x, t.y), cy * gr.W + cx, 'слот сходится');
  assert.equal(gr.gridOk, gr.gridN, 'читатель признаёт сетку');
});

test('том: уровни складываются встык и все двенадцать читаются', () => {
  const levels = G.EUROPE_LEVELS.map((l, i) => Object.assign({}, l, {
    clusters: [{ cx: 1, cy: 1, lw: l.lw, lh: l.lh,
      tiles: [{ ix: 0, iy: 0, lw: l.lw, lh: l.lh, blob: G.tileBlob([{ points: road(3), name: 'L' + i }]) }] }],
  }));
  const v = G.build({ levels });
  const g = gm.openBuffer(v.gdb, v.gd2);
  const h = gm.header(g);
  h.levels.forEach((L, i) => {
    const gr = gm.levelGrid(g, h, L);
    assert.ok(gr, 'L' + i + ': таблица найдена');
    assert.equal(gr.table.start, gm.TABLE_AT, 'L' + i + ': штатное начало');
    assert.equal(gr.gridN, 1, 'L' + i + ': один кластер');
    assert.equal(gr.gridOk, 1, 'L' + i + ': слот сходится');
  });
});

// ── укладка дорог из градусов ──────────────────────────────────────────────

test('дороги: каждая попадает в тайл юго-западного угла своей рамки', () => {
  const lines = [
    { name: 'A1', pts: [[33.30, 35.16], [33.32, 35.17]] },
    { name: 'A2', pts: [[33.30, 35.16], [33.31, 35.16]] },
    { name: 'A6', pts: [[32.45, 34.77], [32.46, 34.78]] },   // Пафос — другой кластер
  ];
  const r = G.roadsToLevel(lines);
  assert.equal(r.tiles, 2, 'две первые дороги в одном тайле, третья в своём');
  assert.equal(r.clusters, 2);
  assert.equal(r.skipped, 0);
});

test('дороги: ломаная из одной точки и слишком длинная пропускаются', () => {
  const r = G.roadsToLevel([
    { name: 'точка', pts: [[33.3, 35.16]] },
    { name: 'длинная', pts: new Array(300).fill(0).map((_, i) => [33.3 + i * 0.0001, 35.16]) },
    { name: 'хорошая', pts: [[33.3, 35.16], [33.31, 35.17]] },
  ]);
  assert.equal(r.skipped, 2);
  assert.equal(r.tiles, 1);
});

test('дороги: градусы возвращаются из тома с точностью до сотой доли', () => {
  const deg = [[33.300, 35.160], [33.320, 35.170], [33.340, 35.185]];
  const v = G.volumeFromRoads([{ name: 'A1', pts: deg }]);
  const g = gm.openBuffer(v.gdb, v.gd2);
  const h = gm.header(g);
  const gr = gm.levelGrid(g, h, h.levels[0]);
  const c0 = v.map.levels[0].clusters[0];
  const t = gm.cluster(g, h, c0.off, c0.size).tiles.find(x => x.size > 40);
  const pr = gm.tilePoints(g, t.off, t.size, t.x, t.y);
  assert.equal(pr.count, deg.length);
  pr.points.forEach((p, i) => {
    assert.ok(Math.abs(p.lon - deg[i][0]) < 0.01, 'точка ' + i + ': долгота ' + p.lon);
    assert.ok(Math.abs(p.lat - deg[i][1]) < 0.01, 'точка ' + i + ': широта ' + p.lat);
  });
  assert.equal(gr.entries[c0.slot].off, c0.off, 'кластер стоит в своём слоте');
});

test('дороги: уходящая на запад не теряется — привязка идёт по углу рамки', () => {
  // первая точка у западного края тайла, дальше дорога идёт на запад:
  // при привязке по первой точке x стал бы отрицательным и дорога пропала бы
  const west = [[33.3000, 35.160], [33.2900, 35.160], [33.2800, 35.161]];
  const r = G.roadsToLevel([{ name: 'западная', pts: west }]);
  assert.equal(r.skipped, 0, 'дорога не пропущена');
  assert.equal(r.tiles, 1, 'дорога легла в один тайл');

  const v = G.volumeFromRoads([{ name: 'западная', pts: west }]);
  const g = gm.openBuffer(v.gdb, v.gd2);
  const h = gm.header(g);
  const gr = gm.levelGrid(g, h, h.levels[0]);
  let found = 0;
  for (const e of gr.entries) {
    if (!e.sz || e.off < h.regionEnd) continue;
    for (const t of gm.cluster(g, h, e.off, e.sz).tiles) {
      const rd = G.readTileRoads(gm.read(g, t.off, t.size));
      for (const one of rd.roads) if (one.points.length === west.length) found++;
    }
  }
  assert.ok(found > 0, 'дорога нашлась в томе');
});

test('дороги: плотному кластеру достаётся тайл поменьше', () => {
  // много коротких дорог в одной точке: при тайле 2^5 блоб переполнит u16
  // пятно целиком внутри одного тайла 2^5, но шириной в полторы ячейки:
  // уменьшение тайла его разрежет, а на 2^5 блоб переполнит u16
  const lines = [];
  for (let i = 0; i < 450; i++) {
    const lon = 33.302 + (i % 25) * 0.00064, lat = 35.146 + Math.floor(i / 25) * 0.00044;
    const pts = [];
    for (let k = 0; k < 40; k++) pts.push([lon + k * 0.00002, lat + (k % 2) * 0.00002]);
    lines.push({ name: 'R' + i, pts });
  }
  const r = G.roadsToLevel(lines);
  assert.equal(r.skipped, 0, 'ни одна дорога не потеряна');
  const sizes = Object.keys(r.sizes);
  assert.equal(sizes.length, 1, 'кластер один');
  assert.notEqual(sizes[0], '2^5x2^5', 'размер тайла уменьшен под плотность');
  assert.ok(r.tiles > 1, 'кластер разбит на несколько тайлов');
});

test('дороги: размер тайла внутри кластера один — как у завода', () => {
  const lines = [];
  for (let i = 0; i < 400; i++) {
    const lon = 33.30 + (i % 20) * 0.001, lat = 35.16 + Math.floor(i / 20) * 0.001;
    lines.push({ name: 'R' + i, pts: [[lon, lat], [lon + 0.0005, lat + 0.0005]] });
  }
  const v = G.volumeFromRoads(lines);
  const g = gm.openBuffer(v.gdb, v.gd2);
  const h = gm.header(g);
  const gr = gm.levelGrid(g, h, h.levels[0]);
  for (const e of gr.entries) {
    if (!e.sz || e.off < h.regionEnd) continue;
    const set = new Set(gm.cluster(g, h, e.off, e.sz).tiles.map(t => t.lw + 'x' + t.lh));
    assert.equal(set.size, 1, 'в кластере один размер тайла');
  }
});

// ── грубые уровни ──────────────────────────────────────────────────────────

test('уровни: сдвиг из заголовка совпадает с первым байтом метки +82', () => {
  for (const L of G.EUROPE_LEVELS) {
    assert.equal(L.shift, parseInt(L.tag.slice(0, 2), 16), 'метка и сдвиг не разошлись');
  }
  assert.deepEqual(G.EUROPE_LEVELS.map(L => L.shift), [0, 3, 5, 6, 7, 9, 9, 10, 10, 11, 11, 12]);
});

test('уровни: тайл любого уровня влезает в u16 после сдвига', () => {
  // (ячейка << lw) >> сдвиг — размах тайла в сырых единицах. Ровно это правило
  // сходится у всех 4695 проверенных заводских тайлов.
  for (const L of G.EUROPE_LEVELS) {
    assert.ok(((L.cellX * (1 << L.lw)) >> L.shift) <= 0xffff, 'по x');
    assert.ok(((L.cellY * (1 << L.lh)) >> L.shift) <= 0xffff, 'по y');
  }
});

test('грубые уровни: дорога через весь Кипр возвращается из тома в градусах', () => {
  // На L0 такая дорога не помещается: 2,1° — это 154 000 мировых единиц, а x
  // точки — u16. На грубых уровнях её укладывает сдвиг.
  const road = [[32.42, 34.75], [33.00, 35.10], [33.36, 35.17], [34.55, 35.65]];
  const lines = [{ name: 'A1', cls: 'motorway', pts: road }];

  assert.equal(G.roadsToLevel(lines, { level: 0 }).tiles, 0, 'на L0 не легла');

  // предел разрешения уровня: половина сырой единицы в километрах по долготе
  const limit = L => (1 << L.shift) / gm.UNITS_PER_LON * 88.9;
  for (const lv of [1, 2, 3, 5, 8, 11]) {
    const v = G.volumeFromRoads(lines, { levels: [lv] });
    const g = gm.openBuffer(v.gdb, v.gd2);
    const h = gm.header(g);
    const hd = gm.levelHead(gm.read(g, h.levels[lv].offset, 100));
    assert.equal(hd.shift, G.EUROPE_LEVELS[lv].shift, 'сдвиг уровня записан');

    let t = null;
    for (const cl of v.map.levels[lv].clusters) { t = cl.tiles.find(x => x.size > 40) || t; }
    assert.ok(t, 'L' + lv + ': тайл с дорогой есть');

    const rr = G.readTileRoads(gm.read(g, t.off, t.size));
    assert.equal(rr.roads.length, 1);
    const k0 = gm.keyOrigin(lv);
    const back = rr.roads[0].points.map(p => [
      gm.lonOfCellL((t.x - k0.x0) + (p.x * (1 << hd.shift)) / hd.cellX, hd.cellX),
      gm.latOfCellL((t.y - k0.y0) + (p.y * (1 << hd.shift)) / hd.cellY, hd.cellY),
    ]);
    assert.equal(back.length, road.length, 'L' + lv + ': все точки на месте');
    back.forEach((p, i) => {
      const err = Math.hypot((p[0] - road[i][0]) * 88.9, (p[1] - road[i][1]) * 111.1);
      assert.ok(err <= limit(G.EUROPE_LEVELS[lv]), 'L' + lv + ' точка ' + i +
        ': ошибка ' + err.toFixed(3) + ' км при пределе ' + limit(G.EUROPE_LEVELS[lv]).toFixed(3));
    });
  }
});

test('грубые уровни: классы дорог отсеиваются по пирамиде', () => {
  const lines = [
    { name: 'A1', cls: 'motorway', pts: [[33.0, 35.0], [33.1, 35.05]] },
    { name: 'B9', cls: 'primary', pts: [[33.0, 35.0], [33.1, 35.05]] },
    { name: 'ул.', cls: 'residential', pts: [[33.0, 35.0], [33.1, 35.05]] },
  ];
  assert.equal(G.linesForLevel(lines, 0).length, 3, 'на L0 всё');
  assert.equal(G.linesForLevel(lines, 1).length, 2, 'на L1 без жилых улиц');
  assert.equal(G.linesForLevel(lines, 4).length, 2, 'на L4 магистрали и primary');
  assert.equal(G.linesForLevel(lines, 11).length, 1, 'на L11 только автобаны');
});
