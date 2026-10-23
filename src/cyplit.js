'use strict';
// Свой контейнер `LIT` — только с кипрскими точками интереса.
//
//   node src/cyplit.js                       собрать и проверить
//   node src/cyplit.js --out out/cyp/CY.lit  ещё и записать
//   node src/cyplit.js --limit 2000          ограничить число точек
//
// Отличие от `src/cyptree.js`. Тот сажает блоки в слоты чужих листьев
// заводского дерева: место и номер блока заданы заводским каталогом, вырасти
// блок не может, а рядом остаётся 2,1 ГБ чужих данных. Здесь контейнер свой:
// своя нумерация блоков, свой каталог, свой корень дерева, и ничего кроме
// Кипра внутри. Это и есть цель (см. README).
//
// ── Что откуда берётся ────────────────────────────────────────────────────
//   заголовок и грамматика `TTD`  — переносятся из заводского `LIT` как есть:
//                                   это описание формата, а не данные;
//   блок 0                        — узлы дерева (корень — элемент 0);
//   блоки 1…N                     — листья с точками;
//   каталог                       — считается сборщиком (`src/litfile.js`),
//                                   ширины полей подбираются под размер файла.
//
// ── Чего мы не знаем ──────────────────────────────────────────────────────
// Ссылка `0x66` у точки (в заводских данных — позиция «блок, ключ») ведёт
// куда-то за пределы блока, и что с ней делает устройство, неизвестно. Здесь
// она ставится на собственный лист точки — значение существующее и внутри
// нашего же контейнера, но это **догадка**, а не прочитанное в коде.
//
// На устройстве такой контейнер не проверялся ни разу.

const fs = require('fs');
const path = require('path');
const lit = require('./lit');
const litfile = require('./litfile');
const C = require('./cyppoi');
const T = require('./cyptree');
const S = require('./litschema');
const VM = require('./litvm');
const P = require('./litpoi');
const B = require('./litblock');
const X = require('./xac');

const CAP = 13795;                  // потолок листа: самый большой заводской блок
const NODE = 0;                     // блок с узлами дерева

// Заголовок и грамматика заводского контейнера.
function template(file) {
  const raw = fs.readFileSync(file || 'maps/pkgdb/LIT/EJ211Ga_L1.db');
  const at = raw.indexOf(Buffer.from([0x4c, 0x69, 0x74, 0x02]));
  if (at < 0) throw new Error('магия Lit\\x02 не найдена в образце');
  const m = litfile.read(raw.subarray(at));
  return { head: Buffer.from(m.head), ttd: Buffer.from(m.ttd), header: m.header };
}

// Сборка контейнера из точек.
//
// Без `opt.addr` — прежняя раскладка: блок 0 — узлы дерева POI (корень —
// элемент 0), дальше листья. С `opt.addr` — контейнер с адресным справочником
// (src/litaddr.js), и тогда раскладка заводская по смыслу:
//
//   0            корень 0x01 и списки названий страны по языкам
//   1            таблица 0x18 (начало общей таблицы корня, из EU-блока 1)
//   2…30         продолжение таблицы 0x18 — заводские блоки EU как есть
//   H            заголовок POI 0x20 (EU 93281, все категории -> наш слой)
//   N            слой POI 0x21 (ключ 0) и узлы дерева (корень — ключ 1)
//   N+1…         листья с точками
//   C            страна 0x02, списки городов
//   C+1…         по блоку на город: 0x03, списки улиц, улицы 0x07
//
// Блоки 1…30 и H переносятся только при `opt.factory` (каталоги заводского
// LIT); без него корень ставит на таблицы и POI «нет» — так собираются тесты.
function build(pois, opt) {
  const o = opt || {};
  const tpl = o.template || template(o.from);
  const cap = o.cap || CAP;
  const slots = o.slots || 512;
  if (!o.addr) {
    // Слоты — это просто номера будущих блоков: 1, 2, 3… Размер у всех один,
    // потому что в своём контейнере блок ничем не зажат, кроме нашего потолка.
    const donors = Array.from({ length: slots }, (_, i) => ({ blk: i + 1, size: cap }));
    const r = T.build(pois, donors, { ref: o.ref || [1, 0], nodeBlk: NODE });

    const blocks = [r.node.bytes];
    const used = r.leaves.slice().sort((a, b) => a.blk - b.blk);
    if (used.some((l, i) => l.blk !== i + 1)) throw new Error('номера листьев идут не подряд');
    for (const l of used) blocks.push(l.bytes);

    return { buf: litfile.build({ head: tpl.head, ttd: tpl.ttd, blocks }),
             leaves: used.length, pois: used.reduce((a, l) => a + l.pois, 0),
             node: r.node.bytes.length,
             bytes: blocks.reduce((a, b) => a + b.length, 0) };
  }
  return buildAddr(pois, o, tpl, cap, slots);
}

// Заводской индекс .xah (из него — названия страны по языкам, countryNames).
function factoryXah(root) {
  const fldb = require('./fldb');
  const d = path.join(root, 'pkgdb', 'XAC');
  const db = fldb.open(path.join(d, fs.readdirSync(d).find((f) => /\.db$/i.test(f))));
  const xah = fldb.read(db, fldb.entries(db).find((e) => /\.xah$/i.test(e.name)));
  fs.closeSync(db.fd);
  return xah;
}

// Заводские куски: язык корня, таблицы 0x18, заголовок POI.
const EU_TABLE_FIRST = 2961;           // первая запись 0x18 в EU-блоке 1 (корень: 0x54 = (1, 2961))
const EU_TABLE_LAST_BLOCK = 30;        // общая таблица: 77 + блоки 2…30 = 6085 записей, ровно 0x40 корня
const EU_POI_HEADER = 93281;           // заголовок POI 0x20 (корень: 0x4a = (93281, 0))

function factoryParts(dirs) {
  const KS = require('./litkeys');
  const f = KS.open(dirs);
  const g0 = f.get(0);
  const r0 = g0.els[0];
  if (r0.type !== 1) throw new Error('заводской LIT: в (0,0) не корень');
  // Виток 0 (код '*') лежит в самой записи корня: его 0x40 и 0x54 — вторые
  // по счёту (первые — общая таблица корня), дальше витки отдельными элементами.
  const langs = [{ code: Buffer.from(r0.f['37']), id: r0.f['205'], tableCount: r0.f['40*'][0], table: null }];
  for (const e of g0.els.filter((x) => x.loop && x.type === 1)) {
    langs.push({ code: Buffer.from(e.f['37']), id: e.f['205'], tableCount: e.f['40'],
                 table: e.f['54'][0] < 0 ? null : e.f['54'] });
  }
  const g1 = f.get(1);
  const first = g1.els.find((e) => e.key === EU_TABLE_FIRST);
  if (!first || first.type !== 0x18) throw new Error('заводской LIT: в (1, 2961) не таблица 0x18');
  // Набор стран (0x18, id 7000) — в блоке 1: 46 записей EU; образец для
  // Кипра — Ирландия (en_GB, 0x3a = 2, 0x205 = 5, как у нашей записи страны).
  const set = g1.els.filter((e) => e.type === 0x18 && e.f['21'] === 7000);
  const ie = set.map((e) => Buffer.from(e.f['20'])).find((b) => b.readUInt16BE(4) === 17);
  const tables = [];
  for (let i = 2; i <= EU_TABLE_LAST_BLOCK; i++) tables.push(f.L.block(f.cat[i]));
  const hb = f.L.block(f.cat[EU_POI_HEADER]);
  // Слои POI по шапке 0x20: последние записи — слои (0x49 = номер слоя, 0x3c —
  // его заголовок 0x21), остальные — типы; слой типа — тот, чей 0x3c совпал.
  // Проверено данными: у 58 типов из 58 порог 0x74 равен порогу слоя, и все
  // точки в листьях над Критом, Мальтой и Мюнхеном лежат в слое своего типа.
  const ents = f.get(EU_POI_HEADER).els.filter((e) => e.type === 0x20)
    .map((e) => ({ id: e.f['49'], root: e.f['3c'], th: e.f['74'] }));
  const nl = new Set(ents.map((e) => e.root.join(','))).size;
  const layers = ents.slice(-nl).map((e) => ({ idx: e.id, root: e.root, th: e.th }));
  const t2l = {};
  for (const t of ents.slice(0, ents.length - nl)) t2l[t.id] = layers.find((l) => l.root[0] === t.root[0]).idx;
  return {
    root: { f206: r0.f['206'], f2e: r0.f['2e'], f85: r0.f['85'], f217: r0.f['217'], f86: r0.f['86'],
            tableCount: r0.f['40'] },
    langs, block1: g1.next - EU_TABLE_FIRST, countryTemplate: ie,
    tables, header: { schema: f.schema, block: hb }, layers, t2l,
  };
}

// Записи блока 1: набор стран (7000) и статистики символов для Кипра.
function countrySet(A, model, C, pois, template) {
  const xs = [], ys = [];
  for (const p of model.places) { xs.push(p.x); ys.push(p.y); }
  for (const st of model.streets) for (const q of st.pts) { xs.push(q[0]); ys.push(q[1]); }
  const cap = model.places.find((p) => /^(NICOSIA|LEFKOSIA)$/.test(p.name));
  const lo = (a) => a.reduce((m, v) => (v < m ? v : m), Infinity);
  const hi = (a) => a.reduce((m, v) => (v > m ? v : m), -Infinity);
  const min = [lo(xs), lo(ys)], max = [hi(xs), hi(ys)];
  const center = cap ? [cap.x, cap.y] : [Math.round((min[0] + max[0]) / 2), Math.round((min[1] + max[1]) / 2)];
  const rec = A.countryRecord({ template, blk: C, code: model.code, f3a: 2, lang: 5,
                                car: model.iso2, cc: model.cc || model.iso2, iso2: model.iso2,
                                iso3: model.iso3, name: 'CYPRUS', center, min, max,
                                locale: 'en_GB', phone: '357' });
  const names = { cities: model.places.map((p) => p.name),
                  streets: model.streets.map((x) => x.name),
                  pois: pois.map((p) => p.name).filter(Boolean) };
  return [A.t18('set:CY', 7000, rec)].concat(
    A.STAT_IDS.map((id) => A.t18('stat:' + id, id, A.spellStats(C, A.statNames(id, names)))));
}

// Слой для типов вне шапки (их точки на карте не рисуются). Слой 0 (порог
// 13 000, у завода — пригородные поезда, которых на Кипре нет): иначе он вышел бы
// пустым, а пустых слоёв у завода не бывает — лишний риск зависания на старте.
const NONMAP_LAYER = 0;

// Пустой слой: заголовок 0x21 (0x41 = 0, без листьев) и узел без ветвей.
function emptyLayer(li) {
  return { origin: { x: 0, y: 0 }, width: 24, byte2: 0, count: 2, dict: new Map(), tile: null, pois: [],
           layer: { f4c: li, f41: 0 },
           nodes: [{ aMin: [0, 0], aMax: [0, 0], a: null, bMin: [0, 0], bMax: [0, 0], b: null,
                     x79: null, n42: 0, x7a: null, n7b: 0 }] };
}

// Рамка слоя для шапки 0x20 — в точках карты: опора блока узлов плюс
// объединение двух прямоугольников корня (ключ 1). Так у завода: 120458 —
// опора шапки + (8192, 16384) … + (15044608, 4894720) = опора блока узлов +
// [0, 0] … [15036416, 4878336]. CLitPoiTileDb (poitile.c) берёт ненулевую
// рамку витка как есть, а нулевую — из корня слоя тем же способом.
function layerFrame(schema, b, blk) {
  const KS = require('./litkeys');
  const org = [b.readInt32BE(4), b.readInt32BE(8)];
  const n = KS.keyed(schema, b, blk).els.find((e) => e.key === 1);
  if (!n || n.type !== 0x22) throw new Error('в (' + blk + ', 1) не узел слоя');
  const xs = [n.f['61'], n.f['60'], n.f['64'], n.f['63']].filter(Boolean);
  return { min: [Math.min(...xs.map((p) => p[0])) + org[0], Math.min(...xs.map((p) => p[1])) + org[1]],
           max: [Math.max(...xs.map((p) => p[0])) + org[0], Math.max(...xs.map((p) => p[1])) + org[1]] };
}

function buildAddr(pois, o, tpl, cap, slots) {
  const A = require('./litaddr');
  const fac = o.factory ? factoryParts(o.factory) : null;
  const blocks = [];
  let next = 2;                                      // блок 1 — набор стран, всегда наш
  if (fac) next = EU_TABLE_LAST_BLOCK + 1;
  const H = fac ? next++ : null;
  // Слои POI: у завода по дереву на слой, точка — в слое своего типа (по шапке).
  // Типы вне шапки (магазины одежды и пр. — у завода в деревьях их нет) кладём в
  // слой NONMAP_LAYER (см. выше) — это догадка.
  const nl = fac ? fac.layers.length : 1;
  const layerOf = (p) => (!fac ? 0 : fac.t2l[p.cat] !== undefined ? fac.t2l[p.cat] : NONMAP_LAYER);
  const groups = Array.from({ length: nl }, () => []);
  for (const p of pois) groups[layerOf(p)].push(p);
  // Два прохода. Первый делит точки на листья (с запасом по размеру: ссылка
  // 0x66 у каждой точки потом своя и длиннее), отсюда позиции точек (лист,
  // 1 + номер). По ним строится справочник: названия POI -> точки, списки
  // категорий города -> точки. Второй проход пишет те же листья, а 0x66
  // точки — на её виток в списке категории города (так у завода: Мальта
  // 102270:88 -> 93241:2264, виток 0x31 категории 8 города RABAT).
  const plans = [];
  for (let li = 0; li < nl; li++) {
    const Ni = next++;
    const g = groups[li];
    if (!g.length) { plans.push({ li, Ni, g }); continue; }
    const donors = Array.from({ length: slots }, (_, i) => ({ blk: Ni + 1 + i, size: Math.floor(cap * 0.85) }));
    const plan = T.plan(g, donors, { ref: o.ref || [Ni + 1, 0] });
    const used = plan.leaves.map((l) => l.slot.blk).sort((a, b) => a - b);
    if (used.some((b, i) => b !== Ni + 1 + i)) throw new Error('номера листьев идут не подряд');
    plans.push({ li, Ni, g, plan, donors });
    next = Ni + 1 + used.length;
  }
  const posOf = new Map();
  for (const P1 of plans) if (P1.plan) for (const lf of P1.plan.leaves) lf.pois.forEach((q, i) => posOf.set(q, [lf.slot.blk, 1 + i]));
  const C = next;
  const wrap = pois.filter((q) => posOf.has(q)).map((q) => ({ name: q.name, cat: q.cat, x: q.x, y: q.y,
                                                                phone: q.phone, alt: q.alt, pos: posOf.get(q), src: q }));
  const dir = A.directory(o.addr, { countryBlk: C, pois: wrap });
  const dpos = A.layout(dir.blocks);
  const refOf = new Map();
  for (const [w, sym] of dir.poiEntry) if (dpos.has(sym)) refOf.set(w.src, dpos.get(sym));

  const layers = [];
  for (const { li, Ni, g, plan, donors } of plans) {
    if (!g.length) {                                  // пустой слой: заголовок и пустой узел
      layers.push({ idx: li, nodeBlk: Ni, leaves: [], node: B.writeBlock(emptyLayer(li), Ni), pois: [] });
      continue;
    }
    const r = T.build(g, donors, { plan, cap, refOf: (q) => refOf.get(q) || o.ref || [Ni + 1, 0], nodeBlk: Ni,
                                   layer: (lv) => ({ f4c: li, f41: g.length,
                                                     b: [Math.min(...lv.map((l) => l.blk)), 0],
                                                     plus: [Math.max(...lv.map((l) => l.blk)), 0] }) });
    const used = r.leaves.slice().sort((a, b) => a.blk - b.blk);
    layers.push({ idx: li, nodeBlk: Ni, leaves: used, node: r.node.bytes, pois: g });
  }
  const N = layers[0].nodeBlk;
  const used = [].concat(...layers.map((l) => l.leaves));
  const poiRefs = refOf.size;

  // корень и списки названий страны
  const fallback = [{ code: Buffer.from('2a0000', 'hex'), id: 0, tableCount: 0, table: null },
                    { code: Buffer.from('eng'), id: 5, tableCount: 0, table: null }];
  const langs = (fac ? fac.langs : fallback).map((l, i) => Object.assign({}, l, { list: 'cn' + i }));
  // Названия страны — из XAC (countryNames): текущую страну по положению машины
  // HMI берёт оттуда на языке интерфейса («КИПР»), и ввод цели ищет это имя в
  // LIT (FUN_08f0ee68 -> FUN_08ccb6cc); не нашлось — страна из описания места
  // стирается, и поиск идёт «без области». У завода виток i — язык i записи
  // LANGUAGE (5290 пар из 5290 у 46 стран), виток 0 — все названия; языку без
  // названия в XAC — английское (2), как у завода.
  const xn = o.xah ? X.countryNames(o.xah, (o.addr && o.addr.code) || 113) : { 2: 'CYPRUS' };
  const all = [...new Set(Object.values(xn))].sort();
  const country = 'country';
  const lists = langs.map((l, i) => {
    const nm = i === 0 ? all : [xn[i] || xn[2]];
    return A.list('cn' + i, nm.map((name) => ({ name, target: country })), { direct: true, owner: null });
  });
  const set = countrySet(A, o.addr, C, pois, fac && fac.countryTemplate);
  const tableCount = set.length + (fac ? fac.root.tableCount - fac.block1 : 0);
  const rootRec = A.root(Object.assign({ f206: Math.floor(Date.now() / 1000), f2e: 1962872095,
                                         f85: 128, f217: 1499, f86: 37, tableCount: 0 },
                                       fac ? fac.root : {}, {
    langs, poi: H === null ? null : [H, 0], cat: null,
    table: [1, 0], tableCount,
  }));
  blocks.push({ blk: 0, origin: { x: 0, y: 0 }, width: 24, records: [rootRec].concat(lists) });
  // Блок 1 — начало общей таблицы 0x18: вместо 46 стран EU и их статистик —
  // Кипр (набор стран 7000 и статистика символов 10000…10118). Без него
  // CLwtCountryDetails не находит страну («couldn't find CountrySet»), и ввод
  // города остаётся без букв и без списка.
  blocks.push({ blk: 1, origin: { x: 0, y: 0 }, width: 24, records: set });
  if (fac) {
    fac.tables.forEach((b, i) => blocks.push({ blk: 2 + i, bytes: b }));
    // шапка: ссылка на заголовок заводского слоя -> на заголовок нашего того же
    // слоя; рамка витка (0x3e, 0x3d) — рамка нашего слоя (см. layerFrame)
    const ours = new Map(fac.layers.map((l, i) => [l.root[0], [layers[i].nodeBlk, 0]]));
    const hb = fac.header.block, ho = [hb.readInt32BE(4), hb.readInt32BE(8)];
    // пустой слой (у завода их нет) — рамка EU как есть
    const frames = new Map(layers.filter((l) => l.pois.length)
      .map((l) => [l.nodeBlk, layerFrame(fac.header.schema, l.node, l.nodeBlk)]));
    blocks.push({ blk: H, bytes: A.transplant(fac.header.schema, hb, EU_POI_HEADER, {
      blk: H, map: (p) => ours.get(p[0]) || p,
      pair: (t, ref) => {
        const f = ref && frames.get(ref[0]);
        if (!f || (t.type !== 0x3e && t.type !== 0x3d)) return undefined;
        const v = t.type === 0x3e ? f.min : f.max, d = [v[0] - ho[0], v[1] - ho[1]];
        if (d.some((x) => x < 0 || x >= 1 << 24)) throw new Error('рамка слоя вне опоры шапки: ' + d);
        return d;
      } }) });
  }
  for (const l of layers) {
    blocks.push({ blk: l.nodeBlk, bytes: l.node });
    for (const lf of l.leaves) blocks.push({ blk: lf.blk, bytes: lf.bytes });
  }
  for (const b of dir.blocks) blocks.push(b);

  const asm = A.assemble(blocks);
  const total = Math.max(...blocks.map((b) => b.blk)) + 1;
  const list = [];
  for (let i = 0; i < total; i++) {
    if (!asm.bytes.has(i)) throw new Error('дыра в нумерации блоков: ' + i);
    list.push(asm.bytes.get(i));
  }
  const sizeOf = (a, z) => list.slice(a, z).reduce((s, b) => s + b.length, 0);
  return { buf: litfile.build({ head: tpl.head, ttd: tpl.ttd, blocks: list }),
           leaves: used.length, pois: used.reduce((a, l) => a + l.pois, 0),
           node: layers.reduce((a, l) => a + l.node.length, 0), nodeBlk: N, poiHeader: H, countryBlk: C, countryNames: xn,
           layers: layers.map((l) => ({ idx: l.idx, nodeBlk: l.nodeBlk, count: l.pois.length,
                                        first: l.leaves.length ? l.leaves[0].blk : null,
                                        last: l.leaves.length ? l.leaves[l.leaves.length - 1].blk : null,
                                        leaves: l.leaves.map((x) => x.blk) })),
           layerOf,
           poiRefs, dirStats: dir.stats,
           // для сверки поиска по категории: точки страны и точки каждого города
           houseExpect: dir.houseExpect.map((h) => ({ pos: dpos.get(h.sym), nums: [...h.nums] })),
           catExpect: { country: wrap, cities: dir.cityPois.map((c) => ({ pos: dpos.get(c.sym), pois: c.pois })) },
           cities: dir.stats.cities, streets: dir.stats.streets, postcodes: dir.stats.postcodes,
           bytes: list.reduce((a, b) => a + b.length, 0),
           parts: { root: list[0].length, tables: fac ? sizeOf(1, EU_TABLE_LAST_BLOCK + 1) : 0,
                    poi: sizeOf(H === null ? N : H, C), addr: sizeOf(C, total) } };
}

// Сверка по записанному файлу — своими читателями, как ходит прошивка.
// Возвращает отчёт; bad — есть ли расхождения.
function verify(buf, r, pois) {
  const os = require('os');
  const KS = require('./litkeys');
  const A = require('./litaddr');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyp-lit-'));
  const file = path.join(dir, 'CY.db');
  fs.writeFileSync(file, buf);
  const rep = { blocks: 0, keysOk: 0, parsedOk: 0, leavesEnd: 0, poisBack: 0, seen: 0, hit: 0 };
  try {
    const schema = S.load(file, 0);                 // грамматика читается из нашего же файла
    const m = litfile.read(buf);
    const ks = KS.open([dir]);
    rep.blocks = m.blocks.length;
    for (let i = 0; i < m.blocks.length; i++) {
      const g = ks.get(i);
      if (g.next === g.count) rep.keysOk++;
      const why = g.run.why;
      if (why === 'данные кончились' && g.run.pos === m.blocks[i].length) rep.parsedOk++;
    }
    // слои: у старой раскладки один слой — блок NODE, корень в ключе 0
    const lays = r.layers || [{ idx: 0, nodeBlk: NODE, count: r.pois,
                                leaves: Array.from({ length: r.leaves }, (_, i) => NODE + 1 + i) }];
    const rootKey = r.layers ? 1 : 0;
    for (const L of lays) {
      for (const i of L.leaves) {
        const res = VM.run(schema, m.blocks[i], 0, { blk: i, limit: 4000000 });
        if (res.why === 'данные кончились' && res.pos === m.blocks[i].length) rep.leavesEnd++;
        rep.poisBack += P.poisOf(schema, m.blocks[i], i).length;
      }
    }
    if (r.layers) {
      // заголовки слоёв 0x21: 0x4c — номер слоя, 0x41 — точек в нём, 0x62/0x2b —
      // первый и последний лист (как у завода, EU 120582: 9, 1110, 120583…120586)
      rep.layerHdr = lays.every((L) => {
        const h = ks.get(L.nodeBlk).map.get(0);
        if (!h || h.type !== 0x21 || h.f['4c'] !== L.idx || h.f['41'] !== L.count) return false;
        if (!L.leaves.length) return h.f['62'][0] < 0 && h.f['2b'][0] < 0;
        return h.f['62'][0] === L.first && h.f['2b'][0] === L.last;
      });
      // путь прошивки к дереву: корень 0x4a -> шапка 0x20 -> слой 0x21 своего номера
      const root = ks.get(0).map.get(0);
      const hp = root && root.f['4a'];
      if (r.poiHeader === null) rep.poiPath = 'без шапки POI';
      else {
        const byBlk = new Map(lays.map((L) => [L.nodeBlk, L.idx]));
        const ents = hp && hp[0] === r.poiHeader ? ks.get(hp[0]).els.filter((e) => e.type === 0x20) : [];
        const nl = lays.length;
        const hb = m.blocks[r.poiHeader], ho = [hb.readInt32BE(4), hb.readInt32BE(8)];
        rep.poiPath = ents.length > nl && ents.every((e, i) => {
          const li = byBlk.get(e.f['3c'][0]);
          if (li === undefined || e.f['3c'][1] !== 0) return false;
          // рамка витка — рамка корня его слоя (как у завода, 68 из 68)
          if (lays.find((L) => L.nodeBlk === e.f['3c'][0]).count) {
            const f = layerFrame(schema, m.blocks[e.f['3c'][0]], e.f['3c'][0]);
            if ([0, 1].some((k) => e.f['3e'][k] + ho[k] !== f.min[k] || e.f['3d'][k] + ho[k] !== f.max[k])) return false;
          }
          return i >= ents.length - nl ? li === e.f['49'] : li === r.layerOf({ cat: e.f['49'] });
        });
      }
    }
    const cache = new Map();
    const get = (i) => {
      if (cache.has(i)) return cache.get(i);
      const b = m.blocks[i];
      let recs = [];
      try { recs = VM.run(schema, b, 0, { blk: i, limit: 4000000 }).records; } catch (e) { /* пусто */ }
      const v = { origin: { x: b.readInt32BE(4), y: b.readInt32BE(8) }, elems: P.elemsOf(recs) };
      cache.set(i, v);
      return v;
    };
    // спуск от корня дерева СВОЕГО слоя по рамке вокруг каждой точки (каждой 20-й)
    const layerOf = r.layerOf || (() => 0);
    const byIdx = new Map(lays.map((L) => [L.idx, L]));
    for (let i = 0; i < pois.length; i += 20) {
      const q = pois[i]; rep.seen++;
      const L = byIdx.get(layerOf(q));
      const box = { x0: q.x - 72, y0: q.y - 111, x1: q.x + 72, y1: q.y + 111 };
      if (L && T.collect(get, L.nodeBlk, rootKey, box, new Set(), 0).size) rep.hit++;
    }
    // поиск рядом (POI_EnterBySurrounding) путём прошивки — src/litnear.js:
    // от точек каждого типа, радиус 100 км, найти ровно перебор
    // и проба: кинотеатры (KINO, 30) в 20 км от центра Лимасола (на машине 21.10 — «не найдено в 100 км»)
    if (r.layers) rep.near = require('./litnear').check(require('./litnear').open(ks), [].concat(...lays.map((L) => L.leaves)),
      { probes: [{ name: 'KINO у Лимасола', type: 30, lon: 33.0413, lat: 34.6786, radius: 20000 }] });
    if (r.countryBlk !== undefined) {
      rep.addr = A.walk(ks.get);
      // поиск POI по названию — эмулятор пути прошивки (src/litcity.js poiSearch):
      // страна, вид 0x10 (последняя 0x36) -> узел 0x33 -> селектор 18
      // (названия), 9 (телефоны); город, 0x4000 -> селектор 1
      const LC = require('./litcity');
      const root0 = ks.get(0).map.get(0);
      const ce = A.entriesFrom(ks.get, root0.f['3c'])[0].target;
      const cty = ks.get(ce[0]).map.get(ce[1]);
      const cr = [cty.f['36']].concat(cty.f['36*'] || []);
      const node = cr[4];
      if (node && node[0] >= 0) {
        const two = LC.selectors(ks.get, node).some((x) => x.sel === 9);
        const nm = LC.poiSearch(ks.get, node, 18, 0);
        const ph = two ? LC.poiSearch(ks.get, node, 9, 0) : { names: 0, pois: 0, bad: [] };
        rep.poiSearch = { names: nm.names, pois: nm.pois, bad: nm.bad.length + ph.bad.length,
                          phones: ph.names, phonePois: ph.pois, sample: nm.sample, cities: 0, cityPois: 0,
                          multiNames: nm.multiNames || 0, multiPois: nm.multi || 0 };
        // поиск по категории (litcity.catSearch): страна — селектор 18, город — 1
        rep.catSearch = { errors: [], cats: 0, groups: 0, pois: 0, cities: 0, cityPois: 0 };
        const cityExp = new Map((r.catExpect ? r.catExpect.cities : [])
          .filter((c) => c.pois.some((q) => require('./litaddr').inTree(q.cat))).map((c) => [c.pos.join(':'), c.pois]));
        if (r.catExpect) {
          const cc = catCheck(rep.catSearch, LC.catSearch(ks.get, node, 18), r.catExpect.country, 'страна');
          rep.catSearch.cats = cc.cats; rep.catSearch.groups = cc.groups; rep.catSearch.pois = cc.pois;
        }
        // города: 0x4000 — последняя 0x36 записи города
        for (const c of LC.enumerate(ks.get, cr[0], null, 1e6).out) {
          const city = ks.get(c.target[0]).map.get(c.target[1]);
          if (!city || city.type !== 3 || !(city.b1 & 0x40)) continue;
          const rr = [city.f['36']].concat(city.f['36*'] || []);
          const t = rr[rr.length - 1];
          if (!t || t[0] < 0) continue;
          const cs = LC.poiSearch(ks.get, t, 1, 0);
          rep.poiSearch.cities++; rep.poiSearch.cityPois += cs.pois; rep.poiSearch.bad += cs.bad.length;
          const exp = cityExp.get(c.target.join(':'));
          if (exp) { catCheck(rep.catSearch, LC.catSearch(ks.get, t, 1), exp, 'город ' + c.name); rep.catSearch.cities++; cityExp.delete(c.target.join(':')); }
        }
        rep.catSearch.missing = cityExp.size;
        // 0x66 точки -> виток 0x31 категории её города, а его 0x3c — сама точка;
        // у категорий вне цикла города — её имя 0x30 в названиях города, а его
        // 0x3c — точка или узел 0x33 имени, в списке которого она есть
        let ok = 0, n = 0;
        const holds = (p, b, k) => {
          if (!p) return false;
          if (p[0] === b && p[1] === k) return true;
          const x = ks.get(p[0]).map.get(p[1]);
          const o = { pois: new Set(), bad: [] };
          if (x && x.type === 0x33) LC.poisOf(ks.get, p, o);
          return o.pois.has(b + ':' + k);
        };
        for (const L of lays) for (const b of L.leaves) {
          for (const e of ks.get(b).els) {
            if (e.type !== 0x24) continue;
            n++;
            const back = e.f['66'], t = back && back[0] >= 0 ? ks.get(back[0]).map.get(back[1]) : null;
            const it = t && (t.type === 0x31 || t.type === 0x30) ? ks.get(back[0]).els.find((x) => (x.keys ? x.keys[1] : x.key) === back[1]) : null;
            if (it && holds(it.f['3c'], b, e.key)) ok++;
          }
        }
        rep.poiSearch.backOk = ok; rep.poiSearch.backSeen = n;
      }
      // дома (litcity.houses — путь прошивки): страна, вид 4 -> город -> его
      // список улиц -> улица 0x07 -> группы номеров. Каждая улица с домами
      // достижима, каждый её номер принят (FUN_08ccf41c), лишних номеров нет.
      if (r.houseExpect) {
        const reached = new Set();
        for (const c of LC.enumerate(ks.get, cr[0], null, 1e6).out) {
          const city = ks.get(c.target[0]).map.get(c.target[1]);
          if (!city || city.type !== 3 || !(city.b1 & 1)) continue;
          for (const x of LC.enumerate(ks.get, city.f['36'], city.f['2b'], 1e6).out) reached.add(x.target.join(':'));
        }
        const hr = rep.houses = { streets: 0, reached: 0, nums: 0, ok: 0, extra: 0, groups: 0, bad: [], longest: '' };
        for (const x of r.houseExpect) {
          hr.streets++;
          if (reached.has(x.pos.join(':'))) hr.reached++;
          const h = LC.houses(ks.get(x.pos[0]).map.get(x.pos[1]));
          if (!h || h.bad) { hr.bad.push(x.pos + ': ' + (h ? h.bad : 'нет домов')); continue; }
          hr.groups += h.groups.length;
          if (h.text.length > hr.longest.length) hr.longest = h.text;
          for (const n of x.nums) { hr.nums++; if (LC.houseOk(h, n)) hr.ok++; }
          for (const g of h.groups) {
            for (let v = g.from; v <= g.to; v += g.kind === 1 || g.kind === 2 ? 2 : 1) if (!x.nums.includes(v)) hr.extra++;
          }
        }
      }
      // набор стран: запись 7000 ведёт на запись 0x02 с тем же кодом, у каждой
      // статистики позиция — та же страна; 0x40 корня = записей 0x18 подряд с (1, 0)
      const root = ks.get(0).map.get(0);
      const t = ks.get(1).els.filter((e) => e.type === 0x18);
      const set = t.filter((e) => e.f['21'] === 7000).map((e) => Buffer.from(e.f['20']));
      const posOf = (b) => [b.readUInt16BE(0) | ((b.readUInt16BE(2) >>> 13) << 16), b.readUInt16BE(2) & 0x1fff];
      rep.countrySet = set.map((b) => {
        const p = posOf(b);
        const c = p[0] < m.blocks.length ? ks.get(p[0]).map.get(p[1]) : null;
        return { pos: p, code: b.readUInt16BE(4), ok: !!c && c.type === 2 && c.f['201'] === b.readUInt16BE(4) };
      });
      rep.stats = t.filter((e) => e.f['21'] >= 10000).length;
      let n = 0;
      for (let i = 1; i < m.blocks.length; i++) {
        const els = ks.get(i).els;
        if (!els.length || els.some((e) => e.type !== 0x18)) break;
        n += els.length;
      }
      rep.tableCount = { root: root.f['40'], found: n };
    }
    ks.L.vols.forEach((v) => fs.closeSync(v.fd));
    if (r.countryBlk !== undefined) {
      // путь прошивки (src/litcity.js): виток 0 корня -> страна -> узел вида 4;
      // и FUN_08ccd098: код страны -> набор стран 7000 -> имя в списке языка
      const LC = require('./litcity');
      const em = LC.cities([dir], 'CYPRUS');
      const nl = ks.get(0).els.filter((x) => x.type === 1).length;   // корень и его витки
      const codes = [];
      const ko = KS.open([dir]);
      for (let l = 0; l < nl; l++) codes.push(LC.countryByCode(ko, 113, l));
      ko.L.vols.forEach((v) => fs.closeSync(v.fd));
      const bad = codes.filter((c) => c.why !== 'ок');
      // страна по положению машины: HMI берёт имя из XAC на языке l и ищет его
      // по имени (виток 0) — каждое имя XAC обязано вести к тем же городам; и в
      // витке языка l имя страны — то же, что в XAC (как у завода)
      const xn = r.countryNames || { 2: 'CYPRUS' };
      const byName = [...new Set(Object.values(xn))].map((n) => ({ n, c: LC.cities([dir], n).cities.length }));
      const nameBad = byName.filter((x) => x.c !== em.cities.length).map((x) => x.n)
        .concat(codes.filter((c, l) => l > 0 && c.name !== (xn[l] || xn[2])).map((c) => 'язык ' + c.lang + ': ' + c.name));
      rep.emul = { cities: em.cities.length, notCity: em.cities.filter((c) => c.type !== 3).length,
                   byCode: bad.length ? bad[0].why : 'ок', name: codes.map((c) => c.name).filter(Boolean)[1] || codes[0].name,
                   langs: codes.length, langsOk: codes.length - bad.length,
                   byName: byName.map((x) => x.n), nameBad };
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  rep.bad = rep.keysOk !== rep.blocks || rep.parsedOk !== rep.blocks || rep.leavesEnd !== r.leaves ||
            rep.poisBack !== r.pois || rep.hit !== rep.seen || rep.poiPath === false || rep.layerHdr === false ||
            (rep.near && rep.near.ok !== rep.near.searches) ||
            (rep.catSearch && (rep.catSearch.errors.length > 0 || rep.catSearch.missing > 0 ||
                               rep.catSearch.pois !== (r.dirStats.poisInTree || 0) ||
                               rep.catSearch.cityPois !== (r.dirStats.poisInTree || 0))) ||
            (rep.poiSearch && (rep.poiSearch.bad || rep.poiSearch.pois !== (r.dirStats.poisInCities || 0) ||
                               rep.poiSearch.cityPois !== (r.dirStats.poisInCities || 0) ||
                               rep.poiSearch.backOk !== rep.poiSearch.backSeen ||
                               rep.poiSearch.multiNames !== (r.dirStats.poiMulti || 0))) ||
            (rep.houses && (rep.houses.bad.length || rep.houses.reached !== rep.houses.streets ||
                            rep.houses.ok !== rep.houses.nums || rep.houses.extra ||
                            rep.houses.streets !== r.dirStats.houseStreets)) ||
            (rep.emul && (rep.emul.cities !== r.cities + ((r.dirStats && r.dirStats.districts) || 0) || rep.emul.notCity || rep.emul.byCode !== 'ок' ||
                          rep.emul.nameBad.length)) ||
            (rep.countrySet && (!rep.countrySet.length || rep.countrySet.some((c) => !c.ok) ||
                                rep.tableCount.root !== rep.tableCount.found)) ||
            (rep.addr && ((rep.addr.postcodes || 0) !== (r.postcodes || 0) ||
                          (rep.addr.centres || 0) !== r.cities || (rep.addr.allStreets || 0) !== r.streets ||
                          (rep.addr.multiStreets || 0) !== ((r.dirStats && r.dirStats.multiStreets) || 0))) ||
            (rep.addr && (rep.addr.errors.length > 0 ||
                          rep.addr.cities.length !== r.cities + ((r.dirStats && r.dirStats.districts) || 0) ||
                          rep.addr.streets !== r.streets + ((r.dirStats && r.dirStats.districtStreets) || 0)));
  return rep;
}

// Сверка дерева категорий с ожидаемым: каждая категория с точками есть в
// группе 39 и во всех своих заводских группах (A.POI_GROUPS), лишних нет;
// список категории даёт ровно её точки; список группы — ровно точки её
// категорий. В город — те же правила по его точкам. Итог копится в acc.
function catCheck(acc, got, pois, where) {
  const A = require('./litaddr');
  const key = (q) => q.pos.join(':');
  const err = (m) => acc.errors.push(where + ': ' + m);
  const byCat = new Map();
  for (const q of pois.filter((x) => A.inTree(x.cat))) { if (!byCat.has(q.cat)) byCat.set(q.cat, new Set()); byCat.get(q.cat).add(key(q)); }
  for (const e of got.bad) err(e);
  const want = new Map([[39, [...byCat.keys()].sort((a, b) => a - b)]]);
  for (const [g, cs] of Object.entries(A.POI_GROUPS)) {
    const mine = cs.filter((c) => byCat.has(c));
    if (mine.length) want.set(+g, mine);
  }
  const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  if (!same(new Set(want.keys()), new Set(got.groups.keys()))) err('группы ' + [...got.groups.keys()] + ' вместо ' + [...want.keys()]);
  let reached = 0;
  for (const [g, cs] of want) {
    const ent = got.groups.get(g);
    if (!ent) continue;
    if (ent.cats.join(',') !== cs.join(',')) err('группа ' + g + ': категории ' + ent.cats + ' вместо ' + cs);
    const all = new Set([].concat(...cs.map((c) => [...byCat.get(c)])));
    if (!same(ent.pois, all)) err('группа ' + g + ': точек ' + ent.pois.size + ' вместо ' + all.size);
  }
  for (const [c, ks] of byCat) {
    const p = got.cats.get(c);
    if (!p || !same(p, ks)) err('категория ' + c + ': точек ' + (p ? p.size : 0) + ' вместо ' + ks.size);
    else reached += ks.size;
  }
  if (where === 'страна') return { cats: got.cats.size, groups: got.groups.size, pois: reached };
  acc.cityPois += reached;
  return null;
}

function report(rep, r, log) {
  log('--- сверка по собранному файлу ---');
  log('ключей по заголовку сошлось: ' + rep.keysOk + ' из ' + rep.blocks + ' блоков');
  log('блоков дочитано машиной до конца: ' + rep.parsedOk + ' из ' + rep.blocks);
  log('листья дочитываются до конца: ' + rep.leavesEnd + ' из ' + r.leaves);
  log('точек прочитано обратно: ' + rep.poisBack + ' из ' + r.pois);
  log('спуск по дереву POI: проверено ' + rep.seen + ', лист найден у ' + rep.hit);
  if (rep.poiPath !== undefined) log('путь корень -> 0x20 (рамка витка = рамка слоя) -> 0x21 своего слоя -> узлы: ' + rep.poiPath);
  if (r.layers) log('слои POI: ' + r.layers.map((L) => L.idx + ':' + L.count + (L.leaves.length ? '/' + L.leaves.length + 'л' : '')).join(' ') +
                    '; заголовки 0x21 (номер, число точек, первый/последний лист): ' + rep.layerHdr);
  if (rep.addr) {
    const a = rep.addr;
    log('адреса: корень -> «' + a.countryName.join(', ') + '» -> страна ' + a.code + ' ' + a.iso.join('/') +
        ' -> городов и районов ' + a.cities.length + ' из ' + (r.cities + ((r.dirStats && r.dirStats.districts) || 0)) +
        ' -> улиц ' + a.streets + ' из ' + (r.streets + ((r.dirStats && r.dirStats.districtStreets) || 0)) +
        (a.errors.length ? ', ошибок ' + a.errors.length + ': ' + a.errors.slice(0, 3).join('; ') : ''));
    log('  индексы страны -> 0x04: ' + (a.postcodes || 0) + ' из ' + (r.postcodes || 0) +
        '; индексы в городах -> 0x31: ' + (a.cityPostcodes || 0) + '; точки-центры 0x24: ' + (a.centres || 0) +
        ' из ' + r.cities + '; все улицы страны -> имя в городе: ' + (a.allStreets || 0) + ' из ' + r.streets +
        ' (имён нескольких улиц -> 0x10: ' + (a.multiStreets || 0) + ' из ' + ((r.dirStats && r.dirStats.multiStreets) || 0) +
        ', из них по индексам -> витков улиц ' + (a.multiPostcodes || 0) + ')');
  }
  if (rep.emul) log('путь прошивки (litcity): CYPRUS -> городов ' + rep.emul.cities + ' (не 0x03: ' + rep.emul.notCity +
                    '); FUN_08ccd098(113): языков ' + rep.emul.langsOk + ' из ' + rep.emul.langs + ' (напр. «' + rep.emul.name + '») — ' + rep.emul.byCode +
                    '; имена XAC по имени и по языкам: ' + rep.emul.byName.join(', ') +
                    (rep.emul.nameBad.length ? ' — НЕ ВЕДУТ: ' + rep.emul.nameBad.join('; ') : ' — все ведут к стране'));
  if (rep.countrySet) {
    log('набор стран (0x18/7000): ' + rep.countrySet.map((c) => c.code + ' -> (' + c.pos + ')' + (c.ok ? '' : ' НЕ 0x02')).join(', ') +
        '; статистик символов ' + rep.stats + '; записей таблицы: в корне ' + rep.tableCount.root +
        ', подряд с (1,0) ' + rep.tableCount.found);
  }
  if (r.dirStats) log('районы: ' + r.dirStats.districts + ' (записи 0x03 в списке городов страны, улиц по 0x31: ' +
                     r.dirStats.districtStreets + ')');
  if (rep.poiSearch) {
    const q = rep.poiSearch;
    log('поиск POI (litcity.poiSearch): страна, селектор 18 «названия» — имён ' + q.names + ' -> точек ' + q.pois +
        ' (напр. «' + q.sample[0] + '»; имён с несколькими точками 0x33/16 -> 0x34: ' + q.multiNames + ' из ' +
        (r.dirStats.poiMulti || 0) + ', точек по ним ' + q.multiPois + '); 9 «телефоны» — ' + q.phones + ' -> ' + q.phonePois +
        '; города с 0x4000: ' + q.cities + ', селектор 1 -> точек ' + q.cityPois +
        '; 0x66 точки -> виток 0x31 категории города (вне цикла — имя в названиях города) и обратно: ' + q.backOk + ' из ' + q.backSeen +
        (q.bad ? '; ОШИБОК ' + q.bad : ''));
  }
  if (rep.catSearch) {
    const c = rep.catSearch;
    log('поиск по категории (litcity.catSearch): страна, 20 -> групп ' + c.groups + ', категорий ' + c.cats +
        ', точек через свою категорию ' + c.pois + '; города: ' + c.cities + ' (без дерева ' + (c.missing || 0) +
        '), точек через категорию города ' + c.cityPois +
        (c.errors.length ? '; ОШИБОК ' + c.errors.length + ': ' + c.errors.slice(0, 3).join('; ') : ''));
    const off = r.dirStats.offLoop || [];
    const by = {};
    for (const x of off) by[x] = (by[x] || 0) + 1;
    log('  вне дерева категорий (не в группах 40…48): точек ' + (r.dirStats.poisInCities - r.dirStats.poisInTree) +
        '; вне цикла категорий города (больше ' + require('./litaddr').CITY_CATS_MAX + '): точек ' + off.length +
        (off.length ? ' (' + Object.entries(by).map(([k, v]) => k + ': ' + v).join(', ') + ')' : ''));
  }
  if (rep.houses) {
    const h = rep.houses;
    log('дома (litcity.houses): улиц с домами ' + h.streets + ', достижимы из города ' + h.reached +
        '; номеров ' + h.nums + ', принято ' + h.ok + ', лишних в группах ' + h.extra + '; групп ' + h.groups +
        '; самая длинная строка диапазона ' + h.longest.length + ' зн.' + (h.bad.length ? '; ОШИБОК ' + h.bad.length + ': ' + h.bad.slice(0, 3).join('; ') : ''));
  }
  if (rep.near) {
    const n = rep.near;
    log('поиск рядом (litnear, путь CLwtSimpleSurroundingSearch): типов ' + n.types + ', поисков ' + n.searches +
        ', совпало с перебором ' + n.ok + ', точек найдено ' + n.found +
        n.probes.map((q) => '; ' + q.name + ': ' + q.found).join('') +
        (n.bad.length ? '; ОШИБКИ: ' + n.bad.join('; ') : ''));
  }
  log(rep.bad ? 'ЕСТЬ РАСХОЖДЕНИЯ' : 'расхождений нет');
}

module.exports = { build, verify, report, template, factoryParts, factoryXah, CAP, NODE };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const pbf = argv.find((a) => a.endsWith('.pbf')) || 'out/cyp/cyprus-latest.osm.pbf';
  const limit = Number(flag('limit', 0));

  const all = C.collect(pbf).map((q) => Object.assign({}, q, {
    x: Math.round(q.lon * 72000), y: Math.round(q.lat * T.DEG),
  }));
  const pois = limit ? all.slice(0, limit) : all;
  console.log('точек собрано ' + all.length + (limit ? ', взято ' + pois.length : ''));

  const opt = {};
  if (!argv.includes('--no-addr')) {
    const A = require('./litaddr');
    opt.addr = A.modelFromRoads(JSON.parse(fs.readFileSync(flag('roads', 'out/cyp/roads.geojson'), 'utf8')),
                                JSON.parse(fs.readFileSync(flag('places', 'out/cyp/places_geo.json'), 'utf8')),
                                { classes: flag('classes', 'motorway,motorway_link,trunk,trunk_link,primary,primary_link').split(','),
                                  addrs: require('./litaddr').readAddresses(pbf),
                                  houses: require('./mkxac').readHouses(pbf) });
    opt.factory = ['LIT', 'LIT2', 'LIT3', 'LIT4'].map((d) => path.join(flag('maps', 'maps'), 'pkgdb', d));
    opt.xah = factoryXah(flag('maps', 'maps'));
  }
  const r = build(pois, opt);
  console.log('листьев ' + r.leaves + ', точек в них ' + r.pois + ', блок узлов ' + r.node + ' б' +
              (r.cities !== undefined ? ', городов ' + r.cities + ', улиц ' + r.streets : ''));
  if (r.parts) console.log('части: корень ' + r.parts.root + ' б, таблицы 0x18 ' + r.parts.tables +
                           ' б, POI ' + r.parts.poi + ' б, адреса ' + r.parts.addr + ' б');
  console.log('контейнер ' + r.buf.length + ' байт (' + (r.buf.length / 1048576).toFixed(2) +
              ' МБ) вместо заводских 2 147 401 728 (' +
              (100 * r.buf.length / 2147401728).toFixed(3) + ' %)');
  const out = flag('out');
  if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, r.buf); }
  const rep = verify(r.buf, r, pois);
  report(rep, r, console.log);
  if (out) console.log('записано: ' + out);
  process.exit(rep.bad ? 1 : 0);
}
