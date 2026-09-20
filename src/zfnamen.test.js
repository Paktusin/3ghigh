'use strict';
// Проверка раздела ZF-NAMEN. Тесты автономные: карта не нужна, таблица
// токенов синтетическая. Кодировщик проверяется настоящим декодером — тем же,
// что читает данные с диска.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const xac = require('./xac');
const Z = require('./zfnamen');

// Таблица, повторяющая устройство настоящей: токен 0 — «конец», токены с 0x02
// внутри кончают имя, остальные просто подставляют свои байты.
function table() {
  const t = [
    Buffer.from([2]),                      // 0: пустой конец
    Buffer.from('ST', 'latin1'),           // 1
    Buffer.from('RASSE', 'latin1'),        // 2
    Buffer.from('BAHN', 'latin1'),         // 3
    Buffer.from([0x29, 2]),                // 4: ')' и конец
    Buffer.from('A', 'latin1'),            // 5
    Buffer.from([0x39, 2]),                // 6: '9' и конец
    Buffer.from('WEG', 'latin1'),          // 7
  ];
  t.stamp = 0x363da028;
  return t;
}

// Байты имени вручную: код 1 — литерал, 3 — серия, k+6 — токен k.
const T = (k) => k + 6;

test('разбор: литерал, серия, токен и конец', () => {
  const tok = table();
  const buf = Buffer.from([1, 0x58, 3, 3, 0x59, 0x5a, 0x30, T(1), T(2), 2]);
  const r = Z.decode(buf, 0, tok);
  assert.equal(r.text, 'XYZ0STRASSE');
  assert.equal(r.end, buf.length);
});

test('разбор: 0x02 внутри токена кончает имя', () => {
  const tok = table();
  const buf = Buffer.from([T(5), T(6), T(1), T(1)]);
  const r = Z.decode(buf, 0, tok);
  assert.equal(r.text, 'A9', 'токен «9\\x02» и выдаёт знак, и кончает имя');
  assert.equal(r.end, 2, 'хвост не читается');
});

test('разбор: токен 0 — это пустой конец', () => {
  const tok = table();
  const r = Z.decode(Buffer.from([T(3), T(0)]), 0, tok);
  assert.equal(r.text, 'BAHN');
  assert.equal(r.end, 2);
});

test('разбор: литерал 0x02 тоже кончает имя', () => {
  const tok = table();
  const r = Z.decode(Buffer.from([1, 0x41, 1, 2, T(3)]), 0, tok);
  assert.equal(r.text, 'A');
  assert.equal(r.end, 4);
});

test('разбор: коды 0, 4 и 5 — ошибка, как в прошивке', () => {
  const tok = table();
  for (const c of [0, 4, 5]) {
    const r = Z.decode(Buffer.from([c, 0, 0]), 0, tok);
    assert.ok(r.err, 'код ' + c + ' должен быть отвергнут');
    assert.match(r.err, new RegExp('код ' + c));
  }
});

test('сборка имени: собранное читается обратно тем же текстом', () => {
  const tok = table();
  const cases = ['STRASSE', 'BAHNWEG', 'A9', 'ABC', '', 'STRASSE)', 'ÜBERWEG'];
  for (const text of cases) {
    const b = Z.encode(text, tok);
    const r = Z.decode(b, 0, tok);
    assert.equal(r.text, text, JSON.stringify(text));
    assert.equal(r.end, b.length, JSON.stringify(text) + ': длина');
  }
});

test('сборка имени: конец ставится токеном, а не кодом 2', () => {
  const tok = table();
  // «A9» кончается токеном «9\x02»; явного кода 2 в потоке быть не должно
  const b = Z.encode('A9', tok);
  assert.deepEqual([...b], [T(5), T(6)]);
  // у имени без подходящего токена-с-концом конец — это токен 0
  const c = Z.encode('BAHN', tok);
  assert.deepEqual([...c], [T(3), T(0)]);
  assert.ok(![...c].includes(2), 'код 2 не используется, пока есть токен 0');
});

test('сборка имени: берётся самый длинный токен, остальное — литералы', () => {
  const tok = table();
  const b = Z.encode('QSTRASSE', tok);
  assert.deepEqual([...b], [1, 0x51, T(1), T(2), T(0)],
    'один литерал кодом 1, дальше ST и RASSE');
  const c = Z.encode('QQQBAHN', tok);
  assert.deepEqual([...c], [3, 3, 0x51, 0x51, 0x51, T(3), T(0)],
    'три литерала подряд — кодом 3');
});

test('раздел: собирается и читается обратно теми же именами', () => {
  const tok = table();
  const names = [
    { text: 'ASTRASSE', kind: 4 },
    { text: 'ASTRASSE 12', kind: 4 },
    { text: 'BAHNWEG', kind: 2 },
    { text: 'BAHNWEGSTRASSE', kind: 2 },
    { text: 'WEG', kind: 2 },
  ];
  const sec = Z.buildSection(names, tok);

  const s = xac.sections(sec);
  assert.equal(s.complete, true, 'раздел покрывает буфер целиком');
  assert.equal(s.list[0].name, 'ZF-NAMEN');
  assert.equal(sec.length % 4, 0, 'раздел выровнен на четыре байта');
  assert.equal(sec.readUInt32BE(0x3c), 0x363da028, 'печать таблицы токенов');

  const m = Z.readSection(sec, tok);
  assert.equal(m.count, names.length);
  assert.equal(m.clean, true, 'имён в потоке столько же, сколько записей группы 1');
  assert.deepEqual(m.names.map((n) => n.text), names.map((n) => n.text));
  assert.deepEqual(m.names.map((n) => n.kind), names.map((n) => n.kind));
});

test('раздел: приставка берётся от предыдущего имени', () => {
  const tok = table();
  const sec = Z.buildSection([
    { text: 'ASTRASSE' }, { text: 'ASTRASSE 12' }, { text: 'BAHN' },
  ], tok);
  const m = Z.readSection(sec, tok);
  assert.deepEqual(m.names.map((n) => n.prefix), [0, 8, 0]);
  assert.equal(m.names[1].tail, ' 12', 'в потоке лежит только хвост');
});

test('раздел: ключ ставится на каждое шестнадцатое имя', () => {
  const tok = table();
  const names = [];
  for (let i = 0; i < 40; i++) names.push({ text: 'WEG' + String(i).padStart(4, '0') });
  const sec = Z.buildSection(names, tok);
  const m = Z.readSection(sec, tok);
  assert.equal(m.keys.length, Math.ceil(names.length / Z.STRIDE), 'ключей ceil(имён/16)');
  for (let j = 0; j < m.keys.length; j++) {
    const i = j * Z.STRIDE;
    assert.equal(m.keys[j].key, names[i].text.slice(0, Z.KEY),
      'ключ ' + j + ' — первые восемь знаков имени ' + i);
    assert.equal(m.keys[j].offset, m.names[i].at, 'ключ ' + j + ' указывает на имя ' + i);
  }
});

test('раздел: пустой список отвергается не молча', () => {
  const tok = table();
  const sec = Z.buildSection([], tok);
  const m = Z.readSection(sec, tok);
  assert.equal(m.count, 0);
  assert.equal(m.names.length, 0);
  assert.equal(m.keys.length, 0);
});

test('раздел: хвостовая группа переносится как есть', () => {
  const tok = table();
  const data = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
  const sec = Z.buildSection([{ text: 'WEG' }], tok, { count: 0, group3: { count: 2, data } });
  assert.equal(sec.readUInt32BE(0x40), 2);
  assert.equal(sec.readUInt32BE(0x48), 8);
  const m = Z.readSection(sec, tok);
  assert.ok(m.group3.data.equals(data));
});

test('указатель токенов: токен-с-концом не попадает в обычные', () => {
  const tok = table();
  const idx = Z.tokenIndex(tok);
  assert.equal(idx.plain.get('ST'), 1);
  assert.equal(idx.plain.get(')'), undefined, '«)\\x02» нельзя ставить в середину');
  assert.equal(idx.final.get(')'), 4);
  assert.equal(idx.final.get(''), 0, 'токен 0 — пустой конец');
});
