'use strict';
// Сверка собранного набора перед поездкой к машине.
//
//   node src/setcheck.js out/cyp-set-named [--donor IS01]
//
// Проверяется только то, что можно проверить здесь: сходится ли реестр с
// настоящим файлом тайла, цела ли сквозная нумерация блоков, читаются ли
// рёбра и разделы имён. Установку это не заменяет, но ловит расхождения,
// которые на устройстве выглядели бы как молчаливый отказ навигации.
//
// Если в наборе есть компоненты `GDB` и `LIT*`, проверяются и они — и именно
// из набора, а не из того, что было в памяти у сборщика:
//
//   GDB   том открывается штатным читателем: шапка, число уровней, сетка
//         каждого уровня, кластеры за границей области уровней;
//   LIT   спуск по дереву точек интереса от КОРНЯ всего дерева по рамке Кипра.
//         Собранные листья читаются машиной грамматики: разбор обязан
//         остановиться на метке конца блока, а всё, что за ней, — быть нулями
//         (наши блоки короче слотов и дополнены нулями, см. src/mklit.js).

const fs = require('fs');
const path = require('path');
const fldb = require('./fldb');
const xac = require('./xac');
const st = require('./struktur');
const zen = require('./zenamen');
const hn = require('./hausnr');
const zfn = require('./zfnamen');
const xg = require('./xacgraph');
const dataset = require('./dataset');
const litpoi = require('./litpoi');
const litvm = require('./litvm');
const ct = require('./cyptree');
const gm = require('./gdb');

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

  const ze = byName('ZE-NAMEN');

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
  const mm = byName('ZE-NAMEN-MMI');
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

  // дома: поток каждого имени обязан съедаться ровно, а ссылка — лежать в
  // области ссылок той же улицы
  let houses = null;
  const hs = byName('HAUSNUMMERN');
  if (hs && ze) {
    const d = file.subarray(hs.offset, hs.offset + hs.total);
    const h = hn.header(d);
    const zd = file.subarray(ze.offset, ze.offset + ze.total);
    const gr = zen.refGroups(zd, zen.header(zd));
    const own = new Map();
    if (gr && !gr.err) {
      for (const g of gr.groups) {
        for (const x of g.names) {
          if (!own.has(x.nid)) own.set(x.nid, new Set());
          for (const r of x.recs) own.get(x.nid).add(g.block + ':' + r);
        }
      }
    }
    let names = 0, rows = 0, refs = 0, inRefs = 0, exact = 0, bad = 0;
    for (let k = 0; k + 1 < h.count; k++) {
      const a = hn.at(d, h, k), b = hn.at(d, h, k + 1);
      if (a === b) continue;
      names++;
      const r = hn.housesOf(d, k, h);
      if (!r) { bad++; continue; }
      if (r.end === h.data.off + b) exact++; else bad++;
      rows += r.rows.length;
      for (const x of r.rows) {
        for (const v of x.refs) {
          refs++;
          if (own.get(k) && own.get(k).has(v.block + ':' + v.rec)) inRefs++;
        }
      }
    }
    houses = { section: hs.total, indexOk: h.count === zen.header(zd).index.names + 1,
               names, rows, refs, inRefs, exact, bad };
  }

  // имена ведения: поток обязан разобраться и дать столько же имён, сколько
  // обещает шапка
  let guide = null;
  const zs = byName('ZF-NAMEN');
  if (zs && zs.total > 0x4c) {
    const d = file.subarray(zs.offset, zs.offset + zs.total);
    if (d.readUInt32BE(0x30) === 0) zs.empty = true;          // заглушка «имён нет»
  }
  if (zs && !zs.empty && zs.total > 0x4c) {
    const d = file.subarray(zs.offset, zs.offset + zs.total);
    try {
      const r = zfn.readSection(d, zfn.tokens(xah));
      guide = r && { section: zs.total, count: r.count, parsed: r.names.length,
                     err: r.err || null, sample: r.names.slice(0, 4).map((x) => x.text) };
    } catch (e) { guide = { section: zs.total, err: e.message, count: 0, parsed: 0, sample: [] }; }
  }

  return { donor, gi, container: c.dir, reg, regBad: reg.filter((r) => !r.ok).length, houses, guide,
           numErr, rows: order.length * 4, blockSum: running, counter,
           fldb: fldb.verify(c.db), edges: edges.edges.size, lost: edges.lost, names };
}

// Рамка Кипра. Точки за её пределами — не сбой: в кипрском извлечении OSM
// есть паромные терминалы на турецком берегу (Анамур, переправа на север
// острова), они и выходят наружу. Поэтому считаются отдельно, а не в ошибки.
const CYP = { lon0: 32.2, lat0: 34.5, lon1: 34.7, lat1: 35.8 };
const LIT_VOLS = ['LIT', 'LIT2', 'LIT3', 'LIT4'];

// Точки интереса: спуск от корня дерева по рамке Кипра идёт ПО НАБОРУ.
// Тома, которых в наборе нет, берутся заводские — адресное пространство LIT
// сквозное через все четыре, и без них каталог не прочитать.
// Свой контейнер отличается от заплаты тем, что самодостаточен: последний блок
// каталога кончается внутри файла, и склеивать его не с чем. Тогда и спуск
// идёт от блока 0 — корня нашего дерева, а не от заводского корня (101099, 1).
function checkOwnLit(file) {
  const litfile = require('./litfile');
  const S = require('./litschema');
  const raw = fs.readFileSync(file);
  const at = raw.indexOf(Buffer.from([0x4c, 0x69, 0x74, 0x02]));
  if (at < 0) return null;
  const m = litfile.read(raw.subarray(at));
  const last = m.catalog[m.catalog.length - 1];
  if (!last || last.off + last.size !== raw.length - at) return null;   // не самодостаточен
  const schema = S.load(file, at);

  const cache = new Map();
  const get = (i) => {
    if (cache.has(i)) return cache.get(i);
    const b = m.blocks[i];
    let recs = [];
    try { recs = litvm.run(schema, b, 0, { blk: i, limit: 4000000 }).records; } catch (e) { /* пусто */ }
    const v = { origin: { x: b.readInt32BE(4), y: b.readInt32BE(8) }, elems: litpoi.elemsOf(recs) };
    cache.set(i, v);
    return v;
  };

  let pois = 0, inside = 0, stops = 0;
  const bad = [];
  for (let i = 1; i < m.blocks.length; i++) {
    const r = litvm.run(schema, m.blocks[i], 0, { blk: i, limit: 4000000 });
    if (r.why === 'данные кончились' && r.pos === m.blocks[i].length) stops++;
    else bad.push(i + ': ' + r.why + ' на ' + r.pos + ' из ' + m.blocks[i].length);
    for (const x of litpoi.poisOf(schema, m.blocks[i], i)) {
      pois++;
      if (x.lon >= CYP.lon0 && x.lon <= CYP.lon1 && x.lat >= CYP.lat0 && x.lat <= CYP.lat1) inside++;
    }
  }
  // спуск от корня по рамке вокруг каждой сотой точки
  let seen = 0, hit = 0;
  for (let i = 1; i < m.blocks.length; i++) {
    const list = litpoi.poisOf(schema, m.blocks[i], i);
    for (let k = 0; k < list.length; k += 100) {
      const q = list[k]; seen++;
      const x = Math.round(q.lon * 72000), y = Math.round(q.lat * ct.DEG);
      const got = ct.collect(get, 0, 0, { x0: x - 72, y0: y - 111, x1: x + 72, y1: y + 111 },
                             new Set(), 0);
      if (got.has(i)) hit++;
    }
  }
  return { own: true, blocks: m.blocks.length, leaves: m.blocks.length - 1,
           stops, pois, inside, seen, hit, bad };
}

function checkLit(root) {
  const mine = LIT_VOLS.filter((d) => fs.existsSync(path.join(root, 'pkgdb', d)));
  if (!mine.length) return null;
  // сперва проверяем, не свой ли это контейнер целиком
  const dir = path.join(root, 'pkgdb', mine[0]);
  const f = fs.readdirSync(dir).find((x) => /\.db$/i.test(x));
  if (f) {
    const own = checkOwnLit(path.join(dir, f));
    if (own) return Object.assign({ vols: mine }, own);
  }
  const base = dataset.resolveRoot();
  const dirs = LIT_VOLS.map((d) => (fs.existsSync(path.join(root, 'pkgdb', d))
    ? path.join(root, 'pkgdb', d) : path.join(base, 'pkgdb', d)));
  const P = litpoi.open(dirs);
  const cat = P.catalog();
  const q = { x0: Math.round(CYP.lon0 * 72000), y0: Math.round(CYP.lat0 * ct.DEG),
              x1: Math.round(CYP.lon1 * 72000), y1: Math.round(CYP.lat1 * ct.DEG) };
  const leaves = [...ct.collect((i) => P.get(i), ct.TREE.block, ct.TREE.key, q, new Set(), 0)];
  let pois = 0, inside = 0, stops = 0, zeroTail = 0, bad = [];
  for (const blk of leaves) {
    const b = P.lit.block(cat[blk]);
    const r = litvm.run(P.schema, b, 0, { blk, limit: 4000000 });
    const stopped = r.why === 'данные кончились' || r.why === 'конец (0x11 без цели)';
    if (stopped) stops++; else bad.push(blk + ': ' + r.why);
    let zero = true;
    for (let i = r.pos; i < b.length; i++) if (b[i] !== 0) { zero = false; break; }
    if (zero) zeroTail++; else bad.push(blk + ': за концом разбора не нули');
    for (const x of P.pois(blk)) {
      pois++;
      if (x.lon >= CYP.lon0 && x.lon <= CYP.lon1 && x.lat >= CYP.lat0 && x.lat <= CYP.lat1) inside++;
    }
  }
  P.lit.vols.forEach((v) => fs.closeSync(v.fd));
  return { vols: mine, leaves: leaves.length, stops, zeroTail, pois, inside, bad };
}

// Том отрисовки: открывается тем же читателем, что и заводской.
function checkGdb(root) {
  const dir = path.join(root, 'pkgdb', 'GDB');
  if (!fs.existsSync(dir)) return null;
  const f = fs.readdirSync(dir).find((x) => /\.gdb$/i.test(x));
  if (!f) return null;
  const g = gm.openBuffer(fs.readFileSync(path.join(dir, f)), null);
  const h = gm.header(g);
  const levels = [];
  for (let i = 0; i < h.levels.length; i++) {
    const gr = gm.levelGrid(g, h, h.levels[i]);
    if (!gr) continue;
    const real = gr.entries.filter((e) => e.sz && e.off >= h.regionEnd).length;
    levels.push({ nr: i, W: gr.W, H: gr.H, ok: gr.gridOk, n: gr.gridN, clusters: real });
  }
  return { file: f, sig: h.sig, version: h.version, nLevels: h.nLevels, levels,
           bad: levels.filter((l) => l.ok !== l.n).length };
}

module.exports = { check, checkLit, checkGdb };

if (require.main === module) {
  const args = process.argv.slice(2);
  const root = args[0];
  const flag = (n, d) => { const i = args.indexOf('--' + n); return i > 0 && args[i + 1] ? args[i + 1] : d; };
  if (!root) {
    console.error('использование: node src/setcheck.js <каталог-набора> [--donor IS01]');
    process.exit(1);
  }
  // Компонента XAC в наборе может не быть (образ только с точками интереса
  // или только с отрисовкой) — тогда проверяется то, что есть.
  const pkgdb = path.join(root, 'pkgdb');
  const hasXac = fs.existsSync(pkgdb) && fs.readdirSync(pkgdb).some((d) => /^XAC/.test(d));
  const r = hasXac ? check(root, (flag('donor', 'IS01')).toUpperCase()) : null;
  if (!r) console.log('набор ' + root + ': компонента XAC нет, проверяю остальное');
  if (r) {
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
  if (r.guide) {
    const g = r.guide;
    console.log('имена ведения: раздел ' + g.section + ' б, в шапке ' + g.count +
      ', разобрано из потока ' + g.parsed + (g.err ? ', ОШИБКА ' + g.err : '') +
      (g.sample.length ? ' — ' + g.sample.join(' | ') : ''));
  }
  if (r.houses) {
    const x = r.houses;
    console.log('дома: раздел ' + x.section + ' б, записей индекса по именам: ' +
      (x.indexOk ? 'сходится' : 'НЕ СХОДИТСЯ') + '; имён с домами ' + x.names +
      ', записей ' + x.rows + ', поток съеден ровно у ' + x.exact + ', сбоев ' + x.bad);
    console.log('ссылок домов ' + x.refs + ', из них в области ссылок своей улицы ' + x.inRefs);
  }
  if (r.names) {
    const n = r.names;
    console.log('имена: ' + n.count + ', поток съеден ' + (n.streamExact ? 'ровно' : 'НЕ РОВНО') +
      '; групп ' + n.groups + (n.groups === n.blocks ? ' = ' : ' != ') + 'блоков ' + n.blocks +
      ', область ссылок съедена ' + (n.refsExact ? 'ровно' : 'НЕ РОВНО') +
      ', ссылок ' + n.refs + (n.err ? ', ОШИБКА ' + n.err : ''));
    console.log('дерево: записей ' + n.mmi + ', корней ' + n.roots + ', листьев ' + n.leaves);
  }
  }
  const gdb = checkGdb(root);
  if (gdb) {
    console.log('GDB: ' + gdb.file + ', ' + gdb.sig + ' версия ' + gdb.version +
                ', уровней ' + gdb.nLevels);
    for (const l of gdb.levels) {
      console.log('  L' + String(l.nr).padStart(2) + ': сетка ' + l.W + '×' + l.H +
                  ', слоты ' + l.ok + '/' + l.n + ', кластеров с данными ' + l.clusters);
    }
  }
  const poi = checkLit(root);
  if (poi && poi.own) {
    console.log('POI (' + poi.vols.join(', ') + ', свой контейнер): блоков ' + poi.blocks +
                ' — узлы и ' + poi.leaves + ' листьев, разбор дочитан до конца у ' + poi.stops);
    console.log('точек ' + poi.pois + ', из них в рамке Кипра ' + poi.inside +
                '; спуск от корня: проверено ' + poi.seen + ', свой лист найден у ' + poi.hit);
    for (const b of poi.bad.slice(0, 5)) console.log('  СБОЙ ' + b);
  } else if (poi) {
    console.log('POI (' + poi.vols.join(', ') + '): спуск от корня по рамке Кипра дал листьев ' +
                poi.leaves + ', разбор остановлен штатно у ' + poi.stops +
                ', хвост за разбором нулевой у ' + poi.zeroTail);
    console.log('точек в собранных листьях ' + poi.pois + ', из них в рамке Кипра ' + poi.inside +
                (poi.pois > poi.inside ? ', за рамкой ' + (poi.pois - poi.inside) +
                 ' (паромные терминалы на турецком берегу)' : ''));
    for (const b of poi.bad.slice(0, 5)) console.log('  СБОЙ ' + b);
  }
  const bad = (gdb && gdb.bad) ||
              (poi && (poi.bad.length || !poi.leaves || !poi.inside ||
                       (poi.own && (poi.stops !== poi.leaves || poi.hit !== poi.seen)))) ||
              (r && (r.regBad || r.numErr || r.lost || r.fldb.anomalies ||
              (r.names && (!r.names.streamExact || !r.names.refsExact || r.names.err)) ||
              (r.houses && (r.houses.bad || !r.houses.indexOk ||
                            r.houses.refs !== r.houses.inRefs)) ||
              (r.guide && (r.guide.err || r.guide.parsed !== r.guide.count))));
  console.log(bad ? 'ЕСТЬ РАСХОЖДЕНИЯ' : 'расхождений нет');
  process.exit(bad ? 1 : 0);
}
