'use strict';
// Пересборка контейнера FLDB из его содержимого.
// Использование: node src/repack.js <исходный.db> [выходной.db]
// Без второго аргумента делает round-trip: пересобирает в память и сравнивает
// с оригиналом побайтно. Это проверка того, что формат понят полностью.
//
// Правило раскладки (выведено из данных и подтверждено):
//   данные начинаются с первой границы 2048 после конца каталога,
//   каждый следующий файл — с очередной границы 2048,
//   общий размер тоже дополняется до границы 2048.

const fs = require('fs');
const fldb = require('./fldb');

const ALIGN = 2048;
const align = n => Math.ceil(n / ALIGN) * ALIGN;

// drop — необязательная функция, получает запись и возвращает true,
// если её нужно исключить из пересобранного контейнера.
function build(srcPath, drop) {
  const db = fldb.open(srcPath);
  const all = fldb.entries(db);
  const list = drop ? all.filter(e => !drop(e)) : all;
  const dropped = all.length - list.length;

  // шапка до начала каталога копируется как есть (заголовок + блок dbinfo),
  // но количество файлов в заголовке приходится поправить
  const head = Buffer.alloc(fldb.DIR_OFFSET);
  fs.readSync(db.fd, head, 0, head.length, 0);
  head.writeUInt32LE(list.length, 0x0c);

  const dirEnd = fldb.DIR_OFFSET + list.length * fldb.ENTRY_SIZE;
  let pos = align(dirEnd);
  const placed = [];
  for (const e of list) {
    placed.push({ entry: e, offset: pos });
    pos = align(pos + e.size);
  }

  const out = Buffer.alloc(pos, 0);
  head.copy(out, 0);

  placed.forEach((p, i) => {
    const o = fldb.DIR_OFFSET + i * fldb.ENTRY_SIZE;
    out.writeUInt32LE(p.offset, o);
    out.writeUInt32LE(p.entry.size, o + 4);
    out.write(p.entry.name, o + 8, 24, 'latin1');
    // Сумма переносится как есть: алгоритм не опознан, а при установке
    // это поле не проверяется — см. раздел о проверках целостности в README.
    out.writeUInt32LE(p.entry.checksum, o + 32);
    fldb.read(db, p.entry).copy(out, p.offset);
  });

  return { out, list, placed, dropped };
}

module.exports = { build, align, ALIGN };

if (require.main === module) {
  const src = process.argv[2];
  const dst = process.argv[3];
  if (!src) { console.error('использование: node src/repack.js <исходный.db> [выходной.db]'); process.exit(1); }

  const { out, list, placed } = build(src);
  console.log('исходник :', src);
  console.log('файлов   :', list.length);
  console.log('размер   : собрано', out.length, ' оригинал', fs.statSync(src).size);

  const mismatched = placed.filter(p => p.offset !== p.entry.offset);
  console.log('смещения : совпали у', placed.length - mismatched.length, 'из', placed.length);
  if (mismatched.length) {
    for (const m of mismatched.slice(0, 5))
      console.log('   расхождение:', m.entry.name, 'ожидалось', m.entry.offset, 'получено', m.offset);
  }

  if (dst) {
    fs.writeFileSync(dst, out);
    console.log('записано :', dst);
  } else {
    const orig = fs.readFileSync(src);
    const same = orig.length === out.length && orig.equals(out);
    console.log('round-trip: ' + (same ? 'ПОБАЙТНО ИДЕНТИЧНО' : 'ЕСТЬ РАСХОЖДЕНИЯ'));
    if (!same) {
      let first = -1;
      const n = Math.min(orig.length, out.length);
      for (let i = 0; i < n; i++) if (orig[i] !== out[i]) { first = i; break; }
      console.log('   первое различие по смещению', first);
    }
  }
}
