'use strict';
// Контрольные суммы компонентов для metainfo2.txt.
// Использование:
//   node src/checksum.js <каталог набора>            сверить все компоненты
//   node src/checksum.js <каталог набора> --fix      пересчитать и записать
//
// Формула установлена на живом устройстве и проверена на компонентах
// LABEL, TMC, TER2 и XAC3:
//
//   File-запись : CRC-32 содержимого файла
//   Dir-запись  : CRC-32 склейки файлов каталога, порядок по имени
//                 без учёта регистра, не более CheckSumSize байт
//                 (в наборе везде 209 715 200, то есть 200 МБ)
//
// CRC-32 обычный: полином 0x04C11DB7, init и xorout 0xFFFFFFFF, отражённый —
// тот же, что в zip и zlib.
//
// filesize у Dir-записи — суммарный размер файлов каталога БЕЗ обрезания.
// Это единственные две величины, которые устройство сверяет при установке.

const fs = require('fs');
const path = require('path');
const z = require('zlib');
const dataset = require('./dataset');

const hex = v => (v >>> 0).toString(16).padStart(8, '0');
const CHUNK = 1 << 22;

function crcFile(p, limit) {
  const size = fs.statSync(p).size;
  const take = limit === undefined ? size : Math.min(size, limit);
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(Math.min(CHUNK, Math.max(take, 1)));
  let crc = 0, done = 0;
  while (done < take) {
    const n = Math.min(buf.length, take - done);
    fs.readSync(fd, buf, 0, n, done);
    crc = z.crc32(buf.subarray(0, n), crc);
    done += n;
  }
  fs.closeSync(fd);
  return { crc, size, taken: take };
}
// Суммы каталога. Правило выведено и проверено на нетронутом наборе — сходятся
// все 18 компонентов и все их куски (от 1 до 11 на компонент):
//
//   файлы в порядке имён без учёта регистра читаются ОДНИМ ПОТОКОМ, CRC копится
//   сквозь них; кусок закрывается, когда от ТЕКУЩЕГО файла прочитано
//   CheckSumSize байт; конец файла сбрасывает этот счётчик, но кусок не
//   закрывает. Первый кусок пишется в CheckSum, следующие — в CheckSum1, …
//
// Отсюда две неочевидности, на которых ломаются наивные модели:
//   * у GDB (большой файл первым) .conf попадает в ПОСЛЕДНИЙ кусок, а не в
//     первый — первый обрывается ровно на 200 МБ образа;
//   * у SDS (.conf сортируется первым) первый кусок ДЛИННЕЕ лимита: 478 байт
//     .conf плюс полные 200 МБ образа.
function crcDirChunks(dir, limit) {
  const names = fs.readdirSync(dir).sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));
  const L = (limit === undefined || limit === Infinity || !limit) ? Infinity : limit;
  const buf = Buffer.alloc(CHUNK);
  const crcs = [];
  let crc = 0, dirty = false, total = 0;
  for (const n of names) {
    const p = path.join(dir, n);
    const size = fs.statSync(p).size;
    total += size;
    const fd = fs.openSync(p, 'r');
    let off = 0;
    while (off < size) {
      // читаем не дальше ближайшей границы L, отсчитанной ОТ НАЧАЛА ЭТОГО файла
      const boundary = (L === Infinity) ? size : Math.min(size, Math.floor(off / L) * L + L);
      const k = fs.readSync(fd, buf, 0, Math.min(buf.length, boundary - off), off);
      if (k <= 0) break;
      crc = z.crc32(buf.subarray(0, k), crc);
      dirty = true;
      off += k;
      if (L !== Infinity && off % L === 0) { crcs.push(crc); crc = 0; dirty = false; }
    }
    fs.closeSync(fd);
  }
  if (dirty || crcs.length === 0) crcs.push(crc);
  return { crcs, crc: crcs[0], total, names };
}

// Разбор File- и Dir-записей из metainfo2.txt ветки релиза.
function components(metaPath) {
  const BS = String.fromCharCode(92);   // имена секций разделены обратным слэшем
  const lines = fs.readFileSync(metaPath, 'latin1').split(String.fromCharCode(10));
  const out = [];
  let cur = null;
  for (let raw of lines) {
    const L = raw.replace(String.fromCharCode(13), '');
    if (L.startsWith('[')) {
      if (cur) out.push(cur);
      const isDir = L.indexOf('default' + BS + 'Dir]') > 0, isFile = L.indexOf('default' + BS + 'File]') > 0;
      cur = (isDir || isFile) ? { section: L.trim(), kind: isDir ? 'dir' : 'file' } : null;
      continue;
    }
    if (!cur) continue;
    const i = L.indexOf('=');
    if (i < 0) continue;
    const k = L.slice(0, i).trim();
    let v = L.slice(i + 1).trim();
    if (v.startsWith('"')) v = v.slice(1, v.indexOf('"', 1) < 0 ? undefined : v.indexOf('"', 1));
    cur[k] = v;
  }
  if (cur) out.push(cur);
  return out.filter(c => c.source && c.CheckSum && c.CheckType !== 'skip');
}

if (require.main === module) {
  const root = dataset.resolveRoot(process.argv[2]);
  const fix = process.argv.includes('--fix');
  const release = ['MMI3G', 'MMI3GP', 'VW'].map(d => path.join(root, d, 'metainfo2.txt')).find(fs.existsSync);
  if (!release) throw new Error('metainfo2.txt ветки релиза не найден');

  console.log('набор  :', root);
  console.log('релиз  :', release);
  console.log();
  console.log('компонент                    ожидается  посчитано  размер            итог');

  let meta = fs.readFileSync(release, 'latin1');
  let bad = 0, fixed = 0;
  for (const c of components(release)) {
    // source задан относительно виртуального пути секции, поэтому ведущие
    // "../" отбрасываем и считаем путь от корня набора:
    // "../../../../../pkgdb/XAC3" -> "pkgdb/XAC3", "../../../../..//DBInfo.txt" -> "DBInfo.txt"
    let rel = c.source.split(String.fromCharCode(92)).join('/');
    while (rel.startsWith('../')) rel = rel.slice(3);
    while (rel.startsWith('/')) rel = rel.slice(1);
    const src = path.join(root, rel);
    if (!fs.existsSync(src)) { console.log('  ' + (c.DisplayName || c.section).padEnd(28) + 'источник не найден'); continue; }
    const limit = Number(c.CheckSumSize) || undefined;
    const r = c.kind === 'dir' ? crcDirChunks(src, limit)
      : (() => { const f = crcFile(src, limit); return { crcs: [f.crc], crc: f.crc, total: f.size }; })();
    const got = hex(r.crc);
    // в metainfo ведущий ноль иногда опущен, поэтому сравниваем численно
    const want = hex(parseInt(c.CheckSum, 16));
    // у каталога сумм несколько — по куску CheckSumSize каждая; правка в
    // глубине тома меняет не первую, так что сверяем все
    const badChunks = [];
    r.crcs.forEach((v, i) => {
      const key = 'CheckSum' + (i ? i : '');
      if (c[key] === undefined) return;
      if (hex(v) !== hex(parseInt(c[key], 16))) badChunks.push(key);
    });
    const sizeOk = String(r.total) === String(c.filesize);
    const ok = !badChunks.length && sizeOk;
    if (!ok) bad++;
    console.log('  ' + (c.DisplayName || c.section).padEnd(28) + want + '   ' + got + '   ' +
      String(r.total).padStart(12) + (sizeOk ? '' : ' (ожид. ' + c.filesize + ')') +
      '   ' + (ok ? 'ок' + (r.crcs.length > 1 ? ' (' + r.crcs.length + ' кусков)' : '')
                  : 'РАСХОЖДЕНИЕ' + (badChunks.length ? ' в ' + badChunks.join(',') : '')));
    if (fix && !ok) {
      meta = meta.split('CheckSum = "' + c.CheckSum + '"').join('CheckSum = "' + got + '"');
      meta = meta.split('filesize = "' + c.filesize + '"').join('filesize = "' + r.total + '"');
      fixed++;
    }
  }
  console.log();
  if (fix && fixed) {
    fs.writeFileSync(release, Buffer.from(meta, 'latin1'));
    console.log('исправлено записей:', fixed, '— файл', release, 'перезаписан');
  } else {
    console.log(bad ? 'расхождений: ' + bad + '  (запустите с --fix, чтобы пересчитать)' : 'все суммы и размеры сходятся');
  }
}
