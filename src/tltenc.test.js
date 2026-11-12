'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fldb = require('./fldb');
const tlt = require('./tlt');
const enc = require('./tltenc');

// Круг «разобрал заводскую таблицу → собрал → разобрал свою»: всё, что читает
// прошивка (записи, имена, координаты, растр), должно совпасть.
const DB = 'maps/pkgdb/TMC/kN221EUx01t01.db';

test('таблицы TMC: заводская → сборка → разбор сходятся', { skip: !fs.existsSync(DB) }, () => {
  const db = fldb.open(DB);
  for (const e of fldb.entries(db).filter(e => /_\d+_\d+\.tlt$/.test(e.name))) {
    const d = fldb.read(db, e), [, cc, ltn] = e.name.match(/_(\d+)_(\d+)\./).map(Number);
    const names = tlt.names(d), recs = tlt.records(d), xy = tlt.xy(d), br = tlt.br(d);
    const out = enc.build({ cc, ltn, file: e.name, recs, names, tok: names.tok, xy, br });
    assert.deepEqual(tlt.records(out), recs, e.name + ' записи');
    assert.deepEqual([...tlt.names(out)], [...names], e.name + ' имена');
    assert.deepEqual(tlt.xy(out), xy, e.name + ' координаты');
    assert.deepEqual(tlt.br(out), br, e.name + ' растр');
  }
});

test('реестр EJ211_global.tlt: разбор → сборка байт в байт', { skip: !fs.existsSync(DB) }, () => {
  const db = fldb.open(DB), es = fldb.entries(db);
  const g = fldb.read(db, es.find(e => /global\.tlt$/.test(e.name))), list = tlt.ov(g);
  assert.ok(enc.ov(list).equals(g));
  for (const t of list) assert.deepEqual(enc.blocks(fldb.read(db, es.find(e => e.name === t.file))), t.blocks, t.file);
});
