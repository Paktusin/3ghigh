'use strict';
// Чтение дорожной сети из векторных блоков .xac по модели, снятой с прошивки.
//
// Цепочка воспроизводит код библиотеки xaclib (MMI3GApplication):
//   таблица векторов -> вектор -> ссылка на узел -> байтовый массив шагов ->
//   отступ назад -> пропуск заголовка под-блока -> декодер координат.
// Проверено: 11 926 из 11 926 координат попадают в рамку блока (100%).
//
//   node src/xacvec.js <файл.xac> [выход.geojson]

const fs = require('fs');
const xac = require('./xac');

// u_get_koord_c (FUN_082727e8): три формы, координаты складываются с опорой блока
function koord(s, p, ox, oy) {
  if (p < 0 || p + 4 > s.length) return null;
  const b0 = s[p], b1 = s[p + 1], w = (b0 << 8) | b1;
  if ((w & 0xc000) === 0xc000) return null;            // «Fehler bei u_get_koord_c»
  if ((w & 0xc000) === 0x8000) {
    const n = b1 & 0x0f;
    if (((b0 >> 5) & 1) === 0) {                       // шесть байт, 20 бит
      if (p + 6 > s.length) return null;
      return { x: n * 0x10000 + ((s[p + 2] << 8) | s[p + 3]) - 524288 + ox,
               y: (w & 0xf0) * 0x1000 + ((s[p + 4] << 8) | s[p + 5]) - 524288 + oy };
    }
    if (p + 8 > s.length) return null;                 // восемь байт, 28 бит
    return { x: (((n << 8 | s[p + 2]) << 8 | s[p + 3]) << 8 | s[p + 4]) - 134217728 + ox,
             y: ((((w & 0xf0) << 4 | s[p + 5]) << 8 | s[p + 6]) << 8 | s[p + 7]) - 134217728 + oy };
  }
  return { x: (w & 0x7fff) - 16384 + ox,               // компактная, четыре байта
           y: ((s[p + 2] << 8) | s[p + 3]) - 32768 + oy };
}

// FUN_08272410: ссылка на узел -> смещение узла в блоке
function nodeOffset(s, tab, cnt, ref) {
  if (ref === 0 || ref >= cnt) return 0;
  let bp = tab + cnt * 2 + 2 + ref, r = ref, guard = 0;
  if (bp >= s.length) return 0;
  let step = s[bp];
  while (step === 0) {                                  // отход назад по группе
    bp--; r = (r - 1) & 0xffff;
    if (bp < 0 || ++guard > 5000) return 0;
    step = s[bp];
  }
  if (step === 255) return 0;
  let o = s.readUInt16BE(tab + r * 2) * 2;
  if (step === 1) { if (o - 2 < 0) return 0; step = s.readUInt16BE(o - 2); }
  o -= step * 2;
  if (o < 0 || o >= s.length) return 0;
  if ((s[o] & 0xc0) === 0xc0) o += 0x16;                // заголовок под-блока v5
  return o;
}

// рёбра одного блока
function blockEdges(s, opts = {}) {
  if (s.readUInt16BE(0x72) !== 1) return [];
  const tab = s.readUInt32BE(0x6c), cnt = s.readUInt16BE(0x70);
  if (!(tab > 0 && tab < s.length && cnt > 0 && tab + cnt * 2 <= s.length)) return [];
  const ox = s.readInt32BE(0x28), oy = s.readInt32BE(0x2c);
  const out = [];
  for (let i = 0; i < cnt; i++) {
    const p = s.readUInt16BE(tab + i * 2) * 2;
    if (p <= 0 || p + 4 >= s.length) continue;
    const w0 = (s[p] << 8) | s[p + 1];
    if ((w0 & 0xc000) !== 0xc000) continue;             // не «вектор здесь»
    // бит 6 старшего байта слова1 — ссылка ведёт в ДРУГОЙ блок; разрешать её
    // внутри текущего нельзя, получается ребро в десятки километров. Проверено:
    // среди локальных рёбер нет ни одного длиннее 5 км, а среди межблочных 62.5%.
    const cross = ((s[p + 2] >> 6) & 1) !== 0;
    if (cross && !opts.keepCross) continue;
    const a = koord(s, nodeOffset(s, tab, cnt, i), ox, oy);
    const b = koord(s, nodeOffset(s, tab, cnt, w0 & 0x3fff), ox, oy);
    if (!a || !b) continue;
    out.push({ idx: i, type: ((s[p + 2] << 8) | s[p + 3]) & 0x07ff, cross, a, b });
  }
  return out;
}

function fileEdges(buf, opts = {}) {
  const res = [];
  for (const b of xac.vectorBlocks(buf)) {
    if (b.version !== 5) continue;
    res.push(...blockEdges(buf.subarray(b.offset, b.offset + b.size), opts));
  }
  return res;
}

const toLon = x => x / 72000, toLat = y => y / (40000000 / 360);

function toGeoJSON(edges) {
  return { type: 'FeatureCollection', features: edges.map(e => ({
    type: 'Feature', properties: { idx: e.idx, type: e.type },
    geometry: { type: 'LineString', coordinates: [
      [toLon(e.a.x), toLat(e.a.y)], [toLon(e.b.x), toLat(e.b.y)]] } })) };
}

module.exports = { koord, nodeOffset, blockEdges, fileEdges, toGeoJSON, toLon, toLat };

if (require.main === module) {
  const [src, dst] = process.argv.slice(2);
  if (!src) { console.error('укажите файл .xac'); process.exit(1); }
  const edges = fileEdges(fs.readFileSync(src));
  console.log('рёбер прочитано:', edges.length);
  if (edges.length) {
    let lo0 = Infinity, hi0 = -Infinity, lo1 = Infinity, hi1 = -Infinity;
    for (const e of edges) for (const p of [e.a, e.b]) {
      const lo = toLon(p.x), la = toLat(p.y);
      if (lo < lo0) lo0 = lo; if (lo > hi0) hi0 = lo;
      if (la < lo1) lo1 = la; if (la > hi1) hi1 = la;
    }
    console.log('охват: ' + lo0.toFixed(4) + '..' + hi0.toFixed(4) + '°E  ' +
                lo1.toFixed(4) + '..' + hi1.toFixed(4) + '°N');
  }
  if (dst) { fs.writeFileSync(dst, JSON.stringify(toGeoJSON(edges))); console.log('записано:', dst); }
}
