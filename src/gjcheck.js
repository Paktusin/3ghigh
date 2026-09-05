'use strict';
// Проверка GeoJSON и рисование сети прямо в терминале.
// Использование: node src/gjcheck.js <файл.geojson> [ширина]

const fs = require('fs');

const file = process.argv[2];
const W = Number(process.argv[3]) || 78;
if (!file) { console.error('использование: node src/gjcheck.js <файл.geojson> [ширина]'); process.exit(1); }

let gj;
try { gj = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (e) { console.error('не разобрался как JSON:', e.message); process.exit(1); }

const problems = [];
if (gj.type !== 'FeatureCollection') problems.push('корневой type не FeatureCollection');
if (!Array.isArray(gj.features)) problems.push('features не массив');

let pts = 0, lines = 0;
const all = [];
for (const f of gj.features || []) {
  const g = f.geometry;
  if (!g) { problems.push('объект без geometry'); continue; }
  const coords = g.type === 'Point' ? [g.coordinates]
    : g.type === 'LineString' ? g.coordinates : null;
  if (!coords) { problems.push('неизвестный тип геометрии: ' + g.type); continue; }
  if (g.type === 'Point') pts++; else lines++;
  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) { problems.push('координата не пара'); continue; }
    const [lon, lat] = c;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) { problems.push('NaN в координатах'); continue; }
    if (lon < -180 || lon > 180) problems.push('долгота вне -180..180: ' + lon);
    if (lat < -90 || lat > 90) problems.push('широта вне -90..90: ' + lat);
    all.push([lon, lat]);
  }
}

const lons = all.map(c => c[0]), lats = all.map(c => c[1]);
const W0 = Math.min(...lons), E0 = Math.max(...lons);
const S0 = Math.min(...lats), N0 = Math.max(...lats);

console.log('файл      :', file);
console.log('объектов  :', (gj.features || []).length, '— точек:', pts, ' линий:', lines);
console.log('координат :', all.length);
console.log('охват     :', S0.toFixed(5) + '..' + N0.toFixed(5), 'с.ш.,',
  W0.toFixed(5) + '..' + E0.toFixed(5), 'в.д.');
console.log('размер    :',
  ((E0 - W0) * 111320 * Math.cos((S0 + N0) / 2 * Math.PI / 180) / 1000).toFixed(2), 'x',
  ((N0 - S0) * 111132 / 1000).toFixed(2), 'км');
console.log('проверка  :', problems.length ? 'ОШИБКИ (' + problems.length + ')' : 'структура корректна');
for (const p of [...new Set(problems)].slice(0, 5)) console.log('   ' + p);

// рисунок: линии растеризуем по Брезенхэму, точки помечаем отдельно
const aspect = Math.cos((S0 + N0) / 2 * Math.PI / 180);
const H = Math.max(8, Math.round(W * ((N0 - S0) / ((E0 - W0) * aspect)) * 0.5));
const grid = Array.from({ length: H }, () => new Array(W).fill(' '));
const px = lon => Math.min(W - 1, Math.max(0, Math.round((lon - W0) / (E0 - W0 || 1) * (W - 1))));
const py = lat => Math.min(H - 1, Math.max(0, Math.round((N0 - lat) / (N0 - S0 || 1) * (H - 1))));

for (const f of gj.features || []) {
  if (f.geometry.type !== 'LineString') continue;
  const [a, b] = f.geometry.coordinates;
  let x0 = px(a[0]), y0 = py(a[1]);
  const x1 = px(b[0]), y1 = py(b[1]);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    grid[y0][x0] = grid[y0][x0] === ' ' ? '.' : grid[y0][x0];
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
for (const f of gj.features || []) {
  if (f.geometry.type !== 'Point') continue;
  const [lon, lat] = f.geometry.coordinates;
  grid[py(lat)][px(lon)] = 'o';
}

console.log();
console.log('  ' + N0.toFixed(4) + ' с.ш.');
for (const row of grid) console.log('  ' + row.join(''));
console.log('  ' + S0.toFixed(4) + ' с.ш.   ' + W0.toFixed(4) + '..' + E0.toFixed(4) + ' в.д.');
console.log('  (o — узлы, точки — рёбра)');
