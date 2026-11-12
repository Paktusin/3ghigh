'use strict';
// Кипрская таблица локаций TMC из OSM: трассы A и дороги B, развязки и
// пересечения, округа. Модель — как у заводских таблиц (docs/formats/tmc.md):
// Европа (тип 1) → Кипр (3) → округа (12); дороги — линии (21 трасса,
// 22 дорога B) с номером, названием и концами; точки (37 съезд, 45
// пересечение) с цепочкой neg/pos, ссылкой на линию и округ, x20/x24 —
// метры по дороге до следующей и предыдущей точки.
//
//   node src/cyptmc.js [out/cyp/cyprus-latest.osm.pbf] [--out out/cyp/tmc]

const fs = require('fs');
const path = require('path');
const osm = require('./osmpbf');
const xac = require('./xac');
const fldb = require('./fldb');
const tlt = require('./tlt');
const enc = require('./tltenc');
const { stitch } = require('./osmareas');

const CC = 2, LTN = 1, ECC = 0xe1, FILE = 'EJ211_02_01.tlt';
const ROAD = /^(A|B)\d+$/;
const refOf = t => (t.ref || '').split(';').map(s => s.trim()).find(s => ROAD.test(s));
const isRoad = t => /^(motorway|trunk|primary|secondary)$/.test(t.highway || '') && refOf(t);

const GREEK = 'ΑAΆAΒVΓGΔDΕEΈEΖZΗIΉIΘΘΙIΊIΚKΛLΜMΝNΞXΟOΌOΠPΡRΣSΤTΥYΎYΦFΧΧΨΨΩOΏO';
const G = new Map(); for (let i = 0; i < GREEK.length; i += 2) G.set(GREEK[i], GREEK[i + 1]);
const SPEC = { Θ: 'Th', Χ: 'Ch', Ψ: 'Ps' };
// Имя латиницей Latin-1, регистр как в оригинале.
function latin(s) {
  let out = '';
  for (const ch of String(s).normalize('NFC')) {
    const up = ch.toUpperCase(), lower = ch !== up;
    const base = up.normalize('NFD')[0];
    let r = SPEC[base] || G.get(up) || G.get(base);
    if (r) { out += lower ? r.toLowerCase() : r; continue; }
    out += ch.charCodeAt(0) < 256 ? ch : ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}
const nameOf = t => latin(t['name:en'] || t.int_name || t.name || '');

const metres = ([x1, y1], [x2, y2]) => {
  const k = Math.cos((y1 + y2) / 2e7 * Math.PI / 180);
  return Math.hypot((x2 - x1) * k, y2 - y1) * 0.0111319;
};

function inside([x, y], ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// Ось дороги: дальний конец по неориентированному графу, от него — самый
// длинный путь по направленному (односторонние проезжие части идут каждая в
// свою сторону, иначе путь уходит по одной и возвращается по встречной).
function axis(ways, at) {
  const und = new Map(), dir = new Map(), rev = new Map();
  const add = (m, a, b, w) => { if (!m.has(a)) m.set(a, []); m.get(a).push([b, w]); };
  for (const w of ways) {
    const one = w.tags.oneway === 'yes' || w.tags.oneway === '1' || (w.tags.highway === 'motorway' && w.tags.oneway !== 'no');
    const refs = w.tags.oneway === '-1' ? w.refs.slice().reverse() : w.refs;
    for (let i = 1; i < refs.length; i++) {
      const a = refs[i - 1], b = refs[i], pa = at(a), pb = at(b);
      if (!pa || !pb) continue;
      const m = metres(pa, pb);
      add(und, a, b, m); add(und, b, a, m); add(dir, a, b, m); add(rev, b, a, m);
      if (!one && w.tags.oneway !== '-1') { add(dir, b, a, m); add(rev, a, b, m); }
    }
  }
  const far = (adj, s) => {
    const d = new Map([[s, 0]]), prev = new Map(), q = [[0, s]];
    while (q.length) {
      let bi = 0; for (let i = 1; i < q.length; i++) if (q[i][0] < q[bi][0]) bi = i;
      const [du, u] = q.splice(bi, 1)[0];
      if (du > d.get(u)) continue;
      for (const [v, w] of adj.get(u) || []) if (!d.has(v) || du + w < d.get(v)) { d.set(v, du + w); prev.set(v, u); q.push([du + w, v]); }
    }
    let best = s; for (const [k, v] of d) if (v > d.get(best)) best = k;
    return { best, d, prev };
  };
  let comp = far(und, und.keys().next().value);
  for (const k of und.keys()) if (!comp.d.has(k)) { const c = far(und, k); if (c.d.size > comp.d.size) comp = c; }
  // кратчайший направленный путь между двумя дальними концами: петли не будет
  // концы — по прямой: у двух проезжих частей, сведённых с одного края, дальние
  // по графу узлы оказались бы двумя концами одного края
  const ids = [...comp.d.keys()], geo = (o) => ids.reduce((b, k) => metres(at(k), at(o)) > metres(at(b), at(o)) ? k : b, o);
  const s = geo(geo(ids[0])), e = geo(s);
  let g = far(dir, s), to = e, back = false;
  if (!g.d.has(e)) { g = far(rev, s); back = g.d.has(e); if (!back) g = far(und, s); }
  const line = [];
  for (let u = to; u !== undefined; u = g.prev.get(u)) line.push(u);
  if (!back) line.reverse();
  let run = 0;
  return line.map((id, i) => { if (i) run += metres(at(line[i - 1]), at(id)); return { id, p: at(id), run }; });
}

// Пробег точки по оси: ближайшая вершина, если ближе 300 м.
function chain(ax, p, lim = 300) {
  let best = null, bd = lim;
  for (const v of ax) { const d = metres(v.p, p); if (d < bd) { bd = d; best = v; } }
  return best && best.run;
}

function build(pbf) {
  const rel = osm.read(pbf, { node: () => false, way: () => false,
    relation: t => t.boundary === 'administrative' && t.admin_level === '5' });
  const memberIds = new Set(rel.relations.flatMap(r => r.members.filter(m => m.type === 1).map(m => m.ref)));
  const idx = osm.read(pbf, {
    node: t => t.highway === 'motorway_junction' || /^(city|town|village)$/.test(t.place || ''),
    way: isRoad, wayIds: memberIds,
  });
  const at = id => osm.coord(idx, id);
  const byId = new Map(idx.ways.map(w => [w.id, w]));
  const districts = rel.relations.map(r => ({
    name: nameOf(r.tags).replace(/ District$/, ''),
    rings: stitch(r.members.filter(m => m.type === 1 && m.role !== 'inner' && byId.has(m.ref)).map(m => byId.get(m.ref))).map(rg => rg.map(at).filter(Boolean)),
  }));
  const districtOf = p => districts.find(d => d.rings.some(rg => inside(p, rg)));
  const places = idx.points.filter(p => p.tags.place && nameOf(p.tags));
  const near = p => { let b = null, bd = 1e18; for (const q of places) { const d = metres(p, [q.lon, q.lat]); if (d < bd) { bd = d; b = q; } } return nameOf(b.tags); };
  const junctions = idx.points.filter(p => p.tags.highway === 'motorway_junction');

  const roads = new Map();
  for (const w of idx.ways) if (w.tags.highway && isRoad(w.tags)) { const r = refOf(w.tags); if (!roads.has(r)) roads.set(r, []); roads.get(r).push(w); }
  const nodeRoads = new Map();
  for (const [ref, ws] of roads) for (const w of ws) for (const n of w.refs) { if (!nodeRoads.has(n)) nodeRoads.set(n, new Set()); nodeRoads.get(n).add(ref); }

  const out = [];
  for (const [ref, ws] of [...roads].sort((a, b) => a[0][0].localeCompare(b[0][0]) || +a[0].slice(1) - +b[0].slice(1))) {
    const ax = axis(ws, at);
    if (ax.length < 2 || ax[ax.length - 1].run < 1000) continue;
    const motorway = ref[0] === 'A', nodes = new Set(ws.flatMap(w => w.refs));
    const cand = motorway
      ? junctions.filter(j => nodes.has(j.id)).map(j => ({ p: [j.lon, j.lat], exit: j.tags.ref, name: j.tags['name:en'] || (j.tags.name && !/^Exit/.test(j.tags.name) ? j.tags.name : '') }))
      : [...[...nodes].filter(n => nodeRoads.get(n).size > 1).map(n => ({ p: at(n) })).filter(c => c.p),
         ...places.filter(q => q.tags.place !== 'city' && chain(ax, [q.lon, q.lat], 700) !== null).map(q => ({ p: [q.lon, q.lat], name: nameOf(q.tags) }))];
    cand.push({ p: ax[0].p }, { p: ax[ax.length - 1].p });
    const pts = [];
    for (const c of cand.map(c => ({ ...c, run: chain(ax, c.p) })).filter(c => c.run !== null).sort((a, b) => a.run - b.run)) {
      const last = pts[pts.length - 1];
      if (last && (c.run - last.run < (motorway ? 800 : 500) || (c.exit && c.exit === last.exit))) { if (!last.name && c.name) last.name = c.name; continue; }
      pts.push(c);
    }
    for (const c of pts) c.name = latin(c.name || near(c.p)) + (c.exit ? ` (${c.exit})` : '');
    const freq = new Map();
    for (const w of ws) { const n = nameOf(w.tags); if (n) freq.set(n, (freq.get(n) || 0) + w.refs.length); }
    out.push({ ref, motorway, name: [...freq].sort((a, b) => b[1] - a[1])[0]?.[0] || ref, pts });
  }
  return { roads: out, districts, districtOf };
}

// Модель → записи tlt.records, имена, координаты.
function table({ roads, districts, districtOf }) {
  const strs = new Set(), recs = [], xy = [];
  const used = new Set();
  for (const r of roads) for (const c of r.pts) { const d = districtOf(c.p); c.district = d && d.name; if (d) used.add(d); }
  const ds = districts.filter(d => used.has(d));
  const S = s => (strs.add(s), s);
  recs.push({ loc: 1, type: 1, n18: S('Europe') }, { loc: 2, type: 3, area: 1, n18: S('Cyprus') });
  ds.forEach((d, i) => recs.push({ loc: 3 + i, type: 12, area: 2, n18: S(d.name) }));
  const dloc = new Map(ds.map((d, i) => [d.name, 3 + i]));
  let next = 1000;
  roads.forEach((r, k) => {
    const line = 100 + k;
    recs.push({ loc: line, type: r.motorway ? 21 : 22, area: 2, n10: S(r.ref), n14: S(r.name), n18: S(r.pts[0].name), n1c: S(r.pts[r.pts.length - 1].name) });
    r.pts.forEach((c, i) => {
      const loc = next + i, R = { loc, type: r.motorway ? 37 : 45, line, area: dloc.get(c.district) || 2, n14: S(r.name), n18: S(c.name) };
      if (i) R.neg = loc - 1, R.x24 = Math.round(c.run - r.pts[i - 1].run);
      if (i + 1 < r.pts.length) R.pos = loc + 1, R.x20 = Math.round(r.pts[i + 1].run - c.run);
      recs.push(R);
      const p = [xac.fromLon(c.p[0] / 1e7), xac.fromLat(c.p[1] / 1e7)];
      xy.push({ loc, start: p, end: p });
    });
    next += r.pts.length + 1;
  });
  const names = [...strs].sort();
  const id = new Map(names.map((s, i) => [s, i + 1]));
  const C = Math.max(...recs.flatMap(r => [r.x20 || 0, r.x24 || 0]));
  const full = recs.sort((a, b) => a.loc - b.loc).map(r => {
    const o = { loc: r.loc, flag: 0, type: r.type, neg: r.neg || 0, pos: r.pos || 0, area: r.area || 0, line: r.line || 0, n10: r.n10 ? id.get(r.n10) : 0 };
    if (r.n14) o.n14 = id.get(r.n14);
    if (r.n18) o.n18 = id.get(r.n18);
    if (r.n1c) o.n1c = id.get(r.n1c);
    if (r.x20 !== undefined) o.x20 = r.x20;
    if (r.x24 !== undefined) o.x24 = r.x24;
    return o;
  });
  return { recs: full, names, xy, C };
}

function raster(xy) {
  const xs = xy.map(q => q.start[0]), ys = xy.map(q => q.start[1]);
  const rect = [Math.min(...xs) - 15000, Math.min(...ys) - 15000, Math.max(...xs) + 15000, Math.max(...ys) + 15000];
  const cols = ((rect[2] - rect[0]) >> 12) + 1, rows = ((rect[3] - rect[1]) >> 12) + 1, bpr = (cols + 7) >> 3;
  const r = Buffer.alloc(bpr * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) r[y * bpr + (x >> 3)] |= 1 << (x & 7);
  return { rect, shift: 12, bpr, raster: r };
}

if (require.main === module) {
  const args = process.argv.slice(2), oi = args.indexOf('--out');
  const pbf = args.find(a => !a.startsWith('--') && a !== args[oi + 1]) || 'out/cyp/cyprus-latest.osm.pbf';
  const dir = oi >= 0 ? args[oi + 1] : 'out/cyp/tmc';
  const model = build(pbf), t = table(model);
  // словарь фрагментов имён — из английской заводской таблицы (GB)
  const db = fldb.open('maps/pkgdb/TMC/kN221EUx01t01.db'), es = fldb.entries(db);
  const tok = tlt.names(fldb.read(db, es.find(e => /_12_07\.tlt$/.test(e.name)))).tok;
  const br = raster(t.xy);
  const file = enc.build({ cc: CC, ltn: LTN, file: FILE, recs: t.recs, names: t.names, tok, xy: t.xy, br,
    comment: `\n!14!${FILE}!TMC location table generated from OpenStreetMap by 3ghigh!41!\n` });
  const list = tlt.ov(fldb.read(db, es.find(e => /global\.tlt$/.test(e.name))));
  list.push({ file: FILE, version: 'CYP_1.0', iso: 'CY', ecc: ECC, cc: CC, ltn: LTN, extra: '10e018', rect: br.rect, lang: 'en', blocks: enc.blocks(file) });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, FILE), file);
  fs.writeFileSync(path.join(dir, 'EJ211_global.tlt'), enc.ov(list));
  fs.writeFileSync(path.join(dir, 'model.json'), JSON.stringify(model.roads.map(r => ({ ref: r.ref, name: r.name, pts: r.pts.map(c => [c.name, Math.round(c.run), c.district]) })), null, 1));
  const pts = t.recs.filter(r => r.type >= 35).length;
  console.log(`дорог ${model.roads.length} (трасс ${model.roads.filter(r => r.motorway).length}), точек ${pts}, округов ${t.recs.filter(r => r.type === 12).length}, имён ${t.names.length}, записей ${t.recs.length}`);
  console.log(`${FILE}: ${file.length} байт; реестр: ${list.length} таблиц -> ${dir}`);
}

module.exports = { build, table, raster, latin };
