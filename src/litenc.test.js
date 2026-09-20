'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('./litvm');
const E = require('./litenc');

// Кодировщик проверяется через настоящий декодер: собрать байты, скормить их
// машине и сверить, что она вернула ровно то, что кодировали. Синтетическая
// грамматика из двух правил — заголовок структуры и одно чтение.
const rule = (op, arg = 0, type = 0, to = 0, k = 0) =>
  [op, arg, type, 0, to, k, 0, 0, 0, 0];
const schema = (rules) => ({ words: Array(10).fill(0).concat(rules.flat()), first: 10, stride: 10 });

function decode(op, buf, x0) {
  const s = schema([rule(0x10), rule(op, 0, 1)]);
  let got = null;
  run(s, buf, 0, { x0: x0, wid: 24, tap: (t) => { if (!got) got = t; } });
  return got;
}

test('дельта-кодек: все формы кодируются и читаются обратно', () => {
  // px = base = x0, py = 0 — таким машина начинает блок.
  const cases = [
    { name: 'Y+ один байт',   x0: 100,   x: 100,    y: 50,   len: 1 },
    { name: 'X+ полубайт',    x0: 100,   x: 105,    y: 0,    len: 2 },
    { name: 'X- полубайт',    x0: 100,   x: 95,     y: 0,    len: 2 },
    { name: 'X без изменения',x0: 100,   x: 100,    y: -60,  len: 2 },
    { name: 'X 12 бит вверх', x0: 100,   x: 1100,   y: 0,    len: 3 },
    { name: 'X 12 бит вниз',  x0: 3000,  x: 1000,   y: 0,    len: 3 },
    { name: 'X абсолютный',   x0: 0,     x: 200000, y: 0,    len: 4 },
    { name: 'Y абсолютный',   x0: 100,   x: 100,    y: 5000, len: 3 },
    { name: 'оба абсолютных', x0: 0,     x: 200000, y: 40000, len: 5 },
  ];
  for (const c of cases) {
    const r = E.encDelta({ x: c.x, y: c.y, px: c.x0, py: 0, base: c.x0 });
    assert.ok(r, c.name + ': форма не подобралась');
    assert.equal(r.buf.length, c.len, c.name + ': длина ' + r.buf.toString('hex'));
    const got = decode(0x41, Buffer.concat([r.buf, Buffer.alloc(4)]), c.x0);
    assert.equal(got.x, c.x, c.name + ': X');
    assert.equal(got.y, c.y, c.name + ': Y');
    assert.equal(got.end - got.at, c.len, c.name + ': съедено байт');
  }
});

test('дельта-кодек: сброс это один байт 0xff', () => {
  const r = E.encDelta({ x: -1, y: -1, px: 7, py: 7, base: 0 });
  assert.deepEqual([...r.buf], [0xff]);
  const got = decode(0x41, Buffer.from([0xff, 0, 0, 0]), 7);
  assert.equal(got.x, -1);
  assert.equal(got.y, -1);
});

test('дельта-кодек: «X без изменения» пишется как X- с нулём, а не X+ с нулём', () => {
  // Это не косметика: X+ с нулём дал 19 349 расхождений на живых данных.
  const r = E.encDelta({ x: 100, y: -60, px: 100, py: 0, base: 100 });
  assert.equal(r.buf[0] & 0x60, 0x20);
});

test('граница формы Y — ровно -126..126', () => {
  // dX должен быть ненулевым, иначе сработает однобайтовая форма Y+,
  // у которой своя, беззнаковая граница 0..127.
  const y = (dY) => E.encDelta({ x: 105, y: 1000 + dY, px: 100, py: 1000, base: 0 });
  assert.equal(y(126).buf.length, 2, 'dY=126 должен быть коротким');
  assert.equal(y(-126).buf.length, 2, 'dY=-126 должен быть коротким');
  assert.equal(y(127).buf.length, 3, 'dY=127 должен быть абсолютным');
  assert.equal(y(-127).buf.length, 3, 'dY=-127 должен быть абсолютным');
  // а у однобайтовой формы граница именно 127
  const short = (dY) => E.encDelta({ x: 100, y: 1000 + dY, px: 100, py: 1000, base: 0 });
  assert.equal(short(127).buf.length, 1, 'dY=127 при dX=0 — один байт');
  assert.equal(short(128).buf.length, 3, 'dY=128 при dX=0 — уже абсолютный Y');
});

test('беззнаковое переменной длины: каноническая форма и границы', () => {
  assert.deepEqual([...E.encVarint(0)], [0]);
  assert.deepEqual([...E.encVarint(251)], [251]);
  assert.deepEqual([...E.encVarint(252)], [252, 0, 252]);
  assert.deepEqual([...E.encVarint(0xffff)], [252, 0xff, 0xff]);
  assert.deepEqual([...E.encVarint(0x10000)], [253, 1, 0, 0]);
  assert.deepEqual([...E.encVarint(0x1000000)], [254, 1, 0, 0, 0]);
  for (const v of [0, 1, 251, 252, 300, 0xffff, 0x10000, 0xffffff, 0x1000000, 0x7fffffff]) {
    const got = decode(0x25, Buffer.concat([E.encVarint(v), Buffer.alloc(4)]), 0);
    assert.equal(got.val, v, 'значение ' + v);
  }
});

test('упакованная пара: все четыре ширины читаются обратно', () => {
  for (const [wid, x, y, len] of [[8, 200, 100, 2], [12, 3000, 2000, 3],
                                  [16, 60000, 40000, 4], [24, 900000, 800000, 6]]) {
    const buf = E.encPair(x, y, wid);
    assert.equal(buf.length, len, 'ширина ' + wid);
    const s = schema([rule(0x10), rule(0x40, 0, 1)]);
    let got = null;
    run(s, Buffer.concat([buf, Buffer.alloc(8)]), 0, { wid: wid, tap: (t) => { if (!got) got = t; } });
    assert.deepEqual(got.pair, [x, y], 'ширина ' + wid);
  }
});

test('числа постоянной длины читаются обратно', () => {
  for (const [op, n, v] of [[0x26, 1, 200], [0x27, 2, 60000], [0x29, 4, 4000000000]]) {
    const got = decode(op, Buffer.concat([E.encFixed(v, n), Buffer.alloc(4)]), 0);
    assert.equal(got.val, v, 'код 0x' + op.toString(16));
  }
});
