'use strict';
// Раздел HAUSNUMMERN дорожного тайла: номера домов по улицам.
//
// Раскладка шапки (сошлась на всех 3427 тайлах базы, где раздел есть):
//
//   +0x14 u32   версия, у всех 0x00050000
//   +0x18 u32   число записей индекса — ровно «имён ZE-NAMEN + 1»
//   +0x1c u32   смещение индекса, всегда 48
//   +0x20 u32   его длина, ровно «записей × 3»
//   +0x24 u32   счётчик; по всей видимости число домов (догадка, см. ниже)
//   +0x28 u32   смещение области данных
//   +0x2c u32   её длина
//
// Индекс — по ТРИ байта на имя: u24 смещение внутри области данных. Номера
// домов улицы i лежат от at(i) до at(i+1); равенство значит «у имени номеров
// нет». Поэтому в индексе на одну запись больше, чем имён: последняя
// замыкающая, и она равна длине области данных.
//
// Проверено сплошь по всем 3427 тайлам с разделом, каждое свойство 3427 из
// 3427: длина индекса равна «записей × 3», записей ровно «имён + 1», смещения
// неубывающие, последнее равно длине области данных, область данных целиком
// внутри раздела.
//
// Числа в области данных кодируются переменной длиной: семь бит на байт,
// старший бит — признак продолжения, порядок от старших разрядов к младшим.
// Декодер снят с прошивки (`xac_hnr.cpp`, `get_first_hnr_of_nid`, участок
// 0x08f4a0aa…0x08f4a0c8): `and #127` на каждый байт, сдвиг на 7 и выход по
// неотрицательному байту. Оттуда же подтверждена работа индекса: функция
// читает подряд два u24, прибавляет базу области и сравнивает их на равенство.
//
// ЗАПИСЬ ДОМА разобрана по `u_get_next_hnr` (0x08f498fc), её обвязке
// `get_first_hnr_of_nid` (0x08f49f9c) и обходчику ссылок `u_get_next_hnr_vector`
// (0x08f4a374):
//
//   байт вида: младший ниббл — вид ЛЕВОЙ группы номеров, старший — ПРАВОЙ
//   нулевой байт вида кончает список имени
//   младший ниббл 4 — запись из одного байта: старший ниббл уходит в признак
//   payload левой группы, затем правой (вид 0 — группы нет)
//   список ссылок на дороги, пока у первого байта элемента стоит бит 7
//
// Виды групп (число — от, до):
//
//   0        группы нет
//   1        1 байт: от = до = байт
//   2, 3     2 байта: от, до
//   5        «семибитное» число: ПЕРВЫЙ байт целиком идёт в старшие разряды и
//            без проверки бита 7, дальше обычный варинт; от = до
//   6, 7     4 байта: два u16 BE
//   8        2 байта: от = ((b0 & 3) << 8) | b1, до = от + ((b0 & 0xfc) >> 2) - 32
//   9        2 байта: то же, но сдвиг ((b0 & 0xfc) >> 1) - 64
//   10       3 байта: от = u16 BE, до = от + (b2 - 128)
//   11       3 байта: то же, но (b2 - 128) * 2
//   12, 13   только у ПРАВОЙ группы, 1 байт: от = ((b & 0xf0) >> 4) - 8,
//            до = (b & 0xf) - 8, и к обоим прибавляется левая пара
//   14, 15   два «семибитных» числа, к каждому прибавляется 0x10000
//
// Элемент списка ссылок (бит 7 первого байта — «есть следующий»):
//
//   бит 6 = 0   только ссылка, номер блока прежний
//               бит 5 = 0 — 1 байт: сдвиг = (b & 0x1f) - 16
//               бит 5 = 1 — 2 байта: сдвиг = (((b & 0x1f) << 8) | b1) - 4096
//               ссылка = (ссылка + сдвиг * 2) по u16
//   бит 6 = 1   ссылка = (((b & 0x3f) << 8) | b1) * 2, затем номер блока:
//               b2 без старшего бита — 3 байта, с ним — 4 байта, 15 бит
//
// И то и другое — РОВНО ТОТ ЖЕ `VReferenz`, что у связи «имя -> дорога»:
// прошивка собирает `(номер блока << 16) | (ссылка & 0x7FFE)`, номер блока
// относительный (к первому блоку тайла), номер записи — `ссылка >> 1`.
//
// Если первый байт данных имени нулевой, это ПЕРЕНАПРАВЛЕНИЕ: дома лежат у
// имени `i - 1 - варинт(следующие байты)`. Так завод не повторяет одинаковые
// списки.
//
// ЧЕГО НЕТ: смысла счётчика +0x24. Он не равен ни числу записей, ни числу
// ссылок, ни числу групп номеров (совпадений 6, 6 и 32 из 1664 разделов).

const REC = 3;
const BIG = 0x10000;        // DAT_08f49c50 / DAT_08f49ebc: прибавка у видов 14 и 15
const DELTA2 = -4096;       // DAT_08f49eb8 / DAT_08f4a52e: смещение двухбайтового сдвига
const MASK = 0x7ffe;        // DAT_08f4a530: та же маска, что у VReferenz

function header(d) {
  if (d.length < 0x30) return null;
  const u = (o) => d.readUInt32BE(o);
  return {
    version: u(0x14), count: u(0x18),
    index: { off: u(0x1c), len: u(0x20) },
    houses: u(0x24),
    data: { off: u(0x28), len: u(0x2c) },
  };
}

// Смещение i-й записи индекса внутри области данных.
function at(d, h, i) {
  const o = (h || header(d)).index.off + i * REC;
  return (d[o] << 16) | (d[o + 1] << 8) | d[o + 2];
}

// Байты номеров домов для имени i (пустой буфер, если их нет).
function chunkOf(d, i, h) {
  h = h || header(d);
  const a = at(d, h, i), b = at(d, h, i + 1);
  return d.subarray(h.data.off + a, h.data.off + b);
}

// Число переменной длины: семь бит на байт, старший бит — продолжение.
function varint(b, p) {
  let v = 0;
  while (p < b.length) {
    const c = b[p++];
    v = (v << 7) | (c & 0x7f);
    if (!(c & 0x80)) break;
  }
  return [v, p];
}

// «Семибитное» число видов 5, 14 и 15: первый байт целиком в старшие разряды,
// дальше обычный варинт. Занимает не меньше двух байт.
function num7(d, p) {
  if (d[p] === undefined || d[p + 1] === undefined) return null;
  let v = d[p] << 7;
  p++;
  let b = d[p];
  while (b & 0x80) {
    v = (v | (b & 0x7f)) << 7;
    p++;
    b = d[p];
    if (b === undefined) return null;
  }
  return { from: v | (b & 0x7f), p: p + 1 };
}

// Группа номеров по виду. `other` — левая пара, нужна видам 12 и 13.
function group(d, p, code, other) {
  const two = (q) => (d[q] << 8) | d[q + 1];
  switch (code) {
    case 0: return { from: null, to: null, p };
    case 1: return { from: d[p], to: d[p], p: p + 1 };
    case 2: case 3: return { from: d[p], to: d[p + 1], p: p + 2 };
    case 5: { const r = num7(d, p); return r && { from: r.from, to: r.from, p: r.p }; }
    case 6: case 7: return { from: two(p), to: two(p + 2), p: p + 4 };
    case 8: { const f = ((d[p] & 3) << 8) | d[p + 1];
              return { from: f, to: f + (((d[p] & 0xfc) >> 2) - 0x20), p: p + 2 }; }
    case 9: { const f = ((d[p] & 3) << 8) | d[p + 1];
              return { from: f, to: f + (((d[p] & 0xfc) >> 1) - 0x40), p: p + 2 }; }
    case 10: { const f = two(p); return { from: f, to: f + (d[p + 2] - 0x80), p: p + 3 }; }
    case 11: { const f = two(p); return { from: f, to: f + (d[p + 2] - 0x80) * 2, p: p + 3 }; }
    case 12: case 13: {
      const base = other && other.from !== null ? other : { from: 0, to: 0 };
      return { from: ((d[p] & 0xf0) >> 4) - 8 + base.from,
               to: (d[p] & 0x0f) - 8 + base.to, p: p + 1 };
    }
    case 14: case 15: {
      const a = num7(d, p); if (!a) return null;
      const b = num7(d, a.p); if (!b) return null;
      return { from: a.from + BIG, to: b.from + BIG, p: b.p };
    }
    default: return null;                     // вид 4 разбирается отдельно
  }
}

// Список ссылок на дороги в конце записи. `state` тянется от записи к записи.
function refs(d, p, state) {
  const out = [];
  for (;;) {
    const b = d[p];
    if (b === undefined) return null;
    if (!(b & 0x40)) {
      if (state.block === 0xffff || state.ref === -1) return null;
      let s;
      if (!(b & 0x20)) { s = (b & 0x1f) - 0x10; p += 1; }
      else { s = (((b & 0x1f) << 8) | d[p + 1]) + DELTA2; p += 2; }
      state.ref = (state.ref + s * 2) & 0xffff;
    } else {
      state.ref = ((((b & 0x3f) << 8) | d[p + 1]) * 2) & 0xffff;
      if (d[p + 2] & 0x80) { state.block = ((d[p + 2] & 0x7f) << 8) | d[p + 3]; p += 4; }
      else { state.block = d[p + 2] & 0x7f; p += 3; }
    }
    out.push({ block: state.block, rec: (state.ref & MASK) >> 1 });
    if (!(b & 0x80)) return { list: out, p };
  }
}

// Дома имени i. Возвращает { rows, redirect, end } либо null при сбое.
// `rows` — записи { left: [от, до], right: [от, до], flag, refs: [{block, rec}] }.
function housesOf(d, i, h) {
  h = h || header(d);
  const a = h.data.off + at(d, h, i), b = h.data.off + at(d, h, i + 1);
  if (a === b) return { rows: [], redirect: null, end: a };
  if (d[a] === 0) {                                  // перенаправление на другое имя
    const [v, p] = varint(d, a + 1);
    return { rows: [], redirect: i - 1 - v, end: p };
  }
  const rows = [];
  const state = { block: 0xffff, ref: -1 };
  let p = a, flag = 0;
  while (p < b) {
    const k = d[p];
    if (k === 0) return { rows, redirect: null, end: p + 1 };
    const lo = k & 0xf, hi = k >> 4;
    p += 1;
    if (lo === 4) { flag = hi; continue; }
    const L = group(d, p, lo, null); if (!L) return null; p = L.p;
    const Rg = hi === 0 ? { from: null, to: null, p } : group(d, p, hi, L);
    if (!Rg) return null; p = Rg.p;
    const v = refs(d, p, state); if (!v) return null; p = v.p;
    rows.push({ left: [L.from, L.to], right: [Rg.from, Rg.to], flag, refs: v.list });
  }
  return { rows, redirect: null, end: p };
}

// Собрать индекс обратно: смещения по три байта, замыкающая запись — длина.
function buildIndex(offsets) {
  const out = Buffer.alloc(offsets.length * REC);
  offsets.forEach((v, i) => {
    out[i * REC] = (v >> 16) & 0xff;
    out[i * REC + 1] = (v >> 8) & 0xff;
    out[i * REC + 2] = v & 0xff;
  });
  return out;
}

module.exports = { header, at, chunkOf, varint, buildIndex, housesOf, group, refs,
                   num7, REC, BIG, DELTA2, MASK };
