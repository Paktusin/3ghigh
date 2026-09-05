'use strict';
// Реестр тайлов XAC-STRUKTUR из общего индекса .xah.
// Использование:
//   node src/struktur.js                 сводка по реестру
//   node src/struktur.js CY00            запись одного тайла
//   node src/struktur.js AB00 --verify   сверить запись с настоящим тайлом
//
// Записи по 84 байта, начинаются со смещения 24 в разделе. В европейском
// наборе их 3777 — ровно столько тайлов в контейнерах XAC.
//
//   +0x00 char[4] код тайла: две буквы страны и две цифры номера
//   +0x04 u32     накопленный размер групп VEKTORBLOCK, граница уровня 1
//   +0x08 u32     то же, граница уровня 2
//   +0x0C u32     то же, граница уровня 3
//   +0x10 u32     то же, граница уровня 4
//   +0x14 u32     смещение раздела ZE-NAMEN в файле тайла
//   +0x18 u32     его размер
//   +0x1C u32     смещение ZE-NAMEN-MMI
//   +0x20 u32     его размер
//   +0x24 u32     смещение HAUSNUMMERN, ноль если раздела нет
//   +0x28 u32     его размер
//   +0x2C u32     смещение LOCAL POIS
//   +0x30 u32     его размер
//   +0x3C u32     смещение RASTERINFOS
//   +0x40 u32     его размер
//   +0x44 u32     ещё одна граница групп VEKTORBLOCK
//   +0x48 u32     ещё одна граница групп VEKTORBLOCK
//
// Соответствие полей разделам проверено на 151 тайле: совпадение полное.
// Назначение полей +0x34, +0x38, +0x4C, +0x50 не установлено, везде нули.

const fs = require('fs');
const path = require('path');
const xac = require('./xac');
const fldb = require('./fldb');
const dataset = require('./dataset');

const REC = 84;
const START = 24;

const SECTIONS = [
  ['ZE-NAMEN', 0x14], ['ZE-NAMEN-MMI', 0x1c],
  ['HAUSNUMMERN', 0x24], ['LOCAL POIS', 0x2c], ['RASTERINFOS', 0x3c],
];

// Контейнер XAC и файл .xah внутри него
function openIndex(root) {
  const pkgdb = path.join(root || dataset.resolveRoot(), 'pkgdb');
  for (const d of fs.readdirSync(pkgdb)) {
    if (!/^XAC/.test(d)) continue;
    for (const f of fs.readdirSync(path.join(pkgdb, d))) {
      if (!f.toLowerCase().endsWith('.db')) continue;
      const db = fldb.open(path.join(pkgdb, d, f));
      const e = fldb.entries(db).find(x => /[.]xah$/.test(x.name));
      if (e) return { buf: fldb.read(db, e), name: e.name, db };
    }
  }
  throw new Error('файл .xah в контейнерах XAC не найден');
}

function parse(xahBuf) {
  const s = xac.sections(xahBuf).list.find(x => x.name === 'XAC-STRUKTUR');
  if (!s) throw new Error('раздел XAC-STRUKTUR не найден');
  const b = xahBuf.subarray(s.offset, s.offset + s.total);
  const tiles = new Map();
  for (let o = START; o + REC <= s.total; o += REC) {
    const code = b.toString('latin1', o, o + 4);
    if (!/^[A-Z0-9]{4}$/.test(code)) continue;
    const at = i => b.readUInt32BE(o + i);
    const rec = { code, at: o, levels: [at(4), at(8), at(12), at(16)], sections: {} };
    for (const [nm, off] of SECTIONS) rec.sections[nm] = { offset: at(off), size: at(off + 4) };
    tiles.set(code, rec);
  }
  return tiles;
}

// Поуровневые таблицы XAC-STRUKTUR L1..L4. Записей столько же, сколько тайлов,
// и порядок тот же, что в главном реестре.
//   заголовок раздела: +0x10 u32 длина, +0x14 u32 номер уровня (0x00010001..4)
//   записи с 24, по 44 байта:
//     +0x00..0x0C  рамка: xmin, ymin, xmax, ymax; 0x7FFFFFFF если данных нет
//     +0x10        назначение не установлено
//     +0x14        смещение области VEKTORBLOCK в файле уровня
//     +0x18        суммарный размер этой области
//     +0x1C        размер раздела XAC HEADER
//     +0x20        размер раздела ZF-NAMEN
//     +0x24        суммарный размер данных тайла на уровне (уровни 2..4)
//     +0x28        назначение не установлено
// Уровень 1 — файл тайла <П>_<код>_1.xac, уровень 2 — <П>_<код>_2.xac.
// Уровни 3 и 4 лежат кусками внутри укрупнённых <П>_<регион>_3.b и _4.b.
// Сверка L1 и L2 с настоящими файлами: 120 из 120 тайлов без расхождений.

const LEVEL_REC = 44;
const LEVEL_START = 24;
const NO_DATA = 0x7fffffff;

function parseLevels(xahBuf) {
  const all = xac.sections(xahBuf).list;
  const out = {};
  for (const n of [1, 2, 3, 4]) {
    const s = all.find(x => x.name === 'XAC-STRUKTUR L' + n);
    if (!s) continue;
    const b = xahBuf.subarray(s.offset, s.offset + s.total);
    const rows = [];
    for (let o = LEVEL_START; o + LEVEL_REC <= s.total; o += LEVEL_REC) {
      const u = i => b.readUInt32BE(o + i);
      rows.push({
        bbox: [u(0), u(4), u(8), u(12)],
        empty: u(0) === NO_DATA,
        vektorOffset: u(0x14), vektorSize: u(0x18),
        headerSize: u(0x1c), zfNamenSize: u(0x20), totalSize: u(0x24),
      });
    }
    out[n] = { level: b.readUInt32BE(0x14) & 0xffff, rows };
  }
  return out;
}

module.exports = { parse, parseLevels, openIndex, REC, START };

if (require.main === module) {
  const arg = process.argv[2];
  const idx = openIndex();
  const tiles = parse(idx.buf);

  if (!arg) {
    const byCountry = new Map();
    for (const c of tiles.keys()) {
      const cc = c.slice(0, 2);
      byCountry.set(cc, (byCountry.get(cc) || 0) + 1);
    }
    console.log('индекс   :', idx.name);
    console.log('тайлов   :', tiles.size);
    console.log('стран    :', byCountry.size);
    const rows = [...byCountry].sort((a, b) => b[1] - a[1]);
    console.log('по странам:', rows.map(([c, n]) => c + ':' + n).join(' '));
    console.log();
    console.log('Кипр в реестре тайлов:', [...tiles.keys()].some(c => c.startsWith('CY'))
      ? 'есть' : 'нет — тайлы CY** отсутствуют');
    return;
  }

  const rec = tiles.get(arg.toUpperCase());
  if (!rec) { console.error('тайл ' + arg + ' в реестре не найден'); process.exit(1); }
  console.log('тайл          :', rec.code, ' запись по смещению', rec.at, 'в разделе');
  console.log('границы групп :', rec.levels.join('  '));
  console.log('разделы, как записано в реестре:');
  for (const [nm] of SECTIONS) {
    const v = rec.sections[nm];
    console.log('   ' + nm.padEnd(14),
      v.offset ? 'смещение ' + String(v.offset).padStart(8) + '  размер ' + String(v.size).padStart(8)
               : 'отсутствует');
  }

  const levels = parseLevels(idx.buf);
  const li = [...tiles.keys()].indexOf(rec.code);
  const LAT = 40000000 / 360;
  console.log();
  console.log('по уровням:');
  for (const n of [1, 2, 3, 4]) {
    const r = levels[n] && levels[n].rows[li];
    if (!r) continue;
    if (r.empty) { console.log('   L' + n + '  данных нет'); continue; }
    console.log('   L' + n +
      '  рамка ' + (r.bbox[1] / LAT).toFixed(4) + '..' + (r.bbox[3] / LAT).toFixed(4) + ' с.ш., ' +
      (r.bbox[0] / 72000).toFixed(4) + '..' + (r.bbox[2] / 72000).toFixed(4) + ' в.д.' +
      '   VEKTORBLOCK @' + r.vektorOffset + ', ' + r.vektorSize + ' б');
  }

  if (process.argv[3] === '--verify') {
    const ents = fldb.entries(idx.db);
    const file = ents.find(e => e.name.indexOf('_' + rec.code + '_1.xac') > 0);
    if (!file) { console.log('\nсам тайл в этом контейнере не лежит, сверить не с чем'); return; }
    const real = {};
    for (const s of xac.sections(fldb.read(idx.db, file)).list)
      if (!(s.name in real)) real[s.name] = s;
    console.log();
    console.log('сверка с ' + file.name + ':');
    let ok = 0, bad = 0;
    for (const [nm] of SECTIONS) {
      const v = rec.sections[nm], r = real[nm];
      if (!v.offset && !r) { console.log('   ' + nm.padEnd(14), 'нет ни там ни там — сходится'); ok++; continue; }
      if (!v.offset || !r) { console.log('   ' + nm.padEnd(14), 'РАСХОЖДЕНИЕ: есть только с одной стороны'); bad++; continue; }
      const same = v.offset === r.offset && v.size === r.total;
      console.log('   ' + nm.padEnd(14), same ? 'сходится' :
        'РАСХОЖДЕНИЕ: реестр ' + v.offset + '/' + v.size + ', файл ' + r.offset + '/' + r.total);
      same ? ok++ : bad++;
    }
    console.log('итого: сошлось ' + ok + ', расхождений ' + bad);
  }
}
