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
//     +0x10 u16    число блоков VEKTORBLOCK на этом уровне
//     +0x12 u16    номер первого блока в сквозной нумерации базы
//     +0x14        смещение области VEKTORBLOCK в файле уровня
//     +0x18        суммарный размер этой области
//     +0x1C        размер раздела XAC HEADER
//     +0x20        размер раздела ZF-NAMEN
//     +0x24        суммарный размер данных тайла на уровне (уровни 2..4)
//     +0x28        назначение не установлено
// Уровень 1 — файл тайла <П>_<код>_1.xac, уровень 2 — <П>_<код>_2.xac.
// Уровни 3 и 4 лежат кусками внутри укрупнённых <П>_<регион>_3.b и _4.b.
// Сверка L1 и L2 с настоящими файлами: 120 из 120 тайлов без расхождений.
// Сплошная сверка L2 с файлами _2 по всем 3777 тайлам: размеры XAC HEADER,
// ZF-NAMEN, смещение и размер области VEKTORBLOCK, число блоков — 3777 из 3777.
//
// Сквозная нумерация блоков: счёт идёт тайл за тайлом, внутри тайла уровни
// 1, 2, 3, 4, накопительно. Проверено на всех 15108 записях четырёх уровней:
// firstBlock равен сумме blockCount всех предыдущих (тайл, уровень) — 15108
// из 15108. Значит новый тайл дешевле дописывать в конец реестра: вставка в
// середину сдвигает номера у всех последующих тайлов.

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
        blockCount: b.readUInt16BE(o + 0x10), firstBlock: b.readUInt16BE(o + 0x12),
        vektorOffset: u(0x14), vektorSize: u(0x18),
        headerSize: u(0x1c), zfNamenSize: u(0x20), totalSize: u(0x24),
      });
    }
    out[n] = { level: b.readUInt32BE(0x14) & 0xffff, rows };
  }
  return out;
}

// Таблица смежности NACHBARN. Шапка u32 = 0x00010000 (версия), дальше по записи
// на тайл в порядке реестра: u16 номер тайла, u16 номера соседей, 0xFFFF. После
// последней записи ещё одно слово 0xFFFF. В европейском наборе 18195 связей,
// в среднем 4,8 на тайл; связь почти всегда взаимная (5 исключений, все в RU).
// 586 пар не касаются рамками — паромы: BE–UK, DM–UK. 36 тайлов без соседей —
// острова (Азоры PO1O, Русский Север).
//
// Именно через соседей устройство добирается до анклавов, которых нет в общем
// растре .ras: VA00 — сосед IT1H, VA01 — сосед IT3S.
function parseNeighbors(xahBuf) {
  const s = xac.sections(xahBuf).list.find(x => x.name === 'NACHBARN');
  if (!s) throw new Error('раздел NACHBARN не найден');
  const b = xahBuf.subarray(s.offset + 20, s.offset + s.total);
  const out = [];
  let p = 4;
  while (p + 2 <= b.length) {
    const id = b.readUInt16BE(p); p += 2;
    if (id === 0xffff) break;
    const list = [];
    for (;;) {
      const v = b.readUInt16BE(p); p += 2;
      if (v === 0xffff) break;
      list.push(v);
    }
    if (id !== out.length) throw new Error('NACHBARN: запись ' + out.length + ' с номером ' + id);
    out.push(list);
  }
  return out;
}

module.exports = { parse, parseLevels, parseNeighbors, openIndex, REC, START };

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
    if (r.empty) {
      console.log('   L' + n + '  данных нет, блоков ' + r.blockCount +
        ', разделы файла: XAC HEADER ' + r.headerSize + ' б, ZF-NAMEN ' + r.zfNamenSize + ' б');
      continue;
    }
    console.log('   L' + n +
      '  рамка ' + (r.bbox[1] / LAT).toFixed(4) + '..' + (r.bbox[3] / LAT).toFixed(4) + ' с.ш., ' +
      (r.bbox[0] / 72000).toFixed(4) + '..' + (r.bbox[2] / 72000).toFixed(4) + ' в.д.' +
      '   блоков ' + r.blockCount + ' с номера ' + r.firstBlock +
      '   VEKTORBLOCK @' + r.vektorOffset + ', ' + r.vektorSize + ' б');
  }

  const order = [...tiles.keys()];
  const nb = parseNeighbors(idx.buf)[li];
  console.log();
  console.log('соседи (NACHBARN):', nb.length ? nb.map(j => order[j]).join(' ') : 'нет');

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
