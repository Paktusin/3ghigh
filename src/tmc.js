'use strict';
// Реестр таблиц локаций TMC из pkgdb/TMC*/EJ211_global.tlt.
//
// Файл начинается с метки "TMC-LOC-TABLE OV" (16 байт) + u32BE размер.
// Далее записи по 36 байт (первая с 0x20):
//   +0x04 char[2]  ISO-код страны
//   +0x06 u8       ECC (Extended Country Code, RDS)
//   +0x07 u8       код страны RDS (ниббл из PI-кода)
//   +0x08 u8       LTN (Location Table Number)
//   +0x09 3 байта  флаги/идентификатор сервиса
//   +0x0C 4×u32    служебные поля (назначение не установлено)
//   +0x1C char[2]  код языка
// Число записей — u16BE по смещению 0x1A заголовка.
// Имена файлов таблиц: EJ211_<код RDS>_<LTN>.tlt

const fs = require('fs');
const path = require('path');
const fldb = require('./fldb');

const dataset = require('./dataset');
const REC = 36;
const FIRST = 0x20;

function registry(dbPath) {
  const db = fldb.open(dbPath);
  const entries = fldb.entries(db);
  const g = entries.find(e => /global\.tlt$/.test(e.name));
  if (!g) throw new Error('EJ211_global.tlt не найден');
  const d = fldb.read(db, g);

  const count = d.readUInt16BE(0x1a);
  const out = [];
  for (let i = 0; i < count; i++) {
    const o = FIRST + i * REC;
    const iso = d.toString('latin1', o + 4, o + 6);
    out.push({
      iso,
      ecc: d[o + 6],
      rds: d[o + 7],
      ltn: d[o + 8],
      lang: d.toString('latin1', o + 0x1c, o + 0x1e).replace(/[^a-z]/g, ''),
      extra: d.toString('hex', o + 9, o + 0x0c),
    });
  }
  // сопоставляем с реальными файлами таблиц
  const files = new Map();
  for (const e of entries) {
    const m = e.name.match(/_(\d+)_(\d+)[.]tlt$/);
    if (m) files.set(+m[1] + '/' + +m[2], { name: e.name, size: e.size });
  }
  return { out, files, count };
}

// Контейнер TMC по умолчанию: каталог TMC3GP или TMC внутри набора,
// имя файла в каждом наборе своё, поэтому берётся первый .db в каталоге.
function defaultContainer() {
  const dir = dataset.pick(dataset.resolveRoot(), 'pkgdb/TMC3GP', 'pkgdb/TMC');
  if (!dir) throw new Error('каталог TMC в наборе не найден');
  const db = fs.readdirSync(dir).find(f => f.toLowerCase().endsWith('.db'));
  if (!db) throw new Error('в каталоге ' + dir + ' нет файла .db');
  return path.join(dir, db);
}

if (require.main === module) {
  const p = process.argv[2] || defaultContainer();
  const { out, files } = registry(p);
  console.log('ISO  ECC  RDS  LTN  язык  флаги     файл таблицы        размер');
  for (const r of out.sort((a, b) => a.iso.localeCompare(b.iso))) {
    const f = files.get(r.rds + '/' + r.ltn);
    console.log(r.iso, ' 0x' + r.ecc.toString(16).toUpperCase(),
      String(r.rds).padStart(4), String(r.ltn).padStart(4),
      '  ' + (r.lang || '--').padEnd(5), r.extra,
      ' ' + (f ? f.name : '—').padEnd(19),
      f ? String(f.size).padStart(8) : '     нет');
  }
  console.log('\nзаписей:', out.length,
    ' уникальных стран:', new Set(out.map(r => r.iso)).size);
}
