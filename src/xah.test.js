'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const X = require('./xah');

// Раздел: имя 16 байт, дополненное ПРОБЕЛАМИ, затем u32 длины, затем данные.
// Полный размер раздела = длина + 20.
function sec(name, data) { return { name, data: Buffer.from(data) }; }

test('раздел собирается по правилу «имя 16 + длина + данные»', () => {
  const b = X.build([sec('XACDB HEADER', [1, 2, 3, 4])]);
  assert.equal(b.toString('latin1', 0, 16), 'XACDB HEADER    ');
  assert.equal(b.readUInt32BE(16), 4);
  assert.equal(b.length, 20 + 4);
});

test('собранное читается своим же разборщиком', () => {
  const b = X.build([sec('XACDB HEADER', Buffer.alloc(140)),
                     sec('XAC-STRUKTUR', Buffer.alloc(84))]);
  const list = X.sections(b).list;
  assert.deepEqual(list.map((s) => s.name), ['XACDB HEADER', 'XAC-STRUKTUR']);
  assert.deepEqual(list.map((s) => s.total), [160, 104]);
  assert.ok(X.sections(b).complete, 'покрытие обязано быть полным');
});

test('разбор и сборка возвращают те же байты', () => {
  const b = X.build([sec('STRING', [7, 7]), sec('FE_MIX_INFO', [9]), sec('NACHBARN', [])]);
  assert.ok(X.build(X.explode(b)).equals(b));
});

test('имя длиннее шестнадцати отвергается не молча', () => {
  assert.throws(() => X.build([sec('ОЧЕНЬ ДЛИННОЕ ИМЯ РАЗДЕЛА', [1])]), /длиннее 16/);
});

// Разрядности, при которых прошивка пропускает проверку целиком (FUN_0828078c).
// Последние три байта сверяются под маской 0x00ffffff, поэтому старший свободен.
test('разрядности: заводские принимаются, изменённые — нет', () => {
  assert.ok(X.bitsAccepted(X.BITS_OK));
  const free = X.BITS_OK.slice(); free[11] = 0xff;
  assert.ok(X.bitsAccepted(free), 'старший байт под маской не сверяется');
  const bad = X.BITS_OK.slice(); bad[3] = 0x0d;      // 12 бит номера тайла -> 13
  assert.ok(!X.bitsAccepted(bad));
});

test('счётчики шапки правятся на месте', () => {
  const data = Buffer.alloc(140);
  const b = X.build([{ name: 'XACDB HEADER', data }]);
  const patched = X.patchHeader(b.subarray(20), { tiles: 9, blocks: 77 });
  const whole = X.build([{ name: 'XACDB HEADER', data: patched }]);
  const h = X.header(whole);
  assert.equal(h.tiles, 9);
  assert.equal(h.blocks, 77);
});
