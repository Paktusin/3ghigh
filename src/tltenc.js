'use strict';
// Сборка таблицы локаций TMC (.tlt) — обратное к src/tlt.js, раскладка в docs/formats/tmc.md.

const zfnamen = require('./zfnamen');

const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); return b; };
const pad = (b, a) => Buffer.concat([b, Buffer.alloc((a - b.length % a) % a)]);
const pack = bits => { const o = Buffer.alloc((bits.length + 7) >> 3); bits.forEach((v, i) => { if (v) o[i >> 3] |= 0x80 >> (i & 7); }); return o; };
const width = v => Math.max(1, Math.ceil(Math.log2(v + 1)));

// BS00. recs — как отдаёт tlt.records; N — разрядность id имён, C — полей x20/x24.
function bs00(recs, N, C, ranges = 64) {
  const groups = new Map();
  for (const r of recs) { const g = r.loc >> 4; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
  const keys = [...groups.keys()], g0 = Math.min(...keys), g1 = Math.max(...keys);
  const B = [], at = [];
  for (let g = g0; g <= g1; g++) {
    at.push(B.length);
    const rs = groups.get(g);
    if (!rs) { B.push(0); continue; }
    const W = [], put = (v, w) => { for (let i = w - 1; i >= 0; i--) W.push(Math.floor(v / 2 ** i) & 1); };
    const any = f => rs.some(f);
    const mask = (any(r => r.area) ? 16 : 0) | (any(r => r.line) ? 8 : 0) | (any(r => r.n14 !== undefined) ? 4 : 0) |
      (any(r => r.n1c !== undefined) ? 2 : 0) | (any(r => r.x20 !== undefined || r.x24 !== undefined) ? 1 : 0);
    put(mask, 5);
    // 0 — нет, 1 — подразумеваемое, 2 — w бит, 3 — старший бит + w бит
    const coded = (v, implied, w) => {
      if (!v) return put(0, 2), false;
      if (v === implied) return put(1, 2), false;
      if (v >= 1 << w) put(3, 2), put(v - (1 << w), w); else put(2, 2), put(v, w);
      return true;
    };
    const opt = (v, w) => { if (v === undefined) W.push(0); else W.push(1), put(v, w); };
    let type = 0, pa = 0, pc = 0, pn = 0, s = 0;
    for (const r of rs) {
      for (; s < (r.loc & 15); s++) W.push(0);
      W.push(1); s++;
      put(r.flag << 1 | (r.type === type ? 1 : 0), 2);
      if (r.type !== type) put(type = r.type, 7);
      coded(r.neg, r.loc - 1, 15);
      coded(r.pos, r.loc + 1, 15);
      if (mask & 16 && coded(r.area, pc, 15)) pc = r.area;
      if (mask & 8 && coded(r.line, pa, 15)) pa = r.line;
      if (coded(r.n10, pn, N - 1)) pn = r.n10;
      if (mask & 4) opt(r.n14, N);
      opt(r.n18, N);
      if (mask & 2) opt(r.n1c, N);
      if (mask & 1) opt(r.x20, C), opt(r.x24, C);
    }
    B.push(1);
    for (let i = 11; i >= 0; i--) B.push((W.length >> i) & 1);
    B.push(...W);
  }
  // диапазоны примерно равной длины в битах, как у завода (64…80 штук)
  const rt = [], step = B.length / ranges;
  for (let i = 0; i < at.length; i++) if (!rt.length || at[i] >= rt.length * step) rt.push(i);
  const start = 10 + Math.ceil((12 + rt.length * 8 - 10) / 4) * 4;
  const h = Buffer.alloc(start);
  h.write('BS00'); h[4] = 3; h[5] = N; h[6] = C; h[7] = 12; h.writeUInt16BE(rt.length, 10);
  rt.forEach((i, k) => {
    h.writeUInt16BE(g0 + i, 12 + k * 8);
    h.writeUInt16BE(g0 + (k + 1 < rt.length ? rt[k + 1] : at.length) - 1, 14 + k * 8);
    h.writeUInt32BE((start - 10) * 8 + at[i], 16 + k * 8);
  });
  return Buffer.concat([h, pack(B)]);
}

// SP02. names — отсортированные строки (id = номер + 1), tok — словарь фрагментов.
function sp02(names, tok) {
  const idx = zfnamen.tokenIndex(tok), dict = Buffer.alloc(tok.length * 10);
  tok.forEach((t, i) => t.copy(dict, i * 10));
  const cp = (a, b) => { let i = 0; while (i < a.length && i < 255 && a[i] === b[i]) i++; return i; };
  const ix = [], body = [];
  let len = 0;
  for (let g = 0; g < names.length; g += 16) {
    const fill = (8 - len % 8) % 8;
    body.push(Buffer.alloc(fill)); len += fill;
    ix.push(len / 8);
    let pre = 0;
    for (let i = g; i < Math.min(names.length, g + 16); i++) {
      const next = i + 1 < g + 16 && i + 1 < names.length ? cp(names[i], names[i + 1]) : 0;
      const b = Buffer.concat([zfnamen.encode(names[i].slice(pre), tok, idx), Buffer.from([next])]);
      body.push(b); len += b.length; pre = next;
    }
  }
  const h = Buffer.alloc(12 + dict.length + ix.length * 2);
  h.write('SP02'); h.writeUInt32BE(names.length, 4); h.writeUInt32BE(dict.length, 8);
  dict.copy(h, 12); ix.forEach((v, k) => h.writeUInt16BE(v, 12 + dict.length + k * 2));
  return Buffer.concat([h, ...body]);
}

// XY00. pts — [{loc, start:[x,y], end:[x,y]}] по возрастанию loc.
// Целые байты числа идут в поток после текущего байта битов — так читает FUN_08276e2c.
function xy00(pts) {
  const ref = [0, 1].map(k => Math.round(pts.reduce((s, q) => s + q.start[k] + q.end[k], 0) / pts.length / 2));
  const runs = [];
  for (const q of pts) {
    const r = runs[runs.length - 1];
    if (r && q.loc === r[r.length - 1].loc + 1 && r.length < 255) r.push(q); else runs.push([q]);
  }
  const first = pts[0].loc, head = Math.ceil((0x14 + runs.length * 6) / 4) * 4;
  const streams = runs.map(r => {
    const out = [];
    let slot = 0, left = 0;
    const bit = v => { if (!left) { slot = out.length; out.push(0); left = 8; } left--; if (v) out[slot] |= 1 << left; };
    const num = v => {
      const k = v ? width(v) % 8 : 0, hi = Math.floor(v / 2 ** k), bytes = [];
      for (let x = hi; x > 0; x = Math.floor(x / 256)) bytes.unshift(x % 256);
      for (const b of bytes) { bit(1); out.push(b); }
      bit(0);
      for (let i = k - 1; i >= 0; i--) { bit(1); bit((v >> i) & 1); }
      bit(0);
    };
    let [x, y] = ref;
    for (const q of r) for (const [nx, ny] of [q.start, q.end]) {
      const dx = nx - x, dy = ny - y;
      bit(dx || dy ? 1 : 0);
      if (dx || dy) { num(Math.abs(dx)); if (dx) bit(dx < 0 ? 1 : 0); num(Math.abs(dy)); if (dy) bit(dy < 0 ? 1 : 0); }
      x = nx; y = ny;
    }
    return Buffer.from(out);
  });
  const h = Buffer.alloc(head);
  h.write('XY00'); h.writeUInt16BE(first, 4); h.writeUInt16BE(pts[pts.length - 1].loc - first + 1, 6);
  h.writeInt32BE(ref[0], 8); h.writeInt32BE(ref[1], 12); h.writeUInt16BE(runs.length, 0x12);
  let off = head;
  runs.forEach((r, k) => {
    const e = 0x14 + k * 6;
    h.writeUInt16BE(r[0].loc - first, e); h[e + 2] = r.length;
    h[e + 3] = off >> 16; h.writeUInt16BE(off & 0xffff, e + 4);
    off += streams[k].length;
  });
  return Buffer.concat([h, ...streams]);
}

// BR00: один вход, один прямоугольник с растром.
function br00({ rect, shift, bpr, raster }) {
  const h = Buffer.alloc(0x28);
  h.write('BR00'); h[7] = 1; h.writeUInt32BE(0xc, 8); h.writeUInt16BE(1, 14);
  rect.forEach((v, k) => h.writeInt32BE(v, 16 + k * 4));
  h.writeUInt32BE(0x24, 32); h[36] = shift; h[37] = shift; h.writeUInt16BE(bpr, 38);
  return Buffer.concat([h, pad(raster, 2)]);  // завод добивает растр до чётной длины
}

function block(tag, body) {
  const b = pad(Buffer.concat([u32(0), body]), 4);
  return Buffer.concat([Buffer.from(tag.padEnd(16), 'latin1'), u32(b.length), b]);
}

// Вся таблица: блоки BR, "  ", XY, COMMENT — как у всех заводских, кроме DE.
function build(t) {
  const id = Buffer.from([0x10, 1, t.cc, t.ltn]), tag = `${t.cc}_${t.ltn}`;
  const sub = (words, size) => { const b = Buffer.alloc(size); id.copy(b); words.forEach(([o, v]) => b.writeUInt32BE(v, o)); return b; };
  // N у заводских 11…16
  const N = t.N || Math.max(11, width(t.names.length)), C = t.C || width(Math.max(0, ...t.recs.flatMap(r => [r.x20 || 0, r.x24 || 0])));
  const bs = pad(bs00(t.recs, N, C), 4);
  const text = s => Buffer.from(`\n!14!${s}!41!\n`, 'latin1');
  return Buffer.concat([
    block('TMC-LOC-TABLE BR', Buffer.concat([sub([[0x18, 0x24]], 0x24), br00(t.br), text(`TLT ${tag} with 1 raster`)])),
    block('TMC-LOC-TABLE   ', Buffer.concat([sub([[4, 0x28], [8, 0x28 + bs.length], [0xc, 0x24]], 0x28), bs, sp02(t.names, t.tok)])),
    block('TMC-LOC-TABLE XY', Buffer.concat([sub([[0xc, 0x14], [0x10, 0x18]], 0x18), xy00(t.xy), text(`TLT ${tag} with ${t.xy.length} coords`)])),
    block('COMMENT', Buffer.from(t.comment || `\n!14!${t.file}!TMC location table generated by 3ghigh!41!\n`, 'latin1')),
  ]);
}

// Каталог блоков файла таблицы — для записи реестра.
function blocks(buf) {
  const out = [];
  for (let p = 0; p < buf.length; p += 0x14 + buf.readUInt32BE(p + 16)) {
    out.push({ off: p, size: 0x14 + buf.readUInt32BE(p + 16), tag: buf.toString('latin1', p, p + 16) });
  }
  return out;
}

// Реестр EJ211_global.tlt из записей, как отдаёт tlt.ov.
function ov(list) {
  const pool = [''], str = s => { let i = pool.indexOf(s); if (i < 0) i = pool.push(s) - 1; return i; };
  const recs = Buffer.alloc(list.length * 36), cats = [], base = 8 + list.length * (36 + 52);
  list.forEach((t, i) => {
    const o = i * 36;
    recs.writeUInt16BE(str(t.file), o); recs.writeUInt16BE(str(t.version), o + 2);
    recs.write(t.iso, o + 4, 'latin1'); recs[o + 6] = t.ecc; recs[o + 7] = t.cc; recs[o + 8] = t.ltn;
    recs.write(t.extra, o + 9, 'hex'); t.rect.forEach((v, q) => recs.writeInt32BE(v, o + 12 + q * 4));
    recs.write(t.lang, o + 0x1c, 'latin1'); recs.writeUInt32BE(8 + list.length * 36 + i * 52, o + 0x20);
    const k = Buffer.alloc(52);
    k.writeUInt16BE(t.blocks.length); k[2] = 12;
    t.blocks.forEach((b, j) => { k.writeUInt32BE(b.off, 4 + j * 12); k.writeUInt32BE(b.size, 8 + j * 12); k.writeUInt16BE(str(b.tag), 12 + j * 12); });
    cats.push(k);
  });
  const h = Buffer.from([0x10, 2, 0, 0, 0, 0, 0, 0]);
  h.writeUInt16BE(list.length, 2); h.writeUInt32BE(base, 4);
  const p = Buffer.concat([Buffer.from([0, 0]), ...pool.map(s => Buffer.concat([Buffer.from([s.length]), Buffer.from(s, 'latin1')]))]);
  p.writeUInt16BE(pool.length);
  return block('TMC-LOC-TABLE OV', Buffer.concat([h, recs, ...cats, p]));
}

module.exports = { bs00, sp02, xy00, br00, build, blocks, ov };
