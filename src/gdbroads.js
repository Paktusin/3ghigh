'use strict';
// Укладка набора дорог (ломаных) в тайлы GDB.
//
// Отличие от gdbwrite.js: тот кладёт ОДНУ ломаную в один тайл, а дорожная сеть —
// это много отдельных отрезков. Склеивать их в одну ломаную нельзя: получится
// зигзаг, соединяющий несвязанные улицы. Поэтому каждая дорога пишется своим
// элементом, а счётчик элементов в заголовке тайла растёт на их число.
//
// Как и при наращивании, тайл не правится на месте: собирается новый блоб,
// дописывается в конец .gd2, и в кластере правятся 8 байт записи тайла
// (смещение + размер). Общий пустой тайл при этом не трогается — остальные
// морские клетки продолжают ссылаться на него.
//
// Вход — GeoJSON с LineString ((lon,lat)); опционально сдвиг --shift dLon,dLat.
//
//   node src/gdbroads.js maps --roads va01.geojson --shift 20.905,-6.734 \
//        --gdb <копия .gdb> --gd2 <копия .gd2> [--dry]

const fs = require('fs');
const gm = require('./gdb');
const gw = require('./gdbwrite');
const dataset = require('./dataset');

const TILE = 32;                                   // тайл L0 — 32 клетки
const cellX = lon => 11264 + 93.1 * lon;
const cellY = lat => 934 + 181.8 * lat;

// разложить ломаные по тайлам: дорога целиком уходит в тайл своей первой точки.
// Координаты за границей тайла допустимы — x это u16, y это i16, запаса хватает.
function groupByTile(lines) {
  const byTile = new Map();
  for (const ln of lines) {
    if (ln.length < 2) continue;
    const tx = Math.floor(cellX(ln[0][0]) / TILE) * TILE;
    const ty = Math.floor(cellY(ln[0][1]) / TILE) * TILE;
    const k = tx + ',' + ty;
    if (!byTile.has(k)) byTile.set(k, { tx, ty, lines: [] });
    byTile.get(k).lines.push(ln);
  }
  return byTile;
}

// собрать новый блоб тайла со всеми нашими элементами
function buildTile(g, off, size, lines, tx, ty) {
  const th = gm.tileHeader(g, off, size);
  if (!th.ok) throw new Error('заголовок тайла не распознан');
  const b = gm.read(g, off, size);
  const stream = b.subarray(16, th.off0);
  const s1 = b.subarray(th.off0, th.off1);
  const s2 = b.subarray(th.off1, th.off2);
  const s3 = b.subarray(th.off2, size);

  const parts = [stream];
  let added = 0, skipped = 0;
  for (const ln of lines) {
    const pts = ln.map(([lon, lat]) => gw.degToTile(lon, lat, tx, ty));
    if (gw.checkRange(pts).length || pts.length > 254) { skipped++; continue; }
    parts.push(gm.encodePoints(pts, 0x50));
    added++;
  }
  const newStream = Buffer.concat(parts);
  const off0 = 16 + newStream.length;
  const off1 = off0 + s1.length;
  const off2 = off1 + s2.length;
  const total = off2 + s3.length;
  if (total > 0xffff) throw new Error('блоб не влезает в u16: ' + total + ' б');

  const head = Buffer.from(b.subarray(0, 16));
  head.writeUInt16BE(off0, 0);
  head.writeUInt16BE(off1, 2);
  head.writeUInt16BE(off2, 4);
  head.writeUInt16BE(th.count + added, 6);
  return { blob: Buffer.concat([head, newStream, s1, s2, s3]), total, added, skipped, was: size };
}

module.exports = { groupByTile, buildTile, cellX, cellY, TILE };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const root = dataset.resolveRoot(args.find(a => !a.startsWith('--') && !/^\d/.test(a)));
  const g = gm.openGdb(root);
  const h = gm.header(g);

  const roadsFile = opt('--roads');
  if (!roadsFile) { console.error('нужен --roads <geojson>'); process.exit(2); }
  const shift = (opt('--shift') || '0,0').split(',').map(Number);
  const dry = args.includes('--dry');
  const gdbPath = opt('--gdb'), gd2Path = opt('--gd2');
  if (!dry && (!gdbPath || !gd2Path)) { console.error('нужны --gdb и --gd2 (копии томов) либо --dry'); process.exit(2); }

  const j = JSON.parse(fs.readFileSync(roadsFile, 'utf8'));
  const lines = j.features.filter(f => f.geometry.type === 'LineString')
    .map(f => f.geometry.coordinates.map(c => [c[0] + shift[0], c[1] + shift[1]]));
  console.log('=== укладка дорог в GDB ===');
  console.log('дорог на входе: ' + lines.length + ', сдвиг ' + shift[0] + '°/' + shift[1] + '°');

  const gr = gm.levelGrid(g, h, h.levels[0]);
  const byTile = groupByTile(lines);
  console.log('затронуто тайлов: ' + byTile.size + '\n');

  let gd2Size = gd2Path ? fs.statSync(gd2Path).size : g.s2;
  for (const { tx, ty, lines: ls } of byTile.values()) {
    const slot = (ty >> gr.head.potY) * gr.W + (tx >> gr.head.potX);
    const e = gr.entries[slot];
    if (!e || e.off < h.regionEnd) { console.log('  тайл (' + tx + ',' + ty + '): кластер недоступен — пропуск'); continue; }
    const c = gm.cluster(g, h, e.off, e.sz);
    const idx = c.tiles.findIndex(t => t.x === tx && t.y === ty);
    if (idx < 0) { console.log('  тайл (' + tx + ',' + ty + '): записи в кластере нет — пропуск'); continue; }
    const t = c.tiles[idx];

    const r = buildTile(g, t.off, t.size, ls, tx, ty);
    const recordOff = e.off + idx * 19;
    console.log('  тайл (' + tx + ',' + ty + ') слот ' + slot + ': дорог ' + r.added +
      (r.skipped ? ' (пропущено ' + r.skipped + ')' : '') +
      ', блоб ' + r.was + ' → ' + r.total + ' б, запись @' + recordOff);

    if (!dry) {
      const newOffset = g.s1 + gd2Size;
      let fd = fs.openSync(gd2Path, 'r+');
      fs.writeSync(fd, r.blob, 0, r.blob.length, gd2Size);
      fs.closeSync(fd);
      gd2Size += r.blob.length;
      const patch = Buffer.alloc(8);
      patch.writeUInt32BE(newOffset, 0);
      patch.writeUInt32BE(r.total, 4);
      fd = fs.openSync(gdbPath, 'r+');
      fs.writeSync(fd, patch, 0, 8, recordOff + 11);
      fs.closeSync(fd);
      console.log('      записано: блоб на сквозное смещение ' + newOffset + ', запись перенацелена');
    }
  }
  if (dry) console.log('\n(--dry: ничего не записано)');
  else console.log('\nГотово. Размер .gd2 изменился — обновите size=, MD5 и check=qa в GDB2.conf');
}
