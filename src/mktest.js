'use strict';
// Опыт, разделяющий причины: НАША сборка контейнера, ЗАВОДСКИЕ данные.
//
//   node src/mktest.js out/test-malta --tile MJ00
//
// Зачем. Полный кипрский образ на чистом разделе принят описателем, но ядро
// объявляет `StateOfOperation FATAL_ERROR` через полсекунды после старта
// инициализации (docs/device.md). Причина уходит в канал нав-ядра, которого в
// `sloginfo` нет, и различить две гипотезы нечем:
//
//   * неверна наша СБОРКА контейнера — индекс, упаковка, состав;
//   * неверны наши ДАННЫЕ — тайл, имена, растр.
//
// Этот набор их разделяет. Контейнер собирается нашим кодом (индекс из
// `src/xahmin.js`, растр из `src/rasidx.js`, упаковка FLDB из `src/mkxac.js`),
// а данные внутри — заводские, до последнего байта: файлы тайла, справочники
// имён городов, заглушки. Берётся островная страна с одним тайлом — точный
// аналог кипрской раскладки.
//
//   поднялась навигация  → сборка верна, виноваты наши данные;
//   тот же FATAL_ERROR   → виновата сборка, данные ни при чём.
//
// Ставится ОДИН компонент `XAC` поверх уже установленного образа: остальные
// файлы на разделе не меняются, описатель не трогается — имена те же.

const fs = require('fs');
const path = require('path');
const fldb = require('./fldb');
const xac = require('./xac');
const st = require('./struktur');
const ras = require('./rasidx');
const { mkxah } = require('./xahmin');
const { buildContainer } = require('./mkxac');
const conf = require('./conf');
const dataset = require('./dataset');

function mktest(outDir, opt) {
  const o = opt || {};
  const log = o.log || (() => {});
  const root = o.root || dataset.resolveRoot();
  const code = (o.tile || 'MJ00').toUpperCase();

  // заводской контейнер с индексом
  const dir = path.join(root, 'pkgdb', 'XAC');
  const srcName = fs.readdirSync(dir).find((f) => /\.db$/i.test(f));
  const db = fldb.open(path.join(dir, srcName));
  const ents = fldb.entries(db);
  const headSrc = Buffer.alloc(fldb.DIR_OFFSET);
  fs.readSync(db.fd, headSrc, 0, headSrc.length, 0);
  const xahE = ents.find((e) => /\.xah$/.test(e.name));
  const xahSrc = fldb.read(db, xahE);
  const prefix = xahE.name.replace(/\.xah$/, '');

  // ---- индекс: тот же заводской, но с одним тайлом ----
  const r = mkxah(xahSrc, [code]);
  log('индекс: тайл ' + code + ', блоков ' + r.blocks + ', ' + r.buf.length + ' б');

  // ---- файлы тайла: заводские, как есть ----
  // Тайлы разнесены по трём контейнерам (`XAC`, `XAC2`, `XAC3`), а индекс один,
  // поэтому файл ищется во всех.
  const files = [{ name: prefix + '.xah', data: r.buf }];
  let tileBytes = 0;
  for (const d of fs.readdirSync(path.join(root, 'pkgdb'))) {
    if (!/^XAC/.test(d)) continue;
    for (const f of fs.readdirSync(path.join(root, 'pkgdb', d))) {
      if (!/\.db$/i.test(f)) continue;
      const cdb = fldb.open(path.join(root, 'pkgdb', d, f));
      for (const e of fldb.entries(cdb)) {
        if (e.name.indexOf('_' + code + '_') < 0 || !/\.xac$/.test(e.name)) continue;
        files.push({ name: e.name, data: fldb.read(cdb, e) });
        tileBytes += e.size;
      }
      fs.closeSync(cdb.fd);
    }
  }
  if (!files.some((f) => /_1\.xac$/.test(f.name))) throw new Error('файл тайла ' + code + ' не найден');
  log('файлы тайла: ' + (files.length - 1) + ', ' + (tileBytes / 1048576).toFixed(2) + ' МБ (заводские)');

  // ---- справочники имён и заглушки: все, чтобы снять вопрос об именовании ----
  let extra = 0;
  for (const e of ents) {
    if (!/\.(ort|plz|poi)$/.test(e.name)) continue;
    files.push({ name: e.name, data: fldb.read(db, e) });
    extra += e.size;
  }
  log('справочники .ort/.plz/.poi: все заводские, ' + (extra / 1048576).toFixed(2) + ' МБ');

  // ---- растр: свой, по рамке тайла ----
  const lv = st.parseLevels(r.buf);
  const bb = lv[1].rows[0].bbox;
  const rr = ras.blank({ bbox: bb });
  const fill = ras.fill(rr, bb, 0);
  files.push({ name: prefix + '.ras', data: ras.build(rr) });
  log('растр: сетка ' + rr.nx + '×' + rr.ny + ', занято ' + fill.taken + ' ячеек');

  files.sort((a, b) => (a.name < b.name ? -1 : 1));
  const container = buildContainer(files, headSrc);

  // ---- компонент ----
  const outPkg = path.join(outDir, 'pkgdb', 'XAC');
  fs.mkdirSync(outPkg, { recursive: true });
  const dst = path.join(outPkg, srcName);
  fs.writeFileSync(dst, container);
  const cf = fs.readdirSync(dir).find((f) => f.endsWith('.conf'));
  fs.copyFileSync(path.join(dir, cf), path.join(outPkg, cf));
  conf.updateConf(path.join(outPkg, cf), dst);

  for (const f of ['DBInfo.txt', 'config.nfm', 'build1']) {
    const p = path.join(root, f);
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(outDir, f));
  }
  const copyDir = (d) => {
    const from = path.join(root, 'pkgdb', d);
    if (!fs.existsSync(from)) return;
    const to = path.join(outDir, 'pkgdb', d);
    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(to, f));
  };
  const style = fs.readdirSync(path.join(root, 'pkgdb')).find((d) => /^StyleDBMMI3G_/.test(d));
  if (style) copyDir(style);
  copyDir('NaviPersistence_ALL_3');

  return { outDir, code, file: srcName, size: container.length, files: files.length,
           blocks: r.blocks, bbox: bb };
}

module.exports = { mktest };

if (require.main === module) {
  const args = process.argv.slice(2);
  const outDir = args[0];
  const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
  if (!outDir || outDir.startsWith('--')) {
    console.error('использование: node src/mktest.js <каталог-выхода> [--tile MJ00]');
    process.exit(2);
  }
  const r = mktest(outDir, { tile: flag('tile', 'MJ00'), log: (m) => console.log(m) });
  console.log();
  console.log('готово: ' + outDir + ' — компонент XAC, ' +
              (r.size / 1048576).toFixed(2) + ' МБ, файлов ' + r.files);
  console.log('ставить ОДИН компонент XAC поверх: остальное на разделе не меняется');
  console.log('дальше: node src/mkmeta.js ' + outDir + ' --keep-pkg');
}
