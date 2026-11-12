'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const cyp = require('./cyptmc');
const tlt = require('./tlt');
const enc = require('./tltenc');

const PBF = 'out/cyp/cyprus-latest.osm.pbf';

test('кипрская таблица TMC: сборка читается и самосогласована', { skip: !fs.existsSync(PBF) }, () => {
  const t = cyp.table(cyp.build(PBF));
  const d = enc.build({ cc: 2, ltn: 1, file: 'EJ211_02_01.tlt', recs: t.recs, names: t.names,
    tok: [Buffer.from([2])], xy: t.xy, br: cyp.raster(t.xy) });
  const r = tlt.records(d), by = new Set(r.map(x => x.loc));
  assert.deepEqual(r, t.recs);
  assert.deepEqual([...tlt.names(d)], t.names);
  assert.deepEqual(tlt.xy(d), t.xy);
  // как у завода: каждое имя использовано, ссылки целы, цепочки замкнуты
  assert.equal(new Set(r.flatMap(x => [x.n10, x.n14, x.n18, x.n1c]).filter(Boolean)).size, t.names.length);
  for (const x of r) for (const k of ['neg', 'pos', 'area', 'line']) if (x[k]) assert.ok(by.has(x[k]), `${x.loc}.${k}`);
  assert.equal(r.filter(x => x.neg).length, r.filter(x => x.pos).length);
  for (const q of t.xy) assert.ok(q.start[0] / 72000 > 32 && q.start[0] / 72000 < 34.7 && q.start[1] / 111111.11 > 34.5 && q.start[1] / 111111.11 < 35.8);
});

test('латиница: греческое имя в Latin-1 с регистром', () => {
  assert.equal(cyp.latin('Λεμεσός'), 'Lemesos');
  assert.equal(cyp.latin('Χοιροκοιτία'), 'Choirokoitia');
});
