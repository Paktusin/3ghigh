'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('./mkxac');
const X = require('./xah');
const st = require('./struktur');
const fldb = require('./fldb');

// Тайл-образец: собирать его целиком тут незачем, достаточно цепочки разделов
// в том же виде, в каком её читает xac.sections.
function fakeTile(sections) {
  const parts = [];
  for (const [name, len] of sections) {
    const head = Buffer.alloc(20, 0x20);
    head.write(name, 0, 'latin1');
    head.writeUInt32BE(len, 16);
    parts.push(head, Buffer.alloc(len));
  }
  return Buffer.concat(parts);
}

const TILE = fakeTile([['XAC HEADER', 176], ['ZF-NAMEN', 92],
                       ['VEKTORBLOCK', 1000], ['VEKTORBLOCK', 2000],
                       ['ZE-NAMEN', 500], ['ZE-NAMEN-MMI', 100],
                       ['HAUSNUMMERN', 300], ['RASTERINFOS', 320]]);

test('запись реестра берёт смещения и размеры из самого тайла', () => {
  const r = M.strukturRecord('CY00', TILE);
  assert.equal(r.length, st.REC);
  assert.equal(r.toString('latin1', 0, 4), 'CY00');
  const vbSize = (1000 + 20) + (2000 + 20);
  assert.equal(r.readUInt32BE(4), vbSize, 'граница групп уровня 1');
  assert.equal(r.readUInt32BE(0x44), vbSize);
  // ZE-NAMEN лежит после шапки, имён ведения и двух блоков
  const zeAt = (176 + 20) + (92 + 20) + (1000 + 20) + (2000 + 20);
  assert.equal(r.readUInt32BE(0x14), zeAt);
  assert.equal(r.readUInt32BE(0x18), 500 + 20);
  assert.equal(r.readUInt32BE(0x2c), 0, 'LOCAL POIS у нас нет — нули');
  assert.equal(r.readUInt32BE(0x30), 0);
});

test('строка уровня 1 несёт рамку, число блоков и область VEKTORBLOCK', () => {
  const box = [100, 200, 300, 400];
  const row = M.levelRow(TILE, box, 1, null);
  assert.deepEqual([0, 4, 8, 12].map((o) => row.readUInt32BE(o)), box);
  assert.equal(row.readUInt16BE(0x10), 2, 'блоков');
  assert.equal(row.readUInt16BE(0x12), 0, 'первый блок базы');
  assert.equal(row.readUInt32BE(0x18), (1000 + 20) + (2000 + 20));
});

test('уровни 2…4 объявляются пустыми, но счёт блоков уходит вперёд', () => {
  for (const n of [2, 3, 4]) {
    const row = M.levelRow(TILE, [0, 0, 0, 0], n, null);
    assert.equal(row.readUInt32BE(0), 0x7fffffff, 'уровень ' + n + ': данных нет');
    assert.equal(row.readUInt16BE(0x10), 0, 'блоков нет');
    assert.equal(row.readUInt16BE(0x12), 2, 'но первый блок уже за нашими двумя');
  }
});

test('контейнер FLDB собирается из файлов в памяти и читается обратно', () => {
  const head = Buffer.alloc(fldb.DIR_OFFSET);
  head.writeUInt32LE(fldb.DIR_OFFSET, 0);
  head.writeUInt32LE(36, 0x10);
  head.write('FLDB', 0x14, 'latin1');
  head.write('!dbinfo0001\r\nDB=1/3\r\n!enddbinfo', 0x20, 'latin1');

  const files = [{ name: 'EJ211.xah', data: Buffer.from('индекс') },
                 { name: 'EJ211_CY00_1.xac', data: Buffer.alloc(5000, 7) }];
  const buf = M.buildContainer(files, head);

  const tmp = require('path').join(require('os').tmpdir(), 'mkxac-' + process.pid + '.db');
  require('fs').writeFileSync(tmp, buf);
  const db = fldb.open(tmp);
  const ents = fldb.entries(db);
  assert.equal(ents.length, 2);
  assert.deepEqual(ents.map((e) => e.name), files.map((f) => f.name));
  assert.deepEqual(ents.map((e) => e.size), files.map((f) => f.data.length));
  assert.equal(fldb.verify(db).anomalies, 0, 'файлы выровнены по 2048 без дыр');
  for (let i = 0; i < files.length; i++) {
    assert.ok(fldb.read(db, ents[i]).equals(files[i].data));
    assert.equal(ents[i].checksum, fldb.checksum(files[i].data), 'сумма записи каталога считается');
  }
  assert.ok(db.dbinfo.indexOf('DB=1/1') >= 0, 'контейнер один, значит 1/1');
  require('fs').unlinkSync(tmp);
});
