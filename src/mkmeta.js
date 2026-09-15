'use strict';
// Манифест .pkg и metainfo2.txt для собранного набора.
// Использование: node src/mkmeta.js <каталог набора>
//
// Берёт оригинальные файлы за образец, выбрасывает секции компонентов,
// которых в наборе нет, пересчитывает CRC-32 и размеры, ставит в [common]
// ветки релиза три флага, снимающие проверки установки.
//
// Корневой metainfo2.txt копируется без изменений: он перечисляет оба релиза,
// и отсутствие каталога MMI3GP устройство переживает — так же, как переживает
// отсутствие каталогов компонентов чужой ветки в штатном наборе.

const fs = require('fs');
const path = require('path');
const z = require('zlib');
const dataset = require('./dataset');

// Штатный инструмент производителя ведущие нули не пишет: в оригинальном
// metainfo2.txt нет ни одного 8-значного значения, начинающегося с нуля, зато
// есть семизначные. Дополнение до 8 знаков дало бы строку, не совпадающую с
// оригинальной записью того же числа.
const hex = v => (v >>> 0).toString(16);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const BS = String.fromCharCode(92);
const Q = String.fromCharCode(34);
const CHUNK = 1 << 22;
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
function dirSums(dir, limit) {
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
  return { crcs: crcs.map(hex), crc: hex(crcs[0]), total };
}

// совместимость со старым вызовом: только первый кусок
function dirSum(dir, limit) {
  const r = dirSums(dir, limit);
  return { crc: r.crc, total: r.total };
}

function fileSum(p, limit) {
  const size = fs.statSync(p).size;
  const take = Math.min(size, limit);
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(Math.min(CHUNK, Math.max(take, 1)));
  let crc = 0, done = 0;
  while (done < take) {
    const k = Math.min(buf.length, take - done);
    fs.readSync(fd, buf, 0, k, done);
    crc = z.crc32(buf.subarray(0, k), crc);
    done += k;
  }
  fs.closeSync(fd);
  return { crc: hex(crc), total: size };
}

// Разбивает ini-подобный файл на блоки: заголовок секции плюс её строки.
function blocks(text) {
  const out = [];
  let cur = { head: null, lines: [] };
  for (const line of text.split(LF)) {
    if (line.replace(CR, '').startsWith('[')) {
      out.push(cur);
      cur = { head: line.replace(CR, '').trim(), lines: [line] };
    } else {
      cur.lines.push(line);
    }
  }
  out.push(cur);
  return out;
}

function rewriteRelease(text, present, root) {
  const bl = blocks(text);
  const kept = [];
  for (const b of bl) {
    const h = b.head;
    if (h === null) { kept.push(b); continue; }

    // Фильтруем только компоненты навигационной базы: [AUDI_..\ИМЯ\0\default\File|Dir].
    // Разделы других устройств — NaviPersistence, MapStyles, TMCConfig — оставляем
    // целиком, они к составу базы отношения не имеют.
    const parts = h.replace('[', '').replace(']', '').split(BS);
    const last = parts[parts.length - 1];
    const isNavComponent = parts.length >= 4 && parts[0].startsWith('AUDI_') &&
      (last === 'File' || last === 'Dir');
    if (isNavComponent && !present.has(parts[1])) continue;
    kept.push(b);
  }

  let outText = kept.map(b => b.lines.join(LF)).join(LF);

  // флаги в [common]: без них устройство не примет изменённые метаданные
  const need = ['EnableUserDefinedSWDLMode', 'skipMetaCRC', 'skipFileCopyCrc'];
  const add = need.filter(k => outText.indexOf(k) < 0)
    .map(k => k + ' = ' + Q + 'true' + Q + CR).join(LF);
  if (add) {
    const anchor = 'skipSaveTrainName = ' + Q + 'true' + Q + CR;
    if (outText.indexOf(anchor) < 0) throw new Error('не найдена строка skipSaveTrainName в [common]');
    outText = outText.replace(anchor, anchor + LF + add);
  }
  return outText;
}

function rewritePkg(text, present) {
  const lines = text.split(LF);
  const out = [];
  for (const raw of lines) {
    const L = raw.replace(CR, '');
    const fd = L.match(/^filedef=([A-Z0-9_]+)$/);
    const fc = L.match(/^fdefcrc=([A-Z0-9_]+),/);
    if (fd && !present.has(fd[1])) continue;
    if (fc && !present.has(fc[1])) continue;
    out.push(raw);
  }
  return out.join(LF);
}

module.exports = { dirSums, dirSum, fileSum };

if (require.main === module) {
  const outDir = process.argv[2];
  if (!outDir) { console.error('использование: node src/mkmeta.js <каталог набора>'); process.exit(1); }
  const root = dataset.resolveRoot();

  // какие компоненты реально лежат в наборе
  const dirs = fs.readdirSync(path.join(outDir, 'pkgdb')).filter(d =>
    fs.statSync(path.join(outDir, 'pkgdb', d)).isDirectory());
  const present = new Set(['PKG', 'SIG', 'DBInfo.txt', 'config.nfm']);
  for (const d of dirs) {
    const conf = fs.readdirSync(path.join(outDir, 'pkgdb', d)).find(f => f.endsWith('.conf'));
    if (!conf) continue;
    const t = fs.readFileSync(path.join(outDir, 'pkgdb', d, conf), 'latin1');
    const nm = (t.match(/name=([A-Z0-9_]+)/) || [])[1];
    if (nm) present.add(nm);
  }
  console.log('компоненты в наборе:', [...present].join(', '));

  // .pkg и подпись
  // Ключ --keep-pkg оставляет манифест оригинальным. Смысл: рядом лежит
  // .pkg.sig на 128 байт, то есть подпись RSA-1024. При установке она не
  // проверяется, но загрузчик базы может сверять её сам — тогда переписанный
  // манифест сделает базу невалидной («no valid acios_db found on HDD»).
  // С оригинальным манифестом подпись остаётся верной, зато он перечисляет
  // компоненты, которых в наборе нет.
  const keepPkg = process.argv.includes('--keep-pkg');
  const pkgName = fs.readdirSync(path.join(root, 'pkgdb')).find(f => /^MMI3G_.*[.]pkg$/.test(f));
  const pkgOrig = fs.readFileSync(path.join(root, 'pkgdb', pkgName), 'latin1');
  const pkg = keepPkg ? pkgOrig : rewritePkg(pkgOrig, present);
  fs.writeFileSync(path.join(outDir, 'pkgdb', pkgName), Buffer.from(pkg, 'latin1'));
  fs.copyFileSync(path.join(root, 'pkgdb', pkgName + '.sig'), path.join(outDir, 'pkgdb', pkgName + '.sig'));
  console.log('манифест           :', pkgName, pkg.length, 'б',
    keepPkg ? '— оригинальный, подпись сохранена' : '— переписан под состав набора');

  // корневой metainfo2.txt — без изменений
  fs.copyFileSync(path.join(root, 'metainfo2.txt'), path.join(outDir, 'metainfo2.txt'));

  // ветка релиза
  const relDir = path.join(outDir, 'MMI3G');
  fs.mkdirSync(relDir, { recursive: true });
  let rel = rewriteRelease(fs.readFileSync(path.join(root, 'MMI3G', 'metainfo2.txt'), 'latin1'), present, root);
  fs.writeFileSync(path.join(relDir, 'metainfo2.txt'), Buffer.from(rel, 'latin1'));

  // пересчёт сумм и размеров
  const src = require('./checksum');
  void src;
  let text = fs.readFileSync(path.join(relDir, 'metainfo2.txt'), 'latin1');
  const bl = blocks(text);
  let fixed = 0;
  for (const b of bl) {
    if (!b.head || b.head.indexOf(BS) < 0) continue;
    const get = k => {
      const m = b.lines.join(LF).match(new RegExp('^' + k + ' = ' + Q + '([^' + Q + ']*)', 'm'));
      return m ? m[1] : null;
    };
    const source = get('source'), checkType = get('CheckType');
    if (!source || checkType === 'skip') continue;
    let relPath = source.split(BS).join('/');
    while (relPath.startsWith('../')) relPath = relPath.slice(3);
    while (relPath.startsWith('/')) relPath = relPath.slice(1);
    const p = path.join(outDir, relPath);
    if (!fs.existsSync(p)) { console.log('   ! источник не найден:', relPath); continue; }
    const limit = Number(get('CheckSumSize')) || Infinity;
    const isDir = b.head.endsWith(BS + 'Dir]');
    const r = isDir ? dirSums(p, limit) : fileSum(p, limit);
    const oldCrc = get('CheckSum'), oldSize = get('filesize');
    // У каталога сумм несколько: CheckSum, CheckSum1, CheckSum2 … — по куску
    // CheckSumSize каждая. Правка в глубине тома меняет не первую из них,
    // поэтому сверять только CheckSum недостаточно.
    const crcs = isDir ? r.crcs : [r.crc];
    const changed = [];
    for (let i = 0; i < crcs.length; i++) {
      const key = 'CheckSum' + (i ? i : '');
      const old = get(key);
      if (old == null || old === crcs[i]) continue;
      text = text.split(key + ' = ' + Q + old + Q).join(key + ' = ' + Q + crcs[i] + Q);
      changed.push(key + ' ' + old + '->' + crcs[i]);
    }
    const sizeChanged = String(oldSize) !== String(r.total);
    if (sizeChanged) text = text.split('filesize = ' + Q + oldSize + Q).join('filesize = ' + Q + r.total + Q);
    if (changed.length || sizeChanged) {
      console.log('   пересчитан ' + (get('DisplayName') || relPath) +
        (changed.length ? ': ' + changed.join(', ') : '') +
        (sizeChanged ? ', размер ' + oldSize + ' -> ' + r.total : ''));
      fixed++;
    }
  }
  fs.writeFileSync(path.join(relDir, 'metainfo2.txt'), Buffer.from(text, 'latin1'));
  console.log('metainfo2.txt      :', text.length, 'б, пересчитано записей:', fixed);
  console.log();
  console.log('набор готов:', outDir);
}
