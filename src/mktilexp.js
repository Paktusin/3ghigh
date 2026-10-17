'use strict';
// Опыт, делящий наш XAC пополам: НАШ индекс и контейнер, ЗАВОДСКОЙ тайл.
//
//   node src/mktilexp.js out/cyp-tilexp [--tile AB00]
//
// Индекс `.xah`, растр, заглушка уровня 2 и упаковка FLDB собираются теми же
// функциями `src/mkxac.js`, что и кипрский XAC. Вместо нашего тайла кладётся
// заводской файл уровня 1 — первый в реестре (`AB00`), потому что его блоки
// пронумерованы с нуля, как требует наш индекс из одного тайла. Рамка строки
// L1 и растр — кипрские: машина стоит на Кипре, и стартовым тайлом по
// координатам должен оказаться этот.
//
//   ядро поднялось  → индекс и контейнер верны, виноват наш тайл;
//   снова FATAL     → виноваты индекс или контейнер.
//
// Остальные компоненты берутся из `out/cyprus` (как в опыте с заводским XAC).

const fs = require('fs');
const path = require('path');
const fldb = require('./fldb');
const ras = require('./rasidx');
const conf = require('./conf');
const dataset = require('./dataset');
const M = require('./mkxac');

function mktilexp(outDir, code) {
  const root = dataset.resolveRoot();
  const dir = path.join(root, 'pkgdb', 'XAC');
  const srcName = fs.readdirSync(dir).find((f) => /\.db$/i.test(f));
  const db = fldb.open(path.join(dir, srcName));
  const ents = fldb.entries(db);
  const headSrc = Buffer.alloc(fldb.DIR_OFFSET);
  fs.readSync(db.fd, headSrc, 0, headSrc.length, 0);
  const xahE = ents.find((e) => /\.xah$/.test(e.name));
  const prefix = xahE.name.replace(/\.xah$/, '');
  const file1 = fldb.read(db, ents.find((e) => e.name === prefix + '_' + code + '_1.xac'));

  const cy = ras.open('out/cyprus');
  const box = cy.bbox;
  const file2 = M.stubLevel2(code, prefix + '_' + code + '_2', 0, '20260923120000');
  const xahBuf = M.buildXah(fldb.read(db, xahE), {
    file1,
    reg: M.strukturRecord(code, file1),
    rows: [1, 2, 3, 4].map((n) => M.levelRow(file1, box, n, file2)),
  });
  const r = ras.blank({ bbox: box });
  ras.fill(r, box, 0);

  const ours = fldb.open('out/cyprus/pkgdb/XAC/' + srcName);
  const keep = fldb.entries(ours).filter((e) => /_0\.(ort|plz|poi)$/.test(e.name))
    .map((e) => ({ name: e.name, data: fldb.read(ours, e) }));
  const files = [
    { name: prefix + '.ras', data: ras.build(r) },
    { name: prefix + '.xah', data: xahBuf },
    ...keep,
    { name: prefix + '_' + code + '_1.xac', data: file1 },
    { name: prefix + '_' + code + '_2.xac', data: file2 },
  ].sort((a, b) => (a.name < b.name ? -1 : 1));

  const outPkg = path.join(outDir, 'pkgdb', 'XAC');
  const dst = path.join(outPkg, srcName);
  fs.writeFileSync(dst, M.buildContainer(files, headSrc));
  conf.updateConf(path.join(outPkg, 'XAC.conf'), dst);
  return { files: files.map((f) => f.name + ':' + f.data.length), box };
}

module.exports = { mktilexp };

if (require.main === module) {
  const outDir = process.argv[2];
  const i = process.argv.indexOf('--tile');
  const code = i > 0 ? process.argv[i + 1] : 'AB00';
  if (!outDir) { console.error('использование: node src/mktilexp.js <набор> [--tile AB00]'); process.exit(2); }
  const r = mktilexp(outDir, code);
  console.log('XAC опыта: ' + r.files.join(' '));
  console.log('рамка L1 и растра (кипрская): ' + r.box.join(' '));
}
