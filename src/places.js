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
