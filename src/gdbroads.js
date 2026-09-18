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

// --- реестр элементов тайла (секции S1 и S2) -------------------------------
//
// Одной геометрии мало: элемент рисуется, только если на него есть запись в S1.
// Проверено на 4000 тайлах L0 без единого исключения: счётчик в начале S1 равен
// числу элементов минус один (первый элемент — служебная рамка, записи не имеет).
// Раньше здесь дописывалась только геометрия, и добавленные дороги отрисовщик
// просто не видел.
//
//   S1: u16 счётчик, 0x02, u16 ноль, затем записи из полей с тегами
//         16 <u32> <u16 порядковый>   идентификатор
//         21 <u8>                     необязательное поле
//         32 <u16>                    номер строки в S2, отсчёт от нуля
//         f0                          конец записи
//       98.5% записей — это формы «32», «16+32» и «16+21+32»; минимальная
//       запись, которой достаточно, — `32 <u16> f0`, четыре байта.
//
//   S2: u16 счётчик, u16 ноль, затем строки: байт длины, затем байты.
//       В байте длины значащими являются младшие 4 бита (все встреченные длины
//       не больше 15), старшие — признаки продолжения имени.
//
// Секция пустого тайла вырождена до двух байт «00 00» — тогда заголовок
// достраивается целиком.

function parseS1(b) {
  if (b.length < 5) return { count: b.length >= 2 ? b.readUInt16BE(0) : 0, body: Buffer.alloc(0) };
  return { count: b.readUInt16BE(0), body: Buffer.from(b.subarray(5)) };
}
function buildS1(count, body) {
  if (count === 0) return Buffer.from([0, 0]);
  const h = Buffer.alloc(5);
  h.writeUInt16BE(count, 0); h[2] = 2; h.writeUInt16BE(0, 3);
  return Buffer.concat([h, body]);
}
function s1record(nameIdx) {
  const r = Buffer.alloc(4);
  r[0] = 0x32; r.writeUInt16BE(nameIdx, 1); r[3] = 0xf0;
  return r;
}
function parseS2(b) {
  if (b.length < 4) return { count: b.length >= 2 ? b.readUInt16BE(0) : 0, body: Buffer.alloc(0) };
  return { count: b.readUInt16BE(0), body: Buffer.from(b.subarray(4)) };
}
function buildS2(count, body) {
  if (count === 0) return Buffer.from([0, 0]);
  const h = Buffer.alloc(4);
  h.writeUInt16BE(count, 0); h.writeUInt16BE(0, 2);
  return Buffer.concat([h, body]);
}
function s2string(name) {
  const s = Buffer.from(name.slice(0, 15), 'latin1');
  return Buffer.concat([Buffer.from([s.length]), s]);
}
const cellX = lon => 11264 + 93.1 * lon;
const cellY = lat => 934 + 181.8 * lat;

// разложить ломаные по тайлам: дорога целиком уходит в тайл своей первой точки.
// Координаты за границей тайла допустимы — x это u16, y это i16, запаса хватает.
function groupByTile(lines) {
  const byTile = new Map();
  for (const ln of lines) {
    const c = Array.isArray(ln) ? ln : ln.pts;
    if (!c || c.length < 2) continue;
    const tx = Math.floor(cellX(c[0][0]) / TILE) * TILE;
    const ty = Math.floor(cellY(c[0][1]) / TILE) * TILE;
    const k = tx + ',' + ty;
    if (!byTile.has(k)) byTile.set(k, { tx, ty, lines: [] });
    byTile.get(k).lines.push(ln);
  }
  return byTile;
}

// собрать новый блоб тайла со всеми нашими элементами
function buildTile(g, off, size, lines, tx, ty, name = 'CYP') {
  const th = gm.tileHeader(g, off, size);
  if (!th.ok) throw new Error('заголовок тайла не распознан');
  const b = gm.read(g, off, size);
  const stream = b.subarray(16, th.off0);
  const s1 = b.subarray(th.off0, th.off1);
  const s2 = b.subarray(th.off1, th.off2);
  const s3 = b.subarray(th.off2, size);

  const parts = [stream];
  const names = [];                               // имена добавленных дорог, по порядку
  let added = 0, skipped = 0;
  for (const ln of lines) {
    const coords = Array.isArray(ln) ? ln : ln.pts;
    const pts = coords.map(([lon, lat]) => gw.degToTile(lon, lat, tx, ty));
    if (gw.checkRange(pts).length || pts.length > 254) { skipped++; continue; }
    parts.push(gm.encodePoints(pts, 0x50));
    names.push((Array.isArray(ln) ? null : ln.name) || name);
    added++;
  }
  const newStream = Buffer.concat(parts);

  // реестр: на каждый добавленный элемент — запись в S1; все они ссылаются на
  // одну новую строку в S2, чтобы не плодить имена
  const p1 = parseS1(s1), p2 = parseS2(s2);
  const uniq = [], idxOf = new Map();
  for (const nm of names) {
    if (!idxOf.has(nm)) { idxOf.set(nm, p2.count + uniq.length); uniq.push(nm); }
  }
  const newS2 = added
    ? buildS2(p2.count + uniq.length, Buffer.concat([p2.body, ...uniq.map(s2string)]))
    : s2;
  const newS1 = added
    ? buildS1(p1.count + added, Buffer.concat([p1.body, ...names.map(nm => s1record(idxOf.get(nm)))]))
    : s1;

  const off0 = 16 + newStream.length;
  const off1 = off0 + newS1.length;
  const off2 = off1 + newS2.length;
  const total = off2 + s3.length;
  if (total > 0xffff) throw new Error('блоб не влезает в u16: ' + total + ' б');

  const head = Buffer.from(b.subarray(0, 16));
  head.writeUInt16BE(off0, 0);
  head.writeUInt16BE(off1, 2);
  head.writeUInt16BE(off2, 4);
  head.writeUInt16BE(th.count + added, 6);
  return {
    blob: Buffer.concat([head, newStream, newS1, newS2, s3]),
    total, added, skipped, was: size,
    s1count: p1.count + added, s2count: p2.count + uniq.length, names: uniq.length,
  };
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
  const nameOf = f => {
    const p = f.properties || {};
    const s = (p.ref || p.name || '').toString().trim();
    return s ? s.slice(0, 15) : 'CY';              // пустых имён в исходных данных не встречается
  };
  const lines = j.features.filter(f => f.geometry.type === 'LineString')
    .map(f => ({ name: nameOf(f), pts: f.geometry.coordinates.map(c => [c[0] + shift[0], c[1] + shift[1]]) }));
  console.log('=== укладка дорог в GDB ===');
  console.log('дорог на входе: ' + lines.length + ', сдвиг ' + shift[0] + '°/' + shift[1] + '°');

  const gr = gm.levelGrid(g, h, h.levels[0]);
  const byTile = groupByTile(lines);
  console.log('затронуто тайлов: ' + byTile.size + '\n');

  // Сначала СНИМАЕМ карту целей целиком, и только потом пишем. Иначе после
  // первой же дозаписи запись тайла указывает за прежний конец тома, а
  // gm.cluster() обрывает разбор на такой записи (toff >= g.total) — и все
  // следующие тайлы того же кластера пропадают из виду. В полном томе это
  // маскировалось порядком обхода, в урезанном — нет.
  const targets = [];
  for (const { tx, ty, lines: ls } of byTile.values()) {
    const slot = (ty >> gr.head.potY) * gr.W + (tx >> gr.head.potX);
    const e = gr.entries[slot];
    if (!e || e.off < h.regionEnd) { console.log('  тайл (' + tx + ',' + ty + '): кластер недоступен — пропуск'); continue; }
    const c = gm.cluster(g, h, e.off, e.sz);
    const idx = c.tiles.findIndex(t => t.x === tx && t.y === ty);
    if (idx < 0) { console.log('  тайл (' + tx + ',' + ty + '): записи в кластере нет — пропуск'); continue; }
    targets.push({ tx, ty, ls, slot, t: c.tiles[idx], recordOff: e.off + idx * 19 });
  }

  let gd2Size = gd2Path ? fs.statSync(gd2Path).size : g.s2;
  for (const { tx, ty, ls, slot, t, recordOff } of targets) {
    const r = buildTile(g, t.off, t.size, ls, tx, ty);
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
