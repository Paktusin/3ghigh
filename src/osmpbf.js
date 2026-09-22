'use strict';
// Читатель `.osm.pbf` — извлечений OpenStreetMap (Geofabrik и прочие).
//
//   node src/osmpbf.js <файл.osm.pbf> [--addr | --stats]
//
// Зачем свой. Overpass из нашей сети отвечает 406, а извлечение по стране
// Geofabrik отдаёт без вопросов. Зависимостей в проекте нет и заводить их не
// хочется, а формат небольшой: контейнер из блоков, внутри protobuf, сжатый
// zlib. Ниже ровно столько protobuf, сколько нужно для узлов, линий и тегов.
//
// Устройство файла:
//
//   u32 BE длина BlobHeader
//   BlobHeader  поле 1 — тип («OSMHeader» или «OSMData»), поле 3 — длина Blob
//   Blob        поле 1 — несжатые байты, поле 3 — сжатые zlib
//   OSMData     PrimitiveBlock: поле 1 — таблица строк, поле 2 — группы,
//               поле 17 — зернистость координат, поля 19 и 20 — их смещения
//
// Координаты: градусы = 1e-9 * (смещение + зернистость * значение). Храним их
// целыми в стотысячных долях градуса (1e-7), как это делает сам OSM.
//
// Узлы приходят «плотной» записью (DenseNodes): номера и координаты лежат
// разностями, а теги — сплошным потоком пар «ключ, значение» с нулём в конце
// каждого узла.

const fs = require('fs');
const zlib = require('zlib');

// --- protobuf, только нужное ------------------------------------------------

// Варинт. Числа читаем в double: номера OSM меньше 2^53, этого хватает.
function varint(b, p) {
  let v = 0, mul = 1, byte;
  do {
    byte = b[p++];
    v += (byte & 0x7f) * mul;
    mul *= 128;
  } while (byte & 0x80);
  return [v, p];
}

// Зигзаг: чётные — положительные, нечётные — отрицательные.
const zig = (v) => (v % 2 === 0 ? v / 2 : -(v + 1) / 2);

// Обойти поля сообщения, отдавая их в обработчик.
// `cb(номер поля, тип, значение, начало, конец)`; для типа 2 значение — срез.
function fields(b, from, to, cb) {
  let p = from;
  while (p < to) {
    let key; [key, p] = varint(b, p);
    const num = Math.floor(key / 8), wire = key % 8;
    if (wire === 0) { let v; [v, p] = varint(b, p); cb(num, wire, v); }
    else if (wire === 2) {
      let len; [len, p] = varint(b, p);
      cb(num, wire, null, p, p + len);
      p += len;
    } else if (wire === 5) { cb(num, wire, b.readUInt32LE(p)); p += 4; }
    else if (wire === 1) { cb(num, wire, Number(b.readBigUInt64LE(p))); p += 8; }
    else throw new Error('неизвестный тип поля protobuf: ' + wire);
  }
}

// Упакованный список варинтов.
function packed(b, from, to, zigzag) {
  const out = [];
  let p = from;
  while (p < to) { let v; [v, p] = varint(b, p); out.push(zigzag ? zig(v) : v); }
  return out;
}

// --- контейнер --------------------------------------------------------------

// Обойти блоки файла: отдаём тип и распакованное тело.
function blocks(buf, cb) {
  let p = 0;
  while (p + 4 <= buf.length) {
    const hdrLen = buf.readUInt32BE(p);
    p += 4;
    let type = null, dataLen = 0;
    fields(buf, p, p + hdrLen, (num, wire, val, a, z) => {
      if (num === 1 && wire === 2) type = buf.toString('latin1', a, z);
      if (num === 3 && wire === 0) dataLen = val;
    });
    p += hdrLen;
    const blobFrom = p, blobTo = p + dataLen;
    let body = null;
    fields(buf, blobFrom, blobTo, (num, wire, val, a, z) => {
      if (num === 1 && wire === 2) body = buf.subarray(a, z);              // без сжатия
      if (num === 3 && wire === 2) body = zlib.inflateSync(buf.subarray(a, z));
    });
    p = blobTo;
    if (type === 'OSMData' && body) cb(body);
  }
}

// --- разбор -----------------------------------------------------------------

// Таблица строк блока: поле 1, повторяющееся.
function stringTable(b, from, to) {
  const out = [];
  fields(b, from, to, (num, wire, val, a, z) => {
    if (num === 1 && wire === 2) out.push(b.toString('utf8', a, z));
  });
  return out;
}

// Разобрать один PrimitiveBlock.
function primitiveBlock(b, sink) {
  let strs = null, gran = 100, latOff = 0, lonOff = 0;
  const groups = [];
  fields(b, 0, b.length, (num, wire, val, a, z) => {
    if (num === 1 && wire === 2) strs = stringTable(b, a, z);
    else if (num === 2 && wire === 2) groups.push([a, z]);
    else if (num === 17 && wire === 0) gran = val;
    else if (num === 19 && wire === 0) latOff = zig(val) * 0 + val;   // всегда 0 у извлечений
    else if (num === 20 && wire === 0) lonOff = val;
  });
  const deg = (raw, off) => Math.round((off + gran * raw) / 100);     // 1e-9 -> 1e-7
  for (const [a, z] of groups) {
    fields(b, a, z, (num, wire, val, ga, gz) => {
      if (wire !== 2) return;
      if (num === 2) denseNodes(b, ga, gz, strs, deg, latOff, lonOff, sink);
      else if (num === 1) plainNode(b, ga, gz, strs, deg, latOff, lonOff, sink);
      else if (num === 3) way(b, ga, gz, strs, sink);
    });
  }
}

function denseNodes(b, from, to, strs, deg, latOff, lonOff, sink) {
  let ids = null, lats = null, lons = null, kv = null;
  fields(b, from, to, (num, wire, val, a, z) => {
    if (wire !== 2) return;
    if (num === 1) ids = packed(b, a, z, true);
    else if (num === 8) lats = packed(b, a, z, true);
    else if (num === 9) lons = packed(b, a, z, true);
    else if (num === 10) kv = packed(b, a, z, false);
  });
  if (!ids) return;
  let id = 0, lat = 0, lon = 0, k = 0;
  for (let i = 0; i < ids.length; i++) {
    id += ids[i]; lat += lats[i]; lon += lons[i];
    let tags = null;
    if (kv) {
      while (k < kv.length && kv[k] !== 0) {
        (tags || (tags = {}))[strs[kv[k]]] = strs[kv[k + 1]];
        k += 2;
      }
      k++;                                            // ноль-разделитель
    }
    sink.node(id, deg(lon, lonOff), deg(lat, latOff), tags);
  }
}

function plainNode(b, from, to, strs, deg, latOff, lonOff, sink) {
  let id = 0, lat = 0, lon = 0, keys = [], vals = [];
  fields(b, from, to, (num, wire, val, a, z) => {
    if (num === 1 && wire === 0) id = zig(val);
    else if (num === 8 && wire === 0) lat = zig(val);
    else if (num === 9 && wire === 0) lon = zig(val);
    else if (num === 2 && wire === 2) keys = packed(b, a, z, false);
    else if (num === 3 && wire === 2) vals = packed(b, a, z, false);
  });
  let tags = null;
  for (let i = 0; i < keys.length; i++) (tags || (tags = {}))[strs[keys[i]]] = strs[vals[i]];
  sink.node(id, deg(lon, lonOff), deg(lat, latOff), tags);
}

function way(b, from, to, strs, sink) {
  let id = 0, keys = [], vals = [], refs = null;
  fields(b, from, to, (num, wire, val, a, z) => {
    if (num === 1 && wire === 0) id = val;
    else if (num === 2 && wire === 2) keys = packed(b, a, z, false);
    else if (num === 3 && wire === 2) vals = packed(b, a, z, false);
    else if (num === 8 && wire === 2) refs = packed(b, a, z, true);
  });
  let tags = null;
  for (let i = 0; i < keys.length; i++) (tags || (tags = {}))[strs[keys[i]]] = strs[vals[i]];
  if (!tags) return;
  let node = 0;
  const list = new Array(refs ? refs.length : 0);
  for (let i = 0; refs && i < refs.length; i++) { node += refs[i]; list[i] = node; }
  sink.way(id, tags, list);
}

// --- удобный вход -----------------------------------------------------------

// Прочитать файл. `opts.node(tags)` и `opts.way(tags)` решают, что оставить;
// координаты ВСЕХ узлов складываются в индекс, чтобы считать середины линий.
//
// Возвращает { n, ids, lons, lats, points, ways }: `ids` отсортированы по
// возрастанию (так их пишет OSM), координаты в 1e-7 градуса.
function read(path, opts) {
  const o = opts || {};
  const buf = fs.readFileSync(path);
  let cap = 1 << 20, n = 0;
  let ids = new Float64Array(cap), lons = new Int32Array(cap), lats = new Int32Array(cap);
  const points = [], ways = [];
  const sink = {
    node(id, lon, lat, tags) {
      if (n === cap) {
        cap *= 2;
        const i2 = new Float64Array(cap); i2.set(ids); ids = i2;
        const x2 = new Int32Array(cap); x2.set(lons); lons = x2;
        const y2 = new Int32Array(cap); y2.set(lats); lats = y2;
      }
      ids[n] = id; lons[n] = lon; lats[n] = lat; n++;
      if (tags && (!o.node || o.node(tags))) points.push({ id, lon, lat, tags });
    },
    way(id, tags, refs) {
      if (!o.way || o.way(tags)) ways.push({ id, tags, refs });
    },
  };
  blocks(buf, (body) => primitiveBlock(body, sink));
  return { n, ids, lons, lats, points, ways };
}

// Координата узла по номеру: двоичный поиск в отсортированном индексе.
function coord(idx, id) {
  let lo = 0, hi = idx.n - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1, v = idx.ids[m];
    if (v === id) return [idx.lons[m], idx.lats[m]];
    if (v < id) lo = m + 1; else hi = m - 1;
  }
  return null;
}

// Середина линии по её узлам (среднее координат, каких нашли).
function center(idx, refs) {
  let x = 0, y = 0, k = 0;
  for (const r of refs) {
    const c = coord(idx, r);
    if (!c) continue;
    x += c[0]; y += c[1]; k++;
  }
  return k ? [Math.round(x / k), Math.round(y / k)] : null;
}

module.exports = { read, blocks, coord, center, varint, zig, fields, packed };

if (require.main === module) {
  const path = process.argv[2];
  if (!path) {
    console.error('использование: node src/osmpbf.js <файл.osm.pbf> [--addr]');
    process.exit(1);
  }
  const t0 = Date.now();
  const addr = process.argv.includes('--addr');
  const idx = read(path, addr ? {
    node: (t) => t['addr:housenumber'] !== undefined,
    way: (t) => t['addr:housenumber'] !== undefined || t.highway !== undefined,
  } : { node: () => false, way: () => false });
  console.log('узлов ' + idx.n + ', отобрано точек ' + idx.points.length +
              ', линий ' + idx.ways.length + ' за ' + ((Date.now() - t0) / 1000).toFixed(1) + ' с');
  if (addr) {
    const wAddr = idx.ways.filter((w) => w.tags['addr:housenumber'] !== undefined);
    const withStreet = idx.points.filter((p) => p.tags['addr:street']).length +
                       wAddr.filter((w) => w.tags['addr:street']).length;
    console.log('домов: точками ' + idx.points.length + ', контурами ' + wAddr.length +
                ', из них с улицей ' + withStreet);
    const c = center(idx, wAddr.length ? wAddr[0].refs : []);
    if (c) console.log('пример контура: ' + JSON.stringify(wAddr[0].tags).slice(0, 90) +
      ' -> ' + (c[0] / 1e7).toFixed(5) + ', ' + (c[1] / 1e7).toFixed(5));
  }
}
