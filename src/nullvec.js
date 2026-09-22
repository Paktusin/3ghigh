'use strict';
// Межтайловые связи: элемент `0x0000` в списке узла («нульвектор»).
//
//   node src/nullvec.js [сколько тайлов]      сплошная сверка модели с базой
//
// Модель снята с прошивки, с `u_get_vecttree_of_vid_or_vinfo` (FUN_0826f300,
// имя дала строка ассерта `XAC: u_get_nullvector(%d, %p, %p) Zu viele
// Vektoren`). Элемент устроен так:
//
//   u16 0x0000                маркер, он же конец списка векторов узла
//   до четырёх пар u16:
//     слово A — СКВОЗНОЙ номер блока во всей базе; прошивка отдаёт его тому же
//               загрузчику, что и межблочные ссылки (PTR_FUN_0826ff04)
//     слово B — бит 15: «за этой парой идёт ещё одна»; биты 0..14: низ VID,
//               то есть ссылка на узел внутри блока-цели:
//                 блок с таблицей (версия >= 5, поле 0x72 == 1):
//                     индекс таблицы = (B & 0x7fff) >> 1, дальше FUN_08272410
//                 блок без таблицы (версии 3 и 4):
//                     байтовое смещение узла = B & 0x7fff
//               B & 0x7fff == 0 — пары нет (на этом уровне узла не существует)
//
// Маску слова A прошивка выбирает по блоку-источнику: 0xffff, если версия >= 3
// и взведён бит 4 байта 0x3d, иначе 0x7fff.
//
// Что это значит по смыслу: пара k ведёт на УРОВЕНЬ k. Пара 1 — тот же узел в
// СОСЕДНЕМ тайле того же уровня, пары 2..4 — он же на укрупнённых уровнях.
// Узел на границе лежит в обоих тайлах с точностью до единицы координат, и
// нульвектор — единственное, что их связывает.
//
// Длина элемента согласована с битом 15 третьей пары: обходчик списка
// (`xac_find_node`, FUN_08272350) смотрит именно на него и шагает 14 или 18
// байт. Обе стороны сошлись на всех 27 679 элементах базы.

const fs = require('fs');
const path = require('path');
const fldb = require('./fldb');
const xac = require('./xac');
const st = require('./struktur');
const v3 = require('./xacv3');
const xv = require('./xacvec');
const dataset = require('./dataset');

// Разбор элемента. `at` — смещение маркера, `wide` — какая маска у слова A.
// Возвращает пары в порядке уровней; пустая пара отдаётся как null.
function pairs(s, at, wide) {
  const len = (s.readUInt16BE(at + 12) & 0x8000) ? 18 : 14;
  const out = [];
  for (let k = 0; k * 4 + 6 <= len; k++) {
    const a = s.readUInt16BE(at + 2 + k * 4), b = s.readUInt16BE(at + 4 + k * 4);
    const ref = b & 0x7fff;
    out.push(ref ? { level: k + 1, block: a & (wide ? 0xffff : 0x7fff), ref,
                     more: (b & 0x8000) !== 0 } : null);
  }
  return { len, list: out };
}

// Маска слова A по блоку-источнику.
function wideMask(b) {
  return b.readUInt16BE(0x14) >= 3 && ((b[0x3d] >> 4) & 1) !== 0;
}

// Ссылка внутри блока-цели -> смещение узла и его координата.
function resolve(b, ref) {
  const ox = b.readInt32BE(0x28), oy = b.readInt32BE(0x2c);
  let tab = 0, cnt = 0;
  if (b.readUInt16BE(0x14) >= 5) {
    const mode = b.readUInt16BE(0x72);
    if (mode === 1) { tab = b.readUInt32BE(0x6c); cnt = b.readUInt16BE(0x70); }
    else if (mode !== 0) return null;
  }
  if (tab) {
    if (tab + cnt * 2 + 2 > b.length) return null;
    const i = ref >> 1;
    if (i === 0 || i >= cnt) return null;
    const at = xv.nodeOffset(b, tab, cnt, i);
    return at ? { at, c: xv.koord(b, at, ox, oy) } : null;
  }
  if (ref + 2 > b.length || !v3.headLen(b, ref)) return null;
  return { at: ref, c: xv.koord(b, ref, ox, oy) };
}

// --- сплошная сверка --------------------------------------------------------

// Сквозной номер блока -> тайл, уровень, номер внутри уровня.
function blockIndex(xahBuf, tiles) {
  const lv = st.parseLevels(xahBuf), ranges = [];
  for (const n of [1, 2, 3, 4]) {
    if (!lv[n]) continue;
    lv[n].rows.forEach((r, i) => {
      if (r.blockCount) ranges.push({ code: tiles[i], level: n, first: r.firstBlock, cnt: r.blockCount });
    });
  }
  ranges.sort((a, b) => a.first - b.first);
  return (nr) => {
    let lo = 0, hi = ranges.length - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1, r = ranges[m];
      if (nr < r.first) hi = m - 1;
      else if (nr >= r.first + r.cnt) lo = m + 1;
      else return { code: r.code, level: r.level, local: nr - r.first };
    }
    return null;
  };
}

function check(limit) {
  const root = dataset.resolveRoot();
  const idx = st.openIndex(root);
  const tiles = [...st.parse(idx.buf).keys()];
  const whose = blockIndex(idx.buf, tiles);
  const nb = st.parseNeighbors(idx.buf);
  const neighbors = nb.map((l) => new Set(l.map((j) => tiles[j])));
  const tileNo = new Map(tiles.map((c, i) => [c, i]));

  const files = new Map();
  for (const d of fs.readdirSync(path.join(root, 'pkgdb'))) {
    if (!/^XAC/.test(d)) continue;
    for (const f of fs.readdirSync(path.join(root, 'pkgdb', d))) {
      if (!/\.db$/i.test(f)) continue;
      const db = fldb.open(path.join(root, 'pkgdb', d, f));
      for (const e of fldb.entries(db)) {
        const m = /_([A-Z0-9]{4})_([12])\.xac$/.exec(e.name);
        if (m) files.set(m[1] + '_' + m[2], { db, e });
      }
    }
  }
  const cache = new Map();
  const blocksOf = (code, level) => {
    const key = code + '_' + level;
    if (cache.has(key)) return cache.get(key);
    const f = files.get(key);
    let out = null;
    if (f) {
      const buf = fldb.read(f.db, f.e);
      out = xac.sections(buf).list.filter((s) => s.name === 'VEKTORBLOCK')
        .map((s) => buf.subarray(s.offset, s.offset + s.total));
    }
    if (cache.size > 40) cache.clear();
    cache.set(key, out);
    return out;
  };

  const r = { tiles: 0, elems: 0, pairs: 0, empty: 0, lenOk: 0, lenBad: 0,
              levelOk: 0, levelBad: 0, blockOk: 0, blockBad: 0,
              nbOk: 0, nbBad: 0, coordOk: 0, coordBad: 0, noFile: 0, unresolved: 0 };
  let seen = 0;
  for (const code of tiles) {
    if (seen >= limit) break;
    const bl = blocksOf(code, 1);
    if (!bl) continue;
    let used = false;
    for (const b of bl) {
      const version = b.readUInt16BE(0x14);
      if (version !== 3 && version !== 4) continue;      // список узлов читается подряд
      const blk = v3.readBlock(b);
      if (!blk) continue;
      used = true;
      const wide = wideMask(b);
      for (const n of blk.nodes) {
        for (const el of n.els) {
          if (el.mark !== 0) continue;
          r.elems++;
          const p = pairs(b, el.at, wide);
          (p.len === el.len ? r.lenOk++ : r.lenBad++);
          for (const q of p.list) {
            if (!q) { r.empty++; continue; }
            r.pairs++;
            const t = whose(q.block);
            if (!t) { r.blockBad++; continue; }
            r.blockOk++;
            (t.level === q.level ? r.levelOk++ : r.levelBad++);
            if (q.level === 1) {
              (neighbors[tileNo.get(code)].has(t.code) ? r.nbOk++ : r.nbBad++);
            }
            if (t.level > 2) { r.noFile++; continue; }
            const tb = blocksOf(t.code, t.level);
            if (!tb || !tb[t.local]) { r.noFile++; continue; }
            const got = resolve(tb[t.local], q.ref);
            if (!got || !got.c) { r.unresolved++; continue; }
            (got.c.x === n.x && got.c.y === n.y ? r.coordOk++ : r.coordBad++);
          }
        }
      }
    }
    if (used) seen++;
  }
  r.tiles = seen;
  return r;
}

module.exports = { pairs, wideMask, resolve, blockIndex, check };

if (require.main === module) {
  const r = check(process.argv[2] ? +process.argv[2] : 1e9);
  console.log('тайлов с блоками v3/v4:', r.tiles);
  console.log('элементов 0x0000:', r.elems, '  занятых пар:', r.pairs, '  пустых пар:', r.empty);
  console.log('длина элемента по биту 15 третьей пары: сходится', r.lenOk, ', расходится', r.lenBad);
  console.log('номер блока нашёлся в реестре:', r.blockOk, ', не нашёлся:', r.blockBad);
  console.log('уровень цели равен номеру пары:', r.levelOk, ', не равен:', r.levelBad);
  console.log('пара 1 ведёт в соседа по NACHBARN:', r.nbOk, ', не в соседа:', r.nbBad);
  console.log('координата цели равна координате узла:', r.coordOk, ', не равна:', r.coordBad);
  console.log('целей в уровнях 3/4 (файлов нет):', r.noFile, ', ссылка не разобрана:', r.unresolved);
}
