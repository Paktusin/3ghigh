'use strict';
// Дорожная сеть из GeoJSON в дорожный тайл `.xac`.
//
//   node src/xacroads.js <дороги.geojson> --out <файл.xac> [ключи]
//
// Ключи:
//   --classes motorway,trunk,primary   какие классы OSM брать (по умолчанию все)
//   --code CY00        код тайла            --index 3776   номер в реестре
//   --country 113      код страны (Кипр)    --base 0       сквозной номер первого блока
//   --max-nodes 9000   потолок узлов в блоке (у завода не больше 9962)
//   --room 1.45        запас длины раздела: во столько раз длиннее наших байт
//   --quiet            без отчёта
//
// Что здесь происходит и почему именно так.
//
// Узел — это точка ломаной, приведённая к единицам карты (X = долгота·72000,
// Y = широта·(40000000/360)). Две точки с одинаковыми единицами — один узел:
// шаг единицы это 1,5 м по долготе и 1 м по широте, и без склейки перекрёстки
// OSM остались бы разорванными.
//
// Ребро хранится ОДИН раз, записью вектора у одного конца; второй конец держит
// встречную ссылку — так устроены и заводские блоки (см. docs/formats/xac.md).
// Если концы попали в разные блоки, вместо пары «вектор + встречная» пишется
// пара «межблочный вектор + встречная ссылка в другой блок».
//
// Класс дороги задаётся индексом в заводской таблице `ATTRIBUTE`: младшие три
// бита её значения — это FRC, а нам нужен индекс, при котором запись вектора
// ровно четырёхбайтовая (`xacwrite.simpleAttributes`). Таблица берётся из
// набора, её мы не сочиняем.
//
// Блоки нарезаются рекурсивным делением по длинной стороне рамки: у блока есть
// потолок по числу записей (16 383 — номер не влезает в 14 бит) и по длине
// (смещения в таблице это u16 от половины байта, то есть 128 КБ).

const fs = require('fs');
const path = require('path');
const xw = require('./xacwrite');
const xv = require('./xacvec');
const tile = require('./xactile');
const xr = require('./xacrec');
const st = require('./struktur');
const dataset = require('./dataset');

const LON = 72000, LAT = 40000000 / 360;
const MAX_ENTRIES = 16000;               // с запасом до 16 383
const MAX_BYTES = 120000;                // с запасом до 131 070

// Класс OSM -> FRC. Значения FRC взяты из прошивки: младшие три бита описателя
// `ATTRIBUTE`, и проверка маршрута сравнивает их с запрошенным maxfrc.
const FRC = {
  motorway: 0, motorway_link: 0,
  trunk: 1, trunk_link: 1,
  primary: 2, primary_link: 2,
  secondary: 3, secondary_link: 3,
  tertiary: 4, tertiary_link: 4,
  residential: 6, unclassified: 6, living_street: 6, road: 6,
  service: 7, track: 7, pedestrian: 7,
};

// Первый «простой» индекс таблицы ATTRIBUTE для каждого FRC. Нулевое значение
// не берём: это описатель без единого признака, и дорогой он быть не может.
// В заводской таблице нулей нет вовсе (0 из 2048), так что правило ничего не
// отнимает, зато не даёт синтетической таблице подсунуть пустой индекс.
function attrByFrc(attr) {
  const out = {};
  for (const i of xw.simpleAttributes(attr)) {
    if (!attr[i]) continue;
    const frc = attr[i] & 7;
    if (out[frc] === undefined) out[frc] = i;
  }
  return out;
}

// Таблица ATTRIBUTE набора.
function setAttributes(root) {
  return xr.attributes(st.openIndex(root).buf);
}

// --- граф --------------------------------------------------------------------

// GeoJSON -> узлы и рёбра в единицах карты. Точки, севшие в одну единицу,
// склеиваются; петля (ребро из узла в него же) отбрасывается.
function graphFromGeoJSON(fc, opt) {
  const classes = opt && opt.classes ? new Set(opt.classes) : null;
  const byKey = new Map(), nodes = [], edges = [], seen = new Set();
  let ways = 0, points = 0, loops = 0, dups = 0;

  const nodeAt = (lon, lat) => {
    const x = Math.round(lon * LON), y = Math.round(lat * LAT);
    const k = x + ',' + y;
    let i = byKey.get(k);
    if (i === undefined) { i = nodes.length; nodes.push({ x, y }); byKey.set(k, i); }
    return i;
  };

  for (const f of fc.features || []) {
    if (!f.geometry || f.geometry.type !== 'LineString') continue;
    const hw = (f.properties || {}).highway || 'unclassified';
    if (classes && !classes.has(hw)) continue;
    const frc = FRC[hw] === undefined ? 6 : FRC[hw];
    ways++;
    const c = f.geometry.coordinates;
    points += c.length;
    let prev = c.length ? nodeAt(c[0][0], c[0][1]) : -1;
    for (let k = 1; k < c.length; k++) {
      const cur = nodeAt(c[k][0], c[k][1]);
      if (cur === prev) { loops++; continue; }
      const key = prev < cur ? prev + '-' + cur : cur + '-' + prev;
      if (seen.has(key)) { dups++; prev = cur; continue; }
      seen.add(key);
      edges.push({ a: prev, b: cur, frc });
      prev = cur;
    }
  }
  return { nodes, edges, ways, points, loops, dups };
}

// --- нарезка на блоки ---------------------------------------------------------

// Рекурсивное деление по длинной стороне рамки, пока в блоке больше `maxNodes`
// узлов. Медиана, а не середина рамки: иначе город в углу тайла даёт блок,
// набитый до потолка, рядом с пустыми.
function splitNodes(nodes, idx, maxNodes) {
  if (idx.length <= maxNodes) return [idx];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of idx) {
    const n = nodes[i];
    if (n.x < x0) x0 = n.x; if (n.x > x1) x1 = n.x;
    if (n.y < y0) y0 = n.y; if (n.y > y1) y1 = n.y;
  }
  const byX = (x1 - x0) >= (y1 - y0);
  const sorted = idx.slice().sort((p, q) => byX ? nodes[p].x - nodes[q].x : nodes[p].y - nodes[q].y);
  const half = sorted.length >> 1;
  if (half === 0 || half === sorted.length) return [idx];
  return splitNodes(nodes, sorted.slice(0, half), maxNodes)
    .concat(splitNodes(nodes, sorted.slice(half), maxNodes));
}

// --- раскладка записей --------------------------------------------------------

// Кто где лежит и какие записи у каждого узла. Ребро внутри блока — вектор у
// узла с меньшим номером и встречная ссылка у второго; ребро между блоками —
// межблочный вектор и встречная ссылка в другой блок.
function layout(graph, groups, attrIdx) {
  const blockOf = new Int32Array(graph.nodes.length).fill(-1);
  const localOf = new Int32Array(graph.nodes.length).fill(-1);
  groups.forEach((g, bi) => g.forEach((n, k) => { blockOf[n] = bi; localOf[n] = k; }));

  const recs = groups.map((g) => g.map(() => ({ vecs: [], backs: [] })));
  let local = 0, cross = 0;

  for (const e of graph.edges) {
    const idx = attrIdx[e.frc] === undefined ? attrIdx[6] : attrIdx[e.frc];
    const ba = blockOf[e.a], bb = blockOf[e.b];
    const la = localOf[e.a], lb = localOf[e.b];
    if (ba === bb) {
      const pos = recs[ba][la].vecs.length;
      recs[ba][la].vecs.push({ to: lb, idx });
      recs[bb][lb].backs.push({ from: la, at: pos });
      local++;
    } else {
      const pos = recs[ba][la].vecs.length;
      recs[ba][la].vecs.push({ cross: bb, node: lb, idx });          // номер запишем потом
      recs[bb][lb].backs.push({ crossBlock: ba, node: la, at: pos });
      cross++;
    }
  }
  return { blockOf, localOf, recs, local, cross };
}

// Номера записей: у узла столько номеров, сколько у него записей, счёт с
// единицы. Та же раскладка, что в генераторе (xacwrite.buildBlock).
function firstEntries(rec) {
  const first = new Array(rec.length);
  let id = 1;
  for (let i = 0; i < rec.length; i++) {
    first[i] = id;
    id += Math.max(1, rec[i].vecs.length + rec[i].backs.length);
  }
  return { first, count: id };
}

// --- сборка -------------------------------------------------------------------

// Граф -> блоки. Возвращает буферы блоков и сводку. Если блок не влезает в
// потолки, его группа делится пополам и раскладка считается заново.
function buildBlocks(graph, opt) {
  const o = opt || {};
  let maxNodes = o.maxNodes || 9000;
  const base = o.base || 0, country = o.country || 0;
  const attrIdx = o.attrIdx;

  for (let round = 0; round < 8; round++) {
    const groups = splitNodes(graph.nodes, graph.nodes.map((_, i) => i), maxNodes);
    const lay = layout(graph, groups, attrIdx);
    const firsts = lay.recs.map(firstEntries);
    const tooMany = firsts.findIndex((f) => f.count > MAX_ENTRIES);
    if (tooMany >= 0) { maxNodes = Math.floor(maxNodes * 0.7); continue; }

    const blocks = [];
    let over = false;
    for (let bi = 0; bi < groups.length && !over; bi++) {
      const nodes = groups[bi].map((gi, k) => {
        const r = lay.recs[bi][k];
        return {
          x: graph.nodes[gi].x, y: graph.nodes[gi].y,
          vectors: r.vecs.map((v) => v.cross === undefined ? { to: v.to, idx: v.idx }
            : { block: base + v.cross, ref: firsts[v.cross].first[v.node], idx: v.idx }),
          backs: r.backs.map((b) => b.crossBlock === undefined ? { from: b.from, at: b.at }
            : { block: base + b.crossBlock,
                ref: firsts[b.crossBlock].first[b.node] + b.at }),
        };
      });
      const blk = xw.buildBlock({ nodes, id: base + bi, tileBase: base, country,
                                  flags: o.flags === undefined ? 0x95 : o.flags });
      if (blk.length > MAX_BYTES) { over = true; break; }
      blocks.push(blk);
    }
    if (over) { maxNodes = Math.floor(maxNodes * 0.7); continue; }
    return { blocks, groups, local: lay.local, cross: lay.cross, maxNodes };
  }
  throw new Error('блоки не удалось уложить в потолки даже после деления');
}

// Блоки -> файл тайла. Раздел ZF-NAMEN обязателен по реестру, но может быть
// пустым: у 347 заводских тайлов он ровно такой.
function buildTileFile(blocks, opt) {
  const o = opt || {};
  const room = o.room === undefined ? 1.45 : o.room;
  const padded = blocks.map((b) => {
    const size = Math.ceil(b.length * room / 4) * 4;
    const out = Buffer.alloc(size, 0);
    b.copy(out, 0);
    out.writeUInt32BE(size - 20, 0x10);
    return out;
  });
  return tile.buildTile({
    code: o.code || 'CY00',
    file: o.file || ((o.prefix || 'EJ211') + '_' + (o.code || 'CY00') + '_1'),
    index: o.index || 0,
    country: o.country || 0,
    built: o.built || '20260922120000',
    zf: tile.section('ZF-NAMEN', Buffer.alloc(o.zfSize === undefined ? 92 : o.zfSize)),
    blocks: padded,
  });
}

// --- проверка -----------------------------------------------------------------

// Прочитать собранный тайл нашими читателями и сверить рёбра с графом.
// Ключ ребра — координаты обоих концов, как в xacgraph.tileEdges.
function verify(file, graph) {
  const xg = require('./xacgraph');
  const xac = require('./xac');
  const blocks = xac.sections(file).list.filter((s) => s.name === 'VEKTORBLOCK')
    .map((s) => file.subarray(s.offset, s.offset + s.total));
  const got = xg.tileEdges(blocks);
  const want = new Set();
  for (const e of graph.edges) {
    const a = graph.nodes[e.a], b = graph.nodes[e.b];
    want.add(a.x + ',' + a.y + '->' + b.x + ',' + b.y);
  }
  let found = 0;
  for (const k of want) {
    const [a, b] = k.split('->');
    if (got.edges.has(k) || got.edges.has(b + '->' + a)) found++;
  }
  // узлы должны лежать в рамке своего блока, иначе координата соврала бы
  let outside = 0;
  for (const b of blocks) {
    const box = [b.readInt32BE(0x18), b.readInt32BE(0x1c), b.readInt32BE(0x20), b.readInt32BE(0x24)];
    const tab = b.readUInt32BE(0x6c), cnt = b.readUInt16BE(0x70);
    const ox = b.readInt32BE(0x28), oy = b.readInt32BE(0x2c);
    for (let i = 1; i < cnt; i++) {
      const at = xv.nodeOffset(b, tab, cnt, i);
      if (!at) continue;
      const c = xv.koord(b, at, ox, oy);
      if (!c || c.x < box[0] || c.x > box[2] || c.y < box[1] || c.y > box[3]) outside++;
    }
  }
  return { want: want.size, found, got: got.edges.size, unresolved: got.lost,
           sections: xac.sections(file).complete, outside };
}

// --- всё вместе ---------------------------------------------------------------

function convert(geojson, opt) {
  const o = opt || {};
  const attr = o.attr || setAttributes(dataset.resolveRoot(o.root));
  const attrIdx = attrByFrc(attr);
  const graph = graphFromGeoJSON(geojson, o);
  if (!graph.nodes.length) throw new Error('в наборе дорог нет ни одной точки');
  const built = buildBlocks(graph, Object.assign({}, o, { attrIdx }));
  const file = buildTileFile(built.blocks, o);
  return { file, graph, built, check: verify(file, graph) };
}

module.exports = { convert, graphFromGeoJSON, splitNodes, layout, buildBlocks,
                   buildTileFile, verify, attrByFrc, setAttributes, FRC };

if (require.main === module) {
  const args = process.argv.slice(2);
  const src = args[0];
  const flag = (name, def) => {
    const i = args.indexOf('--' + name);
    return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
  };
  if (!src || args.includes('--help')) {
    console.error('использование: node src/xacroads.js <дороги.geojson> --out <файл.xac> [--classes ...]');
    process.exit(1);
  }
  const out = flag('out');
  const classes = flag('classes') ? flag('classes').split(',') : null;
  const t0 = Date.now();
  const fc = JSON.parse(fs.readFileSync(src, 'utf8'));
  const r = convert(fc, {
    classes,
    code: flag('code', 'CY00'),
    index: Number(flag('index', 0)),
    country: Number(flag('country', 113)),
    base: Number(flag('base', 0)),
    maxNodes: Number(flag('max-nodes', 9000)),
    room: Number(flag('room', 1.45)),
  });
  if (!args.includes('--quiet')) {
    const g = r.graph, c = r.check;
    console.log('дорог ' + g.ways + ', точек ' + g.points + ' -> узлов ' + g.nodes.length +
      ', рёбер ' + g.edges.length + ' (склеено точек ' + g.loops + ', повторных рёбер ' + g.dups + ')');
    console.log('блоков ' + r.built.blocks.length + ' по ' + r.built.maxNodes +
      ' узлов, рёбер внутри блоков ' + r.built.local + ', межблочных ' + r.built.cross);
    console.log('тайл ' + (r.file.length / 1048576).toFixed(2) + ' МБ, разделы покрывают файл: ' +
      (c.sections ? 'да' : 'НЕТ'));
    console.log('сверка: рёбер в тайле ' + c.got + ', из графа нашлось ' + c.found + ' из ' + c.want +
      ' (' + (100 * c.found / c.want).toFixed(4) + ' %), не разобрано ссылок ' + c.unresolved +
      ', узлов вне рамки блока ' + c.outside);
    console.log('за ' + ((Date.now() - t0) / 1000).toFixed(1) + ' с');
  }
  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, r.file);
    console.log('записано: ' + out);
  }
}
