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
  assert.deepEqual(all.edges.map((e) => e.frc).sort(), [0, 6]);

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
  let far = 0;
  for (const b of blocks) {
    const tab = b.readUInt32BE(0x6c), cnt = b.readUInt16BE(0x70), base = b.readUInt16BE(0x36);
    const me = xg.entryCoords(b);
    for (let i = 1; i < cnt; i++) {
      const p = b.readUInt16BE(tab + i * 2) * 2;
      if (!p || p + 4 > b.length) continue;
      const w = b.readUInt16BE(p);
      if ((w & 0xc000) !== 0x8000) continue;
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
  assert.ok(idx.has(xr.attrByFrc(attr)[6]), 'улица — своим');
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
