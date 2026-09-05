'use strict';
// Извлечение координат из блоков версий 4 и 5 перебором.
// Использование: node src/harvest.js <файл.xac> [выход.geojson]
//
// В блоках v4/v5 координаты лежат абсолютными парами u32 BE (x, y).
// Границы блока задают окно в считаные километры, поэтому проверка
// "обе величины внутри границ" отсеивает случайные совпадения:
// вероятность ложного попадания порядка 1e-13 на пару.

const fs = require('fs');
const xac = require('./xac');

function harvestBlock(b, bounds, step) {
  const [x0, y0, x1, y1] = bounds;
  const pts = [];
  for (let p = 0; p + 8 <= b.length; p += step) {
    const x = b.readUInt32BE(p), y = b.readUInt32BE(p + 4);
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    pts.push({ offset: p, x, y });
  }
  return pts;
}

function harvestFile(buf, opts) {
  const step = (opts && opts.step) || 2;
  const out = { blocks: [], total: 0 };
  for (const v of xac.vectorBlocks(buf)) {
    const b = buf.subarray(v.offset, v.offset + v.size);
    const pts = harvestBlock(b, v.bounds, step);
    out.blocks.push({ ...v, points: pts });
    out.total += pts.length;
  }
  return out;
}

function toGeoJSON(res, versions) {
  const features = [];
  for (const blk of res.blocks) {
    if (versions && !versions.includes(blk.version)) continue;
    for (const p of blk.points)
      features.push({
        type: 'Feature',
        properties: { block: blk.offset, version: blk.version, at: p.offset },
        geometry: { type: 'Point', coordinates: [xac.toLon(p.x), xac.toLat(p.y)] },
      });
  }
  return { type: 'FeatureCollection', features };
}

module.exports = { harvestBlock, harvestFile, toGeoJSON };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('использование: node src/harvest.js <файл.xac> [выход.geojson]'); process.exit(1); }
  const buf = fs.readFileSync(file);
  const res = harvestFile(buf);

  console.log('  смещение   размер  верс   найдено пар   плотность');
  for (const b of res.blocks) {
    const per = b.points.length ? (b.size / b.points.length).toFixed(0) + ' б/точку' : '—';
    console.log('  ' + String(b.offset).padStart(8), String(b.size).padStart(8),
      String(b.version).padStart(5), String(b.points.length).padStart(13), '   ' + per);
  }
  console.log('всего пар:', res.total);

  const out = process.argv[3];
  if (out) {
    const gj = toGeoJSON(res, [4, 5]);
    fs.writeFileSync(out, JSON.stringify(gj));
    console.log('записано :', out, '—', gj.features.length, 'точек из блоков v4/v5');
  }
}
