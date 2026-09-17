'use strict';
// Ответ Overpass API -> GeoJSON с LineString, пригодный для src/gdbroads.js.
//
// Overpass отдаёт `elements` с type="way" и geometry=[{lat,lon},…] (нужен
// вывод `out geom;`). Здесь только две содержательные вещи:
//
//   * элемент тайла GDB хранит не больше 254 точек, поэтому длинные дороги
//     режутся на куски с перекрытием в одну точку — иначе на стыке будет
//     разрыв;
//   * порядок точек сохраняется, ничего не упрощается: прореживание сместило
//     бы геометрию, а нам важно совпадение с реальностью.
//
//   node src/osm2geo.js <overpass.json> <выход.geojson> [--max 254]

const fs = require('fs');

function split(pts, max) {
  if (pts.length <= max) return [pts];
  const out = [];
  for (let i = 0; i < pts.length - 1; i += max - 1) out.push(pts.slice(i, i + max));
  return out.filter(p => p.length >= 2);
}

function convert(src, max) {
  const j = JSON.parse(fs.readFileSync(src, 'utf8'));
  const ways = (j.elements || []).filter(e => e.type === 'way' && Array.isArray(e.geometry));
  const features = [];
  let split_ = 0;
  for (const w of ways) {
    const pts = w.geometry.map(g => [g.lon, g.lat]);
    const parts = split(pts, max);
    if (parts.length > 1) split_++;
    for (const p of parts) features.push({
      type: 'Feature',
      properties: { id: w.id, highway: (w.tags || {}).highway || null, ref: (w.tags || {}).ref || null },
      geometry: { type: 'LineString', coordinates: p },
    });
  }
  return { fc: { type: 'FeatureCollection', features }, ways: ways.length, split: split_ };
}

if (require.main === module) {
  const [src, dst] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const mi = process.argv.indexOf('--max');
  const max = mi > 0 ? Number(process.argv[mi + 1]) : 254;
  if (!src || !dst) { console.error('укажите: <overpass.json> <выход.geojson>'); process.exit(1); }
  const r = convert(src, max);
  fs.writeFileSync(dst, JSON.stringify(r.fc));
  const pts = r.fc.features.reduce((n, f) => n + f.geometry.coordinates.length, 0);
  console.log('дорог в ответе :', r.ways);
  console.log('линий на выходе:', r.fc.features.length, '(разрезано длинных:', r.split + ')');
  console.log('точек          :', pts);
  console.log('записано       :', dst);
}

module.exports = { convert, split };
