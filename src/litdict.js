// Словарь блока LIT и развёртка сжатых имён.
//
// Раскладка взята не из догадок, а из грамматики в блоке TTD (см. src/litschema.js,
// записи 0..16) и из декодера FUN_08ccfcc0:
//
//    9  ЧИСЛО байт            прочитать байт b
//   10  0x81 тип '['          если (b & 0xf0) != 0 — номер кода из старшего полубайта
//   11  ЧИСЛО байт тип '['    иначе номер кода — следующий байт
//   12  0x81 арг 9            если (b & 0x0f) != 0 — длина из младшего полубайта
//   13  ЧИСЛО байт арг 9      иначе длина — следующий байт
//   14  СТРОКА тип ']'        столько байт текста
//
// Отсюда и байты 0x12 / 0x13 / 0x22 / 0x02, которые не раскладывались никаким
// постоянным правилом: 0x12 — код +1, текст 2 байта; 0x02 — код задаётся
// отдельным байтом, поэтому запись длиннее на байт.
'use strict';

// Словарь блока. Возвращает {codes, end} либо null, если разбор не сошёлся.
// codes — Map: байт-код -> Buffer с раскрытием.
function dict(block) {
  const n = block[12];                      // число записей объявлено в заголовке
  let p = 13, code = 0;
  const codes = new Map();
  for (let i = 0; i < n; i++) {
    if (p >= block.length) return null;
    const t = block[p++];
    let hi = t >> 4, lo = t & 0x0f;
    if (hi === 0) {                          // номер кода задан целиком
      if (p >= block.length) return null;
      code = block[p++];
    } else {
      code += hi;                            // иначе полубайт — прибавка
    }
    if (lo === 0) {
      if (p >= block.length) return null;
      lo = block[p++];
    }
    if (code > 255 || p + lo > block.length) return null;
    codes.set(code, block.subarray(p, p + lo));
    p += lo;
  }
  return { codes, end: p };
}

// Раскрытие перечитывается заново — код может раскрываться в другие коды
// (так устроен и сам декодер в прошивке), поэтому проход повторяется.
function expand(codes, buf, limit, cap) {
  const max = limit || 16;
  // Словарь бывает с циклом (код раскрывается сам в себя через другой код),
  // поэтому рост ограничен: иначе развёртка уходит в бесконечность.
  const top = cap || Math.max(4096, buf.length * 64);
  let cur = buf;
  for (let k = 0; k < max; k++) {
    const out = [];
    let hit = false;
    for (const b of cur) {
      const e = codes.get(b);
      if (e) { hit = true; for (const x of e) out.push(x); }
      else out.push(b);
      if (out.length > top) return Buffer.from(out.slice(0, top));
    }
    cur = Buffer.from(out);
    if (!hit) break;
  }
  return cur;
}

module.exports = { dict, expand };

if (require.main === module) {
  const lit = require('./lit');
  const L = lit.open(['maps/pkgdb/LIT', 'maps/pkgdb/LIT2', 'maps/pkgdb/LIT3', 'maps/pkgdb/LIT4']);
  const i = Number(process.argv[2] || 30685);
  const b = L.block(L.catalog()[i]);
  const d = dict(b);
  if (!d) { console.log('блок %d: словарь не разобрался', i); process.exit(1); }
  console.log('блок %d: %d кодов, данные с %d', i, d.codes.size, d.end);
  const text = expand(d.codes, b.subarray(d.end, d.end + 2000)).toString('utf8');
  console.log(text.replace(/[\x00-\x1f]+/g, ' ').slice(0, 1200));
}
