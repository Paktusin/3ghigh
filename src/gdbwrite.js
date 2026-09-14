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

module.exports = { degToTile, buildReplacement, checkRange };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const root = dataset.resolveRoot(args.find(a => !a.startsWith('--') && !/^\d/.test(a)));
  const g = gm.openGdb(root);

  const tileArg = opt('--tile');
  const cellArg = opt('--cell');
  const roadArg = opt('--road');
  if (!tileArg || !cellArg || !roadArg) {
    console.error('нужны --tile <смещение>:<размер> --cell <cx>,<cy> --road "lon,lat lon,lat ..."');
    process.exit(2);
  }
  const [offS, szS] = tileArg.split(':');
  const off = Number(offS), size = Number(szS);
  const [tcx, tcy] = cellArg.split(',').map(Number);

  const deg = roadArg.trim().split(/\s+/).map(s => s.split(',').map(Number));
  const newPts = deg.map(([lon, lat]) => degToTile(lon, lat, tcx, tcy));

  console.log('=== подмена геометрии в тайле @' + off + ' (' + size + ' б), клетка (' + tcx + ',' + tcy + ') ===');
  const bad = checkRange(newPts);
  if (bad.length) { console.error('координаты не влезают:\n  ' + bad.join('\n  ')); process.exit(1); }

  const { pr, orig, patched, fileOffset } = buildReplacement(g, off, size, newPts, tcx, tcy);
  console.log('точек: ' + pr.count + ' (длина элемента ' + orig.length + ' б — не меняется)');
  console.log('смещение правки в томе: ' + fileOffset);
  console.log('\nбыло (первые 8 точек):');
  pr.points.slice(0, 8).forEach(p => console.log('  x=' + String(p.x).padStart(6) + ' y=' + String(p.y).padStart(7) +
    '   ' + p.lon?.toFixed(4) + '°E ' + p.lat?.toFixed(4) + '°N'));
  console.log('стало (первые 8 точек):');
  newPts.slice(0, 8).forEach((p, i) => console.log('  x=' + String(p.x).padStart(6) + ' y=' + String(p.y).padStart(7) +
    '   ' + deg[i][0].toFixed(4) + '°E ' + deg[i][1].toFixed(4) + '°N'));

  // самопроверка: разобрать получившиеся байты обратно
  const rebuilt = Buffer.concat([Buffer.alloc(0), patched]);
  const n = rebuilt[5];
  const back = [];
  for (let i = 0; i < n; i++) {
    const v = rebuilt.readUInt32BE(11 + i * 4);
    back.push({ x: v >>> 16, y: ((v & 0xffff) << 16) >> 16 });
  }
  const same = back.every((p, i) => p.x === newPts[i].x && p.y === newPts[i].y);
  console.log('\nобратный разбор новых байт: ' + (same ? '✓ совпал со входом' : '✗ РАСХОЖДЕНИЕ'));
  console.log('изменено байт: ' + orig.reduce((a, b, i) => a + (b !== patched[i] ? 1 : 0), 0) + ' из ' + orig.length);

  const applyTo = opt('--apply');
  if (applyTo) {
    if (!fs.existsSync(applyTo)) { console.error('нет файла для правки: ' + applyTo); process.exit(1); }
    const fd = fs.openSync(applyTo, 'r+');
    fs.writeSync(fd, patched, 0, patched.length, fileOffset);
    fs.closeSync(fd);
    console.log('\nзаписано в ' + applyTo + ' по смещению ' + fileOffset);
  } else {
    console.log('\n(ничего не записано — добавьте --apply <копия .gdb>)');
  }
}
