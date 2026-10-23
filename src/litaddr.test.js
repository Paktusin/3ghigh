'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const A = require('./litaddr');
const CL = require('./cyplit');

const LIT = 'maps/pkgdb/LIT/EJ211Ga_L1.db';
const FACTORY = ['LIT', 'LIT2', 'LIT3', 'LIT4'].map((d) => path.join('maps/pkgdb', d));
const haveMaps = fs.existsSync(LIT) && FACTORY.every((d) => fs.existsSync(d));

// Ключи: структура — K, виток i — K + 1 + i; список из n имён съедает n + 1.
test('раздача ключей: список из трёх имён занимает четыре ключа', () => {
  const blocks = [{ blk: 7, origin: { x: 0, y: 0 }, width: 24, records: [
    A.list('a', [{ name: 'A', target: null }, { name: 'B', target: null }, { name: 'C', target: null }],
           { direct: true, owner: null }),
    A.street('s', { center: [1, 1] }),
  ] }];
  const pos = A.layout(blocks);
  assert.deepEqual(pos.get('a'), [7, 0]);
  assert.deepEqual(pos.get('a#0'), [7, 1]);
  assert.deepEqual(pos.get('a#2'), [7, 3]);
  assert.deepEqual(pos.get('s'), [7, 4]);
  assert.equal(blocks[0].count, 5);
});

test('имя: байт приставки и длины, приставка от предыдущего имени', () => {
  const r = A.list('l', [{ name: 'LIMASSOL', target: null }, { name: 'LIMNI', target: null }],
                   { direct: true, owner: null });
  const t = r.tokens();
  assert.equal(t[0].u8, 0xd1, 'бит 0 — список висит прямо на объекте');
  assert.equal(t[1].u8, 2, 'без владельца, два имени');
  assert.equal(t[2].u8, 8);                              // приставка 0, длина 8
  assert.equal(t[5].u8, (3 << 5) | 2);                   // LIM + NI
  assert.equal(t[6].raw.toString(), 'NI');
});

test('больше 50 имён: индекс по первой букве и списки не длиннее 50', () => {
  const items = [];
  for (let i = 0; i < 130; i++) items.push({ name: String.fromCharCode(65 + (i % 5)) + 'X' + String(i).padStart(3, '0') });
  const r = A.names('t', items, 'owner');
  const idx = r.records[0];
  assert.equal(idx.sym, 't:idx');
  assert.equal(idx.n, 5, 'по ветви на букву');
  for (const rec of r.records.slice(1)) {
    assert.ok(rec.n <= A.LIST_MAX);
    assert.equal(rec.tokens()[0].u8, 0xd0, 'списки под индексом — бит 0 сброшен');
  }
  assert.equal(r.records.slice(1).reduce((s, x) => s + x.n, 0), 130);
});

test('не больше 50 имён: список прямо на объекте, без индекса', () => {
  const r = A.names('t', [{ name: 'B' }, { name: 'A' }], 'owner');
  assert.equal(r.records.length, 1);
  assert.equal(r.head, 't:l0');
  assert.equal(r.last, 't:l0#1');
});

// Синтетика с обоими путями: страна с индексом городов (60 > 50), город с
// индексом улиц (120) и город с тремя улицами. Читаем обратно грамматикой
// заводского TTD и обходим, как ввод цели.
function model() {
  const places = [], streets = [];
  for (let i = 0; i < 60; i++) {
    places.push({ name: String.fromCharCode(65 + (i % 7)) + 'TOWN ' + i, x: 2340000 + i * 900, y: 3860000 + (i % 9) * 700 });
  }
  for (let j = 0; j < 120; j++) {
    const x = 2340000 + j * 10, y = 3860000 + j * 7;
    streets.push({ name: String.fromCharCode(65 + (j % 9)) + ' STREET ' + j, place: 0, pts: [[x, y], [x + 50, y + 30]] });
  }
  for (let j = 0; j < 3; j++) streets.push({ name: 'ROAD ' + j, place: 5, pts: [[2344500, 3863500], [2344600, 3863600]] });
  // то же имя в другом городе: во «всех улицах» страны — одно имя -> 0x10
  streets.push({ name: 'ROAD 0', place: 7, pts: [[2346300, 3860700], [2346400, 3860800]] });
  // дома: как TRIQ DESAIN у Мальты (1, чётные 8…18) и улица с 40 номерами
  // через три (больше 15 значений — счёт отдельным числом)
  streets[0].houses = new Set([1, 8, 10, 12, 14, 16, 18]);
  streets[120].houses = new Set(Array.from({ length: 40 }, (_, i) => 1 + i * 3).concat([500, 501, 502]));
  // индексы: 1010 — два города (0 и 5), три улицы; 2020 — одна улица города 0;
  // 3030 — без наших улиц, в справочник не идёт
  const postcodes = [
    { code: '1010', pts: [[2340100, 3860100], [2344550, 3863550]], cities: [0, 5], streets: [0, 1, 120] },
    { code: '2020', pts: [[2340300, 3860200]], cities: [0], streets: [7] },
    { code: '3030', pts: [[2341000, 3861000]], cities: [3], streets: [] },
  ];
  return { code: 113, iso2: 'CY', iso3: 'CYP', places, streets, postcodes };
}

const pois = (n) => Array.from({ length: n }, (_, i) => ({
  x: 2318400 + (i % 30) * 370, y: 3833333 + Math.floor(i / 30) * 410, name: 'POI ' + i, cat: 56,
}));

test('справочник читается обратно: страна -> 60 городов -> 124 улицы', { skip: !haveMaps }, () => {
  // 260 точек с одним именем: узел 0x33 [16 -> 0x34], три записи по <= 100
  const ps = pois(300).map((q, i) => (i < 260 ? Object.assign(q, { name: 'PARKING' }) : q));
  const r = CL.build(ps, { template: CL.template(LIT), addr: model(), cap: 1500 });
  const rep = CL.verify(r.buf, r, ps);
  assert.equal(rep.keysOk, rep.blocks, 'число ключей совпало с заголовком у каждого блока');
  assert.equal(rep.parsedOk, rep.blocks, 'каждый блок дочитан до конца');
  assert.equal(rep.addr.code, 113);
  assert.deepEqual(rep.addr.iso, ['CY', 'CYP']);
  assert.equal(rep.addr.cities.length, 60);
  assert.equal(rep.addr.streets, 124);
  assert.deepEqual(rep.addr.errors, []);
  assert.equal(rep.addr.postcodes, 2, 'индексы с нашими улицами -> 0x04');
  assert.equal(rep.addr.cityPostcodes, 3, '1010 в двух городах и 2020 -> 0x31');
  assert.equal(rep.addr.centres, 60, 'у каждого города точка-центр');
  assert.equal(rep.addr.allStreets, 124, 'все улицы страны ведут на имя в городе');
  assert.equal(rep.addr.multiStreets, 1, 'ROAD 0 в двух городах — одно имя -> 0x10');
  assert.equal(rep.addr.multiPostcodes, 1, 'у 0x10 список индексов: 1010 -> виток ROAD 0');
  assert.equal(rep.poiSearch.multiNames, 1, 'PARKING -> 0x33/16 -> 0x34');
  assert.equal(rep.poiSearch.multiPois, 260, 'все точки имени найдены');
  assert.equal(rep.poiSearch.pois, 300);
  assert.equal(rep.hit, rep.seen, 'дерево POI с заголовком слоя находится от ключа 1');
  assert.deepEqual([rep.houses.streets, rep.houses.reached, rep.houses.nums, rep.houses.ok, rep.houses.extra],
                   [2, 2, 50, 50, 0], 'дома: улицы достижимы, номера приняты, лишних нет');
  assert.ok(!rep.bad);
});

// Значения 0x203 — как у завода: TRIQ DESAIN (Мальта 93227:4973) — 4 17 5.
test('дома: короткая форма 0x203 как у завода', () => {
  assert.deepEqual(A.houseValues(new Set([1, 8, 10, 12, 14, 16, 18])), [4, 17, 5]);
  assert.deepEqual(A.houseValues(new Set([4, 5, 48])), [19, 1, 192]);       // TRIQ IL-KONSERVATORJU
  assert.deepEqual(A.houseValues(new Set([15, 91, 93, 95])), [60, 182, 2]); // вид 2: нечётные
});

test('с заводскими частями: таблицы, заголовок POI и языки корня', { skip: !haveMaps }, () => {
  const r = CL.build(pois(300), { template: CL.template(LIT), addr: model(), factory: FACTORY, cap: 1500 });
  assert.equal(r.poiHeader, 31);
  // слои как у завода: 10 деревьев, заправки (тип 56) — в слое 4 (порог 49 000)
  assert.equal(r.layers.length, 10);
  assert.equal(r.layers[4].count, 300);
  assert.ok(r.layers.filter((l) => l.idx !== 4).every((l) => l.count === 0 && !l.leaves.length));
  const rep = CL.verify(r.buf, r, pois(300));
  assert.equal(rep.poiPath, true, 'корень 0x4a -> 0x20 -> 0x21');
  assert.equal(rep.addr.cities.length, 60);
  assert.ok(!rep.bad);
});

// Страна по положению машины: HMI берёт имя из XAC на языке интерфейса
// («КИПР» по-русски) и ищет его в LIT по имени. Названия — из заводского .xah.
test('названия страны из XAC: «КИПР» ведёт к стране, у каждого языка своё имя', { skip: !haveMaps }, () => {
  const xah = CL.factoryXah('maps');
  const xn = require('./xac').countryNames(xah, 113);
  assert.equal(xn[26], 'КИПР');
  assert.equal(xn[1], 'ZYPERN');
  const r = CL.build(pois(300), { template: CL.template(LIT), addr: model(), factory: FACTORY, cap: 1500, xah });
  const rep = CL.verify(r.buf, r, pois(300));
  assert.ok(rep.emul.byName.includes('КИПР'));
  assert.deepEqual(rep.emul.nameBad, []);
  assert.ok(!rep.bad);
});

// Позиция в записях набора стран: как у заводской Албании, 00 95 20 00 = (65685, 0).
test('позиция страны в 4 байтах: старшие биты блока над ключом', () => {
  assert.equal(A.pos4(65685, 0).toString('hex'), '00952000');
  assert.equal(A.pos4(31, 0).toString('hex'), '001f0000');
});

test('запись набора стран и статистика символов', () => {
  const rec = A.countryRecord({ blk: 97, code: 113, f3a: 2, lang: 5, car: 'CY', cc: 'CY', iso2: 'CY',
                                iso3: 'CYP', name: 'CYPRUS', center: [2403000, 3909000],
                                min: [2333757, 3849579], max: [2475188, 3955269], phone: '357' });
  assert.equal(rec.length, 216);
  assert.equal(rec.readUInt16BE(4), 113);
  assert.equal(rec.toString('latin1', 24, 27), 'CYP');
  assert.equal(rec.toString('latin1', 32, 38), 'CYPRUS');
  assert.equal(rec.readInt32BE(104), 2403000);
  assert.equal(rec.toString('latin1', 208, 211), '357');
  const st = A.spellStats(97, ['AB', 'BA ']);
  assert.equal(st.readUInt16BE(4), 3);                       // ' ', 'A', 'B'
  assert.deepEqual([st.readUInt16BE(6), st.readUInt32BE(8)], [0x20, 1]);
  assert.deepEqual([st.readUInt16BE(12), st.readUInt32BE(14)], [0x41, 2]);
});

test('блок 1: набор стран ведёт на запись страны, счёт таблицы сходится', { skip: !haveMaps }, () => {
  const r = CL.build(pois(300), { template: CL.template(LIT), addr: model(), cap: 1500 });
  const rep = CL.verify(r.buf, r, pois(300));
  assert.equal(rep.countrySet.length, 1);
  assert.ok(rep.countrySet[0].ok);
  assert.equal(rep.countrySet[0].code, 113);
  assert.equal(rep.stats, A.STAT_IDS.length);
  assert.equal(rep.tableCount.root, rep.tableCount.found);
});

// Буква длиннее 50 имён: индекс второго уровня с приставкой, каждый список
// начинается с ветви (как NZ 3383:1227 — ведущий 0xda, приставка 'A').
test('буква длиннее 50 имён: индекс второго уровня, все списки достижимы', () => {
  const items = [];
  for (let i = 0; i < 70; i++) items.push({ name: 'L' + String.fromCharCode(65 + (i % 7)) + 'X' + String(i).padStart(2, '0') });
  for (let i = 0; i < 10; i++) items.push({ name: 'B' + i });
  const r = A.names('t', items, 'owner');
  const subs = r.records.filter((x) => /^t:i\d+$/.test(x.sym));
  assert.equal(subs.length, 1);
  const t = subs[0].tokens();
  assert.equal(t[0].u8, 0xda);
  assert.equal(t[4].raw.toString(), 'L');
  const lists = r.records.filter((x) => /:l\d+$/.test(x.sym));
  const reached = new Set();
  for (const ix of r.records.filter((x) => /:(idx|i\d+)$/.test(x.sym))) {
    for (const tk of ix.tokens()) if (typeof tk.ref === 'string') reached.add(tk.ref.split('#')[0]);
  }
  for (const l of lists) assert.ok(reached.has(l.sym), 'список ' + l.sym + ' без ветви');
});

// Все имена начинаются с «LA»: корень сразу с приставкой «LA» (0xdb, как EU
// 75660:1696 «ULICA »), без цепочки «L» -> «LA» с одной ветвью (у завода
// индексов с одной ветвью 0 из 40 196).
test('индекс: приставка — общая часть имён, ветвей не меньше двух', () => {
  const items = [];
  for (let i = 0; i < 120; i++) items.push({ name: 'LA' + String.fromCharCode(65 + (i % 3)) + String(i).padStart(3, '0') });
  const r = A.names('t', items, null);
  assert.equal(r.records.filter((x) => /^t:i\d+$/.test(x.sym)).length, 0);
  const t = r.records[0].tokens();
  assert.equal(t[0].u8, 0xdb);
  assert.equal(t[4].raw.toString(), 'LA');
  assert.equal(r.records[0].n, 3);
  const lists = r.records.filter((x) => /:l\d+$/.test(x.sym));
  assert.ok(lists.every((l) => l.n <= 50));
  assert.equal(lists.reduce((a, l) => a + l.n, 0), 120);
});

test('POI: повороты названий, телефоны, двойники — узел 0x33 [16 -> 0x34]', () => {
  assert.deepEqual(A.rotations('SAN PIETRO'), ['PIETRO%SAN ']);
  assert.equal(A.phoneKey('+357 22 942 742'), '35722942742');
  assert.equal(A.phoneKey('22942742'), '35722942742');
  const pois = [{ name: 'EKO', pos: [5, 1], x: 20, y: 5, cat: 8 }, { name: 'EKO', pos: [5, 2], x: 10, y: 7, cat: 8 },
                { name: 'LIDL STORE', pos: [6, 1], x: 1, y: 1, cat: 9 }];
  const r = A.poiNames('p', pois, (q) => [q.name].concat(A.rotations(q.name)));
  assert.equal(r.entries, 3);                          // EKO, LIDL STORE, STORE%LIDL
  assert.equal(r.multi, 1);
  const sel = r.records.find((x) => x.sym === 'p:g0');
  assert.deepEqual(sel.tokens().slice(0, 2), [{ u8: 0xf1 }, { v: 16 }]);
  const z = r.records.find((x) => x.sym === 'p:g0z');
  // одна запись: голова и последняя (0xc0), 0x65 = 2, категория одна, витки по x
  assert.deepEqual(z.tokens().slice(0, 6), [{ u8: 0x97 }, { u8: 0xc0 }, { v: 2 }, { v: 8 }, { v: 2 }, { apair: [10, 7] }]);
});

// Как у завода: до 500 точек — цепочка записей по 100 (EU 125835:1738 — 0x80,
// 100 витков; :1839 — 0x40, 72), больше — дерево, делится, пока в листе > 250
// (129958:2054: 836 точек -> 4 листа по 209).
test('0x34: цепочка по 100 витков, больше 500 точек — дерево', () => {
  const pts = (n, cat) => Array.from({ length: n }, (_, i) => ({ pos: [9, i], x: (i * 7919) % 1000, y: i, cat: cat || 5 }));
  const flags = (rs) => rs.map((r) => r.tokens()[1].u8);
  const c = A.poi34('c', pts(172));
  assert.deepEqual(flags(c), [0x80, 0x40]);
  assert.deepEqual(c.map((r) => r.n), [100, 72]);
  assert.deepEqual(flags(A.poi34('m', pts(3).map((q, i) => Object.assign(q, { cat: i })))), [0xc1]);
  const t = A.poi34('t', pts(836));
  assert.deepEqual(flags(t), [0x83, 0x03, 0, 0, 0, 0, 0, 0, 0x03, 0, 0, 0, 0, 0, 0x40]);
  assert.deepEqual(t.filter((r) => r.n).map((r) => r.n), [100, 100, 9, 100, 100, 9, 100, 100, 9, 100, 100, 9]);
  const root = t[0].tokens();
  assert.equal(root[4].ref, 't:t0');                   // 0x5f -> левый ребёнок — следующая запись
  assert.equal(t[1].sym, 't:t0');
  assert.ok(t.every((r) => r.n <= 100));
});

test('ключи точки: второе имя с поворотами, без повторов', () => {
  const k = A.poiKeys({ name: 'ALPHAGRAND AUTOSERVICE', alt: 'ALPHA GRAND AUTO SERVICE' });
  assert.ok(k.includes('ALPHA GRAND AUTO SERVICE'), 'второе имя');
  assert.ok(k.includes('GRAND AUTO SERVICE%ALPHA '), 'его поворот');
  assert.equal(A.poiKeys({ name: 'X Y', alt: 'X Y' }).length, 2, 'одинаковое второе имя не дублируется');
});

test('узел 0x33: селекторы пишутся приращением (9, 18, 20 -> 9, 9, 2, как у завода)', () => {
  const t = A.select33('n', [{ sel: 9, target: 'a' }, { sel: 18, target: 'b' }, { sel: 20, target: 'c' }]).tokens();
  assert.deepEqual(t.filter((x) => x.v !== undefined).map((x) => x.v), [9, 9, 2]);
  assert.throws(() => A.select33('n', [{ sel: 18, target: 'a' }, { sel: 9, target: 'b' }]));
});

test('дерево категорий: группа 39 — категории групп, у каждой группы свои узлы и списки', () => {
  const pois = [{ name: 'BANK A', cat: 8, pos: [9, 1] }, { name: 'POST B', cat: 10, pos: [9, 2] },
                { name: 'HOTEL C', cat: 29, pos: [9, 3] }, { name: 'SHOP D', cat: 181, pos: [9, 4] },
                { name: 'GARAGE E', cat: 6, pos: [9, 5] }];
  const r = A.catTree('t', pois, 18);
  const bySym = new Map(r.records.map((x) => [x.sym, x]));
  const sels = (s) => { let a = 0; return bySym.get(s).tokens().filter((x) => x.v !== undefined).map((x) => (a += x.v)); };
  assert.deepEqual(sels('t'), [39, 42, 47]);            // 181 — вне групп: в дереве нет
  assert.deepEqual(sels('t:s39'), [6, 8, 10, 29]);      // 6 (автосервис) — только в группе 39
  assert.deepEqual(sels('t:s47'), [8, 10]);
  assert.deepEqual(sels('t:m47'), [2, 18]);
  assert.deepEqual(sels('t:39:l8'), [18]);
  // как у завода (Мальта): ни один узел и ни один список не общий у двух ссылок
  const refs = [];
  for (const x of r.records) for (const tk of x.tokens()) if (typeof tk.ref === 'string') refs.push(tk.ref);
  assert.equal(new Set(refs).size, refs.length, 'на каждую запись — одна ссылка');
  const m = A.catTree('c', pois, 1).records.find((x) => x.sym === 'c:m47');
  assert.deepEqual(m.tokens().filter((x) => x.v !== undefined).map((x) => x.v), [1, 1], 'у города: 1 названия, 2 категории');
});
