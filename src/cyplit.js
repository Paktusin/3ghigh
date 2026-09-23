'use strict';
// Свой контейнер `LIT` — только с кипрскими точками интереса.
//
//   node src/cyplit.js                       собрать и проверить
//   node src/cyplit.js --out out/cyp/CY.lit  ещё и записать
//   node src/cyplit.js --limit 2000          ограничить число точек
//
// Отличие от `src/cyptree.js`. Тот сажает блоки в слоты чужих листьев
// заводского дерева: место и номер блока заданы заводским каталогом, вырасти
// блок не может, а рядом остаётся 2,1 ГБ чужих данных. Здесь контейнер свой:
// своя нумерация блоков, свой каталог, свой корень дерева, и ничего кроме
// Кипра внутри. Это и есть цель (см. README).
//
// ── Что откуда берётся ────────────────────────────────────────────────────
//   заголовок и грамматика `TTD`  — переносятся из заводского `LIT` как есть:
//                                   это описание формата, а не данные;
//   блок 0                        — узлы дерева (корень — элемент 0);
//   блоки 1…N                     — листья с точками;
//   каталог                       — считается сборщиком (`src/litfile.js`),
//                                   ширины полей подбираются под размер файла.
//
// ── Чего мы не знаем ──────────────────────────────────────────────────────
// Ссылка `0x66` у точки (в заводских данных — позиция «блок, ключ») ведёт
// куда-то за пределы блока, и что с ней делает устройство, неизвестно. Здесь
// она ставится на собственный лист точки — значение существующее и внутри
// нашего же контейнера, но это **догадка**, а не прочитанное в коде.
//
// На устройстве такой контейнер не проверялся ни разу.

const fs = require('fs');
const path = require('path');
const lit = require('./lit');
const litfile = require('./litfile');
const C = require('./cyppoi');
const T = require('./cyptree');
const S = require('./litschema');
const VM = require('./litvm');
const P = require('./litpoi');

const CAP = 13795;                  // потолок листа: самый большой заводской блок
const NODE = 0;                     // блок с узлами дерева

// Заголовок и грамматика заводского контейнера.
function template(file) {
  const raw = fs.readFileSync(file || 'maps/pkgdb/LIT/EJ211Ga_L1.db');
  const at = raw.indexOf(Buffer.from([0x4c, 0x69, 0x74, 0x02]));
  if (at < 0) throw new Error('магия Lit\\x02 не найдена в образце');
  const m = litfile.read(raw.subarray(at));
  return { head: Buffer.from(m.head), ttd: Buffer.from(m.ttd), header: m.header };
}

// Сборка контейнера из точек.
function build(pois, opt) {
  const o = opt || {};
  const tpl = o.template || template(o.from);
  const cap = o.cap || CAP;
  const slots = o.slots || 512;
  // Слоты — это просто номера будущих блоков: 1, 2, 3… Размер у всех один,
  // потому что в своём контейнере блок ничем не зажат, кроме нашего потолка.
  const donors = Array.from({ length: slots }, (_, i) => ({ blk: i + 1, size: cap }));
  const r = T.build(pois, donors, { ref: o.ref || [1, 0], nodeBlk: NODE });

  const blocks = [r.node.bytes];
  const used = r.leaves.slice().sort((a, b) => a.blk - b.blk);
  if (used.some((l, i) => l.blk !== i + 1)) throw new Error('номера листьев идут не подряд');
  for (const l of used) blocks.push(l.bytes);

  return { buf: litfile.build({ head: tpl.head, ttd: tpl.ttd, blocks }),
           leaves: used.length, pois: used.reduce((a, l) => a + l.pois, 0),
           node: r.node.bytes.length,
           bytes: blocks.reduce((a, b) => a + b.length, 0) };
}

module.exports = { build, template, CAP, NODE };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const pbf = argv.find((a) => a.endsWith('.pbf')) || 'out/cyp/cyprus-latest.osm.pbf';
  const limit = Number(flag('limit', 0));

  const all = C.collect(pbf).map((q) => Object.assign({}, q, {
    x: Math.round(q.lon * 72000), y: Math.round(q.lat * T.DEG),
  }));
  const pois = limit ? all.slice(0, limit) : all;
  console.log('точек собрано ' + all.length + (limit ? ', взято ' + pois.length : ''));

  const r = build(pois);
  console.log('листьев ' + r.leaves + ', точек в них ' + r.pois +
              ', блок узлов ' + r.node + ' б');
  console.log('контейнер ' + r.buf.length + ' байт (' + (r.buf.length / 1048576).toFixed(2) +
              ' МБ) вместо заводских 2 147 401 728 (' +
              (100 * r.buf.length / 2147401728).toFixed(3) + ' %)');

  // ---- проверка: читаем собранное своими читателями ----
  const out = flag('out');
  const tmp = out || path.join(require('os').tmpdir(), 'cyp-lit-' + process.pid + '.bin');
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, r.buf);

  const schema = S.load(tmp, 0);                 // грамматика читается из нашего же файла
  const m = litfile.read(r.buf);
  const cache = new Map();
  const get = (i) => {
    if (cache.has(i)) return cache.get(i);
    const b = m.blocks[i];
    let recs = [];
    try { recs = VM.run(schema, b, 0, { blk: i, limit: 4000000 }).records; } catch (e) { /* пусто */ }
    const v = { origin: { x: b.readInt32BE(4), y: b.readInt32BE(8) }, elems: P.elemsOf(recs) };
    cache.set(i, v);
    return v;
  };

  let ends = 0, got = 0;
  for (let i = 1; i < m.blocks.length; i++) {
    const res = VM.run(schema, m.blocks[i], 0, { blk: i, limit: 4000000 });
    if (res.why === 'данные кончились' && res.pos === m.blocks[i].length) ends++;
    got += P.poisOf(schema, m.blocks[i], i).length;
  }
  const nres = VM.run(schema, m.blocks[NODE], 0, { blk: NODE, limit: 4000000 });

  // спуск от корня по рамке вокруг каждой сотой точки — как ходит прошивка
  let seen = 0, hit = 0;
  for (let i = 0; i < pois.length; i += 100) {
    const q = pois[i]; seen++;
    const box = { x0: q.x - 72, y0: q.y - 111, x1: q.x + 72, y1: q.y + 111 };
    const leaves = T.collect(get, NODE, 0, box, new Set(), 0);
    if (leaves.size) hit++;
  }

  console.log('--- сверка по собранному файлу ---');
  console.log('грамматика читается из нашего файла: ' + (schema ? 'да' : 'НЕТ'));
  console.log('листья дочитываются до конца: ' + ends + ' из ' + r.leaves);
  console.log('блок узлов дочитан: ' +
              (nres.why === 'данные кончились' && nres.pos === m.blocks[NODE].length ? 'да' : 'НЕТ') +
              ' (' + nres.pos + ' из ' + m.blocks[NODE].length + ')');
  console.log('точек прочитано обратно: ' + got + ' из ' + r.pois);
  console.log('спуск от корня: проверено ' + seen + ', лист найден у ' + hit);

  if (!out) fs.unlinkSync(tmp); else console.log('записано: ' + out);
  const bad = ends !== r.leaves || got !== r.pois || hit !== seen;
  console.log(bad ? 'ЕСТЬ РАСХОЖДЕНИЯ' : 'расхождений нет');
  process.exit(bad ? 1 : 0);
}
