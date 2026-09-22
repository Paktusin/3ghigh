// Деление кипрских точек на листья и своё поддерево в LIT.
//
//   node src/cyptree.js --plan        сколько листьев выйдет и куда они лягут
//   node src/cyptree.js --build       собрать блоки в out/cyp/lit/
//   node src/cyptree.js --check       обойти собранное дерево, как это делает прошивка
//   node src/cyptree.js --lift        ещё и расширить рамки предков под весь Кипр
//
// Почему так можно. Дерево POI европейского набора Кипр уже накрывает, и спуск
// к нему (`node src/litpoi.js --find 33 35`) приходит в узел (101170, 667):
// его половина A — рамка (27.959, 33.353)…(34.542, 36.223), а ссылка половины —
// позиция **(112447, 0)**. Если сделать первым элементом блока 112447 не
// запись-тайл, а УЗЕЛ, то ссылку родителя менять не надо вовсе: она уже
// указывает ровно туда. Ни одного байта за пределами наших блоков.
//
// Дальше наш узел делит Кипр сам и раздаёт листья по блокам-донорам. Доноры —
// это листья соседнего поддерева (эгейские): их место в каталоге занято, размер
// известен, и вырасти блок не может, а уменьшиться — может. Чужие точки при
// этом пропадают, но их и не просили.
'use strict';

const path = require('path');
const fs = require('fs');
const B = require('./litblock');
const P = require('./litpoi');
const C = require('./cyppoi');

const DEG = 40000000 / 360;
const ROOT = { block: 112447, key: 0 };        // куда уже указывает родитель
const PARENT = { block: 101170, key: 667 };    // сам родитель
const TREE = { block: 101099, key: 1 };        // корень всего дерева POI

// Рамка набора точек в единицах карты.
function bbox(pois) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pois) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

// Деление длинной стороны по медиане — так делит и завод (у 327 узлов из 327
// рамки потомков смыкаются ровно по одной оси).
function split(pois) {
  const b = bbox(pois);
  const byX = b.x1 - b.x0 >= b.y1 - b.y0;
  const sorted = pois.slice().sort((p, q) => (byX ? p.x - q.x : p.y - q.y));
  const half = sorted.length >> 1;
  return [sorted.slice(0, half), sorted.slice(half)];
}

// Точки группы -> байты листа. Размер считается один раз и запоминается.
function leafBytes(group, blk, ref, idBase) {
  const items = group.map((p, i) => Object.assign({}, p, {
    id: idBase + i, ref: ref,
  }));
  return B.writeBlock(B.model(items), blk);
}

// Разложить точки по донорам. Донор — {blk, size}; группа делится, пока не
// влезет в отведённый ей слот. Возвращает дерево деления с листьями-группами.
function plan(pois, donors, opt) {
  const o = opt || {};
  const ref = o.ref, idBase = o.idBase === undefined ? 0x30000000 : o.idBase;
  const slots = donors.slice().sort((a, b) => b.size - a.size);
  const cache = new Map();
  const sizeOf = (leaf) => {
    if (cache.has(leaf)) return cache.get(leaf);
    // размер считается на «худшем» доноре: блок от номера почти не зависит,
    // но дельта-ссылка засевается номером блока, поэтому берём реальный
    const v = leafBytes(leaf.pois, slots[0].blk, ref, idBase).length;
    cache.set(leaf, v);
    return v;
  };
  let root = { pois: pois };
  const leaves = () => {
    const out = [];
    const go = (n) => { if (n.pois) out.push(n); else { go(n.a); go(n.b); } };
    go(root);
    return out;
  };
  for (let guard = 0; guard < 4096; guard++) {
    const ls = leaves().sort((a, b) => sizeOf(b) - sizeOf(a));
    if (ls.length > slots.length) { divide(ls[0]); continue; }
    let bad = -1;
    for (let i = 0; i < ls.length; i++) if (sizeOf(ls[i]) > slots[i].size) { bad = i; break; }
    if (bad < 0) {
      for (let i = 0; i < ls.length; i++) ls[i].slot = slots[i];
      return { root, leaves: ls, sizeOf };
    }
    divide(ls[bad]);
  }
  throw new Error('не сошлось за 4096 делений');

  function divide(leaf) {
    if (leaf.pois.length < 2) throw new Error('одна точка не влезает в слот');
    const [a, b] = split(leaf.pois);
    cache.delete(leaf);
    delete leaf.pois;
    leaf.a = { pois: a };
    leaf.b = { pois: b };
  }
}

// Дерево деления -> записи узлов. Ключи раздаются обходом в глубину, корень
// получает ноль: именно туда и указывает родитель.
function nodes(root, origin, leafLink) {
  const list = [];
  const key = new Map();
  const order = [];
  (function walk(n) {                            // сперва раздать ключи
    if (n.pois) return;
    key.set(n, order.length);
    order.push(n);
    walk(n.a);
    walk(n.b);
  })(root);
  const rel = (b) => ({ min: [b.x0 - origin.x, b.y0 - origin.y],
                        max: [b.x1 - origin.x, b.y1 - origin.y] });
  const boxOf = (n) => n.pois ? bbox(n.pois) : n.box;
  (function boxes(n) {                           // рамки снизу вверх
    if (n.pois) return bbox(n.pois);
    const a = boxes(n.a), b = boxes(n.b);
    n.box = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
              x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
    return n.box;
  })(root);
  for (const n of order) {
    const a = rel(boxOf(n.a)), b = rel(boxOf(n.b));
    list.push({
      aMin: a.min, aMax: a.max,
      a: n.a.pois ? leafLink(n.a) : [ROOT.block, key.get(n.a)],
      bMin: b.min, bMax: b.max,
      b: n.b.pois ? leafLink(n.b) : [ROOT.block, key.get(n.b)],
      x79: null, n42: 0, x7a: null, n7b: 0,
    });
  }
  return list;
}

// Собрать всё: листья по донорам и блок с узлами на месте 112447.
function build(pois, donors, opt) {
  const o = opt || {};
  const pl = plan(pois, donors, o);
  const leafLink = (leaf) => [leaf.slot.blk, 0];
  const origin = bbox(pois);
  const out = { leaves: [], node: null, plan: pl };
  let idBase = o.idBase === undefined ? 0x30000000 : o.idBase;
  for (const leaf of pl.leaves) {
    const bytes = leafBytes(leaf.pois, leaf.slot.blk, o.ref, idBase);
    if (bytes.length > leaf.slot.size)
      throw new Error('лист ' + leaf.slot.blk + ': ' + bytes.length + ' > ' + leaf.slot.size);
    out.leaves.push({ blk: leaf.slot.blk, size: leaf.slot.size, bytes: bytes,
                      pois: leaf.pois.length });
    idBase += leaf.pois.length;
  }
  const ns = nodes(pl.root, { x: origin.x0, y: origin.y0 }, leafLink);
  const span = Math.max(origin.x1 - origin.x0, origin.y1 - origin.y0);
  const width = [8, 12, 16, 24].find((w) => span < Math.pow(2, w));
  if (!width) throw new Error('рамка Кипра не влезает в 24 бита');
  const model = { origin: { x: origin.x0, y: origin.y0 }, width: width, byte2: 0,
                  count: ns.length, dict: new Map(), tile: null, pois: [], nodes: ns };
  out.node = { blk: ROOT.block, bytes: B.writeBlock(model, ROOT.block) };
  return out;
}

// Цепочка узлов от корня дерева до нашего: на каждом — та половина, в которую
// попадает точка. Рамки этой цепочки и есть потолок: точку вне любой из них
// прошивка не найдёт, сколько её ни клади.
function chain(get, from, x, y) {
  let blk = from.block, key = from.key;
  const out = [];
  for (let d = 0; d < 64; d++) {
    const g = get(blk), rec = g.elems[key + 1];
    if (!rec || rec['#'] !== 0x22) break;
    const box = (mn, mx) => ({ x0: g.origin.x + rec[mn][0], y0: g.origin.y + rec[mn][1],
                               x1: g.origin.x + rec[mx][0], y1: g.origin.y + rec[mx][1] });
    const A = box(0x61, 0x60), Bx = box(0x64, 0x63);
    const has = (b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
    const half = has(A) ? 'A' : (has(Bx) ? 'B' : null);
    if (!half) break;
    const l = half === 'A' ? (rec[0x5f] || rec[0x79]) : (rec[0x62] || rec[0x7a]);
    out.push({ blk: blk, key: key, half: half, box: half === 'A' ? A : Bx });
    if (!Array.isArray(l)) break;
    blk = l[0]; key = l[1];
  }
  return out;
}

// Расширить рамки цепочки так, чтобы они накрыли `box`. Рамка лежит УПАКОВАННОЙ
// ПАРОЙ постоянной ширины, поэтому длина записи от значения не зависит: блок
// выходит ровно того же размера, что и был, байт в байт кроме этих пар.
// Рамки только расширяются — сузить чужую ветку мы не вправе.
function lift(schema, blockOf, ch, box) {
  const byBlk = new Map();
  for (const c of ch) {
    if (!byBlk.has(c.blk)) byBlk.set(c.blk, { model: null, keys: [] });
    byBlk.get(c.blk).keys.push(c);
  }
  const out = new Map();
  for (const [blk, v] of byBlk) {
    const orig = blockOf(blk);
    const m = B.readBlock(schema, orig, blk);
    if (m.other.size) throw new Error('блок ' + blk + ': есть записи, которых писатель не знает');
    for (const c of v.keys) {
      const n = m.nodes[c.key];
      if (!n) throw new Error('блок ' + blk + ': нет узла с ключом ' + c.key);
      const mn = c.half === 'A' ? 'aMin' : 'bMin', mx = c.half === 'A' ? 'aMax' : 'bMax';
      n[mn] = [Math.min(n[mn][0], box.x0 - m.origin.x), Math.min(n[mn][1], box.y0 - m.origin.y)];
      n[mx] = [Math.max(n[mx][0], box.x1 - m.origin.x), Math.max(n[mx][1], box.y1 - m.origin.y)];
      if (n[mn][0] < 0 || n[mn][1] < 0) throw new Error('блок ' + blk + ': рамка ушла за опору');
      const cap = Math.pow(2, m.width);
      if (n[mx][0] >= cap || n[mx][1] >= cap)
        throw new Error('блок ' + blk + ': рамка не влезает в ширину ' + m.width);
    }
    const bytes = B.writeBlock(m, blk);
    if (bytes.length !== orig.length)
      throw new Error('блок ' + blk + ': размер изменился с ' + orig.length + ' на ' + bytes.length);
    out.set(blk, bytes);
  }
  return out;
}

// Сбор листьев по рамке запроса — ровно то, что делает `getTilesInTree`:
// на каждом узле сравниваются обе рамки, и обход идёт по КАЖДОЙ подошедшей,
// а не по одной. Поэтому смыкающиеся рамки половин не беда: точка на границе
// найдётся через обе ветки.
function collect(get, blk, key, q, out, depth) {
  if ((depth || 0) > 64) return out;
  const g = get(blk), rec = g.elems[key + 1];
  if (!rec) return out;
  if (rec['#'] === 0x23) { out.add(blk); return out; }
  if (rec['#'] !== 0x22) return out;
  const box = (mn, mx) => {
    const a = rec[mn], b = rec[mx];
    return Array.isArray(a) && Array.isArray(b)
      ? { x0: g.origin.x + a[0], y0: g.origin.y + a[1],
          x1: g.origin.x + b[0], y1: g.origin.y + b[1] } : null;
  };
  const hit = (b) => !!b && !(q.x1 < b.x0 || q.x0 > b.x1 || q.y1 < b.y0 || q.y0 > b.y1);
  const la = rec[0x5f] || rec[0x79], lb = rec[0x62] || rec[0x7a];
  if (hit(box(0x61, 0x60)) && Array.isArray(la)) collect(get, la[0], la[1], q, out, (depth || 0) + 1);
  if (hit(box(0x64, 0x63)) && Array.isArray(lb)) collect(get, lb[0], lb[1], q, out, (depth || 0) + 1);
  return out;
}

module.exports = { plan, build, nodes, split, bbox, collect, chain, lift,
                   ROOT, PARENT, DEG };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const dirs = ['LIT', 'LIT2', 'LIT3', 'LIT4'].map((d) => path.join('maps/pkgdb', d));
  const p = P.open(dirs);
  const cat = p.catalog();

  // Рамка родителя: наружу неё точку не найти, сколько её ни клади.
  const g = p.get(PARENT.block), rec = g.elems[PARENT.key + 1];
  const A = { x0: g.origin.x + rec[0x61][0], y0: g.origin.y + rec[0x61][1],
              x1: g.origin.x + rec[0x60][0], y1: g.origin.y + rec[0x60][1] };

  // Доноры: листья соседнего поддерева, кроме самого 112447 — он станет узлом.
  const donors = [];
  const seen = new Set();
  (function walk(blk, key, depth) {
    if (depth > 64) return;
    const t = blk + ':' + key;
    if (seen.has(t)) return;
    seen.add(t);
    const b = p.get(blk), r = b.elems[key + 1];
    if (!r) return;
    if (r['#'] === 0x23) {
      if (blk !== ROOT.block) donors.push({ blk: blk, size: cat[blk].size });
      return;
    }
    if (r['#'] !== 0x22) return;
    for (const [lf, alt] of [[0x5f, 0x79], [0x62, 0x7a]]) {
      const l = r[lf] || r[alt];
      if (Array.isArray(l)) walk(l[0], l[1], depth + 1);
    }
  })(101169, 786, 0);

  const LIFT = argv.includes('--lift');
  const pbf = argv.find((a) => a.endsWith('.pbf')) || 'out/cyp/cyprus-latest.osm.pbf';
  const all = C.collect(pbf).map((q) => Object.assign({}, q, {
    x: Math.round(q.lon * 72000), y: Math.round(q.lat * DEG),
  }));
  // Без --lift рамка родителя — потолок, и точки вне неё брать бессмысленно.
  const pois = LIFT ? all
    : all.filter((q) => q.x >= A.x0 && q.x <= A.x1 && q.y >= A.y0 && q.y <= A.y1);
  const deg = (b) => '(' + (b.x0 / 72000).toFixed(3) + ', ' + (b.y0 / DEG).toFixed(3) + ')…(' +
                     (b.x1 / 72000).toFixed(3) + ', ' + (b.y1 / DEG).toFixed(3) + ')';
  console.log('рамка родителя %s%s', deg(A), LIFT ? ' — будет расширена' : '');
  console.log('точек собрано %d, взято %d, за бортом %d',
              all.length, pois.length, all.length - pois.length);
  console.log('доноров %d, суммарно %d КБ, самый большой %d байт',
              donors.length, Math.round(donors.reduce((s, d) => s + d.size, 0) / 1024),
              Math.max(...donors.map((d) => d.size)));

  const old = B.readBlock(p.schema, p.lit.block(cat[ROOT.block]), ROOT.block);
  const ref = old.pois.length ? old.pois[0].ref : [ROOT.block, 0];
  const r = build(pois, donors, { ref: ref });
  const used = r.leaves.reduce((s, l) => s + l.bytes.length, 0);
  const slot = r.leaves.reduce((s, l) => s + l.size, 0);
  console.log('листьев %d, точек в них %d, байт %d из %d отведённых',
              r.leaves.length, r.leaves.reduce((s, l) => s + l.pois, 0), used, slot);
  console.log('блок узлов %d: %d узлов, %d байт из %d',
              r.node.blk, r.plan.leaves.length - 1, r.node.bytes.length, cat[ROOT.block].size);
  if (r.node.bytes.length > cat[ROOT.block].size) {
    console.log('ОШИБКА: блок узлов не влезает в свой слот');
    process.exit(1);
  }
  // Расширение рамок предков: только с --lift и только вверх. Рамки лежат
  // упакованными парами постоянной ширины, поэтому блоки выходят того же
  // размера — правка чужих блоков тут безопасна по длине.
  const lifted = new Map();
  const start = LIFT ? TREE : PARENT;
  if (LIFT) {
    const box = bbox(pois);
    const ch = chain((i) => p.get(i), TREE, Math.round(33.0 * 72000), Math.round(35.0 * DEG));
    const narrow = ch.filter((c) => c.box.x0 > box.x0 || c.box.y0 > box.y0 ||
                                    c.box.x1 < box.x1 || c.box.y1 < box.y1);
    console.log('цепочка от корня: %d узлов, узки %d (%s)', ch.length, narrow.length,
                narrow.map((c) => c.blk + ':' + c.key + c.half).join(' '));
    const patched = lift(p.schema, (i) => p.lit.block(cat[i]), narrow, box);
    for (const [blk, bytes] of patched) lifted.set(blk, bytes);
    console.log('переписано блоков с узлами: %d (%s), размеры не изменились',
                lifted.size, [...lifted.keys()].join(', '));
  }
  if (argv.includes('--check')) {
    // Обход по собранному: наши блоки кладутся поверх заводских, и для каждой
    // точки проверяется, что её лист СОБИРАЕТСЯ по рамке вокруг неё.
    const VM = require('./litvm');
    const over = new Map([[r.node.blk, r.node.bytes]]);
    for (const l of r.leaves) over.set(l.blk, l.bytes);
    for (const [blk, bytes] of lifted) over.set(blk, bytes);
    const cache = new Map();
    const get = (i) => {
      if (cache.has(i)) return cache.get(i);
      const b = over.get(i) || p.lit.block(cat[i]);
      let recs = [];
      try { recs = VM.run(p.schema, b, 0, { blk: i, limit: 4000000 }).records; } catch (e) { /* пусто */ }
      const v = { origin: { x: b.readInt32BE(4), y: b.readInt32BE(8) },
                  elems: P.elemsOf(recs) };
      if (cache.size > 300) cache.clear();
      cache.set(i, v);
      return v;
    };
    let seen = 0, hit = 0, ends = 0;
    for (const l of r.leaves) {
      const res = VM.run(p.schema, l.bytes, 0, { blk: l.blk, limit: 4000000 });
      if (res.why === 'данные кончились' && res.pos === l.bytes.length) ends++;
      const list = P.poisOf(p.schema, l.bytes, l.blk);
      for (let i = 0; i < list.length; i += 17) {
        const q0 = list[i]; seen++;
        const x = Math.round(q0.lon * 72000), y = Math.round(q0.lat * DEG);
        const out = collect(get, start.block, start.key,
                            { x0: x - 72, y0: y - 111, x1: x + 72, y1: y + 111 }, new Set(), 0);
        if (out.has(l.blk)) hit++;
      }
    }
    const nres = VM.run(p.schema, r.node.bytes, 0, { blk: r.node.blk, limit: 4000000 });
    console.log('листья дочитываются до конца: %d из %d', ends, r.leaves.length);
    console.log('блок узлов дочитан: %s (%d из %d байт)',
                nres.why === 'данные кончились' && nres.pos === r.node.bytes.length ? 'да' : 'НЕТ',
                nres.pos, r.node.bytes.length);
    console.log('обход от (%d,%d) по рамке вокруг точки: проверено %d, свой лист собран у %d',
                start.block, start.key, seen, hit);
    if (hit !== seen || ends !== r.leaves.length) process.exit(1);
  }
  if (!argv.includes('--build')) return;
  const outDir = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'out/cyp/lit';
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, String(r.node.blk) + '.bin'), r.node.bytes);
  for (const l of r.leaves) fs.writeFileSync(path.join(outDir, String(l.blk) + '.bin'), l.bytes);
  for (const [blk, bytes] of lifted) fs.writeFileSync(path.join(outDir, String(blk) + '.bin'), bytes);
  fs.writeFileSync(path.join(outDir, 'plan.json'), JSON.stringify({
    root: ROOT, parent: PARENT,
    node: { blk: r.node.blk, bytes: r.node.bytes.length, slot: cat[ROOT.block].size },
    leaves: r.leaves.map((l) => ({ blk: l.blk, bytes: l.bytes.length, slot: l.size, pois: l.pois })),
    lifted: [...lifted.keys()].map((blk) => ({ blk: blk, bytes: lifted.get(blk).length,
                                               slot: cat[blk].size })),
  }, null, 1));
  console.log('записано в %s: %d файлов', outDir, r.leaves.length + 2 + lifted.size);
}
