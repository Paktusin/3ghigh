'use strict';
// Свой контейнер `XAC` — только с Кипром.
//
//   node src/mkxac.js out/cyp/CY.xac.db
//        [--roads out/cyp/roads.geojson] [--places out/cyp/places_geo.json]
//        [--houses out/cyp/cyprus-latest.osm.pbf] [--code CY00]
//
// Отличие от `src/mkcyp.js`. Тот сажает кипрский тайл в слот донорского `IS01`
// внутри заводского контейнера на 2 ГБ: длина файла не меняется, индекс
// остаётся заводским, а образ требует заводской базы под собой. Здесь
// контейнер свой: один тайл, свой индекс `.xah`, свой растр, свои имена
// городов — и ничего чужого.
//
// ── Что внутри ────────────────────────────────────────────────────────────
//   EJ211.xah        индекс: шапка, реестр из одной записи, четыре строки
//                    уровней, группы, страна, соседи (пусто), плюс таблицы,
//                    не зависящие от покрытия, — переносятся из заводского
//   EJ211.ras        растр по рамке Кипра (`src/rasidx.js`)
//   EJ211_CY00_1.xac тайл: дороги, `ZF-NAMEN`, `ZE-NAMEN`, `ZE-NAMEN-MMI`,
//                    `HAUSNUMMERN`, `RASTERINFOS`
//   EJ211_CY00_2.xac заглушка уровня 2 — так же поступает завод у 347 тайлов
//   EJ211_0.ort      имена городов Кипра
//
// ── Чего в контейнере нет ─────────────────────────────────────────────────
// Уровней 3 и 4 (`.b`/`.v`): данных для них мы не собираем, и в строках
// уровней стоит «данных нет». Файлов `.plz` и `.poi`: у завода это 104 и 148
// байт на страну, но сами мы их ни разу не открывали и чужие байты вслепую не
// кладём.
//
// На устройстве такой контейнер не проверялся ни разу.

const fs = require('fs');
const path = require('path');
const fldb = require('./fldb');
const xac = require('./xac');
const xah = require('./xah');
const st = require('./struktur');
const fg = require('./fegruppen');
const ras = require('./rasidx');
const tile = require('./xactile');
const roads = require('./xacroads');
const zenamen = require('./zenamen');
const zfnamen = require('./zfnamen');
const dataset = require('./dataset');
const raster = require('./raster');
const osmpbf = require('./osmpbf');

const CYPRUS = 113;                 // код страны в шапке блока и в записи `LD`
const ZF_SIZE = 112;                // пустой раздел ZF-NAMEN у заглушки уровня 2
const NO_DATA = 0x7fffffff;
const ALIGN = 2048;
const align = (n) => Math.ceil(n / ALIGN) * ALIGN;

// Маска зоны обслуживания тайла: у нас весь прямоугольник свой, поэтому все
// ячейки нулевые (0 — ячейка отдана этому тайлу, см. src/raster.js). Рамка
// растра шире сетки ровно на ячейку с каждой стороны.
function rasterSection(bbox) {
  const cell = 1000;
  const nx = Math.max(1, Math.floor((bbox[2] - bbox[0]) / cell) - 1);
  const ny = Math.max(1, Math.floor((bbox[3] - bbox[1]) / cell) - 1);
  return raster.buildRaster({ cells: new Uint8Array(nx * ny), nx, ny, bbox,
                              label: 'RASTERINFOS', version: 0x00020000 });
}

// Парный файл уровня 2: шапка плюс пустой `ZF-NAMEN`. Ровно так выглядят все
// 347 заводских заглушек — 308 байт.
function stubLevel2(code, name, index, built) {
  return tile.buildTile({ code, file: name, index, country: CYPRUS, built,
                          zf: tile.section('ZF-NAMEN', Buffer.alloc(ZF_SIZE - 20)), blocks: [] });
}

// Дома из извлечения `.osm.pbf`: точки и контуры зданий с номером и улицей.
function readHouses(file) {
  const idx = osmpbf.read(file, {
    node: (t) => t['addr:housenumber'] !== undefined && t['addr:street'] !== undefined,
    way: (t) => t['addr:housenumber'] !== undefined && t['addr:street'] !== undefined,
  });
  const out = [];
  for (const p of idx.points) {
    out.push({ lon: p.lon / 1e7, lat: p.lat / 1e7,
               number: p.tags['addr:housenumber'], street: p.tags['addr:street'] });
  }
  for (const w of idx.ways) {
    const c = osmpbf.center(idx, w.refs);
    if (!c) continue;
    out.push({ lon: c[0] / 1e7, lat: c[1] / 1e7,
               number: w.tags['addr:housenumber'], street: w.tags['addr:street'] });
  }
  return out;
}

// ── Индекс .xah на один тайл ──────────────────────────────────────────────
//
// Записи собираются с нуля, а не выбираются из заводских: у нас свой тайл, и
// его поля берутся из собранного файла. Поля +0x34, +0x38, +0x4C и +0x50
// записи реестра остаются нулевыми — у завода они нулевые во всех 3777
// записях, назначение не установлено.
function strukturRecord(code, file1) {
  const b = Buffer.alloc(st.REC);
  b.write(code, 0, 'latin1');
  const S = xac.sections(file1).list;
  const find = (n) => S.find((x) => x.name === n);
  const vb = S.filter((x) => x.name === 'VEKTORBLOCK');
  const vbSize = vb.reduce((a, x) => a + x.total, 0);
  for (let k = 0; k < 4; k++) b.writeUInt32BE(vbSize, 4 + k * 4);   // границы групп по уровням
  for (const [name, off] of [['ZE-NAMEN', 0x14], ['ZE-NAMEN-MMI', 0x1c],
                             ['HAUSNUMMERN', 0x24], ['LOCAL POIS', 0x2c]]) {
    const s = find(name);
    b.writeUInt32BE(s ? s.offset : 0, off);
    b.writeUInt32BE(s ? s.total : 0, off + 4);
  }
  const rs = find('RASTERINFOS');
  b.writeUInt32BE(rs ? rs.offset : 0, 0x3c);
  b.writeUInt32BE(rs ? rs.total : 0, 0x40);
  b.writeUInt32BE(vbSize, 0x44);
  b.writeUInt32BE(vbSize, 0x48);
  return b;
}

// Строка уровня. Уровень 1 — наш файл, уровни 2…4 объявляются пустыми.
//
// `firstBlock` — накопительный счёт по всей базе: тайл за тайлом, внутри тайла
// уровни 1, 2, 3, 4. У единственного тайла это ноль на первом уровне и число
// его блоков на остальных трёх.
function levelRow(file1, bbox, level, stub) {
  const b = Buffer.alloc(st.LEVEL_REC);
  const S = xac.sections(file1).list;
  const vb = S.filter((x) => x.name === 'VEKTORBLOCK');
  const hdr = S.find((x) => x.name === 'XAC HEADER');
  const zf = S.find((x) => x.name === 'ZF-NAMEN');
  if (level === 1) {
    bbox.forEach((v, i) => b.writeUInt32BE(v, i * 4));
    b.writeUInt16BE(vb.length, 0x10);
    b.writeUInt16BE(0, 0x12);                       // первый тайл базы, счёт с нуля
    b.writeUInt32BE(vb.length ? vb[0].offset : 0, 0x14);
    b.writeUInt32BE(vb.reduce((a, x) => a + x.total, 0), 0x18);
    b.writeUInt32BE(hdr ? hdr.total : 0, 0x1c);
    b.writeUInt32BE(zf ? zf.total : 0, 0x20);
    b.writeUInt32BE(0, 0x24);
  } else {
    for (let k = 0; k < 4; k++) b.writeUInt32BE(NO_DATA, k * 4);
    b.writeUInt16BE(0, 0x10);                       // блоков на уровне нет
    b.writeUInt16BE(vb.length, 0x12);               // но счёт уже ушёл вперёд
    b.writeUInt32BE(hdr ? hdr.total : 0, 0x1c);
    b.writeUInt32BE(zf ? zf.total : 0, 0x20);
    b.writeUInt32BE(level === 2 && stub ? stub.length : 0, 0x24);
  }
  return b;
}

// Индекс целиком. Таблицы, не зависящие от покрытия, переносятся из
// заводского; всё, что зависит от состава тайлов, пишется заново.
function buildXah(src, spec) {
  const out = [];
  const blocks = xac.sections(spec.file1).list.filter((x) => x.name === 'VEKTORBLOCK').length;

  for (const s of xah.sections(src).list) {
    const name = s.name;
    const raw = src.subarray(s.offset + 20, s.offset + s.total);
    if (['FE_MIX_INFO', 'VIA-LISTE', 'L4 LOAD TABLE'].indexOf(name) >= 0) continue;

    if (name === 'XACDB HEADER') {
      const h = Buffer.from(raw);
      h.writeUInt32BE(1, xah.H.tiles - 20);
      h.writeUInt32BE(blocks, xah.H.blocks - 20);
      h.writeUInt32BE(1, 0x50 - 20);                // областей третьего уровня
      out.push({ name, data: h });
    } else if (name === 'XAC-STRUKTUR') {
      out.push({ name, data: Buffer.concat([raw.subarray(0, 4), spec.reg]) });
    } else if (/^XAC-STRUKTUR L[1-4]$/.test(name)) {
      const n = +name.slice(-1);
      out.push({ name, data: Buffer.concat([raw.subarray(0, 4), spec.rows[n - 1]]) });
    } else if (name === 'NACHBARN') {
      out.push({ name, data: st.buildNeighbors([[]], raw.subarray(0, 4)) });
    } else if (name === fg.SEC) {
      const src2 = fg.read(src);
      out.push({ name, data: fg.build({ head: src2.head, gap: 0, tail: 0,
        groups: [{ id: 0, tiles: [0] }],
        lands: [{ id: CYPRUS, byte6: 0, flags: 2, value: 0, tiles: [0] }] }) });
    } else if (name === fg.SEC_L3) {
      const src3 = fg.readL3(src);
      out.push({ name, data: fg.buildL3({ head: src3.head, tail: 0,
                                          groups: [{ id: 0, tiles: [0] }] }) });
    } else {
      out.push({ name, data: raw });               // от покрытия не зависит
    }
  }
  return xah.build(out);
}

// ── Контейнер FLDB из файлов в памяти ─────────────────────────────────────
//
// Шапка (до начала каталога) переносится из заводского контейнера: там магия
// `FLDB` и текстовый блок `!dbinfo`. Правится число файлов и строка `DB=1/3`:
// у нас контейнер один, значит `DB=1/1`.
function buildContainer(files, headSrc) {
  const head = Buffer.from(headSrc.subarray(0, fldb.DIR_OFFSET));
  head.writeUInt32LE(files.length, 0x0c);
  const info = head.toString('latin1', 0x20, fldb.DIR_OFFSET);
  const fixed = info.replace('DB=1/3', 'DB=1/1');
  if (fixed !== info) {
    head.fill(0, 0x20, fldb.DIR_OFFSET);
    head.write(fixed.replace(/\0+$/, ''), 0x20, 'latin1');
  }

  const dirEnd = fldb.DIR_OFFSET + files.length * fldb.ENTRY_SIZE;
  let pos = align(dirEnd);
  const placed = files.map((f) => { const at = pos; pos = align(pos + f.data.length); return { f, at }; });
  const out = Buffer.alloc(pos, 0);
  head.copy(out, 0);
  placed.forEach((p, i) => {
    const o = fldb.DIR_OFFSET + i * fldb.ENTRY_SIZE;
    out.writeUInt32LE(p.at, o);
    out.writeUInt32LE(p.f.data.length, o + 4);
    out.write(p.f.name, o + 8, 24, 'latin1');
    out.writeUInt32LE(fldb.checksum(p.f.data), o + 32);
    p.f.data.copy(out, p.at);
  });
  return out;
}

function mkxac(opt) {
  const o = opt || {};
  const log = o.log || (() => {});
  const root = o.root || dataset.resolveRoot();
  const code = (o.code || 'CY00').toUpperCase();
  const prefix = o.prefix || 'EJ211';
  const built14 = o.built || '20260923120000';

  // заводской контейнер нужен как источник таблиц и шапки
  const srcPath = (() => {
    const d = path.join(root, 'pkgdb', 'XAC');
    const f = fs.readdirSync(d).find((x) => /\.db$/i.test(x));
    return path.join(d, f);
  })();
  const db = fldb.open(srcPath);
  const ents = fldb.entries(db);
  const xahSrc = fldb.read(db, ents.find((e) => /\.xah$/.test(e.name)));
  const headSrc = Buffer.alloc(fldb.DIR_OFFSET);
  fs.readSync(db.fd, headSrc, 0, headSrc.length, 0);

  // ---- тайл ----
  const fc = JSON.parse(fs.readFileSync(o.roads || 'out/cyp/roads.geojson', 'utf8'));
  const graph = roads.graphFromGeoJSON(fc, { classes: o.classes });
  const attr = roads.setAttributes(root);
  let named = null, zfSection = null;
  if (graph.names.length) {
    const order = graph.names.map((_, k) => k)
      .sort((a, b) => (graph.names[a] < graph.names[b] ? -1 : graph.names[a] > graph.names[b] ? 1 : a - b));
    const of = new Int32Array(graph.names.length).fill(-1);
    order.forEach((g, k) => { of[g] = k; });
    named = { of, attr: roads.attrByFrcNamed(attr) };
    zfSection = zfnamen.buildSection(order.map((g) => ({ text: graph.names[g], kind: 0 })),
                                     zfnamen.tokens(xahSrc));
  }
  const built = roads.buildBlocks(graph, { attr, attrIdx: roads.attrByFrc(attr), named,
                                           base: 0, country: CYPRUS, maxNodes: o.maxNodes || 9000 });
  log('дорог ' + graph.ways + ', узлов ' + graph.nodes.length + ', рёбер ' + graph.edges.length +
      ' -> блоков ' + built.blocks.length);

  const bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const n of graph.nodes) {
    if (n.x < bb[0]) bb[0] = n.x; if (n.x > bb[2]) bb[2] = n.x;
    if (n.y < bb[1]) bb[1] = n.y; if (n.y > bb[3]) bb[3] = n.y;
  }

  const names = [];
  let zen = null;
  if (o.places) {
    zen = roads.zenModel(graph, built, { places: o.places, houses: o.houses,
                                         countryName: o.countryName || 'CYPRUS' });
    names.push(zenamen.buildSection({ names: zen.names, refs: zen.refs, blocks: zen.blocks,
                                      version: 2, label: 'ZE-NAMEN', country: CYPRUS }));
    names.push(zenamen.mmiBuildSection(zen.mmi));
    if (zen.houses) names.push(require('./hausnr').buildSection({ rows: zen.hnr }));
    log('имена: ' + zen.names.length + ' (городов ' + zen.places + ', улиц ' + zen.streets +
        (zen.houses ? ', домов ' + zen.houses : '') + ')');
  }

  const name1 = prefix + '_' + code + '_1';
  const file1 = tile.buildTile({
    code, file: name1, index: 0, country: CYPRUS, built: built14,
    zf: zfSection || tile.section('ZF-NAMEN', Buffer.alloc(92)),
    blocks: built.blocks,
    extra: names.concat([rasterSection([bb[0] - 1000, bb[1] - 1000, bb[2] + 1000, bb[3] + 1000])]),
  });
  const file2 = stubLevel2(code, prefix + '_' + code + '_2', 0, built14);
  log('тайл ' + code + ': ' + (file1.length / 1024).toFixed(0) + ' КБ, заглушка уровня 2 ' +
      file2.length + ' б');

  // ---- индекс ----
  const box = [bb[0] - 1000, bb[1] - 1000, bb[2] + 1000, bb[3] + 1000];
  const xahBuf = buildXah(xahSrc, {
    file1,
    reg: strukturRecord(code, file1),
    rows: [1, 2, 3, 4].map((n) => levelRow(file1, box, n, file2)),
  });
  log('индекс .xah: ' + xahBuf.length + ' б (заводской ' + xahSrc.length + ')');

  // ---- растр ----
  const r = ras.blank({ bbox: box });
  const fill = ras.fill(r, box, 0);
  const rasBuf = ras.build(r);
  log('растр: сетка ' + r.nx + '×' + r.ny + ', занято ячеек ' + fill.taken + ', ' +
      rasBuf.length + ' б');

  // ---- имена городов ----
  const files = [
    { name: prefix + '.ras', data: rasBuf },
    { name: prefix + '.xah', data: xahBuf },
  ];
  if (o.places) {
    const cities = [...new Set((o.places.features || o.places)
      .map((f) => (f.properties ? f.properties.name : f.name)).filter(Boolean))].sort();
    const ort = zenamen.buildSection({ names: cities, country: CYPRUS, version: 3 });
    files.push({ name: prefix + '_0.ort', data: ort });
    log('.ort: городов ' + cities.length + ', ' + ort.length + ' б');
  }
  files.push({ name: name1 + '.xac', data: file1 });
  files.push({ name: prefix + '_' + code + '_2.xac', data: file2 });
  files.sort((a, b) => (a.name < b.name ? -1 : 1));

  const container = buildContainer(files, headSrc);
  return { container, files, xah: xahBuf, tile: file1, blocks: built.blocks.length,
           nodes: graph.nodes.length, edges: graph.edges.length, bbox: box };
}

module.exports = { mkxac, buildXah, buildContainer, strukturRecord, levelRow,
                   rasterSection, stubLevel2, readHouses, CYPRUS };

if (require.main === module) {
  const args = process.argv.slice(2);
  const out = args[0];
  const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
  if (!out || out.startsWith('--')) {
    console.error('использование: node src/mkxac.js <выход.db> [--roads ...] [--places ...] [--houses ...]');
    process.exit(2);
  }
  const places = flag('places', 'out/cyp/places_geo.json');
  const houses = flag('houses', 'out/cyp/cyprus-latest.osm.pbf');
  const r = mkxac({
    roads: flag('roads', 'out/cyp/roads.geojson'),
    classes: flag('classes', 'motorway,motorway_link,trunk,trunk_link,primary,primary_link').split(','),
    places: fs.existsSync(places) ? JSON.parse(fs.readFileSync(places, 'utf8')) : null,
    houses: fs.existsSync(houses) ? readHouses(houses) : null,
    code: flag('code', 'CY00'),
    log: (m) => console.log(m),
  });

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, r.container);
  console.log('контейнер ' + r.container.length + ' байт (' +
              (r.container.length / 1048576).toFixed(2) + ' МБ), файлов ' + r.files.length);

  // ---- сверка своими читателями ----
  const db = fldb.open(out);
  const ents = fldb.entries(db);
  const v = fldb.verify(db);
  const xahBuf = fldb.read(db, ents.find((e) => /\.xah$/.test(e.name)));
  const reg = st.parse(xahBuf), lv = st.parseLevels(xahBuf), h = xah.header(xahBuf);
  const code = [...reg.keys()][0];
  const rec = reg.get(code);
  const t = fldb.read(db, ents.find((e) => /_1\.xac$/.test(e.name)));
  const S = xac.sections(t);
  const byName = (n) => S.list.find((x) => x.name === n);
  const xg = require('./xacgraph');
  const edges = xg.tileEdges(S.list.filter((x) => x.name === 'VEKTORBLOCK')
                              .map((x) => t.subarray(x.offset, x.offset + x.total)));
  const R = ras.load(fldb.read(db, ents.find((e) => /\.ras$/.test(e.name))), 'CY.ras');

  let regBad = 0;
  for (const [n, off] of [['ZE-NAMEN', 0x14], ['ZE-NAMEN-MMI', 0x1c], ['HAUSNUMMERN', 0x24],
                          ['RASTERINFOS', 0x3c]]) {
    const s = byName(n);
    const a = rec.sections[n] || { offset: xahBuf.readUInt32BE(0), size: 0 };
    const ro = n === 'RASTERINFOS' ? rec.sections['RASTERINFOS'] : rec.sections[n];
    if (!ro) continue;
    if (s ? (ro.offset !== s.offset || ro.size !== s.total) : (ro.offset || ro.size)) regBad++;
  }
  const lon = (x) => x / 72000, lat = (y) => y / (40000000 / 360);
  const nic = ras.lookup(R, Math.round(33.3823 * 72000), Math.round(35.1856 * (40000000 / 360)));

  console.log('--- сверка своими читателями ---');
  console.log('каталог FLDB: файлов ' + ents.length + ', аномалий ' + v.anomalies);
  console.log('шапка: тайлов ' + h.tiles + ', блоков ' + h.blocks + ', разрядности ' +
              (xah.bitsAccepted(h.bits) ? 'заводские' : 'ИЗМЕНЕНЫ'));
  console.log('реестр: тайл ' + code + ', расхождений с файлом ' + regBad);
  console.log('уровень 1: блоков ' + lv[1].rows[0].blockCount + ', firstBlock ' +
              lv[1].rows[0].firstBlock + ', рамка ' +
              lon(lv[1].rows[0].bbox[0]).toFixed(2) + '…' + lon(lv[1].rows[0].bbox[2]).toFixed(2) + ' в.д., ' +
              lat(lv[1].rows[0].bbox[1]).toFixed(2) + '…' + lat(lv[1].rows[0].bbox[3]).toFixed(2) + ' с.ш.');
  console.log('рёбра тайла: ' + edges.edges.size + ', неразобранных ссылок ' + edges.lost);
  console.log('растр: Никосия указывает на тайл ' + nic);
  const bad = v.anomalies || regBad || edges.lost || nic !== 0 || h.tiles !== 1;
  console.log(bad ? 'ЕСТЬ РАСХОЖДЕНИЯ' : 'расхождений нет');
  process.exit(bad ? 1 : 0);
}
