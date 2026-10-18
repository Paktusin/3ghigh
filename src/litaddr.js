// Адресный справочник LIT: корень -> страна -> город -> улица.
//
// Это то, что читает ввод цели (LIM/LWT в NavCore): `CLwtLitAccess::openLit`
// (FUN_08f099ac) заводит смеситель над LIT, а корень ищет по адресу (блок 0,
// ключ 0) — `FUN_08cccce8`/`FUN_08cccc48` зовут переход `FUN_08cceb48` ровно
// туда. Раскладка ниже снята с заводских данных AU и EU по ключам прошивки
// (src/litkeys.js) и сверена грамматикой TTD; что из неё догадка — помечено.
//
// Записи (ведущий байт -> структура, поля — номера типов грамматики):
//
//   0x90  0x01 корень    0x206 метка времени, 0x2e, 0x85, 0x4a -> заголовок
//                        POI (0x20), 0x36 -> дерево категорий POI (0x33),
//                        0x217, 0x40 + 0x54 -> общая таблица 0x18, 0x86;
//                        цикл по языкам: код (3 байта), 0x205 номер языка,
//                        0x3c -> список названий стран, 0x40 + 0x54 -> таблица
//   0xd0  0x30 список    бит 0 ведущего — список висит прямо на объекте (1)
//                        или на индексе (0); байт b1: бит 7 — есть 0x66
//                        (владелец), бит 6 — есть произношение, младшие 6 —
//                        число имён (0x3f — дальше u32). Виток: байт
//                        (приставка << 5 | длина), имя, 0x3c -> объект
//   0xd9  0x32 индекс    0x66 владелец, 0x65 всего имён, 0x2d -> первое имя,
//                        число ветвей; ветвь: символ (7 бит) и 0x3c -> куда
//   0x98  0x02 страна    флаги, 0x201 код страны (= номер в COUNTRY .xah + 1),
//                        ISO2, ISO3, 0x3a, 0x205, три тройки (0x36 корень
//                        списка, 0x2b и 0x2a — последнее имя), 0x36, центр,
//                        рамка (0x3e мин, 0x3d макс), 0x36
//   0xa2  0x03 город     b1 — флаги полей: 0x01 тройка улиц, 0x02 центр,
//                        0x04 рамка и 0x215, 0x08 и 0x40 — ещё по ссылке;
//                        0x66 -> своё имя в списке страны; 0x208/0x209/0x20a
//   0x00  0x07 улица     ведущий байт — флаги (биты 0–1 рамка, 2–3 число
//                        перекрёстков, 4 дома), центр, [рамка], перекрёстки
//   0x94  0x21 слой POI  0x4c, 0x41, следующий элемент — корень дерева,
//                        0x62 и 0x2b
//
// Ключи: структура — K, виток i — K + 1 + i. Ссылка на начало списка — K,
// на имя внутри списка — K + 1 + i (0x2d указывает на первое имя: K + 1).
'use strict';

const E = require('./litenc');

const LIST_MAX = 50;          // длиннее заводские списки не бывают (1286 из 1286 AU)
const DIRECT_MAX = 50;        // до 50 имён список висит прямо, дальше — индекс (AU)

// ---------------------------------------------------------------------------
// Сборка байт из лексем. Лексема: {u8}, {u16}, {u32}, {v} (varint), {raw},
// {ref} (позиция дельта-кодеком; null — «нет»), {pair} (упакованная пара).
// Ссылки задаются именами и разрешаются после раздачи ключей.

function encode(tokens, ctx, st) {
  const out = [];
  for (const t of tokens) {
    if (t.u8 !== undefined) out.push(Buffer.from([t.u8 & 0xff]));
    else if (t.u16 !== undefined) out.push(E.encFixed(t.u16, 2));
    else if (t.u32 !== undefined) out.push(E.encFixed(t.u32, 4));
    else if (t.v !== undefined) out.push(E.encVarint(t.v));
    else if (t.raw !== undefined) out.push(t.raw);
    else if (t.pair !== undefined) {
      const [x, y] = t.pair;
      const lim = Math.pow(2, ctx.width);
      if (x < 0 || y < 0 || x >= lim || y >= lim)
        throw new Error('пара ' + t.pair + ' вне ширины ' + ctx.width + ' (блок ' + ctx.blk + ')');
      out.push(E.encPair(x, y, ctx.width));
    } else if ('ref' in t) {
      const p = t.ref === null ? null : ctx.resolve(t.ref);
      if (!p) { out.push(Buffer.from([0xff])); st.x = -1; st.y = -1; st.first = false; continue; }
      const d = E.encDelta({ x: p[0], y: p[1], px: st.x, py: st.y, base: ctx.blk, first: st.first });
      if (!d) throw new Error('ссылка не кодируется: ' + JSON.stringify(p));
      out.push(d.buf);
      st.x = p[0]; st.y = p[1]; st.first = false;
    } else throw new Error('неизвестная лексема ' + JSON.stringify(t));
  }
  return Buffer.concat(out);
}

// ---------------------------------------------------------------------------
// Записи. Каждая — {sym, entries, n, tokens(rel)}: sym — имя ключа самой
// структуры, entries[i] — имена ключей витков, n — число витков.

function root(o) {
  const langs = o.langs;
  return {
    sym: 'root', n: langs.length, entries: langs.map((_, i) => 'root#' + i),
    tokens: () => {
      const t = [{ u8: 0x90 },
        { u32: o.f206 }, { u32: o.f2e }, { u32: o.f85 }, { u32: 0 }, { u32: 0 },
        { ref: o.poi || null }, { ref: o.cat || null }, { ref: null }, { ref: null },
        { u16: o.f217 }, { u16: o.tableCount || 0 }, { ref: o.table || null }, { ref: null },
        { u8: o.f86 }, { u16: langs.length }];
      for (const l of langs) {
        t.push({ raw: l.code }, { u16: l.id }, { ref: l.list },
               { u16: l.table ? l.tableCount : 0 }, { ref: l.table || null });
      }
      return t;
    },
  };
}

// Общая приставка в байтах сжатой формы (у нас словаря нет: байты — сами имена).
function prefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && i < 7 && a[i] === b[i]) i++;
  return i;
}

// Список имён. items: [{name, target}], owner — имя ключа владельца или null.
function list(sym, items, o) {
  if (!items.length) throw new Error('пустой список ' + sym);
  if (items.length > LIST_MAX) throw new Error('список ' + sym + ' длиннее ' + LIST_MAX);
  return {
    sym, n: items.length, entries: items.map((_, i) => sym + '#' + i),
    tokens: () => {
      const t = [{ u8: 0xd0 | (o.direct ? 1 : 0) }];
      const n = items.length;
      t.push({ u8: (o.owner ? 0x80 : 0) | (n < 0x3f ? n : 0x3f) });
      if (n >= 0x3f) t.push({ u32: n });
      if (o.owner) t.push({ ref: o.owner });
      let prev = Buffer.alloc(0);
      for (const it of items) {
        const raw = Buffer.from(it.name, 'utf8');
        // остаток не пустой: у одинаковых коротких имён приставка съела бы всё
        const pre = Math.min(prefix(prev, raw), Math.max(0, raw.length - 1));
        const rest = raw.subarray(pre);
        if (rest.length < 31) t.push({ u8: (pre << 5) | rest.length });
        else t.push({ u8: (pre << 5) | 31 }, { u16: rest.length });
        t.push({ raw: rest }, { ref: it.target });
        prev = raw;
      }
      return t;
    },
  };
}

// Одноуровневый индекс: ветвь на каждый первый символ.
function index(sym, o) {
  return {
    sym, n: o.branches.length, entries: o.branches.map((_, i) => sym + '#' + i),
    tokens: () => {
      // корневой индекс — 0xd9; ветвь второго уровня — 0xda (бит 1: есть
      // приставка 0x51, бит 0 сброшен), как у NZ 3383:1202 и 1227
      const t = o.prefix
        ? [{ u8: 0xda }, { ref: o.owner || null }, { v: o.total },
           { u8: Buffer.byteLength(o.prefix) }, { raw: Buffer.from(o.prefix, 'utf8') }, { ref: o.first },
           { v: o.branches.length }]
        : [{ u8: 0xd9 }, { ref: o.owner || null }, { v: o.total }, { ref: o.first },
           { v: o.branches.length }];
      for (const b of o.branches) {
        const c = Buffer.from(b.key, 'utf8');
        if (c.length === 1 && c[0] < 0x80) t.push({ u8: c[0] });
        else t.push({ u8: 0x80 | c.length }, { raw: c });
        t.push({ ref: b.target });
      }
      return t;
    },
  };
}

function country(sym, o) {
  return {
    sym, n: 0,
    tokens: () => [
      { u8: 0x98 }, { u8: 0x01 }, { u16: o.code },
      { raw: Buffer.from(o.iso2, 'latin1') }, { raw: Buffer.from(o.iso3, 'latin1') },
      { u16: o.f3a === undefined ? 2 : o.f3a }, { u16: o.lang === undefined ? 5 : o.lang },
      { ref: o.list }, { ref: o.last }, { ref: o.last },          // вид 4: названия городов
      { ref: null }, { ref: null }, { ref: null },                // вид 0x15: у завода всегда пусто
      { ref: o.postcodes || null }, { ref: null }, { ref: null }, // вид 3: индексы (последнее — пусто, как у завода)
      { ref: o.streets || null },                                 // вид 7: все улицы страны
      { pair: o.center }, { pair: o.min }, { pair: o.max },
      { ref: o.poi || null },                                     // вид 0x10: поиск POI (узел 0x33)
    ],
  };
}

// Город (и район — тоже 0x03). Флаги b1: 0x01 улицы, 0x02 центр, 0x04 рамка
// и 0x215, 0x08 места (0x800), 0x10 индексы (0x1000), 0x20 цикл категорий POI
// (0x49 категория, 0x3c список её точек), 0x40 дерево поиска POI (0x4000,
// узел 0x33). 0x208 — следующий город (цепочка городов; у районов — кольцо
// районов одного города), 0x209 — у города первый район, у района — город,
// 0x20a — точка-центр (у района — центр его города). Так у Мальты: RABAT
// 93240:4276 -> 0x209 93241:2374 (IL-BAĦRIJA) -> 0x208 2493 -> 0x208 2374.
function city(sym, o) {
  const streets = !!o.list;
  const cats = o.cats || [];
  return {
    sym, n: cats.length, entries: cats.map((_, i) => sym + '#' + i),
    tokens: () => {
      const b1 = (streets ? 0x01 : 0) | 0x02 | 0x04 | (o.places ? 0x08 : 0) | (o.postcodes ? 0x10 : 0) |
                 (cats.length ? 0x20 : 0) | 0x40;
      const t = [{ u8: 0xa2 }, { u8: b1 }, { ref: o.name }];
      if (streets) t.push({ ref: o.list }, { ref: o.last }, { ref: o.last });
      t.push({ pair: o.center }, { pair: o.min }, { pair: o.max }, { u32: o.id >>> 0 });
      if (o.places) t.push({ ref: o.places });           // 0x800, вид 6: места -> точка-центр
      if (o.postcodes) t.push({ ref: o.postcodes });     // 0x1000, вид 3: индексы города
      t.push({ ref: o.poi || null },                     // 0x4000, вид 0x10: поиск POI
             { ref: o.next || null }, { ref: o.link || null }, { ref: o.centre || null }); // 0x208…0x20a
      if (cats.length) {
        t.push({ v: cats.length });
        for (const c of cats) t.push({ v: c.cat }, { ref: c.target });
      }
      return t;
    },
  };
}

// Точка-центр города (0x24, короткая форма без бита 2): ведущий 0xa8, 0x66 ->
// её имя в списке мест города, пара 0x22, 0x215. Так у Ватикана 43061:336…343.
function centre(sym, o) {
  return { sym, n: 0, tokens: () => [{ u8: 0xa8 }, { ref: o.name }, { pair: o.center }, { u32: o.id >>> 0 }] };
}

// Почтовая область (0x04, ведущий 0x93): флаги (1 — рамка), 0x66 -> её индекс
// в списке страны, списки видов 4 (города), 7 (улицы), 0x10, 6, рамка.
function postArea(sym, o) {
  return { sym, n: 0, tokens: () => [
    { u8: 0x93 }, { u8: 0x01 }, { ref: o.name },
    { ref: o.cities }, { ref: o.streets }, { ref: null }, { ref: null },
    { pair: o.min }, { pair: o.max }] };
}

// Список 0x31 (ведущий 0xe0): улицы по ссылкам на их имена. Байт b1 = 0x80
// (есть владелец) | n; n ссылок 0x56 на имена, затем n витков с 0x3c -> улица.
// Так у Ватикана 43061:347 (индекс 00073 в городе) и 407.
function list31(sym, items, o) {
  if (!items.length || items.length > LIST_MAX) throw new Error('список 0x31 ' + sym + ': ' + items.length);
  return {
    sym, n: items.length, entries: items.map((_, i) => sym + '#' + i),
    tokens: () => {
      // бит 0 ведущего — как у 0x30: 1 — самостоятельный список, 0 — часть индекса
      const t = [{ u8: 0xe0 | (o.direct ? 1 : 0) }, { u8: (o.owner ? 0x80 : 0) | items.length }];
      if (o.owner) t.push({ ref: o.owner });
      for (const it of items) t.push({ ref: it.name });
      for (const it of items) t.push({ ref: it.target });
      return t;
    },
  };
}

function street(sym, o) {
  return {
    sym, n: 0,
    tokens: () => {
      const t = [{ u8: o.min ? 0x03 : 0x00 }, { pair: o.center }];
      if (o.min) t.push({ pair: o.min }, { pair: o.max });
      t.push({ v: 0 });                                 // перекрёстков нет
      return t;
    },
  };
}

function layer(sym, o) {
  return {
    sym, n: 0,
    tokens: () => [{ u8: 0x94 }, { u16: o.f4c }, { u32: o.f41 >>> 0 },
                   { ref: o.b || null }, { ref: o.plus || null }],
  };
}

// ---------------------------------------------------------------------------
// Таблица 0x18 корня (0x54/0x40): записи «номер u32, блоб». Ведущий 0x92.
//
// id 7000 — набор стран ввода цели (CountrySet): у EU 46 записей, по одной на
// страну, и у каждой первые 4 байта — позиция её записи 0x02 (46 из 46 сошлись
// с блоками стран из списков корня). Кипра там нет. id 10000…10118 — для
// каждой страны статистика символов по видам имён (u16 n, затем n пар
// «u16 символ, u32 сколько раз»): буквы, которые предлагает клавиатура.

function t18(sym, id, blob) {
  return { sym, n: 0, tokens: () => [{ u8: 0x92 }, { u32: id }, { u16: blob.length }, { raw: blob }] };
}

// Позиция (блок, ключ) в 4 байтах: u16 младшие биты блока, u16 (старшие биты
// блока << 13 | ключ) — так лежат все 46 заводских (AL: 00 95 20 00 = 65685).
function pos4(blk, key) {
  const b = Buffer.alloc(4);
  b.writeUInt16BE(blk & 0xffff, 0);
  b.writeUInt16BE(((blk >>> 16) << 13) | (key || 0), 2);
  return b;
}

// Запись набора стран (216 байт). Раскладка по 46 заводским:
//   0 позиция страны, 4 код, 6 = 0x3a, 8 = 0x205, 10 автокод (4), 14 код
//   базы (4), 18 ISO2 (4), 24 ISO3 (8), 32 имя (20), 52 своё имя (20),
//   72 латиницей (24), 104 центр (s32 x, y), 112 мин, 120 макс — в единицах
//   карты (у IE центр — Дублин), 128 локаль (`en_GB`), 208 телефонный код.
// Смысл 212…215 не установлен (у IE `B`, у GR `AL`) — пишем нули.
function countryRecord(o) {
  const b = o.template ? Buffer.from(o.template) : Buffer.alloc(216);
  const put = (at, len, str) => { b.fill(0, at, at + len); b.write(str, at, len, 'utf8'); };
  pos4(o.blk, 0).copy(b, 0);
  b.writeUInt16BE(o.code, 4);
  b.writeUInt16BE(o.f3a, 6);
  b.writeUInt16BE(o.lang, 8);
  put(10, 4, o.car); put(14, 4, o.cc); put(18, 4, o.iso2); b.fill(0, 22, 24);
  put(24, 8, o.iso3); put(32, 20, o.name); put(52, 20, o.name); put(72, 24, o.name);
  b.fill(0, 96, 104);
  const xy = [o.center, o.min, o.max];
  xy.forEach((p, i) => { b.writeInt32BE(p[0], 104 + i * 8); b.writeInt32BE(p[1], 108 + i * 8); });
  put(128, 80, o.locale || 'en_GB');
  put(208, 4, o.phone || '');
  b.fill(0, 212, 216);
  return b;
}

// Статистика символов: позиция страны, u16 n, n × (u16 символ, u32 счёт).
function spellStats(blk, names) {
  const cnt = new Map();
  for (const n of names) for (const ch of n) {
    const c = ch.codePointAt(0);
    if (c < 0x10000) cnt.set(c, (cnt.get(c) || 0) + 1);
  }
  const cs = [...cnt.keys()].sort((a, b) => a - b);
  const b = Buffer.alloc(6 + cs.length * 6);
  pos4(blk, 0).copy(b, 0);
  b.writeUInt16BE(cs.length, 4);
  cs.forEach((c, i) => { b.writeUInt16BE(c, 6 + i * 6); b.writeUInt32BE(cnt.get(c), 8 + i * 6); });
  return b;
}

// Какие имена в какой статистике. Виды — по w3 грамматики (3 — индексы,
// 4 — города, 7 — улицы); прочее сопоставлено по набору символов у AT
// (10003/10010/10109 — только цифры). Это догадка.
const STAT_IDS = [10000, 10003, 10004, 10005, 10006, 10007, 10008, 10009, 10010,
                  10013, 10017, 10101, 10105, 10109, 10118];
function statNames(id, s) {
  const digits = ['0123456789'];
  switch (id) {
    case 10003: case 10010: case 10109: return digits;
    case 10004: case 10005: case 10105: return s.cities;
    case 10007: case 10008: case 10009: return s.streets.length ? s.streets : s.cities;
    case 10006: return s.cities.concat(s.streets);
    case 10013: case 10017: case 10101: case 10118: return s.pois.length ? s.pois : s.cities;
    default: return s.cities.concat(s.streets, s.pois);
  }
}

// Готовые байты записей (перенос): занимают keys ключей.
function verbatim(sym, bytes, keys) {
  return { sym, n: 0, keys, bytes };
}

// ---------------------------------------------------------------------------
// Раздача ключей и сборка блоков.
//
// blocks: [{blk, origin:{x,y}, width, records}] или {blk, bytes} (блок как есть).

function layout(blocks) {
  const pos = new Map();
  for (const b of blocks) {
    if (b.bytes) continue;
    let next = 0;
    for (const r of b.records) {
      const K = next;
      if (r.sym) pos.set(r.sym, [b.blk, K]);
      if (r.keys !== undefined) { next = K + r.keys; continue; }
      if (r.n > 0) {
        r.entries.forEach((s, i) => pos.set(s, [b.blk, K + 1 + i]));
        next = K + 1 + r.n;
      } else next = K + 1;
    }
    if (next > 0xffff) throw new Error('блок ' + b.blk + ': ключей ' + next + ' > 65535');
    b.count = next;
  }
  return pos;
}

function header(b) {
  const h = Buffer.alloc(13);
  h.writeUInt16BE(b.count, 0);
  h[2] = 0;
  h[3] = b.width;
  h.writeInt32BE(b.origin.x, 4);
  h.writeInt32BE(b.origin.y, 8);
  h[12] = 0;                                         // словаря нет: все байты имён — литералы
  return h;
}

function assemble(blocks, extern) {
  const pos = layout(blocks);
  const resolve = (s) => {
    if (Array.isArray(s)) return s;
    if (pos.has(s)) return pos.get(s);
    if (extern && extern(s)) return extern(s);
    throw new Error('неизвестная ссылка ' + s);
  };
  const out = new Map();
  for (const b of blocks) {
    if (b.bytes) { out.set(b.blk, b.bytes); continue; }
    const st = { x: b.blk, y: 0, first: true };
    const parts = [header(b)];
    let ended = false;
    for (const r of b.records) {
      if (r.bytes) { parts.push(r.bytes); ended = r.ended || false; continue; }
      parts.push(encode(r.tokens(), { blk: b.blk, width: b.width, resolve }, st));
    }
    if (!ended) parts.push(Buffer.from([0x80]));
    out.set(b.blk, Buffer.concat(parts));
  }
  return { bytes: out, pos };
}

// ---------------------------------------------------------------------------
// Перенос записи из заводского блока: байты копируются, а ссылки 0x41
// перекодируются заново (база дельта-кодека — номер блока, и он у нас другой).

function transplant(schema, block, srcBlk, opt) {
  const V = require('./litvm');
  const o = opt || {};
  const from = o.from || 0, to = o.to === undefined ? block.length : o.to;
  const map = o.map || ((p) => p);
  const parts = [];
  let cur = from;
  const st = { x: o.blk, y: 0, first: true };
  V.run(schema, block, 0, { blk: srcBlk, limit: 4000000, tap: (t) => {
    if (t.at < from || t.at >= to) return;
    if (t.at > cur) parts.push(block.subarray(cur, t.at));
    if (t.op === 0x41) {
      const p = t.x === -1 && t.y === -1 ? null : map([t.x, t.y]);
      if (!p) { parts.push(Buffer.from([0xff])); st.x = -1; st.y = -1; st.first = false; }
      else {
        const d = E.encDelta({ x: p[0], y: p[1], px: st.x, py: st.y, base: o.blk, first: st.first });
        if (!d) throw new Error('перенос: ссылка не кодируется ' + p);
        parts.push(d.buf); st.x = p[0]; st.y = p[1]; st.first = false;
      }
    } else parts.push(block.subarray(t.at, t.end));
    cur = t.end;
  } });
  if (cur < to) parts.push(block.subarray(cur, to));
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------
// Модель адресов из своих данных: города и улицы.
//
// places: [{name, x, y}], streets: [{name, place, pts: [[x,y]...]}] — улица уже
// привязана к городу (номер в places).

function letter(name) { return [...name][0] || ' '; }

// Имена -> списки не длиннее LIST_MAX и, если имён больше DIRECT_MAX, индекс
// над ними, многоуровневый: ветвь — символ на глубине d; ветвь длиннее
// LIST_MAX — свой индекс со строкой-приставкой (ведущий 0xda, как NZ
// 3383:1227) и ветвями по следующему символу. Каждый список начинается с
// ветви, поэтому все имена достижимы и из индекса, и перечислением подряд.
//
// opt.t31 — списки 0x31 (имя каждого элемента — ссылка it.ref на уже
// существующее имя или запись, сортировка — по it.name).
function names(sym, items, owner, opt) {
  const o = opt || {};
  const sorted = items.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const mk = (ls, g, direct, own) => (o.t31
    ? list31(ls, g.map((it) => ({ name: it.ref, target: it.target })), { owner: own, direct })
    : list(ls, g, { direct, owner: own }));
  const records = [], listRecs = [], subs = [];
  const at = new Map();                          // элемент -> имя ключа его имени
  const where = new Map();                       // элемент -> [номер списка, место]
  const groupsOut = [];
  const addList = (g) => { groupsOut.push(g); g.forEach((it, i) => where.set(it, [groupsOut.length - 1, i])); };
  const lsym = (gi) => sym + ':l' + gi;
  const posOf = (it) => { const [gi, i] = where.get(it); return i === 0 ? lsym(gi) : lsym(gi) + '#' + i; };
  const entryOf = (it) => { const [gi, i] = where.get(it); return lsym(gi) + '#' + i; };
  const direct = sorted.length <= DIRECT_MAX;
  const idx = sym + ':idx';
  let top = null;
  if (direct) addList(sorted);
  else {
    const build = (its, depth, isym, prefix) => {
      const groups = [];
      for (const it of its) {
        const c = [...it.name][depth] || ' ';
        if (!groups.length || groups[groups.length - 1].key !== c) groups.push({ key: c, items: [] });
        groups[groups.length - 1].items.push(it);
      }
      const branches = [];
      let cur = null;
      const flush = () => { if (cur && cur.length) addList(cur); cur = null; };
      for (const g of groups) {
        if (g.items.length > LIST_MAX && depth < 8 && g.items.some((x) => [...x.name].length > depth + 1)) {
          flush();
          const ss = sym + ':i' + subs.length;
          subs.push(null);
          const slot = subs.length - 1;
          subs[slot] = build(g.items, depth + 1, ss, prefix + g.key);
          branches.push({ key: g.key, target: ss });
          continue;
        }
        if (g.items.length > LIST_MAX) {           // одинаковые имена: просто подряд по LIST_MAX
          flush();
          for (let i = 0; i < g.items.length; i += LIST_MAX) addList(g.items.slice(i, i + LIST_MAX));
          branches.push({ key: g.key, first: g.items[0] });
          continue;
        }
        if (cur && cur.length + g.items.length > LIST_MAX) flush();
        if (!cur) cur = [];
        cur.push(...g.items);
        branches.push({ key: g.key, first: g.items[0] });
      }
      flush();
      return { isym, depth, prefix, branches, total: its.length, firstItem: its[0] };
    };
    top = build(sorted, 0, idx, '');
  }
  groupsOut.forEach((g, gi) => listRecs.push(mk(lsym(gi), g, direct, direct ? owner : idx)));
  const mkIndex = (n, own) => index(n.isym, {
    owner: own, total: n.total, first: entryOf(n.firstItem), prefix: n.depth ? n.prefix : undefined,
    branches: n.branches.map((b) => ({ key: b.key, target: b.target || posOf(b.first) })),
  });
  if (top) {
    records.push(mkIndex(top, owner));
    for (const n of subs) records.push(mkIndex(n, idx));
  }
  records.push(...listRecs);
  return { records, head: direct ? lsym(0) : idx, last: entryOf(sorted[sorted.length - 1]), entryOf };
}

// Узел выбора 0x33 (ведущий 0xf0 | n при n <= 3, иначе байт n): витки
// «0x49 селектор, 0x3c куда». Селектор решает, что дальше (`FUN_08cd05c0`):
// {2,3,4,13,14,15,17,19,20,22,23,24,25} и 600…799 — снова узел выбора,
// прочие — список имён. Ватикан 176815:0: 9 -> телефоны, 9 -> названия, 2 ->
// категории; город Валлетта: 1 -> названия всех POI города, 19 -> ...
function select33(sym, sels) {
  return {
    sym, n: sels.length, entries: sels.map((_, i) => sym + '#' + i),
    tokens: () => {
      const n = sels.length;
      const t = n <= 3 ? [{ u8: 0xf0 | n }] : [{ u8: 0xf0 }, { u8: n }];
      for (const s of sels) t.push({ v: s.sel }, { ref: s.target });
      return t;
    },
  };
}


// Повороты названия по словам — так у завода в списках названий POI: «SAN
// PIETRO%BASILICA DI » (Ватикан 176815:33) — хвост, «%», голова с пробелом.
// Поворот — с каждого слова, начинающегося с буквы или цифры.
function rotations(name) {
  const out = [];
  const re = /\s+(?=[\p{L}\p{N}])/gu;
  let m;
  while ((m = re.exec(name))) {
    const at = m.index + m[0].length;
    out.push(name.slice(at) + '%' + name.slice(0, at));
  }
  return out;
}

// Телефон -> цифры с кодом страны, как у завода («39066388333», Мальта — «356…»).
function phoneKey(ph) {
  if (!ph) return null;
  let d = String(ph).split(/[;,]/)[0].replace(/[^0-9+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.length === 8) d = '357' + d;
  return /^[0-9]{6,15}$/.test(d) ? d : null;
}

// Список названий точек: ключ -> точка. У ключа с несколькими точками —
// узел 0x33 с селектором 1 -> список 0x31 этих точек (как у завода телефон
// с двумя точками: Ватикан 176815:4 -> 176815:7 -> 0x31 176815:10).
function poiNames(sym, pois, keys) {
  const by = new Map();
  for (const q of pois) {
    for (const k of new Set(keys(q))) {
      if (!k) continue;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(q);
    }
  }
  const items = [], extra = [];
  let g = 0;
  for (const [k, qs] of by) {
    if (qs.length === 1) { items.push({ name: k, target: qs[0].pos }); continue; }
    const gs = sym + ':g' + (g++);
    const l = names(gs + 'l', qs.map((q) => ({ name: q.name, ref: q.pos, target: q.pos })), null, { t31: true });
    extra.push(select33(gs, [{ sel: 1, target: l.head }]), ...l.records);
    items.push({ name: k, target: gs });
  }
  const n = names(sym, items, null);
  return { records: n.records.concat(extra), head: n.head, entries: items.length };
}

// Оценка размера записи (ссылка — до 5 байт), чтобы раскладывать по блокам.
function estimate(r) {
  if (r.bytes) return r.bytes.length;
  let n = 0;
  for (const t of r.tokens()) {
    if (t.u8 !== undefined) n += 1;
    else if (t.u16 !== undefined) n += 2;
    else if (t.u32 !== undefined) n += 4;
    else if (t.v !== undefined) n += t.v < 252 ? 1 : t.v <= 0xffff ? 3 : t.v <= 0xffffff ? 4 : 5;
    else if (t.raw !== undefined) n += t.raw.length;
    else if (t.pair !== undefined) n += 6;
    else n += 5;
  }
  return n;
}
const keysOf = (r) => (r.keys !== undefined ? r.keys : r.n > 0 ? r.n + 1 : 1);

// Записи группы -> блоки подряд с blk, не больше budget байт и 60 000 ключей
// в блоке; опора и ширина — общие у группы. Записи не рвутся; следующая
// запись (список) продолжает предыдущую уже в следующем блоке — так у завода
// списки городов NZ идут через 3383…3385.
const BLOCK_BUDGET = 40000;
function pack(records, blk, origin, budget) {
  const out = [];
  let cur = null, bytes = 0, keys = 0;
  for (const r of records) {
    const s = estimate(r), k = keysOf(r);
    if (!cur || (cur.records.length && (bytes + s > (budget || BLOCK_BUDGET) || keys + k > 60000))) {
      cur = { blk: blk + out.length, origin, width: 24, records: [] };
      out.push(cur);
      bytes = 13; keys = 0;
    }
    cur.records.push(r);
    bytes += s; keys += k;
  }
  return out;
}

function bboxOf(pts) {

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

// Точка улицы — её вершина, ближайшая к среднему всех вершин.
function anchor(pts) {
  let sx = 0, sy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; }
  const cx = sx / pts.length, cy = sy / pts.length;
  let best = pts[0], bd = Infinity;
  for (const p of pts) {
    const d = (p[0] - cx) * (p[0] - cx) + (p[1] - cy) * (p[1] - cy);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// Блоки справочника: страна в блоке countryBlk, каждый город — в своём блоке
// подряд за ним. Ссылки корня на списки страны — по именам 'cy:names#k'.
function directory(model, opt) {
  const o = opt || {};
  const cb = o.countryBlk;
  const idBase = o.idBase || 0x31000000;
  const places = model.places.map((p, i) => Object.assign({ i, streets: [], districts: [], pois: [] }, p));
  model.streets.forEach((s, si) => { if (places[s.place]) places[s.place].streets.push(Object.assign({ si }, s)); });
  const districts = (model.districts || []).map((d, i) => Object.assign({ i, streets: [] }, d));
  for (const d of districts) places[d.parent].districts.push(d);
  places.forEach((p) => p.streets.forEach((s) => { if (s.district !== undefined) districts[s.district].streets.push(s); }));
  // точки интереса: к ближайшему городу (как улицы)
  const nearest = model.nearest || nearestFn(places);
  const pois = (o.pois || []).filter((q) => q.name);
  for (const q of pois) { const c = nearest(q.x, q.y); if (c >= 0) places[c].pois.push(q); }
  // индексы — только те, у которых нашлась хотя бы одна наша улица: у завода
  // у почтовой области 0x04 список улиц есть всегда (28 из 28)
  const pcs = (model.postcodes || []).filter((q) => q.streets.length);

  const all = [];
  for (const p of places) {
    all.push([p.x, p.y]);
    for (const s of p.streets) for (const q of s.pts) all.push(q);
  }
  for (const d of districts) all.push([d.x, d.y]);
  for (const q of pcs) for (const pt of q.pts) all.push(pt);
  const box = bboxOf(all);
  const corigin = { x: box.x0, y: box.y0 };
  const rel = (org) => (p) => [p[0] - org.x, p[1] - org.y];
  const crel = rel(corigin);

  // список городов страны: города и районы — районы такие же записи 0x03
  const cityItems = places.map((p) => ({ name: p.name, target: 'city' + p.i, p }));
  const distItems = districts.map((d) => ({ name: d.name, target: 'dist' + d.i, d }));
  const cn = names('cy:cities', cityItems.concat(distItems), 'country');

  const pcItems = pcs.map((q, k) => ({ name: q.code, target: 'pa' + k, q }));
  const pn = pcItems.length ? names('cy:pc', pcItems, 'country') : null;

  const streetEntry = new Map();          // номер улицы модели -> ключ имени в списке города
  const t31Entry = new Map();             // `${индекс}@${улица}` -> ключ витка 0x31
  const poiEntry = new Map();             // точка -> ключ её витка в списке категории города
  const stats = { cities: places.length, districts: districts.length, streets: 0, postcodes: pcs.length,
                  centres: 0, poisInCities: 0, districtStreets: 0 };
  const groups = [];                      // [{records, origin}] — города, по порядку
  const withRecs = places;
  places.forEach((p, k) => {
    const pts = [[p.x, p.y]];
    for (const s of p.streets) for (const q of s.pts) pts.push(q);
    for (const d of p.districts) pts.push([d.x, d.y]);
    for (const q of p.pois) pts.push([q.x, q.y]);
    const b = bboxOf(pts);
    const org = { x: b.x0, y: b.y0 };
    const r = rel(org);
    const cs = 'city' + p.i;
    const items = p.streets.map((s, j) => ({ name: s.name, target: 'c' + p.i + 's' + j, s }));
    const recs = [];
    const sn = items.length ? names('c' + p.i, items, cs) : null;
    if (sn) items.forEach((it) => streetEntry.set(it.s.si, sn.entryOf(it)));
    const stSym = new Map(items.map((it) => [it.s.si, it.target]));
    // места города (0x800): своё имя -> точка-центр
    const pl = list('c' + p.i + ':pl', [{ name: p.name, target: 'ctr' + p.i }], { direct: true, owner: cs });
    // индексы города (0x1000): индекс -> 0x31 (или индекс 0x32 над 0x31) со своими улицами
    const mine = pcs.map((q, qk) => ({ q, qk, st: q.streets.filter((si) => model.streets[si].place === p.i) }))
      .filter((x) => x.st.length);
    const ppItems = mine.map((x) => ({ name: x.q.code, target: 'c' + p.i + 'pc' + x.qk, x }));
    const pp = ppItems.length ? names('c' + p.i + ':pcn', ppItems, cs) : null;
    const pcRecs = [];
    for (const it of ppItems) {
      const sts = it.x.st.map((si) => ({ si, name: model.streets[si].name, ref: streetEntry.get(si), target: stSym.get(si) }));
      const l = names(it.target, sts, pp.entryOf(it), { t31: true });
      pcRecs.push(...l.records);
      it.target = l.head;                         // список читает target лениво, при сборке
      sts.forEach((x) => t31Entry.set(it.x.qk + '@' + x.si, l.entryOf(x)));
    }
    // поиск POI в городе (0x4000): узел 0x33, селектор 1 -> названия всех точек
    // города (как Валлетта 245491:1847); категории (цикл 0x2000) -> 0x31 точек
    let poiTree = null, cats = [], poiRecs = [];
    if (p.pois.length) {
      const pn2 = poiNames('c' + p.i + ':pn', p.pois, (q) => [q.name].concat(rotations(q.name)));
      poiTree = 'c' + p.i + ':pt';
      poiRecs.push(select33(poiTree, [{ sel: 1, target: pn2.head }]), ...pn2.records);
      const byCat = new Map();
      for (const q of p.pois) { if (!byCat.has(q.cat)) byCat.set(q.cat, []); byCat.get(q.cat).push(q); }
      for (const [cat, qs] of [...byCat].sort((a, b) => a[0] - b[0])) {
        const its = qs.map((q) => ({ name: q.name, ref: q.pos, target: q.pos, q }));
        const cl = names('c' + p.i + ':k' + cat, its, cs, { t31: true });
        cats.push({ cat, target: cl.head });
        poiRecs.push(...cl.records);
        its.forEach((it) => poiEntry.set(it.q, cl.entryOf(it)));
      }
      stats.poisInCities += p.pois.length;
    }
    const dl = p.districts;
    recs.push(city(cs, {
      name: cn.entryOf(cityItems[k]), list: sn && sn.head, last: sn && sn.last,
      center: r([p.x, p.y]), min: r([b.x0, b.y0]), max: r([b.x1, b.y1]),
      id: idBase + p.i, places: 'c' + p.i + ':pl', postcodes: pp && pp.head, centre: 'ctr' + p.i,
      poi: poiTree, cats, next: k + 1 < withRecs.length ? 'city' + withRecs[k + 1].i : null,
      link: dl.length ? 'dist' + dl[0].i : null,
    }));
    if (sn) recs.push(...sn.records);
    recs.push(pl);
    if (pp) {
      recs.push(...pp.records);
        recs.push(...pcRecs);
    }
    recs.push(...poiRecs);
    recs.push(centre('ctr' + p.i, { name: 'c' + p.i + ':pl#0', center: r([p.x, p.y]), id: idBase + 0x100000 + p.i }));
    stats.centres++;
    items.forEach((it) => {
      const sb = bboxOf(it.s.pts);
      recs.push(street(it.target, { center: r(anchor(it.s.pts)), min: r([sb.x0, sb.y0]), max: r([sb.x1, sb.y1]) }));
    });
    stats.streets += items.length;
    // районы: запись 0x03, улицы — 0x31 со ссылками на имена улиц города
    dl.forEach((d, j) => {
      const ds = 'dist' + d.i;
      const sts = d.streets.map((s) => ({ name: s.name, ref: streetEntry.get(s.si), target: stSym.get(s.si) }))
        .filter((x) => x.ref && x.target);
      const l = sts.length ? names('d' + d.i, sts, ds, { t31: true }) : null;
      recs.push(city(ds, {
        name: cn.entryOf(distItems[d.i]), list: l && l.head, last: l && l.last,
        center: r([d.x, d.y]), min: r([d.x, d.y]), max: r([d.x, d.y]), id: idBase + 0x200000 + d.i,
        next: 'dist' + dl[(j + 1) % dl.length].i, link: cs, centre: 'ctr' + p.i,
      }));
      if (l) recs.push(...l.records);
      stats.districtStreets += sts.length;
    });
    groups.push({ records: recs, origin: org });
  });

  // почтовые области 0x04: города индекса и его улицы (-> витки 0x31 в городах)
  const paRecs = [];
  pcs.forEach((q, k) => {
    const pb = bboxOf(q.pts);
    const cl = list('pa' + k + ':c', q.cities.map((c) => ({ name: places[c].name, target: cn.entryOf(cityItems[c]) }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)), { direct: true, owner: 'pa' + k });
    const sl = names('pa' + k + ':s', q.streets.map((si) => ({ name: model.streets[si].name,
                                                              target: t31Entry.get(k + '@' + si) })), null);
    paRecs.push(postArea('pa' + k, { name: pn.entryOf(pcItems[k]), cities: 'pa' + k + ':c', streets: sl.head,
                                     min: crel([pb.x0, pb.y0]), max: crel([pb.x1, pb.y1]) }), cl, ...sl.records);
  });

  // все улицы страны (вид 7): имя -> имя улицы в списке её города
  const allItems = model.streets.map((s, si) => ({ name: s.name, target: streetEntry.get(si) })).filter((x) => x.target);
  const an = allItems.length ? names('cy:streets', allItems, null) : null;
  // поиск POI в стране (вид 0x10): узел 0x33, селектор 9 -> названия всех точек
  // (Ватикан 176815:0, Мальта 245455:2)
  let cpoi = null, cpRecs = [];
  if (pois.length) {
    // первый селектор 9 — телефоны (у Мальты индекс с приставкой «356»),
    // второй 9 — названия с поворотами слов
    const sels = [], recs = [];
    const ph = pois.filter((q) => phoneKey(q.phone));
    if (ph.length) {
      const l = poiNames('cy:ph', ph, (q) => [phoneKey(q.phone)]);
      sels.push({ sel: 9, target: l.head }); recs.push(...l.records);
    }
    const cp = poiNames('cy:pn', pois, (q) => [q.name].concat(rotations(q.name)));
    sels.push({ sel: 9, target: cp.head }); recs.push(...cp.records);
    cpoi = 'cy:pt';
    cpRecs = [select33(cpoi, sels)].concat(recs);
    stats.poiNames = cp.entries; stats.phones = ph.length;
  }
  const cx = Math.round((box.x0 + box.x1) / 2), cyy = Math.round((box.y0 + box.y1) / 2);
  const countryRecs = [country('country', {
    code: model.code, iso2: model.iso2, iso3: model.iso3,
    list: cn.head, last: cn.last, postcodes: pn && pn.head, streets: an && an.head, poi: cpoi,
    center: crel([cx, cyy]), min: [0, 0], max: crel([box.x1, box.y1]),
  })].concat(pn ? pn.records : [], cn.records, paRecs, an ? an.records : [], cpRecs);

  // раскладка по блокам подряд: страна, затем города
  const blocks = pack(countryRecs, cb, corigin);
  for (const g of groups) {
    const bs = pack(g.records, cb + blocks.length, g.origin);
    blocks.push(...bs);
  }
  stats.blocks = blocks.length;
  return { blocks, stats, poiEntry };
}

// Названия страны по языкам интерфейса. Источник — таблица названий стран в
// самой прошивке (рядом со строкой CYPRUS по 0x09439a6c): CYPRUS, CHIPRE,
// KYPR, CYPERN, CHYPRE, ZYPERN, CIPRO, CYPR, KIBRIS. Сопоставление языку —
// по смыслу, это догадка; язык без своего названия получает CYPRUS.
const CY_NAMES = {
  deu: 'ZYPERN', fra: 'CHYPRE', fca: 'CHYPRE', ita: 'CIPRO', spa: 'CHIPRE', por: 'CHIPRE',
  bra: 'CHIPRE', dan: 'CYPERN', nor: 'CYPERN', swe: 'CYPERN', cze: 'KYPR', slo: 'CYPRUS',
  pol: 'CYPR', tur: 'KIBRIS',
};

// Ближайший город: сетка с ячейкой ~5 км, поиск расширяющимися кольцами.
function nearestFn(pl) {
  const C = 5000;
  const grid = new Map();
  pl.forEach((p, i) => {
    const k = Math.floor(p.x / C) + ',' + Math.floor(p.y / C);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  return (x, y) => {
    if (!pl.length) return -1;
    const cx = Math.floor(x / C), cy = Math.floor(y / C);
    let best = -1, bd = Infinity;
    for (let r = 0; r < 400; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          for (const i of grid.get((cx + dx) + ',' + (cy + dy)) || []) {
            const p = pl[i], d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
            if (d < bd) { bd = d; best = i; }
          }
        }
      }
      // всё, что дальше кольца r, дальше (r * C)^2 — можно остановиться
      if (best >= 0 && bd <= Math.pow(r * C, 2)) break;
    }
    return best;
  };
}

// Города и улицы из того же графа, что идёт в XAC (xacroads.graphFromGeoJSON):
// имена совпадают с именами XAC буква в букву. Улица привязывается к
// ближайшему городу по середине каждого ребра — как в zenModel для
// ZE-NAMEN-MMI, так что деление «город -> улицы» то же, что в XAC.
function modelFromRoads(fc, places, opt) {
  const R = require('./xacroads');
  const o = opt || {};
  const graph = R.graphFromGeoJSON(fc, { classes: o.classes });
  const pl = places.filter((p) => p && p.lon != null && p.lat != null).map((p) => ({
    name: R.latinize(p.name), x: Math.round(p.lon * 72000), y: Math.round(p.lat * (40000000 / 360)),
    kind: p.kind,
  }));
  const nearest = nearestFn(pl);
  const by = new Map();
  const rawTo = new Map();                       // сырое имя OSM -> показываемые (как в XAC)
  for (const e of graph.edges) {
    if (e.raw >= 0 && e.name >= 0) {
      if (!rawTo.has(e.raw)) rawTo.set(e.raw, new Set());
      rawTo.get(e.raw).add(e.name);
    }
  }
  // addr:city домов: улица (сырое имя) -> за какой город голосуют адреса на ней.
  // Голос учитывается, только если этот город не дальше 5 км от ребра.
  const byName = new Map(pl.map((p, i) => [p.name, i]));
  const votes = new Map();                       // сырое имя -> Map(город -> голоса)
  for (const a of o.addrs || []) {
    if (!a.street || !a.city) continue;
    const ri = graph.byRaw.get(R.latinize(a.street));
    const ci = byName.get(R.latinize(a.city).toUpperCase().replace(/\s+/g, ' ').trim());
    if (ri === undefined || ci === undefined) continue;
    if (!votes.has(ri)) votes.set(ri, new Map());
    votes.get(ri).set(ci, (votes.get(ri).get(ci) || 0) + 1);
  }
  const km5 = Math.pow(5000 / 0.9, 2);           // ~5 км в единицах карты (грубо)
  let byVote = 0;
  for (const e of graph.edges) {
    if (e.name < 0) continue;
    const a = graph.nodes[e.a], b = graph.nodes[e.b];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    let place = nearest(mx, my);
    if (place < 0) continue;
    const v = e.raw >= 0 ? votes.get(e.raw) : null;
    if (v) {
      const [ci] = [...v].sort((x, y) => y[1] - x[1])[0];
      const q = pl[ci];
      if (ci !== place && (q.x - mx) * (q.x - mx) + (q.y - my) * (q.y - my) < km5) { place = ci; byVote++; }
    }
    const k = e.name + '@' + place;
    let st = by.get(k);
    if (!st) by.set(k, st = { name: graph.names[e.name], place, pts: [] });
    st.pts.push([a.x, a.y], [b.x, b.y]);
  }
  const streets = [...by.values()];
  const streetOf = new Map();
  by.forEach((st, k) => streetOf.set(k, streets.indexOf(st)));

  // Почтовые индексы: объекты OSM с addr:postcode. Индекс — в городах, где у
  // него есть хотя бы 2 адреса (иначе — в ближайшем); улица индекса — наша
  // улица того же города, на которую указывает addr:street (через сырое имя,
  // как дома в XAC).
  const pcs = new Map();
  for (const a of o.addrs || []) {
    if (!/^\d{4}$/.test(a.pc)) continue;
    const place = nearest(a.x, a.y);
    if (place < 0) continue;
    let q = pcs.get(a.pc);
    if (!q) pcs.set(a.pc, q = { code: a.pc, pts: [], cities: new Map(), streets: new Set() });
    q.pts.push([a.x, a.y]);
    q.cities.set(place, (q.cities.get(place) || 0) + 1);
    const ri = a.street ? graph.byRaw.get(R.latinize(a.street)) : undefined;
    for (const ni of (ri === undefined ? [] : rawTo.get(ri) || [])) {
      const si = streetOf.get(ni + '@' + place);
      if (si !== undefined) q.streets.add(si);
    }
  }
  const postcodes = [];
  for (const q of [...pcs.values()].sort((a, b) => (a.code < b.code ? -1 : 1))) {
    let cities = [...q.cities].filter(([, n]) => n >= 2).map(([c]) => c);
    if (!cities.length) cities = [[...q.cities].sort((a, b) => b[1] - a[1])[0][0]];
    const streetsIn = [...q.streets].filter((si) => cities.includes(streets[si].place));
    postcodes.push({ code: q.code, pts: q.pts, cities: cities.sort((a, b) => a - b), streets: streetsIn });
  }
  // районы: улица города с районами — ещё и в ближайшем районе, если он ближе
  // центра города (в списке города улица остаётся, район ссылается на неё)
  const districts = (o.districts || []).map((d) => ({
    name: R.latinize(d.name), x: Math.round(d.lon * 72000), y: Math.round(d.lat * (40000000 / 360)),
    parent: d.parent, kind: d.kind,
  })).filter((d) => pl[d.parent]);
  const ofPlace = new Map();
  districts.forEach((d, i) => { if (!ofPlace.has(d.parent)) ofPlace.set(d.parent, []); ofPlace.get(d.parent).push(i); });
  for (const st of streets) {
    const ds = ofPlace.get(st.place);
    if (!ds) continue;
    const [ax, ay] = anchor(st.pts);
    const c = pl[st.place];
    let best = -1, bd = (c.x - ax) * (c.x - ax) + (c.y - ay) * (c.y - ay);
    for (const di of ds) {
      const d = districts[di], x = (d.x - ax) * (d.x - ax) + (d.y - ay) * (d.y - ay);
      if (x < bd) { bd = x; best = di; }
    }
    if (best >= 0) st.district = best;
  }
  return { code: o.code || 113, iso2: o.iso2 || 'CY', iso3: o.iso3 || 'CYP',
           places: pl, streets, postcodes, districts, byVote, nearest };
}

// Адреса с почтовым индексом из OSM: [{x, y, pc, street}].
function readAddresses(pbf) {
  const P = require('./osmpbf');
  const want = (t) => t['addr:postcode'] !== undefined || (t['addr:city'] !== undefined && t['addr:street'] !== undefined);
  const idx = P.read(pbf, { node: want, way: want });
  const out = [];
  const add = (lon, lat, t) => out.push({ x: Math.round(lon * 72000), y: Math.round(lat * (40000000 / 360)),
                                          pc: String(t['addr:postcode'] || '').trim(), street: t['addr:street'] || '',
                                          city: t['addr:city'] || '' });
  for (const p of idx.points) add(p.lon / 1e7, p.lat / 1e7, p.tags);
  for (const w of idx.ways) {
    const c = P.center(idx, w.refs);
    if (c) add(c[0] / 1e7, c[1] / 1e7, w.tags);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Проверка обходом, как ходит ввод цели: корень -> список языка -> страна ->
// список городов -> город -> список улиц -> улица. get(blk) — разбор блока
// по ключам (src/litkeys.js, с полем map).

// Имена списка, начиная с позиции ref (начало списка или имя внутри него),
// до конца этого списка: [{name, key, target}].
function entriesFrom(get, ref) {
  const g = get(ref[0]);
  const e = g.map.get(ref[1]);
  if (!e || (e.type !== 0x30 && e.type !== 0x31)) throw new Error('в ' + ref + ' не список 0x30/0x31');
  const out = [];
  const startEl = g.els.find((x) => x.key === ref[1] || (x.keys && x.keys[0] === ref[1]))
               || g.els.find((x) => x.keys && x.keys[1] === ref[1]);
  let i = g.els.indexOf(startEl);
  if (i < 0) i = g.els.findIndex((x) => x.key === ref[1]);
  for (let first = true; i < g.els.length; i++, first = false) {
    const x = g.els[i];
    if (!first && !x.loop) break;
    out.push({ name: x.name, blk: ref[0], key: x.keys ? x.keys[1] : x.key, target: x.f['3c'] });
  }
  return out;
}

// Все имена под объектом: ref — список или индекс 0x32.
function namesUnder(get, ref) {
  const g = get(ref[0]);
  const e = g.map.get(ref[1]);
  if (!e) throw new Error('в ' + ref + ' пусто');
  if (e.type === 0x30 || e.type === 0x31) return entriesFrom(get, ref);
  if (e.type !== 0x32) throw new Error('в ' + ref + ' не список и не индекс: 0x' + e.type.toString(16));
  // индекс: как прошивка (FUN_08cd5d10 + FUN_08cd4400) — с его 0x2d подряд
  return require('./litcity').enumerate(get, ref, null, 10000000).out;
}

function walk(get, opt) {
  const o = opt || {};
  const lang = o.lang || 'eng';
  const g0 = get(0);
  const root = g0.map.get(0);
  if (!root || root.type !== 1) throw new Error('в (0,0) не корень 0x01');
  const iters = [root].concat(g0.els.filter((x) => x.loop && x.type === 1));
  const it = iters.find((x) => Buffer.from(x.f['37']).toString('latin1') === lang);
  if (!it) throw new Error('в корне нет языка ' + lang);
  const cn = entriesFrom(get, it.f['3c']);
  const res = { countryName: cn.map((x) => x.name), cities: [], streets: 0, errors: [] };
  const ct = cn[0].target;
  const c = get(ct[0]).map.get(ct[1]);
  if (!c || c.type !== 2) throw new Error('название страны ведёт не в 0x02');
  res.code = c.f['201'];
  res.iso = [Buffer.from(c.f['37']).toString('latin1'), Buffer.from(c.f['37*'][0]).toString('latin1')];
  for (const ce of namesUnder(get, c.f['36'])) {
    const city = get(ce.target[0]).map.get(ce.target[1]);
    if (!city || city.type !== 3) { res.errors.push('город ' + ce.name + ': не 0x03'); continue; }
    const back = city.f['66'];
    if (!back || back[0] !== ce.blk || back[1] !== ce.key)
      res.errors.push('город ' + ce.name + ': 0x66 не на своё имя');
    let n = 0;
    if ((city.b1 & 1) && city.f['36'] && city.f['36'][0] >= 0) {
      for (const se of namesUnder(get, city.f['36'])) {
        const st = get(se.target[0]).map.get(se.target[1]);
        if (!st || st.type !== 7) { res.errors.push('улица ' + se.name + ': не 0x07'); continue; }
        n++;
      }
    }
    // 0x800 -> места -> точка-центр 0x24; 0x20a — она же
    const r36 = [city.f['36']].concat(city.f['36*'] || []);
    const off = (city.b1 & 1) ? 1 : 0;
    const plRef = (city.b1 & 8) ? r36[off] : null;
    if (plRef && plRef[0] >= 0) {
      for (const pe of namesUnder(get, plRef)) {
        const c = get(pe.target[0]).map.get(pe.target[1]);
        if (!c || c.type !== 0x24) res.errors.push('место ' + pe.name + ': не 0x24');
        else res.centres = (res.centres || 0) + 1;
      }
    }
    const ctr = city.f['20a'];
    if (ctr && ctr[0] >= 0) {
      const c = get(ctr[0]).map.get(ctr[1]);
      if (!c || c.type !== 0x24) res.errors.push('город ' + ce.name + ': 0x20a не 0x24');
    }
    // 0x1000 -> индексы города -> 0x31 -> улицы 0x07
    const pcRef = (city.b1 & 0x10) ? r36[off + ((city.b1 & 8) ? 1 : 0)] : null;
    if (pcRef && pcRef[0] >= 0) {
      for (const pe of namesUnder(get, pcRef)) {
        const l = get(pe.target[0]).map.get(pe.target[1]);
        if (!l || (l.type !== 0x31 && l.type !== 0x32)) { res.errors.push('индекс ' + pe.name + ' в городе: не 0x31'); continue; }
        for (const x of namesUnder(get, pe.target)) {
          const t = get(x.target[0]).map.get(x.target[1]);
          if (!t || t.type !== 7) res.errors.push('0x31 индекса ' + pe.name + ': не улица');
        }
        res.cityPostcodes = (res.cityPostcodes || 0) + 1;
      }
    }
    res.cities.push({ name: ce.name, streets: n });
    res.streets += n;
  }
  // страна: вид 3 (индексы -> 0x04), вид 7 (все улицы -> имя улицы в городе)
  const cr = [c.f['36']].concat(c.f['36*'] || []);   // 0x36 по порядку: 4, 0x15, 3, 7, 0x10
  const pcs = cr[2], sts = cr[3];
  if (pcs && pcs[0] >= 0) {
    for (const pe of namesUnder(get, pcs)) {
      const a = get(pe.target[0]).map.get(pe.target[1]);
      if (!a || a.type !== 4) { res.errors.push('индекс ' + pe.name + ': не 0x04'); continue; }
      if (!a.f['66'] || a.f['66'][1] !== pe.key) res.errors.push('индекс ' + pe.name + ': 0x66 не на своё имя');
      for (const ce of namesUnder(get, a.f['36'])) {
        const t = get(ce.target[0]).map.get(ce.target[1]);
        if (!t || t.type !== 0x30) res.errors.push('индекс ' + pe.name + ': город не на имя');
      }
      for (const se of namesUnder(get, a.f['36*'][0])) {
        const t = get(se.target[0]).map.get(se.target[1]);
        if (!t || t.type !== 0x31) res.errors.push('индекс ' + pe.name + ': улица не на виток 0x31');
      }
      res.postcodes = (res.postcodes || 0) + 1;
    }
  }
  if (sts && sts[0] >= 0) {
    for (const se of namesUnder(get, sts)) {
      const t = get(se.target[0]).map.get(se.target[1]);
      if (!t || t.type !== 0x30 || t.name !== se.name) res.errors.push('улица страны ' + se.name + ': не на имя в городе');
      else res.allStreets = (res.allStreets || 0) + 1;
    }
  }
  return res;
}

module.exports = { layout, rotations, phoneKey, poiNames, select33, pack, estimate, nearestFn, centre, postArea, list31, readAddresses, t18, pos4, countryRecord, spellStats, statNames, STAT_IDS, modelFromRoads, walk, namesUnder, entriesFrom, encode, root, list, index, country, city, street, layer, verbatim,
                   layout, assemble, transplant, names, directory, anchor, bboxOf, prefix,
                   CY_NAMES, LIST_MAX, DIRECT_MAX };
