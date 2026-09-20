'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('./litdict');
const E = require('./litenc');

const T = (s) => Buffer.from(s, 'latin1');

// Блок словаря в том виде, в каком его видит dict(): 13 байт заголовка,
// в байте 12 — число записей, дальше сами записи.
const asBlock = (codes) => {
  const h = Buffer.alloc(13);
  h[12] = codes.size;
  return Buffer.concat([h, D.serialize(codes)]);
};

test('свободные коды — это байты, которых нет в текстах', () => {
  const free = D.freeCodes([T('AB'), T('BC')]);
  assert.ok(!free.includes(0x41) && !free.includes(0x42) && !free.includes(0x43));
  assert.ok(free.includes(1) && free.includes(255));
  assert.equal(free.length, 255 - 3);          // 1..255 минус A, B, C
});

test('построенный словарь читается обратно dict()', () => {
  const texts = ['BERGSTRASSE', 'BAHNHOFSTRASSE', 'HAUPTSTRASSE', 'KIRCHSTRASSE',
                 'BERGWEG', 'BAHNHOFPLATZ'].map(T);
  const codes = D.build(texts, 255);
  assert.ok(codes.size > 0, 'словарь пуст');
  const parsed = D.dict(asBlock(codes));
  assert.ok(parsed, 'dict() не разобрал');
  assert.equal(parsed.codes.size, codes.size);
  for (const [c, v] of codes) assert.deepEqual([...parsed.codes.get(c)], [...v], 'код ' + c);
});

test('сжатие построенным словарём разворачивается в исходный текст', () => {
  const texts = ['BERGSTRASSE', 'BAHNHOFSTRASSE', 'HAUPTSTRASSE', 'KIRCHSTRASSE',
                 'OBERE BERGSTRASSE', 'UNTERE BERGSTRASSE'].map(T);
  const codes = D.build(texts, 255);
  const full = E.expandMap(codes), order = E.byLength(full);
  let packed = 0, plain = 0;
  for (const t of texts) {
    const c = E.compress(t, full, order);
    assert.deepEqual([...D.expand(codes, c)], [...t], 'текст ' + t.toString());
    packed += c.length; plain += t.length;
  }
  assert.ok(packed < plain, 'сжатия не произошло: ' + packed + ' против ' + plain);
});

test('коды словаря и литеральные байты не пересекаются', () => {
  const texts = ['ALPHA', 'BETA', 'GAMMA'].map(T);
  const codes = D.build(texts, 255);
  const lit = new Set();
  for (const t of texts) for (const b of t) lit.add(b);
  for (const c of codes.keys()) assert.ok(!lit.has(c), 'код ' + c + ' совпал с литералом');
});

test('запись словаря: прибавка полубайтом, абсолютная форма когда не влезает', () => {
  const near = new Map([[1, T('AB')], [3, T('CD')]]);   // прибавки 1 и 2
  assert.deepEqual([...D.serialize(near)],
                   [0x12, 0x41, 0x42, 0x22, 0x43, 0x44]);
  const far = new Map([[1, T('AB')], [100, T('CD')]]);  // прибавка 99 — не влезает
  const s = D.serialize(far);
  assert.deepEqual([...s.subarray(0, 3)], [0x12, 0x41, 0x42]);
  assert.equal(s[3] >> 4, 0, 'старший полубайт должен быть нулём');
  assert.equal(s[4], 100, 'следом идёт сам номер кода');
});

test('запись словаря: длина больше 15 уходит в отдельный байт', () => {
  const long = new Map([[1, Buffer.alloc(20, 0x41)]]);
  const s = D.serialize(long);
  assert.equal(s[0] & 0x0f, 0, 'младший полубайт должен быть нулём');
  assert.equal(s[1], 20, 'следом идёт длина');
  const parsed = D.dict(asBlock(long));
  assert.equal(parsed.codes.get(1).length, 20);
});
