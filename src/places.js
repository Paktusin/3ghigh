'use strict';
// Города для адресного справочника и ORTSNAMEN: склейка двойников.
//
// Список out/cyp/places_geo.json собран из адресов, и у одного города бывает
// два написания с одними координатами (LIMASSOL/LEMESOS, AYIA NAPA/AGIA NAPA,
// YERMASOYIA/GERMASOGEIA) — на машине это два города в списке (19.10).
// Склеиваем по координате; имя берём то, что совпадает с `name:en` объекта
// `place` OSM в этой точке, иначе первое по списку.
const osm = require('./osmpbf');
const { latinize } = require('./xacroads');

const key = (p) => p.lon.toFixed(4) + ',' + p.lat.toFixed(4);
const norm = (s) => latinize(String(s || '')).toUpperCase().replace(/\s+/g, ' ').trim();

// name:en объектов place по координате (тот же ключ, что у списка)
function englishNames(pbf) {
  const want = (t) => !!t.place && !!t['name:en'];
  const idx = osm.read(pbf, { node: want });
  const m = new Map();
  for (const p of idx.points) m.set(key({ lon: p.lon / 1e7, lat: p.lat / 1e7 }), norm(p.tags['name:en']));
  return m;
}

function dedupe(places, en) {
  const groups = new Map(), out = [];
  for (const p of places) {
    if (p.lon == null || p.lat == null) { out.push(p); continue; }
    const k = key(p);
    if (!groups.has(k)) { groups.set(k, []); out.push(k); }
    groups.get(k).push(p);
  }
  return out.map((x) => {
    if (typeof x !== 'string') return x;
    const g = groups.get(x);
    const want = en && en.get(x);
    return (want && g.find((p) => norm(p.name) === want)) || g[0];
  });
}

module.exports = { dedupe, englishNames, key };

// Города и районы прямо из OSM (20.10): place=city/town/village/hamlet — города
// справочника и ORTSNAMEN, place=suburb/quarter/neighbourhood — районы. Имя —
// name:en (иначе name), латиницей как в XAC. Одинаковые имена ближе 3 км —
// один город (оставляем более крупный); одинаковые имена дальше — оба, ко
// второму и следующим через запятую добавляется ближайший город или городок.
const RANK = { city: 4, town: 3, village: 2, hamlet: 1, suburb: 0, quarter: 0, neighbourhood: 0 };
const TOWNS = ['city', 'town', 'village', 'hamlet'];
const DISTRICTS = ['suburb', 'quarter', 'neighbourhood'];

function dist2(a, b) {
  const dx = (a.lon - b.lon) * Math.cos(a.lat * Math.PI / 180), dy = a.lat - b.lat;
  return dx * dx + dy * dy;                        // градусы^2, для сравнения
}

function fromOsm(pbf) {
  const want = (t) => !!t.place && RANK[t.place] !== undefined && !!(t['name:en'] || t.name);
  const idx = osm.read(pbf, { node: want });
  const all = idx.points.map((p) => ({
    name: norm(p.tags['name:en'] || p.tags.name), lon: p.lon / 1e7, lat: p.lat / 1e7, kind: p.tags.place,
  })).filter((p) => p.name && /[A-Z]/.test(p.name));
  const towns = all.filter((p) => TOWNS.includes(p.kind))
    .sort((a, b) => RANK[b.kind] - RANK[a.kind] || (a.name < b.name ? -1 : 1));
  const places = [];
  const km3 = Math.pow(3 / 111, 2);
  for (const p of towns) {
    if (places.some((q) => q.name === p.name && dist2(p, q) < km3)) continue;   // двойник
    places.push(p);
  }
  // одинаковые имена в разных местах — различаем ближайшим городом/городком
  const big = places.filter((p) => p.kind === 'city' || p.kind === 'town');
  const seen = new Map();
  for (const p of places) {
    const n = seen.get(p.name) || 0;
    seen.set(p.name, n + 1);
    if (!n) continue;
    const near = big.filter((q) => q !== p && q.name !== p.name)
      .sort((a, b) => dist2(p, a) - dist2(p, b))[0];
    p.name = p.name + ', ' + (near ? near.name : String(n + 1));
  }
  // районы — к ближайшему городу/городку не дальше 15 км
  const km15 = Math.pow(15 / 111, 2);
  const districts = [];
  for (const d of all.filter((p) => DISTRICTS.includes(p.kind))) {
    let best = -1, bd = Infinity;
    places.forEach((q, i) => {
      if (q.kind !== 'city' && q.kind !== 'town') return;
      const x = dist2(d, q);
      if (x < bd) { bd = x; best = i; }
    });
    if (best < 0 || bd > km15 || d.name === places[best].name) continue;
    if (districts.some((x) => x.name === d.name && x.parent === best)) continue;
    districts.push(Object.assign(d, { parent: best }));
  }
  return { places, districts };
}

module.exports.fromOsm = fromOsm;
