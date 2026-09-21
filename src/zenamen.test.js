'use strict';
// Автономные тесты адресной иерархии ZE-NAMEN-MMI.
const test = require('node:test');
const assert = require('node:assert');
const { mmiHeader, mmiTree, mmiBuildTree, MMI_REC } = require('./zenamen');

// Собрать раздел из дерева: шапка 60 байт, затем три байта на имя.
function section(rows) {
  const body = mmiBuildTree(rows);
  const out = Buffer.alloc(60 + body.length);
  out.write('ZE-NAMEN-MMI'.padEnd(16, ' '), 0, 16, 'latin1');
  out.writeUInt32BE(out.length - 20, 0x10);
  out.writeUInt32BE(0x00020000, 0x14);
  out.writeUInt32BE(rows.length, 0x18);
  out.writeUInt32BE(60, 0x1c);
  out.writeUInt32BE(body.length, 0x20);
  body.copy(out, 60);
  return out;
}

const tree = [
  { flags: 0x38, parent: null },   // корень: страна
  { flags: 0x74, parent: 0 },      // город
  { flags: 0x80, parent: 1 },      // улица
  { flags: 0xc0, parent: 1 },      // улица
];

test('дерево читается обратно тем же деревом', () => {
  const rows = mmiTree(section(tree));
  assert.strictEqual(rows.length, tree.length);
  assert.strictEqual(rows[0].parent, null, 'корень без родителя');
  assert.strictEqual(rows[2].parent, 1);
  assert.deepStrictEqual(rows.map((r) => r.flags), tree.map((r) => r.flags));
});

test('бит 7 отмечает лист', () => {
  const rows = mmiTree(section(tree));
  assert.deepStrictEqual(rows.map((r) => r.leaf), [false, false, true, true]);
});

test('шапка: длина первой области равна имён × 3', () => {
  const sec = section(tree);
  const h = mmiHeader(sec);
  assert.strictEqual(h.names, tree.length);
  assert.strictEqual(h.tree.len, tree.length * MMI_REC);
  assert.strictEqual(h.version, 0x00020000);
});

test('корень записывается как 0xFFFF', () => {
  const body = mmiBuildTree(tree);
  assert.strictEqual(body.readUInt16BE(1), 0xffff);
  assert.strictEqual(body.readUInt16BE(1 + MMI_REC), 0);
});
