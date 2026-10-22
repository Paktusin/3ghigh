'use strict';
// Сверка собранного набора перед поездкой к машине.
//
//   node src/setcheck.js out/cyprus [--donor CY01]
//
// Без `--donor` проверяются все тайлы набора и связи между ними (`checkTiles`).
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
//   LIT   спуск по дереву точек интереса от КОРНЯ всего дерева по рамке Кипра;
//         у своего контейнера — ещё и обход адресов страна -> город -> улица.
//         Собранные листья читаются машиной грамматики: разбор обязан
//         остановиться на метке конца блока, а всё, что за ней, — быть нулями
//         (у прежней заплаты блоки были короче слотов и добиты нулями).

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
  // Читатель графа знает блоки версии 5. У заводских тайлов бывают и другие
  // версии, и тогда рёбра просто не читаются — это не расхождение набора.
  let edges;
  try { edges = xg.tileEdges(blocks); }
  catch (e) { edges = { edges: new Set(), lost: 0, err: e.message }; }

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
           fldb: fldb.verify(c.db), edges: edges.edges.size, lost: edges.lost,
           edgesErr: edges.err || null, names };
}

// Связи тайлов между собой — то, чего не видно по одному тайлу:
//   * шапка тайла (+0x4c) и блоки (0x34, 0x36) согласны с реестром, рамка
//     строки L1 = рамке шапки (так у завода);
//   * `.ras` и `RASTERINFOS` каждого тайла: ячейка отдана тайлу в `.ras` <=>
//     в его маске 0 (сверка как по заводу, docs/formats/xac.md);
//   * нульвекторы: пара 1 ведёт в соседа по `NACHBARN`, в блок уровня 1,
//     узел-цель с той же координатой, у него нульвектор обратно в наш узел,
//     и у обеих копий ровно по одной записи (так у завода, 438 из 438).
function checkTiles(root) {
  const c = findContainer(root);
  const xah = fldb.read(c.db, c.ents.find((e) => /[.]xah$/.test(e.name)));
  const order = [...st.parse(xah).keys()], lv = st.parseLevels(xah);
  const nb = st.parseNeighbors(xah);
  const attr = require('./xacrec').attributes(xah);
  const nv = require('./nullvec'), raster = require('./raster'), ras = require('./rasidx'), xt = require('./xactile');
  const whose = nv.blockIndex(xah, order);
  const R = ras.load(fldb.read(c.db, c.ents.find((e) => /[.]ras$/.test(e.name))), 'ras');
  const r = { tiles: order.length, head: 0, cells: 0, cellBad: 0, orphan: 0, links: 0, nbBad: 0,
              levelBad: 0, coordBad: 0, backBad: 0, degBad: 0 };
  const tiles = order.map((code, t) => {
    const buf = fldb.read(c.db, c.ents.find((e) => e.name.indexOf('_' + code + '_1.xac') > 0));
    const S = xac.sections(buf).list, row = lv[1].rows[t];
    const blocks = S.filter((x) => x.name === 'VEKTORBLOCK').map((x) => buf.subarray(x.offset, x.offset + x.total));
    const h = xt.readTile(buf);
    const ok = h.index === t && h.bbox.join() === row.bbox.map((v) => v | 0).join() &&
      blocks.every((b, k) => b.readUInt16BE(0x36) === row.firstBlock && b.readUInt16BE(0x34) === row.firstBlock + k);
    if (!ok) r.head++;
    const ri = S.find((x) => x.name === 'RASTERINFOS');
    const m = raster.parseRaster(buf.subarray(ri.offset, ri.offset + ri.total));
    for (let cx = 0; cx < m.nx; cx++) for (let cy = 0; cy < m.ny; cy++) {
      r.cells++;
      const v = ras.lookup(R, m.bbox[0] + cx * 1000 + 500, m.bbox[1] + cy * 1000 + 500);
      if ((v === t) !== (m.cells[cx * m.ny + cy] === 0)) r.cellBad++;
    }
    return { blocks, graphs: blocks.map((b) => withLinks(b, xg.graphOf(b), attr, nv)), m };
  });
  // каждая занятая ячейка .ras лежит в сетке своего тайла
  for (let cx = 0; cx < R.nx; cx++) for (let cy = 0; cy < R.ny; cy++) {
    const v = ras.get(R, cx, cy);
    if (v === ras.EMPTY) continue;
    const m = tiles[v] && tiles[v].m, x = R.bbox[0] + cx * 1000, y = R.bbox[1] + cy * 1000;
    if (!m || x < m.bbox[0] || y < m.bbox[1] || x >= m.bbox[0] + m.nx * 1000 || y >= m.bbox[1] + m.ny * 1000) r.orphan++;
  }
  // нульвекторы; узел -> его первый номер в таблице
  const first = (g, ni) => g.entryNode.indexOf(ni);
  tiles.forEach((T, t) => T.graphs.forEach((g, bi) => g.nodes.forEach((n, ni) => {
    for (const q of n.links) {
      r.links++;
      const w = whose(q.block);
      if (!w || w.level !== 1 || q.level !== 1) { r.levelBad++; continue; }
      const u = order.indexOf(w.code);
      if (nb[t].indexOf(u) < 0) r.nbBad++;
      const tb = tiles[u].blocks[w.local], tg = tiles[u].graphs[w.local];
      const got = nv.resolve(tb, q.ref);
      if (!got || got.c.x !== n.x || got.c.y !== n.y) { r.coordBad++; continue; }
      const tw = tg.nodes.find((x) => x.off === got.at);
      const back = tw && tw.links.find((l) => l.level === 1);
      if (!back || back.block !== lv[1].rows[t].firstBlock + bi || back.ref !== 2 * first(g, ni)) r.backBad++;
      if (n.entries.length !== 1 || !tw || tw.entries.length !== 1) r.degBad++;
    }
  })));
  r.bad = r.head + r.cellBad + r.orphan + r.nbBad + r.levelBad + r.coordBad + r.backBad + r.degBad;
  return r;
}

// Нульвекторы узлов. Ищутся так, как их находит обходчик прошивки: за
// последней записью узла (номера записей — по таблице блока). Разбор блока
// подряд (`xacwrite.readBlock`) для этого не годится: слово 0x8xxx
// (встречная ссылка в другой блок) он не знает и дальше списка не идёт.
function withLinks(b, g, attr, nv) {
  const tab = b.readUInt32BE(0x6c), last = new Int32Array(g.nodes.length).fill(-1);
  g.entryNode.forEach((ni, i) => { if (ni >= 0) last[ni] = i; });
  g.nodes.forEach((n, ni) => {
    n.links = [];
    if (last[ni] < 0) return;
    const p = b.readUInt16BE(tab + last[ni] * 2) * 2, k = b.readUInt16BE(p) >>> 14;
    // слово 0x0xxx — узел без записей: таблица указывает прямо за координату
    const end = k === 1 ? p + 2 : k === 2 ? p + 4 : k === 3 ? require('./xacrec').record(b, p, attr, () => {}).end : p;
    if (end + 14 <= tab && b.readUInt16BE(end) === 0) n.links = nv.pairs(b, end, nv.wideMask(b)).list.filter(Boolean);
  });
  return g;
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
  if (!last) return null;
  // Самодостаточен, если последний блок каталога кончается внутри файла. Хвост
  // допускается только выравнивающий: контейнер FLDB дополняет файл до границы
  // 2048, и у заводского тома этого хвоста нет — там за концом идёт следующий том.
  const tail = (raw.length - at) - (last.off + last.size);
  if (tail < 0 || tail >= 2048) return null;
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

  // Раскладка: с адресным справочником в (0,0) лежит корень 0x01, и дерево POI
  // ищется путём прошивки — корень 0x4a -> заголовок 0x20 -> слой 0x21 (ключ 0),
  // корень дерева — ключ 1. Без справочника корень дерева — (0,0).
  const KS = require('./litkeys');
  const keyed = (i) => KS.keyed(schema, m.blocks[i], i);
  const g0 = keyed(0);
  const rootRec = g0.els[0];
  let start = { blk: 0, key: 0 }, addr = null, poiPath = null;
  let starts = [start];
  if (rootRec && rootRec.type === 1) {
    const h = rootRec.f['4a'];
    // все слои шапки 0x20 (у завода их 10): у каждого — заголовок 0x21 и корень (блок, 1)
    const roots = h && h[0] >= 0
      ? [...new Set(keyed(h[0]).els.filter((e) => e.f['3c']).map((e) => e.f['3c'][0]))] : [];
    poiPath = roots.length > 0 && roots.every((b) => keyed(b).els[0].type === 0x21);
    if (poiPath) { starts = roots.map((b) => ({ blk: b, key: 1 })); start = starts[0]; }
    const cache = new Map();
    const get = (i) => {
      if (!cache.has(i)) { const g = keyed(i); g.map = KS.index(g.els); cache.set(i, g); }
      return cache.get(i);
    };
    addr = require('./litaddr').walk(get);
  }

  let pois = 0, inside = 0, stops = 0, leaves = 0;
  const bad = [], leafBlks = [];
  for (let i = 0; i < m.blocks.length; i++) {
    const r = litvm.run(schema, m.blocks[i], 0, { blk: i, limit: 4000000 });
    if (r.why === 'данные кончились' && r.pos === m.blocks[i].length) stops++;
    else bad.push(i + ': ' + r.why + ' на ' + r.pos + ' из ' + m.blocks[i].length);
    // лист POI начинается записью-тайлом 0x23; точки-центры городов (0x24 в
    // блоках городов) — часть адресного справочника, а не дерева POI
    const isLeaf = (keyed(i).els[0] || {}).type === 0x23;
    if (isLeaf) leafBlks.push(i);
    const list = isLeaf ? litpoi.poisOf(schema, m.blocks[i], i) : [];
    if (list.length) leaves++;
    for (const x of list) {
      pois++;
      if (x.lon >= CYP.lon0 && x.lon <= CYP.lon1 && x.lat >= CYP.lat0 && x.lat <= CYP.lat1) inside++;
    }
  }
  // спуск от корня по рамке вокруг каждой сотой точки
  let seen = 0, hit = 0;
  for (let i = 1; i < m.blocks.length; i++) {
    if ((keyed(i).els[0] || {}).type !== 0x23 && rootRec && rootRec.type === 1) continue;
    const list = litpoi.poisOf(schema, m.blocks[i], i);
    for (let k = 0; k < list.length; k += 100) {
      const q = list[k]; seen++;
      const x = Math.round(q.lon * 72000), y = Math.round(q.lat * ct.DEG);
      const got = new Set();
      for (const st of starts) ct.collect(get, st.blk, st.key, { x0: x - 72, y0: y - 111, x1: x + 72, y1: y + 111 }, got, 0);
      if (got.has(i)) hit++;
    }
  }
  // поиск рядом путём прошивки (src/litnear.js) против перебора, и проба
  // «KINO у Лимасола» — на машине 21.10 этот поиск отвечал «не найдено в 100 км»
  const near = poiPath ? require('./litnear').check(require('./litnear').open([path.dirname(file)]), leafBlks,
    { per: 2, probes: [{ name: 'KINO у Лимасола', type: 30, lon: 33.0413, lat: 34.6786, radius: 20000 }] }) : null;
  return { own: true, blocks: m.blocks.length, leaves, stops, pois, inside, seen, hit, bad,
           start, starts, poiPath, addr, near };
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

module.exports = { check, checkTiles, checkLit, checkGdb };

if (require.main === module) {
  const args = process.argv.slice(2);
  const root = args[0];
  const flag = (n, d) => { const i = args.indexOf('--' + n); return i > 0 && args[i + 1] ? args[i + 1] : d; };
  if (!root) {
    console.error('использование: node src/setcheck.js <каталог-набора> [--donor CY00]');
    process.exit(1);
  }
  // Компонента XAC в наборе может не быть (образ только с точками интереса
  // или только с отрисовкой) — тогда проверяется то, что есть.
  const pkgdb = path.join(root, 'pkgdb');
  const hasXac = fs.existsSync(pkgdb) && fs.readdirSync(pkgdb).some((d) => /^XAC/.test(d));
  let rs = [], links = null;
  if (hasXac) {
    const c = findContainer(root);
    const xah = fldb.read(c.db, c.ents.find((e) => /[.]xah$/.test(e.name)));
    const donor = flag('donor', null);
    rs = (donor ? [donor.toUpperCase()] : [...st.parse(xah).keys()]).map((t) => check(root, t));
    if (!donor) links = checkTiles(root);
  } else console.log('набор ' + root + ': компонента XAC нет, проверяю остальное');
  for (const r of rs) {
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
  console.log(r.edgesErr
    ? 'рёбра тайла: не прочитаны (' + r.edgesErr + ') — блоки не версии 5, для сверки набора не важно'
    : 'рёбра тайла: ' + r.edges + ', неразобранных ссылок ' + r.lost);
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
  if (links) {
    const l = links;
    console.log('тайлов ' + l.tiles + ': шапки и блоки против реестра — расхождений ' + l.head +
      '; RASTERINFOS против .ras — ячеек ' + l.cells + ', расхождений ' + l.cellBad +
      ', ячеек .ras вне сетки своего тайла ' + l.orphan);
    console.log('нульвекторов ' + l.links + ': не уровень 1 ' + l.levelBad + ', не в соседа ' + l.nbBad +
      ', координата не сошлась ' + l.coordBad + ', нет обратной связи ' + l.backBad +
      ', не по одной записи у копий ' + l.degBad);
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
    console.log('LIT (' + poi.vols.join(', ') + ', свой контейнер): блоков ' + poi.blocks +
                ', с точками ' + poi.leaves + ', разбор дочитан до конца у ' + poi.stops);
    if (poi.poiPath !== null) console.log('путь к дереву POI: корень 0x4a -> 0x20 -> 0x21: ' +
                                          (poi.poiPath ? 'есть, слоёв ' + poi.starts.length + ', корни ' + poi.starts.map((x) => x.blk).join(',') : 'НЕТ'));
    console.log('точек ' + poi.pois + ', из них в рамке Кипра ' + poi.inside +
                '; спуск от корня: проверено ' + poi.seen + ', свой лист найден у ' + poi.hit);
    if (poi.addr) {
      const a = poi.addr;
      console.log('адреса: корень -> «' + a.countryName.join(', ') + '» -> страна ' + a.code + ' ' +
                  a.iso.join('/') + ' -> городов ' + a.cities.length + ' -> улиц ' + a.streets +
                  (a.errors.length ? ', ОШИБОК ' + a.errors.length + ': ' + a.errors.slice(0, 3).join('; ') : ''));
    }
    if (poi.near) console.log('поиск рядом (litnear): поисков ' + poi.near.searches + ', совпало с перебором ' + poi.near.ok +
                              poi.near.probes.map((q) => '; ' + q.name + ': ' + q.found).join('') +
                              (poi.near.bad.length ? '; ОШИБКИ: ' + poi.near.bad.join('; ') : ''));
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
                       (poi.own && (poi.stops !== poi.blocks || poi.hit !== poi.seen ||
                                    poi.poiPath === false || (poi.addr && poi.addr.errors.length) ||
                                    (poi.near && poi.near.ok !== poi.near.searches))))) ||
              (links && links.bad) ||
              rs.some((r) => r.regBad || r.numErr || r.lost || r.fldb.anomalies ||
              (r.names && (!r.names.streamExact || !r.names.refsExact || r.names.err)) ||
              (r.houses && (r.houses.bad || !r.houses.indexOk ||
                            r.houses.refs !== r.houses.inRefs)) ||
              (r.guide && (r.guide.err || r.guide.parsed !== r.guide.count)));
  console.log(bad ? 'ЕСТЬ РАСХОЖДЕНИЯ' : 'расхождений нет');
  process.exit(bad ? 1 : 0);
}
