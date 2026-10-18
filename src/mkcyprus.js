'use strict';
// Финальный образ: данные только кипрские, ставится на чистый раздел.
//
//   node src/mkcyprus.js out/cyprus        (npm run image; затем npm run meta)
//
// Свои компоненты: контейнер `XAC` (`src/mkxac.js`), том `GDB` (`src/gdbgen.js`:
// дороги, суша, площади, ступени высот, реки), контейнер `LIT` (`src/cyplit.js`:
// адресный справочник, набор стран, 10 слоёв POI), рельеф `TER`+`TER2`, вырезанный
// по Кипру из заводского (`src/atlascut.js`, контейнеры — заводские байты).
// Из заводского набора переносятся без изменений компоненты, не зависящие от
// покрытия, — `LABEL`, `TMC`, `PIT`, `SDS` (KEEP), стили `StyleDB` и скрипты
// `NaviPersistence`, плюс заводские таблицы и шапки внутри своих контейнеров.
// В LIT есть и заводские байты: таблицы языков 0x18 и шапка POI (docs/formats/lit.md).
//
// Имена файлов внутри компонентов — заводские (`kN221EUx01_0.db`,
// `EJ211_v37a.gdb`, `EJ211Ga_L1.db`…).
//
// Описатель базы `acios_db.ini` НЕ генерируется: его пишет сам LVM при
// активации пакета, если манифест `.pkg` перечисляет ровно те компоненты, что
// есть в наборе (`npm run meta`, docs/device.md, «Причина 28 % найдена по коду»).
//
// Чего в образе нет: `XAC2`/`XAC3`, `LIT2`…`LIT4`, `GDB2` (наши индексы и каталоги
// их не адресуют), `CTY` (трёхмерные здания — не разбирали), `TMC3GP` и прочее
// для MMI 3G+.

const fs = require('fs');
const path = require('path');
const { mkxac, readHouses, buildContainer } = require('./mkxac');
const fldb = require('./fldb');
const gdbgen = require('./gdbgen');
const atlascut = require('./atlascut');
const placesMod = require('./places');
const cyplit = require('./cyplit');
const litaddr = require('./litaddr');
const cyppoi = require('./cyppoi');
const cyptree = require('./cyptree');
const conf = require('./conf');
const dataset = require('./dataset');

// Мелкие заводские компоненты для чистой установки. Порядок — заводской,
// в нём же пишется описатель.
const KEEP = ['LABEL', 'TMC', 'PIT', 'SDS'];

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

// Классы дорог образа — один набор для XAC (граф, имена, дома) и адресного
// справочника LIT. С 20.10 — вся сеть из roads.geojson: до этого брались
// только магистрали, и в Лимасоле было видно около десятка улиц.
const DEFAULT_CLASSES = ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary',
  'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link',
  'unclassified', 'residential'];

function mkcyprus(outDir, opt) {
  const o = opt || {};
  const log = o.log || (() => {});
  const root = o.root || dataset.resolveRoot();
  const roadsFile = o.roads || 'out/cyp/roads.geojson';
  const classes = o.classes || DEFAULT_CLASSES;
  const out = { outDir, components: [] };
  fs.mkdirSync(outDir, { recursive: true });

  // города — один список для XAC и LIT, двойники склеены (src/places.js)
  const pbf = o.pbf || 'out/cyp/cyprus-latest.osm.pbf';
  // без --places — города и районы прямо из OSM (place=city…hamlet, районы —
  // suburb/quarter/neighbourhood при своём городе)
  let places, districts = null;
  if (!o.places && fs.existsSync(pbf)) {
    const osm = placesMod.fromOsm(pbf);
    places = osm.places; districts = osm.districts;
    log('города из OSM: ' + places.length + ', районов ' + districts.length);
  } else {
    const rawPlaces = o.places || JSON.parse(fs.readFileSync('out/cyp/places_geo.json', 'utf8'));
    places = placesMod.dedupe(rawPlaces, fs.existsSync(pbf) ? placesMod.englishNames(pbf) : null);
    if (places.length !== rawPlaces.length) log('города: ' + rawPlaces.length + ' -> ' + places.length + ' (склеены двойники)');
  }

  // ---- XAC: свой контейнер ----
  log('=== XAC: свой контейнер ===');
  const xacSrc = fs.readdirSync(path.join(root, 'pkgdb', 'XAC')).find((f) => /\.db$/i.test(f));
  const x = mkxac({ root, roads: roadsFile, classes, places,
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
  const litSrc = fs.readdirSync(path.join(root, 'pkgdb', 'LIT')).find((f) => /\.db$/i.test(f));
  const litPath = path.join(root, 'pkgdb', 'LIT', litSrc);
  // адресный справочник: те же города и улицы, что в XAC (тот же граф, те же классы)
  const addr = litaddr.modelFromRoads(JSON.parse(fs.readFileSync(roadsFile, 'utf8')),
                                      places,
                                      { classes, districts,
                                        addrs: litaddr.readAddresses(o.pbf || 'out/cyp/cyprus-latest.osm.pbf') });
  const factory = ['LIT', 'LIT2', 'LIT3', 'LIT4'].map((d) => path.join(root, 'pkgdb', d));
  const l = cyplit.build(pois, { from: litPath, addr, factory });
  log('адреса: городов ' + l.cities + ', улиц ' + l.streets + '; части: корень ' + l.parts.root +
      ' б, таблицы 0x18 ' + l.parts.tables + ' б, POI ' + l.parts.poi + ' б, адреса ' + l.parts.addr + ' б');
  const rep = cyplit.verify(l.buf, l, pois);
  cyplit.report(rep, l, log);
  if (rep.bad) throw new Error('LIT не прошёл сверку');

  // Заводский том `LIT` лежит в обёртке FLDB: контейнер с одной записью,
  // данные со смещения 2048. (У `PIT` обёртки нет — там `Lit\x02` с нуля.)
  // Кладём так же: имя записи и шапку берём у заводского.
  const litDb = fldb.open(litPath);
  const litEntry = fldb.entries(litDb)[0];
  const litHead = Buffer.alloc(fldb.DIR_OFFSET);
  fs.readSync(litDb.fd, litHead, 0, litHead.length, 0);
  fs.closeSync(litDb.fd);
  const litWrapped = buildContainer([{ name: litEntry.name, data: l.buf }], litHead);
  log('обёртка FLDB: запись ' + litEntry.name + ', данные со смещения 2048');

  out.components.push(component(outDir, 'LIT', litSrc, litWrapped, root, log));
  out.lit = { leaves: l.leaves, pois: l.pois };
  log('точек ' + l.pois + ' в ' + l.leaves + ' листьях');

  // ---- TER: рельеф только Кипра (заводские контейнеры, свой индекс) ----
  log('');
  log('=== TER: рельеф Кипра ===');
  const ter = atlascut.build(root, outDir, { log });
  ['TER', 'TER2'].forEach((name, i) => out.components.push(
    { name, file: path.basename(ter.dst[i]), size: i ? ter.size2 : ter.size1 }));

  // ---- заводские компоненты, не зависящие от покрытия ----
  log('');
  log('=== заводские компоненты ===');
  for (const name of KEEP) {
    const from = path.join(root, 'pkgdb', name);
    if (!fs.existsSync(from)) continue;
    const file = fs.readdirSync(from).find((f) => !f.endsWith('.conf'));
    if (!file) continue;
    const to = path.join(outDir, 'pkgdb', name);
    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(from)) {
      const src = path.join(from, f), dst = path.join(to, f);
      try { fs.copyFileSync(src, dst, fs.constants.COPYFILE_FICLONE); }
      catch (e) { fs.copyFileSync(src, dst); }
    }
    const size = fs.statSync(path.join(from, file)).size;
    out.components.push({ name, file, size });
    log(name + ': заводской, ' + (size / 1048576).toFixed(2) + ' МБ');
  }
  // описатель от прежних сборок не нужен (его пишет LVM) — убрать, чтобы не попал на карту
  fs.rmSync(path.join(outDir, 'acios_db.ini'), { force: true });

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

module.exports = { DEFAULT_CLASSES, mkcyprus };

if (require.main === module) {
  const args = process.argv.slice(2);
  const outDir = args[0];
  const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
  if (!outDir || outDir.startsWith('--')) {
    console.error('использование: node src/mkcyprus.js <каталог-выхода> [--roads ...] [--places ...] [--houses ...]');
    process.exit(2);
  }
  const places = flag('places', null);
  const houses = flag('houses', 'out/cyp/cyprus-latest.osm.pbf');
  const r = mkcyprus(outDir, {
    roads: flag('roads', 'out/cyp/roads.geojson'),
    classes: flag('classes', DEFAULT_CLASSES.join(',')).split(','),
    places: places && fs.existsSync(places) ? JSON.parse(fs.readFileSync(places, 'utf8')) : null,
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
  console.log('дальше: node src/mkmeta.js ' + outDir + ' (npm run meta), затем npm run check и npm run card');
}
