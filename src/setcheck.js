'use strict';
// Сверка собранного набора перед поездкой к машине.
//
//   node src/setcheck.js out/cyp-set-named [--donor IS01]
//
// Проверяется только то, что можно проверить здесь: сходится ли реестр с
// настоящим файлом тайла, цела ли сквозная нумерация блоков, читаются ли
// рёбра и разделы имён. Установку это не заменяет, но ловит расхождения,
// которые на устройстве выглядели бы как молчаливый отказ навигации.

const fs = require('fs');
const path = require('path');
const fldb = require('./fldb');
const xac = require('./xac');
const st = require('./struktur');
const zen = require('./zenamen');
const xg = require('./xacgraph');

// Разделы тайла и их места в записи XAC-STRUKTUR (84 байта на тайл).
const REC = 84, REC_START = 24;
const PLACES = [['ZE-NAMEN', 0x14], ['ZE-NAMEN-MMI', 0x1c],
                ['HAUSNUMMERN', 0x24], ['LOCAL POIS', 0x2c], ['RASTERINFOS', 0x3c]];

function findContainer(root) {
  const pkgdb = path.join(root, 'pkgdb');
  for (const d of fs.readdirSync(pkgdb)) {
    if (!/^XAC/.test(d)) continue;
    for (const f of fs.readdirSync(path.join(pkgdb, d))) {
      if (!f.toLowerCase().endsWith('.db')) continue;
      const p = path.join(pkgdb, d, f);
      const db = fldb.open(p);
      const ents = fldb.entries(db);
      if (ents.some((e) => /[.]xah$/.test(e.name))) return { dir: d, file: f, path: p, db, ents };
    }
  }
  return null;
}

function check(root, donor) {
  const c = findContainer(root);
  if (!c) throw new Error('контейнер с общим индексом .xah не найден');
  const xahE = c.ents.find((e) => /[.]xah$/.test(e.name));
  const tileE = c.ents.find((e) => e.name.indexOf('_' + donor + '_1.xac') > 0);
  if (!tileE) throw new Error('тайл ' + donor + ' в наборе не найден');
  const xah = fldb.read(c.db, xahE), file = fldb.read(c.db, tileE);

  const order = [...st.parse(xah).keys()], gi = order.indexOf(donor);
  const secs = xac.sections(xah).list;
  const at = secs.find((x) => x.name === 'XAC-STRUKTUR').offset + REC_START + gi * REC;
  const S = xac.sections(file);
  const byName = (n) => S.list.find((x) => x.name === n);

  // реестр против файла
  const reg = [];
  for (const [name, off] of PLACES) {
    const sec = byName(name);
    const ro = xah.readUInt32BE(at + off), rl = xah.readUInt32BE(at + off + 4);
    const ok = sec ? (ro === sec.offset && rl === sec.total) : (ro === 0 && rl === 0);
    reg.push({ name, ok, reg: [ro, rl], file: sec ? [sec.offset, sec.total] : null });
  }

  // сквозная нумерация блоков и счётчик в XACDB HEADER
  const lv = st.parseLevels(xah);
  let running = 0, numErr = 0;
  for (let i = 0; i < order.length; i++) {
    for (const n of [1, 2, 3, 4]) {
      if (lv[n].rows[i].firstBlock !== running) numErr++;
      running += lv[n].rows[i].blockCount;
    }
  }
  const hdr = secs.find((x) => x.name === 'XACDB HEADER');
  const counter = xah.readUInt32BE(hdr.offset + 0x4c);

  // рёбра тайла
  const blocks = S.list.filter((x) => x.name === 'VEKTORBLOCK')
    .map((x) => file.subarray(x.offset, x.offset + x.total));
  const edges = xg.tileEdges(blocks);

  // разделы имён
  let names = null;
  const ze = byName('ZE-NAMEN'), mm = byName('ZE-NAMEN-MMI');
  if (ze) {
    const d = file.subarray(ze.offset, ze.offset + ze.total);
    const h = zen.header(d), an = zen.allNames(d, h), gr = zen.refGroups(d, h);
    const rows = mm ? zen.mmiTree(file.subarray(mm.offset, mm.offset + mm.total)) : [];
    let refs = 0;
    if (gr && !gr.err) for (const g of gr.groups) for (const x of g.names) refs += x.recs.length;
    names = {
      count: an.names.length, streamExact: an.end === an.len, err: an.err || (gr && gr.err),
      groups: gr ? gr.groups.length : 0, blocks: blocks.length,
      refsExact: gr ? gr.end === gr.len : false, refs,
      mmi: rows.length, roots: rows.filter((r) => r.parent === null).length,
      leaves: rows.filter((r) => r.leaf).length,
    };
  }

  return { donor, gi, container: c.dir, reg, regBad: reg.filter((r) => !r.ok).length,
           numErr, rows: order.length * 4, blockSum: running, counter,
           fldb: fldb.verify(c.db), edges: edges.edges.size, lost: edges.lost, names };
}

module.exports = { check };

if (require.main === module) {
  const args = process.argv.slice(2);
  const root = args[0];
  const flag = (n, d) => { const i = args.indexOf('--' + n); return i > 0 && args[i + 1] ? args[i + 1] : d; };
  if (!root) {
    console.error('использование: node src/setcheck.js <каталог-набора> [--donor IS01]');
    process.exit(1);
  }
  const r = check(root, (flag('donor', 'IS01')).toUpperCase());
  console.log('набор ' + root + ', компонент ' + r.container + ', тайл ' + r.donor +
              ' (номер ' + r.gi + ')');
  for (const x of r.reg) {
    console.log((x.ok ? '  ок   ' : '  СБОЙ ') + x.name.padEnd(13) +
      ' реестр ' + x.reg.join('/') + (x.file ? '   файл ' + x.file.join('/') : '   раздела нет'));
  }
  console.log('расхождений реестра с файлом: ' + r.regBad);
  console.log('firstBlock накопительный: ошибок ' + r.numErr + ' на ' + r.rows + ' строках; ' +
              'сумма ' + r.blockSum + (r.blockSum === r.counter ? ' = ' : ' != ') +
              'счётчик XACDB HEADER ' + r.counter);
  console.log('каталог FLDB: аномалий ' + r.fldb.anomalies);
  console.log('рёбра тайла: ' + r.edges + ', неразобранных ссылок ' + r.lost);
  if (r.names) {
    const n = r.names;
    console.log('имена: ' + n.count + ', поток съеден ' + (n.streamExact ? 'ровно' : 'НЕ РОВНО') +
      '; групп ' + n.groups + (n.groups === n.blocks ? ' = ' : ' != ') + 'блоков ' + n.blocks +
      ', область ссылок съедена ' + (n.refsExact ? 'ровно' : 'НЕ РОВНО') +
      ', ссылок ' + n.refs + (n.err ? ', ОШИБКА ' + n.err : ''));
    console.log('дерево: записей ' + n.mmi + ', корней ' + n.roots + ', листьев ' + n.leaves);
  }
  const bad = r.regBad || r.numErr || r.lost || r.fldb.anomalies ||
              (r.names && (!r.names.streamExact || !r.names.refsExact || r.names.err));
  console.log(bad ? 'ЕСТЬ РАСХОЖДЕНИЯ' : 'расхождений нет');
  process.exit(bad ? 1 : 0);
}
