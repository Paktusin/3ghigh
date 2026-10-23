'use strict';
// Укрупнённый уровень дорог (2…4): блоки `VEKTORBLOCK` уровня и раздел
// `LAYER 1 VERWEISE` — как у завода (docs/formats/xac.md, «Уровни 2…4»).
//
// Что известно по коду и по заводу:
//
// * Узлы уровня — узлы уровня 1 с той же координатой (`DE44`: 1219 из 1219),
//   ребро уровня — цепочка рёбер уровня 1 (медиана 4). Нульвекторы вертикальных
//   связей не несут: пара k ведёт на двойника в СОСЕДНЕМ тайле на уровне k.
// * Запись вектора уровня несёт слово длины (метры) и слово времени: флаг
//   блока 0x38 = 4, `(байт 0x39 >> 1) & 3 == 2` (`xacrec`). Длина у завода —
//   сумма длин цепочки (медиана отношения 1,00), время — не меньше суммы
//   `длина × ETA-KOSTEN` её рёбер (медиана 1,18: сверх неё, видимо, узлы).
// * `LAYER 1 VERWEISE` (`get_layer_1_tab` FUN_0827b84c, развёртка FUN_0827be2c,
//   коридор FUN_0827bd54/FUN_0827bb54 из `load_korridor` FUN_08ea7d68):
//     шапка: +0x14 0x00010000, +0x18 записей A, +0x1c 48, +0x20 записей×24,
//            +0x24 элементов B, +0x28 смещение B, +0x2c длина B;
//     запись A (24 б): u16 блок уровня относительно первого блока уровня
//            тайла, u16 2×номер записи первого вектора группы, u32 смещение
//            его списка в B, 16 байт — приращения номера (×2) следующих
//            векторов группы; группа — до 17 векторов в порядке таблицы;
//     список вектора в B: элементы с меткой 0 (5 байт) — байт 0: число
//            рёбер уровня 1 − 1 (6 бит); байты 1–2: блок уровня 1
//            относительно первого блока уровня 1 тайла; байт 3: бит 7 —
//            ребро проходится по записи (A→B), бит 6 — первый элемент
//            списка вектора, 6 бит — старшие биты номера записи; байт 4 —
//            младшие. Дальше развёртка сама идёт по узлам: на конце ребра
//            берёт ДРУГОЙ вектор узла с наименьшим уровнем (`атрибут & 7`).
//            Метки 1/2 (1 байт: +приращение, или 3 байта при 0x3f: число) —
//            блоки уровня 1 «коридора» вдоль вектора, по ним `load_korridor`
//            подгружает уровень 1 вокруг маршрута.
//   Сверка разбора на заводе (`DE44`, 1609 векторов): списков 1609, ключи
//   A совпали с векторами по порядку, развёртка по правилу «наименьший
//   уровень, при равенстве первый в списке узла» привела ровно в концы
//   вектора у 1484 (92 %; прочие — рёбра в соседних тайлах и иной порядок
//   узла при равенстве). Поэтому мы новый элемент ставим всякий раз, когда
//   правило неоднозначно или ведёт не туда — так развёртка не зависит от
//   порядка рукавов.

const xw = require('./xacwrite');
const xv = require('./xacvec');
const xg = require('./xacgraph');
const xr = require('./xacrec');
const xac = require('./xac');
const roads = require('./xacroads');

const LON = 72000, LAT = 40000000 / 360;
const MODE = 4;                 // поле 0x38 блока уровня 2…4 у завода
const GROUP = 17;               // векторов на запись A: первый + 16 приращений
const CORRIDOR = 1000;          // блоки уровня 1 ближе этого (единицы карты) — в коридор (догадка)

const metres = (a, b) => Math.hypot((a.x - b.x) / LON * (40000000 / 360) * Math.cos(a.y / LAT * Math.PI / 180), b.y - a.y);

// ETA-KOSTEN из `.xah`: 8×8×8 u32 со смещения +0x28 раздела (поле +0x18 шапки
// раздела — 40), индекс [категория][уровень][класс]; сверено с временем
// записей уровня 2 у завода (214 м × 78 = 16 692 против 16 688).
function etaTable(xahBuf) {
  const s = xac.sections(xahBuf).list.find((x) => x.name === 'ETA-KOSTEN');
  const d = xahBuf.subarray(s.offset, s.offset + s.total), at = d.readUInt32BE(0x18);
  return (cat, lev, cls) => d.readUInt32BE(at + ((cat * 8 + lev) * 8 + cls) * 4);
}

// Уровень 1 тайла по байтам: вектор (VID) -> концы и уровень, узел -> рукава
// в порядке списка. Ровно то, что видит развёртка прошивки.
function l1Index(blocks, attr) {
  const V = new Map(), arms = new Map(), byEnds = new Map(), blockOf = new Map(), boxes = [];
  const K = (c) => c.x + ',' + c.y;
  const byId = new Map(blocks.map((s) => [s.readUInt16BE(0x34), s]));
  const ec = new Map(); const C = (s) => { if (!ec.has(s)) ec.set(s, xg.entryCoords(s)); return ec.get(s); };
  const base = blocks.length ? blocks[0].readUInt16BE(0x36) : 0;
  for (const s of blocks) {
    if (s.readUInt16BE(0x14) < 5 || s.readUInt16BE(0x72) !== 1) continue;   // v3/v4 — без таблицы
    const id = s.readUInt16BE(0x34), tb = s.readUInt16BE(0x36), ox = s.readInt32BE(0x28), oy = s.readInt32BE(0x2c);
    boxes.push({ rel: id - base, box: [0x18, 0x1c, 0x20, 0x24].map((o) => s.readInt32BE(o)) });
    for (const [off, list] of xg.nodeLists(s)) {
      const c = xv.koord(s, off, ox, oy), k = K(c), A = arms.get(k) || [];
      blockOf.set(k, id - base);
      for (const el of list) {
        const w = s.readUInt16BE(el.at);
        if (el.tag === 3 && el.entry >= 0) {
          const vid = ((id - base) << 16) | (el.entry * 2);
          const t = (s[el.at + 2] >> 6) & 1 ? byId.get(tb + (s.readUInt16BE(el.at + 4) & 0x7fff)) : s;
          const z = t && C(t).coords[w & 0x3fff];
          const r = xr.record(s, el.at, attr, () => {});
          if (!z || !r) continue;
          V.set(vid, { a: k, b: K(z), level: r.level });
          byEnds.set(k + '|' + K(z), vid);
          A.push({ vid, fwd: 1 });
        } else if (el.tag === 1) A.push({ vid: ((id - base) << 16) | ((w & 0x3fff) * 2), fwd: 0 });
        else if (el.tag === 2) A.push({ vid: ((tb + (s.readUInt16BE(el.at + 2) & 0x7fff) - base) << 16) | ((w & 0x3fff) * 2), fwd: 0 });
      }
      arms.set(k, A);
    }
  }
  return { V, arms, byEnds, blockOf, boxes };
}

// Следующее ребро развёртки (FUN_0827be2c): на конце текущего — другой вектор
// узла с наименьшим уровнем. `null`, если выбор неоднозначен.
function nextArm(ix, vid, fwd) {
  const v = ix.V.get(vid), to = fwd ? v.b : v.a;
  let best = null, tie = false;
  for (const x of ix.arms.get(to) || []) {
    if (x.vid === vid || !ix.V.has(x.vid)) continue;
    const l = ix.V.get(x.vid).level;
    if (!best || l < best.l) { best = { vid: x.vid, fwd: x.fwd, l }; tie = false; }
    else if (l === best.l) tie = true;
  }
  return best && !tie ? best : null;
}

// Сеть уровня из графа тайла: рёбра по `sel`, цепочки между узлами уровня.
// Узел уровня — там, где степень в отобранной сети не 2, узел разреза тайла,
// смена уровня дороги или направления. Длинная цепочка делится Дугласом —
// Пекером (`tol`) и по числу рёбер (`maxHops`).
function chains(tl, sel, opt) {
  const o = opt || {};
  const tol = o.tol || 100, maxHops = o.maxHops || 24;
  const inc = new Map();
  tl.edges.forEach((e, ei) => {
    if (!sel(e)) return;
    for (const n of [e.a, e.b]) { if (!inc.has(n)) inc.set(n, []); inc.get(n).push(ei); }
  });
  const cut = new Set((tl.links || []).map((l) => l.node));
  const ow = (e, from) => (!e.ow ? 0 : e.a === from ? 1 : 2);    // 1 — по ходу, 2 — против
  const brk = (n) => {
    const l = inc.get(n);
    if (!l || l.length !== 2 || cut.has(n)) return true;
    const [e1, e2] = l.map((i) => tl.edges[i]);
    if (e1.frc !== e2.frc || !!e1.cat !== !!e2.cat || e1.cat !== e2.cat) return true;
    const p = e1.a === n ? e1.b : e1.a;                       // e1: p -> n, e2: n -> q
    return ow(e1, p) !== ow(e2, n);
  };
  const done = new Uint8Array(tl.edges.length);
  const out = [];
  const walk = (start, ei) => {
    const path = [start], es = [];
    let n = start, e = ei;
    for (;;) {
      done[e] = 1; es.push(e);
      const E = tl.edges[e]; n = E.a === n ? E.b : E.a; path.push(n);
      if (brk(n) || n === start) break;
      const nx = inc.get(n).find((i) => i !== e);
      if (done[nx]) break;
      e = nx;
    }
    return { path, es };
  };
  for (const [n] of inc) {
    if (!brk(n)) continue;
    for (const ei of inc.get(n)) if (!done[ei]) out.push(walk(n, ei));
  }
  for (const [n, l] of inc) for (const ei of l) if (!done[ei]) out.push(walk(n, ei));   // кольца
  // деление цепочек: Дуглас — Пекер по узлам и потолок рёбер
  const pieces = [];
  for (const c of out) {
    const pt = c.path.map((i) => tl.nodes[i]);
    const keep = new Set([0, pt.length - 1]);
    const dp = (i, j) => {
      if (j - i < 2) return;
      let m = -1, md = tol;
      for (let k = i + 1; k < j; k++) {
        const a = pt[i], b = pt[j], q = pt[k];
        const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const d = Math.abs((b.x - a.x) * (a.y - q.y) - (a.x - q.x) * (b.y - a.y)) / L;
        if (d > md) { md = d; m = k; }
      }
      if (m >= 0) { keep.add(m); dp(i, m); dp(m, j); }
    };
    dp(0, pt.length - 1);
    const ks = [...keep].sort((a, b) => a - b);
    for (let k = 0; k + 1 < ks.length; k++) {
      for (let i = ks[k]; i < ks[k + 1]; i += maxHops) {
        const j = Math.min(i + maxHops, ks[k + 1]);
        pieces.push({ path: c.path.slice(i, j + 1), es: c.es.slice(i, j) });
      }
    }
  }
  return pieces;
}

// Уровень сети каждого ребра исходного графа: 4 — дорога уровня 0…1, 3 —
// 0…2, 2 — 0…3, иначе 1 (`SEL`, снято с завода по 18 тайлам). Сеть уровня k
// у нас распадается (Кипр: дороги 0…1 — 8 кусков, 3833 и 2007 узлов — юг и
// север), а у завода на уровни поднимаются и дороги младше порога (уровень 4
// несёт 7 % рёбер уровня 2, уровень 2 — 7 % рёбер уровня 4: `covmulti.js`) —
// по-видимому, связки. Делаем так же: сеть уровня k доводится до сильной
// связности с учётом одностороннего движения — от каждого куска и к нему
// ищется дешевейший путь по всей сети (цена — длина × (1 + уровень дороги)),
// рёбра пути поднимаются на уровень k; недостижимый кусок с уровня снимается. Правило отбора связок у завода не
// восстановлено — это **модель**.
const SEL = { 4: 1, 3: 2, 2: 3 };

function netLevels(graph) {
  const N = graph.nodes.length, E = graph.edges;
  for (const e of E) e.net = e.frc <= SEL[4] ? 4 : e.frc <= SEL[3] ? 3 : e.frc <= SEL[2] ? 2 : 1;
  // ориентированный граф: a→b всегда, b→a — если движение двустороннее
  const out = Array.from({ length: N }, () => []), inc = Array.from({ length: N }, () => []);
  E.forEach((e, i) => {
    out[e.a].push(i); inc[e.b].push(i);
    if (!e.ow) { out[e.b].push(i); inc[e.a].push(i); }
  });
  const other = (e, u) => (e.a === u ? e.b : e.a);
  const len = (e) => Math.hypot((graph.nodes[e.a].x - graph.nodes[e.b].x) * 0.75, graph.nodes[e.a].y - graph.nodes[e.b].y);
  // сильно связные куски сети уровня k (Косараю, без рекурсии)
  const scc = (k) => {
    const inNet = new Uint8Array(N);
    for (const e of E) if (e.net >= k) inNet[e.a] = inNet[e.b] = 1;
    const seen = new Uint8Array(N), order = [];
    for (let s0 = 0; s0 < N; s0++) {
      if (!inNet[s0] || seen[s0]) continue;
      const st = [[s0, 0]]; seen[s0] = 1;
      while (st.length) {
        const top = st[st.length - 1], u = top[0];
        const list = out[u];
        let pushed = false;
        while (top[1] < list.length) {
          const e = E[list[top[1]++]];
          if (e.net < k) continue;
          const v = other(e, u);
          if (!seen[v]) { seen[v] = 1; st.push([v, 0]); pushed = true; break; }
        }
        if (!pushed && st[st.length - 1] === top) { order.push(u); st.pop(); }
      }
    }
    const comp = new Int32Array(N).fill(-1);
    let c = 0;
    for (let i = order.length - 1; i >= 0; i--) {
      const s0 = order[i];
      if (comp[s0] >= 0) continue;
      const st = [s0]; comp[s0] = c;
      while (st.length) {
        const u = st.pop();
        for (const ei of inc[u]) { const e = E[ei]; if (e.net < k) continue; const v = other(e, u); if (comp[v] < 0) { comp[v] = c; st.push(v); } }
      }
      c++;
    }
    return { comp, count: c, inNet };
  };
  // дешевейший путь по всей сети от куска до любого другого куска сети
  const link = (k, S, small, dirOut) => {
    const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), h = [];
    const push = (d, n) => { h.push([d, n]); let i = h.length - 1; while (i) { const q = (i - 1) >> 1; if (h[q][0] <= h[i][0]) break; [h[q], h[i]] = [h[i], h[q]]; i = q; } };
    const pop = () => { const t = h[0], l = h.pop(); if (h.length) { h[0] = l; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < h.length && h[a][0] < h[m][0]) m = a; if (b < h.length && h[b][0] < h[m][0]) m = b; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } } return t; };
    for (let n = 0; n < N; n++) if (S.comp[n] === small) { dist[n] = 0; push(0, n); }
    while (h.length) {
      const [d, u] = pop();
      if (d > dist[u]) continue;
      if (S.inNet[u] && S.comp[u] !== small && S.comp[u] >= 0) {
        let n = 0;
        for (let v = u; prev[v] >= 0;) { const e = E[prev[v]]; if (e.net < k) { e.net = k; n++; } v = other(e, v); }
        return n;
      }
      for (const ei of (dirOut ? out : inc)[u]) {
        const e = E[ei], v = other(e, u), nd = d + len(e) * (1 + e.frc);
        if (nd < dist[v]) { dist[v] = nd; prev[v] = ei; push(nd, v); }
      }
    }
    return -1;
  };
  const added = {};
  for (const k of [4, 3, 2]) {
    added[k] = 0;
    // до пяти проходов: куски от 5 узлов связываются с остальной сетью, мелочь
    // (обрывки односторонних дорог) с уровня снимается; что осталось
    // несвязным после проходов — тоже снимается
    for (let round = 0; round < 6; round++) {
      const S = scc(k);
      if (S.count <= 1) break;
      const size = new Int32Array(S.count);
      for (let n = 0; n < N; n++) if (S.comp[n] >= 0) size[S.comp[n]]++;
      let big = 0; for (let c = 1; c < S.count; c++) if (size[c] > size[big]) big = c;
      const drop = new Uint8Array(S.count);
      for (let c = 0; c < S.count; c++) {
        if (c === big) continue;
        if (round === 5 || size[c] < 5) { drop[c] = 1; continue; }
        const x = link(k, S, c, true), y = link(k, S, c, false);
        if (x < 0 || y < 0) drop[c] = 1; else added[k] += x + y;
      }
      for (const e of E) if (e.net >= k && (drop[S.comp[e.a]] && S.comp[e.a] >= 0 || drop[S.comp[e.b]] && S.comp[e.b] >= 0)) e.net = k - 1;
    }
  }
  return added;
}

// Индекс ATTRIBUTE уровня: простая семья, диапазон ниже первого индекса
// категории 4 (у завода `_2.xac` — 0…352), категория 2 (152 из 160 индексов,
// что завод ставит на уровне 2), автомагистраль — 0, съезд — 5, если есть;
// точный класс скорости, среди равных — меньший индекс.
function levelPicker(attr) {
  const CAT = (v) => (v >>> 10) & 7;
  let top = Infinity;
  for (let i = 0; i < attr.length; i++) if (attr[i] && CAT(attr[i] >>> 0) === 4 && i < top) top = i;
  const list = xw.simpleAttributes(attr).filter((i) => i < top && attr[i]);
  const cache = new Map();
  return (frc, dir, cls, want) => {
    const key = frc + ':' + dir + ':' + cls + ':' + want;
    if (cache.has(key)) return cache.get(key);
    let best = null;
    for (const i of list) {
      const v = attr[i] >>> 0;
      if ((v & 7) !== frc || ((v >>> 3) & 3) !== dir) continue;
      const c = (v >>> 5) & 7;
      const sc = 1000 * Math.abs(c - cls) - (c > cls ? 1 : 0) + (CAT(v) === want ? 0 : CAT(v) === 2 ? 50 : 100);
      if (!best || sc < best.sc) best = { i, sc };
    }
    const r = best ? best.i : null;
    cache.set(key, r);
    return r;
  };
}

// Модель уровня тайла: узлы и векторы с цепочками уровня 1 (VID — блок
// относительно первого блока уровня 1 тайла). `l1` — собранные блоки уровня 1.
function model(tl, l1, opt) {
  const o = opt || {};
  const ix = l1Index(l1, o.attr);
  const eta = o.eta, pick = o.pick;
  const sel = o.sel || ((e) => (e.net === undefined ? e.frc <= 3 : e.net >= 2));
  const pcs = chains(tl, sel, o);
  const nodeId = new Map(), nodes = [];
  const nodeOf = (i) => {
    if (!nodeId.has(i)) { nodeId.set(i, nodes.length); nodes.push({ x: tl.nodes[i].x, y: tl.nodes[i].y, src: i }); }
    return nodeId.get(i);
  };
  const K = (n) => tl.nodes[n].x + ',' + tl.nodes[n].y;
  const vecs = [];
  let lost = 0;
  for (const pc of pcs) {
    // направление: односторонняя цепочка пишется по ходу движения
    let path = pc.path, es = pc.es;
    const e0 = tl.edges[es[0]];
    let dir = 0;
    if (e0.ow) {
      dir = 1;
      if (e0.a !== path[0]) { path = path.slice().reverse(); es = es.slice().reverse(); }
    }
    // рёбра уровня 1 по байтам
    const steps = [];
    let ok = true;
    for (let k = 0; k < es.length; k++) {
      const u = K(path[k]), w = K(path[k + 1]);
      let vid = ix.byEnds.get(u + '|' + w), fwd = 1;
      if (vid === undefined) { vid = ix.byEnds.get(w + '|' + u); fwd = 0; }
      if (vid === undefined) { ok = false; break; }
      steps.push({ vid, fwd });
    }
    if (!ok) { lost++; continue; }
    // элементы списка: новый, когда развёртка пошла бы не туда
    const els = [];
    for (let k = 0; k < steps.length;) {
      const el = { vid: steps[k].vid, fwd: steps[k].fwd, n: 1 };
      let cur = steps[k];
      while (k + el.n < steps.length && el.n < 64) {
        const nx = nextArm(ix, cur.vid, cur.fwd), want = steps[k + el.n];
        if (!nx || nx.vid !== want.vid || nx.fwd !== want.fwd) break;
        cur = want; el.n++;
      }
      els.push(el);
      k += el.n;
    }
    // длина, время, класс (по длине преобладающий)
    let len = 0, time = 0;
    const byCls = new Array(8).fill(0);
    es.forEach((ei, k) => {
      const e = tl.edges[ei], m = metres(tl.nodes[path[k]], tl.nodes[path[k + 1]]);
      const cls = e.kmh === undefined ? 5 : roads.speedClass(e.kmh);
      const cat = e.cat === undefined ? 4 : e.cat;
      len += m; time += m * eta(cat, e.frc, cls); byCls[cls] += m;
    });
    const cls = byCls.indexOf(Math.max(...byCls));
    const want = e0.cat === undefined ? 2 : e0.cat;
    const idx = pick(e0.frc, dir, cls, want);
    if (idx === null) { lost++; continue; }
    // коридор: блоки уровня 1 рядом с узлами цепочки, кроме блоков самих рёбер
    const own = new Set(els.map((x) => x.vid >>> 16));
    const pts = path.map((n) => tl.nodes[n]);
    const corridor = ix.boxes.filter((b) => !own.has(b.rel) && pts.some((p) =>
      p.x >= b.box[0] - CORRIDOR && p.x <= b.box[2] + CORRIDOR && p.y >= b.box[1] - CORRIDOR && p.y <= b.box[3] + CORRIDOR))
      .map((b) => b.rel).sort((a, b) => a - b);
    vecs.push({ a: nodeOf(path[0]), b: nodeOf(path[path.length - 1]), idx, dir, len, time, els, corridor,
                hops: es.length, frc: e0.frc });
  }
  return { nodes, vecs, lost, ix };
}

// Раскладка: узлы кусками kd-деления (под-блоки), вектор — у начала,
// встречная — у конца. Один блок на тайл (у завода уровень 2 тайла — 1 блок
// у 361 из 361 читаемых, `_2.xac`); не влезло — ошибка.
function layout(m) {
  const order = roads.splitNodes(m.nodes, m.nodes.map((_, i) => i), 48);
  const pos = new Int32Array(m.nodes.length), sub = new Int32Array(m.nodes.length);
  const list = [];
  order.forEach((leaf, li) => leaf.forEach((n) => { pos[n] = list.length; sub[n] = li; list.push(n); }));
  const recs = list.map(() => ({ vecs: [], backs: [] }));
  for (const v of m.vecs) {
    const a = pos[v.a], b = pos[v.b];
    const at = recs[a].vecs.length;
    recs[a].vecs.push(v);
    recs[b].backs.push({ from: a, at });
  }
  const first = []; let id = 1;
  for (let i = 0; i < list.length; i++) { first[i] = id; id += Math.max(1, recs[i].vecs.length); }
  if (id > 16000) throw new Error('уровень: записей ' + id + ' — не влезает в один блок');
  return { list, pos, sub, recs, first, count: id };
}

// Байты блока уровня. `links(n)` — нульвектор узла (номер узла модели).
function buildBlock(m, lay, spec) {
  const nodes = lay.list.map((n, i) => ({
    x: m.nodes[n].x, y: m.nodes[n].y, sub: lay.sub[n],
    links: spec.links ? spec.links(n) : undefined,
    vectors: lay.recs[i].vecs.map((v) => ({ to: lay.pos[v.b], idx: v.idx, len: [v.len, v.time] })),
    backs: lay.recs[i].backs,
  }));
  return xw.buildBlock({ nodes, id: spec.id, tileBase: spec.id, country: spec.country, mode: MODE,
                         tile: spec.tile, tz: spec.tz, dst: spec.dst, flags: 0x95 });
}

// ── Уровни 3 и 4: блок v3 ──────────────────────────────────────────────────
//
// У завода блок уровня 3/4 тайла — один v3 (`DE44`: L3 6080 б, L4 3048 б;
// 3369 и 2429 тайлов, у всех один блок, до 41 528 б), шапка 0x4c, один
// заголовок под-блока (`0xc000 | узлов`, 0, рамка), узел — координата,
// записи, встречные, нульвектор, слово-самоиндекс (`src/xacv3.js`). Запись
// уровня — 8 байт: слово цели (смещение узла / 2), слово атрибута с битом 15,
// длина с битом 15, время. Номер вектора (VID) у v3 — смещение записи в блоке:
// ключи записей A `LAYER 1 VERWEISE` уровня 3 у `DE44` — 305 смещений записей
// из 305 (уровень 4 — 138 из 138). Поле 0x38: уровень 3 — 6, уровень 4 — 0
// (у обоих `(байт 0x39 >> 1) & 3 ≠ 1`: слова длины в записи).
const V3_HDR = 0x4c, V3_SUB = 20;

function layoutV3(m) {
  const list = m.nodes.map((_, i) => i).sort((a, b) => m.nodes[a].x - m.nodes[b].x || m.nodes[a].y - m.nodes[b].y);
  const pos = new Int32Array(m.nodes.length);
  list.forEach((n, i) => { pos[n] = i; });
  const recs = list.map(() => ({ vecs: [], backs: [] }));
  for (const v of m.vecs) { recs[pos[v.a]].vecs.push(v); recs[pos[v.b]].backs.push(v); }
  return { list, pos, recs, v3: true };
}

// Смещения узлов и записей: нужны раньше байт — их берут нульвекторы соседних
// тайлов и ключи LAYER 1 VERWEISE. `nullLen(i)` — длина нульвектора узла i.
function placeV3(m, lay, nullLen) {
  const v3 = require('./xacv3');
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const n of m.nodes) { xmin = Math.min(xmin, n.x); xmax = Math.max(xmax, n.x); ymin = Math.min(ymin, n.y); ymax = Math.max(ymax, n.y); }
  lay.box = [xmin, ymin, xmax, ymax];
  lay.origin = [xmax + 1, Math.floor((ymin + ymax) / 2)];      // dx < 0: слово координаты без бита 14
  lay.form = m.nodes.map((n) => v3.coordForm(n.x, n.y, lay.origin[0], lay.origin[1]));
  const at = new Array(lay.list.length), recAt = new Map();
  let p = V3_HDR + V3_SUB;
  lay.list.forEach((n, i) => {
    at[i] = p;
    p += lay.form[n];
    lay.recs[i].vecs.forEach((v) => { recAt.set(v, p); p += 8; });
    p += lay.recs[i].backs.length * 2 + nullLen(i) + 2;
  });
  if (p > 0x7ffe) throw new Error('уровень v3: блок ' + p + ' б — смещение не влезает в слово');
  lay.at = at; lay.recAt = recAt; lay.size = p;
  lay.order = [];
  lay.list.forEach((n, i) => lay.recs[i].vecs.forEach((v) => lay.order.push({ v, ref: recAt.get(v) })));
  return lay;
}

function buildV3(m, lay, spec) {
  const v3 = require('./xacv3');
  const [xmin, ymin, xmax, ymax] = lay.box, [ox, oy] = lay.origin;
  // длина раздела кратна 4 (иначе FATAL при установке, docs «длины разделов
  // должны быть кратны 4»); два нулевых байта за последним узлом обходчик не читает
  const s = Buffer.alloc(Math.ceil(lay.size / 4) * 4);
  s.write('VEKTORBLOCK     ', 0, 16, 'latin1');
  s.writeUInt32BE(s.length - 20, 0x10);
  s.writeUInt16BE(3, 0x14);
  s.writeUInt16BE(xw.scaleAt(ymin, ymax), 0x16);
  s.writeInt32BE(xmin, 0x18); s.writeInt32BE(ymin, 0x1c); s.writeInt32BE(xmax, 0x20); s.writeInt32BE(ymax, 0x24);
  s.writeInt32BE(ox, 0x28); s.writeInt32BE(oy, 0x2c);
  s.writeUInt16BE(m.vecs.length, 0x30);
  s.writeUInt16BE(m.nodes.length, 0x32);
  s.writeUInt16BE(spec.id, 0x34); s.writeUInt16BE(spec.id, 0x36);
  s.writeUInt16BE(spec.mode, 0x38);
  s.writeUInt16BE(spec.country || 0, 0x3a);
  s.writeUInt16BE(0x95, 0x3c);
  s.writeUInt16BE(spec.tile || 0, 0x3e);
  s.writeUInt16BE(V3_HDR, 0x40);
  s.writeUInt32BE(spec.tz || 0, 0x44); s.writeUInt32BE(spec.dst || 0, 0x48);
  s.writeUInt16BE(0xc000 | (m.nodes.length & 0x3fff), V3_HDR);
  [xmin, ymin, xmax, ymax].forEach((v, k) => s.writeInt32BE(v, V3_HDR + 4 + k * 4));
  lay.list.forEach((n, i) => {
    const c = m.nodes[n];
    let q = lay.at[i];
    const form = lay.form[n];
    const cb = v3.encodeCoord(c.x, c.y, ox, oy, form, Buffer.alloc(8));
    if (!cb) throw new Error('уровень v3: координата узла ' + n + ' не влезает');
    cb.copy(s, q); q += form;
    for (const v of lay.recs[i].vecs) {
      s.writeUInt16BE(0xc000 | (lay.at[lay.pos[v.b]] / 2), q);
      s.writeUInt16BE(0x8000 | (v.idx & 0x07ff), q + 2);
      s.writeUInt16BE(0x8000 | xw.lengthWord(v.len), q + 4);
      s.writeUInt16BE(xw.lengthWord(v.time), q + 6);
      q += 8;
    }
    for (const v of lay.recs[i].backs) { s.writeUInt16BE(0x4000 | (lay.recAt.get(v) / 2), q); q += 2; }
    const links = spec.links && spec.links(n);
    if (links && links.length) { const nb = xw.encodeNull(links); nb.copy(s, q); q += nb.length; }
    s.writeUInt16BE(lay.at[i] / 2, q);               // самоиндекс
  });
  return s;
}

// Раздел LAYER 1 VERWEISE. Векторы — в порядке номеров таблицы (v5) или
// смещений записей (v3, `lay.order`).
function verweise(m, lay) {
  const order = lay.order || [];
  if (!lay.order) lay.list.forEach((n, i) => lay.recs[i].vecs.forEach((v, k) => order.push({ v, ref: 2 * (lay.first[i] + k) })));
  const B = [];
  let count = 0;
  const offs = order.map(({ v }) => {
    const at = B.length;
    v.els.forEach((e, k) => {
      const ent = (e.vid & 0xffff) >> 1;
      B.push(e.n - 1, (e.vid >>> 24) & 0xff, (e.vid >>> 16) & 0xff,
             (e.fwd ? 0x80 : 0) | (k === 0 ? 0x40 : 0) | ((ent >> 8) & 0x3f), ent & 0xff);
      count++;
    });
    let prev = 0;
    for (const b of v.corridor) {
      const d = b - prev;
      if (d >= 0 && d < 0x3f) B.push(0x80 | d); else B.push(0xbf, (b >> 8) & 0xff, b & 0xff);
      prev = b; count++;
    }
    return at;
  });
  const A = [];
  for (let k = 0; k < order.length;) {
    const r = Buffer.alloc(24);
    r.writeUInt16BE(0, 0);                       // блок уровня относительно первого — у нас один
    r.writeUInt16BE(order[k].ref, 2);
    r.writeUInt32BE(offs[k], 4);
    let j = 1;
    while (j < GROUP && k + j < order.length) {
      const d = order[k + j].ref - order[k + j - 1].ref;
      if (d <= 0 || d > 0xff) break;
      r[8 + j - 1] = d; j++;
    }
    A.push(r); k += j;
  }
  const bBuf = Buffer.from(B);
  const head = Buffer.alloc(48);
  head.write('LAYER 1 VERWEISE', 0, 16, 'latin1');
  head.writeUInt32BE(0x00010000, 0x14);
  head.writeUInt32BE(A.length, 0x18);
  head.writeUInt32BE(48, 0x1c);
  head.writeUInt32BE(A.length * 24, 0x20);
  head.writeUInt32BE(count, 0x24);
  head.writeUInt32BE(48 + A.length * 24, 0x28);
  head.writeUInt32BE(bBuf.length, 0x2c);
  let out = Buffer.concat([head].concat(A).concat([bBuf]));
  if (out.length % 4) out = Buffer.concat([out, Buffer.alloc(4 - (out.length % 4))]);
  out.writeUInt32BE(out.length - 20, 0x10);
  return { section: out, count, groups: A.length };
}

// Чтение LAYER 1 VERWEISE обратно (для сверки и эмулятора): по векторам в
// порядке записей A — список элементов с меткой 0 и коридор.
function readVerweise(d) {
  const nA = d.readUInt32BE(0x18), oA = d.readUInt32BE(0x1c), oB = d.readUInt32BE(0x28), lB = d.readUInt32BE(0x2c);
  const keys = [];
  for (let k = 0; k < nA; k++) {
    const o = oA + k * 24, blk = d.readUInt16BE(o);
    let ref = d.readUInt16BE(o + 2);
    keys.push({ blk, ref });
    for (let j = 0; j < 16; j++) { const dl = d[o + 8 + j]; if (!dl) break; ref += dl; keys.push({ blk, ref }); }
  }
  const B = d.subarray(oB, oB + lB), lists = [];
  let p = 0, cur = null, prev = 0, last = -1;
  while (p < B.length) {
    const t = B[p] >> 6;
    if (t === 0) {
      const e = { n: (B[p] & 0x3f) + 1, blk: B.readUInt16BE(p + 1), fwd: B[p + 3] >> 7, start: (B[p + 3] >> 6) & 1,
                  ent: ((B[p + 3] & 0x3f) << 8) | B[p + 4] };
      if (e.start) { cur = { els: [], corridor: [] }; lists.push(cur); }
      if (!cur) return null;
      cur.els.push(e); p += 5; last = 0;
    } else {
      if (t !== last) prev = 0;
      last = t;
      const big = (B[p] & 0x3f) === 0x3f;
      prev = big ? B.readUInt16BE(p + 1) : prev + (B[p] & 0x3f);
      if (cur) cur.corridor.push({ tag: t, blk: prev });
      p += big ? 3 : 1;
    }
  }
  return { keys, lists };
}

// Развернуть элемент по правилу прошивки: VID'ы уровня 1 по порядку.
function expand(ix, e) {
  const out = [];
  let vid = (e.blk << 16) | (e.ent * 2), fwd = e.fwd;
  for (let k = 0; k < e.n; k++) {
    if (!ix.V.has(vid)) return null;
    out.push({ vid, fwd });
    if (k === e.n - 1) break;
    const v = ix.V.get(vid), to = fwd ? v.b : v.a;
    let best = null;
    for (const x of ix.arms.get(to) || []) {
      if (x.vid === vid || !ix.V.has(x.vid)) continue;
      if (!best || ix.V.get(x.vid).level < ix.V.get(best.vid).level) best = x;
    }
    if (!best) return null;
    vid = best.vid; fwd = best.fwd;
  }
  return out;
}

module.exports = { etaTable, l1Index, chains, levelPicker, model, layout, buildBlock, verweise, netLevels, SEL,
                   layoutV3, placeV3, buildV3,
                   readVerweise, expand, nextArm, MODE };
