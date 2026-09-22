'use strict';
// Образ обновления карт с одним Кипром: три компонента в одном наборе.
//
//   node src/mkimage.js out/cyp-image
//        [--donor IS01] [--roads out/cyp/roads.geojson]
//        [--classes motorway,trunk,primary] [--places out/cyp/places_geo.json]
//        [--houses out/cyp/cyprus-latest.osm.pbf] [--blocks out/cyp/lit]
//        [--levels all] [--country-name CYPRUS] [--no-poi] [--no-gdb]
//
// До сих пор каждый опыт ехал к машине своим набором: отдельно `XAC` (маршрут),
// отдельно `GDB` (отрисовка), а блоки точек интереса вообще лежали в `out/cyp/lit`
// и в набор заведены не были. Здесь они собираются в один образ, который
// ставится за один заход.
//
// Что внутри:
//
//   XAC   маршрутный граф Кипра в слоте донорского тайла (`src/mkcyp.js`):
//         дороги, `ZF-NAMEN`, `ZE-NAMEN`, `ZE-NAMEN-MMI`, `HAUSNUMMERN`,
//         правки реестра, сквозной нумерации блоков и общего растра;
//   GDB   том отрисовки, собранный с нуля (`src/gdbgen.js`), все 12 уровней;
//   LIT2  точки интереса (`src/mklit.js`): узел, 64 листа и два переписанных
//         предка садятся в свои слоты в томе 2.
//
// Компоненты независимы: `XAC` отвечает за маршрут и ввод адреса, `GDB` — за
// картинку, `LIT2` — за поиск точек интереса. Ставятся они по отдельности, но
// образ один, и `metainfo2.txt` с `.pkg` описывают сразу все три.
//
// Чего в образе НЕТ и почему: `GDB2` (второй том у нас пуст), `LIT`, `LIT3`,
// `LIT4` (наши блоки лежат целиком в томе 2, остальные тома остаются
// заводскими), `CTY`/`TER` (трёхмерные здания и рельеф — не разбирались),
// `PIT`, `TMC`, `SDS` (от покрытия не зависят, заводские остаются на месте).
// Австралийский набор показывает, что без `CTY`, `TER`, `GDB2` и `PIT`
// устройство работает — см. docs/dataset.md.

const fs = require('fs');
const path = require('path');
const { mkcyp, readHouses } = require('./mkcyp');
const gdbgen = require('./gdbgen');
const { mklit } = require('./mklit');

function readRoads(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return j.features.filter((f) => f.geometry && f.geometry.type === 'LineString').map((f) => {
    const p = f.properties || {};
    return {
      name: ((p.ref || p.name || '') + '').trim().slice(0, 15) || 'CY',
      cls: p.highway || null,
      pts: f.geometry.coordinates,
    };
  });
}

function mkimage(outDir, opt) {
  const o = opt || {};
  const log = o.log || (() => {});
  const roadsFile = o.roads || 'out/cyp/roads.geojson';
  const out = { outDir, components: [] };

  // ---- XAC: маршрутный граф и имена ----
  log('=== XAC: маршрутный граф ===');
  out.xac = mkcyp(outDir, {
    donor: o.donor, roads: roadsFile, classes: o.classes,
    places: o.places, houses: o.houses, countryName: o.countryName, log,
  });
  out.components.push(out.xac.container);

  // ---- GDB: отрисовка ----
  if (o.gdb !== false) {
    log('');
    log('=== GDB: том отрисовки ===');
    const lines = readRoads(roadsFile);
    const levels = o.levels === 'all' || o.levels === undefined
      ? gdbgen.EUROPE_LEVELS.map((_, i) => i)
      : o.levels;
    const v = gdbgen.volumeFromRoads(lines, { name: o.name || 'EJ211', levels });
    for (const s of v.stats) {
      log('  L' + String(s.nr).padStart(2) + ': дорог ' + String(s.lines).padStart(6) +
          ', тайлов ' + String(s.tiles).padStart(4) + ', кластеров ' + String(s.clusters).padStart(3));
    }
    const c = gdbgen.component(outDir, v, { name: o.name });
    log('GDB: ' + c.file + ', ' + (c.size / 1048576).toFixed(2) + ' МБ, дорог ' + lines.length);
    out.gdb = { lines: lines.length, size: c.size, stats: v.stats };
    out.components.push('GDB');
  }

  // ---- LIT: точки интереса ----
  if (o.poi !== false) {
    log('');
    log('=== LIT: точки интереса ===');
    out.lit = mklit(outDir, { blocks: o.blocks, log });
    out.components.push(out.lit.name);
  }

  return out;
}

module.exports = { mkimage, readRoads };

if (require.main === module) {
  const args = process.argv.slice(2);
  const outDir = args[0];
  const flag = (n, d) => { const i = args.indexOf('--' + n); return i > 0 && args[i + 1] ? args[i + 1] : d; };
  if (!outDir || outDir.startsWith('--')) {
    console.error('использование: node src/mkimage.js <каталог-выхода> [--donor IS01] ' +
                  '[--roads ...] [--places ...] [--houses ...] [--blocks out/cyp/lit] [--no-poi] [--no-gdb]');
    process.exit(2);
  }
  const places = flag('places', 'out/cyp/places_geo.json');
  const houses = flag('houses', 'out/cyp/cyprus-latest.osm.pbf');
  const r = mkimage(outDir, {
    donor: flag('donor', 'IS01'),
    roads: flag('roads', 'out/cyp/roads.geojson'),
    classes: flag('classes', 'motorway,motorway_link,trunk,trunk_link,primary,primary_link').split(','),
    places: fs.existsSync(places) ? JSON.parse(fs.readFileSync(places, 'utf8')) : null,
    houses: fs.existsSync(houses) ? readHouses(houses) : null,
    countryName: flag('country-name', 'CYPRUS'),
    blocks: flag('blocks', 'out/cyp/lit'),
    levels: flag('levels', 'all') === 'all' ? 'all' : flag('levels').split(',').map(Number),
    poi: !args.includes('--no-poi'),
    gdb: !args.includes('--no-gdb'),
    log: (m) => console.log(m),
  });
  console.log();
  console.log('готово: ' + outDir + '  компоненты: ' + r.components.join(', '));
  console.log('Кипр в слоте ' + r.xac.donor + ': ' + r.xac.blocks + ' блоков, ' +
              r.xac.nodes + ' узлов, ' + r.xac.edges + ' рёбер' +
              (r.gdb ? '; GDB ' + r.gdb.lines + ' дорог' : '') +
              (r.lit ? '; POI ' + r.lit.blocks.length + ' блоков' : ''));
  console.log('дальше: node src/setcheck.js ' + outDir);
  console.log('       node src/mkmeta.js ' + outDir + ' --keep-pkg');
  console.log('после установки на машине: tools/write_fixacios.sh');
}
