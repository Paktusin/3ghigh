'use strict';
// Граф дорожной сети блока v5: чтение блока в узлы со связями и обратно.
//
// Читатель `xacvec` отвечает на вопрос «какие тут рёбра», а генератор
// `xacwrite.buildBlock` ждёт граф «узел — список векторов». Между ними и стоит
// этот файл: он превращает заводской блок в тот самый граф, чтобы блок можно
// было собрать заново своими байтами.
//
//   node src/xacgraph.js <файл.xac>            сводка по блокам файла
//   node src/xacgraph.js <файл.xac> --regen    пересобрать блоки и сверить рёбра
//
// Чего граф НЕ переносит:
//
//   * межблочные векторы (бит 6 старшего байта второго слова). Их номер
//     указывает на запись в таблице СОСЕДНЕГО блока, а наша нумерация записей
//     своя — перенести такую ссылку некуда. По базе это 7,9 % всех векторов;
//     пересобранный блок остаётся связным внутри себя и теряет выходы наружу.
//   * хвост записи вектора у части векторов — его содержимое не разобрано.
//     Поэтому свой блок занимает около 69 % байт заводского.
//
// Нумерация записей таблицы у завода своя: записей больше, чем «узлы плюс
// векторы». У мальтийского блока их 12 760 против наших 10 512 — лишние
// 2248 адресуют узлы, у которых векторы уже есть. Похоже, это ручки для
// ссылок извне. Воспроизвести нумерацию мы пока не умеем, и это второй повод,
// по которому межблочные ссылки не переносятся.

const fs = require('fs');
const xac = require('./xac');
const xv = require('./xacvec');
const xw = require('./xacwrite');

// Блок v5 -> { nodes: [{x, y, vectors: [{to, idx}]}], ... }.
// Узлы нумеруются в порядке появления в таблице, векторы — в порядке записей.
function graphOf(s) {
  const tab = s.readUInt32BE(0x6c), cnt = s.readUInt16BE(0x70);
  const ox = s.readInt32BE(0x28), oy = s.readInt32BE(0x2c);
  const nodes = [], byOff = new Map(), entryNode = new Array(cnt).fill(-1);

  for (let i = 1; i < cnt; i++) {
    const off = xv.nodeOffset(s, tab, cnt, i);
    if (!off) continue;
    let ni = byOff.get(off);
    if (ni === undefined) {
      const c = xv.koord(s, off, ox, oy);
      if (!c) continue;
      ni = nodes.length;
      nodes.push({ x: c.x, y: c.y, vectors: [], off });
      byOff.set(off, ni);
    }
    entryNode[i] = ni;
  }

  let cross = 0, local = 0, dangling = 0;
  for (let i = 1; i < cnt; i++) {
    const p = s.readUInt16BE(tab + i * 2) * 2;
    if (p <= 0 || p + 4 > s.length) continue;
    const w0 = (s[p] << 8) | s[p + 1];
    if ((w0 & 0xc000) !== 0xc000) continue;          // запись — не вектор
    const src = entryNode[i];
    if (src < 0) { dangling++; continue; }
    const w1 = (s[p + 2] << 8) | s[p + 3];
    if (((s[p + 2] >> 6) & 1) !== 0) { cross++; continue; }   // ссылка в другой блок
    const dst = entryNode[w0 & 0x3fff];
    if (dst < 0) { dangling++; continue; }
    nodes[src].vectors.push({ to: dst, idx: w1 & 0x07ff });
    local++;
  }
  return { nodes, cnt, ox, oy, cross, local, dangling, entryNode };
}

// Собрать блок заново своими байтами, сохранив опору, номер и код страны.
// Дополняется нулями до заданного размера: тогда раздел занимает столько же
// места, сколько заводской, и файл тайла не меняет длины. Хвост за таблицей
// никем не адресуется — ни одна ссылка туда не ведёт.
function regenBlock(s, padTo) {
  const g = graphOf(s);
  if (!g.nodes.length) return null;
  const blk = xw.buildBlock({
    nodes: g.nodes,
    origin: [g.ox, g.oy],
    id: s.readUInt16BE(0x34),
    tileBase: s.readUInt16BE(0x36),
    country: s.readUInt16BE(0x3a),
    flags: s.readUInt16BE(0x3c),
  });
  if (!padTo) return { block: blk, graph: g };
  if (blk.length > padTo) return { block: blk, graph: g, tooBig: true };
  const out = Buffer.alloc(padTo, 0);
  blk.copy(out, 0);
  out.writeUInt32BE(padTo - 20, 0x10);              // длина полезной части раздела
  return { block: out, graph: g, pad: padTo - blk.length };
}

// Пересобрать все блоки v5 файла тайла, сохранив длину каждого раздела и
// длину всего файла. Блоки v3/v4 и все прочие разделы переносятся как есть.
function regenTile(buf) {
  const list = xac.sections(buf).list;
  const parts = [], stat = { blocks: 0, v5: 0, edgesWas: 0, edgesNow: 0, cross: 0, pad: 0, nodes: 0 };
  for (const s of list) {
    const raw = buf.subarray(s.offset, s.offset + s.total);
    if (s.name !== 'VEKTORBLOCK') { parts.push(raw); continue; }
    stat.blocks++;
    if (raw.readUInt16BE(0x14) !== 5) { parts.push(raw); continue; }
    const r = regenBlock(raw, s.total);
    if (!r || r.tooBig) { parts.push(raw); continue; }
    stat.v5++;
    stat.nodes += r.graph.nodes.length;
    stat.cross += r.graph.cross;
    stat.pad += r.pad;
    const key = e => e.a.x + ',' + e.a.y + '->' + e.b.x + ',' + e.b.y;
    const was = new Set(xv.blockEdges(raw).map(key));
    const now = new Set(xv.blockEdges(r.block).map(key));
    stat.edgesWas += was.size;
    for (const k of now) if (was.has(k)) stat.edgesNow++;
    parts.push(r.block);
  }
  const out = Buffer.concat(parts);
  if (out.length !== buf.length) throw new Error('длина файла изменилась: ' + out.length + ' вместо ' + buf.length);
  // вычислимые поля шапки пересчитываются по новым разделам
  const vb = xac.sections(out).list.filter(x => x.name === 'VEKTORBLOCK');
  const bb = [0x7fffffff, 0x7fffffff, -0x80000000, -0x80000000];
  for (const s of vb) {
    bb[0] = Math.min(bb[0], out.readInt32BE(s.offset + 0x18));
    bb[1] = Math.min(bb[1], out.readInt32BE(s.offset + 0x1c));
    bb[2] = Math.max(bb[2], out.readInt32BE(s.offset + 0x20));
    bb[3] = Math.max(bb[3], out.readInt32BE(s.offset + 0x24));
  }
  bb.forEach((v, k) => out.writeInt32BE(v, 0x54 + k * 4));
  out.writeUInt32BE(vb.length, 0x70);
  out.writeUInt32BE(vb.length ? vb[0].offset : 0xffffffff, 0x74);
  out.writeUInt32BE(vb.reduce((a, x) => a + x.total, 0), 0x78);
  return { out, stat };
}

module.exports = { graphOf, regenBlock, regenTile };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error('использование: node src/xacgraph.js <файл.xac> [--regen]');
    process.exit(1);
  }
  const buf = fs.readFileSync(file);
  if (process.argv.includes('--regen')) {
    const { out, stat } = regenTile(buf);
    console.log('блоков ' + stat.blocks + ', из них v5 пересобрано ' + stat.v5);
    console.log('узлов ' + stat.nodes + ', рёбер ' + stat.edgesWas +
      ', воспроизведено ' + stat.edgesNow +
      (stat.edgesWas ? ' (' + (stat.edgesNow / stat.edgesWas * 100).toFixed(3) + ' %)' : ''));
    console.log('межблочных векторов отброшено ' + stat.cross);
    console.log('дополнено нулями ' + stat.pad + ' байт, длина файла ' + out.length + ' — прежняя');
    return;
  }
  for (const s of xac.sections(buf).list) {
    if (s.name !== 'VEKTORBLOCK') continue;
    const raw = buf.subarray(s.offset, s.offset + s.total);
    const v = raw.readUInt16BE(0x14);
    if (v !== 5) { console.log('блок @' + s.offset + ' версии ' + v + ' — пропущен'); continue; }
    const g = graphOf(raw);
    console.log('блок @' + String(s.offset).padStart(8) + '  узлов ' + String(g.nodes.length).padStart(6) +
      '  векторов ' + String(g.local).padStart(6) + '  межблочных ' + String(g.cross).padStart(5) +
      '  висячих ' + g.dangling);
  }
}
