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

const hex = v => (v >>> 0).toString(16).padStart(8, '0');
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const BS = String.fromCharCode(92);
const Q = String.fromCharCode(34);
const CHUNK = 1 << 22;

// Те же правила, что в src/checksum.js: порядок имён без учёта регистра,
// каждый файл не более limit байт, на обрезанном файле обход кончается.
function dirSum(dir, limit) {
  const names = fs.readdirSync(dir).sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));
  let crc = 0, total = 0, stopped = false;
  for (const n of names) {
    const p = path.join(dir, n);
    const size = fs.statSync(p).size;
    total += size;
    if (stopped) continue;
    const take = Math.min(size, limit);
    const fd = fs.openSync(p, 'r');
    const buf = Buffer.alloc(Math.min(CHUNK, Math.max(take, 1)));
    let done = 0;
    while (done < take) {
      const k = Math.min(buf.length, take - done);
      fs.readSync(fd, buf, 0, k, done);
      crc = z.crc32(buf.subarray(0, k), crc);
      done += k;
    }
    fs.closeSync(fd);
    if (take < size) stopped = true;
  }
  return { crc: hex(crc), total };
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
    const r = isDir ? dirSum(p, limit) : fileSum(p, limit);
    const oldCrc = get('CheckSum'), oldSize = get('filesize');
    if (oldCrc !== r.crc || String(oldSize) !== String(r.total)) {
      text = text.split('CheckSum = ' + Q + oldCrc + Q).join('CheckSum = ' + Q + r.crc + Q);
      text = text.split('filesize = ' + Q + oldSize + Q).join('filesize = ' + Q + r.total + Q);
      console.log('   пересчитан ' + (get('DisplayName') || relPath) + ': ' + oldCrc + ' -> ' + r.crc +
        ', размер ' + oldSize + ' -> ' + r.total);
      fixed++;
    }
  }
  fs.writeFileSync(path.join(relDir, 'metainfo2.txt'), Buffer.from(text, 'latin1'));
  console.log('metainfo2.txt      :', text.length, 'б, пересчитано записей:', fixed);
  console.log();
  console.log('набор готов:', outDir);
}
