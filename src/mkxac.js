'use strict';
// Свой контейнер `XAC` — только с Кипром.
//
//   node src/mkxac.js out/cyp/CY.xac.db
//        [--roads out/cyp/roads.geojson] [--places out/cyp/places_geo.json]
//        [--houses out/cyp/cyprus-latest.osm.pbf] [--code CY00] [--tile-nodes 65000]
//
// Контейнер свой: свой индекс `.xah`, свой растр, свои имена городов — и
// ничего чужого. С 20.10 тайлов несколько (`src/xacsplit.js`): у завода тайл
// не крупнее 19 блоков и 2,0 МБ области блоков, а DBM грузит уровень 1 тайла
// одним куском. Сеть делится на прямоугольные зоны по сетке `.ras` (по
// умолчанию до 65 000 узлов в зоне), рёбра на границе режутся, половинки
// связываются нульвекторами.
//
// ── Что внутри ────────────────────────────────────────────────────────────
//   EJ211.xah        индекс: шапка, реестр, строки уровней, группа FE и
//                    страна на все тайлы, область L3, соседи, плюс таблицы,
//                    не зависящие от покрытия, — переносятся из заводского
//   EJ211.ras        растр по рамке Кипра: ячейка -> тайл (`src/rasidx.js`)
//   EJ211_CY0n_1.xac тайлы: дороги, `ZF-NAMEN`, `ZE-NAMEN`, `ZE-NAMEN-MMI`,
//                    `HAUSNUMMERN`, `RASTERINFOS`
//   EJ211_CY0n_2.xac заглушки уровня 2 — так же поступает завод у 347 тайлов
//   EJ211_0.ort      имена городов Кипра
//   EJ211_0_3.b/.v, EJ211_0_4.b/.v, EJ211_4.b
//                    файлы области L3 без блоков — без них не строится маршрут
//
// ── Про `.plz` и `.poi` ───────────────────────────────────────────────────
// Эти два файла на страну КЛАДУТСЯ, хотя формат их мы не разбирали. Основание
// не «на всякий случай», а два факта:
//
//   * прошивка их ищет: `u_refresh_plz_ntab_infos` (`FUN_0827f034`) и
//     `u_refresh_poi_ntab_infos` возвращают ошибку, если чанк группы не найден;
//   * страновых данных в них нет: **все 45 заводских `.plz` побайтно одинаковы,
//     и все 45 `.poi` тоже** — это пустые заглушки, заголовок раздела и нули
//     (`GR POSTLEITZAHL`, 104 байта; `GLOBAL POIS`, 148 байт).
//
// Поэтому заводская заглушка переносится как есть — это не чужие данные, а
// форма пустого файла.
//
// ── Чего в контейнере нет ─────────────────────────────────────────────────
// Блоков уровней 2…4: данных для них мы не собираем, в строках уровней стоит
// «данных нет», а файлы области L3 несут только оглавление и пустые места.
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
const split = require('./xacsplit');
const xg = require('./xacgraph');

const CYPRUS = 113;                 // код страны в шапке блока и в записи `LD`
const NO_DATA = 0x7fffffff;
const ALIGN = 2048;
const align = (n) => Math.ceil(n / ALIGN) * ALIGN;

// Маска зоны обслуживания тайла. Как у завода (20 тайлов из 20, 17.10):
// сетка — ровно рамка зоны тайла в ячейках `.ras`, рамка раздела шире сетки
// на две ячейки вправо и вверх. Зона у нас прямоугольная — все ячейки свои (0).
function rasterSection(grid, r) {
  const nx = r[2] - r[0], ny = r[3] - r[1];
  const bbox = [grid.x0 + r[0] * grid.step, grid.y0 + r[1] * grid.step,
                grid.x0 + (r[2] + 2) * grid.step, grid.y0 + (r[3] + 2) * grid.step];
  return raster.buildRaster({ cells: new Uint8Array(nx * ny), nx, ny, bbox,
                              label: 'RASTERINFOS', version: 0x00020000 });
}

// Пустой `ZF-NAMEN` в 112 байт — форма, а не данные: заводские заглушки
// `_2.xac` (80 из 80 в контейнере `XAC`) и пустое место тайла `GR1T` в
// `EJ211_7_3.b`/`_7_4.b` несут ровно эти байты (версия 3, одна служебная
// запись). До 19.10 здесь писались 92 нуля.
const EMPTY_ZF = Buffer.from(
  '5a462d4e414d454e20202020202020200000005c00030000000000010000004c0000000c' +
  '000000020000005800000004000000020000005c00000012363da0280000000000000070' +
  '000000004453543d4e4f5f44000000000d000d0064dc013db4015f64d6e9fc013db4015f' +
  'e9fb0000', 'hex');

// Парный файл уровня 2: шапка плюс пустой `ZF-NAMEN`. Ровно так выглядят все
// 347 заводских заглушек — 308 байт.
function stubLevel2(code, name, index, built) {
  return tile.buildTile({ code, file: name, index, country: CYPRUS, built,
                          zf: Buffer.from(EMPTY_ZF), blocks: [] });
}

// ── Файлы области третьего уровня: `<П>_<i>_3.b/.v`, `<П>_<i>_4.b/.v`, `<П>_4.b`
//
// Их открывает DBM при подготовке маршрута, а не при запуске:
// `prepare_full_scout` (`FUN_08eb4b00`) и `acdbm_load_binary_scout`
// (`FUN_08eb3e6c`) зовут `load_layer_234` (`FUN_08ec8c24` → `FUN_08ec8a20`),
// а та для области L3 стартового и целевого тайла — `FUN_08eafea4(fe, 3)`:
// имя `%s_%d_%d.B`, загрузка `FUN_08eaf658` → `dbm_scan_file`. Нет файла —
// ошибка, `load_layer_234 failed`, подготовка маршрута падает, маршрута нет.
// Флаг «полный скаут без подгрузки» (`FUN_08eb4c78`) тоже требует
// «l3_group: layer 3 loaded». Уровень 4 ищется в `%s_%d_4.B`, без него — в
// общем `%s_4.B`.
//
// Раскладка снята с заводских файлов (Австралия, Европа):
//   `VERYSMART XAC HD`: u32 длина = 4 + n·W, u16 1, u16 n, затем n записей
//     .b (W = 16): u16 тайл, u16 0, u32 смещение данных (сразу за его
//                  `SMART XAC HEADER`), u32 размер VEKTORBLOCK, u32 размер ZF-NAMEN
//     .v (W = 12): u16 тайл, u16 0, u32 смещение, u32 размер LAYER 1 VERWEISE
//   далее по тайлу: `SMART XAC HEADER` (u32 4, u16 1, u16 тайл) и его разделы.
// Тайл без блоков уровня у завода (GR1T, BE00, FI0R…) несёт в `.b` один
// пустой `ZF-NAMEN`, в `.v` — только `SMART XAC HEADER`. Так и пишем: у нас
// уровней 3 и 4 нет вовсе. Общий `_4.b` — как у Австралии, где уровня 4 нет:
// только оглавление на все тайлы базы, записи нулевые.
function verySmart(entries, W) {
  const head = Buffer.alloc(24 + entries.length * W);
  head.write('VERYSMART XAC HD', 0, 'latin1');
  head.writeUInt32BE(4 + entries.length * W, 16);
  head.writeUInt16BE(1, 20);
  head.writeUInt16BE(entries.length, 22);
  entries.forEach((e, k) => e.forEach((v, j) => {
    const o = 24 + k * W + j * 4;
    if (j === 0) head.writeUInt16BE(v, o); else head.writeUInt32BE(v, o);
  }));
  return head;
}

function smartHeader(tileNo) {
  const b = Buffer.alloc(24);
  b.write('SMART XAC HEADER', 0, 'latin1');
  b.writeUInt32BE(4, 16);
  b.writeUInt16BE(1, 20);
  b.writeUInt16BE(tileNo, 22);
  return b;
}

// Область из тайлов без блоков уровня: пара файлов .b/.v.
function emptyAreaFiles(tiles) {
  let at = 24 + tiles.length * 16;
  const be = [], bp = [];
  for (const t of tiles) {
    at += 24;
    be.push([t, at, 0, EMPTY_ZF.length]);
    bp.push(smartHeader(t), EMPTY_ZF);
    at += EMPTY_ZF.length;
  }
  let av = 24 + tiles.length * 12;
  const ve = [], vp = [];
  for (const t of tiles) { av += 24; ve.push([t, av, 0]); vp.push(smartHeader(t)); }
  return { b: Buffer.concat([verySmart(be, 16)].concat(bp)),
           v: Buffer.concat([verySmart(ve, 12)].concat(vp)) };
}

function globalL4(tileCount) {
  return verySmart(Array.from({ length: tileCount }, () => [0, 0, 0, 0]), 16);
}

// «В населённом пункте»: точка внутри застройки (`built` в out/cyp/areas.json —
// landuse=residential|commercial|retail, src/osmareas.js). Нужно для скорости
// по умолчанию (50 против 80), когда у дороги нет `maxspeed`.
function urbanIndex(areas) {
  const G = 0.02, grid = new Map();
  const polys = (areas.features || []).filter((f) => f.cls === 'built');
  polys.forEach((f, k) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of f.rings) for (const [x, y] of r) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    for (let gx = Math.floor(x0 / G); gx <= Math.floor(x1 / G); gx++) {
      for (let gy = Math.floor(y0 / G); gy <= Math.floor(y1 / G); gy++) {
        const key = gx + ',' + gy;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(k);
      }
    }
  });
  const inside = (rings, x, y) => {
    let c = false;
    for (const r of rings) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        if ((r[i][1] > y) !== (r[j][1] > y) &&
            x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
      }
    }
    return c;
  };
  return (x, y) => (grid.get(Math.floor(x / G) + ',' + Math.floor(y / G)) || [])
    .some((k) => inside(polys[k].rings, x, y));
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

// ── Индекс .xah ───────────────────────────────────────────────────────────
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
// уровни 1, 2, 3, 4 (`base` — первый блок тайла). Рамка уровня 1 — рамка шапки
// тайла, объединение рамок блоков: так у завода (20 тайлов из 20).
function levelRow(file1, level, stub, base) {
  const b = Buffer.alloc(st.LEVEL_REC);
  const S = xac.sections(file1).list;
  const vb = S.filter((x) => x.name === 'VEKTORBLOCK');
  const hdr = S.find((x) => x.name === 'XAC HEADER');
  const zf = S.find((x) => x.name === 'ZF-NAMEN');
  if (level === 1) {
    tile.bboxOf(file1, vb).forEach((v, i) => b.writeInt32BE(v, i * 4));
    b.writeUInt16BE(vb.length, 0x10);
    b.writeUInt16BE(base, 0x12);
    b.writeUInt32BE(vb.length ? vb[0].offset : 0, 0x14);
    b.writeUInt32BE(vb.reduce((a, x) => a + x.total, 0), 0x18);
    b.writeUInt32BE(hdr ? hdr.total : 0, 0x1c);
    b.writeUInt32BE(zf ? zf.total : 0, 0x20);
    b.writeUInt32BE(0, 0x24);
  } else {
    // Как у всех 160 заводских тайлов с заглушкой: рамка пустая (min > max),
    // а ZF-NAMEN — раздел самой заглушки, а не файла уровня 1.
    [NO_DATA, NO_DATA, 0x80000000, 0x80000000].forEach((v, i) => b.writeUInt32BE(v, i * 4));
    b.writeUInt16BE(0, 0x10);                       // блоков на уровне нет
    b.writeUInt16BE(base + vb.length, 0x12);        // но счёт уже ушёл вперёд
    const stubSecs = stub ? xac.sections(stub).list : [];
    const shdr = stubSecs.find((x) => x.name === 'XAC HEADER');
    const szf = stubSecs.find((x) => x.name === 'ZF-NAMEN');
    b.writeUInt32BE(shdr ? shdr.total : 0, 0x1c);
    b.writeUInt32BE(szf ? szf.total : 0, 0x20);
  }
  return b;
}

// Индекс целиком. Таблицы, не зависящие от покрытия, переносятся из
// заводского; всё, что зависит от состава тайлов, пишется заново.
//   spec.regs       записи XAC-STRUKTUR по тайлам
//   spec.rows       [тайл][уровень 0…3] строки XAC-STRUKTUR L1…L4
//   spec.blocks     блоков во всей базе
//   spec.neighbors  списки соседей NACHBARN
// Группа FE одна (страна Кипр, у завода группа = страна, 45 из 45), область
// L3 одна — все тайлы.
function buildXah(src, spec) {
  const out = [];
  const all = spec.regs.map((_, t) => t);

  for (const s of xah.sections(src).list) {
    const name = s.name;
    const raw = src.subarray(s.offset + 20, s.offset + s.total);
    if (['FE_MIX_INFO', 'VIA-LISTE', 'L4 LOAD TABLE'].indexOf(name) >= 0) continue;

    if (name === 'XACDB HEADER') {
      const h = Buffer.from(raw);
      h.writeUInt32BE(all.length, xah.H.tiles - 20);
      h.writeUInt32BE(spec.blocks, xah.H.blocks - 20);
      h.writeUInt32BE(1, 0x50 - 20);                // областей третьего уровня
      out.push({ name, data: h });
    } else if (name === 'XAC-STRUKTUR') {
      out.push({ name, data: Buffer.concat([raw.subarray(0, 4)].concat(spec.regs)) });
    } else if (/^XAC-STRUKTUR L[1-4]$/.test(name)) {
      const n = +name.slice(-1);
      out.push({ name, data: Buffer.concat([raw.subarray(0, 4)].concat(spec.rows.map((r) => r[n - 1]))) });
    } else if (name === 'NACHBARN') {
      out.push({ name, data: st.buildNeighbors(spec.neighbors, raw.subarray(0, 4)) });
    } else if (name === fg.SEC) {
      const src2 = fg.read(src);
      // Записи стран начинаются с кратного 4 смещения, как у Австралии (gap 2).
      const grEnd = 20 + src2.head.length + 8 + 2 * all.length;
      out.push({ name, data: fg.build({ head: src2.head, gap: (4 - grEnd % 4) % 4, tail: 0,
        groups: [{ id: 0, tiles: all }],
        lands: [{ id: CYPRUS, byte6: 0, flags: 2, value: 0, tiles: all }] }) });
    } else if (name === fg.SEC_L3) {
      const src3 = fg.readL3(src);
      out.push({ name, data: fg.buildL3({ head: src3.head, tail: 0, groups: [{ id: 0, tiles: all }] }) });
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
  const cc = (o.code || 'CY00').slice(0, 2).toUpperCase();
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

  // ---- граф ----
  const fc = JSON.parse(fs.readFileSync(o.roads || 'out/cyp/roads.geojson', 'utf8'));
  const areasFile = o.areas || 'out/cyp/areas.json';
  const urban = fs.existsSync(areasFile) ? urbanIndex(JSON.parse(fs.readFileSync(areasFile, 'utf8'))) : null;
  // линии упрощаются с допуском 6 единиц (~6–8 м): узлов в разы меньше,
  // привязке к дороге этого хватает
  const graph = roads.graphFromGeoJSON(fc, { classes: o.classes, speeds: true, urban, tol: 6 });
  const attr = roads.setAttributes(root);
  const attrIdx = roads.attrByFrc(attr), attrNamed = roads.attrByFrcNamed(attr);
  // запреты поворотов из отношений OSM `type=restriction`
  let bans = null;
  const pbf = o.pbf === undefined ? 'out/cyp/cyprus-latest.osm.pbf' : o.pbf;
  if (pbf && fs.existsSync(pbf)) {
    const idx = osmpbf.read(pbf, { relation: (t) => t.type === 'restriction' });
    const tb = roads.turnBans(graph, idx.relations, (id) => {
      const c = osmpbf.coord(idx, id);
      return c ? [c[0] / 1e7, c[1] / 1e7] : null;
    });
    bans = tb.bans;
    log('запреты поворотов OSM: ' + JSON.stringify(tb.stat));
  }
  log('дорог ' + graph.ways + ', узлов ' + graph.nodes.length + ', рёбер ' + graph.edges.length);

  // ---- тайлы: зоны по сетке растра, разрез рёбер на границах ----
  const bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const n of graph.nodes) {
    if (n.x < bb[0]) bb[0] = n.x; if (n.x > bb[2]) bb[2] = n.x;
    if (n.y < bb[1]) bb[1] = n.y; if (n.y > bb[3]) bb[3] = n.y;
  }
  const box = [bb[0] - 1000, bb[1] - 1000, bb[2] + 1000, bb[3] + 1000];
  const R = ras.blank({ bbox: box });
  const grid = { x0: box[0], y0: box[1], nx: R.nx, ny: R.ny, step: 1000 };
  const rects = split.zones(graph, grid, o.tileNodes || 65000);
  const sp = split.cut(graph, grid, rects);
  rects.forEach((r, t) => {
    for (let cx = r[0]; cx < r[2]; cx++) for (let cy = r[1]; cy < r[3]; cy++) ras.set(R, cx, cy, t);
  });
  const N = rects.length;
  const codes = rects.map((_, t) => cc + t.toString(36).toUpperCase().padStart(2, '0'));
  const tBans = bans && split.bansByTile(sp, bans);
  const hs = o.houses ? split.housesByTile(sp, o.houses, roads.latinize, roads.segDist2) : null;
  log('тайлов ' + N + ', узлов разреза ' + sp.tiles.reduce((a, t) => a + t.links.length, 0) / 2 +
      (hs ? ', домов без своей улицы в сети ' + hs.lost : ''));

  // имена ведения тайла: свои, по возрастанию
  const guide = sp.tiles.map((tl) => {
    if (!tl.names.length) return { named: null, zf: null };
    const order = tl.names.map((_, k) => k)
      .sort((a, b) => (tl.names[a] < tl.names[b] ? -1 : tl.names[a] > tl.names[b] ? 1 : a - b));
    const of = new Int32Array(tl.names.length).fill(-1);
    order.forEach((g, k) => { of[g] = k; });
    return { named: { of, attr: attrNamed },
             zf: zfnamen.buildSection(order.map((g) => ({ text: tl.names[g], kind: 0 })), zfnamen.tokens(xahSrc)) };
  });

  // Два прохода: нульвектор узла разреза ссылается на номер записи двойника в
  // чужом тайле, а номера записей раздаёт раскладка. Первый проход даёт
  // раскладку и число блоков (отсюда сквозные номера), второй пишет блоки уже
  // с нульвекторами. Нульвектор не занимает номера в таблице, поэтому
  // раскладка во втором проходе та же — это проверяется.
  const blocksOf = (t, base, maxNodes, links) => roads.buildBlocks(sp.tiles[t], {
    attr, attrIdx, named: guide[t].named, bans: tBans && tBans[t], base, country: CYPRUS,
    maxNodes: maxNodes || o.maxNodes || 9000, links });
  const plan = sp.tiles.map((_, t) => blocksOf(t, 0));
  const base = [];
  plan.reduce((a, p, t) => { base[t] = a; return a + p.blocks.length; }, 0);
  const builtAll = sp.tiles.map((tl, t) => {
    const twin = new Map(tl.links.map((l) => [l.node, l]));
    const b = blocksOf(t, base[t], plan[t].maxNodes, (n) => {
      const l = twin.get(n);
      if (!l) return undefined;
      const P = plan[l.tile], k = P.blockOf[l.twin];
      // в блок с таблицей ссылка — номер записи, умноженный на два (у завода
      // чётная у 507 из 507), docs/formats/xac.md «Элемент 0x0000»
      return [{ level: 1, block: base[l.tile] + k, ref: 2 * P.firsts[k].first[P.localOf[l.twin]] }];
    });
    if (b.maxNodes !== plan[t].maxNodes || b.blocks.length !== plan[t].blocks.length)
      throw new Error('тайл ' + codes[t] + ': раскладка второго прохода разошлась с первым');
    return b;
  });

  // ---- файлы тайлов ----
  const files = [], tiles = [], regs = [], rows = [];
  let turns = 0, turnLost = 0;
  for (let t = 0; t < N; t++) {
    const tl = sp.tiles[t], built = builtAll[t], code = codes[t];
    turns += built.turns; turnLost += built.turnLost;
    const names = [];
    let zen = null;
    if (o.places) {
      zen = roads.zenModel(tl, built, { places: o.places, houses: hs && hs.out[t],
                                        countryName: o.countryName || 'CYPRUS',
                                        placeIn: (x, y) => sp.tileAt(x, y) === t });
      names.push(zenamen.buildSection({ names: zen.names, refs: zen.refs, blocks: zen.blocks,
                                        version: 2, label: 'ZE-NAMEN', country: CYPRUS }));
      names.push(zenamen.mmiBuildSection(zen.mmi));
      if (zen.houses) names.push(require('./hausnr').buildSection({ rows: zen.hnr }));
    }
    const name1 = prefix + '_' + code + '_1';
    const file1 = tile.buildTile({
      code, file: name1, index: t, country: CYPRUS, built: built14,
      zf: guide[t].zf || tile.section('ZF-NAMEN', Buffer.alloc(92)),
      blocks: built.blocks,
      extra: names.concat([rasterSection(grid, rects[t])]),
    });
    const file2 = stubLevel2(code, prefix + '_' + code + '_2', t, built14);
    const reg = strukturRecord(code, file1);
    tile.finishHeader(file1, { group: 0, country: CYPRUS, l3: 0, record: reg });
    regs.push(reg);
    rows.push([1, 2, 3, 4].map((n) => levelRow(file1, n, file2, base[t])));
    files.push({ name: name1 + '.xac', data: file1 }, { name: prefix + '_' + code + '_2.xac', data: file2 });
    const area = built.blocks.reduce((a, b) => a + b.length, 0);
    tiles.push({ code, nodes: tl.nodes.length, edges: tl.edges.length, blocks: built.blocks.length,
                 area, size: file1.length, links: tl.links.length, names: tl.names.length,
                 houses: zen ? zen.houses : 0, file: file1, graph: tl, built });
    log('тайл ' + code + ': узлов ' + tl.nodes.length + ', рёбер ' + tl.edges.length +
        ', узлов разреза ' + tl.links.length + ' -> блоков ' + built.blocks.length + ' с ' + base[t] +
        ', область блоков ' + (area / 1048576).toFixed(2) + ' МБ, файл ' + (file1.length / 1048576).toFixed(2) + ' МБ' +
        (zen ? '; имён ' + zen.names.length + ' (городов ' + zen.places + ', улиц ' + zen.streets +
               ', домов ' + zen.houses + ')' : ''));
  }
  if (bans) log('запретов записано в узлы: ' + turns + (turnLost ? ', не уложилось: ' + turnLost : ''));
  const blocks = base[N - 1] + builtAll[N - 1].blocks.length;

  // ---- индекс ----
  const xahBuf = buildXah(xahSrc, { regs, rows, blocks, neighbors: split.neighbors(rects) });
  log('индекс .xah: ' + xahBuf.length + ' б (заводской ' + xahSrc.length + ')');
  const rasBuf = ras.build(R);
  log('растр: сетка ' + R.nx + '×' + R.ny + ', ' + rasBuf.length + ' б');

  files.push({ name: prefix + '.ras', data: rasBuf }, { name: prefix + '.xah', data: xahBuf });
  if (o.places) {
    const cities = [...new Set((o.places.features || o.places)
      .map((f) => (f.properties ? f.properties.name : f.name)).filter(Boolean))].sort();
    const ort = zenamen.buildSection({ names: cities, country: CYPRUS, version: 3 });
    files.push({ name: prefix + '_0.ort', data: ort });
    log('.ort: городов ' + cities.length + ', ' + ort.length + ' б');
  }
  // Пустые заглушки почтовых индексов и глобальных POI: у всех 45 стран они
  // побайтно одинаковы, а прошивка их ищет (см. шапку файла).
  for (const ext of ['plz', 'poi']) {
    const e = ents.find((x) => new RegExp('_\\d+\\.' + ext + '$').test(x.name));
    if (e) files.push({ name: prefix + '_0.' + ext, data: fldb.read(db, e) });
  }
  // Область L3 номер 0 из всех тайлов (так объявлено в `L3 GRUPPEN`, `+0x50`
  // шапки и `+0xb4` шапки тайла).
  const area = emptyAreaFiles(rects.map((_, t) => t));
  for (const L of [3, 4]) {
    files.push({ name: prefix + '_0_' + L + '.b', data: area.b });
    files.push({ name: prefix + '_0_' + L + '.v', data: area.v });
  }
  files.push({ name: prefix + '_4.b', data: globalL4(N) });
  files.sort((a, b) => (a.name < b.name ? -1 : 1));

  const container = buildContainer(files, headSrc);
  return { container, files, xah: xahBuf, tiles, graph, sp, blocks, turns,
           nodes: graph.nodes.length, edges: graph.edges.length, bbox: box };
}

// Сверка с исходным графом: каждое ребро графа обязано найтись в тайлах ровно
// один раз — целиком в одном тайле или кусками через узлы разреза, — а
// кусков в тайлах ровно столько, сколько их сделал разрез. Рёбра читаются из
// собранных файлов (`xacgraph.tileEdges`), узлы разреза — по координатам.
function verifyEdges(r) {
  const key = (p) => p.x + ',' + p.y;
  const cut = new Set();
  r.sp.tiles.forEach((tl) => tl.links.forEach((l) => cut.add(key(tl.nodes[l.node]))));
  const at = new Map(), list = [];
  let lost = 0;
  for (const t of r.tiles) {
    const got = xg.tileEdges(xac.sections(t.file).list.filter((x) => x.name === 'VEKTORBLOCK')
      .map((x) => t.file.subarray(x.offset, x.offset + x.total)));
    lost += got.lost;
    for (const k of got.edges) {
      const [a, b] = k.split('->'), i = list.length;
      list.push([a, b]);
      for (const c of [a, b]) if (cut.has(c)) { if (!at.has(c)) at.set(c, []); at.get(c).push(i); }
    }
  }
  // куски склеиваются в исходные рёбра по узлам разреза
  const seen = new Set(), whole = new Map();
  let badCut = 0;
  list.forEach(([a, b], i) => {
    if (seen.has(i) || cut.has(a) && cut.has(b)) return;
    let end = cut.has(a) ? a : b, far = cut.has(a) ? b : a, cur = i;
    seen.add(i);
    while (cut.has(end)) {
      const nx = (at.get(end) || []).filter((j) => j !== cur);
      if (nx.length !== 1) { badCut++; break; }
      cur = nx[0]; seen.add(cur);
      end = list[cur][0] === end ? list[cur][1] : list[cur][0];
    }
    const k = [far, end].sort().join('-');
    whole.set(k, (whole.get(k) || 0) + 1);
  });
  let once = 0, twice = 0, missing = 0;
  for (const e of r.graph.edges) {
    const n = whole.get([key(r.graph.nodes[e.a]), key(r.graph.nodes[e.b])].sort().join('-')) || 0;
    if (n === 1) once++; else if (n) twice++; else missing++;
  }
  const pieces = r.sp.halves.reduce((a, h) => a + h.length, 0);
  return { edges: r.graph.edges.length, once, twice, missing, extra: whole.size - once - twice,
           pieces, read: list.length, unused: list.length - seen.size, badCut, lost };
}

module.exports = { mkxac, buildXah, buildContainer, strukturRecord, levelRow, verifyEdges,
                   rasterSection, stubLevel2, readHouses, emptyAreaFiles, globalL4, urbanIndex,
                   EMPTY_ZF, CYPRUS };

if (require.main === module) {
  const args = process.argv.slice(2);
  const out = args[0];
  const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
  if (!out || out.startsWith('--')) {
    console.error('использование: node src/mkxac.js <выход.db> [--roads ...] [--places ...] [--houses ...] [--tile-nodes 65000]');
    process.exit(2);
  }
  const places = flag('places', 'out/cyp/places_geo.json');
  const houses = flag('houses', 'out/cyp/cyprus-latest.osm.pbf');
  const r = mkxac({
    roads: flag('roads', 'out/cyp/roads.geojson'),
    classes: flag('classes', require('./mkcyprus').DEFAULT_CLASSES.join(',')).split(','),
    places: fs.existsSync(places) ? JSON.parse(fs.readFileSync(places, 'utf8')) : null,
    houses: fs.existsSync(houses) ? readHouses(houses) : null,
    code: flag('code', 'CY00'),
    tileNodes: +flag('tile-nodes', 65000),
    log: (m) => console.log(m),
  });

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, r.container);
  console.log('контейнер ' + r.container.length + ' байт (' +
              (r.container.length / 1048576).toFixed(2) + ' МБ), файлов ' + r.files.length);

  // ---- сверка с исходным графом; набор целиком сверяет src/setcheck.js ----
  const v = verifyEdges(r);
  console.log('рёбра графа: ' + v.edges + ', ровно один раз ' + v.once + ', дважды ' + v.twice +
              ', нет ' + v.missing + ', лишних ' + v.extra + '; кусков в тайлах ' + v.read +
              ' (разрез дал ' + v.pieces + '), не склеено ' + v.unused + ', сбоев склейки ' + v.badCut +
              ', неразобранных ссылок ' + v.lost);
  let names = 0, hit = 0, coords = 0;
  for (const t of r.tiles) {
    const n = roads.verifyNames(t.file, t.graph, t.built);
    names += n.total; hit += n.hit; coords += n.coords;
  }
  console.log('ссылки «имя -> дорога»: ' + names + ', попали в запись ' + hit + ', концы совпали ' + coords);
  const bad = v.once !== v.edges || v.extra || v.read !== v.pieces || v.unused || v.badCut || v.lost ||
              hit !== names || coords !== names;
  console.log(bad ? 'ЕСТЬ РАСХОЖДЕНИЯ' : 'расхождений нет');
  process.exit(bad ? 1 : 0);
}
