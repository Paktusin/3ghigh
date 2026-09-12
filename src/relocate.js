'use strict';
// Перенос группы тайлов в другое место карты.
//
//   node src/relocate.js <каталог набора> --tiles VA00,VA01 --anchor VA01 --to 33.36,35.17
//
// Все тайлы группы сдвигаются одним вектором так, чтобы центр рамки якорного
// тайла лёг в заданную точку. Исходные файлы не трогаются: контейнеры
// копируются в набор, правки вносятся в копии по месту — размеры файлов не
// меняются, каталог FLDB остаётся прежним.
//
// Что сдвигается (всё, где в данных найдены абсолютные координаты):
//   тайлы <П>_<код>_1.xac и _2.xac (контейнер XAC3):
//     XAC HEADER      +0x54..+0x60  рамка тайла
//     VEKTORBLOCK     +24..+36 рамка, +40/+44 опора, +80..+92 вторая рамка
//     LOCAL POIS      записи по 10 байт: x, y, атрибут
//   общий индекс .xah (контейнер XAC):
//     XAC-STRUKTUR L1..L4  рамка строки тайла
//     NACHBARN             соседи вне группы заменяются соседями внутри неё,
//                          а у чужих тайлов ссылка на группу — их же другим
//                          соседом; длины записей не меняются
//   общий растр .ras (контейнер XAC): ячейки новой рамки получают номер тайла
//
// Записи VEKTORBLOCK хранят дельты от опоры — их трогать не нужно. Проверено,
// что LAYER 1 VERWEISE, ZE-NAMEN, HAUSNUMMERN абсолютных координат не содержат.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fldb = require('./fldb');
const xac = require('./xac');
const st = require('./struktur');
const ras = require('./rasidx');
const dataset = require('./dataset');

function findContainer(root, pred) {
  const pkgdb = path.join(root, 'pkgdb');
  for (const d of fs.readdirSync(pkgdb)) {
    if (!/^XAC/.test(d)) continue;
    for (const f of fs.readdirSync(path.join(pkgdb, d))) {
      if (!f.toLowerCase().endsWith('.db')) continue;
      const p = path.join(pkgdb, d, f);
      const db = fldb.open(p);
      const ents = fldb.entries(db);
      if (ents.some(pred)) return { dir: d, file: f, path: p, db, ents };
    }
  }
  return null;
}

// правки по абсолютному смещению в файле
function patchI32(fd, at, value) {
  const b = Buffer.alloc(4); b.writeInt32BE(value, 0); fs.writeSync(fd, b, 0, 4, at);
}
function patchU16(fd, at, value) {
  const b = Buffer.alloc(2); b.writeUInt16BE(value, 0); fs.writeSync(fd, b, 0, 2, at);
}

function shiftTile(fd, entry, buf, dx, dy, log) {
  const base = entry.offset;
  const secs = xac.sections(buf).list;
  let n = 0;
  const mv = (at, isX) => { patchI32(fd, base + at, buf.readInt32BE(at) + (isX ? dx : dy)); n++; };
  const bbox = (at) => { mv(at, true); mv(at + 4, false); mv(at + 8, true); mv(at + 12, false); };

  const hdr = secs.find(s => s.name === 'XAC HEADER');
  bbox(hdr.offset + 0x54);
  const tb = [0x54, 0x58, 0x5c, 0x60].map(o => buf.readInt32BE(hdr.offset + o));

  for (const s of secs.filter(s => s.name === 'VEKTORBLOCK')) {
    const o = s.offset;
    const v = buf.readUInt16BE(o + 20);
    if (v !== 3) throw new Error(entry.name + ': блок версии ' + v + ' — переносить умеем только v3');
    bbox(o + 24);
    mv(o + 40, true); mv(o + 44, false);
    // вторая рамка: у v3 лежит перед записями, всегда внутри границ блока
    const b2 = [80, 84, 88, 92].map(k => buf.readInt32BE(o + k));
    const bb = [24, 28, 32, 36].map(k => buf.readInt32BE(o + k));
    const inside = b2[0] >= bb[0] && b2[1] >= bb[1] && b2[2] <= bb[2] && b2[3] <= bb[3];
    if (!inside) throw new Error(entry.name + ': у блока @' + o + ' нет второй рамки на +80');
    bbox(o + 80);
  }

  const poi = secs.find(s => s.name === 'LOCAL POIS');
  let pois = 0;
  if (poi) {
    // записи по 10 байт с абсолютной точкой внутри рамки тайла
    for (let p = poi.offset + 20; p + 10 <= poi.offset + poi.total; p++) {
      const x = buf.readInt32BE(p), y = buf.readInt32BE(p + 4);
      if (x < tb[0] || x > tb[2] || y < tb[1] || y > tb[3]) continue;
      mv(p, true); mv(p + 4, false); pois++;
      p += 9;
    }
  }
  log('   ' + entry.name.padEnd(20) + ' полей ' + String(n).padStart(3) + '  блоков ' +
    secs.filter(s => s.name === 'VEKTORBLOCK').length + '  POI ' + pois);
}

function md5File(p, limit) {
  const h = crypto.createHash('md5');
  const fd = fs.openSync(p, 'r');
  const size = fs.statSync(p).size;
  const take = limit ? Math.min(limit, size) : size;
  const buf = Buffer.alloc(1 << 22);
  let done = 0;
  while (done < take) {
    const k = fs.readSync(fd, buf, 0, Math.min(buf.length, take - done), done);
    h.update(buf.subarray(0, k)); done += k;
  }
  fs.closeSync(fd);
  return h.digest('hex');
}

// .conf компонента: те же строки, новые MD5
// Три пробы check=qa — это MD5 трёх кусков по 102 400 байт, а не одно
// значение трижды. Смещения выведены перебором и сошлись на всех компонентах
// европейского набора:
//
//   #1  0
//   #2  size / 2        (целочисленно)
//   #3  size - 102400 - 1
//
// У третьей пробы смещение на байт меньше, чем дало бы «последние 102 400»:
// чтение кончается за байт до конца файла. Это ошибка на единицу в коде
// производителя, но повторять её обязательно — иначе значение не сойдётся.
const QA = 102400;

function md5Chunk(p, off, n) {
  const h = crypto.createHash('md5');
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(n);
  const k = fs.readSync(fd, buf, 0, n, off);
  fs.closeSync(fd);
  h.update(buf.subarray(0, k));
  return h.digest('hex');
}

// Файл короче пробы читается целиком, и все три значения совпадают: так
// устроен LABEL на 2521 байт — единственный такой компонент в наборе.
function qaProbes(p) {
  const size = fs.statSync(p).size;
  const offs = size <= QA ? [0, 0, 0] : [0, Math.floor(size / 2), size - QA - 1];
  return offs.map(off => md5Chunk(p, off, QA));
}

function rewriteConf(srcConf, dstConf, dataPath) {
  let t = fs.readFileSync(srcConf, 'latin1');
  t = t.replace(/^MD5=[0-9a-f]+/m, 'MD5=' + md5File(dataPath));
  t = t.replace(/^check=qa,100,[0-9a-f]+,[0-9a-f]+,[0-9a-f]+/m,
    'check=qa,100,' + qaProbes(dataPath).join(','));
  fs.writeFileSync(dstConf, Buffer.from(t, 'latin1'));
}

function relocate(outDir, codes, anchor, toLon, toLat, log, noRas, zero) {
  const root = dataset.resolveRoot();
  const idxC = findContainer(root, e => /[.]xah$/.test(e.name));
  const xahEntry = idxC.ents.find(e => /[.]xah$/.test(e.name));
  const rasEntry = idxC.ents.find(e => /[.]ras$/.test(e.name));
  if (!rasEntry) throw new Error('.ras лежит не в том контейнере, что .xah — не предусмотрено');
  const xah = fldb.read(idxC.db, xahEntry);
  const reg = st.parse(xah);
  const order = [...reg.keys()];
  const lv = st.parseLevels(xah);
  const nb = st.parseNeighbors(xah);

  const idxOf = c => { const i = order.indexOf(c); if (i < 0) throw new Error('тайл ' + c + ' не в реестре'); return i; };
  const group = codes.map(idxOf);
  const ai = idxOf(anchor);
  const ab = lv[1].rows[ai].bbox;
  const cx = Math.round((ab[0] + ab[2]) / 2), cy = Math.round((ab[1] + ab[3]) / 2);
  let dx = xac.fromLon(toLon) - cx, dy = xac.fromLat(toLat) - cy;
  // --zero: сдвиг ровно 0, координаты не меняются, но соседство NACHBARN
  // переписывается как обычно. Контрольный опыт: изолирует правку соседей
  // от всех правок координат.
  if (zero) { dx = 0; dy = 0; }
  log('сдвиг: dx=' + dx + ' dy=' + dy + '  (' + (dx / xac.SCALE_X).toFixed(3) + ' град. по долготе, ' +
    (dy / xac.SCALE_Y).toFixed(3) + ' град. по широте)');

  // тайлы группы — где лежат
  const tileC = findContainer(root, e => e.name.indexOf('_' + codes[0] + '_1.xac') > 0);
  if (!tileC) throw new Error('файлы тайла ' + codes[0] + ' не найдены');

  // ---- копии контейнеров ----
  fs.mkdirSync(outDir, { recursive: true });
  const copy = (c) => {
    const d = path.join(outDir, 'pkgdb', c.dir);
    fs.mkdirSync(d, { recursive: true });
    const dst = path.join(d, c.file);
    log('копирую ' + c.dir + '/' + c.file + ' (' + (fs.statSync(c.path).size / 1048576).toFixed(0) + ' МБ)');
    fs.copyFileSync(c.path, dst);
    return { dir: d, dst, fd: fs.openSync(dst, 'r+') };
  };
  const tileOut = copy(tileC);
  const idxOut = tileC.path === idxC.path ? tileOut : copy(idxC);

  // ---- тайлы ----
  log('тайлы:');
  for (const c of codes) {
    for (const lvl of ['1', '2']) {
      const e = tileC.ents.find(x => x.name.indexOf('_' + c + '_' + lvl + '.xac') > 0);
      if (!e) { log('   ' + c + '_' + lvl + ': файла нет'); continue; }
      shiftTile(tileOut.fd, e, fldb.read(tileC.db, e), dx, dy, log);
    }
  }

  // ---- .xah: рамки уровней ----
  const secs = xac.sections(xah).list;
  const xb = xahEntry.offset;
  let rows = 0;
  for (const n of [1, 2, 3, 4]) {
    const s = secs.find(x => x.name === 'XAC-STRUKTUR L' + n);
    for (const gi of group) {
      const row = lv[n].rows[gi];
      if (row.empty) continue;
      const at = xb + s.offset + 24 + gi * 44;
      patchI32(idxOut.fd, at, row.bbox[0] + dx); patchI32(idxOut.fd, at + 4, row.bbox[1] + dy);
      patchI32(idxOut.fd, at + 8, row.bbox[2] + dx); patchI32(idxOut.fd, at + 12, row.bbox[3] + dy);
      rows++;
    }
  }
  log('.xah: рамок уровней сдвинуто ' + rows);

  // ---- .xah: соседи ----
  const ns = secs.find(x => x.name === 'NACHBARN');
  const inGroup = new Set(group);
  // Правится только направление «изнутри группы наружу»: перенесённый тайл не
  // должен тянуть движок обратно к старому месту. Обратные ссылки чужих тайлов
  // на группу остаются как есть — в исходных данных 586 таких пар с
  // несоприкасающимися рамками (паромы BE0R–UK00), то есть далёкая связь
  // структуру не нарушает. Длины записей не меняются: только подмена номера.
  let p = xb + ns.offset + 20 + 4, swaps = 0, kept = 0;
  for (let i = 0; i < nb.length; i++) {
    p += 2; // номер записи
    const used = new Set(nb[i]); // повторов в записи быть не должно
    for (const j of nb[i]) {
      if (inGroup.has(i) && !inGroup.has(j)) {
        const repl = group.find(g => g !== i && !used.has(g));
        if (repl !== undefined) {
          patchU16(idxOut.fd, p, repl); swaps++;
          used.delete(j); used.add(repl);
          log('   ' + order[i] + ' -> ' + order[j] + ' заменён на ' + order[repl]);
        } else {
          kept++;
          log('   ВНИМАНИЕ: ' + order[i] + ' -> ' + order[j] + ' оставлен: замены внутри группы нет');
        }
      } else if (!inGroup.has(i) && inGroup.has(j)) {
        kept++;
      }
      p += 2;
    }
    p += 2; // 0xFFFF
  }
  log('.xah: связей соседства переписано ' + swaps +
    (kept ? ', обратных ссылок на группу оставлено ' + kept + ' (как паромные)' : ''));

  // ---- .ras ----
  // В оригинальном наборе 254 тайла из 3777 не имеют ни одной ячейки растра:
  // ячейку забирает сосед, растр хранит один номер на ячейку, и VA00 с VA01
  // среди этих 254. Дописывать им ячейки на новом месте — единственная правка
  // переноса, которая создаёт ссылку, а не двигает существующую. Отключается
  // ключом --no-ras.
  if (noRas) {
    log('.ras: пропущен (--no-ras)');
  } else {
  const R = ras.load(fldb.read(idxC.db, rasEntry), rasEntry.name);
  let cells = 0, busy = 0;
  for (const gi of group) {
    const row = lv[1].rows[gi];
    const nbx = [row.bbox[0] + dx, row.bbox[1] + dy, row.bbox[2] + dx, row.bbox[3] + dy];
    ras.forBBox(R, nbx, (cx2, cy2, v) => {
      if (v !== ras.EMPTY) { busy++; return; }
      const at = rasEntry.offset + ras.HEAD + (cx2 * R.ny + cy2) * 2;
      patchU16(idxOut.fd, at, gi); cells++;
    });
  }
  log('.ras: ячеек записано ' + cells + (busy ? ', занятых пропущено ' + busy : ''));
  }

  // ---- суммы записей каталога FLDB ----
  // Правки внесены в файлы по месту, а у каждой записи каталога есть своя
  // контрольная сумма (+0x20). Без пересчёта движок отвергает блок при чтении
  // («CIFFDataBlock::CreateForDecoding: illegal Checksum») и инициализация
  // навигации замирает. Пересчитываем по актуальным данным для всех тронутых
  // файлов: тайлы в контейнере XAC3, а также .xah и .ras в XAC.
  const touched = [];
  for (const c of codes) for (const lvl of ['1', '2']) {
    const e = tileC.ents.find(x => x.name.indexOf('_' + c + '_' + lvl + '.xac') > 0);
    if (e) touched.push(fldb.refreshChecksum(tileOut.fd, e));
  }
  touched.push(fldb.refreshChecksum(idxOut.fd, xahEntry));
  touched.push(fldb.refreshChecksum(idxOut.fd, rasEntry));
  const changed = touched.filter(t => t.changed);
  log('суммы каталога: пересчитано ' + changed.length + ' из ' + touched.length +
    (changed.length ? ' (' + changed.map(t => t.name).join(', ') + ')' : ''));

  fs.closeSync(tileOut.fd);
  if (idxOut !== tileOut) fs.closeSync(idxOut.fd);

  // ---- .conf ----
  const done = new Set();
  for (const [c, o] of [[tileC, tileOut], [idxC, idxOut]]) {
    if (done.has(c.dir)) continue;
    done.add(c.dir);
    const conf = fs.readdirSync(path.join(root, 'pkgdb', c.dir)).find(f => f.endsWith('.conf'));
    rewriteConf(path.join(root, 'pkgdb', c.dir, conf), path.join(o.dir, conf), o.dst);
    log(c.dir + '/' + conf + ': MD5 пересчитан');
  }

  // сопутствующее: как в mkmin — неизменные файлы корня и мелкие устройства
  for (const f of ['DBInfo.txt', 'config.nfm', 'build1']) {
    if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(outDir, f));
  }
  const copyDir = d => {
    const from = path.join(root, 'pkgdb', d);
    if (!fs.existsSync(from)) return;
    const to = path.join(outDir, 'pkgdb', d);
    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(to, f));
  };
  const style = fs.readdirSync(path.join(root, 'pkgdb')).find(d => /^StyleDBMMI3G_/.test(d));
  if (style) copyDir(style);
  copyDir('NaviPersistence_ALL_3');

  return { dx, dy, components: [...done] };
}

module.exports = { relocate, shiftTile };

if (require.main === module) {
  const args = process.argv.slice(2);
  const outDir = args[0];
  const opt = k => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : null; };
  const tiles = (opt('--tiles') || '').split(',').filter(Boolean).map(s => s.toUpperCase());
  const anchor = (opt('--anchor') || tiles[0] || '').toUpperCase();
  const to = (opt('--to') || '').split(',').map(Number);
  if (!outDir || !tiles.length || to.length !== 2 || to.some(isNaN)) {
    console.error('использование: node src/relocate.js <каталог> --tiles VA00,VA01 --anchor VA01 --to <долгота>,<широта>');
    process.exit(1);
  }
  const r = relocate(outDir, tiles, anchor, to[0], to[1], m => console.log(m), args.includes('--no-ras'), args.includes('--zero'));
  console.log();
  console.log('готово:', outDir, ' компоненты:', r.components.join(', '));
  console.log('дальше: node src/mkmeta.js ' + outDir + ' --keep-pkg');
}
