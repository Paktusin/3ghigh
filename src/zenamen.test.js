'use strict';
// Автономные тесты адресной иерархии ZE-NAMEN-MMI.
const test = require('node:test');
const assert = require('node:assert');
const { mmiHeader, mmiTree, mmiBuildTree, MMI_REC } = require('./zenamen');
const ze = require('./zenamen');

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

// --- раскладка имён между ключами: чтение и запись ------------------------

test('имена: свой раздел читается обратно теми же именами', () => {
  const names = ['ACHNA', 'AGIA NAPA', 'AGIOS THEODOROS', 'AKAKI', 'LARNACA', 'LEMESOS',
                 'LIMASSOL', 'NICOSIA', 'PAFOS', 'PARALIMNI', 'POLIS', 'STROVOLOS'];
  const b = ze.buildSection({ names, country: 113, version: 3 });
  const h = ze.header(b);
  assert.equal(h.version, 3, 'версия ORTSNAMEN');
  assert.equal(h.country, 113, 'номер страны на месте');
  assert.equal(h.index.names, names.length);
  assert.equal(h.keys, Math.ceil(names.length / ze.STRIDE), 'ключей ceil(имён/16)');

  const r = ze.allNames(b, h);
  assert.equal(r.err, null, 'разбор без ошибок');
  assert.deepEqual(r.names, names, 'имена те же');
  assert.equal(r.end, r.len, 'поток съеден ровно до последнего байта');
});

test('имена: приставка берётся от предыдущего имени, ключ её не наследует', () => {
  const names = [];
  for (let i = 0; i < 40; i++) names.push('LIMASSOL STREET ' + String(i).padStart(2, '0'));
  const b = ze.buildSection({ names });
  const h = ze.header(b);
  // у имени на ключе приставки быть не может: блок читается с него
  for (let k = 0; k < h.keys; k++) {
    assert.equal(b[h.perName.off + k * ze.STRIDE * 2 + 1] & 0x1f, 0,
      'имя ' + k * ze.STRIDE + ' — на ключе, приставка должна быть нулевой');
  }
  // у соседнего имени приставка ненулевая: тексты почти одинаковые
  assert.ok((b[h.perName.off + 3] & 0x1f) > 0, 'у второго имени приставка есть');
  assert.deepEqual(ze.allNames(b, h).names, names, 'и всё равно читается обратно');
});

test('имена: ключи стоят на каждом шестнадцатом и указывают в поток', () => {
  const names = [];
  for (let i = 0; i < 35; i++) names.push('NAME' + String(i).padStart(3, '0'));
  const b = ze.buildSection({ names });
  const h = ze.header(b);
  const ks = ze.keys(b, h);
  assert.equal(ks.length, 3);
  ks.forEach((k, i) => {
    assert.equal(k.name, i * ze.STRIDE, 'ключ ' + i + ' стоит на своём имени');
    assert.equal(k.key, names[i * ze.STRIDE].slice(0, 8), 'текст ключа');
    const r = ze.nameAt(b, k.offset, ze.tokens(b, h), h);
    assert.equal(r.text, names[i * ze.STRIDE], 'по смещению ключа лежит его имя');
  });
});

test('имена: байт 0x02 в имени отвергается, пустой список тоже', () => {
  assert.throws(() => ze.buildSection({ names: ['A\u0002B'] }), /0x02/);
  assert.throws(() => ze.buildSection({ names: [] }), /пустой список/);
});

test('распаковка: приставка длиннее предыдущего имени означает повтор', () => {
  // ровно этим приёмом пользуется завод: такое имя занимает в потоке ноль байт
  const tok = [Buffer.from([2])];
  const prev = Buffer.from('GIBRALTAR\0', 'latin1');
  const r = ze.unpackName(Buffer.alloc(0), 0, tok, prev, 20);
  assert.equal(r.name.toString('latin1'), 'GIBRALTAR');
  assert.equal(r.end, 0, 'поток не сдвинулся');
  assert.equal(r.inherited, true);
});
