'use strict';
// Финальный образ: все файлы наши, данные только кипрские.
//
//   node src/mkcyprus.js out/cyprus
//
// Это цель проекта (см. README), а не заплата. Ни одного заводского байта
// данных внутри: контейнер `XAC` собран с нуля (`src/mkxac.js`), том `GDB`
// собран с нуля (`src/gdbgen.js`), контейнер `LIT` собран с нуля
// (`src/cyplit.js`). Из заводского набора переносится только то, что данными
// не является: шапки контейнеров, таблицы, не зависящие от покрытия
// (`ATTRIBUTE`, `ZF-TOKEN`, `COUNTRY`, `UNICODE *`…), грамматика `TTD`,
// стили отрисовки и два скрипта `NaviPersistence`.
//
// Имена файлов внутри компонентов сохраняются заводские
// (`kN221EUx01_0.db`, `EJ211_v37a.gdb`, `EJ211Ga_L1.db`): их поимённо
// перечисляет описатель базы `acios_db.ini`, и менять их нельзя.
//
// ── Чего в образе нет и почему ────────────────────────────────────────────
//   `XAC2`, `XAC3`   наш индекс их не упоминает: в реестре один тайл. На
//                    разделе заводские файлы останутся лежать, но читать их
//                    никто не будет — реестр о них не знает.
//   `LIT2`…`LIT4`    то же: каталог лежит в первом томе и адресует только его.
//   `GDB2`           второй том у нас пуст.
//   `SDS`            не меняли и не кладём: 217 МБ речевых данных сорока шести
//                    чужих стран, кипрского каталога в них нет вовсе. На
//                    устройстве заводский `SDS` остаётся как есть.
//   `CTY`, `TER`     трёхмерные здания и рельеф: не разбирали, не собираем.
//   `PIT`, `TMC`     от покрытия не зависят, заводские остаются на разделе.
//
// После установки обязательно `tools/write_fixacios.sh`.

const fs = require('fs');
const path = require('path');
const { mkxac } = require('./mkxac');
const { readHouses } = require('./mkcyp');
const gdbgen = require('./gdbgen');
const cyplit = require('./cyplit');
const cyppoi = require('./cyppoi');
const cyptree = require('./cyptree');
const conf = require('./conf');
const dataset = require('./dataset');

// Компонент: каталог, файл с заводским именем и .conf, пересчитанный под него.
function component(outDir, name, file, data, root, log) {
  const dir = path.join(outDir, 'pkgdb', name);
  fs.mkdirSync(dir, { recursive: true });
  const dst = path.join(dir, file);
  fs.writeFileSync(dst, data);
  const srcDir = path.join(root, 'pkgdb', name);
  const cf = fs.existsSync(srcDir) && fs.readdirSync(srcDir).find((f) => f.endsWith('.conf'));
  if (cf) {
    fs.copyFileSync(path.join(srcDir, cf), path.join(dir, cf));
    conf.updateConf(path.join(dir, cf), dst);
  }
  log(name + ': ' + file + ', ' + (data.length / 1048576).toFixed(2) + ' МБ');
  return { name, file, size: data.length };
}

function mkcyprus(outDir, opt) {
  const o = opt || {};
  const log = o.log || (() => {});
  const root = o.root || dataset.resolveRoot();
  const roadsFile = o.roads || 'out/cyp/roads.geojson';
  const out = { outDir, components: [] };
  fs.mkdirSync(outDir, { recursive: true });

  // ---- XAC: свой контейнер ----
  log('=== XAC: свой контейнер ===');
  const xacSrc = fs.readdirSync(path.join(root, 'pkgdb', 'XAC')).find((f) => /\.db$/i.test(f));
  const x = mkxac({ root, roads: roadsFile, classes: o.classes, places: o.places,
                    houses: o.houses, code: o.code, log });
  out.components.push(component(outDir, 'XAC', xacSrc, x.container, root, log));
  out.xac = { blocks: x.blocks, nodes: x.nodes, edges: x.edges };

  // ---- GDB: свой том ----
  log('');
  log('=== GDB: свой том ===');
  const j = JSON.parse(fs.readFileSync(roadsFile, 'utf8'));
  const lines = j.features.filter((f) => f.geometry && f.geometry.type === 'LineString').map((f) => {
    const p = f.properties || {};
    return { name: ((p.ref || p.name || '') + '').trim().slice(0, 15) || 'CY',
             cls: p.highway || null, pts: f.geometry.coordinates };
  });
  const v = gdbgen.volumeFromRoads(lines, { name: 'EJ211',
                                            levels: gdbgen.EUROPE_LEVELS.map((_, i) => i) });
  const gdbSrc = fs.readdirSync(path.join(root, 'pkgdb', 'GDB')).find((f) => /\.gdb$/i.test(f));
  out.components.push(component(outDir, 'GDB', gdbSrc, v.gdb, root, log));
  out.gdb = { lines: lines.length };

  // ---- LIT: свой контейнер ----
  log('');
  log('=== LIT: свой контейнер ===');
  const pois = cyppoi.collect(o.pbf || 'out/cyp/cyprus-latest.osm.pbf').map((q) => Object.assign({}, q, {
    x: Math.round(q.lon * 72000), y: Math.round(q.lat * cyptree.DEG),
  }));
  const l = cyplit.build(pois, { from: path.join(root, 'pkgdb', 'LIT',
    fs.readdirSync(path.join(root, 'pkgdb', 'LIT')).find((f) => /\.db$/i.test(f))) });
  const litSrc = fs.readdirSync(path.join(root, 'pkgdb', 'LIT')).find((f) => /\.db$/i.test(f));
  out.components.push(component(outDir, 'LIT', litSrc, l.buf, root, log));
  out.lit = { leaves: l.leaves, pois: l.pois };
  log('точек ' + l.pois + ' в ' + l.leaves + ' листьях');

  // ---- то, что данными не является ----
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

  return out;
}

module.exports = { mkcyprus };

if (require.main === module) {
  const args = process.argv.slice(2);
  const outDir = args[0];
  const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
  if (!outDir || outDir.startsWith('--')) {
    console.error('использование: node src/mkcyprus.js <каталог-выхода> [--roads ...] [--places ...] [--houses ...]');
    process.exit(2);
  }
  const places = flag('places', 'out/cyp/places_geo.json');
  const houses = flag('houses', 'out/cyp/cyprus-latest.osm.pbf');
  const r = mkcyprus(outDir, {
    roads: flag('roads', 'out/cyp/roads.geojson'),
    classes: flag('classes', 'motorway,motorway_link,trunk,trunk_link,primary,primary_link').split(','),
    places: fs.existsSync(places) ? JSON.parse(fs.readFileSync(places, 'utf8')) : null,
    houses: fs.existsSync(houses) ? readHouses(houses) : null,
    pbf: houses,
    code: flag('code', 'CY00'),
    log: (m) => console.log(m),
  });
  const total = r.components.reduce((a, c) => a + c.size, 0);
  console.log();
  console.log('готово: ' + outDir);
  console.log('компоненты: ' + r.components.map((c) => c.name + ' ' +
              (c.size / 1048576).toFixed(2) + ' МБ').join(', ') +
              ' — итого ' + (total / 1048576).toFixed(2) + ' МБ');
  console.log('дальше: node src/mkmeta.js ' + outDir + ' --keep-pkg');
  console.log('после установки на машине: tools/write_fixacios.sh');
}
