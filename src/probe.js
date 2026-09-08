'use strict';
// Определение покрытия по НЕПОЛНОМУ файлу контейнера XAC.
// Использование: node src/probe.js <файл.db>
//
// Смысл: каталог FLDB лежит в самом начале файла, сразу за заголовком.
// Для набора на 2 ГБ каталог занимает ~150 КБ, поэтому список стран
// читается из первых сотен килобайт — качать весь файл не нужно.
// Достаточно скачать начало (Range: bytes=0-262143) и натравить этот скрипт.

const fs = require('fs');

const DIR_OFFSET = 0x220;
const ENTRY_SIZE = 36;

const file = process.argv[2];
if (!file) { console.error('использование: node src/probe.js <файл.db>'); process.exit(1); }

const fd = fs.openSync(file, 'r');
const have = fs.statSync(file).size;

const h = Buffer.alloc(0x20);
fs.readSync(fd, h, 0, 0x20, 0);
if (h.toString('latin1', 0x14, 0x18) !== 'FLDB') {
  console.error('не контейнер FLDB (сигнатура на 0x14 не совпала)');
  process.exit(1);
}
const count = h.readUInt32LE(0x0c);
const built = new Date(h.readUInt32LE(0x08) * 1000);

const info = Buffer.alloc(0x1fc);
fs.readSync(fd, info, 0, info.length, 0x20);
const dbinfo = info.toString('latin1').replace(/\0[\s\S]*$/, '').trim();

const dirBytes = count * ENTRY_SIZE;
const dirEnd = DIR_OFFSET + dirBytes;

console.log('файл          :', file);
console.log('прочитано     :', have, 'байт');
console.log('собран        :', built.toISOString().slice(0, 10));
console.log('файлов внутри :', count);
console.log('каталог       : 0x' + DIR_OFFSET.toString(16), '..', '0x' + dirEnd.toString(16),
  '(' + dirBytes + ' байт)');
if (dbinfo) console.log('dbinfo        :', dbinfo.replace(/\r?\n/g, ' | '));

if (have < dirEnd) {
  console.log();
  console.log('!! каталог обрезан: нужно как минимум', dirEnd, 'байт, есть', have);
  console.log('   докачайте начало файла до этого размера');
  process.exit(2);
}

const readable = Math.min(count, Math.floor((have - DIR_OFFSET) / ENTRY_SIZE));
const b = Buffer.alloc(ENTRY_SIZE);
const codes = new Map();
const ortRanges = [];
let tiles = 0, prefix = null;
for (let i = 0; i < readable; i++) {
  fs.readSync(fd, b, 0, ENTRY_SIZE, DIR_OFFSET + i * ENTRY_SIZE);
  const name = b.toString('latin1', 8, 32).replace(/\0[\s\S]*$/, '');
  const offset = b.readUInt32LE(0);
  const size = b.readUInt32LE(4);
  if (!prefix) { const p = name.match(/^([A-Z0-9]+)_/); if (p) prefix = p[1]; }
  // справочники названий — по ним страна опознаётся однозначно
  if (/^[A-Z0-9]+_[0-9]+[.]ort$/.test(name)) ortRanges.push({ name, offset, size });
  const m = name.match(/^[A-Z0-9]+_(..)(..)_[0-9][.]xac$/);
  if (!m) continue;
  tiles++;
  const s = codes.get(m[1]) || { files: 0, bytes: 0, tiles: new Set() };
  s.files++; s.bytes += size; s.tiles.add(m[2]);
  codes.set(m[1], s);
}

console.log('префикс БД    :', prefix || '?');
console.log();
console.log('код  тайлов  файлов       МБ');
let tot = 0;
for (const [k, v] of [...codes].sort((a, b) => b[1].bytes - a[1].bytes)) {
  tot += v.bytes;
  console.log(k.padEnd(4), String(v.tiles.size).padStart(6), String(v.files).padStart(7),
    (v.bytes / 1048576).toFixed(1).padStart(9));
}
console.log('итого:', codes.size, 'кодов стран,', (tot / 1048576).toFixed(0), 'МБ дорожных данных');
console.log('(размеры взяты из каталога — сами данные качать не требуется)');

// Коды стран локальны для каждой базы (в наборе AN, например, AT — это Австралия),
// поэтому по коду страну определять нельзя. Однозначно опознаёт справочник .ort:
// ниже готовые байтовые диапазоны, чтобы дозагрузить только их.
if (ortRanges.length) {
  console.log();
  console.log('справочники названий — точные диапазоны для дозагрузки:');
  for (const o of ortRanges) {
    const end = o.offset + o.size - 1;
    console.log('  ' + o.name.padEnd(16), String(o.size).padStart(9), 'б',
      '  Range: bytes=' + o.offset + '-' + end);
  }
  console.log('  (скачав такой кусок, посмотрите в нём названия городов —');
  console.log('   первые 64 байта служебные, дальше идут имена)');
}
