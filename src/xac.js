'use strict';
// Разбор дорожного тайла .xac: разделы, векторные блоки и координаты.
// Использование: node src/xac.js <файл.xac>
//
// Структура раздела (нашёл Codex, подтверждено сплошным покрытием файла):
//   0x00  16 байт  имя раздела
//   0x10  u32 BE   длина полезной части; полный размер раздела = длина + 20
//   0x14  ...      полезная часть
//
// Заголовок раздела VEKTORBLOCK (смещения от начала раздела):
//   0x14  u16 BE   версия структуры (3 / 4 / 5); коррелирует с масштабом блока
//   0x18  4 x i32 BE  границы: xmin, ymin, xmax, ymax
//   0x28  2 x i32 BE  опорная точка блока: x, y
//
// ПРОЕКЦИЯ (равнопромежуточная цилиндрическая), выведена по эталонным
// территориям и проверена на Ватикане с точностью около 100 м:
//   долгота = X / 72000
//   широта  = Y / (40000000 / 360)      // 111111.111... — метры на градус
// То есть Y — метры по меридиану для сферы окружностью 40000 км,
// а X — угловая величина: 72000 единиц на градус (20 единиц на угловую секунду).

const fs = require('fs');

const SCALE_X = 72000;
const SCALE_Y = 40000000 / 360;

const toLon = x => x / SCALE_X;
const toLat = y => y / SCALE_Y;
const fromLon = lon => Math.round(lon * SCALE_X);
const fromLat = lat => Math.round(lat * SCALE_Y);

function cleanName(buf, from, to) {
  let s = '';
  for (let i = from; i < to; i++) {
    const c = buf[i];
    if (c >= 0x20 && c <= 0x7e) s += String.fromCharCode(c);
  }
  return s.trim();
}

// Последовательный обход разделов. Возвращает список и признак полного покрытия.
function sections(buf) {
  const list = [];
  let p = 0;
  while (p + 20 <= buf.length) {
    const name = cleanName(buf, p, p + 16);
    const len = buf.readUInt32BE(p + 16);
    const total = len + 20;
    if (total < 20 || p + total > buf.length) break;
    // подчёркивание встречается в именах разделов .xah, например FE_MIX_INFO
    if (!/^[A-Z0-9 _+-]+$/.test(name)) break;
    list.push({ name, offset: p, total, payload: len });
    p += total;
  }
  return { list, covered: p, complete: p === buf.length };
}

function vectorBlocks(buf) {
  return sections(buf).list
    .filter(s => s.name.indexOf('VEKTORBLOCK') === 0)
    .map(s => {
      const b = buf.subarray(s.offset, s.offset + s.total);
      const bounds = [24, 28, 32, 36].map(o => b.readInt32BE(o));
      return {
        offset: s.offset, size: s.total,
        version: b.readUInt16BE(20),
        bounds,
        origin: [b.readInt32BE(40), b.readInt32BE(44)],
        west: toLon(bounds[0]), south: toLat(bounds[1]),
        east: toLon(bounds[2]), north: toLat(bounds[3]),
      };
    });
}

// Реестр стран из общего индекса .xah: раздел COUNTRY, 216 записей по 10 байт
// начиная с +64 полезной части. Поле 0x3a шапки VEKTORBLOCK — это номер записи
// ПЛЮС ОДИН: правило сошлось на 46 странах из 46 (по одному тайлу на страну,
// все три контейнера XAC). Кипр лежит записью 112, то есть его код — 113.
function countries(xahBuf) {
  const sec = sections(xahBuf).list.find((x) => x.name === 'COUNTRY');
  if (!sec) throw new Error('раздел COUNTRY не найден');
  const d = xahBuf.subarray(sec.offset, sec.offset + sec.total);
  const out = [];
  for (let p = 64; p + 10 <= d.length && out.length < 216; p += 10) {
    const pick = (a, b) => d.toString('latin1', p + a, p + b).replace(/\0/g, '');
    out.push({ code: out.length + 1, cc: pick(0, 2), iso2: pick(2, 4), iso3: pick(4, 7), car: pick(7, 10) });
  }
  return out;
}

// Код для поля 0x3a по внутреннему коду страны (`CY`) или по ISO (`CYP`).
function countryCode(xahBuf, name) {
  const up = String(name).toUpperCase();
  const r = countries(xahBuf).find((x) => x.cc === up || x.iso2 === up || x.iso3 === up);
  return r ? r.code : null;
}

module.exports = { sections, vectorBlocks, countries, countryCode,
                   toLon, toLat, fromLon, fromLat, SCALE_X, SCALE_Y };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('использование: node src/xac.js <файл.xac>'); process.exit(1); }
  const buf = fs.readFileSync(file);
  const s = sections(buf);

  console.log('файл     :', file, '(' + buf.length + ' байт)');
  console.log('разделов :', s.list.length,
    s.complete ? '— файл покрыт полностью' : '— разбор оборвался на ' + s.covered);
  const kinds = {};
  for (const x of s.list) kinds[x.name] = (kinds[x.name] || 0) + 1;
  for (const k in kinds) console.log('   ' + k.padEnd(20), kinds[k]);

  const vb = vectorBlocks(buf);
  if (!vb.length) return;

  console.log();
  console.log('векторные блоки:');
  console.log('  смещение    размер  верс      широта              долгота');
  for (const v of vb) {
    console.log('  ' + String(v.offset).padStart(8), String(v.size).padStart(8),
      String(v.version).padStart(5), '  ' +
      v.south.toFixed(4) + '..' + v.north.toFixed(4) + '   ' +
      v.west.toFixed(4) + '..' + v.east.toFixed(4));
  }
  const W = Math.min(...vb.map(v => v.west)), E = Math.max(...vb.map(v => v.east));
  const S = Math.min(...vb.map(v => v.south)), N = Math.max(...vb.map(v => v.north));
  console.log();
  console.log('охват тайла: ' + S.toFixed(4) + '..' + N.toFixed(4) + ' с.ш.,  ' +
    W.toFixed(4) + '..' + E.toFixed(4) + ' в.д.');
  console.log('ссылка     : https://www.openstreetmap.org/#map=13/' +
    ((S + N) / 2).toFixed(4) + '/' + ((W + E) / 2).toFixed(4));
}
