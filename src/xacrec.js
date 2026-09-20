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
// touch(a, b, role) вызывается на каждый прочитанный кусок [a, b);
// role называет поле — по нему обратный проход в xacwrite собирает байты заново.
function record(s, at, attr, touch, opt) {
  opt = opt || {};
  const u16 = (o) => (o + 2 <= s.length && o >= 0 ? s.readUInt16BE(o) : null);
  const w0 = u16(at);
  if (w0 === null || (w0 & HERE) !== HERE) return null;
  const w1 = u16(at + 2);
  if (w1 === null) return null;
  touch(at, at + 4, 'head');

  const hi = w1 >> 8;                                  // старший байт слова 1
  const cross = (hi >> 6) & 1;                         // ссылка в другой блок
  let save = -1;                                       // «вернуться сюда потом»
  if ((w1 >> 11) & 1) save = cross ? at + 6 : at + 4;
  if (cross) touch(at + 4, at + 6, 'cross');           // слово 2 — номер блока

  // Отход назад к слову атрибута делается ТОЛЬКО при бите 11 слова 1. В
  // дизассемблере это видно прямо: `bt/s 0x08272b76` при нулевом бите 11
  // перепрыгивает и вычитание `sub r1,r9`, и чтение слова. Тогда индексом
  // служит само слово 1, а чтение продолжается по телу записи с at+4.
  let p, aw;
  if ((w1 >> 11) & 1) {
    p = (at + 4) - ((w1 & IDX) * 2 + 2);
    aw = u16(p);
    if (aw === null) return null;
    touch(p, p + 2, 'pool');
    p += 2;
  } else {
    aw = w1;
    p = at + 4;
  }

  if ((aw >> 14) & 1) { touch(p, p + 2, 'skip'); p += 2; }  // бит 14 — пропустить слово

  const a = attr[aw & IDX];
  if (a === undefined) return null;
  // Значение из таблицы — заготовка: бит 31 означает «старшую половину взять из
  // потока», бит 15 — «младшую». Прошивка их ПОДСТАВЛЯЕТ, а не просто
  // пропускает слово, поэтому от подстановки зависят и биты 30, 29, 28, 27,
  // которые решают, сколько ещё слов лежит в записи.
  let v = a >>> 0;
  if (v & 0x80000000) {
    const w = u16(p);
    if (w === null) return null;
    v = (((w << 16) >>> 0) | (v & 0x0000ffff)) >>> 0;
    touch(p, p + 2, 'subhi'); p += 2;
  }
  if ((v >>> 15) & 1) {
    const w = u16(p);
    if (w === null) return null;
    v = ((v & 0xffff0000) | w) >>> 0;
    touch(p, p + 2, 'sublo'); p += 2;
  }

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
    touch(p, p + 4, 'extra0'); p += 4;
  }
  if (fl & 0x10000000) {
    if (u16(p + 2) === null) return null;
    extra[1] = s.readUInt32BE(p) & 0x7fffffff & 0xffff7fff;
    touch(p, p + 4, 'extra1'); p += 4;
  }

  if (fl & 0x20000000) {                               // цепочка: пока бит 6 старшего байта
    let w = u16(p);
    while (w !== null) { touch(p, p + 2, 'chain'); p += 2; if (!((w >> 14) & 1)) break; w = u16(p); }
  }
  if (save >= 0) p = save;

  // Цепочка с вложенностью. Первое слово прошивка съедает БЕЗУСЛОВНО
  // (psVar8 = psVar9 + 1 стоит до проверки), и только потом смотрит бит 14.
  if (fl & 0x08000000) {
    let w = u16(p);
    if (w === null) return null;
    touch(p, p + 2, 'nest'); p += 2;
    while (w !== null && ((w >> 14) & 1)) {
      w = u16(p);
      if (w === null) break;
      touch(p, p + 2, 'nest'); p += 2;
      if ((w >> 13) & 1) {
        const w2 = u16(p);
        if (w2 === null) break;
        touch(p, p + 2, 'nest'); p += 2;
        if ((w2 >> 14) & 1) { touch(p, p + 2, 'nest'); p += 2; }
      }
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
    touch(p, p + 2, 'len0'); p += 2;
    spd[0] = metres(w);
    const ver = s.readUInt16BE(0x14);
    if (ver === 2 || (ver > 2 && (s[0x3d] & 0x80))) {
      w = u16(p);
      if (w === null) return null;
      touch(p, p + 2, 'len1'); p += 2;
      spd[1] = metres(w);
    }
  }
  return {
    node: w0 & NODE, idx: w1 & IDX, attr: a, cross: !!cross, end: p,
    level: v & 7, flags: fl, extra: extra, length: spd, speed: spd,
    saved: save >= 0,
  };
}

// Блок v5 целиком: шапка, область узлов, таблица векторов, байты шагов.
//
// Область узлов — это подряд идущие узлы. Узел устроен так:
//
//     [координата][список элементов]
//
// Элементы списка различаются меткой старших двух бит слова:
//   0xc000 — полная запись вектора (разбирается record),
//   0x4000 — обратная ссылка, два байта,
//   0x8000 — координата следующего узла, длинная форма.
//
// ВАЖНАЯ ОГОВОРКА. Метка 0x0000 и метка 0x4000 у координаты одна и та же с
// точностью до знака: первое слово компактной формы равно (dx + 16384) & 0x7fff,
// и при dx >= 0 бит 14 поднят, то есть слово неотличимо от обратной ссылки.
// Проверено: из 448 280 узлов, заверенных таблицей, 138 045 (30.8 %) при
// разборе «по меткам» попадали в обратные ссылки. Поэтому начала узлов берутся
// из таблицы, а не угадываются по меткам.
//
// Таблица индексирует не все узлы: в области лежат ещё узлы, до которых
// добираешься только последовательным проходом. Байт шага говорит, на сколько
// слов назад от смещения из таблицы начинается узел.
//
// Здесь мерится ПОКРЫТИЕ БАЙТ, поэтому оговорка выше не исправляется: внутри
// пролёта между двумя заверенными узлами лежат незаверенные, и их компактные
// координаты попадают в счёт обратных ссылок. Счёт обратных ссылок тут —
// оценка сверху; разбор по существу делает readBlock в src/xacwrite.js.
function coordLen(s, p) {
  const w = s.readUInt16BE(p);
  if ((w & 0xc000) === 0x8000) return ((s[p] >> 5) & 1) ? 8 : 6;
  return 4;
}

// Пройти блок и отметить затронутые байты.
function blockSpan(s, attr) {
  if (s.length < 0x74 || s.readUInt16BE(0x72) !== 1) return null;
  const tab = s.readUInt32BE(0x6c), cnt = s.readUInt16BE(0x70);
  if (!(tab > 0 && tab + cnt * 2 + 2 + cnt <= s.length && cnt > 0)) return null;
  const mark = new Uint8Array(s.length);
  const touch = (a, b) => { for (let k = Math.max(0, a); k < Math.min(b, s.length); k++) mark[k] = 1; };
  touch(0, 0x74);                                      // шапка блока
  touch(tab, tab + cnt * 2 + 2 + cnt);                 // таблица и байты шагов

  const starts = [];
  for (let i = 0; i < cnt; i++) {
    const o = xv.nodeOffset(s, tab, cnt, i);
    if (o > 0) starts.push(o);
  }
  starts.sort((a, b) => a - b);

  let vectors = 0, backrefs = 0, nodes = 0, fail = 0;
  for (let k = 0; k < starts.length; k++) {
    const lim = Math.min(k + 1 < starts.length ? starts[k + 1] : s.length, s.length);
    let p = starts[k];
    if (p + 2 > lim) continue;
    let n = coordLen(s, p); touch(p, p + n); p += n; nodes++;
    let guard = 0;
    while (p + 2 <= lim && ++guard < 4096) {
      const t = (s.readUInt16BE(p) & 0xc000) >>> 14;
      if (t === 3) {
        const r = record(s, p, attr, touch);
        if (!r) { fail++; break; }
        vectors++;
        p = Math.max(r.end, p + 4);
      } else if (t === 1) {
        backrefs++; touch(p, p + 2); p += 2;
      } else {
        n = coordLen(s, p); touch(p, p + n); p += n; nodes++;
      }
    }
  }
  let seen = 0;
  for (const m of mark) if (m) seen++;
  return { ok: vectors, fail, backrefs, nodes, seen, total: s.length };
}

module.exports = { attributes, record, blockSpan };

if (require.main === module) {
  const db = fldb.open(process.argv[2] || 'maps/pkgdb/XAC/kN221EUx01_0.db');
  const list = fldb.entries(db);
  const attr = attributes(fldb.read(db, list.find((x) => /\.xah$/i.test(x.name))));
  console.log('таблица ATTRIBUTE: %d записей', attr.length);
  const tiles = list.filter((x) => /\.xac$/i.test(x.name)).slice(0, Number(process.argv[3] || 40));
  let ok = 0, fail = 0, seen = 0, total = 0, blocks = 0, nodes = 0, backrefs = 0;
  for (const e of tiles) {
    const buf = fldb.read(db, e);
    for (const b of xac.vectorBlocks(buf)) {
      if (b.version !== 5) continue;
      const r = blockSpan(buf.subarray(b.offset, b.offset + b.size), attr);
      if (!r) continue;
      blocks++; ok += r.ok; fail += r.fail; seen += r.seen; total += r.total;
      nodes += r.nodes; backrefs += r.backrefs;
    }
  }
  console.log('блоков v5 %d, узлов %d, векторов %d, обратных ссылок %d, сбоев %d',
    blocks, nodes, ok, backrefs, fail);
  console.log('байт объяснено %d из %d  (%s%%)', seen, total, (100 * seen / total).toFixed(1));
}
