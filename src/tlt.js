'use strict';
// Тело таблицы локаций TMC (.tlt), см. docs/formats/tmc.md.
// Блоки: метка 16 байт + u32BE размер (считается от +0x14) + u32 0, данные с +0x18.

const fs = require('fs');
const zfnamen = require('./zfnamen');

function chunk(d, tag) {
  const i = d.indexOf('TMC-LOC-TABLE ' + tag);
  if (i < 0) return null;
  return d.subarray(i + 0x18, i + 0x14 + d.readUInt32BE(i + 16));
}

// XY00 — по FUN_08276e2c. На локацию две точки (начало, конец), дельты от
// опорной точки, накопительно внутри диапазона. Координаты в единицах XAC.
function xy(d) {
  const c = chunk(d, 'XY');
  const x0 = c.readUInt32BE(0x10);
  if (!x0 || c.toString('latin1', x0, x0 + 4) !== 'XY00') return [];
  const b = c.subarray(x0);
  const first = b.readUInt16BE(4), out = [];
  for (let r = 0, n = b.readUInt16BE(0x12); r < n; r++) {
    const e = 0x14 + r * 6;
    let p = (b[e + 3] << 16) | b.readUInt16BE(e + 4), cur = 0, left = 0;
    const bit = () => { if (!left) { cur = b[p++]; left = 8; } return (cur >> --left) & 1; };
    const num = () => { let v = 0; while (bit()) v = v * 256 + b[p++]; while (bit()) v = v * 2 + bit(); return v; };
    let x = b.readInt32BE(8), y = b.readInt32BE(12), s;
    for (let k = 0; k < b[e + 2] * 2; k++) {
      if (bit()) {
        let v = num(); if (v) x += bit() ? -v : v;
        v = num(); if (v) y += bit() ? -v : v;
      }
      if (k & 1) out.push({ loc: first + b.readUInt16BE(e) + (k >> 1), start: s, end: [x, y] });
      else s = [x, y];
    }
  }
  return out;
}

// BS00 — записи локаций, по FUN_0827659c. Группа = 16 кодов; бит 0 — пустая,
// иначе G бит длины группы в битах, маска полей, слоты с битом присутствия.
function records(d) {
  const c = chunk(d, '  ');
  const b = c.subarray(c.readUInt32BE(4));
  if (b.toString('latin1', 0, 4) !== 'BS00') return [];
  const F = b[4], N = b[5], C = b[6], G = b[7], out = [];
  let pos = 0;
  const rd = n => { let v = 0; for (let i = 0; i < n; i++, pos++) v = v * 2 + ((b[10 + (pos >> 3)] >> (7 - (pos & 7))) & 1); return v; };
  // 2 бита: 0 — нет, 1 — подразумеваемое, 2 — w бит, 3 — старший бит + w бит
  let explicit;
  const coded = (w, implied) => {
    const v = rd(2);
    explicit = v >= 2;
    if (v === 0) return 0;
    if (v === 1) return implied;
    return (v === 3 ? 1 << w : 0) | rd(w);
  };
  for (let r = 0, nr = b.readUInt16BE(10); r < nr; r++) {
    const e = 0xc + r * 8;
    pos = b.readUInt32BE(e + 4);
    for (let g = b.readUInt16BE(e), hi = b.readUInt16BE(e + 2); g <= hi; g++) {
      if (!rd(1)) continue;
      const end = rd(G) + pos;
      const mask = (F & 2) ? rd((F & 1) + 4) : rd(3) * 2; // ветка без F&2 — ширина догадкой, у заводских F=3
      let type = 0, pa = 0, pc = 0, pn = 0;
      for (let s = 0; s < 16 && pos < end; s++) {
        if (!rd(1)) continue;
        const loc = g * 16 + s, R = { loc };
        const t = rd(2);
        R.flag = t >> 1;
        if (!(t & 1)) type = rd(7);
        R.type = type;
        R.neg = coded(15, loc - 1);
        R.pos = coded(15, loc + 1);
        R.area = 0;
        if (mask & 16) { R.area = coded(15, pc); if (explicit) pc = R.area; }
        R.line = 0;
        if (mask & 8) { R.line = coded(15, pa); if (explicit) pa = R.line; }
        R.n10 = coded(N - 1, pn);
        if (explicit) pn = R.n10;
        if (mask & 4 && rd(1)) R.n14 = rd(N);
        if (rd(1)) R.n18 = rd(N);
        if (mask & 2 && rd(1)) R.n1c = rd(N);
        if (mask & 1) { if (rd(1)) R.x20 = rd(C); if (rd(1)) R.x24 = rd(C); }
        out.push(R);
      }
      if (pos !== end) throw new Error(`BS00: группа ${g} разошлась с длиной на ${pos - end} бит`);
    }
  }
  return out;
}

// SP01/SP02 — имена, по FUN_08277110. Сжатие то же, что у ZF-NAMEN; словарь
// фрагментов в начале блока. У SP02 после имени — байт общей приставки
// со следующим (внутри группы из 16 имён).
function names(d) {
  const c = chunk(d, '  ');
  const s = c.subarray(c.readUInt32BE(8));
  const magic = s.toString('latin1', 0, 4);
  if (magic !== 'SP01' && magic !== 'SP02') return [];
  const n = s.readUInt32BE(4), tsz = s.readUInt32BE(8), t = s.subarray(12);
  const tok = [];
  for (let o = 0; o < tsz; o += 10) { let e = o; while (e < o + 10 && t[e]) e++; tok.push(t.subarray(o, e)); }
  const idx = tsz, body = tsz + ((n + 15) >> 4) * 2, out = [];
  for (let g = 0; g < n; g += 16) {
    let p = body + t.readUInt16BE(idx + (g >> 4) * 2) * 8, prev = '', pre = 0;
    for (let i = g; i < Math.min(n, g + 16); i++) {
      const r = zfnamen.decode(t, p, tok);
      if (r.err) throw new Error(`имя ${i}: ${r.err}`);
      prev = prev.slice(0, pre) + r.text;
      out.push(prev);
      p = r.end;
      if (magic === 'SP02') pre = t[p++];
    }
  }
  return out;
}

module.exports = { chunk, xy, records, names };

if (require.main === module) {
  const pts = xy(fs.readFileSync(process.argv[2]));
  const xs = pts.flatMap(q => [q.start[0], q.end[0]]), ys = pts.flatMap(q => [q.start[1], q.end[1]]);
  const lon = v => (v / 72000).toFixed(3), lat = v => (v / (40000000 / 360)).toFixed(3);
  console.log('локаций', pts.length, ' долгота', lon(Math.min(...xs)), '…', lon(Math.max(...xs)),
    ' широта', lat(Math.min(...ys)), '…', lat(Math.max(...ys)));
}
