'use strict';
// Набор, в котором блоки тайла собраны нашим генератором.
//
//   node src/mkgen.js <каталог-выхода> --tiles MJ00[,MJ01...]
//
// Зачем. Всё, что до сих пор ставилось на машину, — заводские байты, сдвинутые
// в другое место. Ни одного блока `VEKTORBLOCK`, собранного нами, движок ещё
// не видел, и пока он его не увидел, вся работа над генератором держится на
// собственных читателях. Этот набор и есть та проверка.
//
// Что делается: у каждого названного тайла все блоки версии 5 собираются
// заново из графа (`xacgraph.regenTile`) — с нашей раскладкой записей, нашей
// таблицей, нашими координатами. Геометрия при этом сохраняется точно: рёбра
// пересобранного тайла сверяются с исходными, и расхождение прекращает сборку.
//
// Тайл пересобирается ЦЕЛИКОМ, поэтому межблочные рёбра теперь переносятся
// тоже: номера записей раздаются сразу всем блокам тайла, и ссылка находит
// свою новую цель. Прежняя оговорка «маршрут через границу блоков не обязан
// строиться» снята.
//
// Почему набор получается минимальным по диффу. Наши блоки короче заводских
// (≈69 % байт: хвост записи вектора не разобран), поэтому каждый раздел
// дополняется нулями до прежней длины. Тогда не меняется ни длина файла, ни
// смещения разделов, а значит не нужно трогать ни реестр `XAC-STRUKTUR`, ни
// таблицы уровней, ни `NACHBARN`, ни растр. Меняется ровно один контейнер и
// внутри него ровно один файл на тайл.
//
// Чего набор не проверяет: связи с СОСЕДНИМИ тайлами. Нульвекторы своего тайла
// переносятся как есть, но встречные ссылки соседей ведут на старые смещения
// внутри пересобранного тайла и становятся висячими. Для острова это неважно —
// у Мальты соседи только паромные.
//
// После установки обязательно вернуть описатель:  tools/write_fixacios.sh
// Частичная установка сносит /HBpersistence/navi/db/acios_db.ini, и без него
// навигация встаёт на 28 % при любом содержимом.

const fs = require('fs');
const path = require('path');
const fldb = require('./fldb');
const xg = require('./xacgraph');
const st = require('./struktur');
const xr = require('./xacrec');
const conf = require('./conf');
const dataset = require('./dataset');

// Контейнер, в котором лежит файл, подходящий под условие.
function findContainer(root, pred) {
  const pkgdb = path.join(root, 'pkgdb');
  for (const d of fs.readdirSync(pkgdb)) {
    if (!/^XAC/.test(d)) continue;
    for (const f of fs.readdirSync(path.join(pkgdb, d))) {
      if (!f.toLowerCase().endsWith('.db')) continue;
      const p = path.join(pkgdb, d, f);
      const db = fldb.open(p);
      const ents = fldb.entries(db);
      if (ents.some(pred)) return { dir: d, file: f, path: p, db, ents };
    }
  }
  return null;
}

// Копия контейнера. На APFS клонирование мгновенно даже на двух гигабайтах.
function clone(src, dst, log) {
  const size = fs.statSync(src).size;
  log('копирую ' + path.basename(src) + ' (' + (size / 1048576).toFixed(0) + ' МБ)');
  try {
    fs.copyFileSync(src, dst, fs.constants.COPYFILE_FICLONE);
  } catch (e) {
    fs.copyFileSync(src, dst);
  }
}

function mkgen(outDir, codes, log) {
  const root = dataset.resolveRoot();
  const byContainer = new Map();
  for (const code of codes) {
    const c = findContainer(root, e => e.name.indexOf('_' + code + '_1.xac') > 0);
    if (!c) throw new Error('файл тайла ' + code + ' не найден ни в одном контейнере XAC');
    if (!byContainer.has(c.path)) byContainer.set(c.path, { c, codes: [] });
    byContainer.get(c.path).codes.push(code);
  }

  fs.mkdirSync(outDir, { recursive: true });
  // Таблица ATTRIBUTE лежит в общем индексе .xah и нужна, чтобы снять с узлов
  // нульвекторы: без неё длину записи не посчитать, а значит и элемент не найти.
  const attr = xr.attributes(st.openIndex(root).buf);
  const report = [];
  for (const { c, codes: list } of byContainer.values()) {
    const dir = path.join(outDir, 'pkgdb', c.dir);
    fs.mkdirSync(dir, { recursive: true });
    const dst = path.join(dir, c.file);
    clone(c.path, dst, log);
    const fd = fs.openSync(dst, 'r+');
    for (const code of list) {
      const e = c.ents.find(x => x.name.indexOf('_' + code + '_1.xac') > 0);
      const buf = fldb.read(c.db, e);
      const { out, stat } = xg.regenTile(buf, { attr });
      if (!stat.v5) throw new Error(code + ': блоков версии 5 нет, пересобирать нечего');
      if (stat.edgesNow !== stat.edgesWas) {
        throw new Error(code + ': рёбра не сошлись — ' + stat.edgesNow + ' из ' + stat.edgesWas);
      }
      fs.writeSync(fd, out, 0, out.length, e.offset);
      const sum = fldb.refreshChecksum(fd, e);
      let diff = 0;
      for (let i = 0; i < buf.length; i++) if (buf[i] !== out[i]) diff++;
      log(code + ': блоков ' + stat.blocks + ', пересобрано v5 ' + stat.v5 +
        ', узлов ' + stat.nodes + ', рёбер ' + stat.edgesWas + ' — все воспроизведены');
      log('   межблочных векторов перенесено ' + stat.cross +
        ', нульвекторов ' + stat.links +
        ', дополнено нулями ' + stat.pad + ' байт, наших байт в файле ' +
        (diff / buf.length * 100).toFixed(1) + ' %');
      log('   сумма каталога: ' + sum.old.toString(16) + ' -> ' + sum.now.toString(16));
      report.push({ code, container: c.dir, stat, diff });
    }
    fs.closeSync(fd);

    const cf = fs.readdirSync(path.join(root, 'pkgdb', c.dir)).find(f => f.endsWith('.conf'));
    fs.copyFileSync(path.join(root, 'pkgdb', c.dir, cf), path.join(dir, cf));
    conf.updateConf(path.join(dir, cf), dst);
    log(c.dir + '/' + cf + ': MD5 и пробы qa пересчитаны');
  }

  for (const f of ['DBInfo.txt', 'config.nfm', 'build1']) {
    const p = path.join(root, f);
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(outDir, f));
  }
  // мелкие компоненты, которые манифест всё равно перечисляет — как в mkmin
  const copyDir = d => {
    const from = path.join(root, 'pkgdb', d);
    if (!fs.existsSync(from)) return;
    const to = path.join(outDir, 'pkgdb', d);
    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(to, f));
    log(d + ': перенесён как есть');
  };
  const style = fs.readdirSync(path.join(root, 'pkgdb')).find(d => /^StyleDBMMI3G_/.test(d));
  if (style) copyDir(style);
  copyDir('NaviPersistence_ALL_3');
  return { report, containers: [...byContainer.values()].map(v => v.c.dir) };
}

module.exports = { mkgen, findContainer };

if (require.main === module) {
  const args = process.argv.slice(2);
  const outDir = args[0];
  const i = args.indexOf('--tiles');
  const codes = i > 0 ? (args[i + 1] || '').split(',').filter(Boolean).map(s => s.toUpperCase()) : [];
  if (!outDir || !codes.length) {
    console.error('использование: node src/mkgen.js <каталог-выхода> --tiles MJ00');
    process.exit(1);
  }
  const r = mkgen(outDir, codes, m => console.log(m));
  console.log();
  console.log('готово:', outDir, ' компоненты:', r.containers.join(', '));
  console.log('дальше: node src/mkmeta.js ' + outDir + ' --keep-pkg');
  console.log('после установки на машине: tools/write_fixacios.sh');
}
