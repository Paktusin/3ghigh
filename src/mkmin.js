'use strict';
// Сборка минимального набора: одна страна вместо сорока шести.
//
// Использование:
//   node src/mkmin.js <код> <номер справочника> <каталог> [--gdb] [--ras]
//   node src/mkmin.js MJ 42 out/min-malta
//
// Код страны и номер справочника .ort берутся из таблицы покрытия
// (node src/countries.js): у Мальты это MJ и 42.
//
// Общий индекс .xah кладётся БЕЗ изменений. Это сознательно: число тайлов,
// таблица смежности NACHBARN, группы и счётчики внутри него остаются
// согласованными сами с собой. Смысл опыта — узнать, терпит ли загрузчик
// отсутствие файлов, на которые индекс ссылается.
//
// DBInfo.txt и config.nfm копируются побайтно: к идентификатору базы привязана
// активация FSC, менять его нельзя.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fldb = require('./fldb');
const dataset = require('./dataset');

const ALIGN = 2048;
const align = n => Math.ceil(n / ALIGN) * ALIGN;
const md5 = b => crypto.createHash('md5').update(b).digest('hex');
const CRLF = String.fromCharCode(13) + String.fromCharCode(10);
const Q = String.fromCharCode(34);

// Контейнер FLDB из готовых файлов. Шапка берётся у образца.
function assemble(headSrc, files) {
  const head = Buffer.from(headSrc.subarray(0, fldb.DIR_OFFSET));
  head.writeUInt32LE(files.length, 0x0c);
  // набор становится единственным, а не одним из трёх
  const info = head.toString('latin1');
  const patched = info.split('DB=1/3').join('DB=1/1');
  if (patched !== info) Buffer.from(patched, 'latin1').copy(head, 0);

  const dirEnd = fldb.DIR_OFFSET + files.length * fldb.ENTRY_SIZE;
  let pos = align(dirEnd);
  const placed = files.map(f => {
    const at = pos;
    pos = align(pos + f.data.length);
    return { f, at };
  });

  const out = Buffer.alloc(pos, 0);
  head.copy(out, 0);
  placed.forEach((p, i) => {
    const o = fldb.DIR_OFFSET + i * fldb.ENTRY_SIZE;
    out.writeUInt32LE(p.at, o);
    out.writeUInt32LE(p.f.data.length, o + 4);
    out.write(p.f.name, o + 8, 24, 'latin1');
    // сумму переносим как есть: алгоритм не опознан, при установке не проверяется
    out.writeUInt32LE(p.f.checksum || 0, o + 32);
    p.f.data.copy(out, p.at);
  });
  return out;
}

function makeConf(defName, type, version, fileName, data, checkcrc) {
  const qa = md5(data.subarray(0, 102400));
  return [
    'UTF-8', '',
    '[filedef]', '# file definition name', 'name=' + defName, '',
    '# Version', 'version=' + version, '',
    '# File type', 'type=' + type, '',
    '# Meta description', 'description=' + Q + 'none' + Q, '',
    '# filenames', '[file]',
    'name=' + fileName,
    'size=' + data.length,
    'media=IsoImage',
    'MD5=' + md5(data) + ' ',
    '#quick check information for the file, md5 checksums',
    'check=qa,100,' + qa + ',' + qa + ',' + qa, '',
    'checkcrc=' + checkcrc,
    '[/file]', '[/filedef]', '',
  ].join(CRLF);
}

function build(code, ortIndex, outDir, opts) {
  const root = dataset.resolveRoot();
  const containers = ['XAC', 'XAC2', 'XAC3'].map(d => {
    const dir = path.join(root, 'pkgdb', d);
    const name = fs.readdirSync(dir).find(x => x.endsWith('.db'));
    return { d, dir, name, db: fldb.open(path.join(dir, name)) };
  });

  const picked = [];
  const seen = new Set();
  const take = (c, e) => {
    if (seen.has(e.name)) return;
    seen.add(e.name);
    picked.push({ name: e.name, data: fldb.read(c.db, e), checksum: e.checksum, from: c.d });
  };

  let tiles = 0;
  for (const c of containers) {
    for (const e of fldb.entries(c.db)) {
      if (/[.]xah$/.test(e.name)) { take(c, e); continue; }
      if (/[.]ras$/.test(e.name)) { if (opts.ras) take(c, e); continue; }
      const idx = e.name.match(/_([0-9]+)[.](ort|plz|poi)$/);
      if (idx) { if (Number(idx[1]) === ortIndex) take(c, e); continue; }
      const lvl = e.name.match(/_([0-9]+)_[34][.][bv]$/);
      if (lvl) { if (Number(lvl[1]) === ortIndex) take(c, e); continue; }
      if (e.name.indexOf('_' + code) > 0 && /[.]xac$/.test(e.name)) { take(c, e); tiles++; }
    }
  }
  if (!tiles) throw new Error('тайлов страны ' + code + ' не найдено');

  picked.sort((a, b) => (a.name < b.name ? -1 : 1));

  const src = containers[0];
  const headBuf = Buffer.alloc(fldb.DIR_OFFSET);
  fs.readSync(src.db.fd, headBuf, 0, headBuf.length, 0);
  const container = assemble(headBuf, picked);

  // ---- раскладка ----
  fs.mkdirSync(outDir, { recursive: true });
  const mk = p => {
    const full = path.join(outDir, p);
    fs.mkdirSync(full, { recursive: true });
    return full;
  };
  for (const f of ['DBInfo.txt', 'config.nfm', 'build1']) {
    fs.copyFileSync(path.join(root, f), path.join(outDir, f));
  }

  const xacOut = mk('pkgdb/XAC');
  fs.writeFileSync(path.join(xacOut, src.name), container);
  const oldConf = fs.readFileSync(path.join(src.dir, 'XAC.conf'), 'latin1');
  const oldCrc = (oldConf.match(/checkcrc=([0-9a-f]+)/) || [])[1] || '00000000';
  fs.writeFileSync(path.join(xacOut, 'XAC.conf'),
    Buffer.from(makeConf('XAC_ECE', 'XAC', '6.36.0', src.name, container, oldCrc), 'latin1'));

  const components = ['XAC'];
  const copyDir = d => {
    const from = path.join(root, 'pkgdb', d);
    if (!fs.existsSync(from)) return false;
    const to = mk('pkgdb/' + d);
    for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(to, f));
    return true;
  };
  for (const d of ['LABEL', 'TMC']) if (copyDir(d)) components.push(d);
  if (opts.gdb && copyDir('GDB')) components.push('GDB');
  // стили и скрипт после установки — отдельные устройства, но файлы нужны на носителе
  const style = fs.readdirSync(path.join(root, 'pkgdb')).find(d => /^StyleDBMMI3G_/.test(d));
  if (style) copyDir(style);
  copyDir('NaviPersistence_ALL_3');

  return { picked, container, components, src, root, tiles };
}

module.exports = { build, assemble, makeConf, align };

if (require.main === module) {
  const code = (process.argv[2] || '').toUpperCase();
  const ortIndex = Number(process.argv[3]);
  const outDir = process.argv[4];
  if (!code || !Number.isInteger(ortIndex) || !outDir) {
    console.error('использование: node src/mkmin.js <код> <номер справочника> <каталог> [--gdb] [--ras]');
    process.exit(1);
  }
  const opts = { gdb: process.argv.includes('--gdb'), ras: process.argv.includes('--ras') };
  const r = build(code, ortIndex, outDir, opts);

  const total = r.picked.reduce((s, p) => s + p.data.length, 0);
  console.log('страна          :', code, ' тайлов:', r.tiles, ' справочник #' + ortIndex);
  console.log('файлов в XAC    :', r.picked.length, ' данных', (total / 1048576).toFixed(2), 'МБ');
  for (const p of r.picked) {
    console.log('   ' + p.name.padEnd(22) + String(p.data.length).padStart(10) + ' б   из ' + p.from);
  }
  console.log('контейнер       :', r.container.length, 'б');
  console.log('компоненты      :', r.components.join(', '));
  console.log('каталог         :', outDir);
  console.log();
  console.log('дальше: node src/mkmeta.js ' + outDir + ' — манифест и metainfo2.txt');
}
