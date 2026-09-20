// Чтение названий из LIT.
//
// Имена собираются из четырёх слоёв, все разобраны:
//   1. записи идут по алфавиту;
//   2. перед строкой лежит упакованный байт: младшие 5 бит — длина
//      (31 — escape на двухбайтовую), старшие 3 бита — длина общей приставки
//      с предыдущим именем;
//   3. приставка отсчитывается в БАЙТАХ сжатой формы, а не в символах:
//      один байт может раскрыться в два символа. Значение 7 — потолок, а не
//      escape: такие записи читаются не хуже прочих (82.8 % против 84 % у 6);
//   4. байты-коды раскрываются словарём блока (src/litdict.js).
'use strict';

const lit = require('./lit');
const S = require('./litschema');
const V = require('./litvm');
const D = require('./litdict');
const fs = require('fs');

const NAME = 0x3b;                                  // поле названия в структуре 0x30

function schemaOf(file) {
  const pre = Buffer.alloc(8192);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, pre, 0, 8192, 0);
  fs.closeSync(fd);
  const at = pre.indexOf(Buffer.from([0x4c, 0x69, 0x74, 0x02]));
  if (at < 0) throw new Error('магия Lit\\x02 не найдена в ' + file);
  return S.load(file, at);
}

// Названия одного блока, в файловом порядке.
function namesOf(schema, block, opt) {
  const r = V.run(schema, block, 0, Object.assign({ limit: 2000000 }, opt));
  const items = r.strings.filter((s) => s.type === NAME).sort((a, b) => a.at - b.at);
  const out = [];
  let prev = Buffer.alloc(0);
  for (const it of items) {
    const raw = Buffer.concat([prev.subarray(0, Math.min(it.pre, prev.length)), it.txt]);
    out.push(D.expand(r.codes, raw).toString('utf8'));
    prev = raw;
  }
  return out;
}

function open(dirs) {
  const L = lit.open(dirs);
  const schema = schemaOf(L.vols[0].file);
  return { lit: L, schema, names: (e) => namesOf(schema, L.block(e)) };
}

module.exports = { open, namesOf, schemaOf, NAME };

if (require.main === module) {
  const dirs = process.argv[2] === 'pit'
    ? ['maps/pkgdb/PIT']
    : ['maps/pkgdb/LIT', 'maps/pkgdb/LIT2', 'maps/pkgdb/LIT3', 'maps/pkgdb/LIT4'];
  const want = Number(process.argv[3] || 200);
  const N = open(dirs);
  const cat = N.lit.catalog();
  const step = Math.max(1, Math.floor(cat.length / want));
  const seen = new Set();
  for (let i = 0; i < cat.length; i += step) {
    for (const nm of N.names(cat[i])) {
      const t = nm.replace(/[\x00-\x1f]/g, '').trim();
      if (t.length >= 3 && !seen.has(t)) { seen.add(t); console.log(t); }
    }
  }
  console.error('разных названий: %d (блоков просмотрено %d)', seen.size, Math.ceil(cat.length / step));
}
