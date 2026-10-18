'use strict';
// Ответ Overpass API -> GeoJSON с LineString (out/cyp/roads.geojson) для src/mkcyprus.js.
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

// Одностороннее движение по тегам OSM: 1 — только по порядку точек, -1 —
// только против, 0 — в обе стороны. Явный `oneway` главнее подразумеваемого;
// подразумевается он у `motorway`, `motorway_link` и у кольца
// (`junction=roundabout|circular`). `reversible`/`alternating` меняют
// направление по времени — считаем двусторонними.
function onewayOf(t) {
  const v = String(t.oneway || '').toLowerCase();
  if (v === 'yes' || v === '1' || v === 'true') return 1;
  if (v === '-1' || v === 'reverse') return -1;
  if (v === 'no' || v === '0' || v === 'false' || v === 'reversible' || v === 'alternating') return 0;
  if (t.highway === 'motorway' || t.highway === 'motorway_link') return 1;
  if (t.junction === 'roundabout' || t.junction === 'circular') return 1;
  return 0;
}

// Ограничение скорости в км/ч или null. Число, «N mph», зональные значения
// (`CY:urban` 50, `CY:rural` 80, `CY:motorway` 100, британские `GB:nsl_*` на
// базах) — из `maxspeed`, при его отсутствии из `maxspeed:type`; если задано
// только по направлениям, берётся меньшее. `none`, `signals`, `walk` и прочее
// нечисловое — null.
const ZONE = { 'CY:urban': 50, 'CY:rural': 80, 'CY:motorway': 100, 'CY:trunk': 80,
               'GB:nsl_single': 97, 'GB:nsl_dual': 113, 'GB:motorway': 113 };
function speedOf(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (ZONE[s] !== undefined) return ZONE[s];
  const m = /^(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh)?$/i.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return Math.round(m[2] && m[2].toLowerCase() === 'mph' ? n * 1.609344 : n) || null;
}
function maxspeedOf(t) {
  const a = speedOf(t.maxspeed);
  if (a) return a;
  const f = speedOf(t['maxspeed:forward']), b = speedOf(t['maxspeed:backward']);
  if (f || b) return Math.min(f || Infinity, b || Infinity);
  return speedOf(t['maxspeed:type']);
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
      properties: {
        id: w.id,
        highway: (w.tags || {}).highway || null,
        ref: (w.tags || {}).ref || null,
        // имена нужны разделу ZE-NAMEN: латиница предпочтительнее греческого
        name: (w.tags || {}).name || null,
        name_en: (w.tags || {})['name:en'] || null,
        int_name: (w.tags || {}).int_name || null,
        oneway: onewayOf(w.tags || {}),
        maxspeed: maxspeedOf(w.tags || {}),
      },
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

module.exports = { convert, split, onewayOf, maxspeedOf };
