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

// --- построение словаря -----------------------------------------------------
//
// Обратная задача к dict(): по набору имён собрать словарь. Устройство подсказали
// сами данные — почти все записи длиной 2 (`0x12` = «код +1, текст 2 байта»),
// то есть это кодирование пар байт (BPE): новый код заменяет самую частую
// соседнюю пару, и пара может состоять из уже введённых кодов. Отсюда и
// рекурсивность раскрытия.
//
// Коды берутся из байт, которых НЕТ в самих именах: в живых блоках множества
// кодов и литералов не пересекаются, и это условие однозначности — иначе
// literal-байт не отличить от кода.

// Свободные коды: 1..255 минус всё, что встречается в текстах. Ноль не берём,
// его в живых словарях нет.
function freeCodes(texts) {
  const used = new Set();
  for (const t of texts) for (const b of t) used.add(b);
  const out = [];
  for (let c = 1; c <= 255; c++) if (!used.has(c)) out.push(c);
  return out;
}

// Построение. Возвращает Map код -> Buffer с телом записи (байты тела могут
// сами быть кодами). limit ограничивает число кодов сверху.
function build(texts, limit) {
  const free = freeCodes(texts);
  const max = Math.min(limit === undefined ? free.length : limit, free.length);
  const seqs = texts.map((t) => Array.from(t));
  const codes = new Map();
  for (let n = 0; n < max; n++) {
    const cnt = new Map();
    for (const s of seqs)
      for (let i = 0; i + 1 < s.length; i++) {
        const k = s[i] * 256 + s[i + 1];
        cnt.set(k, (cnt.get(k) || 0) + 1);
      }
    let best = -1, bestN = 1;               // пара должна встречаться хотя бы дважды
    for (const [k, v] of cnt) if (v > bestN) { bestN = v; best = k; }
    if (best < 0) break;
    const a = best >> 8, b = best & 0xff, code = free[n];
    codes.set(code, Buffer.from([a, b]));
    for (const s of seqs) {                 // заменить вхождения, без нахлёстов
      let w = 0;
      for (let i = 0; i < s.length; i++) {
        if (i + 1 < s.length && s[i] === a && s[i + 1] === b) { s[w++] = code; i++; }
        else s[w++] = s[i];
      }
      s.length = w;
    }
  }
  return codes;
}

// Запись словаря байтами — ровно в том виде, который читает dict().
// Коды идут по возрастанию: тогда номер задаётся полубайтом-прибавкой, а
// абсолютная форма нужна лишь когда прибавка не влезает в 15.
function serialize(codes) {
  const out = [];
  let prev = 0;
  for (const code of [...codes.keys()].sort((a, b) => a - b)) {
    const body = codes.get(code), d = code - prev;
    const hi = d >= 1 && d <= 15 ? d : 0;
    const lo = body.length >= 1 && body.length <= 15 ? body.length : 0;
    out.push((hi << 4) | lo);
    if (hi === 0) out.push(code);
    if (lo === 0) out.push(body.length);
    for (const b of body) out.push(b);
    prev = code;
  }
  return Buffer.from(out);
}

module.exports = { dict, expand, freeCodes, build, serialize };

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
