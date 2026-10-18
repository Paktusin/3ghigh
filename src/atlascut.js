'use strict';
// Рельеф (TER, формат ATLAS/Orion) только для Кипра.
//
//   node src/atlascut.js [out/ter-cyprus] [--box lon0,lat0,lon1,lat1] [--copies]
//
// Устройство формата — docs/formats/atlas.md. Коротко то, на что опирается сборка:
//  * база из двух файлов-ресурсов (TER и TER2) с общим адресным пространством:
//    смещения в индексе сквозные, у TER2 база = размер TER (HEADER +0x58);
//  * индекс — корень на 512 ссылок и 427 листьев по 2048 записей
//    (ручка u64, смещение u64, размер u32), ручка = 0x5000000000000000 + n;
//  * контейнер n несёт точки SOAR с номерами [n·8192, (n+1)·8192), номер точки
//    задан чередующимися квадродеревьями (Lindstrom–Pascucci), 2^16 клеток на
//    квадрат lon −12…42.6°, lat 24.4…79°;
//  * пустое море в заводской базе — 565 462 одинаковых контейнера по 208 байт.
//
// Сборка оставляет все 873 814 ручек (адресацию точек менять нельзя: базовый
// номер точки прошивка считает из ручки), но настоящими остаются только
// контейнеры, в которых есть точки треугольников, задевающих рамку. Остальные
// ручки указывают на один заводской морской контейнер (с --copies — на копию
// для каждой ручки, со своей ручкой в шапке). Служебный контейнер
// SoarTerrainDescription (ручка 0x5FFF…F) лежит, как и у завода, во втором файле.
//
// Заводской файл только читается.

const fs = require('fs');
const path = require('path');
const conf = require('./conf');
const dataset = require('./dataset');

const BASE = 0x5000000000000000n;
const SERVICE = 0x5fffffffffffffffn;
const N = 16;                                       // TerrainDepth
const CSIZE = 8192;                                 // ContainerSize
const AREA = [-120000000, 243858334, 426141666, 790000000]; // lon0 lat0 lon1 lat1, 1e-7°
const CYPRUS = [32.0, 34.3, 34.9, 36.0];            // рамка с запасом ~20 км

// ── SOAR: номер точки ───────────────────────────────────────────────────────
// Ребёнок по коду 0x09353fc4: c = 4p + ((2p + q + k) & 3) − 7, p — вершина
// треугольника, q — точка деления, k = 2 (левый) / 3 (правый). Углы 0..3,
// центр 4, середины краёв 5..8 — единственная раскладка, где номера плотные
// с нуля; последний номер (5·4^n + 4)/3 даёт ровно 873 814 контейнеров.
function child(p, q, k) { return 4 * p + ((2 * p + q + k) & 3) - 7; }

// Обойти треугольники, задевающие рамку [gx0, gy0, gx1, gy1] (в клетках),
// и отдать номера всех точек деления. Точка — [x, y, номер].
function walk(n, box, mark) {
  const W = 2 ** n, H = W / 2;
  const C = [[0, 0, 0], [W, 0, 1], [W, W, 2], [0, W, 3]];
  const M = [[H, 0, 5], [W, H, 6], [H, W, 7], [0, H, 8]];
  const c = [H, H, 4];
  for (let i = 0; i <= 8; i++) mark(i);
  const hit = (a, b, d) =>
    Math.max(a[0], b[0], d[0]) >= box[0] && Math.min(a[0], b[0], d[0]) <= box[2] &&
    Math.max(a[1], b[1], d[1]) >= box[1] && Math.min(a[1], b[1], d[1]) <= box[3];
  function ref(v0, a, v2, s) {
    if (!hit(v0, a, v2)) return;
    mark(s[2]);
    if (Math.max(Math.abs(v0[0] - a[0]), Math.abs(v0[1] - a[1])) <= 1) return;
    ref(v0, s, a, [(v0[0] + a[0]) / 2, (v0[1] + a[1]) / 2, child(a[2], s[2], 2)]);
    ref(a, s, v2, [(a[0] + v2[0]) / 2, (a[1] + v2[1]) / 2, child(a[2], s[2], 3)]);
  }
  for (let t = 0; t < 4; t++) ref(C[t], c, C[(t + 1) % 4], M[t]);
}

// Градусы → клетки сетки. Ось сетки X идёт от северного края на юг, Y — по
// долготе (поворот проверен по размерам контейнеров: море/суша, см. docs).
function gridBox([lon0, lat0, lon1, lat1]) {
  const W = 2 ** N;
  const f = (v, i) => (v * 1e7 - AREA[i]) / (AREA[i + 2] - AREA[i]) * W;
  return [W - f(lat1, 1), f(lon0, 0), W - f(lat0, 1), f(lon1, 0)];
}

function containersFor(boxDeg) {
  const keep = new Set();
  walk(N, gridBox(boxDeg), (i) => keep.add(Math.floor(i / CSIZE)));
  return keep;
}

// ── чтение заводской базы ───────────────────────────────────────────────────
function readAt(fd, off, len) {
  const b = Buffer.alloc(len);
  fs.readSync(fd, b, 0, len, off);
  return b;
}
const name = (b) => b.toString('latin1', 1, 1 + b[0]);

function header(b) {
  if (name(b) !== 'HEADER' || b[0x14] !== 4 || b[0x18] !== 0x6c)
    throw new Error('не HEADER Orion 4.x');
  return { count: b[0x1a], index: b[0x1b], total: Number(b.readBigUInt64LE(0x48)),
           size: Number(b.readBigUInt64LE(0x50)), base: Number(b.readBigUInt64LE(0x58)) };
}

// раздел INDEX: +0x18 тип (1 — ссылки на листья, 2 — контейнеры),
// +0x19 log2 числа записей, с +0x1b три столбца
function index(b) {
  const n = 1 << b[0x19], k0 = 0x1b, o0 = k0 + 8 * n, s0 = o0 + 8 * n;
  const e = [];
  for (let i = 0; i < n; i++)
    e.push({ key: b.readBigUInt64LE(k0 + 8 * i), off: Number(b.readBigUInt64LE(o0 + 8 * i)),
             size: b.readUInt32LE(s0 + 4 * i) });
  return { type: b[0x18], n, e, o0, s0 };
}

// база из файлов-ресурсов: чтение по сквозному смещению
function open(files) {
  const res = files.map((p) => {
    const fd = fs.openSync(p, 'r');
    return Object.assign({ fd, path: p }, header(readAt(fd, 0, 4096)));
  });
  const read = (off, len) => {
    const r = res.find((x) => off >= x.base && off + len <= x.base + x.size);
    if (!r) throw new Error('смещение вне ресурсов: ' + off);
    return readAt(r.fd, off - r.base, len);
  };
  const rev = read(4096, 4096);
  if (name(rev) !== 'REVISION') throw new Error('нет REVISION');
  const rootOff = Number(rev.readBigUInt64LE(0x20)), rootSize = rev.readUInt32LE(0x1c);
  const root = index(read(rootOff, rootSize));
  const leaves = [];
  for (const r of root.e) {
    const last = leaves[leaves.length - 1];
    if (last && last.off === r.off) continue;   // хвост корня — повтор последнего листа
    leaves.push({ off: r.off, size: r.size, buf: read(r.off, r.size) });
  }
  for (const l of leaves) l.ix = index(l.buf);
  return { res, read, rootOff, rootSize, leaves, close: () => res.forEach((x) => fs.closeSync(x.fd)) };
}

// ── сборка ──────────────────────────────────────────────────────────────────
function build(root, outDir, opt) {
  const o = opt || {};
  const log = o.log || (() => {});
  const src = ['TER', 'TER2'].map((d) => {
    const dir = path.join(root, 'pkgdb', d);
    return path.join(dir, fs.readdirSync(dir).find((f) => /\.ATLAS$/i.test(f)));
  });
  const db = open(src);
  const keep = containersFor(o.box || CYPRUS);

  // записи листьев; морской образец — первая 208-байтовая запись. Вне рамки
  // всё заменяется им; 208-байтовые, что с ним не совпадают (без ручки в
  // +0x18), остаются заводскими: их 187 одиннадцати видов, отличаются одним
  // постоянным полем (догадка: ровная поверхность не на нуле — озеро, плато).
  let svc = null, sea = null, real = 0, realBytes = 0;
  const isSea = (e) => {
    if (e.size !== 208) return false;
    const b = db.read(e.off, e.size);
    b.writeBigUInt64LE(sea.key, 0x18);
    return b.equals(sea.buf);
  };
  for (const l of db.leaves) for (const e of l.ix.e) {
    if (e.key === SERVICE) { svc = svc || e; continue; }
    if (!sea && e.size === 208) sea = Object.assign({ buf: db.read(e.off, e.size) }, e);
    e.keep = keep.has(Number(e.key - BASE)) || (e.size === 208 && !isSea(e));
    if (e.keep) { real++; realBytes += e.size; }
  }
  if (!svc || !sea) throw new Error('нет служебного или морского контейнера');
  log('контейнеров в рамке ' + keep.size + ', настоящих в сборке ' + real +
      ' (' + (realBytes / 1048576).toFixed(1) + ' МБ)');

  const dir1 = path.join(outDir, 'pkgdb', 'TER'), dir2 = path.join(outDir, 'pkgdb', 'TER2');
  fs.mkdirSync(dir1, { recursive: true }); fs.mkdirSync(dir2, { recursive: true });
  const dst = [path.join(dir1, path.basename(src[0])), path.join(dir2, path.basename(src[1]))];

  // раскладка TER: шапка, ревизия, индекс на заводских местах, затем данные
  const leafEnd = db.leaves[db.leaves.length - 1].off + db.leaves[db.leaves.length - 1].size;
  let pos = leafEnd;
  const seaBuf = sea.buf;
  let seaOff = -1;
  for (const l of db.leaves) for (const e of l.ix.e) {
    if (e.key === SERVICE) continue;
    if (e.keep || o.copies) { e.at = pos; pos += e.keep ? e.size : seaBuf.length; }
  }
  if (!o.copies) { seaOff = pos; pos += seaBuf.length; }
  const size1 = pos;
  const svcBuf = db.read(svc.off, svc.size);
  const size2 = 4096 + svcBuf.length, svcOff = size1 + 4096;

  const patchHeader = (b, idx, size, base) => {
    b = Buffer.from(b);
    b[0x1b] = idx;
    b.writeBigUInt64LE(BigInt(size1 + size2), 0x48);
    b.writeBigUInt64LE(BigInt(size), 0x50);
    b.writeBigUInt64LE(BigInt(base), 0x58);
    return b;
  };

  const fd = fs.openSync(dst[0], 'w');
  fs.writeSync(fd, patchHeader(readAt(db.res[0].fd, 0, 4096), 0, size1, 0), 0, 4096, 0);
  fs.writeSync(fd, db.read(4096, db.rootOff - 4096), 0, db.rootOff - 4096, 4096);
  fs.writeSync(fd, db.read(db.rootOff, db.rootSize), 0, db.rootSize, db.rootOff);
  for (const l of db.leaves) {
    const b = Buffer.from(l.buf);
    l.ix.e.forEach((e, i) => {
      const off = e.key === SERVICE ? svcOff : e.at !== undefined ? e.at : seaOff;
      const sz = e.key === SERVICE ? svc.size : e.keep ? e.size : seaBuf.length;
      b.writeBigUInt64LE(BigInt(off), l.ix.o0 + 8 * i);
      b.writeUInt32LE(sz, l.ix.s0 + 4 * i);
    });
    fs.writeSync(fd, b, 0, b.length, l.off);
  }
  for (const l of db.leaves) for (const e of l.ix.e) {
    if (e.at === undefined) continue;
    let b;
    if (e.keep) b = db.read(e.off, e.size);
    else { b = Buffer.from(seaBuf); b.writeBigUInt64LE(e.key, 0x18); }
    fs.writeSync(fd, b, 0, b.length, e.at);
  }
  if (seaOff >= 0) fs.writeSync(fd, seaBuf, 0, seaBuf.length, seaOff);
  fs.closeSync(fd);

  const fd2 = fs.openSync(dst[1], 'w');
  fs.writeSync(fd2, patchHeader(readAt(db.res[1].fd, 0, 4096), 1, size2, size1), 0, 4096, 0);
  fs.writeSync(fd2, svcBuf, 0, svcBuf.length, 4096);
  fs.closeSync(fd2);
  db.close();

  ['TER', 'TER2'].forEach((d, i) => {
    const sdir = path.join(root, 'pkgdb', d);
    const cf = fs.readdirSync(sdir).find((f) => f.endsWith('.conf'));
    const to = path.join(path.dirname(dst[i]), cf);
    fs.copyFileSync(path.join(sdir, cf), to);
    conf.updateConf(to, dst[i]);
  });
  log('TER  ' + dst[0] + ': ' + (size1 / 1048576).toFixed(1) + ' МБ');
  log('TER2 ' + dst[1] + ': ' + size2 + ' б');
  return { dst, size1, size2, real, keep: keep.size };
}

// Сверка собранного: ручки идут подряд без пропусков, по каждому смещению лежит
// CONTAINER нужного размера; морские заглушки — 208 байт; у остальных ручка в
// шапке своя и байты совпадают с заводскими.
function check(files, factory) {
  const db = open(files), fdb = factory && open(factory);
  const [a, b2] = db.res;
  if (a.total !== a.size + b2.size || b2.base !== a.size) throw new Error('шапки не сходятся');
  const fmap = new Map(), uses = new Map(), all = [];
  if (fdb) for (const l of fdb.leaves) for (const e of l.ix.e) fmap.set(e.key, e);
  for (const l of db.leaves) for (const e of l.ix.e) {
    all.push(e); uses.set(e.off, (uses.get(e.off) || 0) + 1);
  }
  let ids = 0, real = 0;
  for (const e of all) {
    const b = db.read(e.off, e.size);
    if (name(b.subarray(0, 16)) !== 'CONTAINER' || b.readUInt32LE(16) !== e.size)
      throw new Error('ручка ' + e.key.toString(16) + ': не CONTAINER');
    if (e.key === SERVICE) continue;
    if (Number(e.key - BASE) !== ids++) throw new Error('пропуск ручки ' + e.key.toString(16));
    if (uses.get(e.off) > 1) { if (e.size !== 208) throw new Error('общий не морской'); continue; }
    if (b.readBigUInt64LE(0x18) !== e.key) throw new Error('чужая ручка в шапке');
    const f = fmap.get(e.key);
    if (fdb && (!f || !fdb.read(f.off, f.size).equals(b))) {
      if (e.size !== 208) throw new Error('байты не заводские');
      continue;                                 // морская копия (--copies)
    }
    real++;
  }
  db.close(); if (fdb) fdb.close();
  return { entries: all.length, handles: ids, real };
}

module.exports = { child, walk, gridBox, containersFor, open, index, header, build, check,
                   CYPRUS, N, CSIZE, AREA, BASE, SERVICE };

if (require.main === module) {
  const a = process.argv.slice(2);
  const outDir = a.find((x) => !x.startsWith('--') && !/^-?\d/.test(x)) || 'out/ter-cyprus';
  const bi = a.indexOf('--box');
  const box = bi >= 0 ? a[bi + 1].split(',').map(Number) : CYPRUS;
  const root = dataset.resolveRoot();
  const r = build(root, outDir, { box, copies: a.includes('--copies'), log: console.log });
  const c = check(r.dst, ['TER', 'TER2'].map((d) => {
    const dir = path.join(root, 'pkgdb', d);
    return path.join(dir, fs.readdirSync(dir).find((f) => /\.ATLAS$/i.test(f)));
  }));
  console.log('сверка: записей ' + c.entries + ', ручек ' + c.handles + ', настоящих ' + c.real +
              ' (байты заводские)');
}
