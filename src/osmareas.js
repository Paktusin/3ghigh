'use strict';
// Площадные объекты OSM для GDB: вода, лес, парки, застройка, промзоны,
// аэродромы. Классы — заводские (docs/formats/gdb.md, «Площадные классы»).
//
//   node src/osmareas.js out/cyp/cyprus-latest.osm.pbf --out out/cyp/areas.json
//
// Берутся замкнутые линии с нужными тегами и отношения type=multipolygon
// (внешние кольца — против часовой, внутренние — по часовой: заливка по
// ненулевой обмотке даёт дыры там, где они есть, и объединение там, где
// объекты одного класса перекрываются).

const fs = require('fs');
const osm = require('./osmpbf');

// тег → [атрибут, E0]; E0 уточняется по площади (у завода вода 18/25/34)
function classify(t) {
  if (!t) return null;
  if (t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin' ||
      t.natural === 'salt_pond' || t.landuse === 'salt_pond') return 'water';
  if (t.landuse === 'forest' || t.natural === 'wood') return 'forest';
  if (t.leisure === 'park' || t.leisure === 'garden' || t.leisure === 'golf_course' || t.leisure === 'nature_reserve' ||
      t.boundary === 'national_park') return 'park';
  if (t.landuse === 'residential' || t.landuse === 'commercial' || t.landuse === 'retail') return 'built';
  if (t.landuse === 'industrial' || t.landuse === 'port') return 'industrial';
  if (t.aeroway === 'aerodrome') return 'airport';
  if (t.aeroway === 'apron') return 'apron';
  return null;
}

// площадь кольца в градусах² (со знаком: + против часовой)
function signedArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a / 2;
}
const orient = (r, ccw) => ((signedArea(r) > 0) === ccw ? r : r.slice().reverse());
const km2 = (r, lat) => Math.abs(signedArea(r)) * 111.32 * Math.cos(lat * Math.PI / 180) * 111.32;

// сшить линии в замкнутые кольца по концевым узлам
function stitch(ways) {
  const rings = [];
  const pool = ways.map(w => w.refs.slice());
  while (pool.length) {
    let r = pool.pop();
    let grew = true;
    while (r[0] !== r[r.length - 1] && grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i], end = r[r.length - 1];
        if (w[0] === end) r = r.concat(w.slice(1));
        else if (w[w.length - 1] === end) r = r.concat(w.slice(0, -1).reverse());
        else continue;
        pool.splice(i, 1); grew = true; break;
      }
    }
    if (r[0] === r[r.length - 1] && r.length >= 4) rings.push(r);
  }
  return rings;
}

function readAreas(pbf) {
  const rel = osm.read(pbf, { node: () => false, way: () => false,
    relation: t => t.type === 'multipolygon' && classify(t) !== null });
  const wayIds = new Set();
  for (const r of rel.relations) for (const m of r.members) if (m.type === 1) wayIds.add(m.ref);
  const idx = osm.read(pbf, { node: () => false, way: t => classify(t) !== null || t.waterway === 'river', wayIds });
  const byId = new Map(idx.ways.map(w => [w.id, w]));
  const toLL = refs => refs.slice(0, -1).map(r => osm.coord(idx, r)).filter(Boolean).map(([x, y]) => [x / 1e7, y / 1e7]);
  const out = [];
  const rivers = [];
  for (const w of idx.ways) {
    if (w.tags.waterway === 'river') {
      const pts = w.refs.map(r => osm.coord(idx, r)).filter(Boolean).map(([x, y]) => [x / 1e7, y / 1e7]);
      if (pts.length >= 2) rivers.push(pts);
      continue;
    }
    const cls = classify(w.tags);
    if (!cls || w.refs.length < 4 || w.refs[0] !== w.refs[w.refs.length - 1]) continue;
    const ring = toLL(w.refs);
    if (ring.length < 3) continue;
    out.push({ cls, rings: [orient(ring, true)], km2: km2(ring, ring[0][1]) });
  }
  for (const r of rel.relations) {
    const cls = classify(r.tags);
    const outer = stitch(r.members.filter(m => m.type === 1 && m.role !== 'inner' && byId.has(m.ref)).map(m => byId.get(m.ref)));
    const inner = stitch(r.members.filter(m => m.type === 1 && m.role === 'inner' && byId.has(m.ref)).map(m => byId.get(m.ref)));
    const rings = [...outer.map(x => orient(toLL(x), true)), ...inner.map(x => orient(toLL(x), false))].filter(x => x.length >= 3);
    if (!outer.length || !rings.length) continue;
    const a = outer.reduce((s, x) => s + km2(toLL(x), rings[0][0][1]), 0) - inner.reduce((s, x) => s + km2(toLL(x), rings[0][0][1]), 0);
    out.push({ cls, rings, km2: a });
  }
  out.rivers = rivers;
  return out;
}

module.exports = { readAreas, classify, signedArea, stitch };

if (require.main === module) {
  const args = process.argv.slice(2);
  const src = args.find(a => !a.startsWith('--')) || 'out/cyp/cyprus-latest.osm.pbf';
  const i = args.indexOf('--out');
  const out = i >= 0 ? args[i + 1] : 'out/cyp/areas.json';
  const feats = readAreas(src);
  // точность — 1e-6° (~0,1 м), чтобы файл был поменьше
  for (const f of feats) f.rings = f.rings.map(r => r.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]));
  const rivers = feats.rivers.map(r => r.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]));
  fs.writeFileSync(out, JSON.stringify({ features: feats, rivers }));
  console.log('рек (waterway=river): ' + rivers.length);
  const st = {};
  for (const f of feats) { st[f.cls] = st[f.cls] || { n: 0, km2: 0 }; st[f.cls].n++; st[f.cls].km2 += f.km2; }
  for (const k in st) console.log(k.padEnd(11), String(st[k].n).padStart(6), st[k].km2.toFixed(1).padStart(9) + ' км²');
  console.log('-> ' + out);
}
