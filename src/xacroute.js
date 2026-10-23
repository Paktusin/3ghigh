'use strict';
// Эмулятор маршрута по уровням XAC: старт и цель на уровне 1 → подъём на
// уровни 2…4 → спуск по `LAYER 1 VERWEISE` → маршрут уровня 1 в коридоре.
// Всё читается из байт контейнера, как читает прошивка.
//
//   node src/xacroute.js <контейнер XAC .db> [lon1 lat1 lon2 lat2]
//
// Что взято из кода, а что — модель:
// * развёртка вектора уровня k в рёбра уровня 1 и коридор — по коду
//   (`FUN_0827be2c`, `FUN_0827bb54`, `load_korridor` FUN_08ea7d68: после
//   маршрута по укрупнённым уровням «store layer 1 tables of route», затем
//   блоки уровня 1 коридора помечаются по меткам 0…3 и грузятся);
// * стоимость ребра уровня 1 — длина × ETA-KOSTEN[категория][уровень][класс]
//   (`FUN_082722d8`), уровней 2…4 — слово времени записи;
// * направление — биты 3…4 атрибута (1 — только по записи, 2 — против, 3 — нет);
// * как скаут (`scout509`) выбирает уровень, НЕ прочитано. Здесь модель
//   «иерархического» поиска: ребро уровня k годится, если его начало ближе
//   R[k] к старту или к цели (уровень 1 — 3 км, 2 — 15 км, 3 — 40 км,
//   4 — везде). Узлы уровней — те же координаты, что на уровне 1.

const fldb = require('./fldb');
const xac = require('./xac');
const xr = require('./xacrec');
const xg = require('./xacgraph');
const xl = require('./xaclevel');
const v3 = require('./xacv3');
const st = require('./struktur');

const LON = 72000, LAT = 40000000 / 360;
const K = (c) => c.x + ',' + c.y;
const XY = (k) => { const [x, y] = k.split(',').map(Number); return { x, y }; };
const metres = (a, b) => Math.hypot((a.x - b.x) / LON * LAT * Math.cos(a.y / LAT * Math.PI / 180), b.y - a.y);
const RADIUS = { 1: 3000, 2: 15000, 3: 40000, 4: Infinity };

function heap() {
  const a = [];
  return {
    push(k, v) { a.push([k, v]); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } },
    pop() { const top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; },
    get size() { return a.length; },
  };
}

// Рёбра блоков уровня: {a, z, cost, vid, block, ref, level, len}. VID — блок
// << 16 | номер (v5: 2 × номер записи, v3: смещение записи).
function blockEdges(blocks, attr, costOf, level) {
  const out = [];
  const byId = new Map(blocks.map((s) => [s.readUInt16BE(0x34), s]));
  const cc = new Map(); const C = (s) => { if (!cc.has(s)) cc.set(s, xg.entryCoords(s)); return cc.get(s); };
  for (const s of blocks) {
    const id = s.readUInt16BE(0x34), base = s.readUInt16BE(0x36);
    if (s.readUInt16BE(0x14) >= 5 && s.readUInt16BE(0x72) === 1) {
      const tab = s.readUInt32BE(0x6c), cnt = s.readUInt16BE(0x70), me = C(s);
      for (let i = 1; i < cnt; i++) {
        const p = s.readUInt16BE(tab + i * 2) * 2, w = s.readUInt16BE(p);
        if ((w >>> 14) !== 3 || !me.coords[i]) continue;
        const t = (s[p + 2] >> 6) & 1 ? byId.get(base + (s.readUInt16BE(p + 4) & 0x7fff)) : s;
        const z = t && C(t).coords[w & 0x3fff];
        const r = xr.record(s, p, attr, () => {});
        if (!z || !r) continue;
        const a = me.coords[i];
        out.push({ a: K(a), z: K(z), dir: (r.flags >>> 3) & 3, cost: costOf(r, a, z), vid: (id << 16) | (i * 2),
                   block: id, ref: i * 2, level, len: metres(a, z) });
      }
    } else {
      const b = v3.readBlock(s);
      if (!b) continue;
      const byAt = new Map(b.nodes.map((n) => [n.at, n]));
      for (const n of b.nodes) for (const el of n.els) {
        if (el.mark !== 3) continue;
        const t = byAt.get((s.readUInt16BE(el.at) & 0x3fff) * 2), r = xr.record(s, el.at, attr, () => {});
        if (!t || !r) continue;
        const a = { x: n.x, y: n.y }, z = { x: t.x, y: t.y };
        out.push({ a: K(a), z: K(z), dir: (r.flags >>> 3) & 3, cost: costOf(r, a, z), vid: (id << 16) | el.at,
                   block: id, ref: el.at, level, len: metres(a, z) });
      }
    }
  }
  return out;
}

function graphOf(edges) {
  const adj = new Map();
  const add = (k, x) => { if (!adj.has(k)) adj.set(k, []); adj.get(k).push(x); };
  for (const e of edges) {
    if (e.dir === 0 || e.dir === 1) add(e.a, { to: e.z, e, fwd: 1 });
    if (e.dir === 0 || e.dir === 2) add(e.z, { to: e.a, e, fwd: 0 });
  }
  return { adj, edges };
}

function dijkstra(g, starts, opt) {
  const o = opt || {};
  const dist = new Map(), prev = new Map(), h = heap();
  for (const [k, c] of starts) { dist.set(k, c); h.push(c, k); }
  while (h.size) {
    const [d, u] = h.pop();
    if (d > dist.get(u)) continue;
    if (o.goal && o.goal.has(u)) return { dist, prev, end: u };
    for (const x of g.adj.get(u) || []) {
      if (o.allow && !o.allow(x.e, u)) continue;
      const nd = d + x.e.cost;
      if (!dist.has(x.to) || nd < dist.get(x.to)) { dist.set(x.to, nd); prev.set(x.to, { u, x }); h.push(nd, x.to); }
    }
  }
  return { dist, prev, end: null };
}

function pathOf(r, end) {
  const out = [];
  for (let u = end; r.prev.has(u); u = r.prev.get(u).u) out.push(r.prev.get(u).x);
  return out.reverse();
}

// Контейнер: уровень 1 — `_1.xac`, 2 — `_2.xac`, 3/4 — файлы области
// `_<i>_3.b/.v`, `_<i>_4.b/.v` (оглавление `VERYSMART XAC HD`).
function open(dbPath) {
  const db = fldb.open(dbPath);
  const ents = fldb.entries(db), read = (re) => ents.filter((e) => re.test(e.name)).map((e) => ({ name: e.name, buf: fldb.read(db, e) }));
  const xah = read(/\.xah$/)[0].buf;
  const order = [...st.parse(xah).keys()];
  const attr = xr.attributes(xah), eta = xl.etaTable(xah);
  const blocksOf = (buf) => xac.vectorBlocks(buf).map((v) => buf.subarray(v.offset, v.offset + v.size));
  const area = (L) => {
    const out = new Map();
    const fb = read(new RegExp('_\\d+_' + L + '\\.b$')), fv = read(new RegExp('_\\d+_' + L + '\\.v$'));
    for (const f of fb) {
      const b = f.buf, n = b.readUInt16BE(22);
      for (let k = 0; k < n; k++) {
        const o = 24 + k * 16, t = b.readUInt16BE(o), off = b.readUInt32BE(o + 4), sz = b.readUInt32BE(o + 8);
        if (sz) out.set(t, Object.assign(out.get(t) || {}, { blocks: blocksOf(b.subarray(off, off + sz)) }));
      }
    }
    for (const f of fv) {
      const b = f.buf, n = b.readUInt16BE(22);
      for (let k = 0; k < n; k++) {
        const o = 24 + k * 12, t = b.readUInt16BE(o), off = b.readUInt32BE(o + 4), sz = b.readUInt32BE(o + 8);
        if (sz) out.set(t, Object.assign(out.get(t) || {}, { l1v: xl.readVerweise(b.subarray(off, off + sz)) }));
      }
    }
    return out;
  };
  const a3 = area(3), a4 = area(4);
  const tiles = read(/_1\.xac$/).map((f) => {
    const code = f.name.replace(/^.*_([A-Z0-9]{4})_1\.xac$/, '$1'), t = order.indexOf(code);
    const b1 = blocksOf(f.buf);
    const g = read(new RegExp('_' + code + '_2\\.xac$'))[0];
    const sec = g && xac.sections(g.buf).list.find((x) => x.name === 'LAYER 1 VERWEISE');
    const lv = { 1: { blocks: b1 } };
    if (g && sec) lv[2] = { blocks: blocksOf(g.buf), l1v: xl.readVerweise(g.buf.subarray(sec.offset, sec.offset + sec.total)) };
    if (a3.get(t)) lv[3] = a3.get(t);
    if (a4.get(t)) lv[4] = a4.get(t);
    return { code, t, base1: b1.length ? b1[0].readUInt16BE(0x36) : 0, ix: xl.l1Index(b1, attr), lv };
  });
  const cost1 = (r, a, z) => metres(a, z) * eta((r.flags >>> 10) & 7, r.level, (r.flags >>> 5) & 7);
  const edges = { 1: [], 2: [], 3: [], 4: [] };
  for (const T of tiles) for (const k of [1, 2, 3, 4]) {
    if (!T.lv[k] || !T.lv[k].blocks) continue;
    const es = blockEdges(T.lv[k].blocks, attr, k === 1 ? cost1 : (r) => r.speed[1], k);
    es.forEach((e) => { e.tile = T; });
    edges[k].push(...es);
  }
  const g = {}; for (const k of [1, 2, 3, 4]) g[k] = graphOf(edges[k]);
  return { attr, g, tiles };
}

function near(g, p) {
  let best = null;
  for (const k of g.adj.keys()) { const d = metres(p, XY(k)); if (!best || d < best[0]) best = [d, k]; }
  return best;
}

// Список LAYER 1 VERWEISE ребра уровня k и шаги уровня 1 по нему.
function expandEdge(e) {
  const T = e.tile, L = T.lv[e.level];
  if (!L || !L.l1v) return null;
  const base = L.blocks[0].readUInt16BE(0x36), blk = e.block - base;
  const i = L.l1v.keys.findIndex((k) => k.blk === blk && k.ref === e.ref);
  const list = i >= 0 && L.l1v.lists[i];
  if (!list) return null;
  const steps = [];
  for (const el of list.els) { const x = xl.expand(T.ix, el); if (!x) return null; steps.push(...x); }
  return { steps, list };
}

// Маршрут по уровням. Возвращает разбор по шагам.
function route(net, from, to, opt) {
  const o = opt || {};
  const R = o.radius || RADIUS;
  const rep = { from, to };
  const s = near(net.g[1], from), t = near(net.g[1], to);
  const full = dijkstra(net.g[1], [[s[1], 0]], { goal: new Set([t[1]]) });
  rep.l1 = full.end ? { cost: full.dist.get(full.end), km: pathOf(full, full.end).reduce((a, x) => a + x.e.len, 0) / 1000 } : null;
  // общий граф уровней: ребро уровня k годится у своего начала, если оно
  // ближе R[k] к старту или к цели
  const all = { adj: new Map() };
  for (const k of [1, 2, 3, 4]) for (const [u, list] of net.g[k].adj) {
    if (!all.adj.has(u)) all.adj.set(u, []);
    all.adj.get(u).push(...list);
  }
  const P = XY(s[1]), Q = XY(t[1]);
  const okAt = new Map();
  const allow = (e, u) => {
    if (e.level === 4) return true;
    const key = u + ':' + e.level;
    if (!okAt.has(key)) { const p = XY(u); okAt.set(key, Math.min(metres(p, P), metres(p, Q)) <= R[e.level]); }
    return okAt.get(key);
  };
  const r = dijkstra(all, [[s[1], 0]], { goal: new Set([t[1]]), allow });
  if (!r.end) { rep.fail = 'по уровням цель не достигнута'; return rep; }
  const path = pathOf(r, r.end);
  rep.levels = {}; for (const x of path) rep.levels[x.e.level] = (rep.levels[x.e.level] || 0) + 1;
  rep.cost = r.dist.get(r.end);
  // спуск: рёбра уровней 2…4 — по LAYER 1 VERWEISE в рёбра уровня 1
  const corridor = new Set();
  let broken = 0, l1vecs = 0;
  for (const x of path) {
    if (x.e.level === 1) { corridor.add(x.e.block); continue; }
    const ex = expandEdge(x.e);
    if (!ex) { broken++; continue; }
    const T = x.e.tile, node = (q, last) => { const v = T.ix.V.get(q.vid); return (q.fwd ? last : !last) ? v.b : v.a; };
    const a = node(ex.steps[0], false), z = node(ex.steps[ex.steps.length - 1], true);
    if (!(a === x.e.a && z === x.e.z)) broken++;
    l1vecs += ex.steps.length;
    for (const q of ex.steps) corridor.add(T.base1 + (q.vid >>> 16));
    for (const c of ex.list.corridor) corridor.add(T.base1 + c.blk);
  }
  rep.down = { l1vecs, broken, blocks: corridor.size };
  const fin = dijkstra(net.g[1], [[s[1], 0]], { goal: new Set([t[1]]), allow: (e) => corridor.has(e.block) });
  rep.final = fin.end ? { cost: fin.dist.get(fin.end), km: pathOf(fin, fin.end).reduce((a, x) => a + x.e.len, 0) / 1000 } : null;
  if (!fin.end) rep.fail = 'уровень 1 в коридоре: цель не достигнута';
  return rep;
}

// Сплошная сверка: каждый вектор уровней 2…4 разворачивается по LAYER 1
// VERWEISE ровно в свои концы, ключи записей A — векторы блока по порядку.
function checkAll(net) {
  const out = {};
  for (const k of [2, 3, 4]) {
    const st2 = { vectors: 0, lists: 0, keysOk: 0, ends: 0, broken: 0, hops: [] };
    for (const T of net.tiles) {
      const L = T.lv[k];
      if (!L || !L.l1v) continue;
      const mine = net.g[k].edges.filter((e) => e.tile === T).sort((a, b) => a.block - b.block || a.ref - b.ref);
      st2.vectors += mine.length; st2.lists += L.l1v.lists.length;
      const base = L.blocks[0].readUInt16BE(0x36);
      mine.forEach((e, i) => {
        const key = L.l1v.keys[i];
        if (key && key.blk === e.block - base && key.ref === e.ref) st2.keysOk++;
        const ex = expandEdge(e);
        if (!ex) { st2.broken++; return; }
        const node = (q, last) => { const v = T.ix.V.get(q.vid); return (q.fwd ? last : !last) ? v.b : v.a; };
        if (node(ex.steps[0], false) === e.a && node(ex.steps[ex.steps.length - 1], true) === e.z) st2.ends++;
        else st2.broken++;
        st2.hops.push(ex.steps.length);
      });
    }
    const h = st2.hops.sort((a, b) => a - b);
    st2.hops = { med: h[h.length >> 1], p90: h[Math.floor(h.length * 0.9)], max: h[h.length - 1] };
    out[k] = st2;
  }
  return out;
}

const PAIRS = [
  [[33.0436, 34.6786], [33.3623, 35.1676], 'Лимасол → Никосия'],
  [[33.6233, 34.9167], [32.4245, 34.7754], 'Ларнака → Пафос'],
  [[32.4245, 34.7754], [33.9425, 35.1213], 'Пафос → Фамагуста'],
  [[33.0436, 34.6786], [33.0592, 34.6840], 'Лимасол: соседняя улица'],
];
const P = (lon, lat) => ({ x: Math.round(lon * LON), y: Math.round(lat * LAT) });

function ok(r) { return !r.fail && r.final && !r.down.broken; }

module.exports = { open, route, checkAll, dijkstra, PAIRS, P, ok };

if (require.main === module) {
  const a = process.argv.slice(2);
  const net = open(a[0]);
  const ca = checkAll(net);
  let bad = 0;
  for (const k of [2, 3, 4]) {
    const c = ca[k];
    console.log('развёртка уровня ' + k + ': векторов ' + c.vectors + ', списков ' + c.lists + ', ключи сошлись ' + c.keysOk +
                ', концы сошлись ' + c.ends + ', рвётся ' + c.broken + '; рёбер уровня 1 на вектор: медиана ' +
                c.hops.med + ', p90 ' + c.hops.p90 + ', max ' + c.hops.max);
    if (c.broken || c.keysOk !== c.vectors || c.lists !== c.vectors) bad++;
  }
  const pairs = a.length >= 5 ? [[[+a[1], +a[2]], [+a[3], +a[4]], 'заданный']] : PAIRS;
  for (const [f, t, name] of pairs) {
    const r = route(net, P(...f), P(...t));
    if (!ok(r)) bad++;
    console.log(name + ': ' + (ok(r) ? 'маршрут есть' : 'НЕТ: ' + (r.fail || 'развёртка рвётся')) +
      ' | уровень 1 целиком ' + (r.l1 ? r.l1.km.toFixed(1) + ' км, ' + (r.l1.cost / 60000).toFixed(1) + ' «мин»' : '—') +
      (r.levels ? ' | рёбер по уровням ' + JSON.stringify(r.levels) : '') +
      (r.down ? ' | спуск: рёбер уровня 1 ' + r.down.l1vecs + ', рвётся ' + r.down.broken + ', блоков коридора ' + r.down.blocks : '') +
      (r.final ? ' | в коридоре ' + r.final.km.toFixed(1) + ' км, ' + (r.final.cost / 60000).toFixed(1) + ' «мин»' : ''));
  }
  process.exit(bad ? 1 : 0);
}
