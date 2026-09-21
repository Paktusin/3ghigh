'use strict';
// Проверка читателя блоков .xac версии 3. Тесты автономные: карта не нужна,
// блок собирается здесь же по выписанным из прошивки правилам, а читается
// НАСТОЯЩИМ читателем — тем, что разбирает данные с диска.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const v3 = require('./xacv3');

const X = (lon) => Math.round(lon * 72000);
const Y = (lat) => Math.round(lat * (40000000 / 360));

// Шапка блока v3: 0x4c байт, размер лежит в поле 0x40.
function header(bounds, origin, nodes, vectors) {
  const s = Buffer.alloc(0x4c);
  s.write('VEKTORBLOCK     ', 0, 16, 'ascii');
  s.writeUInt16BE(3, 0x14);
  for (let i = 0; i < 4; i++) s.writeInt32BE(bounds[i], 0x18 + i * 4);
  s.writeInt32BE(origin[0], 0x28);
  s.writeInt32BE(origin[1], 0x2c);
  s.writeUInt16BE(vectors, 0x30);
  s.writeUInt16BE(nodes, 0x32);
  s.writeUInt16BE(7, 0x34);                    // номер блока
  s.writeUInt16BE(5, 0x36);                    // первый блок тайла
  s.writeUInt16BE(2, 0x38);
  s.writeUInt16BE(0x4c, 0x40);
  return s;
}

const w16 = (...v) => { const b = Buffer.alloc(v.length * 2); v.forEach((x, i) => b.writeUInt16BE(x & 0xffff, i * 2)); return b; };
const coord4 = (x, y, ox, oy) => w16((x - ox + 16384) & 0x7fff, y - oy + 32768);

test('голова узла: компактная форма — четыре байта', () => {
  const s = w16(0x4001, 0x8002, 0xc000, 0x0010);
  assert.equal(v3.headLen(s, 0), 4);
});

test('голова узла: длинная форма, ниббл и бит 12 добавляют поля', () => {
  // 0x80xx — длинная на шесть байт, ниббл 8..11 = 0, бит 12 снят
  assert.equal(v3.headLen(w16(0x8007, 0, 0, 0), 0), 6);
  // ниббл 1 — ещё одно слово
  assert.equal(v3.headLen(w16(0x8107, 0, 0, 0), 0), 8);
  // ниббл 3 — ещё три слова
  assert.equal(v3.headLen(w16(0x8307, 0, 0, 0, 0, 0), 0), 12);
  // бит 12 — ещё одно слово поверх ниббла
  assert.equal(v3.headLen(w16(0x9007, 0, 0, 0), 0), 8);
  // бит 13 — база восемь байт
  assert.equal(v3.headLen(w16(0xa007, 0, 0, 0, 0), 0), 8);
  // ниббл 0xf — счётчик слов лежит отдельным словом
  assert.equal(v3.headLen(Buffer.concat([w16(0x8f07, 0, 0, 2), w16(0, 0, 0)]), 0), 12);
});

// Блок из трёх узлов: A—B локальная связь со встречной ссылкой,
// A—чужой блок межблочная, C одиночный.
function sample() {
  const ox = X(33.0), oy = Y(35.0);
  const bounds = [ox - 20000, oy - 20000, ox + 20000, oy + 20000];
  const pts = [{ x: ox + 100, y: oy + 200 }, { x: ox - 300, y: oy + 50 }, { x: ox + 900, y: oy - 700 }];
  const head = header(bounds, [ox, oy], 3, 3);
  const at = [];
  let body = Buffer.alloc(0);
  const add = (buf) => { at.push(head.length + body.length); body = Buffer.concat([body, buf]); };

  // Узел A: координата, вектор в B, межблочный вектор, терминатор.
  const aAt = head.length;
  const bAt = aAt + 4 + 4 + 6 + 2;
  const cAt = bAt + 4 + 2 + 2;
  add(Buffer.concat([
    coord4(pts[0].x, pts[0].y, ox, oy),
    w16(0xc000 | (bAt / 2), 0x0164),                       // вектор: узел B, атрибут 0x164
    // межблочный: слово 1 с битом 14 (чужой блок) и битом 15 — без него
    // обходчик кончил бы элемент раньше, чем дочитал номер блока
    w16(0xc000 | 0x1234, 0xc166, 0x0003),
    w16(aAt / 2),                                          // терминатор — самоиндекс
  ]));
  // Узел B: координата, встречная ссылка на слово вектора узла A, терминатор.
  add(Buffer.concat([
    coord4(pts[1].x, pts[1].y, ox, oy),
    w16(0x4000 | ((aAt + 4) / 2)),
    w16(bAt / 2),
  ]));
  // Узел C: координата, вектор в A, терминатор.
  add(Buffer.concat([
    coord4(pts[2].x, pts[2].y, ox, oy),
    w16(0xc000 | (aAt / 2), 0x01b2),
    w16(cAt / 2),
  ]));
  return { s: Buffer.concat([head, body]), at: [aAt, bAt, cAt], pts, ox, oy };
}

test('блок читается: узлы, элементы и счётчики шапки сходятся', () => {
  const { s, at, pts } = sample();
  const b = v3.readBlock(s);
  assert.equal(b.fail, 0);
  assert.equal(b.nodes.length, 3);
  assert.equal(b.nodes.length, b.count.nodes);
  const vec = b.nodes.reduce((a, n) => a + n.els.filter((e) => e.mark === 3).length, 0);
  assert.equal(vec, b.count.vectors);
  assert.deepEqual(b.nodes.map((n) => n.at), at);
  // самоиндекс: обходчик прошивки вернул бы начало своего узла
  for (const n of b.nodes) assert.equal(n.self, n.at);
  // координаты восстановились точно
  b.nodes.forEach((n, i) => { assert.equal(n.x, pts[i].x); assert.equal(n.y, pts[i].y); });
  assert.equal(b.tail, 0);
});

test('ссылки: локальная ведёт в начало узла, встречная — в слово вектора', () => {
  const { s, at } = sample();
  const b = v3.readBlock(s);
  const starts = new Set(b.nodes.map((n) => n.at));
  const [A, B, C] = b.nodes;
  const va = A.els.filter((e) => e.mark === 3).map((e) => v3.vector(s, e, b.first));
  assert.equal(va[0].ref, B.at);
  assert.ok(starts.has(va[0].ref));
  assert.equal(va[0].cross, false);
  assert.equal(va[1].cross, true);
  assert.equal(va[1].block, 5 + 3);            // номер блока = слово 2 плюс поле 0x36
  // встречная ссылка узла B указывает на слово вектора узла A
  const back = B.els.find((e) => e.mark === 1);
  assert.equal((s.readUInt16BE(back.at) & 0x3fff) * 2, A.at + 4);
  // и этот вектор ведёт обратно в B
  assert.equal((s.readUInt16BE(A.at + 4) & 0x3fff) * 2, B.at);
  // вектор узла C ведёт в A
  assert.equal(v3.vector(s, C.els.find((e) => e.mark === 3), b.first).ref, A.at);
});

test('рёбра: межблочные пропускаются, локальные несут координаты', () => {
  const { s, pts } = sample();
  const edges = v3.blockEdges(s);
  assert.equal(edges.length, 2);
  assert.deepEqual(edges[0].a, { x: pts[0].x, y: pts[0].y });
  assert.deepEqual(edges[0].b, { x: pts[1].x, y: pts[1].y });
  assert.equal(edges[0].idx, 0x164);
  assert.deepEqual(edges[1].a, { x: pts[2].x, y: pts[2].y });
  assert.deepEqual(edges[1].b, { x: pts[0].x, y: pts[0].y });
  assert.equal(v3.blockEdges(s, { keepCross: true }).length, 3);
});

test('обратный проход: блок собирается байт в байт', () => {
  const { s } = sample();
  const r = v3.rebuild(s);
  assert.equal(r.same, true);
  assert.ok(r.made > 0);
});

test('координата: три формы кодируются и читаются обратно', () => {
  const ox = X(33.37), oy = Y(35.165);
  for (const [form, dx, dy] of [[4, 1000, -2000], [6, -300000, 300000], [8, 5000000, -5000000]]) {
    const keep = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]);
    const buf = v3.encodeCoord(ox + dx, oy + dy, ox, oy, form, keep);
    assert.equal(buf.length, form, 'форма ' + form);
    assert.equal(v3.headLen(buf, 0), form);
  }
});
