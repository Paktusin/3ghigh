'use strict';
// Проверка сборки блока .xac версии 5. Тесты автономные: карта не нужна,
// таблица ATTRIBUTE синтетическая. Каждый кодировщик проверяется НАСТОЯЩИМ
// читателем — тем же, что разбирает данные с диска.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const xac = require('./xac');
const xv = require('./xacvec');
const xr = require('./xacrec');
const xw = require('./xacwrite');

const X = (lon) => Math.round(lon * 72000);
const Y = (lat) => Math.round(lat * (40000000 / 360));

// Кусок блока с настоящей шапкой: разборщик записи смотрит в неё за версией
// (0x14) и за признаком «длин в записи нет» — разряды 1..2 байта 0x39.
function blockStub(size) {
  const s = Buffer.alloc(size || 0x100);
  s.writeUInt16BE(5, 0x14);
  s.writeUInt16BE(2, 0x38);
  return s;
}

// Таблица атрибутов: индекс 0x2a — «простой» (запись ровно четыре байта),
// остальные включают по одному разряду удлинения.
function attrTable() {
  const a = new Uint32Array(2048);
  a[0x2a] = 0x00000005;                 // ничего лишнего, уровень 5
  a[0x2b] = 0x80000000;                 // старшую половину взять из потока
  a[0x2c] = 0x00008000;                 // младшую половину взять из потока
  a[0x2d] = 0x40000000;                 // поле +0x40, четыре байта
  a[0x2e] = 0x10000000;                 // поле +0x44, четыре байта
  return a;
}

test('координата: три формы собираются и читаются обратно', () => {
  const ox = X(33.37), oy = Y(35.165);
  const cases = [
    { name: 'компактная', x: ox + 1000, y: oy - 2000, form: 4 },
    { name: '20 бит',     x: ox + 300000, y: oy - 400000, form: 6 },
    { name: '28 бит',     x: ox + 5000000, y: oy + 7000000, form: 8 },
  ];
  for (const c of cases) {
    assert.equal(xw.coordForm(c, ox, oy), c.form, c.name + ': форма');
    const buf = xw.encodeCoord(c, ox, oy, c.form, 0);
    assert.equal(buf.length, c.form, c.name + ': длина');
    const got = xv.koord(buf, 0, ox, oy);
    assert.deepEqual(got, { x: c.x, y: c.y }, c.name + ': обратное чтение');
  }
});

test('координата: за границей формы кодировщик отказывает', () => {
  assert.equal(xw.encodeCoord({ x: 100000, y: 0 }, 0, 0, 4), null);
  assert.equal(xw.encodeCoord({ x: 0, y: 100000 }, 0, 0, 4), null);
  assert.equal(xw.encodeCoord({ x: 9000000, y: 0 }, 0, 0, 6), null);
});

test('координата: младшие пять разрядов байта 0 переносятся у длинных форм', () => {
  const c = { x: 300000, y: 200000 };
  const six = xw.encodeCoord(c, 0, 0, 6, 0x17);
  assert.equal(six[0] & 0x1f, 0x17, 'разряды перенесены');
  assert.equal(six[0] & 0xe0, 0x80, 'метка шестибайтовой формы');
  assert.deepEqual(xv.koord(six, 0, 0, 0), c, 'перенос не мешает чтению');
  // у компактной формы таких разрядов нет: бит 15 обязан быть нулём
  const four = xw.encodeCoord({ x: 100, y: 100 }, 0, 0, 4, 0xff);
  assert.equal(four[0] & 0x80, 0, 'метка компактной формы');
});

test('слово длины: мантисса со сдвигом читается обратно', () => {
  const metres = (w) => (w & 0x0fff) << ((w & 0x7000) >> 11);
  for (const v of [0, 1, 80, 4095, 4096, 16380, 26880, 65472]) {
    const w = xw.encodeLength(v);
    assert.notEqual(w, null, 'значение ' + v + ' не закодировалось');
    assert.equal(metres(w), v, 'значение ' + v);
  }
  assert.equal(xw.encodeLength(4097), null, 'нечётная мантисса сверх 12 бит не влезает');
});

test('заголовок записи: слова 0 и 1 разбираются настоящим читателем', () => {
  const attr = attrTable();
  const s = blockStub();
  const [w0, w1] = xw.encodeHeader(0x1234, 0x2a, 0, 0);
  assert.equal(w0, 0xd234, 'метка 0xc000 и номер узла');
  assert.equal(w1, 0x2a, 'индекс атрибута без флагов');
  s.writeUInt16BE(w0, 0x40); s.writeUInt16BE(w1, 0x42);
  const r = xr.record(s, 0x40, attr, () => {});
  assert.equal(r.node, 0x1234);
  assert.equal(r.idx, 0x2a);
  assert.equal(r.end, 0x44, 'простая запись — ровно четыре байта');
  assert.equal(r.level, 5, 'уровень из младших трёх бит атрибута');
});

test('заголовок записи: бит 15 слова 1 переносится, не читаясь', () => {
  const attr = attrTable();
  const s = blockStub();
  const [w0, w1] = xw.encodeHeader(7, 0x2a, 0, 0x8000);
  assert.equal(w1 & 0x8000, 0x8000, 'бит 15 сохранён');
  s.writeUInt16BE(w0, 0x40); s.writeUInt16BE(w1, 0x42);
  const r = xr.record(s, 0x40, attr, () => {});
  assert.equal(r.end, 0x44, 'на длину записи бит 15 не влияет');
  assert.equal(r.idx, 0x2a);
});

test('разборщик берёт признак длины из шапки блока, а не из записи', () => {
  const attr = attrTable();
  const [w0, w1] = xw.encodeHeader(3, 0x2a, 0, 0);
  const put = (s) => { s.writeUInt16BE(w0, 0x40); s.writeUInt16BE(w1, 0x42); return s; };
  const withFlag = put(blockStub());
  assert.equal(xr.record(withFlag, 0x40, attr, () => {}).end - 0x40, 4,
    'при (байт 0x39 >> 1) & 3 == 1 слова длины в записи нет');
  const without = put(blockStub());
  without.writeUInt16BE(0, 0x38);
  without.writeUInt16BE(0x1234, 0x44);
  const r = xr.record(without, 0x40, attr, () => {});
  assert.equal(r.end - 0x40, 6, 'иначе за записью читается слово длины');
  assert.equal(r.length[0], (0x1234 & 0x0fff) << ((0x1234 & 0x7000) >> 11),
    'длина в метрах: мантисса со сдвигом');
});

test('длина записи растёт ровно на те поля, что велит атрибут', () => {
  const attr = attrTable();
  const len = (idx) => {
    const s = blockStub();
    const [w0, w1] = xw.encodeHeader(3, idx, 0, 0);
    s.writeUInt16BE(w0, 0x40); s.writeUInt16BE(w1, 0x42);
    return xr.record(s, 0x40, attr, () => {}).end - 0x40;
  };
  assert.equal(len(0x2a), 4, 'простой');
  assert.equal(len(0x2b), 6, 'подстановка старшей половины — плюс слово');
  assert.equal(len(0x2c), 6, 'подстановка младшей половины — плюс слово');
  assert.equal(len(0x2d), 8, 'поле +0x40 — плюс четыре байта');
  assert.equal(len(0x2e), 8, 'поле +0x44 — плюс четыре байта');
});

test('признак заголовка под-блока отличает его от записи вектора', () => {
  const box = [1000, 2000, 5000, 6000];
  const sub = Buffer.alloc(0x16);
  sub.writeUInt16BE(0xc012, 0); sub.writeUInt16BE(0x0100, 2);
  sub.writeInt32BE(2000, 4); sub.writeInt32BE(3000, 8);
  sub.writeInt32BE(3000, 12); sub.writeInt32BE(4000, 16);
  assert.equal(xw.looksSub(sub, 0, box), true, 'рамка внутри рамки блока');

  // настоящая запись вектора: за словами 0 и 1 идёт что угодно, но как пара
  // координат это из рамки блока выпадает
  const rec = Buffer.alloc(0x16);
  rec.writeUInt16BE(0xc037, 0); rec.writeUInt16BE(0x0254, 2);
  rec.writeInt32BE(-500, 4); rec.writeInt32BE(99999, 8);
  assert.equal(xw.looksSub(rec, 0, box), false, 'координаты вне рамки');

  const flipped = Buffer.from(sub);
  flipped.writeInt32BE(4500, 4);                 // xmin > xmax
  assert.equal(xw.looksSub(flipped, 0, box), false, 'рамка вывернута');
});

test('поле 0x16 — это cos(широты) в формате 1.15', () => {
  // на экваторе множитель равен отношению масштабов, на полюсе — нулю
  assert.equal(xw.scaleAt(0, 0), Math.floor((40000000 / 360) / 72000 * 32768));
  assert.equal(xw.scaleAt(Y(90), Y(90)), 0);
  // проверка на настоящем значении из EJ211_AB00_1.xac: рамка 4483293..4518060
  assert.equal(xw.scaleAt(4483293, 4518060), 38448);
});

test('сборка блока: граф читается обратно теми же рёбрами', () => {
  const pts = [[33.360, 35.170], [33.370, 35.172], [33.380, 35.168],
               [33.375, 35.160], [33.362, 35.158]];
  const nodes = pts.map(([lo, la]) => ({ x: X(lo), y: Y(la), vectors: [] }));
  nodes[0].vectors.push({ to: 1, idx: 0x2a });
  nodes[1].vectors.push({ to: 2, idx: 0x2a }, { to: 3, idx: 0x2a });
  nodes[2].vectors.push({ to: 3, idx: 0x2a });
  nodes[3].vectors.push({ to: 4, idx: 0x2a });
  const blk = xw.buildBlock({ nodes, origin: [X(33.37), Y(35.165)], id: 1, country: 7 });

  const s = xac.sections(blk);
  assert.equal(s.complete, true, 'раздел покрывает блок целиком');
  assert.equal(s.list[0].name, 'VEKTORBLOCK');
  assert.equal(blk.length % 4, 0, 'блок выровнен на четыре байта');

  const edges = xv.blockEdges(blk, { keepCross: true });
  assert.equal(edges.length, 5, 'рёбер столько же, сколько векторов');
  const want = [[0, 1], [1, 2], [1, 3], [2, 3], [3, 4]];
  for (let i = 0; i < want.length; i++) {
    const [a, b] = want[i];
    assert.equal(edges[i].a.x, nodes[a].x, 'ребро ' + i + ': начало X');
    assert.equal(edges[i].a.y, nodes[a].y, 'ребро ' + i + ': начало Y');
    assert.equal(edges[i].b.x, nodes[b].x, 'ребро ' + i + ': конец X');
    assert.equal(edges[i].b.y, nodes[b].y, 'ребро ' + i + ': конец Y');
    assert.equal(edges[i].type, 0x2a, 'ребро ' + i + ': индекс атрибута');
  }
});

test('сборка блока: шапка считает векторы и узлы так же, как их считает таблица', () => {
  const nodes = [
    { x: X(33.36), y: Y(35.17), vectors: [{ to: 1, idx: 0x2a }, { to: 2, idx: 0x2a }] },
    { x: X(33.37), y: Y(35.17), vectors: [{ to: 2, idx: 0x2a }] },
    { x: X(33.38), y: Y(35.17), vectors: [] },
  ];
  const blk = xw.buildBlock({ nodes, origin: [X(33.37), Y(35.17)] });
  const tab = blk.readUInt32BE(0x6c), cnt = blk.readUInt16BE(0x70);

  let marked = 0, junctions = 0;
  for (let i = 0; i < cnt; i++) {
    const off = blk.readUInt16BE(tab + i * 2) * 2;
    if (off > 0 && (blk.readUInt16BE(off) & 0xc000) === 0xc000) marked++;
    const st = blk[tab + cnt * 2 + 2 + i];
    if (st !== 0 && st !== 255) junctions++;
  }
  assert.equal(blk.readUInt16BE(0x30), marked, '0x30 — записей с меткой 0xc000');
  assert.equal(blk.readUInt16BE(0x32), junctions, '0x32 — разных узлов');
  assert.equal(blk.readUInt16BE(0x30), 3, 'векторов три');
  assert.equal(blk.readUInt16BE(0x32), 3, 'узлов три, считая бездорожный');
});

test('сборка блока: узел без векторов всё равно находится по таблице', () => {
  const nodes = [
    { x: X(33.36), y: Y(35.17), vectors: [{ to: 1, idx: 0x2a }] },
    { x: X(33.37), y: Y(35.171), vectors: [] },
  ];
  const blk = xw.buildBlock({ nodes, origin: [X(33.365), Y(35.17)] });
  const tab = blk.readUInt32BE(0x6c), cnt = blk.readUInt16BE(0x70);
  const seen = [];
  for (let i = 1; i < cnt; i++) {
    const o = xv.nodeOffset(blk, tab, cnt, i);
    assert.notEqual(o, 0, 'номер ' + i + ' не нашёл узла');
    seen.push(xv.koord(blk, o, blk.readInt32BE(0x28), blk.readInt32BE(0x2c)));
  }
  assert.deepEqual(seen, nodes.map((n) => ({ x: n.x, y: n.y })), 'оба узла найдены');
});

test('сборка блока: номер 0 в таблице не выдаёт себя за вектор', () => {
  const nodes = [{ x: X(33.36), y: Y(35.17), vectors: [{ to: 0, idx: 0x2a }] }];
  const blk = xw.buildBlock({ nodes, origin: [X(33.36), Y(35.17)] });
  const tab = blk.readUInt32BE(0x6c);
  const off = blk.readUInt16BE(tab) * 2;
  assert.notEqual(blk.readUInt16BE(off) & 0xc000, 0xc000,
    'запись 0 должна указывать не на слово с меткой вектора');
  assert.equal(xv.nodeOffset(blk, tab, blk.readUInt16BE(0x70), 0), 0,
    'FUN_08272410 отвечает на номер 0 нулём');
});

test('обратный проход: собранный блок читается в модель и пишется теми же байтами', () => {
  const attr = attrTable();
  const nodes = [];
  for (let i = 0; i < 40; i++) {
    nodes.push({ x: X(33.3 + i * 0.001), y: Y(35.1 + (i % 7) * 0.002), vectors: [] });
  }
  for (let i = 0; i + 1 < nodes.length; i++) nodes[i].vectors.push({ to: i + 1, idx: 0x2a });
  nodes[0].vectors.push({ to: 5, idx: 0x2a });
  const blk = xw.buildBlock({ nodes, origin: [X(33.32), Y(35.106)] });

  const m = xw.readBlock(blk, attr);
  assert.notEqual(m, null, 'модель прочиталась');
  assert.equal(m.broke, false, 'разбор не обрывался');
  const coords = m.items.filter((x) => x.kind === 'coord');
  const vecs = m.items.filter((x) => x.kind === 'vector');
  const subs = m.items.filter((x) => x.kind === 'sub');
  assert.equal(coords.length, nodes.length, 'узлов столько же');
  assert.equal(vecs.length, 40, 'векторов столько же');
  assert.equal(subs.length, 1, 'один заголовок под-блока');

  const back = xw.writeBlock(m);
  assert.ok(back.equals(blk), 'байты собрались обратно точно');
});

test('сборка блока: вырожденные случаи отвергаются, а не портят байты', () => {
  assert.throws(() => xw.buildBlock({ nodes: [] }), /без узлов/);
  assert.throws(() => xw.buildBlock({
    nodes: [{ x: 0, y: 0, vectors: [{ to: 9, idx: 1 }] }],
  }), /ведёт в никуда/);
});

test('простые атрибуты — это те, при которых запись ровно четыре байта', () => {
  const attr = attrTable();
  const simple = xw.simpleAttributes(attr);
  assert.ok(simple.includes(0x2a), '0x2a простой');
  for (const bad of [0x2b, 0x2c, 0x2d, 0x2e]) {
    assert.ok(!simple.includes(bad), 'индекс ' + bad.toString(16) + ' не простой');
  }
  for (const idx of simple.slice(0, 50)) {
    const s = blockStub();
    const [w0, w1] = xw.encodeHeader(1, idx, 0, 0);
    s.writeUInt16BE(w0, 0x40); s.writeUInt16BE(w1, 0x42);
    const r = xr.record(s, 0x40, attr, () => {});
    assert.equal(r.end - 0x40, 4, 'индекс ' + idx + ' дал запись длиннее четырёх байт');
  }
});

test('компактная координата с неотрицательным dx неотличима от обратной ссылки', () => {
  // Это свойство формата, а не нашего разбора: прошивке оно не мешает, потому
  // что она не идёт по области подряд, а прыгает по таблице.
  const plus = xw.encodeCoord({ x: 100, y: 0 }, 0, 0, 4, 0);
  assert.equal(plus.readUInt16BE(0) & 0xc000, 0x4000, 'dx >= 0 даёт метку обратной ссылки');
  const minus = xw.encodeCoord({ x: -100, y: 0 }, 0, 0, 4, 0);
  assert.equal(minus.readUInt16BE(0) & 0xc000, 0x0000, 'dx < 0 даёт метку координаты');
});

test('выбор формы: строгий режим уходит от двусмысленной компактной', () => {
  assert.equal(xw.coordForm({ x: -100, y: 0 }, 0, 0, true), 4, 'dx < 0 — компактная годится');
  assert.equal(xw.coordForm({ x: 100, y: 0 }, 0, 0, true), 6, 'dx >= 0 — берём шесть байт');
  assert.equal(xw.coordForm({ x: 100, y: 0 }, 0, 0, false), 4, 'без строгости — компактная');
  assert.equal(xw.coordForm({ x: 0, y: 0 }, 0, 0, true), 6, 'dx == 0 тоже двусмыслен');
});

test('сборка блока: ни одна координата не притворяется обратной ссылкой', () => {
  const nodes = [];
  for (let i = 0; i < 60; i++) {
    nodes.push({ x: X(33.3 + i * 0.002), y: Y(35.1 + (i % 11) * 0.003), vectors: [] });
  }
  for (let i = 0; i + 1 < nodes.length; i++) nodes[i].vectors.push({ to: i + 1, idx: 0x2a });
  const blk = xw.buildBlock({ nodes });                 // опора выбирается сама

  assert.ok(blk.readInt32BE(0x28) > blk.readInt32BE(0x20), 'опора правее рамки');
  const m = xw.readBlock(blk, attrTable());
  assert.equal(m.items.filter((x) => x.kind === 'backref').length, 0, 'обратных ссылок нет');
  assert.equal(m.items.filter((x) => x.kind === 'coord').length, nodes.length, 'все узлы найдены');
  for (const it of m.items) {
    if (it.kind === 'coord' && it.form === 4) {
      assert.equal(blk.readUInt16BE(it.at) & 0xc000, 0x0000,
        'координата @' + it.at + ' подняла бит 14');
    }
  }
  assert.ok(xw.writeBlock(m).equals(blk), 'байты собрались обратно точно');
});

test('сборка блока: чужая опора не ломает разбор, а удлиняет координаты', () => {
  const nodes = [
    { x: X(33.30), y: Y(35.10), vectors: [{ to: 1, idx: 0x2a }] },
    { x: X(33.34), y: Y(35.12), vectors: [] },
  ];
  // опора левее рамки: у обоих узлов dx > 0, компактная форма запрещена
  const blk = xw.buildBlock({ nodes, origin: [X(33.29), Y(35.11)] });
  const m = xw.readBlock(blk, attrTable());
  const coords = m.items.filter((x) => x.kind === 'coord');
  assert.equal(coords.length, 2);
  for (const c of coords) assert.equal(c.form, 6, 'взята шестибайтовая форма');
  assert.deepEqual(coords.map((c) => [c.x, c.y]), nodes.map((n) => [n.x, n.y]));
});
