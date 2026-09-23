'use strict';
// Свой общий индекс `.xah` — только с нужными тайлами.
//
//   node src/xahmin.js --tiles IS01              один тайл
//   node src/xahmin.js --tiles IS00,IS01,IS02    несколько
//   node src/xahmin.js --tiles IS01 --out out/cyp/EJ211.xah
//
// Это шаг к цели (см. README): образ, где все файлы наши и несут только Кипр.
// Пока `.xah` берётся заводским, контейнер `XAC` обязан оставаться заводского
// размера, а образ — требовать заводской базы под собой.
//
// ── Что собирается заново ─────────────────────────────────────────────────
//   `XACDB HEADER`      счётчики: тайлов, блоков во всей базе, областей L3
//   `XAC-STRUKTUR`      записи оставленных тайлов, порядок сохраняется
//   `XAC-STRUKTUR L1…4` их же строки уровней, `firstBlock` пересчитан сквозь
//   `NACHBARN`          номера соседей переведены в новую нумерацию,
//                       связи с выброшенными тайлами убраны
//   `FE GRUPPEN`        группы и страны: списки тайлов переведены, пустые
//                       записи выброшены
//   `L3 GRUPPEN`        то же для областей третьего уровня
//
// ── Что переносится как есть ──────────────────────────────────────────────
// Таблицы, не зависящие от состава тайлов: `STRING`, `BASIC NAME`, `LANGUAGE`,
// `COUNTRY`, `UNICODE *`, `ATTRIBUTE`, `ZF-TOKEN`, `ZF-LTMAP`, `ETA-KOSTEN`,
// `MAJOR ROAD`, `BUILD INFOS`. Последняя обязательна при версии шапки ≥ 8 —
// это прочитано в коде открывателя (`FUN_08280f50`).
//
// ── Чего в нашем индексе НЕТ и почему ─────────────────────────────────────
// `FE_MIX_INFO`, `VIA-LISTE`, `L4 LOAD TABLE` не кладутся: их раскладка не
// разобрана, а переносить заводские нельзя — в них номера тайлов старой
// нумерации. Класть разобранное и не класть неразобранное честнее, чем
// оставить заведомо неверное. Открыватель `.xah` этих трёх не требует: он
// падает только без шапки, `XAC-STRUKTUR` и `BUILD INFOS`.
//
// На устройстве такой индекс НЕ проверялся ни разу.

const fs = require('fs');
const path = require('path');
const xah = require('./xah');
const st = require('./struktur');
const fg = require('./fegruppen');

// Разделы, которые переносятся байт в байт.
const KEEP = ['STRING', 'BASIC NAME', 'LANGUAGE', 'COUNTRY',
              'UNICODE INFO', 'UNICODE SORT', 'UNICODE COMBI', 'UNICODE CASE',
              'ATTRIBUTE', 'ZF-TOKEN', 'ZF-LTMAP', 'ETA-KOSTEN', 'MAJOR ROAD',
              'BUILD INFOS'];
// Разделы, которые собираются заново.
const MADE = ['XACDB HEADER', 'XAC-STRUKTUR', 'XAC-STRUKTUR L1', 'XAC-STRUKTUR L2',
              'XAC-STRUKTUR L3', 'XAC-STRUKTUR L4', 'FE GRUPPEN', 'L3 GRUPPEN', 'NACHBARN'];
// Разделы, которые выбрасываются: раскладка не разобрана.
const DROP = ['FE_MIX_INFO', 'VIA-LISTE', 'L4 LOAD TABLE'];

// Перевод списка номеров тайлов в новую нумерацию; выброшенные пропускаются.
const remap = (list, map) => list.map((t) => map.get(t)).filter((t) => t !== undefined);

function mkxah(xahBuf, codes) {
  const order = [...st.parse(xahBuf).keys()];
  const idx = [];
  for (const c of codes) {
    const i = order.indexOf(c);
    if (i < 0) throw new Error('тайла ' + c + ' в реестре нет');
    idx.push(i);
  }
  idx.sort((a, b) => a - b);                    // порядок реестра сохраняем
  const map = new Map(idx.map((old, now) => [old, now]));

  // ---- реестр и уровни ----
  const reg = st.readTable(xahBuf, 'XAC-STRUKTUR', st.REC);
  const out = [];
  const regNew = { ...reg, records: idx.map((i) => reg.records[i]) };

  const levels = [1, 2, 3, 4].map((n) => st.readTable(xahBuf, 'XAC-STRUKTUR L' + n, st.LEVEL_REC));
  const rows = levels.map((L) => ({ ...L, records: idx.map((i) => Buffer.from(L.records[i])) }));

  // Сквозная нумерация блоков: тайл за тайлом, внутри тайла уровни 1…4.
  let running = 0;
  for (let i = 0; i < idx.length; i++) {
    for (let n = 0; n < 4; n++) {
      const r = rows[n].records[i];
      r.writeUInt16BE(running, 0x12);           // firstBlock
      running += r.readUInt16BE(0x10);          // blockCount
    }
  }

  // ---- соседи ----
  const nb = st.parseNeighbors(xahBuf);
  const nbNew = idx.map((i) => remap(nb[i], map));

  // ---- группы и страны ----
  const fe = fg.read(xahBuf);
  const feNew = {
    ...fe,
    groups: fe.groups.map((g) => ({ ...g, tiles: remap(g.tiles, map) })).filter((g) => g.tiles.length),
    lands: fe.lands.map((l) => ({ ...l, tiles: remap(l.tiles, map) })).filter((l) => l.tiles.length),
    gap: 0, tail: 0,
  };
  const l3 = fg.readL3(xahBuf);
  const l3New = {
    ...l3, tail: 0,
    groups: l3.groups.map((g) => ({ ...g, tiles: remap(g.tiles, map) })).filter((g) => g.tiles.length),
  };

  // ---- шапка ----
  const hSec = xah.section(xahBuf, 'XACDB HEADER');
  const head = Buffer.from(hSec.bytes.subarray(20));
  const at = (o) => o - 20;
  head.writeUInt32BE(idx.length, at(xah.H.tiles));
  head.writeUInt32BE(running, at(xah.H.blocks));
  head.writeUInt32BE(l3New.groups.length, at(0x50));

  // ---- сборка ----
  const add = (name, data) => out.push({ name, data });
  const copy = (name) => {
    const s = xah.section(xahBuf, name);
    if (s) add(name, s.bytes.subarray(20));
  };

  // Порядок разделов оставляем заводским: так же идёт и заводской файл.
  for (const s of xah.sections(xahBuf).list) {
    if (DROP.indexOf(s.name) >= 0) continue;
    if (s.name === 'XACDB HEADER') add(s.name, head);
    else if (s.name === 'XAC-STRUKTUR') add(s.name, st.buildTable(regNew));
    else if (/^XAC-STRUKTUR L[1-4]$/.test(s.name)) add(s.name, st.buildTable(rows[+s.name.slice(-1) - 1]));
    else if (s.name === 'NACHBARN') add(s.name, st.buildNeighbors(nbNew, xah.section(xahBuf, 'NACHBARN').bytes.subarray(20, 24)));
    else if (s.name === fg.SEC) add(s.name, fg.build(feNew));
    else if (s.name === fg.SEC_L3) add(s.name, fg.buildL3(l3New));
    else if (KEEP.indexOf(s.name) >= 0) copy(s.name);
    else throw new Error('раздел ' + s.name + ' не отнесён ни к собираемым, ни к переносимым');
  }

  return { buf: xah.build(out), tiles: idx.length, blocks: running,
           groups: feNew.groups.length, lands: feNew.lands.length,
           l3: l3New.groups.length, order: idx.map((i) => order[i]) };
}

module.exports = { mkxah, KEEP, MADE, DROP };

if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
  const codes = (flag('tiles', '') || '').split(',').filter(Boolean).map((s) => s.toUpperCase());
  if (!codes.length) {
    console.error('использование: node src/xahmin.js --tiles IS01[,IS02...] [--out файл]');
    process.exit(2);
  }
  const idx = st.openIndex();
  const r = mkxah(idx.buf, codes);

  console.log('тайлов ' + r.tiles + ' (' + r.order.join(', ') + '), блоков в базе ' + r.blocks);
  console.log('групп ' + r.groups + ', стран ' + r.lands + ', областей L3 ' + r.l3);
  console.log('индекс ' + r.buf.length + ' байт вместо заводских ' + idx.buf.length +
              ' (' + (100 * r.buf.length / idx.buf.length).toFixed(1) + ' %)');

  // ---- сверка своими читателями ----
  const h = xah.header(r.buf);
  const reg = st.parse(r.buf), lv = st.parseLevels(r.buf), nb = st.parseNeighbors(r.buf);
  const fe = fg.read(r.buf), l3 = fg.readL3(r.buf);
  let run = 0, numErr = 0;
  for (let i = 0; i < r.tiles; i++) {
    for (const n of [1, 2, 3, 4]) {
      if (lv[n].rows[i].firstBlock !== run) numErr++;
      run += lv[n].rows[i].blockCount;
    }
  }
  const tilesIn = (arr) => arr.every((t) => t < r.tiles);
  const okGroups = fe.groups.every((g) => tilesIn(g.tiles)) && fe.lands.every((l) => tilesIn(l.tiles)) &&
                   l3.groups.every((g) => tilesIn(g.tiles));
  const okNb = nb.every((list) => tilesIn(list));

  console.log('--- сверка своими читателями ---');
  console.log('шапка: тайлов ' + h.tiles + ', блоков ' + h.blocks +
              ', разрядности ' + (xah.bitsAccepted(h.bits) ? 'заводские' : 'ИЗМЕНЕНЫ'));
  console.log('реестр читается: записей ' + reg.size + (reg.size === r.tiles ? ' — сходится' : ' — НЕ СХОДИТСЯ'));
  console.log('нумерация блоков: ошибок ' + numErr + ', сумма ' + run +
              (run === h.blocks ? ' = счётчик шапки' : ' != счётчик шапки ' + h.blocks));
  console.log('номера тайлов в группах и странах: ' + (okGroups ? 'все в пределах' : 'ЕСТЬ ВЫХОД ЗА ПРЕДЕЛЫ'));
  console.log('номера соседей: ' + (okNb ? 'все в пределах' : 'ЕСТЬ ВЫХОД ЗА ПРЕДЕЛЫ'));
  console.log('разделов ' + xah.sections(r.buf).list.length + ', покрытие ' +
              (xah.sections(r.buf).complete ? 'полное' : 'НЕПОЛНОЕ'));

  const bad = numErr || run !== h.blocks || !okGroups || !okNb || reg.size !== r.tiles ||
              !xah.sections(r.buf).complete;
  const out = flag('out');
  if (out && !bad) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, r.buf);
    console.log('записано: ' + out);
  }
  console.log(bad ? 'ЕСТЬ РАСХОЖДЕНИЯ' : 'расхождений нет');
  process.exit(bad ? 1 : 0);
}
