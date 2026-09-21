'use strict';
// Проверка урезания тома GDB. Карта не нужна: исходный том собирается
// gdbgen во временном каталоге, урезается, и результат читается настоящим
// читателем — тем же, что разбирает EJ211_v37a.gdb.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const gm = require('./gdb');
const G = require('./gdbgen');
const strip = require('./gdbstrip').strip;

const road = (n, x0 = 100, y0 = 50) => {
  const points = [];
  for (let i = 0; i < n; i++) points.push({ x: x0 + i * 10, y: y0 - i * 3 });
  return points;
};

// Два кластера: Кипр (112,57) и Париж (~97,67) — второй должен пропасть.
const CYP = { cx: 112, cy: 57 }, PAR = { cx: 97, cy: 67 };

function sourceVolume() {
  const L = Object.assign({}, G.EUROPE_LEVELS[0], {
    clusters: [
      { cx: CYP.cx, cy: CYP.cy, tiles: [{ ix: 0, iy: 3, lw: 5, lh: 5, blob: G.tileBlob([{ points: road(6), name: 'A1' }]) }] },
      { cx: PAR.cx, cy: PAR.cy, tiles: [{ ix: 1, iy: 1, lw: 5, lh: 5, blob: G.tileBlob([{ points: road(200), name: 'PARIS' }]) }] },
    ],
  });
  const levels = G.EUROPE_LEVELS.map((l, i) => (i === 0 ? L : Object.assign({}, l, { clusters: [] })));
  return G.build({ levels });
}

// разложить собранный том по каталогу, как ждёт openGdb
function layout(v) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gdbstrip-'));
  const d1 = path.join(root, 'pkgdb', 'GDB'), d2 = path.join(root, 'pkgdb', 'GDB2');
  fs.mkdirSync(d1, { recursive: true });
  fs.mkdirSync(d2, { recursive: true });
  fs.writeFileSync(path.join(d1, 'EJ211_v37a.gdb'), v.gdb);
  fs.writeFileSync(path.join(d2, 'EJ211_v37a.gd2'), v.gd2);
  fs.writeFileSync(path.join(d1, 'GDB.conf'), 'size=0\n');
  return root;
}

// Кипр по калибровке из docs/formats/gdb.md — центр кластера (112,57)
const AROUND = [33.36, 35.17];

test('урезание: том становится меньше, но остаётся читаемым', () => {
  const src = sourceVolume();
  const root = layout(src);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gdbstrip-out-'));
  const r = strip(root, out, AROUND[0], AROUND[1], 1);

  const gdb = fs.readFileSync(r.file);
  assert.equal(gdb.length, r.size);
  assert.ok(gdb.length < src.gdb.length,
    'урезанный том меньше исходного: ' + gdb.length + ' против ' + src.gdb.length);

  const g = gm.openBuffer(gdb, Buffer.alloc(0));
  const h = gm.header(g);
  assert.equal(h.sig, 'DEADBEEF');
  assert.equal(h.nLevels, 12);
  assert.equal(h.regionEnd, src.regionEnd, 'область уровней копируется как есть');
});

test('урезание: кластер вокруг точки сохраняется вместе с дорогой', () => {
  const src = sourceVolume();
  const root = layout(src);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gdbstrip-out-'));
  const r = strip(root, out, AROUND[0], AROUND[1], 1);

  const g = gm.openBuffer(fs.readFileSync(r.file), Buffer.alloc(0));
  const h = gm.header(g);
  const gr = gm.levelGrid(g, h, h.levels[0]);
  const e = gr.entries[CYP.cy * gr.W + CYP.cx];
  assert.ok(e.off >= h.regionEnd && e.sz === 16 * G.CLUSTER_REC, 'кластер Кипра на месте');

  const t = gm.cluster(g, h, e.off, e.sz).tiles.find(x => x.size > 40);
  assert.ok(t, 'тайл с дорогой перенесён');
  assert.equal(gm.tileHeader(g, t.off, t.size).ok, true);
  assert.deepEqual(gm.tilePoints(g, t.off, t.size).points, road(6), 'точки те же');
});

test('урезание: дальний кластер выброшен, а не оставлен висеть', () => {
  const src = sourceVolume();
  const root = layout(src);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gdbstrip-out-'));
  const r = strip(root, out, AROUND[0], AROUND[1], 1);

  const g = gm.openBuffer(fs.readFileSync(r.file), Buffer.alloc(0));
  const h = gm.header(g);
  const gr = gm.levelGrid(g, h, h.levels[0]);
  const far = gr.entries[PAR.cy * gr.W + PAR.cx];
  const cyp = gr.entries[CYP.cy * gr.W + CYP.cx];
  assert.notEqual(far.off, cyp.off, 'парижский слот не указывает на кипрский кластер');
  assert.equal(far.sz, 0, 'парижский слот переведён на пустой кластер');
  // ни одна запись таблицы не смотрит за конец нового тома
  for (const en of gr.entries) assert.ok(en.off + en.sz <= g.total, 'запись @' + en.off + ' в пределах тома');
});

test('урезание: указатель каталога блобов обнулён, а не оставлен чужим', () => {
  const src = sourceVolume();
  // в исходном томе поле каталога тоже ноль (gdbgen его не пишет) — подложим
  // «оригинальные» значения, чтобы проверить именно обнуление при урезании
  src.gdb.writeUInt32BE(44747, 577);
  src.gdb.writeUInt32BE(874970, 581);
  src.gdb.writeUInt32BE(357976, 585);
  const root = layout(src);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gdbstrip-out-'));
  const r = strip(root, out, AROUND[0], AROUND[1], 1);

  const gdb = fs.readFileSync(r.file);
  assert.equal(gdb.readUInt32BE(577), 0, 'число записей каталога');
  assert.equal(gdb.readUInt32BE(581), 0, 'смещение каталога');
  assert.equal(gdb.readUInt32BE(585), 0, 'размер каталога');
  assert.equal(gdb.readUInt32BE(589), src.regionEnd, 'начало данных не тронуто');
});

test('урезание: общий пустой тайл переносится один раз на все дырки', () => {
  const src = sourceVolume();
  const root = layout(src);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gdbstrip-out-'));
  const r = strip(root, out, AROUND[0], AROUND[1], 1);

  const g = gm.openBuffer(fs.readFileSync(r.file), Buffer.alloc(0));
  const h = gm.header(g);
  const gr = gm.levelGrid(g, h, h.levels[0]);
  const e = gr.entries[CYP.cy * gr.W + CYP.cx];
  const tiles = gm.cluster(g, h, e.off, e.sz).tiles;
  const holes = tiles.filter(t => t.size === 40);
  assert.equal(holes.length, 15);
  assert.equal(new Set(holes.map(t => t.off)).size, 1, 'все дырки на один блоб');
});

test('урезание: второй том пустой — сквозных ссылок за границу не остаётся', () => {
  const src = sourceVolume();
  const root = layout(src);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gdbstrip-out-'));
  const r = strip(root, out, AROUND[0], AROUND[1], 1);
  const gd2 = path.join(out, 'pkgdb', 'GDB2', 'EJ211_v37a.gd2');
  assert.equal(fs.statSync(gd2).size, 0);
  assert.ok(r.report.some(l => /^L 0|^L0/.test(l)), 'в отчёте есть строка про L0: ' + r.report[0]);
});
