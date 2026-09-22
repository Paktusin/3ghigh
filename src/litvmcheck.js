// Воспроизводимая проверка границ блоков; исходные карты открываются только на чтение.
//
//   node src/litvmcheck.js                    выборка по каталогу LIT и вся PIT
//   node src/litvmcheck.js --all              весь каталог LIT целиком (около 5 минут, 7 ГБ чтения)
//   node src/litvmcheck.js <прежний litvm.js> ещё и сравнение с прежней машиной
//
// «Успех» — это одновременно `why === 'данные кончились'` и `pos === block.length`.
// Выход за границу успехом не считается. Точная граница НЕ доказывает, что поля
// разобраны правильно, — только что число прочитанных байт сошлось.
//
// Контрольные суммы набора здесь не считаются: это отдельная и долгая операция.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lit');
const S = require('./litschema');
const current = require('./litvm');

const args = process.argv.slice(2);
const ALL = args.includes('--all');
const prev = args.find((a) => !a.startsWith('--'));
const baseline = prev ? require(path.resolve(prev)) : null;

// Байт 3 блока — ширина координат (правило 3 схемы). Код 0x40 понимает ровно
// четыре ширины (FUN_08cd0798), на прочих он не читает ни байта.
//
// Для LIT это хороший признак «блок начат с правильного места»: при неверном
// шве томов блоки за ним съезжают и байт 3 перестаёт быть шириной. Было 21.8 %,
// стало 100 %. Но это признак, а не определение заголовка: у PIT то же поле
// валидно лишь у 13 блоков из 717, а разбираются все 717 — там на пути просто
// нет кода 0x40, и ширина ни на что не влияет.
const WIDTHS = new Set([8, 12, 16, 24]);

for (const kind of ['LIT', 'PIT']) {
  const dirs = kind === 'LIT' ? ['LIT', 'LIT2', 'LIT3', 'LIT4'] : ['PIT'];
  const l = L.open(dirs.map((d) => path.join('maps/pkgdb', d)));
  try {
    const schema = S.load(l.vols[0].file, l.header.at), cat = l.catalog();
    // PIT маленькая — всегда целиком; LIT по выборке, если не просили --all.
    const step = kind === 'PIT' || ALL ? 1 : Math.max(1, Math.floor(cat.length / 800));
    const stats = { всегоБлоков: cat.length, шаг: step, проверено: 0,
                    сЗаголовком: 0, доКонца: 0, причины: {} };
    if (l.vols.length > 1) {
      stats.швы = l.vols.map((v) => v.start);
      stats.добивки = l.vols.map((v) => v.pad);
    }
    if (baseline) Object.assign(stats, { былоДоКонца: 0, стало: 0, потеряно: 0 });
    const full = (r, b) => r.why === 'данные кончились' && r.pos === b.length;
    for (let i = 0; i < cat.length; i += step) {
      const b = l.block(cat[i]);
      stats.проверено++;
      if (b.length > 3 && b[2] === 0 && WIDTHS.has(b[3])) stats.сЗаголовком++;
      const r = current.run(schema, b, 0, { blk: i }), ok = full(r, b);
      stats.доКонца += Number(ok);
      if (!ok) stats.причины[r.why] = (stats.причины[r.why] || 0) + 1;
      if (baseline) {
        const before = full(baseline.run(schema, b, 0, { blk: i }), b);
        stats.былоДоКонца += Number(before);
        stats.стало += Number(!before && ok);
        stats.потеряно += Number(before && !ok);
      }
    }
    console.log(kind, JSON.stringify(stats, null, 2));
  } finally {
    l.vols.forEach((v) => fs.closeSync(v.fd));
  }
}
