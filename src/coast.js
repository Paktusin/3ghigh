'use strict';
// Суша Кипра из береговой линии OSM (`natural=coastline`).
//
//   node src/coast.js out/cyp/cyprus-latest.osm.pbf --out out/cyp/land.json
//
// Линии берега в OSM — цепочки с сушей СЛЕВА; сшиваем их по общим концевым
// узлам в замкнутые кольца. Извлечение Geofabrik по Кипру даёт 415 линий и
// 87 колец, все замкнуты (остров и островки). Внутренние водоёмы береговой
// линией не размечаются, поэтому заливка кольца по чёт-нечёт — это суша.
//
// Выход — JSON { rings: [[[lon, lat], …], …] } в градусах; первая точка
// кольца не повторяется в конце.

const fs = require('fs');
const osm = require('./osmpbf');

function landRings(pbfPath) {
  const idx = osm.read(pbfPath, { node: () => false, way: (t) => t.natural === 'coastline' });
  const byStart = new Map();
  for (const w of idx.ways) byStart.set(w.refs[0], w);
  const used = new Set();
  const rings = [];
  for (const w of idx.ways) {
    if (used.has(w)) continue;
    used.add(w);
    let refs = w.refs.slice();
    while (refs[0] !== refs[refs.length - 1]) {
      const nx = byStart.get(refs[refs.length - 1]);
      if (!nx || used.has(nx)) break;
      used.add(nx);
      refs = refs.concat(nx.refs.slice(1));
    }
    if (refs[0] !== refs[refs.length - 1]) continue;           // незамкнутое — пропускаем
    const ring = [];
    for (const r of refs.slice(0, -1)) {
      const c = osm.coord(idx, r);
      if (c) ring.push([c[0] / 1e7, c[1] / 1e7]);
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

module.exports = { landRings };

if (require.main === module) {
  const args = process.argv.slice(2);
  const src = args.find((a) => !a.startsWith('--')) || 'out/cyp/cyprus-latest.osm.pbf';
  const i = args.indexOf('--out');
  const out = i >= 0 ? args[i + 1] : 'out/cyp/land.json';
  const rings = landRings(src);
  fs.writeFileSync(out, JSON.stringify({ rings }));
  const pts = rings.reduce((a, r) => a + r.length, 0);
  console.log('колец суши: ' + rings.length + ', точек ' + pts + ' -> ' + out);
}
