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
//   +0x48/4c    область ссылок: число меток имени и число ссылок на векторы
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

// Версия 2 — раздел ZE-NAMEN внутри тайла, версия 3 — файл ORTSNAMEN (.ort):
// раскладка у них одна и та же, у .ort в поле +0x16 лежит номер страны.
function header(d) {
  if (d.length < 0x64) return null;
  const v = d.readUInt16BE(0x14);
  if (v !== 2 && v !== 3) return null;
  const u = (o) => d.readUInt32BE(o);
  return {
    version: v, country: d.readUInt16BE(0x16), keys: u(0x18),
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


// ---------------------------------------------------------------------------
// Раскладка имён МЕЖДУ ключами: разгадана по FUN_08279190 и FUN_08279074.
//
// Ключевое место, которое раньше не давалось: **байт флагов имени — это
// МЛАДШИЙ байт слова на имя** из области `+0x28`, а старший байт держит два
// номера «частей» (нибблами). В кадре читателя этот байт адресуется парой
// указателей `A` и `A+1`, обе идут по области с шагом 2 на имя, и начинаются
// с `база + (первое имя блока) * 2` — отсюда и «указатель, который готовит не
// тело функции».
//
// Байт флагов:
//   биты 0…4  длина приставки, наследуемой от ПРЕДЫДУЩЕГО имени
//   бит 6     после тела имени лежит поле: 2 байта, а при числе имён
//             больше 65 536 — 3 (порог `DAT_082797fc` = 0x10000)
//   бит 7     после него список пар, кончающийся байтом без старшего бита.
//             Шаг пары прошивка выбирает полем структуры (`param_2[2] & 0xf0000000`):
//             0x80000000 — «варинт» (1…3 байта по правилу 7E/7F), 0 — по два
//             байта, 0x10000000 — по три. В наборе встречаются два первых, и
//             различает их вид раздела: у тайловых `ZE-NAMEN` (версия 2) —
//             варинт, у файлов `ORTSNAMEN` (версия 3) — ровно два байта.
//             Это и было последним, обо что спотыкался разбор тайлов.
//
// И вторая тонкость, без которой поток не сходится: копируя приставку,
// распаковщик останавливается, если наткнулся на НОЛЬ предыдущего имени, —
// и тогда тело из потока НЕ читается вовсе. Поэтому приставка длиннее
// предыдущего имени означает «имя совпадает с предыдущим», и такие имена
// занимают в потоке ноль байт.
//
// Проверка: 45 файлов `.ort` набора, 611 206 имён. У 41 файла поток съедается
// РОВНО до последнего байта; оставшиеся четыре упираются в ветку «имя из
// частей» (условие `(слово & 0xC0000000) == 0xC0000000`, отдельный читатель
// `FUN_082855e8`), она не разобрана.

// Распаковка одного имени: приставка от предыдущего плюс тело из потока.
function unpackName(stream, p, tok, prev, prefix) {
  const out = [];
  for (let i = 0; i < prefix; i++) {
    const b = i < prev.length ? prev[i] : 0;
    if (b === 0) return { name: Buffer.from(out), end: p, inherited: true };
    out.push(b);
  }
  while (p < stream.length) {
    const c = stream[p++];
    if (c === 1) {
      const b = stream[p++];
      if (b === 2) return { name: Buffer.from(out), end: p };
      out.push(b);
    } else if (c === 2) {
      return { name: Buffer.from(out), end: p };
    } else if (c === 3) {
      let n = stream[p++];
      if (n === 0) continue;                       // «серия из нуля» — пустой шаг
      while (n-- > 0) {
        const b = stream[p++];
        if (b === 2) return { name: Buffer.from(out), end: p };
        out.push(b);
      }
    } else if (c < 6) {
      return { name: Buffer.from(out), end: p, err: 'код ' + c + ' на ' + (p - 1) };
    } else {
      const t = tok[c - 6];
      if (!t || !t.length) return { name: Buffer.from(out), end: p, err: 'пустой токен ' + (c - 6) };
      for (const b of t) {
        if (b === 2) return { name: Buffer.from(out), end: p };
        out.push(b);
      }
    }
  }
  return { name: Buffer.from(out), end: p, err: 'поток кончился' };
}

// Все имена раздела подряд. Возвращает { names, end, err }.
// `opt.pairs` — шаг списка пар: 'varint', 2 или 3; по умолчанию выбирается
// по версии раздела, как в наборе.
function allNames(d, h, opt) {
  h = h || header(d);
  if (!h) return null;
  const pairs = (opt && opt.pairs) || (h.version === 3 ? 2 : 'varint');
  const tok = tokens(d, h);
  const stream = d.subarray(h.stream.off, h.stream.off + h.stream.len);
  const wide = h.index.names > 0x10000;
  const names = [];
  let p = 0, prev = Buffer.alloc(0);
  for (let i = 0; i < h.index.names; i++) {
    const flags = d[h.perName.off + i * 2 + 1];     // МЛАДШИЙ байт слова на имя
    const prefix = (i % STRIDE === 0) ? 0 : (flags & 0x1f);
    const r = unpackName(stream, p, tok, prev, prefix);
    if (r.err) return { names, end: p, err: 'имя ' + i + ': ' + r.err };
    let q = r.end;
    if (flags & 0x40) q += wide ? 3 : 2;
    if (flags & 0x80) {
      let b;
      do {
        b = stream[q];
        if (b === undefined) break;
        if (pairs === 'varint') { const v = b & 0x7f; q += v < 0x7e ? 1 : (v === 0x7e ? 2 : 3); }
        else q += pairs;
      } while (b & 0x80);
    }
    names.push(r.name.toString('latin1'));
    prev = Buffer.concat([r.name, Buffer.from([0])]);
    p = q;
  }
  return { names, end: p, len: stream.length, err: null };
}

// Раздел ZE-NAMEN-MMI целиком из дерева. Раскладка снята с самых коротких
// заводских разделов, где вторая и третья области пустые (`BG0J`, `DM0Y`,
// `FRA7`, `GI00`): шапка 60 байт, дерево по три байта на имя, выравнивание на
// 4 и ещё четыре байта `46 42 42 78` — постоянные: они одни и те же во всех
// 45 таких разделах базы. Поле +0x28 у завода равно 4 во всех 1405
// просмотренных разделах — это не счётчик, а постоянное число.
const MMI_END = 0x46424278;     // замыкающее слово четвёртой области

function mmiBuildSection(rows) {
  const tree = mmiBuildTree(rows);
  const bOff = Math.ceil((60 + tree.length) / 4) * 4;
  const out = Buffer.alloc(bOff + 4);
  out.write('ZE-NAMEN-MMI'.padEnd(16, ' '), 0, 16, 'latin1');
  out.writeUInt32BE(out.length - 20, 0x10);
  out.writeUInt32BE(0x00020000, 0x14);
  out.writeUInt32BE(rows.length, 0x18);
  out.writeUInt32BE(60, 0x1c);
  out.writeUInt32BE(tree.length, 0x20);
  out.writeUInt32BE(bOff, 0x24);
  out.writeUInt32BE(4, 0x28);
  tree.copy(out, 60);
  out.writeUInt32BE(MMI_END, bOff);
  return out;
}

// ---------------------------------------------------------------------------
// Область ссылок «имя -> дорога» (+0x50).
//
// Разбор снят с get_firstvect_instreet (FUN_08271914) и его инициализатора
// (0x08271c18). Область — цепочка групп, по одной на блок VEKTORBLOCK тайла:
//
//   u16 ключ   номер блока минус первый блок тайла; 0xFFFF кончает область
//   u16        всегда 0
//   u32 длина  длина тела
//   тело       поток u16: слово со старшим битом меняет имя (nid), слово без
//              него — ссылка на вектор, номер записи = (знач & 0x7FFE) >> 1
//
// Следующая шапка выравнена на 4 байта от начала области; концевик — полная
// восьмибайтовая шапка с ключом 0xFFFF. Метка имени занимает три байта, если
// имён в разделе больше 0x8000 (DAT_08271bb4).

function refGroups(d, h) {
  h = h || header(d);
  if (!h || !h.refs.len) return null;
  const a = h.refs.off, end = a + h.refs.len, wide = h.index.names > 0x8000;
  const groups = [];
  let p = a;
  for (;;) {
    if ((p - a) % 4) p += 4 - ((p - a) % 4);
    if (p + 8 > end) return { groups, end: p - a, err: 'шапка за концом области' };
    const key = d.readUInt16BE(p);
    if (key === 0xffff) { p += 8; break; }
    const len = d.readUInt32BE(p + 4), body = p + 8;
    if (body + len > end) return { groups, end: p - a, err: 'тело группы за концом' };
    const names = [];
    let q = body, cur = null;
    while (q < body + len) {
      const b = d[q];
      if (b & 0x80) {
        const nid = wide ? ((((b & 0x7f) << 8) | d[q + 1]) << 8) | d[q + 2]
                         : ((b & 0x7f) << 8) | d[q + 1];
        cur = { nid, recs: [] };
        names.push(cur);
        q += wide ? 3 : 2;
      } else {
        if (!cur) return { groups, end: p - a, err: 'ссылка до метки имени' };
        cur.recs.push((d.readUInt16BE(q) & 0x7ffe) >> 1);
        q += 2;
      }
    }
    if (q !== body + len) return { groups, end: p - a, err: 'тело группы перебежало' };
    groups.push({ block: key, names });
    p = body + len;
  }
  return { groups, end: p - a, len: h.refs.len, err: null };
}

// Список блоков у имени: тот самый список пар, который включает бит 7 байта
// флагов. Элемент 1..3 байта, старший бит байта 0 — «есть следующий»,
// значение = low7, либо 126 + байт1 при low7 == 0x7e, либо 15 бит при 0x7f.
function readPairs(stream, q) {
  const out = [];
  for (;;) {
    const b = stream[q];
    if (b === undefined) return { pairs: out, end: q, err: 'поток кончился' };
    const v = b & 0x7f;
    if (v < 0x7e) { out.push(v); q += 1; }
    else if (v === 0x7e) { out.push(126 + stream[q + 1]); q += 2; }
    else { out.push(((stream[q + 1] & 0x7f) << 8) | stream[q + 2]); q += 3; }
    if (!(b & 0x80)) return { pairs: out, end: q, err: null };
  }
}

// ---------------------------------------------------------------------------
// Писатель: список имён -> раздел (версия 2) или файл .ort (версия 3).
//
// Пишем самой простой формой, какую читает прошивка: тело имени — серия
// литералов и явный конец, приставка берётся от предыдущего имени. Токены не
// сочиняем: в таблицу кладём только нулевой («\x02» — он же конец имени),
// остальные пустые. Так файл длиннее заводского, но читается тем же кодом.
//
// Ограничения раскладки, которые приходится соблюдать:
//   * ключ стоит на каждом шестнадцатом имени, и у такого имени приставки нет;
//   * приставка не длиннее 31 символа и не длиннее предыдущего имени —
//     иначе распаковщик решит, что имя совпадает с предыдущим;
//   * байт 0x02 внутри имени невозможен: он кончает имя.
//
// `spec.refs` — связь «имя -> дорога»: на каждое имя либо null, либо список
// { block, recs } с номером блока ОТ ПЕРВОГО БЛОКА ТАЙЛА и номерами записей
// в нём. Из него выходят сразу две вещи: список блоков после тела имени
// (бит 7 флагов) и область ссылок +0x50. `spec.blocks` задаёт, сколько групп
// писать: у завода их ровно столько, сколько блоков VEKTORBLOCK в тайле,
// и ключи идут плотным рядом 0…N−1, даже когда блок без имён.
const HEAD = 0x64;              // конец шапки, дальше идут области
const MAXREC = 0x4000;          // номер записи не влезает в маску 0x7FFE
const WIDE = 0x8000;            // столько имён — и метка имени в три байта

// Элемент списка блоков: 1..3 байта, старший бит байта 0 — «есть следующий».
function pairBytes(v, more) {
  const c = more ? 0x80 : 0;
  if (v < 0x7e) return [c | v];
  if (v <= 0x7e + 0xff) return [c | 0x7e, v - 0x7e];
  if (v > 0x7fff) throw new Error('номер блока не влезает в список: ' + v);
  return [c | 0x7f, (v >> 8) & 0x7f, v & 0xff];
}

// Область ссылок: группа на каждый блок, внутри метки имён по возрастанию.
function buildRefs(refs, blockCount, wide) {
  const byBlock = new Map();
  let marks = 0, links = 0;
  refs.forEach((list, nid) => {
    if (!list) return;
    for (const g of list) {
      if (!byBlock.has(g.block)) byBlock.set(g.block, []);
      byBlock.get(g.block).push({ nid, recs: g.recs });
    }
  });
  const parts = [];
  let len = 0;
  for (let key = 0; key < blockCount; key++) {
    const names = (byBlock.get(key) || []).sort((a, b) => a.nid - b.nid);
    const body = [];
    for (const n of names) {
      if (wide) body.push(0x80 | ((n.nid >> 16) & 0x7f), (n.nid >> 8) & 0xff, n.nid & 0xff);
      else body.push(0x80 | (n.nid >> 8), n.nid & 0xff);
      marks++;
      for (const r of n.recs) {
        if (r < 0 || r >= MAXREC) throw new Error('номер записи вне маски 0x7FFE: ' + r);
        body.push((r >> 7) & 0x7f, (r << 1) & 0xff);
        links++;
      }
    }
    if (len % 4) { const pad = 4 - (len % 4); parts.push(Buffer.alloc(pad)); len += pad; }
    const head = Buffer.alloc(8);
    head.writeUInt16BE(key, 0);
    head.writeUInt32BE(body.length, 4);
    parts.push(head, Buffer.from(body));
    len += 8 + body.length;
  }
  if (len % 4) { const pad = 4 - (len % 4); parts.push(Buffer.alloc(pad)); len += pad; }
  const tail = Buffer.alloc(8); tail.writeUInt16BE(0xffff, 0);
  parts.push(tail);
  return { area: Buffer.concat(parts), marks, links };
}

function buildSection(spec) {
  const names = spec.names.map((n) => Buffer.from(String(n), 'latin1'));
  for (const n of names) if (n.includes(2)) throw new Error('имя содержит байт 0x02');
  if (!names.length) throw new Error('пустой список имён');
  const keyCount = Math.ceil(names.length / STRIDE);
  const wide = names.length > WIDE;

  // связь «имя -> дорога»: списки блоков приводим к порядку по возрастанию
  const refs = spec.refs ? spec.refs.slice(0, names.length) : null;
  let blockCount = spec.blocks || 0;
  if (refs) {
    while (refs.length < names.length) refs.push(null);
    refs.forEach((list, i) => {
      if (!list || !list.length) { refs[i] = null; return; }
      refs[i] = list.slice().sort((a, b) => a.block - b.block);
      const last = refs[i][refs[i].length - 1].block;
      if (last + 1 > blockCount) blockCount = last + 1;
    });
  }

  // поток и слова на имя
  const bodies = [], words = Buffer.alloc(names.length * 2);
  const keyOff = new Array(keyCount).fill(0);
  let at = 0, prev = Buffer.alloc(0);
  names.forEach((n, i) => {
    let prefix = 0;
    if (i % STRIDE === 0) keyOff[i / STRIDE] = at;
    else {
      const max = Math.min(31, prev.length, n.length);
      while (prefix < max && n[prefix] === prev[prefix]) prefix++;
    }
    const rest = n.subarray(prefix);
    const body = Buffer.alloc(rest.length + 3);
    body[0] = 3; body[1] = rest.length;             // серия литералов
    rest.copy(body, 2);
    body[body.length - 1] = 2;                      // конец имени
    bodies.push(body);
    at += body.length;
    // список блоков имени — сразу за телом, бит 7 флагов его включает
    const list = refs && refs[i];
    if (list) {
      const bytes = [];
      list.forEach((g, k) => bytes.push(...pairBytes(g.block, k < list.length - 1)));
      const pl = Buffer.from(bytes);
      bodies.push(pl);
      at += pl.length;
    }
    words.writeUInt16BE((prefix & 0x1f) | (list ? 0x80 : 0), i * 2); // старший байт — ноль
    prev = n;
  });
  const stream = Buffer.concat(bodies);

  // таблица токенов: 250 записей по 10 байт, нулевой — «\x02»
  const tokTab = Buffer.alloc(TOK * 250);
  tokTab[0] = 2;

  // область ссылок и таблица «частей» в хвосте раздела
  const r = refs ? buildRefs(refs, blockCount, wide) : null;
  // Таблица частей: старший байт слова на имя даёт нибблами два номера в ней,
  // мы пишем ноль, поэтому хватает одной записи. Счётчик лежит в +0x58, форма
  // «записи по два байта плюс нулевое слово» — самая частая у завода.
  // Догадка: смысл самих пар не разобран, поэтому пишем нули.
  const parts = spec.parts || (refs ? Buffer.alloc(4) : null);
  const partCount = spec.partCount === undefined
    ? (parts ? Math.max(1, (parts.length >> 1) - 1) : 0)
    : spec.partCount;

  const idxOff = HEAD;
  const perOff = idxOff + keyCount * REC;
  const tokOff = perOff + words.length;
  const strOff = tokOff + tokTab.length;
  const refOff = strOff + stream.length;
  const tailOff = refOff + (r ? r.area.length : 0);
  const total = tailOff + (parts ? parts.length : 0);

  const out = Buffer.alloc(total);
  out.write((spec.label || 'ORTSNAMEN').padEnd(16, ' '), 0, 16, 'latin1');
  out.writeUInt32BE(total - 20, 0x10);
  out.writeUInt16BE(spec.version === undefined ? 3 : spec.version, 0x14);
  out.writeUInt16BE(spec.country || 0, 0x16);
  out.writeUInt32BE(keyCount, 0x18);
  out.writeUInt32BE(idxOff, 0x1c); out.writeUInt32BE(keyCount * REC, 0x20);
  out.writeUInt32BE(names.length, 0x24);
  out.writeUInt32BE(perOff, 0x28); out.writeUInt32BE(words.length, 0x2c);
  out.writeUInt32BE(250, 0x30);
  out.writeUInt32BE(tokOff, 0x34); out.writeUInt32BE(tokTab.length, 0x38);
  out.writeUInt32BE(names.length, 0x3c);
  out.writeUInt32BE(strOff, 0x40); out.writeUInt32BE(stream.length, 0x44);
  if (r) {
    out.writeUInt32BE(r.marks, 0x48); out.writeUInt32BE(r.links, 0x4c);
    out.writeUInt32BE(refOff, 0x50); out.writeUInt32BE(r.area.length, 0x54);
  }
  out.writeUInt32BE(partCount, 0x58);
  if (parts) { out.writeUInt32BE(tailOff, 0x5c); out.writeUInt32BE(parts.length, 0x60); }
  // ключи: восемь байт текста и смещение имени в потоке
  for (let k = 0; k < keyCount; k++) {
    const n = names[k * STRIDE];
    n.copy(out, idxOff + k * REC, 0, Math.min(KEY, n.length));
    out.writeUInt32BE(keyOff[k], idxOff + k * REC + KEY);
  }
  words.copy(out, perOff);
  tokTab.copy(out, tokOff);
  stream.copy(out, strOff);
  if (r) r.area.copy(out, refOff);
  if (parts) parts.copy(out, tailOff);
  return out;
}

module.exports = { header, tokens, keys, perName, nameAt, checkKeys,
  unpackName, allNames, buildSection, refGroups, readPairs, pairBytes,
  mmiHeader, mmiTree, mmiBuildTree, mmiBuildSection, REC, KEY, TOK, STRIDE, MMI_REC };

if (require.main === module && process.argv[2] !== '--build-ort') {
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

if (require.main === module && process.argv[2] === '--build-ort') {
  // node src/zenamen.js --build-ort <имена.json> <выход.ort> [--country 113]
  // Файл имён — массив строк или {names:[...]}; имена сортируются, как у завода.
  const fs = require('fs');
  const src = process.argv[3], dst = process.argv[4];
  const ci = process.argv.indexOf('--country');
  if (!src || !dst) {
    console.error('использование: node src/zenamen.js --build-ort <имена.json> <выход.ort> [--country 113]');
    process.exit(1);
  }
  const j = JSON.parse(fs.readFileSync(src, 'utf8'));
  const list = [...new Set((Array.isArray(j) ? j : j.names).map((s) => String(s).trim()))]
    .filter(Boolean).sort();
  const out = buildSection({ names: list, country: Number(ci > 0 ? process.argv[ci + 1] : 0), version: 3 });
  fs.writeFileSync(dst, out);
  const back = allNames(out);
  console.log('имён ' + list.length + ', ключей ' + header(out).keys + ', файл ' + out.length + ' б');
  console.log('чтение обратно: ' + back.names.length + ' имён, поток съеден ' + back.end + ' из ' + back.len +
    (back.err ? ' ОШИБКА ' + back.err : '') +
    ', совпало ' + back.names.filter((n, i) => n === list[i]).length + ' из ' + list.length);
  console.log('записано: ' + dst);
}
