'use strict';
// Проверка превращения дорожной сети в тайл. Тесты автономные: ни карта, ни
// таблица ATTRIBUTE из набора не нужны — таблица синтетическая, а собранный
// тайл читается настоящими читателями.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const xr = require('./xacroads');
const xac = require('./xac');
const xv = require('./xacvec');
const xg = require('./xacgraph');

// Таблица ATTRIBUTE: по одному «простому» индексу на каждый FRC.
function attrTable() {
  const a = new Uint32Array(2048);
  // Значение — это описатель: младшие три бита FRC, остальное без разрядов
  // удлинения, иначе запись перестала бы быть четырёхбайтовой.
  for (let frc = 0; frc <= 7; frc++) a[0x100 + frc] = 0x1000 | frc;
  return a;
}

// Дорога из точек, заданных в градусах.
function way(pts, highway) {
  return { type: 'Feature', properties: { highway },
           geometry: { type: 'LineString', coordinates: pts } };
}

// Сетка улиц: w×h перекрёстков с шагом `step` градусов.
function grid(w, h, lon0, lat0, step, highway) {
  const fs = [];
  for (let y = 0; y < h; y++) {
    fs.push(way(Array.from({ length: w }, (_, x) => [lon0 + x * step, lat0 + y * step]), highway));
  }
  for (let x = 0; x < w; x++) {
    fs.push(way(Array.from({ length: h }, (_, y) => [lon0 + x * step, lat0 + y * step]), highway));
  }
  return { type: 'FeatureCollection', features: fs };
}

test('граф: точки в одной единице карты — один узел, петли и повторы отброшены', () => {
  const fc = { type: 'FeatureCollection', features: [
    way([[33.0, 35.0], [33.001, 35.0], [33.002, 35.0]], 'primary'),
    way([[33.002, 35.0], [33.001, 35.0]], 'primary'),          // то же ребро наоборот
    way([[33.0, 35.0], [33.0000001, 35.0]], 'primary'),        // короче единицы карты
  ] };
  const g = xr.graphFromGeoJSON(fc);
  assert.equal(g.nodes.length, 3, 'три разных узла');
  assert.equal(g.edges.length, 2, 'повторное ребро не удвоилось');
  assert.equal(g.dups, 1, 'повтор посчитан');
  assert.ok(g.loops >= 1, 'слипшаяся точка посчитана');
});

test('граф: классы фильтруются, а FRC берётся по классу', () => {
  const fc = { type: 'FeatureCollection', features: [
    way([[33.0, 35.0], [33.01, 35.0]], 'motorway'),
    way([[33.0, 35.01], [33.01, 35.01]], 'residential'),
  ] };
  const all = xr.graphFromGeoJSON(fc);
  assert.equal(all.edges.length, 2);
  assert.deepEqual(all.edges.map((e) => e.frc).sort(), [0, 4], 'жилая улица — уровень 4, как у завода');

  const only = xr.graphFromGeoJSON(fc, { classes: ['motorway'] });
  assert.equal(only.edges.length, 1, 'взят только заказанный класс');
  assert.equal(only.edges[0].frc, 0);
});

test('индексы атрибутов: на каждый FRC берётся «простой» индекс', () => {
  const idx = xr.attrByFrc(attrTable());
  for (let frc = 0; frc <= 7; frc++) {
    assert.equal(idx[frc], 0x100 + frc, 'FRC ' + frc);
  }
});

test('нарезка: в группе не больше заданного числа узлов', () => {
  const nodes = [];
  for (let i = 0; i < 100; i++) nodes.push({ x: i * 10, y: (i % 7) * 10 });
  const groups = xr.splitNodes(nodes, nodes.map((_, i) => i), 12);
  assert.ok(groups.length >= 9, 'сеть поделена');
  for (const g of groups) assert.ok(g.length <= 12, 'группа ' + g.length + ' узлов');
  const seen = new Set(groups.flat());
  assert.equal(seen.size, nodes.length, 'ни один узел не потерян и не задвоен');
});

test('тайл из дорог: все рёбра читаются обратно теми же координатами', () => {
  const fc = grid(6, 5, 33.0, 35.0, 0.002, 'primary');
  const r = xr.convert(fc, { attr: attrTable(), code: 'CY00', country: 113 });

  assert.equal(r.check.found, r.check.want, 'нашлись все рёбра графа');
  assert.equal(r.check.want, r.graph.edges.length);
  assert.equal(r.check.unresolved, 0, 'неразобранных ссылок нет');
  assert.equal(r.check.outside, 0, 'все узлы внутри рамки своего блока');
  assert.equal(r.check.sections, true, 'разделы покрывают файл');

  const t = require('./xactile').readTile(r.file);
  assert.equal(t.code, 'CY00');
  assert.equal(t.country, 113);
  assert.equal(t.count, r.built.blocks.length, 'разделов столько же, сколько блоков');
});

test('тайл из дорог: рёбра между блоками сшиты в обе стороны', () => {
  const fc = grid(10, 8, 33.0, 35.0, 0.002, 'primary');
  // маленький потолок узлов заставляет сеть разъехаться по многим блокам
  const r = xr.convert(fc, { attr: attrTable(), maxNodes: 12 });
  assert.ok(r.built.blocks.length > 4, 'блоков много: ' + r.built.blocks.length);
  assert.ok(r.built.cross > 0, 'межблочные рёбра появились: ' + r.built.cross);
  assert.equal(r.check.found, r.check.want, 'и все рёбра всё равно читаются');

  const blocks = xac.sections(r.file).list.filter((s) => s.name === 'VEKTORBLOCK')
    .map((s) => r.file.subarray(s.offset, s.offset + s.total));
  const byId = new Map(blocks.map((b) => [b.readUInt16BE(0x34), b]));

  // У каждой встречной ссылки в другой блок цель — межблочный вектор,
  // указывающий обратно в наш узел. Это и значит «сшито в обе стороны».
  // Встречные ссылки берём из списков узлов: номер в таблице есть только у
  // первой (как у завода), остальные лежат в списке без номера.
  let far = 0;
  for (const b of blocks) {
    const base = b.readUInt16BE(0x36), ox = b.readInt32BE(0x28), oy = b.readInt32BE(0x2c);
    for (const [off, list] of xg.nodeLists(b)) for (const el of list) {
      if (el.tag !== 2) continue;
      const p = el.at, w = b.readUInt16BE(p);
      const me = { coords: { node: xv.koord(b, off, ox, oy) } }, i = 'node';
      far++;
      const t = byId.get(base + (b.readUInt16BE(p + 2) & 0x7fff));
      assert.ok(t, 'блок-цель встречной ссылки найден');
      const ti = xg.entryCoords(t);
      const q = t.readUInt16BE(ti.tab + (w & 0x3fff) * 2) * 2;
      assert.equal(t.readUInt16BE(q) & 0xc000, 0xc000, 'цель — запись вектора');
      assert.equal((t.readUInt16BE(q + 2) >> 14) & 1, 1, 'и она межблочная');
      const back = byId.get(t.readUInt16BE(0x36) + (t.readUInt16BE(q + 4) & 0x7fff));
      assert.equal(back, b, 'она ведёт обратно в наш блок');
      const z = xg.entryCoords(back).coords[t.readUInt16BE(q) & 0x3fff];
      assert.deepEqual([z.x, z.y], [me.coords[i].x, me.coords[i].y], 'и в наш узел');
    }
  }
  assert.equal(far, r.built.cross, 'встречных ссылок столько же, сколько межблочных рёбер');
});

test('тайл из дорог: класс дороги доезжает до записи вектора', () => {
  const fc = { type: 'FeatureCollection', features: [
    way([[33.0, 35.0], [33.004, 35.0]], 'motorway'),
    way([[33.0, 35.002], [33.004, 35.002]], 'residential'),
  ] };
  const attr = attrTable();
  const r = xr.convert(fc, { attr });
  const blocks = xac.sections(r.file).list.filter((s) => s.name === 'VEKTORBLOCK')
    .map((s) => r.file.subarray(s.offset, s.offset + s.total));
  // у blockEdges поле `type` — это индекс в таблице ATTRIBUTE
  const idx = new Set();
  for (const b of blocks) for (const e of xv.blockEdges(b)) idx.add(e.type);
  assert.ok(idx.has(xr.attrByFrc(attr)[0]), 'магистраль записана своим FRC');
  assert.ok(idx.has(xr.attrByFrc(attr)[4]), 'улица — своим');
});

test('пустой набор дорог отвергается не молча', () => {
  assert.throws(() => xr.convert({ type: 'FeatureCollection', features: [] },
    { attr: attrTable() }), /нет ни одной точки/);
});

// ---------------------------------------------------------------------------
// Имена и связь «имя -> дорога».

// Дорога с именем.
function named(pts, highway, props) {
  const f = way(pts, highway);
  Object.assign(f.properties, props);
  return f;
}

test('имена: греческое переводится на латиницу, латинское предпочитается', () => {
  assert.equal(xr.latinize('Λεωφόρος Καρύων'), 'LEOFOROS KARYON');
  assert.equal(xr.latinize('Archi. Makariou III'), 'ARCHI. MAKARIOU III');
  assert.equal(xr.latinize('  Ledra   Street  '), 'LEDRA STREET');
  assert.equal(xr.roadName({ name: 'Λεωφόρος Καρύων', name_en: 'Leoforos Karion' }),
    'LEOFOROS KARION', 'name:en важнее');
  assert.equal(xr.roadName({ name: 'Λεωφόρος Καρύων' }), 'LEOFOROS KARYON');
  assert.equal(xr.roadName({}), null, 'дорога без имени — без имени');
});

test('имена: одинаковые имена сводятся в одно, разные считаются', () => {
  const fc = { type: 'FeatureCollection', features: [
    named([[33.0, 35.0], [33.002, 35.0]], 'primary', { name: 'Ledra Street' }),
    named([[33.002, 35.0], [33.004, 35.0]], 'primary', { name: 'Ledra Street' }),
    named([[33.0, 35.002], [33.002, 35.002]], 'primary', { name: 'Griva Digeni' }),
    way([[33.0, 35.004], [33.002, 35.004]], 'primary'),
  ] };
  const g = xr.graphFromGeoJSON(fc, {});
  assert.deepEqual(g.names, ['LEDRA STREET', 'GRIVA DIGENI']);
  assert.equal(g.named, 3, 'три дороги с именем');
  assert.deepEqual(g.edges.map((e) => e.name), [0, 0, 1, -1]);
});

test('связь «имя -> дорога»: ссылка попадает в запись с теми же концами', () => {
  const fc = { type: 'FeatureCollection', features: [] };
  // сетка, где каждая горизонталь — своя улица
  for (let y = 0; y < 5; y++) {
    fc.features.push(named(
      Array.from({ length: 6 }, (_, x) => [33.0 + x * 0.002, 35.0 + y * 0.002]),
      'primary', { name: 'STREET ' + y }));
  }
  for (let x = 0; x < 6; x++) {
    fc.features.push(way(Array.from({ length: 5 }, (_, y) => [33.0 + x * 0.002, 35.0 + y * 0.002]),
      'primary'));
  }
  const r = xr.convert(fc, { attr: attrTable(), code: 'CY00', country: 113 });
  const n = r.namecheck;
  assert.ok(n.total > 0, 'ссылки вообще есть');
  assert.equal(n.missing, 0, 'у каждого именованного ребра есть место');
  assert.equal(n.hit, n.total, 'каждая ссылка попала в запись-вектор');
  assert.equal(n.coords, n.total, 'концы записи совпали с концами ребра');
});

test('модель ZE-NAMEN: имена отсортированы, списки блоков переставлены с ними', () => {
  const fc = { type: 'FeatureCollection', features: [
    named([[33.0, 35.0], [33.002, 35.0]], 'primary', { name: 'Zeta' }),
    named([[33.002, 35.0], [33.004, 35.0]], 'primary', { name: 'Alpha' }),
  ] };
  const r = xr.convert(fc, { attr: attrTable(), code: 'CY00', country: 113,
                             countryName: 'Cyprus',
                             places: [{ name: 'Lefkosia', lon: 33.0, lat: 35.0 }] });
  assert.deepEqual(r.zen.names, ['ALPHA', 'CYPRUS', 'LEFKOSIA', 'ZETA'], 'по возрастанию');
  assert.equal(r.zen.refs[1], null, 'у страны своей геометрии нет');
  assert.equal(r.zen.refs[2], null, 'у города тоже');
  assert.ok(r.zen.refs[0] && r.zen.refs[3], 'у улиц ссылки есть');

  // дерево: корень — страна, улицы висят на городе
  assert.equal(r.zen.mmi[1].parent, null, 'корень — страна');
  assert.equal(r.zen.mmi[2].parent, 1, 'город под страной');
  assert.equal(r.zen.mmi[0].parent, 2, 'улица под городом');
  assert.ok(r.zen.mmi[0].flags & 0x80, 'улица — лист');
  assert.equal(r.zen.mmi[2].flags & 0x80, 0, 'город не лист');

  // модель -> раздел -> обратно
  const zen = require('./zenamen');
  const sec = zen.buildSection({ names: r.zen.names, refs: r.zen.refs,
                                 blocks: r.zen.blocks, version: 2, label: 'ZE-NAMEN' });
  const back = zen.allNames(sec), gr = zen.refGroups(sec);
  assert.deepEqual(back.names, r.zen.names);
  assert.equal(back.end, back.len, 'поток съеден ровно');
  assert.equal(gr.err, null);
  assert.equal(gr.end, gr.len, 'область ссылок съедена ровно');
  assert.equal(gr.groups.length, r.zen.blocks, 'группа на каждый блок');
  const seen = new Map();
  for (const g of gr.groups) for (const nm of g.names) seen.set(nm.nid + '@' + g.block, nm.recs.join(','));
  let pairs = 0;
  r.zen.refs.forEach((list, nid) => { if (!list) return;
    for (const g of list) { pairs++; assert.equal(seen.get(nid + '@' + g.block), g.recs.join(',')); } });
  assert.ok(pairs > 0);
});

test('дерево: одно имя в двух городах даёт две записи', () => {
  const fc = { type: 'FeatureCollection', features: [
    named([[33.0, 35.0], [33.002, 35.0]], 'primary', { name: 'Main Street' }),
    named([[33.2, 35.2], [33.202, 35.2]], 'primary', { name: 'Main Street' }),
  ] };
  const r = xr.convert(fc, { attr: attrTable(), code: 'CY00', country: 113,
    countryName: 'Cyprus',
    places: [{ name: 'West', lon: 33.0, lat: 35.0 }, { name: 'East', lon: 33.2, lat: 35.2 }] });
  const at = r.zen.names.map((n, i) => [n, r.zen.mmi[i].parent]);
  const streets = at.filter(([n]) => n === 'MAIN STREET');
  assert.equal(streets.length, 2, 'две записи на одно имя');
  const cities = streets.map(([, p]) => r.zen.names[p]).sort();
  assert.deepEqual(cities, ['EAST', 'WEST']);
});

test('тайл: разделы имён встают после блоков и в жёстком порядке', () => {
  const fc = grid(6, 5, 33.0, 35.0, 0.002, 'primary');
  fc.features.forEach((f, i) => { f.properties.name = 'Street ' + i; });
  const r = xr.convert(fc, { attr: attrTable(), code: 'CY00', country: 113,
    countryName: 'Cyprus', places: [{ name: 'Lefkosia', lon: 33.004, lat: 35.004 }] });
  const list = xac.sections(r.file).list.map((s) => s.name);
  assert.equal(xac.sections(r.file).complete, true, 'разделы покрывают файл');
  const iZe = list.indexOf('ZE-NAMEN'), iMmi = list.indexOf('ZE-NAMEN-MMI');
  const iLast = list.lastIndexOf('VEKTORBLOCK');
  assert.ok(iLast < iZe && iZe < iMmi, 'ZE-NAMEN после блоков, MMI после него');

  const zen = require('./zenamen');
  const ze = xac.sections(r.file).list[iZe];
  const d = r.file.subarray(ze.offset, ze.offset + ze.total);
  const back = zen.allNames(d), gr = zen.refGroups(d);
  assert.deepEqual(back.names, r.zen.names);
  assert.equal(back.end, back.len, 'поток съеден ровно');
  assert.equal(gr.err, null);
  assert.equal(gr.end, gr.len, 'область ссылок съедена ровно');

  const mm = xac.sections(r.file).list[iMmi];
  const m = r.file.subarray(mm.offset, mm.offset + mm.total);
  const rows = zen.mmiTree(m);
  assert.equal(rows.length, r.zen.names.length, 'записей столько же, сколько имён');
  assert.equal(rows.filter((x) => x.parent === null).length, 1, 'корень один');
});

// ---------------------------------------------------------------------------
// Номера домов.

test('номер дома: диапазон, буквенная приставка, косая черта', () => {
  assert.deepEqual(xr.houseNumber('5'), [5, 5]);
  assert.deepEqual(xr.houseNumber('5A'), [5, 5], 'приставка теряется');
  assert.deepEqual(xr.houseNumber(' 34-36 '), [34, 36], 'диапазон');
  assert.deepEqual(xr.houseNumber('7–9'), [7, 9], 'длинное тире тоже');
  assert.deepEqual(xr.houseNumber('12/3'), [12, 12], 'косая черта — не диапазон');
  assert.equal(xr.houseNumber('A'), null, 'без цифр — никак');
});

test('расстояние до отрезка считается с зажимом на концах', () => {
  assert.equal(xr.segDist2(0, 5, 0, 0, 10, 0), 25, 'точка над серединой');
  assert.equal(xr.segDist2(-3, 4, 0, 0, 10, 0), 25, 'за левым концом');
  assert.equal(xr.segDist2(13, 4, 0, 0, 10, 0), 25, 'за правым концом');
  assert.equal(xr.segDist2(5, 0, 0, 0, 10, 0), 0, 'на отрезке');
});

test('дом садится на ближайший отрезок своей улицы', () => {
  // две параллельные улицы с разными именами, дом стоит у южной
  const fc = { type: 'FeatureCollection', features: [
    named([[33.000, 35.000], [33.010, 35.000]], 'primary',
      { name: 'Notia', name_en: 'South Street' }),
    named([[33.000, 35.010], [33.010, 35.010]], 'primary',
      { name: 'Voreia', name_en: 'North Street' }),
  ] };
  const r = xr.convert(fc, { attr: attrTable(), code: 'CY00', country: 113,
    countryName: 'Cyprus', places: [{ name: 'Town', lon: 33.005, lat: 35.005 }],
    houses: [
      { lon: 33.004, lat: 35.0001, number: '7', street: 'Notia' },
      { lon: 33.006, lat: 35.0099, number: '10-12', street: 'Voreia' },
      { lon: 33.004, lat: 35.000, number: '1', street: 'Nowhere' },
    ] });
  assert.equal(r.zen.houseStat['село на отрезок'], 2, 'два дома из трёх');
  assert.equal(r.zen.houseStat['улица не найдена'], 1, 'улицы Nowhere нет');

  // раздел в тайле, и ссылки домов лежат в области ссылок своей же улицы
  const list = xac.sections(r.file).list;
  const hs = list.find((s) => s.name === 'HAUSNUMMERN');
  assert.ok(hs, 'раздел HAUSNUMMERN на месте');
  assert.ok(list.indexOf(list.find((s) => s.name === 'ZE-NAMEN-MMI')) < list.indexOf(hs),
    'после ZE-NAMEN-MMI');
  const hn = require('./hausnr'), zen = require('./zenamen');
  const d = r.file.subarray(hs.offset, hs.offset + hs.total), h = hn.header(d);
  const ze = list.find((s) => s.name === 'ZE-NAMEN');
  const zd = r.file.subarray(ze.offset, ze.offset + ze.total);
  const gr = zen.refGroups(zd), names = zen.allNames(zd).names;
  const own = new Map();
  for (const g of gr.groups) {
    for (const x of g.names) {
      if (!own.has(x.nid)) own.set(x.nid, new Set());
      for (const rec of x.recs) own.get(x.nid).add(g.block + ':' + rec);
    }
  }
  let found = 0, total = 0;
  const seen = [];
  for (let k = 0; k + 1 < h.count; k++) {
    const a = hn.at(d, h, k), b = hn.at(d, h, k + 1);
    if (a === b) continue;
    const row = hn.housesOf(d, k, h);
    assert.equal(row.end, h.data.off + b, 'поток имени съеден ровно');
    for (const x of row.rows) {
      seen.push([names[k], x.left]);
      for (const v of x.refs) { total++; if (own.get(k).has(v.block + ':' + v.rec)) found++; }
    }
  }
  assert.equal(total, 2, 'две ссылки');
  assert.equal(found, 2, 'обе лежат в области ссылок своей улицы');
  assert.deepEqual(seen.sort(), [['NORTH STREET', [10, 12]], ['SOUTH STREET', [7, 7]]]);
});

// ---------------------------------------------------------------------------
// Имена для ведения по маршруту.

// Таблица ATTRIBUTE с двумя семействами: простые записи и «именующие»
// (бит 5 байта 0 описателя — за записью идёт список имён ведения).
function attrTableNamed() {
  const a = new Uint32Array(2048);
  for (let frc = 0; frc <= 7; frc++) {
    a[0x100 + frc] = 0x1000 | frc;                  // простая, хвоста нет
    a[0x200 + frc] = 0x20000000 | 0x1000 | frc;     // с именем ведения
  }
  return a;
}
const zfTok = (() => { const t = [Buffer.from([2])]; t.stamp = 0; return t; })();

test('индексы атрибутов: «именующие» отбираются по биту 5', () => {
  const a = attrTableNamed();
  const plain = xr.attrByFrc(a), named = xr.attrByFrcNamed(a);
  assert.equal(plain[2], 0x102, 'простой индекс');
  assert.equal(named[2], 0x202, 'именующий индекс');
  for (const frc of [0, 1, 2, 3, 4, 6, 7]) {
    assert.ok((a[named[frc]] & 0x20000000) !== 0, 'FRC ' + frc + ': бит 5 стоит');
    assert.equal(a[plain[frc]] & 0x20000000, 0, 'FRC ' + frc + ': у простого его нет');
  }
});

test('хвост записи: имена пишутся по два байта, бит 6 — продолжение, бит 15 — запись не кончилась', () => {
  const xw = require('./xacwrite');
  const one = xw.encodeNames([5]);
  assert.deepEqual([...one], [0x00, 0x05], 'одно имя, продолжения нет');
  const two = xw.encodeNames([0x1234, 7]);
  assert.deepEqual([...two], [0xc0 | 0x12, 0x34, 0x00, 0x07], 'у первого биты 6 и 15');
  assert.throws(() => xw.encodeNames([0x3fff]), /вне 14 бит/);
});

test('тайл: имя ведения доходит до записи и раскрывается обратно', () => {
  const fc = { type: 'FeatureCollection', features: [] };
  for (let y = 0; y < 4; y++) {
    fc.features.push(named(
      Array.from({ length: 5 }, (_, x) => [33.0 + x * 0.002, 35.0 + y * 0.002]),
      'primary', { name: 'Odos ' + y }));
  }
  fc.features.push(way([[33.0, 35.008], [33.008, 35.008]], 'primary'));   // без имени
  const r = xr.convert(fc, { attr: attrTableNamed(), tok: zfTok,
    code: 'CY00', country: 113, countryName: 'Cyprus',
    places: [{ name: 'Town', lon: 33.004, lat: 35.004 }] });

  const z = r.zfcheck;
  assert.ok(z, 'сверка имён ведения выполнилась');
  assert.equal(z.names, 4, 'в ZF-NAMEN четыре имени');
  assert.equal(z.total, z.withTail, 'у каждого именованного ребра есть хвост');
  assert.equal(z.sameText, z.total, 'имя раскрывается в то же самое');
  assert.equal(z.outOfRange, 0);

  const list = xac.sections(r.file).list;
  const zs = list.find((x) => x.name === 'ZF-NAMEN');
  assert.notEqual(zs.total, 112, 'раздел настоящий, а не заглушка');
  assert.equal(list.indexOf(zs), 1, 'ZF-NAMEN идёт сразу за шапкой');
  const zfn = require('./zfnamen');
  const back = zfn.readSection(r.file.subarray(zs.offset, zs.offset + zs.total), zfTok);
  assert.equal(back.err, null);
  assert.equal(back.names.length, back.count, 'поток даёт столько имён, сколько в шапке');
  assert.deepEqual(back.names.map((x) => x.text), ['ODOS 0', 'ODOS 1', 'ODOS 2', 'ODOS 3']);
});

test('без имён ведения тайл собирается по-прежнему', () => {
  const fc = grid(4, 4, 33.0, 35.0, 0.002, 'primary');
  const r = xr.convert(fc, { attr: attrTableNamed(), code: 'CY00', country: 113 });
  assert.equal(r.zfcheck, null, 'сверять нечего');
  const zs = xac.sections(r.file).list.find((x) => x.name === 'ZF-NAMEN');
  assert.equal(zs.total, 112, 'заглушка на месте');
  assert.equal(r.check.found, r.check.want, 'рёбра целы');
});

// ---------------------------------------------------------------------------
// Одностороннее движение: биты 3…4 описателя, 1 — только A→B, где A — узел
// записи вектора (см. docs/formats/xac.md, «Одностороннее движение»).

function attrTableDir() {
  const a = new Uint32Array(2048);
  for (let frc = 0; frc <= 7; frc++) {
    a[0x100 + frc] = 0x1000 | frc;              // двусторонняя
    a[0x180 + frc] = 0x1000 | 0x08 | frc;       // только A→B
    a[0x1c0 + frc] = 0x1000 | 0x10 | frc;       // только B→A — нам не нужна
  }
  return a;
}

// Ребро графа -> { from, to, dir } по прочитанному обратно тайлу.
function edgesWithDir(file, attr) {
  const xg = require('./xacgraph'), xrec = require('./xacrec');
  const out = [];
  for (const s of xac.sections(file).list.filter((x) => x.name === 'VEKTORBLOCK')) {
    const b = file.subarray(s.offset, s.offset + s.total);
    const g = xg.graphOf(b), tab = b.readUInt32BE(0x6c);
    g.nodes.forEach((n) => {
      for (const en of n.entries) {
        if (en.to === undefined || en.back !== undefined) continue;
        const r = xrec.record(b, b.readUInt16BE(tab + en.old * 2) * 2, attr, () => {});
        out.push({ from: [n.x, n.y], to: [g.nodes[en.to].x, g.nodes[en.to].y], dir: (r.flags >>> 3) & 3 });
      }
    });
  }
  return out;
}

test('одностороннее: пара индексов отличается только направлением', () => {
  const a = attrTableDir();
  const t = xr.attrByFrc(a);
  for (let frc = 0; frc <= 7; frc++) {
    assert.equal(t[frc], 0x100 + frc);
    assert.equal(t.one[frc], 0x180 + frc, 'FRC ' + frc + ': значение 1, а не 2');
    assert.equal(t.inexact[frc], undefined);
  }
  assert.deepEqual(Object.keys(t).map(Number), [0, 1, 2, 3, 4, 5, 6, 7], 'таблица — по-прежнему карта FRC');
});

test('одностороннее: по оцифровке, обратное и двустороннее читаются обратно верно', () => {
  const attr = attrTableDir();
  const LON = 72000, LAT = 40000000 / 360, P = (lon, lat) => [Math.round(lon * LON), Math.round(lat * LAT)];
  const feat = (pts, ow) => ({ type: 'Feature', properties: { highway: 'primary', oneway: ow },
                               geometry: { type: 'LineString', coordinates: pts } });
  const fc = { type: 'FeatureCollection', features: [
    feat([[33.0, 35.0], [33.004, 35.0]], 1),        // по оцифровке
    feat([[33.0, 35.01], [33.004, 35.01]], -1),     // против
    feat([[33.0, 35.02], [33.004, 35.02]], 0),      // в обе стороны
  ] };
  const r = xr.convert(fc, { attr, guidance: false, names: false });
  assert.equal(r.built.oneway, 2);
  assert.equal(r.built.owLost, 0);
  const es = edgesWithDir(r.file, attr);
  const at = (lat) => es.find((e) => e.from[1] === P(0, lat)[1]);
  const fwd = at(35.0), rev = at(35.01), two = at(35.02);
  assert.deepEqual([fwd.from, fwd.to, fwd.dir], [P(33.0, 35.0), P(33.004, 35.0), 1], 'A — первая точка, проезд A→B');
  assert.deepEqual([rev.from, rev.to, rev.dir], [P(33.004, 35.01), P(33.0, 35.01), 1], 'oneway=-1: вектор у последней точки');
  assert.equal(two.dir, 0, 'двустороннее не тронуто');
});

test('одностороннее: теги OSM -> признак oneway', () => {
  const { onewayOf } = require('./osm2geo');
  assert.equal(onewayOf({ highway: 'primary', oneway: 'yes' }), 1);
  assert.equal(onewayOf({ highway: 'primary', oneway: '-1' }), -1);
  assert.equal(onewayOf({ highway: 'primary' }), 0);
  assert.equal(onewayOf({ highway: 'motorway' }), 1, 'автомагистраль — подразумевается');
  assert.equal(onewayOf({ highway: 'motorway_link', oneway: 'no' }), 0, 'явное «no» главнее');
  assert.equal(onewayOf({ highway: 'primary', junction: 'roundabout' }), 1, 'кольцо');
  assert.equal(onewayOf({ highway: 'trunk', junction: 'circular' }), 1);
  assert.equal(onewayOf({ highway: 'primary', oneway: 'reversible' }), 0);
});

// ---------------------------------------------------------------------------
// Скорости: класс — биты 5…7 описателя (ETA-KOSTEN[категория][уровень][класс]).

test('скорость: ограничение -> класс', () => {
  const c = xr.speedClass;
  assert.deepEqual([null, 140, 130, 110, 100, 80, 65, 50, 30, 10].map(c), [0, 0, 1, 1, 2, 3, 4, 5, 6, 7]);
});

test('скорость: maxspeed из тегов OSM', () => {
  const { maxspeedOf } = require('./osm2geo');
  assert.equal(maxspeedOf({ maxspeed: '50' }), 50);
  assert.equal(maxspeedOf({ maxspeed: '30 mph' }), 48);
  assert.equal(maxspeedOf({ 'maxspeed:type': 'CY:urban' }), 50);
  assert.equal(maxspeedOf({ 'maxspeed:type': 'CY:rural' }), 80);
  assert.equal(maxspeedOf({ 'maxspeed:forward': '60', 'maxspeed:backward': '40' }), 40);
  assert.equal(maxspeedOf({ maxspeed: 'none' }), null);
  assert.equal(maxspeedOf({}), null);
});

test('скорость: умолчания Кипра — магистраль 100, вне города 80, в городе 50', () => {
  const f = (hw, ms) => ({ properties: { highway: hw, maxspeed: ms || null },
                          geometry: { coordinates: [[33, 35], [33.001, 35]] } });
  assert.equal(xr.speedFor(f('primary', 65), 'primary'), 65, 'OSM главнее');
  assert.equal(xr.speedFor(f('motorway'), 'motorway'), 100);
  assert.equal(xr.speedFor(f('primary'), 'primary', () => false), 80);
  assert.equal(xr.speedFor(f('primary'), 'primary', () => true), 50);
  assert.equal(xr.speedFor(f('residential'), 'residential', () => false), 50, 'жилая улица — всегда город');
});

test('скорость: индекс подбирается с нужным классом, направление сохраняется', () => {
  const a = new Uint32Array(2048);
  let i = 0x100;
  for (let cls = 0; cls < 8; cls++) {
    a[i++] = 0x1000 | (cls << 5) | 2;          // уровень 2, в обе стороны
    a[i++] = 0x1000 | (cls << 5) | 0x08 | 2;   // уровень 2, только A→B
  }
  const t = xr.attrByFrc(a);
  for (const [kmh, cls] of [[100, 2], [80, 3], [50, 5], [30, 6]]) {
    for (const dir of [0, 1]) {
      const v = a[t.speed(2, dir, xr.speedClass(kmh))];
      assert.equal((v >>> 5) & 7, cls, kmh + ' км/ч');
      assert.equal((v >>> 3) & 3, dir);
      assert.equal(v & 7, 2);
    }
  }
  assert.deepEqual(t.speed.inexact, {});
});

// ---------------------------------------------------------------------------
// Запреты поворотов: байты за длинной координатой узла, (в << 4) | из.

function crossJunction() {
  // перекрёсток в (33, 35): четыре линии OSM с номерами 1…4, концами в центре
  const c = [33, 35], d = 0.001;
  const w = (id, to) => ({ type: 'Feature', properties: { id, highway: 'residential' },
                           geometry: { type: 'LineString', coordinates: [to, c] } });
  return { type: 'FeatureCollection', features: [
    w(1, [33, 35 - d]), w(2, [33 + d, 35]), w(3, [33, 35 + d]), w(4, [33 - d, 35]),
  ] };
}
const VIA = 99;
const coordOf = (id) => (id === VIA ? [33, 35] : null);
const rel = (kind, from, to) => ({ id: 1, tags: { type: 'restriction', restriction: kind },
  members: [{ ref: from, type: 1, role: 'from' }, { ref: VIA, type: 0, role: 'via' },
            { ref: to, type: 1, role: 'to' }] });

// Запреты, прочитанные обратно из блока, как пары «линия OSM -> линия OSM».
function readBans(graph, built) {
  const xg = require('./xacgraph');
  const out = [];
  for (const b of built.blocks) {
    const g = xg.graphOf(b);
    for (const n of g.nodes) {
      const ts = xg.nodeTurns(b, n.off);
      if (!ts.length) continue;
      // рукав -> линия: по координате дальнего конца
      const far = n.arms.map((en) => {
        const m = g.nodes[en.to !== undefined ? en.to : g.entryNode[en.back]];
        const e = graph.edges.find((x) => [x.a, x.b].some((k) => graph.nodes[k].x === m.x && graph.nodes[k].y === m.y));
        return e.wid;
      });
      for (const t of ts) out.push(far[t.from] + '->' + far[t.to]);
    }
  }
  return out.sort();
}

test('запрет поворота: no_left_turn читается обратно той же парой', () => {
  const g = xr.graphFromGeoJSON(crossJunction());
  const tb = xr.turnBans(g, [rel('no_left_turn', 1, 4)], coordOf);
  assert.equal(tb.stat.mapped, 1);
  const built = xr.buildBlocks(g, { attrIdx: xr.attrByFrc(attrTable()), bans: tb.bans });
  assert.equal(built.turns, 1);
  assert.deepEqual(readBans(g, built), ['1->4']);
});

test('запрет поворота: only_straight_on разворачивается в запреты прочих съездов', () => {
  const g = xr.graphFromGeoJSON(crossJunction());
  const tb = xr.turnBans(g, [rel('only_straight_on', 1, 3)], coordOf);
  const built = xr.buildBlocks(g, { attrIdx: xr.attrByFrc(attrTable()), bans: tb.bans });
  assert.deepEqual(readBans(g, built), ['1->2', '1->4']);
});

test('запрет поворота: разворот в то же ребро и запрет через линию не пишутся', () => {
  const g = xr.graphFromGeoJSON(crossJunction());
  const viaWay = { id: 2, tags: { type: 'restriction', restriction: 'no_left_turn' },
    members: [{ ref: 1, type: 1, role: 'from' }, { ref: 2, type: 1, role: 'via' }, { ref: 3, type: 1, role: 'to' }] };
  const tb = xr.turnBans(g, [rel('no_u_turn', 1, 1), viaWay], coordOf);
  assert.equal(tb.stat.uturn_same, 1);
  assert.equal(tb.stat.via_way, 1);
  assert.equal(tb.bans.size, 0);
});

test('запрет поворота: байт узла — старший полубайт «куда», младший «откуда»', () => {
  const xw = require('./xacwrite');
  assert.deepEqual([...xw.encodeTurns([{ from: 2, to: 0 }], 3, 0)], [0x02, 0xff]);
  assert.deepEqual([...xw.encodeTurns([{ from: 1, to: 2 }, { from: 0, to: 1 }], 3, 0)], [0x21, 0x10]);
  assert.throws(() => xw.encodeTurns([{ from: 3, to: 0 }], 3, 0), /вне рукавов/);
});
