'use strict';
// Высоты для ступеней рельефа GDB (атрибут 0x60 | ступень<<8, L4…L11).
//
//   node src/dem.js --out out/cyp/bands.json [--land out/cyp/land.json]
//
// Источник — открытые тайлы высот Terrarium (AWS Open Data, «elevation-tiles-
// prod», зум 10, ~120 м на пиксель на широте Кипра): PNG, высота =
// R·256 + G + B/256 − 32768 м. Скачанное лежит в out/dem/terrarium/<z>/<x>/<y>.png
// и только читается (PNG разбираем сами: zlib + фильтры строк).
//
// Ступени завода (docs/formats/gdb.md): многоугольник «выше порога» вложен в
// предыдущий; пороги в десятках метров — 4 10 20 30 70 100 150 200 300 400
// 500 600 (по вершинам: Олимп 1952 м лежит в 150, не в 200; Псилоритис
// 2456 м — в 200; Монблан 4808 м — в 400).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BANDS = [4, 10, 20, 30, 70, 100, 150, 200, 300, 400, 500, 600];
const Z = 10;
const DIR = 'out/dem/terrarium';

const tx = (lon, z) => Math.floor((lon + 180) / 360 * (1 << z));
const ty = (lat, z) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * (1 << z));
const lonOf = (x, z) => x / (1 << z) * 360 - 180;
const latOf = (y, z) => { const n = Math.PI - 2 * Math.PI * y / (1 << z); return 180 / Math.PI * Math.atan(Math.sinh(n)); };

async function fetchTiles(bbox, z = Z) {
  const list = [];
  for (let x = tx(bbox[0], z); x <= tx(bbox[2], z); x++) {
    for (let y = ty(bbox[3], z); y <= ty(bbox[1], z); y++) list.push([x, y]);
  }
  for (const [x, y] of list) {
    const f = path.join(DIR, String(z), String(x), y + '.png');
    if (fs.existsSync(f)) continue;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const r = await fetch('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/' + z + '/' + x + '/' + y + '.png');
    if (!r.ok) throw new Error('тайл высот ' + z + '/' + x + '/' + y + ': HTTP ' + r.status);
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  }
  return list;
}

// PNG 8-бит RGB/RGBA без чересстрочности → массив высот 256×256
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('не PNG');
  let p = 8, w = 0, h = 0, ct = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8);
    const d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9];
      if (d[8] !== 8 || (ct !== 2 && ct !== 6) || d[12] !== 0) throw new Error('PNG: нужен 8-бит RGB(A) без чересстрочности');
    } else if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[dst + i - bpp] : 0, b = y ? px[dst - stride + i] : 0, c = i >= bpp && y ? px[dst - stride + i - bpp] : 0;
      let v = raw[src + i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + i] = v & 0xff;
    }
  }
  const hgt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) hgt[i] = px[i * bpp] * 256 + px[i * bpp + 1] + px[i * bpp + 2] / 256 - 32768;
  return { w, h, hgt };
}

// функция высоты по градусам (ближайший пиксель)
function heightFn(tiles, z = Z) {
  const cache = new Map();
  for (const [x, y] of tiles) cache.set(x + ',' + y, decodePng(fs.readFileSync(path.join(DIR, String(z), String(x), y + '.png'))).hgt);
  return (lon, lat) => {
    const fx = (lon + 180) / 360 * (1 << z);
    const fy = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * (1 << z);
    const t = cache.get(Math.floor(fx) + ',' + Math.floor(fy));
    if (!t) return 0;
    return t[Math.min(255, Math.floor((fy % 1) * 256)) * 256 + Math.min(255, Math.floor((fx % 1) * 256))];
  };
}

// Контуры области «маска = 1» на сетке nx×ny: направленные рёбра клеток,
// область слева (внешние кольца против часовой, дыры по часовой), сшитые в
// кольца; в седловой вершине поворачиваем влево — кольца остаются простыми.
function traceMask(mask, nx, ny) {
  const at = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && mask[j * nx + i];
  const out = new Map();                   // вершина → список направлений
  const add = (x0, y0, x1, y1) => { const k = x0 + ',' + y0; if (!out.has(k)) out.set(k, []); out.get(k).push([x1, y1]); };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!at(i, j)) continue;
      if (!at(i, j - 1)) add(i, j, i + 1, j);           // низ: вправо
      if (!at(i + 1, j)) add(i + 1, j, i + 1, j + 1);   // право: вверх
      if (!at(i, j + 1)) add(i + 1, j + 1, i, j + 1);   // верх: влево
      if (!at(i - 1, j)) add(i, j + 1, i, j);           // лево: вниз
    }
  }
  const rings = [];
  for (const [k0, list0] of out) {
    while (list0.length) {
      const [sx, sy] = k0.split(',').map(Number);
      let [cx, cy] = [sx, sy], dir = null;
      const ring = [];
      for (let guard = 0; guard < 1e7; guard++) {
        const list = out.get(cx + ',' + cy);
        if (!list || !list.length) break;
        let pick = 0;
        if (list.length > 1 && dir) {
          // левый поворот: из нескольких — тот, что левее текущего направления
          const score = ([nx2, ny2]) => { const d = [nx2 - cx, ny2 - cy]; return dir[0] * d[1] - dir[1] * d[0]; };
          pick = list.map(score).reduce((bi, s, i, a) => (s > a[bi] ? i : bi), 0);
        }
        const [nx2, ny2] = list.splice(pick, 1)[0];
        const nd = [nx2 - cx, ny2 - cy];
        if (!dir || nd[0] !== dir[0] || nd[1] !== dir[1]) ring.push([cx, cy]);     // только углы
        dir = nd; cx = nx2; cy = ny2;
        if (cx === sx && cy === sy) break;
      }
      if (ring.length >= 4) rings.push(ring);
    }
  }
  return rings;
}

// Ступени рельефа: { bands: [{ h, rings: [[[lon, lat]…]…] }] }
function bandRings(hfn, bbox, step = 0.0015, bands = BANDS) {
  const nx = Math.ceil((bbox[2] - bbox[0]) / step), ny = Math.ceil((bbox[3] - bbox[1]) / step);
  const H = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = hfn(bbox[0] + (i + 0.5) * step, bbox[1] + (j + 0.5) * step);
  const out = [];
  for (const b of bands) {
    const m = new Uint8Array(nx * ny);
    let any = 0;
    for (let k = 0; k < m.length; k++) if (H[k] >= b * 10) { m[k] = 1; any++; }
    if (!any) continue;
    const rings = traceMask(m, nx, ny).map(r => r.map(([i, j]) => [bbox[0] + i * step, bbox[1] + j * step]));
    out.push({ h: b, rings, cells: any });
  }
  return out;
}

module.exports = { BANDS, decodePng, traceMask, bandRings, heightFn, fetchTiles };

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const i = args.indexOf('--out');
    const out = i >= 0 ? args[i + 1] : 'out/cyp/bands.json';
    const bbox = [32.2, 34.5, 34.65, 35.75];
    const tiles = await fetchTiles(bbox);
    const hfn = heightFn(tiles);
    const res = bandRings(hfn, bbox);
    for (const b of res) b.rings = b.rings.map(r => r.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]));
    fs.writeFileSync(out, JSON.stringify({ source: 'terrarium z' + Z, bands: res }));
    for (const b of res) console.log('ступень ' + String(b.h * 10).padStart(5) + ' м: колец ' + b.rings.length + ', клеток ' + b.cells);
    console.log('Олимп (32.864, 34.936): ' + hfn(32.864, 34.936).toFixed(0) + ' м -> ' + out);
  })().catch(e => { console.error(e.message); process.exit(1); });
}
