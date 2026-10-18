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
        const pre = prefix(prev, raw);
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
      const t = [{ u8: 0xd9 }, { ref: o.owner }, { v: o.total }, { ref: o.first },
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
      { ref: o.list }, { ref: o.last }, { ref: o.last },
      { ref: null }, { ref: null }, { ref: null },
      { ref: null }, { ref: null }, { ref: null },      // тройка индексов (почта) — пусто
      { ref: null },
      { pair: o.center }, { pair: o.min }, { pair: o.max },
      { ref: null },
    ],
  };
}

function city(sym, o) {
  const streets = !!o.list;
  return {
    sym, n: 0,
    tokens: () => {
      const t = [{ u8: 0xa2 }, { u8: (streets ? 0x01 : 0) | 0x02 | 0x04 | 0x08 | 0x40 },
                 { ref: o.name }];
      if (streets) t.push({ ref: o.list }, { ref: o.last }, { ref: o.last });
      t.push({ pair: o.center }, { pair: o.min }, { pair: o.max }, { u32: o.id >>> 0 },
             { ref: null }, { ref: null },               // 0x800, 0x4000
             { ref: null }, { ref: null }, { ref: null }); // 0x208, 0x209, 0x20a
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

// Имена -> списки (по LIST_MAX, режем по смене первой буквы, где можно) и
// при необходимости индекс над ними. Возвращает записи и имена ключей.
function names(sym, items, owner) {
  const sorted = items.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const per = new Map();
  for (const it of sorted) per.set(letter(it.name), (per.get(letter(it.name)) || 0) + 1);
  const groups = [];
  let cur = [];
  for (const it of sorted) {
    // режем по LIST_MAX; на смене буквы — если новая буква в остаток не влезет
    const brk = cur.length >= LIST_MAX ||
      (cur.length && letter(cur[cur.length - 1].name) !== letter(it.name) &&
       cur.length + per.get(letter(it.name)) > LIST_MAX);
    if (brk) { groups.push(cur); cur = []; }
    cur.push(it);
  }
  if (cur.length) groups.push(cur);

  const records = [];
  const at = new Map();                  // элемент -> имя ключа его имени
  const direct = sorted.length <= DIRECT_MAX;
  const idx = sym + ':idx';
  groups.forEach((g, gi) => {
    const ls = sym + ':l' + gi;
    records.push(list(ls, g, { direct, owner: direct ? owner : idx }));
    g.forEach((it, i) => at.set(it, ls + '#' + i));
  });
  // ссылка на позицию имени: начало списка — ключ структуры, внутри — ключ витка
  const posOf = (it) => {
    for (let gi = 0; gi < groups.length; gi++) {
      const i = groups[gi].indexOf(it);
      if (i === 0) return sym + ':l' + gi;
      if (i > 0) return sym + ':l' + gi + '#' + i;
    }
    throw new Error('имя вне списков');
  };
  let head = sym + ':l0';
  if (!direct) {
    const branches = [];
    for (const it of sorted) {
      const k = letter(it.name);
      if (!branches.length || branches[branches.length - 1].key !== k) branches.push({ key: k, target: posOf(it) });
    }
    records.unshift(index(idx, { owner, total: sorted.length, first: sym + ':l0#0', branches }));
    head = idx;
  }
  return { records, head, last: at.get(sorted[sorted.length - 1]), entryOf: (it) => at.get(it) };
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
  const places = model.places.map((p, i) => Object.assign({ i, streets: [] }, p));
  for (const s of model.streets) if (places[s.place]) places[s.place].streets.push(s);

  const all = [];
  for (const p of places) {
    all.push([p.x, p.y]);
    for (const s of p.streets) for (const q of s.pts) all.push(q);
  }
  const box = bboxOf(all);
  const corigin = { x: box.x0, y: box.y0 };
  const rel = (org) => (p) => [p[0] - org.x, p[1] - org.y];

  const cityItems = places.map((p) => ({ name: p.name, target: 'city' + p.i, p }));
  const cn = names('cy:cities', cityItems, 'country');
  const crel = rel(corigin);
  const cx = Math.round((box.x0 + box.x1) / 2), cyy = Math.round((box.y0 + box.y1) / 2);
  const countryRecs = [country('country', {
    code: model.code, iso2: model.iso2, iso3: model.iso3,
    list: cn.head, last: cn.last,
    center: crel([cx, cyy]), min: [0, 0], max: crel([box.x1, box.y1]),
  })].concat(cn.records);

  const blocks = [{ blk: cb, origin: corigin, width: 24, records: countryRecs }];
  const stats = { cities: places.length, streets: 0, blocks: 1 };
  places.forEach((p, k) => {
    const blk = cb + 1 + k;
    const pts = [[p.x, p.y]];
    for (const s of p.streets) for (const q of s.pts) pts.push(q);
    const b = bboxOf(pts);
    const org = { x: b.x0, y: b.y0 };
    const r = rel(org);
    const items = p.streets.map((s, j) => ({ name: s.name, target: 'c' + p.i + 's' + j, s }));
    const recs = [];
    let sn = null;
    if (items.length) sn = names('c' + p.i, items, 'city' + p.i);
    recs.push(city('city' + p.i, {
      name: cn.entryOf(cityItems[k]), list: sn && sn.head, last: sn && sn.last,
      center: r([p.x, p.y]), min: r([b.x0, b.y0]), max: r([b.x1, b.y1]),
      id: (o.idBase || 0x31000000) + p.i,
    }));
    if (sn) {
      recs.push(...sn.records);
      items.forEach((it) => {
        const sb = bboxOf(it.s.pts);
        recs.push(street(it.target, {
          center: r(anchor(it.s.pts)), min: r([sb.x0, sb.y0]), max: r([sb.x1, sb.y1]),
        }));
      });
      stats.streets += items.length;
    }
    blocks.push({ blk, origin: org, width: 24, records: recs });
    stats.blocks++;
  });
  return { blocks, stats };
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
  }));
  const nearest = (x, y) => {
    let best = -1, bd = Infinity;
    pl.forEach((p, i) => {
      const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };
  const by = new Map();
  for (const e of graph.edges) {
    if (e.name < 0) continue;
    const a = graph.nodes[e.a], b = graph.nodes[e.b];
    const place = nearest((a.x + b.x) / 2, (a.y + b.y) / 2);
    if (place < 0) continue;
    const k = e.name + '@' + place;
    let st = by.get(k);
    if (!st) by.set(k, st = { name: graph.names[e.name], place, pts: [] });
    st.pts.push([a.x, a.y], [b.x, b.y]);
  }
  return { code: o.code || 113, iso2: o.iso2 || 'CY', iso3: o.iso3 || 'CYP',
           places: pl, streets: [...by.values()] };
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
  if (!e || e.type !== 0x30) throw new Error('в ' + ref + ' не список 0x30');
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
  if (e.type === 0x30) return entriesFrom(get, ref);
  if (e.type !== 0x32) throw new Error('в ' + ref + ' не список и не индекс: 0x' + e.type.toString(16));
  const seen = new Map();
  const kids = [e].concat(g.els.filter((x) => x.loop && x.type === 0x32 && x.key > e.key &&
                                              x.key <= e.key + e.f['65'] + 1));
  for (const k of kids) {
    const t = k.f['3c'];
    if (!t) continue;
    for (const it of namesUnder(get, t)) if (!seen.has(it.key)) seen.set(it.key, it);
  }
  return [...seen.values()];
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
    if (city.f['36'] && city.f['36'][0] >= 0) {
      for (const se of namesUnder(get, city.f['36'])) {
        const st = get(se.target[0]).map.get(se.target[1]);
        if (!st || st.type !== 7) { res.errors.push('улица ' + se.name + ': не 0x07'); continue; }
        n++;
      }
    }
    res.cities.push({ name: ce.name, streets: n });
    res.streets += n;
  }
  return res;
}

module.exports = { modelFromRoads, walk, namesUnder, entriesFrom, encode, root, list, index, country, city, street, layer, verbatim,
                   layout, assemble, transplant, names, directory, anchor, bboxOf, prefix,
                   CY_NAMES, LIST_MAX, DIRECT_MAX };
