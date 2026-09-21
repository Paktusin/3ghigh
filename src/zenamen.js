'use strict';
// Раздел ZE-NAMEN дорожного тайла: названия для ввода адреса цели.
//
// Сжатие то же самое, что у ZF-NAMEN (FUN_08279074, «u_dekomprimieren»):
// код 1 — литерал, 2 — конец имени, 3 — серия, >= 6 — токен номер «код-6»,
// а байт 0x02 внутри токена тоже кончает имя. Отличие одно и важное:
//
//   таблица токенов лежит НЕ в общем индексе .xah, а в самой секции —
//   250 записей по 10 байт. С общей таблицей ZF-TOKEN имена не читаются.
//
// Скелет снят с прошивки: `u_zen_ntab_infos` и `u_decode_nameblk`
// (FUN_08279190) берут запись ключа как `база + (номер >> 4) * 0xc + 8`,
// то есть ключ ставится на каждое шестнадцатое имя — ровно как в ZF-NAMEN.
//
// Раскладка шапки (смещения от начала раздела, все числа u32 BE):
//
//   +0x14 u16   версия, всегда 2
//   +0x18       число ключей = ceil(имён / 16)
//   +0x1c/20/24 ключи: смещение, длина, ЧИСЛО ИМЁН (12 байт на запись:
//               8 байт текста ключа и u32 смещения имени в потоке)
//   +0x28/2c/30 слово на имя: смещение, длина (имён x 2), число токенов (250)
//   +0x34/38/3c таблица токенов: смещение, длина (250 x 10), число имён
//   +0x40/44    поток имён: смещение и длина
//   +0x48/4c    два счётчика области ссылок
//   +0x50/54/58 область ссылок «имя -> векторы»: смещение, длина, счётчик
//   +0x5c/60    хвостовая область: смещение и длина
//
// Что проверено: развёртка имени по смещению каждого ключа даёт текст,
// начинающийся этим ключом, — 141 959 ключей из 141 959 на 475 разделах.
// Что НЕ разобрано: раскладка имён между ключами. В потоке встречаются
// байты 0x00, 0x04 и 0x05, а в коде распаковщика коды меньше 6 — ошибка,
// значит между именами лежит что-то ещё; см. docs/formats/xac.md.
//
//   node src/zenamen.js <база.db> [шаг]     — сверка ключей по базе

const xac = require('./xac');
const zf = require('./zfnamen');

const REC = 12;        // запись ключа: 8 байт текста и u32 смещения
const KEY = 8;
const TOK = 10;        // запись таблицы токенов
const STRIDE = 16;     // ключ на каждое шестнадцатое имя

function header(d) {
  if (d.length < 0x64 || d.readUInt16BE(0x14) !== 2) return null;
  const u = (o) => d.readUInt32BE(o);
  return {
    version: d.readUInt16BE(0x14), keys: u(0x18),
    index:  { off: u(0x1c), len: u(0x20), names: u(0x24) },
    perName:{ off: u(0x28), len: u(0x2c), tokens: u(0x30) },
    tokens: { off: u(0x34), len: u(0x38), names: u(0x3c) },
    stream: { off: u(0x40), len: u(0x44), a: u(0x48), b: u(0x4c) },
    refs:   { off: u(0x50), len: u(0x54), count: u(0x58) },
    tail:   { off: u(0x5c), len: u(0x60) },
  };
}

// Таблица токенов из самой секции: 250 записей по 10 байт, текст до NUL.
function tokens(d, h) {
  h = h || header(d);
  const out = [];
  for (let i = 0; i < h.perName.tokens; i++) {
    const o = h.tokens.off + i * TOK;
    let e = o;
    while (e < o + TOK && d[e] !== 0) e++;
    out.push(Buffer.from(d.subarray(o, e)));
  }
  return out;
}

// Ключи: текст и смещение имени в потоке.
function keys(d, h) {
  h = h || header(d);
  const out = [];
  for (let i = 0; i < h.keys; i++) {
    const o = h.index.off + i * REC;
    out.push({ key: d.toString('latin1', o, o + KEY).replace(/\0+$/, ''),
               offset: d.readUInt32BE(o + KEY), name: i * STRIDE });
  }
  return out;
}

// Слово на имя: старший байт — вид имени, младший не разобран.
function perName(d, h, i) {
  h = h || header(d);
  return d.readUInt16BE(h.perName.off + i * 2);
}

// Развернуть имя, лежащее по смещению off в потоке.
function nameAt(d, off, tok, h) {
  h = h || header(d);
  const s = d.subarray(h.stream.off, h.stream.off + h.stream.len);
  return zf.decode(s, off, tok || tokens(d, h));
}

// Сверка раздела: у каждого ключа развернуть имя и сличить с текстом ключа.
function checkKeys(d) {
  const h = header(d);
  if (!h) return null;
  const tok = tokens(d, h), ks = keys(d, h);
  let ok = 0, err = 0, first = null;
  for (const k of ks) {
    const r = nameAt(d, k.offset, tok, h);
    if (r.err) { err++; if (!first) first = k.key + ': ' + r.err; continue; }
    if (r.text.slice(0, k.key.length) === k.key) ok++;
    else if (!first) first = k.key + ' -> ' + r.text.slice(0, 12);
  }
  return { keys: ks.length, ok, err, first, names: h.index.names,
           strideOk: h.keys === Math.ceil(h.index.names / STRIDE) };
}

// ---------------------------------------------------------------------------
// Раздел ZE-NAMEN-MMI: адресная иерархия имён.
//
//   +0x14 u32   версия, всегда 0x00020000
//   +0x18 u32   число имён — то же, что в ZE-NAMEN
//   +0x1c u32   смещение первой области, всегда 60
//   +0x20 u32   её длина, ровно «имён × 3»
//   +0x24 u32   смещение второй области: конец первой, выровненный на 4
//   +0x28 u32   счётчик второй области, всегда 4
//   +0x2c u32   её длина
//   +0x30 u32   смещение третьей области, всегда вторая плюс 4
//   +0x34 u32   её длина, равна длине второй
//   +0x38 u32   смещение четвёртой области, она идёт до конца раздела
//
// Первая область — по ТРИ байта на имя: байт флагов и u16 номер РОДИТЕЛЬСКОГО
// имени в том же разделе ZE-NAMEN; 0xFFFF значит «корень». Получается дерево
// адресного ввода: страна -> область -> район -> город -> улица.
//
// Проверено по всей базе (3512 тайлов с разделом, 17 072 680 записей):
// ссылок вне диапазона имён 0, циклов 0, глубина не больше 6, корень ровно
// один на тайл (исключение — BE0P с двумя). Смысл подтверждён текстами: в
// тайле AB01 улицы «RRUGA ABAZ SHEHU», «RRUGA DOGANES» и деревни «MORAVE»,
// «VELAGOSHT» указывают на «BERAT», а сам «BERAT» — на одноимённый район.
//
// Байт флагов разобран частично: бит 7 стоит только у листьев (у имён с
// потомками — 0,0 % против 81,1 % у бездетных), а биты 2…5 почти исключительно
// у родителей (например, бит 2: 65,5 % против 0,3 %). Что именно кодируют
// биты 0…6, не установлено; значение растёт вместе с числом потомков
// (0x14 — в среднем 2 потомка, 0x24 — 5, 0x74 — 40, 0x7c — 169).
const MMI_REC = 3;

function mmiHeader(d) {
  if (d.length < 0x3c) return null;
  const u = (o) => d.readUInt32BE(o);
  return {
    version: u(0x14), names: u(0x18),
    tree: { off: u(0x1c), len: u(0x20) },
    b: { off: u(0x24), count: u(0x28), len: u(0x2c) },
    c: { off: u(0x30), len: u(0x34) },
    d: { off: u(0x38), len: d.length - u(0x38) },
  };
}

// Дерево: для каждого имени — байт флагов и номер родителя (null у корня).
function mmiTree(d, h) {
  h = h || mmiHeader(d);
  const out = [];
  for (let i = 0; i < h.names; i++) {
    const o = h.tree.off + i * MMI_REC;
    const parent = d.readUInt16BE(o + 1);
    out.push({ flags: d[o], parent: parent === 0xffff ? null : parent, leaf: (d[o] & 0x80) !== 0 });
  }
  return out;
}

// Собрать первую область обратно в байты — для генерации своего тайла.
function mmiBuildTree(rows) {
  const out = Buffer.alloc(rows.length * MMI_REC);
  rows.forEach((r, i) => {
    out[i * MMI_REC] = r.flags & 0xff;
    out.writeUInt16BE(r.parent === null || r.parent === undefined ? 0xffff : r.parent, i * MMI_REC + 1);
  });
  return out;
}

module.exports = { header, tokens, keys, perName, nameAt, checkKeys,
  mmiHeader, mmiTree, mmiBuildTree, REC, KEY, TOK, STRIDE, MMI_REC };

if (require.main === module) {
  const fldb = require('./fldb');
  const db = fldb.open(process.argv[2] || 'maps/pkgdb/XAC/kN221EUx01_0.db');
  const step = Number(process.argv[3] || 1);
  const tiles = fldb.entries(db).filter((e) => /\.xac$/i.test(e.name));
  let secs = 0, allKeys = 0, okKeys = 0, clean = 0, strideOk = 0, bad = [];
  for (let i = 0; i < tiles.length; i += step) {
    const buf = fldb.read(db, tiles[i]);
    const sec = xac.sections(buf).list.find((x) => x.name === 'ZE-NAMEN');
    if (!sec) continue;
    const r = checkKeys(buf.subarray(sec.offset, sec.offset + sec.total));
    if (!r) { bad.push(tiles[i].name + ': не ZE-NAMEN версии 2'); continue; }
    secs++; allKeys += r.keys; okKeys += r.ok;
    if (r.ok === r.keys) clean++; else if (bad.length < 5) bad.push(tiles[i].name + ': ' + r.first);
    if (r.strideOk) strideOk++;
  }
  console.log('разделов %d: ключей %d, имя совпало с ключом %d (%s%%)',
    secs, allKeys, okKeys, (100 * okKeys / allKeys).toFixed(2));
  console.log('разделов, где сошлись все ключи: %d; ключей ровно ceil(имён/16): %d', clean, strideOk);
  for (const x of bad) console.log('  ' + x);
}
