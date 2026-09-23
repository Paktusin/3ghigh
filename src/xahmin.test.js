'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const X = require('./xah');
const st = require('./struktur');
const fg = require('./fegruppen');
const { mkxah } = require('./xahmin');

// Маленький индекс на три тайла, собранный нашими же писателями. Мерило здесь
// не «совпало с заводом», а «после выброса тайла всё сошлось само с собой»:
// нумерация блоков сквозная, ссылки не ведут за пределы.
function fakeXah() {
  const head = Buffer.alloc(140);
  head.writeUInt16BE(8, 0x14 - 20);                 // версия
  X.BITS_OK.forEach((b, i) => { head[0x6c - 20 + i] = b; });
  head.writeUInt32BE(3, 0x48 - 20);                 // тайлов
  head.writeUInt32BE(60, 0x4c - 20);                // блоков
  head.writeUInt32BE(1, 0x50 - 20);                 // областей L3

  const reg = Buffer.alloc(4 + 3 * st.REC);         // головка 4 байта + записи
  ['AA00', 'BB00', 'CC00'].forEach((c, i) => reg.write(c, 4 + i * st.REC, 'latin1'));

  const level = (counts) => {
    const b = Buffer.alloc(4 + 3 * st.LEVEL_REC);
    counts.forEach((n, i) => b.writeUInt16BE(n, 4 + i * st.LEVEL_REC + 0x10));
    return b;
  };
  // Уровень 1 несёт блоки, прочие пусты: 10 + 20 + 30 = 60.
  const l1 = level([10, 20, 30]), l0 = level([0, 0, 0]);

  const nb = st.buildNeighbors([[1], [0, 2], [1]], Buffer.from([0, 1, 0, 0]));

  const feHead = Buffer.alloc(14);                  // головка до +0x21 включительно
  const fe = fg.build({ head: feHead, gap: 0, tail: 0,
                        groups: [{ id: 0, tiles: [0, 1] }, { id: 1, tiles: [2] }],
                        lands: [{ id: 7, byte6: 0, flags: 0, value: 0, tiles: [0, 1, 2] }] });
  const l3 = fg.buildL3({ head: Buffer.alloc(8), tail: 0,
                          groups: [{ id: 0, tiles: [0, 1, 2] }] });

  return X.build([
    { name: 'XACDB HEADER', data: head },
    { name: 'STRING', data: Buffer.from('таблица не зависит от тайлов', 'latin1') },
    { name: 'XAC-STRUKTUR', data: reg },
    { name: 'XAC-STRUKTUR L1', data: l1 },
    { name: 'XAC-STRUKTUR L2', data: l0 },
    { name: 'XAC-STRUKTUR L3', data: l0 },
    { name: 'XAC-STRUKTUR L4', data: l0 },
    { name: 'FE GRUPPEN', data: fe },
    { name: 'L3 GRUPPEN', data: l3 },
    { name: 'NACHBARN', data: nb },
    { name: 'BUILD INFOS', data: Buffer.from('[BUILD]', 'latin1') },
  ]);
}

test('остаются только названные тайлы, порядок реестра сохраняется', () => {
  const r = mkxah(fakeXah(), ['CC00', 'AA00']);
  assert.deepEqual(r.order, ['AA00', 'CC00']);
  assert.deepEqual([...st.parse(r.buf).keys()], ['AA00', 'CC00']);
  assert.equal(X.header(r.buf).tiles, 2);
});

test('нумерация блоков пересчитывается сквозь, и счётчик шапки сходится', () => {
  const r = mkxah(fakeXah(), ['CC00', 'AA00']);          // 10 + 30 блоков
  const lv = st.parseLevels(r.buf);
  assert.equal(lv[1].rows[0].firstBlock, 0);
  assert.equal(lv[1].rows[1].firstBlock, 10);           // после AA00 с десятью
  assert.equal(X.header(r.buf).blocks, 40);
});

test('соседи переведены в новую нумерацию, связь с выброшенным убрана', () => {
  const r = mkxah(fakeXah(), ['AA00', 'CC00']);
  // было AA00->BB00, BB00->AA00,CC00, CC00->BB00; BB00 выброшен
  assert.deepEqual(st.parseNeighbors(r.buf), [[], []]);
});

test('группы и страны переведены, опустевшие выброшены', () => {
  const r = mkxah(fakeXah(), ['BB00', 'CC00']);
  const fe = fg.read(r.buf);
  assert.deepEqual(fe.groups.map((g) => g.tiles), [[0], [1]]);
  assert.deepEqual(fe.lands[0].tiles, [0, 1]);
  const r2 = mkxah(fakeXah(), ['AA00']);
  assert.equal(fg.read(r2.buf).groups.length, 1, 'группа без своих тайлов не пишется');
});

test('неразобранные таблицы не переносятся, а нужные остаются', () => {
  const names = X.sections(mkxah(fakeXah(), ['AA00']).buf).list.map((s) => s.name);
  assert.ok(names.indexOf('BUILD INFOS') >= 0, 'BUILD INFOS обязателен при версии 8');
  assert.ok(names.indexOf('STRING') >= 0);
  assert.equal(names.indexOf('FE_MIX_INFO'), -1);
});

test('неизвестный тайл отвергается не молча', () => {
  assert.throws(() => mkxah(fakeXah(), ['ZZ99']), /тайла ZZ99 в реестре нет/);
});
