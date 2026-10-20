'use strict';
// Деление дорожного графа на тайлы `XAC` по сетке общего растра `.ras`.
//
// Зачем: DBM грузит уровень 1 тайла одним куском из своей памяти (≈ ≤ 23 МиБ,
// docs/firmware.md «Пулы памяти»), а у завода тайл не крупнее 2,0 МБ области
// блоков и 19 блоков. Один кипрский тайл — 4,4 МБ и 64 блока.
//
// Как устроен разрез у завода (по данным, docs/formats/xac.md «Многотайловый
// Кипр»): ребро, пересекающее границу тайлов, режется на два; точка разреза
// лежит в ОБОИХ тайлах с одной координатой, у каждой копии ровно одна запись
// (своя половина ребра), и копии связаны нульвектором — пара уровня 1 в одну и
// в другую сторону.
//
// Зона тайла — прямоугольник ячеек сетки (кд-деление по числу узлов, разрез по
// границе ячеек), поэтому `.ras` и `RASTERINFOS` получаются из неё напрямую.

const LON = 72000, LAT = 40000000 / 360;

// Прямоугольники ячеек [cx0, cy0, cx1, cy1): делим пополам по узлам, пока в
// куске больше `maxNodes`. Сторона сравнивается в метрах (ячейка 1000 единиц).
function zones(graph, grid, maxNodes) {
  const cnt = new Uint32Array(grid.nx * grid.ny);
  for (const n of graph.nodes) cnt[cellOf(grid, n.x, n.y)]++;
  const out = [];
  const go = (r) => {
    const col = (cx) => { let s = 0; for (let cy = r[1]; cy < r[3]; cy++) s += cnt[cx * grid.ny + cy]; return s; };
    const row = (cy) => { let s = 0; for (let cx = r[0]; cx < r[2]; cx++) s += cnt[cx * grid.ny + cy]; return s; };
    const byX = (r[2] - r[0]) * 1000 / LON * Math.cos(35 * Math.PI / 180) >= (r[3] - r[1]) * 1000 / LAT;
    const [lo, hi, line] = byX ? [r[0], r[2], col] : [r[1], r[3], row];
    let total = 0;
    for (let k = lo; k < hi; k++) total += line(k);
    if (total <= maxNodes || hi - lo < 2) { out.push(r); return; }
    let k = lo, s = 0;
    while (k < hi - 1 && s + line(k) <= total / 2) s += line(k++);
    if (k === lo) k++;
    go(byX ? [r[0], r[1], k, r[3]] : [r[0], r[1], r[2], k]);
    go(byX ? [k, r[1], r[2], r[3]] : [r[0], k, r[2], r[3]]);
  };
  go([0, 0, grid.nx, grid.ny]);
  return out;
}

function cellOf(grid, x, y) {
  const cx = Math.min(grid.nx - 1, Math.max(0, Math.floor((x - grid.x0) / grid.step)));
  const cy = Math.min(grid.ny - 1, Math.max(0, Math.floor((y - grid.y0) / grid.step)));
  return cx * grid.ny + cy;
}

// Граф -> графы тайлов. `where[n]` — тайл и номер исходного узла, `halves[ei]`
// — куски исходного ребра по тайлам, `tiles[t].links` — узлы разреза.
function cut(graph, grid, rects) {
  const owner = new Int32Array(grid.nx * grid.ny);
  rects.forEach((r, t) => {
    for (let cx = r[0]; cx < r[2]; cx++) for (let cy = r[1]; cy < r[3]; cy++) owner[cx * grid.ny + cy] = t;
  });
  const tileAt = (x, y) => owner[cellOf(grid, x, y)];
  const tiles = rects.map(() => ({ nodes: [], edges: [], links: [] }));
  const addNode = (t, x, y) => tiles[t].nodes.push({ x, y }) - 1;
  const where = graph.nodes.map((n) => { const t = tileAt(n.x, n.y); return { tile: t, local: addNode(t, n.x, n.y) }; });
  const used = new Set(graph.nodes.map((n) => n.x + ',' + n.y));
  const box = (t) => rects[t].map((v, i) => (i % 2 ? grid.y0 : grid.x0) + v * grid.step);

  const halves = graph.edges.map((e, ei) => {
    const push = (t, a, b) => ({ tile: t, edge: tiles[t].edges.push(Object.assign({}, e, { a, b, orig: ei })) - 1 });
    const A = where[e.a], B = where[e.b];
    const pa = graph.nodes[e.a], pb = graph.nodes[e.b];
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const list = [];
    let t = A.tile, from = A.local, s = 0;
    while (t !== B.tile) {
      const [xl, yl, xr, yr] = box(t);
      const te = Math.min(dx > 0 ? (xr - pa.x) / dx : dx < 0 ? (xl - pa.x) / dx : Infinity,
                          dy > 0 ? (yr - pa.y) / dy : dy < 0 ? (yl - pa.y) / dy : Infinity);
      const next = tileAt(pa.x + (te + 1e-7) * dx, pa.y + (te + 1e-7) * dy);
      if (!(te >= s && te <= 1) || next === t) throw new Error('разрез ребра ' + ei + ': выход ' + te);
      // точка разреза — внутри своей зоны и не совпадает ни с одним узлом
      const px = Math.round(pa.x + te * dx), py = Math.round(pa.y + te * dy);
      let m = null;
      for (let d = 0; !m; d++) {
        for (const [ox, oy] of [[0, d], [0, -d], [d, 0], [-d, 0]]) {
          const x = Math.min(xr - 1, Math.max(xl, px + ox)), y = Math.min(yr - 1, Math.max(yl, py + oy));
          if (!used.has(x + ',' + y)) { m = { x, y }; break; }
        }
      }
      used.add(m.x + ',' + m.y);
      const mi = addNode(t, m.x, m.y), mj = addNode(next, m.x, m.y);
      tiles[t].links.push({ node: mi, tile: next, twin: mj });
      tiles[next].links.push({ node: mj, tile: t, twin: mi });
      list.push(push(t, from, mi));
      t = next; from = mj; s = te;
    }
    list.push(push(t, from, B.local));
    return list;
  });

  // имена — свои у каждого тайла, номера плотные
  for (const tl of tiles) {
    const nm = new Map(), raw = new Map();
    tl.names = []; tl.rawNames = []; tl.byRaw = new Map();
    for (const e of tl.edges) {
      if (e.name >= 0) {
        if (!nm.has(e.name)) { nm.set(e.name, tl.names.length); tl.names.push(graph.names[e.name]); }
        e.name = nm.get(e.name);
      }
      if (e.raw >= 0) {
        if (!raw.has(e.raw)) {
          raw.set(e.raw, tl.rawNames.length);
          tl.byRaw.set(graph.rawNames[e.raw], tl.rawNames.length);
          tl.rawNames.push(graph.rawNames[e.raw]);
        }
        e.raw = raw.get(e.raw);
      }
    }
  }
  return { tiles, where, halves, tileAt };
}

// Запреты поворотов исходного графа -> по тайлам. Узел запрета — исходный, и
// все его рукава (ближние к нему куски рёбер) лежат в его тайле.
function bansByTile(sp, bans) {
  const out = sp.tiles.map(() => new Map());
  for (const [n, list] of bans) {
    const w = sp.where[n], tl = sp.tiles[w.tile];
    const arm = (ei) => sp.halves[ei].find((h) => h.tile === w.tile &&
      (tl.edges[h.edge].a === w.local || tl.edges[h.edge].b === w.local)).edge;
    out[w.tile].set(w.local, list.map((b) => ({ from: arm(b.from), to: arm(b.to) })));
  }
  return out;
}

// Дом -> тайл: ближайший кусок своей улицы (по сырому имени, как в
// xacroads.zenModel). Дома без улицы в сети не попадают никуда.
function housesByTile(sp, houses, latinize, segDist2) {
  const byRaw = new Map();
  sp.tiles.forEach((tl, t) => tl.edges.forEach((e) => {
    if (!(e.raw >= 0)) return;
    const k = tl.rawNames[e.raw];
    if (!byRaw.has(k)) byRaw.set(k, []);
    byRaw.get(k).push({ t, e });
  }));
  const out = sp.tiles.map(() => []);
  let lost = 0;
  for (const h of houses) {
    const cand = byRaw.get(latinize(h.street || ''));
    if (!cand) { lost++; continue; }
    const px = Math.round(h.lon * LON), py = Math.round(h.lat * LAT);
    let best = null, bd = Infinity;
    for (const c of cand) {
      const n = sp.tiles[c.t].nodes, a = n[c.e.a], b = n[c.e.b];
      const d = segDist2(px, py, a.x, a.y, b.x, b.y);
      if (d < bd) { bd = d; best = c.t; }
    }
    out[best].push(h);
  }
  return { out, lost };
}

// Соседи: прямоугольники касаются (сторона или угол).
function neighbors(rects) {
  return rects.map((r, i) => rects.flatMap((s, j) => (j !== i &&
    r[0] <= s[2] && s[0] <= r[2] && r[1] <= s[3] && s[1] <= r[3] ? [j] : [])));
}

module.exports = { zones, cut, cellOf, bansByTile, housesByTile, neighbors };
