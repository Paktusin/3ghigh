'use strict';
// Компонент LIT с кипрскими точками интереса: блоки из out/cyp/lit садятся в свои слоты.
//
//   node src/mklit.js <каталог-выхода> [--blocks out/cyp/lit]
//
// Что здесь происходит. `src/cyptree.js --build --lift` уже собрал блоки:
// узел вместо листа 112447, 64 листа в слотах доноров и два переписанных
// блока-предка с расширенными рамками. Лежат они файлами `<номер>.bin`, а в
// набор заведены не были. Этот скрипт их заводит.
//
// Почему каталог `LIT` трогать не приходится. Записи каталога хранят смещение
// и размер каждого блока, но ни один наш блок НЕ ВЫРОС: 65 из 67 ужались, два
// предка вышли ровно прежней длины. Блок дополняется нулями до размера слота и
// пишется по месту — тогда ни смещения, ни размеры в каталоге не меняются, а
// нули за концом блока никто не читает: разбор останавливает метка 0x80 в
// конце структуры. Это та же дисциплина, что у тайлов в `mkcyp.js`.
//
// Том выбирается сам: адресное пространство LIT сквозное через четыре тома, и
// скрипт смотрит, в какой из них попадают смещения наших блоков. Все 67 лежат
// в томе 2 (`LIT2`), поэтому и компонент в наборе один.
//
// Сумма записи каталога FLDB для этого компонента НЕ пересчитывается. У трёх
// гигабайтных томов (`LIT2`, `LIT3`, `LIT4`) заводское значение не сходится ни
// со счётом по всей длине, ни с одним префиксом — правило у них своё и не
// разобрано (docs/device.md). Писать вместо него значение по нашему правилу
// значило бы заменить неизвестное неверным; движок эту сумму при загрузке не
// сверяет (`FUN_0807a0b8` вызывают только кодер и декодер CIFF).

const fs = require('fs');
const path = require('path');
const fldb = require('./fldb');
const lit = require('./lit');
const conf = require('./conf');
const dataset = require('./dataset');

const VOLS = ['LIT', 'LIT2', 'LIT3', 'LIT4'];

// Блоки, собранные cyptree: файлы <номер>.bin.
function readBlocks(dir) {
  return fs.readdirSync(dir)
    .filter((f) => /^\d+\.bin$/.test(f))
    .map((f) => ({ blk: Number(f.slice(0, -4)), bytes: fs.readFileSync(path.join(dir, f)) }))
    .sort((a, b) => a.blk - b.blk);
}

function mklit(outDir, opt) {
  const o = opt || {};
  const log = o.log || (() => {});
  const root = o.root || dataset.resolveRoot();
  const blocks = readBlocks(o.blocks || 'out/cyp/lit');
  if (!blocks.length) throw new Error('в ' + (o.blocks || 'out/cyp/lit') + ' нет блоков <номер>.bin');

  const dirs = VOLS.map((d) => path.join(root, 'pkgdb', d)).filter((d) => fs.existsSync(d));
  const L = lit.open(dirs);
  const cat = L.catalog();

  // Том, в который попадают наши блоки. Он обязан быть один: компонент
  // ставится целиком, и разносить правку по двум томам незачем.
  const volOf = (off) => L.vols.findIndex((v) => off >= v.start && off < v.end);
  const used = new Set();
  for (const b of blocks) {
    const e = cat[b.blk];
    if (!e) throw new Error('блока ' + b.blk + ' нет в каталоге LIT');
    if (b.bytes.length > e.size) {
      throw new Error('блок ' + b.blk + ' не влезает в слот: ' + b.bytes.length + ' > ' + e.size);
    }
    used.add(volOf(e.off));
  }
  if (used.size !== 1) throw new Error('блоки разошлись по томам: ' + [...used].map((i) => i + 1).join(', '));
  const vi = [...used][0];
  const vol = L.vols[vi];
  const name = VOLS[vi];
  const src = vol.file;
  L.vols.forEach((v) => fs.closeSync(v.fd));

  // ---- копия тома ----
  const dir = path.join(outDir, 'pkgdb', name);
  fs.mkdirSync(dir, { recursive: true });
  const dst = path.join(dir, path.basename(src));
  log('копирую ' + name + '/' + path.basename(src) + ' (' +
      (fs.statSync(src).size / 1048576).toFixed(0) + ' МБ)');
  try { fs.copyFileSync(src, dst, fs.constants.COPYFILE_FICLONE); }
  catch (e) { fs.copyFileSync(src, dst); }

  // ---- блоки по месту ----
  // Файловое смещение = обёртка FLDB + (сквозное смещение − начало тома).
  const db = fldb.open(dst);
  const ent = fldb.entries(db)[0];
  fs.closeSync(db.fd);
  if (ent.offset !== vol.skip) {
    throw new Error('обёртка тома ' + name + ': запись каталога на ' + ent.offset +
                    ', читатель ждёт ' + vol.skip);
  }
  const fd = fs.openSync(dst, 'r+');
  let bytes = 0, padded = 0;
  for (const b of blocks) {
    const e = cat[b.blk];
    const at = ent.offset + (e.off - vol.start);
    const buf = Buffer.alloc(e.size);          // хвост слота — нули
    b.bytes.copy(buf);
    fs.writeSync(fd, buf, 0, buf.length, at);
    bytes += b.bytes.length;
    padded += e.size - b.bytes.length;
  }
  fs.closeSync(fd);
  log(name + ': вписано блоков ' + blocks.length + ', наших байт ' + bytes +
      ', добивки нулями ' + padded);

  // ---- .conf ----
  const cf = fs.readdirSync(path.join(root, 'pkgdb', name)).find((f) => f.endsWith('.conf'));
  fs.copyFileSync(path.join(root, 'pkgdb', name, cf), path.join(dir, cf));
  conf.updateConf(path.join(dir, cf), dst);
  log(name + '/' + cf + ': MD5 и пробы qa пересчитаны');

  return { name, dir, file: path.basename(dst), volume: vi + 1,
           blocks: blocks.map((b) => b.blk), bytes, padded };
}

module.exports = { mklit, readBlocks };

if (require.main === module) {
  const args = process.argv.slice(2);
  const outDir = args[0];
  const flag = (n, d) => { const i = args.indexOf('--' + n); return i > 0 && args[i + 1] ? args[i + 1] : d; };
  if (!outDir || outDir.startsWith('--')) {
    console.error('использование: node src/mklit.js <каталог-выхода> [--blocks out/cyp/lit]');
    process.exit(2);
  }
  const r = mklit(outDir, { blocks: flag('blocks', 'out/cyp/lit'), log: (s) => console.log(s) });
  console.log('готово: компонент ' + r.name + ' (том ' + r.volume + '), блоков ' + r.blocks.length);
  console.log('дальше: node src/mkmeta.js ' + outDir + ' --keep-pkg');
}
