// Заводские кластеры GDB для пересадки в собранный том (опыт «чужой остров
// рядом с нашим»): по рамке в градусах на каждом уровне берутся слоты, их
// записи тайлов, словарь имён и сами тайлы. Сетка и ключи у собранного тома
// заводские (та же рамка, тот же отсчёт), поэтому кластер встаёт в тот же слот
// без правок, кроме смещений тайлов (их переписывает gdbgen.build).
const gm = require('./gdb');

function rawClusters(root, box) {
  const g = gm.openGdb(root);
  const h = gm.header(g);
  return h.levels.map((L) => {
    const b = gm.read(g, L.offset, L.size);
    const hd = { cellX: b.readUInt32BE(0), cellY: b.readUInt32BE(4), potX: b[8], potY: b[9] };
    const W = gm.gridW(h, hd);
    const n = b.readUInt32BE(gm.TABLE_AT - 4);
    const second = gm.TABLE_AT + n * 6;
    const out = [];
    const cx0 = Math.floor(gm.cellOfLon(box.lon0, hd.cellX) / (1 << hd.potX));
    const cx1 = Math.floor(gm.cellOfLon(box.lon1, hd.cellX) / (1 << hd.potX));
    const cy0 = Math.floor(gm.cellOfLat(box.lat0, hd.cellY) / (1 << hd.potY));
    const cy1 = Math.floor(gm.cellOfLat(box.lat1, hd.cellY) / (1 << hd.potY));
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const slot = cy * W + cx;
        const off = b.readUInt32BE(gm.TABLE_AT + slot * 6), sz = b.readUInt16BE(gm.TABLE_AT + slot * 6 + 4);
        const nt = b.readUInt16BE(second + slot * 4), dict = b.readUInt16BE(second + slot * 4 + 2);
        const blob = gm.read(g, off, sz);
        const records = blob.subarray(0, nt * 19);
        const tiles = new Map();
        for (let o = 0; o < records.length; o += 19) {
          const to = records.readUInt32BE(o + 11);
          if (!tiles.has(to)) tiles.set(to, gm.read(g, to, records.readUInt32BE(o + 15)));
        }
        out.push({ cx, cy, records, tiles, dict: blob.subarray(nt * 19, nt * 19 + dict) });
      }
    }
    return out;
  });
}

module.exports = { rawClusters };
