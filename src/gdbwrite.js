'use strict';
// Подмена геометрии внутри тайла GDB.
//
// Что умеем (см. README «Запись геометрии»): элемент-ломаная лежит в конце
// потока элементов тайла в виде
//     1d <u32 yConst> <u8 N> 8f 00 00 00 00   затем N × u32 (x:u16, y:i16)
// Точки — мировые единицы ОТ НАЧАЛА ТАЙЛА. Если число точек сохранить, длина
// элемента не меняется, и правка делается строго на месте: ни одно смещение в
// заголовке тайла, в таблице кластеров и в томах трогать не нужно.
//
// Координаты задаются в градусах и переводятся по калибровке из README:
//     клетка_X = 11264 + 93,1·долгота      клетка_Y = 934 + 181,8·широта
//
//   node src/gdbwrite.js maps --tile <смещение>:<размер> --cell <cx>,<cy> \
//        --road "33.30,35.40 33.40,35.45 ..."   [--apply <файл.gdb>]
//
// Без --apply ничего не пишется: инструмент считает новые байты, проверяет их
// обратным разбором и печатает сравнение. С --apply патч кладётся в указанную
// КОПИЮ тома (оригинал maps/ не трогаем никогда).

const fs = require('fs');
const gm = require('./gdb');
const dataset = require('./dataset');

// градусы → мировые единицы относительно начала тайла
function degToTile(lon, lat, tcx, tcy) {
  const cellX = 11264 + 93.1 * lon;
  const cellY = 934 + 181.8 * lat;
  return {
    x: Math.round((cellX - tcx) * gm.CELL_X),
    y: Math.round((cellY - tcy) * gm.CELL_Y),
  };
}

function checkRange(pts) {
  const bad = [];
  pts.forEach((p, i) => {
    if (p.x < 0 || p.x > 0xffff) bad.push('точка ' + i + ': x=' + p.x + ' вне u16');
    if (p.y < -32768 || p.y > 32767) bad.push('точка ' + i + ': y=' + p.y + ' вне i16');
  });
  return bad;
}

// собрать новый элемент той же длины, что и старый
function buildReplacement(g, off, size, newPts, tcx, tcy) {
  const pr = gm.tilePoints(g, off, size, tcx, tcy);
  if (!pr) throw new Error('узор ломаной в тайле не распознан');
  if (newPts.length !== pr.count) {
    throw new Error('число точек должно совпадать для правки на месте: было ' +
      pr.count + ', дано ' + newPts.length);
  }
  const th = gm.tileHeader(g, off, size);
  const orig = gm.read(g, off, size).subarray(pr.at, th.off0);
  const patched = gm.encodePoints(newPts, 0x50);
  if (patched.length !== orig.length) {
    throw new Error('длина изменилась: ' + orig.length + ' → ' + patched.length);
  }
  return { pr, th, orig, patched, fileOffset: off + pr.at };
}

// ── Наращивание тайла ────────────────────────────────────────────────────
// Правка на месте ограничена числом точек уже лежащей ломаной. Чтобы положить
// больше, тайл не «раздвигается»: запись тайла в кластере содержит указатель
//     u32 смещение данных @11   u32 размер данных @15
// поэтому новый, более крупный блоб дописывается в КОНЕЦ тома, а в кластере
// правятся только эти 8 байт. Никакие другие смещения не двигаются.
//
// Новый блоб = заголовок(16) + [старый поток элементов + наш элемент] + S1+S2+S3,
// счётчик элементов в заголовке увеличивается на 1, три u16-смещения
// пересчитываются. Предел — u16: весь блоб не больше 65535 байт.
function buildGrownTile(g, off, size, newPts) {
  const th = gm.tileHeader(g, off, size);
  if (!th.ok) throw new Error('заголовок тайла не распознан');
  const b = gm.read(g, off, size);
  const stream = b.subarray(16, th.off0);
  const s1 = b.subarray(th.off0, th.off1);
  const s2 = b.subarray(th.off1, th.off2);
  const s3 = b.subarray(th.off2, size);

  const elem = gm.encodePoints(newPts, 0x50);
  const newStream = Buffer.concat([stream, elem]);
  const off0 = 16 + newStream.length;
  const off1 = off0 + s1.length;
  const off2 = off1 + s2.length;
  const total = off2 + s3.length;
  if (total > 0xffff) throw new Error('блоб не влезает в u16: ' + total + ' б');

  const head = Buffer.from(b.subarray(0, 16));       // копия исходного заголовка
  head.writeUInt16BE(off0, 0);
  head.writeUInt16BE(off1, 2);
  head.writeUInt16BE(off2, 4);
  head.writeUInt16BE(th.count + 1, 6);               // элементов стало на один больше
  return { blob: Buffer.concat([head, newStream, s1, s2, s3]), total, elemCount: th.count + 1 };
}

// найти в кластере запись тайла, указывающую на данный блоб
function findTileRecord(g, h, gr, tileOff) {
  for (let i = 0; i < gr.entries.length; i++) {
    const e = gr.entries[i];
    if (e.off < h.regionEnd || e.off === gr.emptyOff || e.sz === 0) continue;
    const c = gm.cluster(g, h, e.off, e.sz);
    for (let k = 0; k < c.tiles.length; k++) {
      if (c.tiles[k].off === tileOff) {
        return { slot: i, clusterOff: e.off, index: k, recordOff: e.off + k * 19, tile: c.tiles[k] };
      }
    }
  }
  return null;
}

module.exports = { degToTile, buildReplacement, checkRange, buildGrownTile, findTileRecord };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const root = dataset.resolveRoot(args.find(a => !a.startsWith('--') && !/^\d/.test(a)));
  const g = gm.openGdb(root);

  const tileArg = opt('--tile'), cellArg = opt('--cell'), roadArg = opt('--road');
  if (!tileArg || !cellArg || !roadArg) {
    console.error('нужны --tile <смещение>:<размер> --cell <cx>,<cy> --road "lon,lat lon,lat ..."');
    console.error('правка на месте: --apply <копия .gdb>   наращивание: --grow <копия .gd2> --gdb <копия .gdb>');
    process.exit(2);
  }
  const [offS, szS] = tileArg.split(':');
  const off = Number(offS), size = Number(szS);
  const [tcx, tcy] = cellArg.split(',').map(Number);

  const deg = roadArg.trim().split(/\s+/).map(s => s.split(',').map(Number));
  const newPts = deg.map(([lon, lat]) => degToTile(lon, lat, tcx, tcy));

  console.log('=== тайл @' + off + ' (' + size + ' б), клетка (' + tcx + ',' + tcy + '), точек на входе: ' + newPts.length + ' ===');
  const bad = checkRange(newPts);
  if (bad.length) { console.error('координаты не влезают:\n  ' + bad.join('\n  ')); process.exit(1); }

  const growTo = opt('--grow');
  if (growTo) {
    // Наращивание: новый блоб дописывается в конец .gd2, а в кластере правятся
    // только 8 байт записи тайла (смещение+размер). Остальное не двигается.
    const gdb = opt('--gdb');
    if (!gdb) { console.error('для наращивания нужен ещё --gdb <копия .gdb>'); process.exit(2); }
    const h = gm.header(g);
    const gr = gm.levelGrid(g, h, h.levels[0]);
    const rec = findTileRecord(g, h, gr, off);
    if (!rec) { console.error('запись тайла в кластере не найдена'); process.exit(1); }

    const { blob, total, elemCount } = buildGrownTile(g, off, size, newPts);
    const before = fs.statSync(growTo).size;
    const newOffset = g.s1 + before;          // сквозное смещение: .gd2 продолжает .gdb

    console.log('запись тайла: кластер @' + rec.clusterOff + ', индекс ' + rec.index + ', запись @' + rec.recordOff);
    console.log('блоб: ' + size + ' → ' + total + ' б; элементов ' + (elemCount - 1) + ' → ' + elemCount);
    console.log('дописываем в ' + growTo + ' на позицию ' + before + ' (сквозное смещение ' + newOffset + ')');

    let fd = fs.openSync(growTo, 'r+');
    fs.writeSync(fd, blob, 0, blob.length, before);
    fs.closeSync(fd);

    const patch = Buffer.alloc(8);
    patch.writeUInt32BE(newOffset, 0);
    patch.writeUInt32BE(total, 4);
    fd = fs.openSync(gdb, 'r+');
    fs.writeSync(fd, patch, 0, 8, rec.recordOff + 11);
    fs.closeSync(fd);

    console.log('запись тайла перенацелена: смещение=' + newOffset + ', размер=' + total);
    console.log('ВНИМАНИЕ: размер .gd2 изменился — в GDB2.conf нужно обновить size=, MD5 и check=qa');
    process.exit(0);
  }

  // Правка на месте: число точек должно совпасть, длина элемента не меняется.
  const { pr, orig, patched, fileOffset } = buildReplacement(g, off, size, newPts, tcx, tcy);
  console.log('точек: ' + pr.count + ' (длина элемента ' + orig.length + ' б — не меняется)');
  console.log('смещение правки в томе: ' + fileOffset);
  console.log('было (первые 6):');
  pr.points.slice(0, 6).forEach(p => console.log('  ' + (p.lon != null ? p.lon.toFixed(4) + '°E ' + p.lat.toFixed(4) + '°N' : 'x=' + p.x + ' y=' + p.y)));
  console.log('стало (первые 6):');
  deg.slice(0, 6).forEach(d => console.log('  ' + d[0].toFixed(4) + '°E ' + d[1].toFixed(4) + '°N'));
  console.log('изменено байт: ' + orig.reduce((a, b, i) => a + (b !== patched[i] ? 1 : 0), 0) + ' из ' + orig.length);

  const applyTo = opt('--apply');
  if (applyTo) {
    const fd = fs.openSync(applyTo, 'r+');
    fs.writeSync(fd, patched, 0, patched.length, fileOffset);
    fs.closeSync(fd);
    console.log('записано в ' + applyTo + ' по смещению ' + fileOffset);
  } else {
    console.log('(ничего не записано — добавьте --apply <копия .gdb>)');
  }
}
