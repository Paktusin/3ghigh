'use strict';
// Бюджет тайла и подбор доноров под новую страну.
//
// Использование:
//   node src/budget.js                       потолки тайла и блока по всей базе
//   node src/budget.js --roads out/cyp/roads.json
//                                            сколько тайлов нужно этим дорогам
//   node src/budget.js --donors 6            группы тайлов-доноров под сетку
//   node src/budget.js --free 32.2,34.5,34.7,35.8
//                                            свободны ли ячейки общего растра
//
// Зачем. Число тайлов в базе менять нельзя, пока общий индекс .xah кладётся
// заводским: `XAC-STRUKTUR`, `NACHBARN`, `FE GRUPPEN`, `L3 GRUPPEN`,
// `L4 LOAD TABLE` и счётчики `XACDB HEADER` завязаны друг на друга. Значит
// содержимое новой страны селится в чужие слоты, и надо знать два числа:
// сколько слотов ей нужно и какие слоты не жалко.
//
// Потолки берутся из самих данных, а не из полей формата: завод ни разу их не
// превысил, и это единственное, что мы про них знаем.
//
// Связи NACHBARN правятся на месте, длина записи не меняется — значит тайлу
// нельзя добавить соседа сверх тех, что у него уже есть. Поэтому группа доноров
// годится, только если её набор степеней перекрывает степени нужной сетки.

const fs = require('fs');
const path = require('path');
const fldb = require('./fldb');
const xac = require('./xac');
const vec = require('./xacvec');
const st = require('./struktur');
const ras = require('./rasidx');
const dataset = require('./dataset');

const KM_PER_DEG = 111.32;

// --- потолки по всей базе ---------------------------------------------------

// Обход всех тайлов уровня 1 во всех контейнерах XAC.
// fn(code, buf) на каждый файл <П>_<код>_1.xac.
function eachTile(root, fn) {
  const pkgdb = path.join(root || dataset.resolveRoot(), 'pkgdb');
  for (const d of fs.readdirSync(pkgdb).filter(x => /^XAC/.test(x))) {
    for (const f of fs.readdirSync(path.join(pkgdb, d))) {
      if (!f.toLowerCase().endsWith('.db')) continue;
      const db = fldb.open(path.join(pkgdb, d, f));
      for (const e of fldb.entries(db)) {
        const m = /_([A-Z0-9]{4})_1\.xac$/.exec(e.name);
        if (m) fn(m[1], fldb.read(db, e), e);
      }
    }
  }
}

// Сводка по одному тайлу: сколько в нём блоков, узлов, векторов и километров.
// Километры считаются по рёбрам между узлами — это и есть та длина дорожной
// сети, которую завод уложил в тайл.
function tileStats(buf, withKm) {
  const out = { blocks: 0, nodes: 0, vecs: 0, maxBlock: 0, maxNodes: 0, km: 0, edges: 0 };
  for (const b of xac.vectorBlocks(buf)) {
    if (b.version !== 5) continue;
    const s = buf.subarray(b.offset, b.offset + b.size);
    out.blocks++;
    out.vecs += s.readUInt16BE(0x30);
    const n = s.readUInt16BE(0x32);
    out.nodes += n;
    if (b.size > out.maxBlock) out.maxBlock = b.size;
    if (n > out.maxNodes) out.maxNodes = n;
    if (!withKm) continue;
    for (const g of vec.blockEdges(s)) {
      const dy = xac.toLat(g.a.y - g.b.y) * KM_PER_DEG;
      const dx = xac.toLon(g.a.x - g.b.x) * KM_PER_DEG * Math.cos(xac.toLat(g.a.y) * Math.PI / 180);
      out.km += Math.hypot(dx, dy);
      out.edges++;
    }
  }
  return out;
}

const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];

function budget(root, withKm) {
  const rows = [];
  eachTile(root, (code, buf, e) => rows.push(Object.assign({ code, size: e.size }, tileStats(buf, withKm))));
  const col = k => rows.map(r => r[k]).sort((a, b) => a - b);
  const line = k => { const a = col(k); return { med: pct(a, 0.5), p90: pct(a, 0.9), max: a[a.length - 1] }; };
  return { rows, tiles: rows.length, nodes: line('nodes'), blocks: line('blocks'),
    maxBlock: line('maxBlock'), maxNodes: line('maxNodes'), size: line('size'),
    km: withKm ? line('km') : null };
}

// --- сколько тайлов нужно дорожной сети -------------------------------------

// Ответ Overpass (`out geom`) -> длина сети и число узлов после прореживания.
// Завод ставит узел примерно раз в 55…71 м; каждая точка OSM в узел не пойдёт,
// иначе тайл распухнет вдвое против заводского.
function roadStats(file, steps = [40, 71, 100]) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ways = (j.elements || []).filter(w => Array.isArray(w.geometry));
  let km = 0, pts = 0;
  const thin = steps.map(() => 0);
  const bbox = [180, 90, -180, -90];
  for (const w of ways) {
    const g = w.geometry;
    pts += g.length;
    const acc = steps.map(() => 0), cnt = steps.map(() => 1);
    for (let i = 1; i < g.length; i++) {
      const dy = (g[i].lat - g[i - 1].lat) * KM_PER_DEG;
      const dx = (g[i].lon - g[i - 1].lon) * KM_PER_DEG * Math.cos(g[i].lat * Math.PI / 180);
      const d = Math.hypot(dx, dy) * 1000;
      km += d;
      steps.forEach((s, k) => { acc[k] += d; if (acc[k] >= s) { acc[k] = 0; cnt[k]++; } });
    }
    steps.forEach((s, k) => { thin[k] += cnt[k] + (acc[k] > 0 ? 1 : 0); });
    for (const p of g) {
      if (p.lon < bbox[0]) bbox[0] = p.lon;
      if (p.lat < bbox[1]) bbox[1] = p.lat;
      if (p.lon > bbox[2]) bbox[2] = p.lon;
      if (p.lat > bbox[3]) bbox[3] = p.lat;
    }
  }
  return { ways: ways.length, km: km / 1000, points: pts, bbox,
    thin: steps.map((s, k) => ({ step: s, nodes: thin[k] })) };
}

// --- доноры -----------------------------------------------------------------

// Степени вершин сетки w×h при связи «по стороне».
function gridDegrees(w, h) {
  const d = [];
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    let n = 0;
    if (x) n++; if (y) n++; if (x < w - 1) n++; if (y < h - 1) n++;
    d.push(n);
  }
  return d.sort((a, b) => b - a);
}

// Жадно наращивает связную группу от каждого тайла, минимизируя число связей,
// выходящих наружу: их придётся заворачивать внутрь группы, а это как раз то,
// что ломает симметрию графа соседей.
function donors(root, w, h) {
  const idx = st.openIndex(root);
  const order = [...st.parse(idx.buf).keys()];
  const nb = st.parseNeighbors(idx.buf);
  const lev = st.parseLevels(idx.buf);
  const deg = i => (nb[i] || []).length;
  const req = gridDegrees(w, h), K = w * h;
  const ext = set => {
    let e = 0;
    for (const i of set) for (const u of nb[i] || []) if (!set.has(u)) e++;
    return e;
  };
  const fits = set => {
    const d = [...set].map(deg).sort((a, b) => b - a);
    return req.every((r, i) => d[i] >= r);
  };
  const res = [], seen = new Set();
  for (let seed = 0; seed < order.length; seed++) {
    const set = new Set([seed]);
    while (set.size < K) {
      const cand = new Set();
      for (const i of set) for (const u of nb[i] || []) if (!set.has(u)) cand.add(u);
      if (!cand.size) break;
      let best = null, bs = Infinity;
      for (const c of cand) {
        set.add(c);
        const s = ext(set) - deg(c) * 0.01;   // при равенстве берём тайл со свободными связями
        set.delete(c);
        if (s < bs) { bs = s; best = c; }
      }
      set.add(best);
    }
    if (set.size < K || !fits(set)) continue;
    const codes = [...set].map(i => order[i]);
    const key = codes.slice().sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const s32 = v => (v >= 0x80000000 ? v - 0x100000000 : v);
    const lon = [...set].map(i => s32(lev[1].rows[i].bbox[0])).filter(v => Math.abs(v) < 1e9);
    res.push({ ext: ext(set), codes, degs: [...set].map(deg),
      lon: lon.length ? xac.toLon(Math.min(...lon)) : NaN });
  }
  return res.sort((a, b) => a.ext - b.ext);
}

// Свободны ли ячейки общего растра под новой рамкой (градусы).
function freeCells(root, box) {
  const r = ras.open(root);
  const bb = [xac.fromLon(box[0]), xac.fromLat(box[1]), xac.fromLon(box[2]), xac.fromLat(box[3])];
  let total = 0, taken = 0;
  const who = new Map();
  ras.forBBox(r, bb, (cx, cy, v) => {
    total++;
    if (v === ras.EMPTY) return;
    taken++;
    who.set(v, (who.get(v) || 0) + 1);
  });
  return { total, taken, who };
}

module.exports = { eachTile, tileStats, budget, roadStats, donors, freeCells, gridDegrees };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const opt = (name, def) => {
    const i = argv.indexOf('--' + name);
    return i < 0 ? def : (argv[i + 1] || true);
  };
  // позиционный аргумент — каталог набора; всё, что идёт за ключом, принадлежит ему
  let positional = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { if (argv[i] !== '--km') i++; continue; }
    positional = argv[i];
    break;
  }
  const root = dataset.resolveRoot(positional);

  const free = opt('free', null);
  if (free) {
    const box = String(free).split(',').map(Number);
    const f = freeCells(root, box);
    console.log('ячеек общего растра в рамке:', f.total, ' занято:', f.taken);
    if (f.taken) {
      const order = [...st.parse(st.openIndex(root).buf).keys()];
      console.log('занимают:', [...f.who].sort((a, b) => b[1] - a[1])
        .map(([v, n]) => (order[v] || '#' + v) + ':' + n).join(' '));
    } else {
      console.log('рамка свободна целиком — новую страну можно селить, не выселяя никого');
    }
    return;
  }

  const dn = opt('donors', null);
  if (dn) {
    const K = Number(dn) || 6;
    const h = K % 3 === 0 ? 3 : 2, w = Math.ceil(K / h);
    console.log('группы доноров под сетку ' + w + 'x' + h + ' (' + w * h + ' тайлов)');
    console.log('нужные степени NACHBARN:', gridDegrees(w, h).join(','));
    console.log();
    const list = donors(root, w, h).slice(0, 12);
    for (const r of list) {
      console.log('  внешних связей', String(r.ext).padStart(3),
        ' долгота', r.lon.toFixed(1).padStart(7),
        ' степени', r.degs.join(','), ':', r.codes.join(' '));
    }
    return;
  }

  const roads = opt('roads', null);
  if (roads) {
    const rs = roadStats(String(roads));
    console.log('дорожная сеть из', roads);
    console.log('  путей        :', rs.ways);
    console.log('  длина, км    :', rs.km.toFixed(0));
    console.log('  точек OSM    :', rs.points);
    console.log('  рамка        :', rs.bbox.map(v => v.toFixed(3)).join('  '));
    for (const t of rs.thin)
      console.log('  узлов при шаге ' + String(t.step).padStart(3) + ' м :', t.nodes);
    console.log();
    console.log('тайлов при потолке 111540 узлов :', Math.ceil(rs.thin[1].nodes / 111540),
      '(без прореживания ' + Math.ceil(rs.points / 111540) + ')');
    console.log('тайлов при 90 % — 88212 узлов   :', Math.ceil(rs.thin[1].nodes / 88212),
      '(без прореживания ' + Math.ceil(rs.points / 88212) + ')');
    return;
  }

  const withKm = argv.includes('--km');
  const b = budget(root, withKm);
  const fmt = (o, d = 1) => [o.med, o.p90, o.max].map(v => (d === 1 ? String(v) : v.toFixed(0))).join('  /  ');
  console.log('тайлов уровня 1 :', b.tiles, '  (медиана / 90 % / максимум)');
  console.log('узлов на тайл   :', fmt(b.nodes));
  console.log('блоков на тайл  :', fmt(b.blocks));
  console.log('узлов в блоке   :', fmt(b.maxNodes), '  — максимум по блокам тайла');
  console.log('размер блока, Б :', fmt(b.maxBlock));
  console.log('размер файла, Б :', fmt(b.size));
  if (b.km) console.log('км дорог на тайл:', fmt(b.km, 0));
}
