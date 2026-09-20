// Полный разбор записи вектора XAC версии 5 по FUN_08272938.
//
// Ключ, которого не хватало: поле `слово1 & 0x07ff` — это не класс дороги, а
// смещение НАЗАД к слову атрибута (в байтах: idx*2 + 2 от адреса слова 2), и
// одновременно у найденного слова младшие 11 бит служат индексом в глобальной
// таблице `ATTRIBUTE` из EJ211.xah. Само слово атрибута задаёт, сколько ещё
// слов лежит в записи.
'use strict';

const fldb = require('./fldb');
const xac = require('./xac');
const xv = require('./xacvec');

const NODE = 0x3fff, HERE = 0xc000, IDX = 0x07ff;

// Таблица ATTRIBUTE: 2048 слов по 4 байта, из раздела глобального индекса.
function attributes(xahBuf) {
  const s = xac.sections(xahBuf);
  const i = s.list.findIndex((x) => x.name === 'ATTRIBUTE');
  if (i < 0) throw new Error('раздел ATTRIBUTE не найден');
  const from = s.list[i].offset;
  const to = s.list[i + 1] ? s.list[i + 1].offset : xahBuf.length;
  const d = xahBuf.subarray(from, to);
  const n = Math.floor((d.length - 28) / 4);
  const out = new Uint32Array(n);
  for (let k = 0; k < n; k++) out[k] = d.readUInt32BE(28 + k * 4);
  return out;
}

// Разбор одной записи. Возвращает, какие байты блока она затронула.
// touch(a, b) вызывается на каждый прочитанный кусок [a, b).
function record(s, at, attr, touch) {
  const u16 = (o) => (o + 2 <= s.length && o >= 0 ? s.readUInt16BE(o) : null);
  const w0 = u16(at);
  if (w0 === null || (w0 & HERE) !== HERE) return null;
  const w1 = u16(at + 2);
  if (w1 === null) return null;
  touch(at, at + 4);

  const hi = w1 >> 8;                                  // старший байт слова 1
  const cross = (hi >> 6) & 1;                         // ссылка в другой блок
  let save = -1;                                       // «вернуться сюда потом»
  if ((hi >> 3) & 1) save = cross ? at + 6 : at + 4;
  if (cross) touch(at + 4, at + 6);                    // слово 2 — номер блока

  // отход назад к слову атрибута
  let p = (at + 4) - ((w1 & IDX) * 2 + 2);
  let aw = u16(p);
  if (aw === null) return null;
  touch(p, p + 2);
  p += 2;

  if ((aw >> 14) & 1) { touch(p, p + 2); p += 2; }     // бит 14 — пропустить слово

  const a = attr[aw & IDX];
  if (a === undefined) return null;
  let v = a;
  if (v & 0x80000000) { if (u16(p) === null) return null; touch(p, p + 2); p += 2; }
  if ((v >> 15) & 1) { if (u16(p) === null) return null; touch(p, p + 2); p += 2; }

  // флаги записи: разряды 20..22 берутся из битов 4, 5, 6 старшего байта слова 1
  let fl = v;
  fl = (fl & ~0x00400000) | (((hi >> 5) & 1) << 22);
  fl = (fl & ~0x00200000) | (((hi >> 4) & 1) << 21);
  fl = (fl & ~0x00100000) | (((cross & 1)) << 20);

  // Поля +0x40 и +0x44 структуры вектора: ещё два слова атрибутов по 32 бита,
  // каждое необязательно, при отсутствии равно нулю. После чтения прошивка
  // гасит в них биты 31 и 15 — те же, что служили признаком удлинения.
  const extra = [0, 0];
  if (fl & 0x40000000) {
    if (u16(p + 2) === null) return null;
    extra[0] = s.readUInt32BE(p) & 0x7fffffff & 0xffff7fff;
    touch(p, p + 4); p += 4;
  }
  if (fl & 0x10000000) {
    if (u16(p + 2) === null) return null;
    extra[1] = s.readUInt32BE(p) & 0x7fffffff & 0xffff7fff;
    touch(p, p + 4); p += 4;
  }

  if (fl & 0x20000000) {                               // цепочка: пока бит 6 старшего байта
    let w = u16(p);
    while (w !== null) { touch(p, p + 2); p += 2; if (!((w >> 14) & 1)) break; w = u16(p); }
  }
  if (save >= 0) p = save;

  if (fl & 0x08000000) {                               // цепочка с вложенностью
    let w = u16(p);
    while (w !== null && ((w >> 14) & 1)) {
      touch(p, p + 2); p += 2;
      if ((w >> 13) & 1) {
        const w2 = u16(p);
        if (w2 === null) break;
        touch(p, p + 2); p += 2;
        if ((w2 >> 14) & 1) { touch(p, p + 2); p += 2; }
      }
      w = u16(p);
    }
  }

  // Скорость. Признак берётся не из записи, а из шапки блока: FUN_08277f7c
  // кладёт в поле +0x48 разряды 9..10 из (байт 0x39 блока >> 1) & 3, а условие
  // чтения — «этот признак не равен единице».
  // (слово & 0x0fff) << ((слово & 0x7000) >> 11) — мантисса со сдвигом.
  // Это ДЛИНА в метрах, а не скорость: обходчик маршрута FUN_082b3638 берёт
  // это поле (структура вектора +0x58) и суммирует его в «Gesamt %ldm».
  // Значений два, поля +0x58 и +0x5c.
  const metres = (w) => (w & 0x0fff) << ((w & 0x7000) >> 11);
  let spd = [0, 0];
  const mode = (s[0x39] >> 1) & 3;
  if (mode !== 1) {
    let w = u16(p);
    if (w === null) return null;
    touch(p, p + 2); p += 2;
    spd[0] = metres(w);
    const ver = s.readUInt16BE(0x14);
    if (ver === 2 || (ver > 2 && (s[0x3d] & 0x80))) {
      w = u16(p);
      if (w === null) return null;
      touch(p, p + 2); p += 2;
      spd[1] = metres(w);
    }
  }
  return {
    node: w0 & NODE, idx: w1 & IDX, attr: a, cross: !!cross, end: p,
    level: a & 7, flags: fl, extra: extra, length: spd, speed: spd,
  };
}

// Пройти все векторы блока и отметить затронутые байты.
function blockSpan(s, attr) {
  if (s.length < 0x74 || s.readUInt16BE(0x72) !== 1) return null;
  const tab = s.readUInt32BE(0x6c), cnt = s.readUInt16BE(0x70);
  if (!(tab > 0 && tab + cnt * 2 <= s.length && cnt > 0)) return null;
  const mark = new Uint8Array(s.length);
  const touch = (a, b) => { for (let k = Math.max(0, a); k < Math.min(b, s.length); k++) mark[k] = 1; };
  touch(0, 0x74);                                      // шапка блока
  touch(tab, tab + cnt * 2 + 2 + cnt);                 // таблица векторов и шаги
  // координаты узлов: длина зависит от формы (четыре, шесть или восемь байт)
  const coord = (o) => {
    if (o <= 0 || o + 4 > s.length) return;
    const w = s.readUInt16BE(o);
    if ((w & 0xc000) === 0xc000) return;
    if ((w & 0xc000) === 0x8000) touch(o, o + (((s[o] >> 5) & 1) ? 8 : 6));
    else touch(o, o + 4);
  };
  let ok = 0, fail = 0;
  for (let i = 0; i < cnt; i++) {
    const p = s.readUInt16BE(tab + i * 2) * 2;
    const r = record(s, p, attr, touch);
    if (r) { ok++; coord(xv.nodeOffset(s, tab, cnt, i)); coord(xv.nodeOffset(s, tab, cnt, r.node)); }
    else fail++;
  }
  let seen = 0;
  for (const m of mark) if (m) seen++;
  return { ok, fail, seen, total: s.length };
}

module.exports = { attributes, record, blockSpan };

if (require.main === module) {
  const db = fldb.open(process.argv[2] || 'maps/pkgdb/XAC/kN221EUx01_0.db');
  const list = fldb.entries(db);
  const attr = attributes(fldb.read(db, list.find((x) => /\.xah$/i.test(x.name))));
  console.log('таблица ATTRIBUTE: %d записей', attr.length);
  const tiles = list.filter((x) => /\.xac$/i.test(x.name)).slice(0, Number(process.argv[3] || 40));
  let ok = 0, fail = 0, seen = 0, total = 0, blocks = 0;
  for (const e of tiles) {
    const buf = fldb.read(db, e);
    for (const b of xac.vectorBlocks(buf)) {
      if (b.version !== 5) continue;
      const r = blockSpan(buf.subarray(b.offset, b.offset + b.size), attr);
      if (!r) continue;
      blocks++; ok += r.ok; fail += r.fail; seen += r.seen; total += r.total;
    }
  }
  console.log('блоков v5 %d, записей разобрано %d, не разобрано %d', blocks, ok, fail);
  console.log('байт объяснено %d из %d  (%s%%)', seen, total, (100 * seen / total).toFixed(1));
}
