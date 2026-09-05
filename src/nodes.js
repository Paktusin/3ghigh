'use strict';
// Декодирование узлов и связей из векторных блоков .xac, версии 3 и 4.
// Использование: node src/nodes.js <файл.xac> [выход.geojson]
//
// Общее для обеих версий: запись переменной длины, в хвосте лежит самоиндекс —
// слово u16 BE, равное смещению записи, делённому на 2. Координаты хранятся
// дельтами от опорной точки блока (заголовок, смещения 40 и 44).
// Признак расширенной записи — старший бит первого байта.
//
// Версия 3: одна сплошная секция записей с 96. Слово по смещению 78 — её конец
// (ноль означает "до конца блока"); дальше идёт вторая секция со ссылками.
//
// Версия 4: блок нарезан на под-блоки. Каждый начинается с рамки — четырёх u32 BE
// (xmin, ymin, xmax, ymax) внутри границ блока, затем идут записи того же формата.
// Опорная точка при этом общая, блочная, а не своя у каждого под-блока.
// Конец данных берётся из u32 по смещению 96 (ноль означает: до конца блока).
// Версия 5 устроена так же, отличается лишь смещением первой рамки.

const fs = require('fs');
const xac = require('./xac');

const V3_START = 96;

function parseRecords(b, from, to, origin, bounds) {
  const nodes = [];
  let p = from;
  while (p + 4 <= to) {
    let end = p + 4;
    while (end + 2 <= to && b.readUInt16BE(end) !== p / 2) end += 2;
    if (end + 2 > to) break;
    const ext = (b[p] & 128) !== 0;
    const dx = ext ? b.readInt16BE(p + 2) : b.readUInt16BE(p) - 0x4000;
    const dy = ext ? b.readInt16BE(p + 4) : b.readUInt16BE(p + 2) - 0x8000;
    const x = origin[0] + dx, y = origin[1] + dy;
    if (x < bounds[0] || x > bounds[2] || y < bounds[1] || y > bounds[3]) break;
    nodes.push({ id: p / 2, offset: p, end: end + 2, extended: ext, x, y });
    p = end + 2;
  }
  return { nodes, stoppedAt: p };
}

function findEdges(b, nodes) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const edges = [];
  for (const n of nodes) {
    for (let q = n.offset + (n.extended ? 8 : 4); q < n.end - 2; q += 2) {
      const w = b.readUInt16BE(q);
      if ((w & 0xc000) !== 0xc000) continue;
      const to = byId.get(w & 0x3fff);
      if (!to) continue;
      let mutual = false;
      for (let r = to.offset + (to.extended ? 8 : 4); r < to.end - 2; r += 2)
        if (b.readUInt16BE(r) === (0x4000 | (q / 2))) { mutual = true; break; }
      if (mutual) edges.push({ from: n.id, to: to.id });
    }
  }
  return edges;
}

// Выборка координатных пар сканированием, с проверкой по рамке под-блока.
// Биасы те же, что в записях v3/v4; повторы по координате отбрасываются.
function scanPairs(b, from, to, origin, bbox) {
  const seen = new Set();
  const nodes = [];
  for (let p = from; p + 4 <= to; p += 2) {
    const x = origin[0] + b.readUInt16BE(p) - 0x4000;
    const y = origin[1] + b.readUInt16BE(p + 2) - 0x8000;
    if (x < bbox[0] || x > bbox[2] || y < bbox[1] || y > bbox[3]) continue;
    const key = x + '_' + y;
    if (seen.has(key)) continue;
    seen.add(key);
    nodes.push({ id: p / 2, offset: p, end: p + 4, extended: false, x, y });
  }
  return nodes;
}

function isBBox(b, p, bounds) {
  if (p + 16 > b.length) return false;
  const v = [0, 4, 8, 12].map(o => b.readUInt32BE(p + o));
  if (v[0] >= v[2] || v[1] >= v[3]) return false;
  return v[0] >= bounds[0] && v[2] <= bounds[2] && v[1] >= bounds[1] && v[3] <= bounds[3];
}

function decodeBlock(b) {
  const version = b.readUInt16BE(20);
  const bounds = [24, 28, 32, 36].map(o => b.readInt32BE(o));
  const origin = [b.readInt32BE(40), b.readInt32BE(44)];

  if (version === 3) {
    const limit = b.readUInt16BE(78) || b.length;
    const r = parseRecords(b, V3_START, limit, origin, bounds);
    if (!r.nodes.length) throw new Error('записи не разобрались');
    return { version, origin, bounds, nodes: r.nodes, edges: findEdges(b, r.nodes), regions: 1 };
  }

  if (version === 4 || version === 5) {
    const dataEnd = b.readUInt32BE(96) || b.length;
    const boxes = [];
    for (let p = 112; p + 16 <= dataEnd; p += 2)
      if (isBBox(b, p, bounds)) { boxes.push(p); p += 14; }
    if (!boxes.length) throw new Error('рамки под-блоков не найдены');

    let nodes = [];
    for (let i = 0; i < boxes.length; i++) {
      const stop = i + 1 < boxes.length ? boxes[i + 1] : dataEnd;
      const bbox = [0, 4, 8, 12].map(o => b.readUInt32BE(boxes[i] + o));
      const got = parseRecords(b, boxes[i] + 16, stop, origin, bounds).nodes;
      // В v4 запись находится обходом по самоиндексу. В v5 самоиндекса нет,
      // поэтому координаты выбираются сканированием: рамка под-блока занимает
      // считаные километры, и вероятность случайного попадания пары в неё
      // порядка 1e-4 на позицию — ложных срабатываний практически не бывает.
      nodes = nodes.concat(got.length ? got : scanPairs(b, boxes[i] + 16, stop, origin, bbox));
    }
    if (!nodes.length)
      throw new Error('рамки найдены (' + boxes.length + '), но записи не разобрались');
    return { version, origin, bounds, nodes, edges: findEdges(b, nodes), regions: boxes.length };
  }

  throw new Error('версия ' + version + ' не поддерживается');
}

function decodeFile(buf) {
  const out = { blocks: [], ok: 0, failed: 0, nodes: 0, edges: 0 };
  for (const v of xac.vectorBlocks(buf)) {
    const b = buf.subarray(v.offset, v.offset + v.size);
    try {
      const d = decodeBlock(b);
      out.blocks.push(Object.assign({}, v, d, { status: 'ok' }));
      out.ok++; out.nodes += d.nodes.length; out.edges += d.edges.length;
    } catch (e) {
      out.blocks.push(Object.assign({}, v, { status: 'fail', reason: e.message }));
      out.failed++;
    }
  }
  return out;
}

function toGeoJSON(res) {
  const features = [];
  for (const blk of res.blocks) {
    if (blk.status !== 'ok') continue;
    const byId = new Map(blk.nodes.map(n => [n.id, n]));
    const at = id => { const n = byId.get(id); return [xac.toLon(n.x), xac.toLat(n.y)]; };
    for (const n of blk.nodes)
      features.push({ type: 'Feature',
        properties: { block: blk.offset, version: blk.version, id: n.id, kind: 'node' },
        geometry: { type: 'Point', coordinates: [xac.toLon(n.x), xac.toLat(n.y)] } });
    for (const e of blk.edges)
      features.push({ type: 'Feature',
        properties: { block: blk.offset, version: blk.version, kind: 'edge' },
        geometry: { type: 'LineString', coordinates: [at(e.from), at(e.to)] } });
  }
  return { type: 'FeatureCollection', features };
}

module.exports = { decodeBlock, decodeFile, toGeoJSON, parseRecords };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('использование: node src/nodes.js <файл.xac> [выход.geojson]'); process.exit(1); }
  const buf = fs.readFileSync(file);
  const res = decodeFile(buf);

  console.log('блоков   :', res.blocks.length, ' разобрано:', res.ok, ' не вышло:', res.failed);
  console.log('узлов    :', res.nodes, ' связей:', res.edges);
  console.log();
  console.log('  смещение   размер  верс  участков   узлов  связей   состояние');
  for (const b of res.blocks)
    console.log('  ' + String(b.offset).padStart(8), String(b.size).padStart(8),
      String(b.version).padStart(5), String(b.status === 'ok' ? b.regions : '-').padStart(9),
      String(b.status === 'ok' ? b.nodes.length : '-').padStart(7),
      String(b.status === 'ok' ? b.edges.length : '-').padStart(7),
      '  ' + (b.status === 'ok' ? 'ok' : b.reason));

  const out = process.argv[3];
  if (out && res.ok) {
    const gj = toGeoJSON(res);
    fs.writeFileSync(out, JSON.stringify(gj));
    console.log();
    console.log('записано :', out, '—', gj.features.length, 'объектов');
  }
}
