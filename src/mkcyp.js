'use strict';
// Набор с дорогами Кипра: наш тайл садится в слот донорского.
//
//   node src/mkcyp.js <каталог-выхода> [--donor IS01] [--roads out/cyp/roads.geojson]
//                     [--classes motorway,trunk,primary]
//                     [--places out/cyp/places_geo.json] [--country-name CYPRUS]
//
// Почему в чужой слот. Число тайлов в базе менять нельзя: `XAC-STRUKTUR`,
// `NACHBARN`, `FE GRUPPEN`, `L3 GRUPPEN`, `L4 LOAD TABLE` и счётчики
// `XACDB HEADER` завязаны друг на друга. Поэтому Кипр селится в слот тайла,
// которого не жалко, и сохраняет его код и имя файла. Донор по умолчанию —
// `IS01` (Исландия): рамка Кипра в общем растре пуста, а исландская связность
// нам не мешает, потому что тайл остаётся на своём месте в реестре.
//
// Длина файла тайла не меняется: наши байты дополняются нулями до размера
// донорского файла. Тогда контейнер FLDB не пересобирается — правки идут по
// месту, как в `relocate.js` и `mkgen.js`, и каталог остаётся прежним.
//
// Что правится в общем индексе `.xah`:
//   * запись `XAC-STRUKTUR` донора: смещения и размеры разделов нашего тайла;
//   * строки `XAC-STRUKTUR L1…L4`: рамка, число блоков, смещение и размер
//     области `VEKTORBLOCK`, размеры `XAC HEADER` и `ZF-NAMEN`;
//   * сквозная нумерация `firstBlock` — ПО ВСЕМ строкам базы: она накопительная
//     (проверено на всех 15 108 строках), и смена числа блоков у одного тайла
//     двигает номера у всех последующих;
//   * счётчик блоков в `XACDB HEADER` (+0x4c), он равен той же сумме;
//   * общий растр `.ras`: ячейки донора освобождаются, ячейки Кипра занимаются.
//
// Имена. Если задан файл городов (`--places`), в тайл кладутся разделы
// `ZE-NAMEN` и `ZE-NAMEN-MMI`: имена улиц из OSM, связь «имя → дорога» и
// дерево «страна → город → улица». Их смещения и размеры уходят в запись
// `XAC-STRUKTUR` — без этого устройство разделов не найдёт.
//
// Чего этот набор не делает: не трогает `NACHBARN` (у донора остаются его
// соседи — для острова это дальние связи, как паромные), не пишет `ZF-NAMEN`,
// домов и точек интереса, не заполняет уровни 2…4 — там у нас данных нет.

const fs = require('fs');
const path = require('path');
const fldb = require('./fldb');
const xac = require('./xac');
const st = require('./struktur');
const ras = require('./rasidx');
const raster = require('./raster');
const tile = require('./xactile');
const roads = require('./xacroads');
const zenamen = require('./zenamen');
const conf = require('./conf');
const dataset = require('./dataset');

const REC = 84, REC_START = 24;            // запись XAC-STRUKTUR
const LVL = 44, LVL_START = 24;            // строка XAC-STRUKTUR L1..L4
const HDR_SIZE = 196, ZF_SIZE = 112;       // наши разделы шапки и имён
const CYPRUS = 113;                        // код страны в шапке блока

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

const patchU16 = (fd, at, v) => { const b = Buffer.alloc(2); b.writeUInt16BE(v, 0); fs.writeSync(fd, b, 0, 2, at); };
const patchU32 = (fd, at, v) => { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0, 0); fs.writeSync(fd, b, 0, 4, at); };

// Маска зоны обслуживания: у нас весь прямоугольник тайла свой, поэтому все
// ячейки нулевые (0 — ячейка отдана этому тайлу, см. src/raster.js). Рамка
// растра шире сетки ровно на ячейку с каждой стороны.
function rasterSection(bbox) {
  const cell = 1000;
  const nx = Math.max(1, Math.floor((bbox[2] - bbox[0]) / cell) - 1);
  const ny = Math.max(1, Math.floor((bbox[3] - bbox[1]) / cell) - 1);
  return raster.buildRaster({ cells: new Uint8Array(nx * ny), nx, ny, bbox,
                              label: 'RASTERINFOS', version: 0x00020000 });
}

// Парный файл уровня 2: шапка плюс пустой ZF-NAMEN. Ровно так выглядят все
// 347 заводских заглушек — 308 байт.
function stubLevel2(code, name, index, built) {
  return tile.buildTile({ code, file: name, index, country: CYPRUS, built,
                          zf: tile.section('ZF-NAMEN', Buffer.alloc(ZF_SIZE - 20)), blocks: [] });
}

// Файл тайла нужного размера: добивается нулями ПОСЛЕДНИЙ ВЕКТОРНЫЙ БЛОК.
// Так же поступает mkgen, и это проверено на машине: за таблицей блока нет ни
// одной ссылки, поэтому хвост нулей никто не читает. Маску RASTERINFOS трогать
// не хочется — она идёт последней и должна остаться точной.
function fitTile(spec, target) {
  const file = tile.buildTile(spec);
  if (file.length === target) return file;
  if (file.length > target) return null;
  const pad = target - file.length;
  const list = xac.sections(file).list;
  const last = list.filter((x) => x.name === 'VEKTORBLOCK').slice(-1)[0] || list.slice(-1)[0];
  const out = Buffer.alloc(target, 0);
  file.copy(out, 0, 0, last.offset + last.total);                      // всё до конца блока
  file.copy(out, last.offset + last.total + pad, last.offset + last.total);   // хвост за ним
  out.writeUInt32BE(last.total - 20 + pad, last.offset + 16);
  return out;
}

function mkcyp(outDir, opt) {
  const o = opt || {};
  const log = o.log || (() => {});
  const donor = (o.donor || 'IS01').toUpperCase();
  const root = dataset.resolveRoot();

  const idxC = findContainer(root, (e) => /[.]xah$/.test(e.name));
  if (!idxC) throw new Error('контейнер с общим индексом .xah не найден');
  const xahE = idxC.ents.find((e) => /[.]xah$/.test(e.name));
  const rasE = idxC.ents.find((e) => /[.]ras$/.test(e.name));
  const tileE = idxC.ents.find((e) => e.name.indexOf('_' + donor + '_1.xac') > 0);
  const tile2E = idxC.ents.find((e) => e.name.indexOf('_' + donor + '_2.xac') > 0);
  if (!tileE) throw new Error('тайл ' + donor + ' лежит не в том контейнере, что .xah — не предусмотрено');

  const xah = fldb.read(idxC.db, xahE);
  const reg = st.parse(xah), order = [...reg.keys()], lv = st.parseLevels(xah);
  const gi = order.indexOf(donor);
  if (gi < 0) throw new Error('тайл ' + donor + ' не найден в реестре');
  const secs = xac.sections(xah).list;

  // ---- наш тайл ----
  const fc = JSON.parse(fs.readFileSync(o.roads || 'out/cyp/roads.geojson', 'utf8'));
  const graph = roads.graphFromGeoJSON(fc, { classes: o.classes });
  const attr = roads.setAttributes(root);
  const base = lv[1].rows[gi].firstBlock;
  const built = roads.buildBlocks(graph, { attr, attrIdx: roads.attrByFrc(attr),
    base, country: CYPRUS, maxNodes: o.maxNodes || 9000 });
  log('дорог ' + graph.ways + ', узлов ' + graph.nodes.length + ', рёбер ' + graph.edges.length +
      ' -> блоков ' + built.blocks.length + ' (внутриблочных рёбер ' + built.local +
      ', межблочных ' + built.cross + ')');

  const bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const n of graph.nodes) {
    if (n.x < bb[0]) bb[0] = n.x; if (n.x > bb[2]) bb[2] = n.x;
    if (n.y < bb[1]) bb[1] = n.y; if (n.y > bb[3]) bb[3] = n.y;
  }
  const built14 = o.built || '20260922120000';
  const name1 = tileE.name.replace(/^.*\//, '').replace(/\.xac$/, '');

  // Разделы имён идут перед RASTERINFOS: порядок цепочки жёсткий.
  const names = [];
  let zen = null;
  if (o.places) {
    zen = roads.zenModel(graph, built, { places: o.places, countryName: o.countryName || 'CYPRUS' });
    names.push(zenamen.buildSection({ names: zen.names, refs: zen.refs, blocks: zen.blocks,
                                      version: 2, label: 'ZE-NAMEN', country: CYPRUS }));
    names.push(zenamen.mmiBuildSection(zen.mmi));
    log('имена: ' + zen.names.length + ' (городов ' + zen.places + ', записей улиц ' +
        zen.streets + '), разделы ' + names.map((b) => b.length).join(' и ') + ' б');
  }

  const spec = {
    code: donor, file: name1, index: gi, country: CYPRUS, built: built14,
    zf: tile.section('ZF-NAMEN', Buffer.alloc(ZF_SIZE - 20)),
    blocks: built.blocks,
    extra: names.concat([rasterSection([bb[0] - 1000, bb[1] - 1000, bb[2] + 1000, bb[3] + 1000])]),
  };
  const file1 = fitTile(spec, tileE.size);
  if (!file1) {
    throw new Error('наш тайл ' + tile.buildTile(spec).length + ' б не влезает в слот ' +
                    donor + ' (' + tileE.size + ' б): возьмите донора побольше или меньше классов дорог');
  }
  const file2raw = stubLevel2(donor, name1.replace(/_1$/, '_2'), gi, built14);
  const file2 = tile2E ? fitTile({ code: donor, file: name1.replace(/_1$/, '_2'), index: gi,
    country: CYPRUS, built: built14,
    zf: tile.section('ZF-NAMEN', Buffer.alloc(ZF_SIZE - 20)), blocks: [],
    extra: [] }, tile2E.size) : null;
  if (tile2E && !file2) throw new Error('заглушка уровня 2 не влезла в слот');
  log('тайл ' + donor + ': наших байт ' + (tile.buildTile(spec).length / 1024).toFixed(0) +
      ' КБ из ' + (tileE.size / 1024).toFixed(0) + ' КБ слота' +
      (tile2E ? ', уровень 2 — заглушка ' + file2raw.length + ' б' : ''));

  // ---- копия контейнера ----
  fs.mkdirSync(outDir, { recursive: true });
  const dir = path.join(outDir, 'pkgdb', idxC.dir);
  fs.mkdirSync(dir, { recursive: true });
  const dst = path.join(dir, idxC.file);
  log('копирую ' + idxC.dir + '/' + idxC.file + ' (' +
      (fs.statSync(idxC.path).size / 1048576).toFixed(0) + ' МБ)');
  try { fs.copyFileSync(idxC.path, dst, fs.constants.COPYFILE_FICLONE); }
  catch (e) { fs.copyFileSync(idxC.path, dst); }
  const fd = fs.openSync(dst, 'r+');

  // ---- файлы тайла ----
  fs.writeSync(fd, file1, 0, file1.length, tileE.offset);
  if (file2) fs.writeSync(fd, file2, 0, file2.length, tile2E.offset);

  // ---- запись XAC-STRUKTUR ----
  const regSec = secs.find((x) => x.name === 'XAC-STRUKTUR');
  const at = xahE.offset + regSec.offset + REC_START + gi * REC;
  const vb = xac.sections(file1).list.filter((x) => x.name === 'VEKTORBLOCK');
  const rs = xac.sections(file1).list.find((x) => x.name === 'RASTERINFOS');
  const vbSize = vb.reduce((a, x) => a + x.total, 0);
  for (let k = 0; k < 4; k++) patchU32(fd, at + 4 + k * 4, vbSize);   // границы групп по уровням
  // Разделы, которых у нас может не быть, — нулями; те, что есть, своими
  // смещением и размером в собранном файле (fitTile их уже сдвинул).
  const secAt = (name) => xac.sections(file1).list.find((x) => x.name === name);
  for (const [name, off] of [['ZE-NAMEN', 0x14], ['ZE-NAMEN-MMI', 0x1c],
                             ['HAUSNUMMERN', 0x24], ['LOCAL POIS', 0x2c]]) {
    const sec = secAt(name);
    patchU32(fd, at + off, sec ? sec.offset : 0);
    patchU32(fd, at + off + 4, sec ? sec.total : 0);
  }
  patchU32(fd, at + 0x3c, rs ? rs.offset : 0);
  patchU32(fd, at + 0x40, rs ? rs.total : 0);
  patchU32(fd, at + 0x44, vbSize);
  patchU32(fd, at + 0x48, vbSize);

  // ---- строки уровней ----
  const rowAt = (n, i) => xahE.offset + secs.find((x) => x.name === 'XAC-STRUKTUR L' + n).offset +
                          LVL_START + i * LVL;
  const NO_DATA = 0x7fffffff;
  const r1 = rowAt(1, gi);
  [bb[0], bb[1], bb[2], bb[3]].forEach((v, k) => patchU32(fd, r1 + k * 4, v));
  patchU16(fd, r1 + 0x10, vb.length);
  patchU32(fd, r1 + 0x14, vb.length ? vb[0].offset : 0);
  patchU32(fd, r1 + 0x18, vbSize);
  patchU32(fd, r1 + 0x1c, HDR_SIZE);
  patchU32(fd, r1 + 0x20, ZF_SIZE);
  patchU32(fd, r1 + 0x24, 0);
  for (const n of [2, 3, 4]) {                       // данных на грубых уровнях нет
    const r = rowAt(n, gi);
    for (let k = 0; k < 4; k++) patchU32(fd, r + k * 4, NO_DATA);
    patchU16(fd, r + 0x10, 0);
    patchU32(fd, r + 0x14, 0); patchU32(fd, r + 0x18, 0);
    patchU32(fd, r + 0x1c, HDR_SIZE); patchU32(fd, r + 0x20, ZF_SIZE);
    patchU32(fd, r + 0x24, n === 2 && file2 ? file2raw.length : 0);
  }

  // ---- сквозная нумерация блоков ----
  // Счёт идёт тайл за тайлом, внутри тайла уровни 1,2,3,4 накопительно.
  let running = 0, renum = 0;
  for (let i = 0; i < order.length; i++) {
    for (const n of [1, 2, 3, 4]) {
      const r = rowAt(n, i);
      const cnt = (i === gi) ? (n === 1 ? vb.length : 0) : lv[n].rows[i].blockCount;
      if (lv[n].rows[i].firstBlock !== running) { patchU16(fd, r + 0x12, running); renum++; }
      running += cnt;
    }
  }
  const hdr = secs.find((x) => x.name === 'XACDB HEADER');
  patchU32(fd, xahE.offset + hdr.offset + 0x4c, running);
  log('.xah: блоков в базе ' + running + ' (было 44747), перенумеровано строк ' + renum);

  // ---- общий растр ----
  const R = ras.load(fldb.read(idxC.db, rasE), rasE.name);
  let freed = 0, taken = 0, busy = 0;
  for (let cx = 0; cx < R.nx; cx++) {
    for (let cy = 0; cy < R.ny; cy++) {
      if (ras.get(R, cx, cy) !== gi) continue;              // ячейки донора
      patchU16(fd, rasE.offset + ras.HEAD + (cx * R.ny + cy) * 2, ras.EMPTY);
      freed++;
    }
  }
  ras.forBBox(R, bb, (cx, cy, v) => {
    if (v !== ras.EMPTY && v !== gi) { busy++; return; }
    patchU16(fd, rasE.offset + ras.HEAD + (cx * R.ny + cy) * 2, gi);
    taken++;
  });
  log('.ras: ячеек донора освобождено ' + freed + ', занято под Кипр ' + taken +
      (busy ? ', занятых чужими пропущено ' + busy : ''));

  // ---- суммы каталога ----
  const touched = [xahE, rasE, tileE].concat(tile2E ? [tile2E] : []);
  for (const e of touched) {
    const s = fldb.refreshChecksum(fd, e);
    log('   сумма ' + e.name + ': ' + s.old.toString(16) + ' -> ' + s.now.toString(16));
  }
  fs.closeSync(fd);

  // ---- .conf и мелкие компоненты ----
  const cf = fs.readdirSync(path.join(root, 'pkgdb', idxC.dir)).find((f) => f.endsWith('.conf'));
  fs.copyFileSync(path.join(root, 'pkgdb', idxC.dir, cf), path.join(dir, cf));
  conf.updateConf(path.join(dir, cf), dst);
  log(idxC.dir + '/' + cf + ': MD5 и пробы qa пересчитаны');

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
    log(d + ': перенесён как есть');
  };
  const style = fs.readdirSync(path.join(root, 'pkgdb')).find((d) => /^StyleDBMMI3G_/.test(d));
  if (style) copyDir(style);
  copyDir('NaviPersistence_ALL_3');

  return { donor, gi, blocks: vb.length, nodes: graph.nodes.length, edges: graph.edges.length,
           totalBlocks: running, container: idxC.dir, file1, file2, zen };
}

module.exports = { mkcyp, fitTile, rasterSection, stubLevel2 };

if (require.main === module) {
  const args = process.argv.slice(2);
  const outDir = args[0];
  const flag = (n, d) => { const i = args.indexOf('--' + n); return i > 0 && args[i + 1] ? args[i + 1] : d; };
  if (!outDir) {
    console.error('использование: node src/mkcyp.js <каталог-выхода> [--donor IS01] [--roads ...] [--classes ...] [--places ...]');
    process.exit(1);
  }
  const r = mkcyp(outDir, {
    donor: flag('donor', 'IS01'),
    roads: flag('roads', 'out/cyp/roads.geojson'),
    classes: flag('classes', 'motorway,motorway_link,trunk,trunk_link,primary,primary_link').split(','),
    places: flag('places') ? JSON.parse(fs.readFileSync(flag('places'), 'utf8')) : null,
    countryName: flag('country-name', 'CYPRUS'),
    log: (m) => console.log(m),
  });
  console.log();
  console.log('готово: ' + outDir + '  компонент: ' + r.container);
  console.log('Кипр сел в слот ' + r.donor + ' (номер ' + r.gi + '): ' + r.blocks + ' блоков, ' +
              r.nodes + ' узлов, ' + r.edges + ' рёбер');
  console.log('дальше: node src/mkmeta.js ' + outDir + ' --keep-pkg');
  console.log('после установки на машине: tools/write_fixacios.sh');
}
