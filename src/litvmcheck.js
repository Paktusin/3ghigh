// Воспроизводимая проверка границ блоков; исходные карты открываются только на чтение.
// node src/litvmcheck.js [путь-к-прежнему-litvm.js]
// Достижение границы не доказывает правильность значений полей.
//
// Совокупность выбирается по заголовку, а не по словарю. Грамматика с правила 0
// применима только к блокам, которые начинаются заголовком (правила 0..16), а в
// каталоге LIT такие идут одним куском в начале — блоки 0..53403. Дальше лежит
// что-то другое, и запуск грамматики по ним меряет не машину, а выбор входа.
// Прежняя выборка «каждый 613-й по всему каталогу с отбором по litdict.dict»
// на три четверти состояла из таких блоков и занижала результат.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lit');
const S = require('./litschema');
const current = require('./litvm');
const baseline = process.argv[2] ? require(path.resolve(process.argv[2])) : null;

// Заголовок блока: правило 1 — u16, 2 — байт, 3 — байт ширины координат.
// Ширину код 0x40 понимает ровно четыре (FUN_08cd0798), прочие байт не читают.
const WIDTHS = new Set([8, 12, 16, 24]);
function hasHeader(l, e) {
  const h = l.read(e.off, Math.min(16, e.size));
  return h.length >= 4 && h[2] === 0 && WIDTHS.has(h[3]);
}

// Граница зоны заголовков: последний блок, после которого их больше нет.
function headerZone(l, cat) {
  let lo = 0, hi = cat.length - 1;
  while (lo < hi) {                                  // двоичный поиск по плотности
    const m = (lo + hi + 1) >> 1;
    let ok = 0;
    for (let k = 0; k < 21; k++) ok += hasHeader(l, cat[Math.min(cat.length - 1, m + k * 7)]) ? 1 : 0;
    if (ok >= 18) lo = m; else hi = m - 1;
  }
  let end = lo + 1;                                  // уточнение до первого блока без заголовка
  while (end < cat.length && hasHeader(l, cat[end])) end++;
  while (end > 0 && !hasHeader(l, cat[end - 1])) end--;
  return end;
}

for (const kind of ['LIT', 'PIT']) {
  const dirs = kind === 'LIT' ? ['LIT', 'LIT2', 'LIT3', 'LIT4'] : ['PIT'];
  const l = L.open(dirs.map((d) => path.join('maps/pkgdb', d)));
  try {
    const schema = S.load(l.vols[0].file, l.header.at), cat = l.catalog();
    const end = kind === 'LIT' ? headerZone(l, cat) : cat.length;
    // PIT маленькая — читается целиком; у LIT берём равномерную выборку зоны.
    const step = kind === 'LIT' ? Math.max(1, Math.floor(end / 600)) : 1;
    const stats = { всегоБлоков: cat.length, зонаЗаголовков: end, шаг: step,
                    проверено: 0, доКонца: 0, причины: {} };
    if (baseline) Object.assign(stats, { былоДоКонца: 0, стало: 0, потеряно: 0 });
    const full = (r, b) => r.why === 'данные кончились' && r.pos === b.length;
    for (let i = 0; i < end; i += step) {
      const b = l.block(cat[i]);
      const r = current.run(schema, b, 0), ok = full(r, b);
      stats.проверено++;
      stats.доКонца += Number(ok);
      if (!ok) stats.причины[r.why] = (stats.причины[r.why] || 0) + 1;
      if (baseline) {
        const before = full(baseline.run(schema, b, 0), b);
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
