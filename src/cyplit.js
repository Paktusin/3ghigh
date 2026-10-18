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
  return {
    root: { f206: r0.f['206'], f2e: r0.f['2e'], f85: r0.f['85'], f217: r0.f['217'], f86: r0.f['86'],
            tableCount: r0.f['40'] },
    langs, block1: g1.next - EU_TABLE_FIRST, countryTemplate: ie,
    tables, header: { schema: f.schema, block: hb },
  };
}

// Записи блока 1: набор стран (7000) и статистики символов для Кипра.
function countrySet(A, model, C, pois, template) {
  const xs = [], ys = [];
  for (const p of model.places) { xs.push(p.x); ys.push(p.y); }
  for (const st of model.streets) for (const q of st.pts) { xs.push(q[0]); ys.push(q[1]); }
  const cap = model.places.find((p) => /^(NICOSIA|LEFKOSIA)$/.test(p.name));
  const min = [Math.min(...xs), Math.min(...ys)], max = [Math.max(...xs), Math.max(...ys)];
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

function buildAddr(pois, o, tpl, cap, slots) {
  const A = require('./litaddr');
  const fac = o.factory ? factoryParts(o.factory) : null;
  const blocks = [];
  let next = 2;                                      // блок 1 — набор стран, всегда наш
  if (fac) next = EU_TABLE_LAST_BLOCK + 1;
  const H = fac ? next++ : null;
  const N = next++;
  const donors = Array.from({ length: slots }, (_, i) => ({ blk: N + 1 + i, size: cap }));
  const r = T.build(pois, donors, { ref: o.ref || [N + 1, 0], nodeBlk: N,
                                    layer: { f4c: 2, f41: 3999970 } });
  const used = r.leaves.slice().sort((a, b) => a.blk - b.blk);
  if (used.some((l, i) => l.blk !== N + 1 + i)) throw new Error('номера листьев идут не подряд');
  const C = N + 1 + used.length;
  const dir = A.directory(o.addr, { countryBlk: C });

  // корень и списки названий страны
  const fallback = [{ code: Buffer.from('2a0000', 'hex'), id: 0, tableCount: 0, table: null },
                    { code: Buffer.from('eng'), id: 5, tableCount: 0, table: null }];
  const langs = (fac ? fac.langs : fallback).map((l, i) => Object.assign({}, l, { list: 'cn' + i }));
  const all = [...new Set(['CYPRUS'].concat(Object.values(A.CY_NAMES)))].sort();
  const country = 'country';
  const lists = langs.map((l, i) => {
    const code = l.code.toString('latin1');
    const nm = i === 0 ? all : [A.CY_NAMES[code] || 'CYPRUS'];
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
    blocks.push({ blk: H, bytes: A.transplant(fac.header.schema, fac.header.block, EU_POI_HEADER,
                                              { blk: H, map: () => [N, 0] }) });
  }
  blocks.push({ blk: N, bytes: r.node.bytes });
  for (const l of used) blocks.push({ blk: l.blk, bytes: l.bytes });
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
           node: r.node.bytes.length, nodeBlk: N, poiHeader: H, countryBlk: C,
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
    const nodeBlk = r.nodeBlk === undefined ? NODE : r.nodeBlk;
    const rootKey = r.nodeBlk === undefined ? 0 : 1;
    const firstLeaf = nodeBlk + 1;
    for (let i = firstLeaf; i < firstLeaf + r.leaves; i++) {
      const res = VM.run(schema, m.blocks[i], 0, { blk: i, limit: 4000000 });
      if (res.why === 'данные кончились' && res.pos === m.blocks[i].length) rep.leavesEnd++;
      rep.poisBack += P.poisOf(schema, m.blocks[i], i).length;
    }
    if (r.nodeBlk !== undefined) {
      // путь прошивки к дереву: корень 0x4a -> заголовок 0x20 -> слой 0x21 -> узел
      const root = ks.get(0).map.get(0);
      const h = root && root.f['4a'];
      rep.poiPath = !!(h && h[0] === r.poiHeader &&
        ks.get(h[0]).els.every((e) => !e.f['3c'] || (e.f['3c'][0] === nodeBlk && e.f['3c'][1] === 0)) &&
        ks.get(nodeBlk).map.get(0).type === 0x21);
      if (r.poiHeader === null) rep.poiPath = 'без заголовка POI';
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
    for (let i = 0; i < pois.length; i += 100) {
      const q = pois[i]; rep.seen++;
      const box = { x0: q.x - 72, y0: q.y - 111, x1: q.x + 72, y1: q.y + 111 };
      if (T.collect(get, nodeBlk, rootKey, box, new Set(), 0).size) rep.hit++;
    }
    if (r.countryBlk !== undefined) {
      rep.addr = A.walk(ks.get);
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
      const byCode = LC.countryByCode([dir], 113, 3);
      rep.emul = { cities: em.cities.length, notCity: em.cities.filter((c) => c.type !== 3).length,
                   byCode: byCode.why, name: byCode.name };
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  rep.bad = rep.keysOk !== rep.blocks || rep.parsedOk !== rep.blocks || rep.leavesEnd !== r.leaves ||
            rep.poisBack !== r.pois || rep.hit !== rep.seen || rep.poiPath === false ||
            (rep.emul && (rep.emul.cities !== r.cities || rep.emul.notCity || rep.emul.byCode !== 'ок')) ||
            (rep.countrySet && (!rep.countrySet.length || rep.countrySet.some((c) => !c.ok) ||
                                rep.tableCount.root !== rep.tableCount.found)) ||
            (rep.addr && ((rep.addr.postcodes || 0) !== (r.postcodes || 0) ||
                          (rep.addr.centres || 0) !== r.cities || (rep.addr.allStreets || 0) !== r.streets)) ||
            (rep.addr && (rep.addr.errors.length > 0 || rep.addr.cities.length !== r.cities ||
                          rep.addr.streets !== r.streets));
  return rep;
}

function report(rep, r, log) {
  log('--- сверка по собранному файлу ---');
  log('ключей по заголовку сошлось: ' + rep.keysOk + ' из ' + rep.blocks + ' блоков');
  log('блоков дочитано машиной до конца: ' + rep.parsedOk + ' из ' + rep.blocks);
  log('листья дочитываются до конца: ' + rep.leavesEnd + ' из ' + r.leaves);
  log('точек прочитано обратно: ' + rep.poisBack + ' из ' + r.pois);
  log('спуск по дереву POI: проверено ' + rep.seen + ', лист найден у ' + rep.hit);
  if (rep.poiPath !== undefined) log('путь корень -> 0x20 -> 0x21 -> узлы: ' + rep.poiPath);
  if (rep.addr) {
    const a = rep.addr;
    log('адреса: корень -> «' + a.countryName.join(', ') + '» -> страна ' + a.code + ' ' + a.iso.join('/') +
        ' -> городов ' + a.cities.length + ' из ' + r.cities + ' -> улиц ' + a.streets + ' из ' + r.streets +
        (a.errors.length ? ', ошибок ' + a.errors.length + ': ' + a.errors.slice(0, 3).join('; ') : ''));
    log('  индексы страны -> 0x04: ' + (a.postcodes || 0) + ' из ' + (r.postcodes || 0) +
        '; индексы в городах -> 0x31: ' + (a.cityPostcodes || 0) + '; точки-центры 0x24: ' + (a.centres || 0) +
        ' из ' + r.cities + '; все улицы страны -> имя в городе: ' + (a.allStreets || 0) + ' из ' + r.streets);
  }
  if (rep.emul) log('путь прошивки (litcity): CYPRUS -> городов ' + rep.emul.cities + ' (не 0x03: ' + rep.emul.notCity +
                    '); FUN_08ccd098(113, язык 3) -> «' + rep.emul.name + '» — ' + rep.emul.byCode);
  if (rep.countrySet) {
    log('набор стран (0x18/7000): ' + rep.countrySet.map((c) => c.code + ' -> (' + c.pos + ')' + (c.ok ? '' : ' НЕ 0x02')).join(', ') +
        '; статистик символов ' + rep.stats + '; записей таблицы: в корне ' + rep.tableCount.root +
        ', подряд с (1,0) ' + rep.tableCount.found);
  }
  log(rep.bad ? 'ЕСТЬ РАСХОЖДЕНИЯ' : 'расхождений нет');
}

module.exports = { build, verify, report, template, factoryParts, CAP, NODE };

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
                                  addrs: require('./litaddr').readAddresses(pbf) });
    opt.factory = ['LIT', 'LIT2', 'LIT3', 'LIT4'].map((d) => path.join(flag('maps', 'maps'), 'pkgdb', d));
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
