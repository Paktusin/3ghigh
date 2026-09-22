'use strict';
// Граф дорожной сети блока v5: чтение блока в узлы со связями и обратно.
//
// Читатель `xacvec` отвечает на вопрос «какие тут рёбра», а генератор
// `xacwrite.buildBlock` ждёт граф «узел — список векторов». Между ними и стоит
// этот файл: он превращает заводской блок в тот самый граф, чтобы блок можно
// было собрать заново своими байтами.
//
//   node src/xacgraph.js <файл.xac>            сводка по блокам файла
//   node src/xacgraph.js <файл.xac> --regen    пересобрать блоки и сверить рёбра
//   node src/xacgraph.js --sweep [сколько]     то же по тайлам набора подряд
//
// Чего граф НЕ переносит:
//
//   * межблочные векторы (бит 6 старшего байта второго слова). Их номер
//     указывает на запись в таблице СОСЕДНЕГО блока, а наша нумерация записей
//     своя — перенести такую ссылку некуда. По базе это 7,9 % всех векторов;
//     пересобранный блок остаётся связным внутри себя и теряет выходы наружу.
//   * хвост записи вектора у части векторов — его содержимое не разобрано.
//     Поэтому свой блок занимает около 69 % байт заводского.
//
// Нумерация записей таблицы у завода своя: записей больше, чем «узлы плюс
// векторы». У мальтийского блока их 12 760 против наших 10 512 — лишние
// 2248 адресуют узлы, у которых векторы уже есть. Похоже, это ручки для
// ссылок извне. Воспроизвести нумерацию мы пока не умеем, и это второй повод,
// по которому межблочные ссылки не переносятся.

const fs = require('fs');
const xac = require('./xac');
const xv = require('./xacvec');
const xw = require('./xacwrite');
const nvec = require('./nullvec');

// Блок v5 -> { nodes: [{x, y, vectors: [{to, idx}]}], ... }.
// Узлы нумеруются в порядке появления в таблице, векторы — в порядке записей.
//
// `vectors` — только рёбра внутри блока: столько лет столько и было. Рядом
// лежит `entries` — все записи узла подряд, вместе с межблочными; у них вместо
// `to` стоят `block` (сквозной номер блока-цели) и `ref` (номер записи в его
// таблице). Порядок в `entries` тот же, что в таблице, поэтому пересборка
// тайла может раздать номера заново и переписать ссылки.
//
// Нульвекторы снимаются, только если передать таблицу ATTRIBUTE (`opt.attr`):
// найти элемент можно лишь обходом записей узла, а длина записи зависит от
// атрибута. Без таблицы поле `links` у узлов остаётся пустым.
function graphOf(s, opt) {
  const tab = s.readUInt32BE(0x6c), cnt = s.readUInt16BE(0x70);
  const ox = s.readInt32BE(0x28), oy = s.readInt32BE(0x2c);
  const nodes = [], byOff = new Map(), entryNode = new Array(cnt).fill(-1);

  for (let i = 1; i < cnt; i++) {
    const off = xv.nodeOffset(s, tab, cnt, i);
    if (!off) continue;
    let ni = byOff.get(off);
    if (ni === undefined) {
      const c = xv.koord(s, off, ox, oy);
      if (!c) continue;
      ni = nodes.length;
      nodes.push({ x: c.x, y: c.y, vectors: [], entries: [], links: [], off });
      byOff.set(off, ni);
    }
    entryNode[i] = ni;
  }

  const base = s.readUInt16BE(0x36);
  let cross = 0, local = 0, dangling = 0;
  for (let i = 1; i < cnt; i++) {
    const p = s.readUInt16BE(tab + i * 2) * 2;
    if (p <= 0 || p + 4 > s.length) continue;
    const w0 = (s[p] << 8) | s[p + 1];
    if ((w0 & 0xc000) !== 0xc000) continue;          // запись — не вектор
    const src = entryNode[i];
    if (src < 0) { dangling++; continue; }
    const w1 = (s[p + 2] << 8) | s[p + 3];
    if (((s[p + 2] >> 6) & 1) !== 0) {                // ссылка в другой блок
      cross++;
      if (p + 6 <= s.length) {
        nodes[src].entries.push({ block: base + (s.readUInt16BE(p + 4) & 0x7fff),
                                  ref: w0 & 0x3fff, idx: w1 & 0x07ff });
      }
      continue;
    }
    const dst = entryNode[w0 & 0x3fff];
    if (dst < 0) { dangling++; continue; }
    nodes[src].vectors.push({ to: dst, idx: w1 & 0x07ff });
    nodes[src].entries.push({ to: dst, idx: w1 & 0x07ff });
    local++;
  }

  // Нульвекторы: элемент лежит сразу за записями узла, и опознаёт его разбор
  // блока (`xacwrite.readBlock`). Узел находим по смещению координаты.
  let links = 0;
  if (opt && opt.attr) {
    const m = xw.readBlock(s, opt.attr);
    if (m) {
      let at = -1;
      for (const it of m.items) {
        if (it.kind === 'coord') { at = it.at; continue; }
        if (it.kind !== 'null') continue;
        const ni = byOff.get(at);
        if (ni === undefined) continue;
        const p = nvec.pairs(s, it.at, nvec.wideMask(s));
        for (const q of p.list) if (q) nodes[ni].links.push(q);
        links += p.list.filter(Boolean).length;
      }
    }
  }
  return { nodes, cnt, ox, oy, cross, local, dangling, links, entryNode, base,
           id: s.readUInt16BE(0x34) };
}

// Номера записей, которые раздаст buildBlock: у узла с k записями занято k
// номеров, у узла без записей — один, счёт с единицы. Это та же раскладка,
// что в самом генераторе, и она нужна ЗАРАНЕЕ: межблочная ссылка указывает на
// номер записи в чужом блоке, а тот пересобирается тогда же, что и этот.
function firstEntries(nodes) {
  const first = new Array(nodes.length);
  let id = 1;
  for (let i = 0; i < nodes.length; i++) {
    first[i] = id;
    id += Math.max(1, (nodes[i].entries || nodes[i].vectors || []).length);
  }
  return first;
}

// Собрать блок заново своими байтами, сохранив опору, номер и код страны.
// Дополняется нулями до заданного размера: тогда раздел занимает столько же
// места, сколько заводской, и файл тайла не меняет длины. Хвост за таблицей
// никем не адресуется — ни одна ссылка туда не ведёт.
function regenBlock(s, padTo) {
  const g = graphOf(s);
  if (!g.nodes.length) return null;
  const blk = xw.buildBlock({
    nodes: g.nodes,
    origin: [g.ox, g.oy],
    id: s.readUInt16BE(0x34),
    tileBase: s.readUInt16BE(0x36),
    country: s.readUInt16BE(0x3a),
    flags: s.readUInt16BE(0x3c),
  });
  if (!padTo) return { block: blk, graph: g };
  if (blk.length > padTo) return { block: blk, graph: g, tooBig: true };
  const out = Buffer.alloc(padTo, 0);
  blk.copy(out, 0);
  out.writeUInt32BE(padTo - 20, 0x10);              // длина полезной части раздела
  return { block: out, graph: g, pad: padTo - blk.length };
}

// Координаты узлов блока по номерам записей таблицы. Ровно то, что делает
// прошивка: номер -> FUN_08272410 -> u_get_koord_c.
function entryCoords(s) {
  const tab = s.readUInt32BE(0x6c), cnt = s.readUInt16BE(0x70);
  const ox = s.readInt32BE(0x28), oy = s.readInt32BE(0x2c);
  const out = new Array(cnt).fill(null);
  for (let i = 1; i < cnt; i++) {
    const off = xv.nodeOffset(s, tab, cnt, i);
    if (off) out[i] = xv.koord(s, off, ox, oy);
  }
  return { coords: out, tab, cnt };
}

// Рёбра ВСЕГО тайла, вместе с межблочными: ключ — координаты обоих концов.
// Локальное ребро разрешается в своём блоке, межблочное — в том, чей сквозной
// номер получается из поля 0x36 и слова 2 записи.
function tileEdges(blocks) {
  const byId = new Map(blocks.map((b) => [b.readUInt16BE(0x34), b]));
  const cache = new Map();
  const info = (b) => {
    if (!cache.has(b)) cache.set(b, entryCoords(b));
    return cache.get(b);
  };
  const out = new Set();
  let lost = 0;
  for (const b of blocks) {
    const me = info(b), base = b.readUInt16BE(0x36);
    for (let i = 1; i < me.cnt; i++) {
      const p = b.readUInt16BE(me.tab + i * 2) * 2;
      if (p <= 0 || p + 4 > b.length) continue;
      const w0 = b.readUInt16BE(p);
      if ((w0 & 0xc000) !== 0xc000) continue;
      const a = me.coords[i];
      if (!a) { lost++; continue; }
      let t = b;
      if (((b[p + 2] >> 6) & 1) !== 0) {                   // межблочная
        if (p + 6 > b.length) { lost++; continue; }
        t = byId.get(base + (b.readUInt16BE(p + 4) & 0x7fff));
        if (!t) { lost++; continue; }                      // цель вне этого тайла
      }
      const ti = info(t), z = ti.coords[w0 & 0x3fff];
      if (!z) { lost++; continue; }
      out.add(a.x + ',' + a.y + '->' + z.x + ',' + z.y);
    }
  }
  return { edges: out, lost };
}

// Пересобрать все блоки v5 файла тайла, сохранив длину каждого раздела и
// длину всего файла. Блоки v3/v4 и все прочие разделы переносятся как есть.
//
// Главное отличие от поблочной пересборки: номера записей раздаются СРАЗУ ВСЕМ
// блокам тайла, поэтому межблочная ссылка находит свою новую цель и ребро на
// границе блоков не теряется. Ссылку в блок, который остался заводским (версии
// 3 и 4, или не влез в свой раздел), трогать не надо — его нумерация не
// менялась. Нульвекторы переносятся как есть: они ведут в соседние тайлы, а те
// мы не трогаем.
//
// Блок, которому не хватило места, остаётся заводским — и тогда раздача
// номеров повторяется без него, иначе ссылки в него поехали бы.
function regenTile(buf, opt) {
  const list = xac.sections(buf).list;
  const raws = list.map((s) => buf.subarray(s.offset, s.offset + s.total));
  const stat = { blocks: 0, v5: 0, edgesWas: 0, edgesNow: 0, cross: 0, crossKept: 0,
                 edgesExtra: 0, links: 0, pad: 0, nodes: 0, tooBig: 0,
                 unresolvedWas: 0, unresolvedNow: 0 };

  // какие разделы — блоки v5
  const idx = [];
  list.forEach((s, k) => {
    if (s.name !== 'VEKTORBLOCK') return;
    stat.blocks++;
    if (raws[k].readUInt16BE(0x14) === 5) idx.push(k);
  });

  const graphs = new Map();                       // номер раздела -> граф
  for (const k of idx) {
    const g = graphOf(raws[k], opt);
    if (g.nodes.length) graphs.set(k, g);
  }
  const keep = new Set();                         // блоки, оставшиеся заводскими
  let built = new Map(), rounds = 0;

  for (;;) {
    // сквозной номер блока -> его раздел, среди тех, что пересобираем
    const mine = new Map();
    for (const k of graphs.keys()) if (!keep.has(k)) mine.set(raws[k].readUInt16BE(0x34), k);
    const first = new Map();
    for (const [k, g] of graphs) if (!keep.has(k)) first.set(k, firstEntries(g.nodes));

    built = new Map();
    let over = false;
    for (const [k, g] of graphs) {
      if (keep.has(k)) continue;
      const nodes = g.nodes.map((n) => ({ x: n.x, y: n.y, links: n.links, vectors: [] }));
      for (let i = 0; i < g.nodes.length; i++) {
        for (const e of g.nodes[i].entries) {
          if (e.to !== undefined) { nodes[i].vectors.push(e); continue; }
          const tk = mine.get(e.block);
          if (tk === undefined) {                 // цель не пересобиралась — ссылка та же
            nodes[i].vectors.push({ block: e.block, ref: e.ref, idx: e.idx });
            continue;
          }
          const tn = graphs.get(tk).entryNode[e.ref];
          if (tn === undefined || tn < 0) continue;            // цель не разобрана
          nodes[i].vectors.push({ block: e.block, ref: first.get(tk)[tn], idx: e.idx });
        }
      }
      const blk = xw.buildBlock({ nodes, origin: [g.ox, g.oy], id: g.id, tileBase: g.base,
        country: raws[k].readUInt16BE(0x3a), flags: raws[k].readUInt16BE(0x3c) });
      if (blk.length > list[k].total) { keep.add(k); over = true; stat.tooBig++; continue; }
      built.set(k, blk);
    }
    if (!over || ++rounds > 4) break;
  }

  const parts = raws.slice();
  for (const [k, blk] of built) {
    const out = Buffer.alloc(list[k].total, 0);
    blk.copy(out, 0);
    out.writeUInt32BE(list[k].total - 20, 0x10);   // длина полезной части раздела
    parts[k] = out;
    stat.v5++;
    stat.pad += list[k].total - blk.length;
  }
  for (const [k, g] of graphs) {
    if (keep.has(k)) continue;
    stat.nodes += g.nodes.length;
    stat.cross += g.cross;
    stat.links += g.links;
  }

  const was = tileEdges(idx.map((k) => raws[k]));
  const now = tileEdges(idx.map((k) => parts[k]));
  stat.edgesWas = was.edges.size;
  for (const k of now.edges) if (was.edges.has(k)) stat.edgesNow++;
  stat.edgesExtra = now.edges.size - stat.edgesNow;   // рёбра, которых у завода не было
  stat.unresolvedWas = was.lost;
  stat.unresolvedNow = now.lost;
  const out = Buffer.concat(parts);
  if (out.length !== buf.length) throw new Error('длина файла изменилась: ' + out.length + ' вместо ' + buf.length);
  // вычислимые поля шапки пересчитываются по новым разделам
  const vb = xac.sections(out).list.filter(x => x.name === 'VEKTORBLOCK');
  const bb = [0x7fffffff, 0x7fffffff, -0x80000000, -0x80000000];
  for (const s of vb) {
    bb[0] = Math.min(bb[0], out.readInt32BE(s.offset + 0x18));
    bb[1] = Math.min(bb[1], out.readInt32BE(s.offset + 0x1c));
    bb[2] = Math.max(bb[2], out.readInt32BE(s.offset + 0x20));
    bb[3] = Math.max(bb[3], out.readInt32BE(s.offset + 0x24));
  }
  bb.forEach((v, k) => out.writeInt32BE(v, 0x54 + k * 4));
  out.writeUInt32BE(vb.length, 0x70);
  out.writeUInt32BE(vb.length ? vb[0].offset : 0xffffffff, 0x74);
  out.writeUInt32BE(vb.reduce((a, x) => a + x.total, 0), 0x78);
  return { out, stat };
}

module.exports = { graphOf, regenBlock, regenTile, tileEdges, entryCoords, firstEntries };

// Таблица ATTRIBUTE из общего индекса набора — нужна для нульвекторов.
function attrOfSet() {
  const st = require('./struktur');
  const xr = require('./xacrec');
  return xr.attributes(st.openIndex(require('./dataset').resolveRoot()).buf);
}

// Сплошной прогон: пересобрать тайлы набора один за другим и сложить рёбра.
function sweep(limit) {
  const path = require('path');
  const fldb = require('./fldb');
  const root = require('./dataset').resolveRoot();
  const attr = attrOfSet();
  const sum = { tiles: 0, blocks: 0, v5: 0, nodes: 0, was: 0, now: 0, cross: 0,
                links: 0, tooBig: 0, full: 0, extra: 0, noV5: 0 };
  for (const d of fs.readdirSync(path.join(root, 'pkgdb'))) {
    if (!/^XAC/.test(d)) continue;
    for (const f of fs.readdirSync(path.join(root, 'pkgdb', d))) {
      if (!/\.db$/i.test(f)) continue;
      const db = fldb.open(path.join(root, 'pkgdb', d, f));
      for (const e of fldb.entries(db)) {
        if (!/_[A-Z0-9]{4}_1\.xac$/.test(e.name)) continue;
        if (sum.tiles >= limit) return sum;
        const buf = fldb.read(db, e);
        const { out, stat } = regenTile(buf, { attr });
        if (out.length !== buf.length) throw new Error('длина файла изменилась: ' + e.name);
        sum.tiles++; sum.blocks += stat.blocks; sum.v5 += stat.v5; sum.nodes += stat.nodes;
        sum.was += stat.edgesWas; sum.now += stat.edgesNow; sum.cross += stat.cross;
        sum.links += stat.links; sum.tooBig += stat.tooBig; sum.extra += stat.edgesExtra;
        if (!stat.edgesWas) sum.noV5++;
        else if (stat.edgesNow === stat.edgesWas) sum.full++;
      }
    }
  }
  return sum;
}

module.exports.sweep = sweep;

if (require.main === module) {
  if (process.argv[2] === '--sweep') {
    const s = sweep(Number(process.argv[3] || 40));
    console.log('тайлов ' + s.tiles + ', блоков ' + s.blocks + ', из них пересобрано v5 ' + s.v5 +
      ', узлов ' + s.nodes);
    console.log('рёбер в тайлах ' + s.was + ', воспроизведено ' + s.now +
      ' (' + (100 * s.now / s.was).toFixed(4) + ' %)');
    console.log('тайлов со всеми рёбрами ' + s.full + ' из ' + (s.tiles - s.noV5) +
      ' (ещё ' + s.noV5 + ' без блоков v5), лишних рёбер ' + s.extra);
    console.log('межблочных векторов ' + s.cross + ', нульвекторов ' + s.links +
      ', блоков не влезло ' + s.tooBig);
    return;
  }
  const file = process.argv[2];
  if (!file) {
    console.error('использование: node src/xacgraph.js <файл.xac> [--regen] | --sweep [сколько]');
    process.exit(1);
  }
  const buf = fs.readFileSync(file);
  if (process.argv.includes('--regen')) {
    // таблица ATTRIBUTE нужна только для нульвекторов: --xah <файл .xah или .db>
    let attr = null;
    const ai = process.argv.indexOf('--xah');
    if (ai > 0 && process.argv[ai + 1]) {
      const xr = require('./xacrec');
      const src = process.argv[ai + 1];
      if (/\.db$/i.test(src)) {
        const fldb = require('./fldb');
        const db = fldb.open(src);
        const e = fldb.entries(db).find((x) => /\.xah$/i.test(x.name));
        attr = xr.attributes(fldb.read(db, e));
      } else {
        attr = xr.attributes(fs.readFileSync(src));
      }
    }
    const { out, stat } = regenTile(buf, attr ? { attr } : undefined);
    console.log('блоков ' + stat.blocks + ', из них v5 пересобрано ' + stat.v5);
    console.log('узлов ' + stat.nodes + ', рёбер в тайле ' + stat.edgesWas +
      ', воспроизведено ' + stat.edgesNow +
      (stat.edgesWas ? ' (' + (stat.edgesNow / stat.edgesWas * 100).toFixed(3) + ' %)' : ''));
    console.log('межблочных векторов ' + stat.cross + ', нульвекторов ' + stat.links +
      ', лишних рёбер ' + stat.edgesExtra + ', блоков не влезло ' + stat.tooBig);
    console.log('дополнено нулями ' + stat.pad + ' байт, длина файла ' + out.length + ' — прежняя');
    return;
  }
  for (const s of xac.sections(buf).list) {
    if (s.name !== 'VEKTORBLOCK') continue;
    const raw = buf.subarray(s.offset, s.offset + s.total);
    const v = raw.readUInt16BE(0x14);
    if (v !== 5) { console.log('блок @' + s.offset + ' версии ' + v + ' — пропущен'); continue; }
    const g = graphOf(raw);
    console.log('блок @' + String(s.offset).padStart(8) + '  узлов ' + String(g.nodes.length).padStart(6) +
      '  векторов ' + String(g.local).padStart(6) + '  межблочных ' + String(g.cross).padStart(5) +
      '  висячих ' + g.dangling);
  }
}
