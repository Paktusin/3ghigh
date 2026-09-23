'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('./litfile');

// Заголовок-образец: магия, версия 12 (в файле лежит версия−11) и место под
// поля, которые сборщик проставляет сам.
function head(len) {
  const b = Buffer.alloc(len === undefined ? 368 : len);
  b.writeUInt32BE(L.MAGIC, 0);
  b.writeUInt16BE(1, L.F.version);                 // 1 + 11 = 12
  return b;
}
const blocks = (...sizes) => sizes.map((n, i) => Buffer.alloc(n, i + 1));

test('ширина поля подбирается по наибольшему значению', () => {
  assert.equal(L.widthFor(0), 1);
  assert.equal(L.widthFor(255), 1);
  assert.equal(L.widthFor(256), 2);
  assert.equal(L.widthFor(0xffffff), 3);
  assert.equal(L.widthFor(0x1000000), 4);
});

test('блоки ложатся подряд, каталог указывает на них', () => {
  const m = L.read(L.build({ head: head(), ttd: Buffer.alloc(100), blocks: blocks(10, 20, 30) }));
  assert.equal(m.header.count, 3);
  assert.deepEqual(m.blocks.map((b) => b.length), [10, 20, 30]);
  for (let i = 0; i + 1 < m.catalog.length; i++) {
    assert.equal(m.catalog[i + 1].off, m.catalog[i].off + m.catalog[i].size, 'без дыр');
  }
});

test('каталог начинается сразу за грамматикой', () => {
  const m = L.read(L.build({ head: head(368), ttd: Buffer.alloc(7896), blocks: blocks(5) }));
  assert.equal(m.header.ttd, 368);
  assert.equal(m.header.base, 368 + 7896);
  assert.equal(m.catalog[0].off, 368 + 7896 + m.header.recSize);
});

test('последний блок кончается на последнем байте файла', () => {
  const buf = L.build({ head: head(), ttd: Buffer.alloc(16), blocks: blocks(7, 9) });
  const m = L.read(buf);
  const last = m.catalog[m.catalog.length - 1];
  assert.equal(last.off + last.size, buf.length);
});

test('ширины полей выбираются под размер файла и объявляются в заголовке', () => {
  const small = L.read(L.build({ head: head(), ttd: Buffer.alloc(16), blocks: blocks(4, 4) }));
  assert.equal(small.header.fieldWidth, 2, 'файл меньше 64 КБ — двух байт хватает');
  assert.equal(small.header.sizeWidth, 1);
  assert.equal(small.header.recSize, 3);

  const big = L.read(L.build({ head: head(), ttd: Buffer.alloc(16), blocks: [Buffer.alloc(70000)] }));
  assert.equal(big.header.sizeWidth, 3, 'блок длиннее 65 535 требует трёх байт');
});

test('заданной ширины смещения может не хватить, и это говорится вслух', () => {
  assert.throws(() => L.build({ head: head(), ttd: Buffer.alloc(16), fieldWidth: 1,
                                blocks: [Buffer.alloc(1000)] }), /не хватает/);
});

test('содержимое блоков сохраняется дословно', () => {
  const src = [Buffer.from('первый блок'), Buffer.from('второй')];
  const m = L.read(L.build({ head: head(), ttd: Buffer.alloc(8), blocks: src }));
  assert.ok(m.blocks[0].equals(src[0]));
  assert.ok(m.blocks[1].equals(src[1]));
});

test('чужая магия отвергается не молча', () => {
  const b = L.build({ head: head(), ttd: Buffer.alloc(8), blocks: blocks(4) });
  b.writeUInt32BE(0, 0);
  assert.throws(() => L.read(b), /не Lit/);
});
