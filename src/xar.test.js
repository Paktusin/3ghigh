'use strict';
// Архив стилей .xar: растр 2MIX (RLE цвета и альфы), дерево свойств dpx и поиск с '*'.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const xar = require('./xar');

const w32 = (...v) => { const b = Buffer.alloc(4 * v.length); v.forEach((x, i) => b.writeUInt32LE(x >>> 0, 4 * i)); return b; };

// растр 3×2: цвет — повтор красного ×4 и два слова как есть; альфа — 0 ×3, затем 3 байта как есть
function mix() {
  const color = Buffer.concat([w32(0x01072000, 4, 0x00ff0000, 0x80000002, 0x0000ff00, 0x000000ff)]);
  const alphaRle = Buffer.from([3, 0, 0x83, 10, 20, 30]);
  const alpha = Buffer.concat([w32(alphaRle.length, 0x108), alphaRle]);
  const head = Buffer.alloc(0x1c);
  head.write('2MIX', 0, 'latin1'); head.writeUInt16LE(3, 8); head.writeUInt16LE(2, 10); head.writeUInt32LE(0x1c, 12);
  head.writeUInt32LE(0x1c + 4 + color.length, 0x10);
  const body = Buffer.concat([head, w32(color.length + 4), color, alpha]);
  body.writeUInt32LE(body.length, 4);
  return Buffer.concat([body, Buffer.alloc((4 - body.length % 4) % 4)]);
}

// дерево: * → mainMap → * → area → * → water → rendering[0,43,цвет,…]; scales под mainMap/*
function dpx() {
  const nodes = [];
  const add = (name, type, data, kids) => { const n = { name, type, data: data || Buffer.alloc(0), kids: kids || [] }; nodes.push(n); return n; };
  const rend = add('rendering', 3, w32(8, 0, 43, 0xff8bbdcd, 0xff000000, 0, 0, 0, 0));
  const water = add('water', 0, null, [rend]);
  const any = add('*', 0, null, [water]);
  const area = add('area', 0, null, [any]);
  const star = add('*', 0, null, [area]);
  const ver = add('styleDBVersion', 1, w32(4));
  const mm = add('mainMap', 0, null, [star, ver]);
  const root = add('*', 0, null, [mm]);
  // раскладка: корень первым, остальные следом
  const order = [root, mm, star, ver, area, any, water, rend];
  let off = 0;
  for (const n of order) { n.off = off; off += 16 + n.data.length; off += (4 - off % 4) % 4; }
  const out = Buffer.alloc(off);
  for (const n of order) {
    out.writeUInt32LE(xar.hash(n.name), n.off); out.writeUInt16LE(n.type, n.off + 4); out.writeUInt16LE(n.data.length, n.off + 6);
    out.writeUInt32LE(n.kids[0] ? n.kids[0].off : 0, n.off + 12);
    n.data.copy(out, n.off + 16);
  }
  for (const n of order) n.kids.forEach((k, i) => out.writeUInt32LE(n.kids[i + 1] ? n.kids[i + 1].off : 0, k.off + 8));
  return Buffer.concat([Buffer.from('dpx\0', 'latin1'), out]);
}

function archive() {
  const bmp = mix();
  const drxHead = Buffer.concat([Buffer.from('drx\0', 'latin1'), w32(0x10000, 0, 5, 0, 1, 7, 0)]);
  const drx = Buffer.concat([drxHead, bmp]);
  drx.writeUInt32LE(drxHead.length / 4, drxHead.length - 4);
  const head = Buffer.alloc(0x28);
  head.write('rax\0', 0, 'latin1'); head.writeUInt32LE(2, 0x1c);
  head.writeUInt32LE(0x28 / 4, 0x20); head.writeUInt32LE((0x28 + drx.length) / 4, 0x24);
  const all = Buffer.concat([head, drx, dpx()]);
  all.writeUInt32LE(all.length, 0x10);
  return all;
}

test('xar: хеш имён — h·37 + байт ("*" = 42)', () => {
  assert.equal(xar.hash('*'), 42);
  assert.equal(xar.nameOf(xar.hash('landFC')), 'landFC');
  assert.equal(xar.nameOf(xar.hash('poi56')), 'poi56');
});

test('xar: разделы, растр 2MIX (B,G,R + отдельная альфа), дерево и поиск через "*"', () => {
  const a = xar.open(archive());
  assert.deepEqual(a.sections.map(s => s.magic), ['drx', 'dpx']);
  const [m] = xar.bitmaps(a);
  assert.deepEqual([m.id, m.w, m.h, m.alpha], [7, 3, 2, true]);
  const b = xar.bitmap(a, 7);
  assert.deepEqual([...b.rgba], [255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 10, 0, 255, 0, 20, 0, 0, 255, 30]);
  assert.equal(xar.png(b).toString('latin1', 1, 4), 'PNG');
  const t = xar.tree(a);
  const st = xar.areaStyles(t);
  assert.equal(st.classes[0].name, 'water');
  assert.deepEqual(st.classes[0].entries.map(e => [e.from, e.to, xar.rgb(e.fill)]), [[0, 43, '#8bbdcd']]);
  assert.equal(st.classes[15].entries.length, 0);
  assert.equal(xar.lookup(t, ['mainMap', 'night', '3d', null, null, null, 'styleDBVersion']), null, '"*" не подставляется на месте последнего имени');
  assert.equal(xar.lookup(t, ['mainMap', 'styleDBVersion']).value, 4);
});

const FACTORY = 'maps/pkgdb/StyleDBMMI3G_ECE_94/MMI3G_MapArchive_H_04_01.xar';
test('xar: заводской архив — 730 растров сходятся, суша 0x5D и 0x5F одного цвета', { skip: !fs.existsSync(FACTORY) }, () => {
  const a = xar.open(fs.readFileSync(FACTORY));
  const bm = xar.bitmaps(a);
  assert.equal(bm.length, 730);
  for (const m of bm) xar.decodeBitmap(a.buf, m.off);
  const st = xar.areaStyles(xar.tree(a)).classes;
  const land = (attr) => st.find(c => c.attr === attr).entries.map(e => e.fill);
  assert.deepEqual(land(0x5d), land(0x5f));
  assert.equal(xar.rgb(st[0].entries[0].fill), '#8bbdcd');
});
