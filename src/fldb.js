'use strict';
// Разбор контейнера FLDB (файлы XAC / LIT / TMC / LABEL в pkgdb).
//
// Структура (все числа little-endian):
//   0x00 u32  0x220  — начало области каталога
//   0x08 u32  unix-время сборки
//   0x0C u32  количество файлов
//   0x10 u32  0x24 = 36 — размер записи каталога
//   0x14 4б   сигнатура "FLDB"
//   0x20 ..   текстовый блок !dbinfo0001 ... !enddbinfo
//   0x21C ..  каталог, записи по 36 байт:
//               +0x00 u32      контрольная сумма (алгоритм не опознан)
//               +0x04 u32      смещение данных
//               +0x08 u32      размер
//               +0x0C char[20] имя, дополненное нулями
// Данные выровнены по 2048 байт.

const fs = require('fs');

const DIR_OFFSET = 0x21c;
const ENTRY_SIZE = 36;

function open(path) {
  const fd = fs.openSync(path, 'r');
  const size = fs.statSync(path).size;
  const h = Buffer.alloc(0x20);
  fs.readSync(fd, h, 0, 0x20, 0);
  if (h.toString('latin1', 0x14, 0x18) !== 'FLDB') {
    fs.closeSync(fd);
    throw new Error(path + ': не контейнер FLDB');
  }
  const info = Buffer.alloc(0x1fc);
  fs.readSync(fd, info, 0, info.length, 0x20);
  return {
    fd, path, size,
    count: h.readUInt32LE(0x0c),
    entrySize: h.readUInt32LE(0x10),
    built: new Date(h.readUInt32LE(0x08) * 1000),
    dbinfo: info.toString('latin1').replace(/\0[\s\S]*$/, '').trim(),
  };
}

function entries(db) {
  const b = Buffer.alloc(ENTRY_SIZE);
  const out = [];
  for (let i = 0; i < db.count; i++) {
    fs.readSync(db.fd, b, 0, ENTRY_SIZE, DIR_OFFSET + i * ENTRY_SIZE);
    out.push({
      index: i,
      checksum: b.readUInt32LE(0),
      offset: b.readUInt32LE(4),
      size: b.readUInt32LE(8),
      name: b.toString('latin1', 12, 32).replace(/\0[\s\S]*$/, ''),
    });
  }
  return out;
}

function read(db, entry) {
  const b = Buffer.alloc(entry.size);
  fs.readSync(db.fd, b, 0, entry.size, entry.offset);
  return b;
}

function verify(db) {
  const list = entries(db);
  let contiguous = 0, anomalies = 0;
  for (let i = 0; i + 1 < list.length; i++) {
    const gap = list[i + 1].offset - (list[i].offset + list[i].size);
    if (gap >= 0 && gap < 2048) contiguous++; else anomalies++;
  }
  const last = list[list.length - 1];   // контейнер может быть пустым (например Label.DB)
  return { contiguous, anomalies, slack: last ? db.size - (last.offset + last.size) : db.size };
}

module.exports = { open, entries, read, verify, DIR_OFFSET, ENTRY_SIZE };

if (require.main === module) {
  const [, , path, cmd, arg] = process.argv;
  if (!path) {
    console.error('использование: node fldb.js <файл.db> [list|extract <каталог>]');
    process.exit(1);
  }
  const db = open(path);
  console.log('файл       :', db.path);
  console.log('размер     :', db.size);
  console.log('файлов     :', db.count);
  console.log('размер зап.:', db.entrySize);
  console.log('собран     :', db.built.toISOString());
  if (db.dbinfo) console.log('dbinfo     :', db.dbinfo.replace(/\r?\n/g, ' | '));
  const v = verify(db);
  console.log('раскладка  : встык=' + v.contiguous + ' аномалий=' + v.anomalies + ' хвост=' + v.slack);

  const list = entries(db);
  if (cmd === 'list') {
    console.log('\n    #      смещение        размер   сумма     имя');
    for (const e of list) {
      console.log(String(e.index).padStart(5), String(e.offset).padStart(13),
        String(e.size).padStart(13), ' ' + e.checksum.toString(16).padStart(8, '0'),
        '  ' + e.name);
    }
  } else if (cmd === 'extract') {
    const dir = arg || 'out';
    fs.mkdirSync(dir, { recursive: true });
    for (const e of list) fs.writeFileSync(dir + '/' + e.name, read(db, e));
    console.log('\nизвлечено', list.length, 'файлов в', dir);
  }
}
