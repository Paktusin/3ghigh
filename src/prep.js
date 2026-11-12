'use strict';
// Входы сборки в out/cyp/ — каждый раз свежие: извлечение OSM с Geofabrik,
// из него дороги, суша и площади; рельеф — тайлы Terrarium (src/dem.js).
//
//   node src/prep.js            (npm run prep, первый шаг npm run build)

const fs = require('fs');
const { execFileSync } = require('child_process');

const DIR = 'out/cyp';
const PBF = DIR + '/cyprus-latest.osm.pbf';
const URL = 'https://download.geofabrik.de/europe/cyprus-latest.osm.pbf';

const run = (...args) => execFileSync(process.execPath, args, { stdio: 'inherit' });

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  console.log('OSM: ' + URL);
  const r = await fetch(URL);
  if (!r.ok) throw new Error('Geofabrik: ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(PBF + '.part', buf);
  fs.renameSync(PBF + '.part', PBF);           // недокачанный файл не подменит прежний
  console.log('  ' + (buf.length / 1048576).toFixed(1) + ' МБ, ' + (r.headers.get('last-modified') || ''));
  run('src/osm2geo.js', PBF, DIR + '/roads.geojson');
  run('src/coast.js', PBF);
  run('src/osmareas.js', PBF);
  run('src/dem.js');
})().catch((e) => { console.error(e.message); process.exit(1); });
