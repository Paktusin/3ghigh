'use strict';
// Универсальная сводка по набору навигационной БД MMI 3G(P).
// Использование: node src/coverage.js [каталог набора]
//
// Читает текстовые метаданные, затем находит все контейнеры FLDB в pkgdb/*
// и разбирает имена внутри них:
//   <ПРЕФИКС>_<CC><TT>_<n>.xac — дорожный тайл: CC — код страны, TT — тайл
//   <ПРЕФИКС>_<i>.ort          — ORTSNAMEN, справочник названий (i — номер страны,
//                                дублируется как u16BE по смещению 0x16)

const fs = require('fs');
const path = require('path');
const fldb = require('./fldb');
const dataset = require('./dataset');

const base = dataset.resolveRoot(process.argv[2]);

function meta(file, keys) {
  const p = path.join(base, file);
  if (!fs.existsSync(p)) return {};
  const txt = fs.readFileSync(p, 'latin1');
  const out = {};
  // разбор построчно: ключ = "значение"  /  ключ=значение  (# — комментарий)
  for (const line of txt.split('\n')) {
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (!keys.includes(key) || out[key] !== undefined) continue;
    let val = line.slice(eq + 1).trim();
    const hash = val.indexOf('#');
    if (hash >= 0 && !val.startsWith('"')) val = val.slice(0, hash).trim();
    out[key] = val.replace(/^"/, '').replace(/"[\s\S]*$/, '').trim();
  }
  return out;
}

const db = meta('DBInfo.txt', ['PartNumber', 'ApplicationSoftwareVersionNumber', 'SystemName']);
const mi = meta('metainfo2.txt', ['region', 'vendor', 'variant']);
const pkgFile = fs.existsSync(path.join(base, 'pkgdb'))
  ? fs.readdirSync(path.join(base, 'pkgdb')).find(f => f.endsWith('.pkg')) : null;
const pk = pkgFile ? meta(path.join('pkgdb', pkgFile),
  ['name', 'version', 'customer', 'project', 'market', 'type', 'userflags']) : {};

console.log('=== набор ===');
console.log('каталог      :', path.resolve(base));
console.log('парт-номер   :', db.PartNumber || '?');
console.log('система      :', (db.SystemName || '?').trim(), ' ПО:', db.ApplicationSoftwareVersionNumber || '?');
console.log('регион       :', mi.region || '?', ' рынок:', pk.market || '?');
console.log('пакет        :', pk.name || '?', ' версия:', pk.version || '?');
console.log('заказчик     :', pk.customer || '?', ' проект:', pk.project || '?', ' вендор:', mi.vendor || '?');
console.log('userflags    :', pk.userflags || '?');

// --- контейнеры ---
const pkgdb = path.join(base, 'pkgdb');
const containers = [];
if (fs.existsSync(pkgdb)) {
  for (const d of fs.readdirSync(pkgdb)) {
    const dir = path.join(pkgdb, d);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      try { const h = fldb.open(p); containers.push({ p, rel: d + '/' + f, db: h }); }
      catch (e) { /* не FLDB — пропускаем */ }
    }
  }
}
console.log('\n=== контейнеры FLDB ===');
for (const c of containers) {
  const v = fldb.verify(c.db);
  console.log(c.rel.padEnd(34), String(c.db.count).padStart(5), 'файлов ',
    c.db.built.toISOString().slice(0, 10), ' аномалий:', v.anomalies);
}

// --- покрытие по странам ---
const codes = new Map();
const orts = [];
for (const c of containers) {
  for (const e of fldb.entries(c.db)) {
    const t = e.name.match(/^[A-Z0-9]+_(..)(..)_[0-9][.]xac$/);
    if (t) {
      const s = codes.get(t[1]) || { files: 0, bytes: 0, tiles: new Set() };
      s.files++; s.bytes += e.size; s.tiles.add(t[2]);
      codes.set(t[1], s);
    }
    const o = e.name.match(/^[A-Z0-9]+_([0-9]+)[.]ort$/);
    if (o) {
      const d = fldb.read(c.db, e);
      const txt = d.subarray(0x40).toString('utf8').replace(/[^\x20-\x7e\u00c0-\u024f]/g, ' ');
      const names = (txt.match(/[A-Z\u00c0-\u024f][A-Z\u00c0-\u024f' .-]{3,}/g) || [])
        .map(s => s.trim()).filter(s => s.length > 3).slice(0, 6);
      orts.push({ index: d.readUInt16BE(0x16), size: e.size, names });
    }
  }
}

if (codes.size) {
  console.log('\n=== коды стран в дорожных данных ===');
  console.log('код  тайлов  файлов     МБ');
  let tot = 0;
  for (const [k, v] of [...codes].sort((a, b) => b[1].bytes - a[1].bytes)) {
    tot += v.bytes;
    console.log(k.padEnd(4), String(v.tiles.size).padStart(6), String(v.files).padStart(7),
      (v.bytes / 1048576).toFixed(1).padStart(8));
  }
  console.log('итого:', codes.size, 'кодов,', (tot / 1048576).toFixed(0), 'МБ');
}

if (orts.length) {
  console.log('\n=== справочники названий (.ort) ===');
  console.log('  # размер     первые названия');
  for (const o of orts.sort((a, b) => a.index - b.index)) {
    console.log(String(o.index).padStart(3), String(o.size).padStart(9),
      '  ' + o.names.join(' | '));
  }
}
