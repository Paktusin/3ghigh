'use strict';
// Сводка покрытия по странам для навигационной БД MMI 3G(P).
//
// Источники:
//   pkgdb/XAC*  — дорожные данные, имена вида EJ211_<CC><NN>_<n>.xac,
//                 где CC — внутренний код страны Becker, NN — номер тайла;
//                 плюс EJ211_<i>.ort — ORTSNAMEN, справочник названий,
//                 по одному файлу на страну (индекс страны в заголовке, BE u16 @0x16).
//   pkgdb/TMC3GP/info.xml — таблицы локаций TMC (cc / ltn / version).

const fs = require('fs');
const path = require('path');
const fldb = require('./fldb');
const dataset = require('./dataset');

const ROOT = dataset.resolveRoot(process.argv[2]);
const XAC = ['XAC/kN221EUx01_0.db', 'XAC2/kN221EUx01_1.db', 'XAC3/kN221EUx01_2.db']
  .map(p => path.join(ROOT, 'pkgdb', p));

// Индекс .ort -> страна. Порядок 0..36 алфавитный по английскому названию
// (исходный набор), 37..44 дописаны позже. Код — внутренний код Becker из имён .xac.
const COUNTRIES = [
  ['AB', 'Албания'], ['AN', 'Андорра'], ['AU', 'Австрия'], ['BA', 'Босния и Герцеговина'],
  ['BE', 'Бельгия'], ['BG', 'Болгария'], ['CH', 'Швейцария'], ['CZ', 'Чехия'],
  ['DE', 'Германия'], ['DM', 'Дания'], ['EE', 'Эстония'], ['FI', 'Финляндия'],
  ['FR', 'Франция'], ['GI', 'Гибралтар'], ['GR', 'Греция'], ['HR', 'Хорватия'],
  ['HU', 'Венгрия'], ['IR', 'Ирландия'], ['IT', 'Италия'], ['LI', 'Лихтенштейн'],
  ['LT', 'Литва'], ['LU', 'Люксембург'], ['LV', 'Латвия'], ['MK', 'Северная Македония'],
  ['MO', 'Монако'], ['NL', 'Нидерланды'], ['NO', 'Норвегия'], ['PL', 'Польша'],
  ['PO', 'Португалия'], ['RO', 'Румыния'], ['SI', 'Словения'], ['SK', 'Словакия'],
  ['SM', 'Сан-Марино'], ['SP', 'Испания'], ['SW', 'Швеция'], ['UK', 'Великобритания'],
  ['VA', 'Ватикан'], ['RS', 'Сербия'], ['MB', 'Молдова'], ['RU', 'Россия'],
  ['UA', 'Украина'], ['BY', 'Беларусь'], ['MJ', 'Мальта'], ['IS', 'Исландия'],
  ['KO', 'Косово'],
];
// Есть в дорожных данных, но без собственного файла ORTSNAMEN.
// Черногория: тайлы M100..M104 (Подгорица, Рисан, Вилуси, Херцег-Нови),
// а её названия лежат в файле Сербии (.ort 37: Улцинь, Тиват) — наследие
// единого государства Сербия и Черногория.
const EXTRA = { M1: 'Черногория (названия — в файле Сербии)' };

const byCode = new Map(COUNTRIES.map(([c, n], i) => [c, { name: n, ort: i }]));
for (const c in EXTRA) byCode.set(c, { name: EXTRA[c], ort: null });

// --- сбор из XAC ---
const stats = new Map();
const orts = [];
for (const p of XAC) {
  const db = fldb.open(p);
  for (const e of fldb.entries(db)) {
    // EJ211_<CC><TT>_<n>.xac : CC — код страны, TT — тайл (цифры или буквы)
    const m = e.name.match(/^EJ211_(..)(..)_[0-9][.]xac$/);
    if (m) {
      const s = stats.get(m[1]) || { files: 0, bytes: 0, tiles: new Set() };
      s.files++; s.bytes += e.size; s.tiles.add(m[2]);
      stats.set(m[1], s);
    }
    if (/^EJ211_\d+\.ort$/.test(e.name)) {
      const d = fldb.read(db, e);
      orts.push({ index: d.readUInt16BE(0x16), size: e.size });
    }
  }
}

// --- TMC ---
const xml = fs.readFileSync(path.join(ROOT, 'pkgdb/TMC3GP/info.xml'), 'latin1');
const tmc = new Set([...xml.matchAll(/<cc>([A-Z]+)<\/cc>/g)].map(m => m[1]));
// ISO-код для сверки с TMC (внутренний код Becker != ISO)
const ISO = { AB:'AL', AN:'AD', AU:'AT', BA:'BA', BE:'BE', BG:'BG', CH:'CH', CZ:'CZ',
  DE:'DE', DM:'DK', EE:'EE', FI:'FI', FR:'FR', GI:'GI', GR:'GR', HR:'HR', HU:'HU',
  IR:'IE', IT:'IT', LI:'LI', LT:'LT', LU:'LU', LV:'LV', MK:'MK', MO:'MC', NL:'NL',
  NO:'NO', PL:'PL', PO:'PT', RO:'RO', SI:'SI', SK:'SK', SM:'SM', SP:'ES', SW:'SE',
  UK:'GB', VA:'VA', RS:'RS', MB:'MD', RU:'RU', UA:'UA', BY:'BY', MJ:'MT', IS:'IS',
  KO:'XK', M1:'ME' };

const rows = [...byCode.entries()].map(([code, v]) => {
  const s = stats.get(code) || { files: 0, bytes: 0, tiles: new Set() };
  return { code, iso: ISO[code], name: v.name, ort: v.ort,
           files: s.files, mb: s.bytes / 1048576, tiles: s.tiles.size,
           tmc: tmc.has(ISO[code]) };
}).sort((a, b) => b.mb - a.mb);

console.log('код  ISO  .ort  тайлов  файлов   дороги(МБ)  TMC  страна');
for (const r of rows) {
  console.log(r.code.padEnd(4), (r.iso || '--').padEnd(4),
    String(r.ort === null ? '-' : r.ort).padStart(4),
    String(r.tiles).padStart(7), String(r.files).padStart(7),
    r.mb.toFixed(1).padStart(12), (r.tmc ? ' да ' : '  - ').padStart(5), ' ' + r.name);
}
console.log('\nстран в дорожных данных :', rows.length);
console.log('файлов ORTSNAMEN (.ort) :', orts.length,
            '(индексы ' + Math.min(...orts.map(o => o.index)) +
            '..' + Math.max(...orts.map(o => o.index)) + ')');
console.log('стран с таблицами TMC   :', tmc.size, '->', [...tmc].sort().join(' '));
console.log('суммарно дорожных данных:', rows.reduce((a, r) => a + r.mb, 0).toFixed(0), 'МБ');
