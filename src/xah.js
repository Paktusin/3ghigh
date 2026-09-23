'use strict';
// Общий индекс `.xah`: контейнер разделов и шапка `XACDB HEADER`.
//
//   node src/xah.js                 разделы, шапка, обратная сборка
//   node src/xah.js --header        только шапка, поле за полем
//
// Зачем отдельный модуль. Цель проекта — образ, где все файлы наши и несут
// только Кипр (см. README). Пока `.xah` берётся заводским, контейнер `XAC`
// обязан оставаться заводского размера, а образ — требовать заводской базы под
// собой. Значит `.xah` надо собирать, и первое, что для этого нужно, — уметь
// разобрать его и собрать обратно байт в байт.
//
// ── Что в нём обязательно, а что нет ──────────────────────────────────────
// Прочитано в коде (`FUN_08280f50`, открыватель `.xah`, он же `dbm_opendb.cpp`),
// а не выведено из данных:
//
//   ОБЯЗАТЕЛЬНО (иначе открытие возвращает ошибку и база не поднимается):
//     * `XACDB HEADER` — «no header in XAH-File» / «xac_get_header_infos…»;
//     * версия шапки ≥ 2, иначе «xac_get_header_infos_from_xah»; при версии ≥ 8
//       ОБЯЗАТЕЛЬНЫ и `BUILD INFOS` («build infos are mandatory for %d»), а у
//       нашего набора версия как раз 8;
//     * `XAC-STRUKTUR` — «no 'xac-struktur' in XAH-File»;
//     * проверка `xac_check_bits_and_bounds` (`FUN_0828078c`);
//     * `xac_set_db_infos_in_xac_cache`.
//
//   ТОЛЬКО ПРЕДУПРЕЖДЕНИЕ (база поднимается без них):
//     * `MAJOR ROAD` — «major road flags unknown»;
//     * `L3 GRUPPEN` — «old database without l3 groups»;
//     * `ETA-KOSTEN` — «no 'etatab' in XAH-File». Но если раздел ЕСТЬ и не
//       принимается, это уже ошибка: «xac_set_eta_kosten failed».
//
// ── Проверка bits and bounds ──────────────────────────────────────────────
// `FUN_0828078c` сверяет двенадцать байт разрядностей (+0x6c) с зашитыми в
// прошивке: если `int` по +0x6c равен `0x0c100c20`, а `int` по +0x70 под маской
// `0x00ffffff` равен `0x00120a10`, вся проверка разрядностей ПРОПУСКАЕТСЯ.
// У заводской шапки они именно такие, поэтому свой `.xah` эти двенадцать байт
// обязан нести без изменений.
//
// Затем безусловная проверка: число тайлов (`+0x48`) не больше `NID_MAX_FE` —
// «Fehler FE Anzahl in DB %d, NID_MAX_FE %d». Кипру это не грозит: у завода
// 3777 тайлов, у нас будут единицы.

const fs = require('fs');
const path = require('path');
const xac = require('./xac');
const fldb = require('./fldb');
const dataset = require('./dataset');

const NAME_LEN = 16;       // имя раздела, дополняется пробелами
const HEAD = 20;           // имя + u32 длины

// Поля шапки. Смещения — от НАЧАЛА РАЗДЕЛА (вместе с именем и длиной), так же
// их считает прошивка: она получает указатель на раздел целиком.
const H = {
  version: 0x14,           // u16, читается как CONCAT11(+0x14, +0x15)
  label: 0x18,             // 16 байт, у завода пробелы
  built: 0x28,             // 16 байт, текст «20220218092956»
  name: 0x38,              // 16 байт, «EJ211»
  tiles: 0x48,             // u32 — число тайлов (FE)
  blocks: 0x4c,            // u32 — число блоков VEKTORBLOCK во всей базе
  mode: 0x68,              // u32, у завода 3 (версия > 4)
  bits: 0x6c,              // 12 байт разрядностей, их проверяет прошивка
  bounds: 0x78,            // 10 × u32 (версия > 5)
};

function sections(buf) {
  return xac.sections(buf);
}

// Раздел по имени, вместе с шапкой имени и длины.
function section(buf, name) {
  const s = sections(buf).list.find((x) => x.name === name);
  return s ? { ...s, bytes: buf.subarray(s.offset, s.offset + s.total) } : null;
}

function header(buf) {
  const s = section(buf, 'XACDB HEADER');
  if (!s) throw new Error('раздела XACDB HEADER нет');
  const b = s.bytes;
  const txt = (at) => b.toString('latin1', at, at + 16).replace(/\0[\s\S]*$/, '').trim();
  const out = {
    at: s.offset, total: s.total, payload: s.payload,
    version: b.readUInt16BE(H.version),
    label: txt(H.label), built: txt(H.built), name: txt(H.name),
    tiles: b.readUInt32BE(H.tiles),
    blocks: b.readUInt32BE(H.blocks),
    mode: b.readUInt32BE(H.mode),
    bits: [...b.subarray(H.bits, H.bits + 12)],
    bounds: [],
  };
  for (let i = 0; i < 10; i++) out.bounds.push(b.readUInt32BE(H.bounds + i * 4));
  return out;
}

// Разрядности, при которых прошивка пропускает проверку целиком.
// (`FUN_0828078c`: int по +0x6c == 0x0c100c20 и int по +0x70 & 0x00ffffff == 0x00120a10;
//  числа в прошивке little-endian, отсюда порядок байт.)
const BITS_OK = [0x20, 0x20, 0x20, 0x0c, 0x10, 0x0c, 0x10, 0x0a, 0x12, 0x03, 0x01, 0x00];

function bitsAccepted(bits) {
  for (let i = 0; i < 9; i++) if (bits[i] !== BITS_OK[i]) return false;
  // последние три сверяются под маской 0x00ffffff — старший байт свободен
  return bits[9] === BITS_OK[9] && bits[10] === BITS_OK[10];
}

// Сборка контейнера из разделов: [{ name, data }] -> байты.
// Имя дополняется ПРОБЕЛАМИ до 16 байт — так у завода во всех разделах.
function build(list) {
  const parts = [];
  for (const s of list) {
    if (s.name.length > NAME_LEN) throw new Error('имя раздела длиннее 16: ' + s.name);
    const head = Buffer.alloc(HEAD, 0x20);
    head.write(s.name, 0, 'latin1');
    head.writeUInt32BE(s.data.length, NAME_LEN);
    parts.push(head, s.data);
  }
  return Buffer.concat(parts);
}

// Разобрать контейнер в список { name, data } — вход для build.
function explode(buf) {
  return sections(buf).list.map((s) => ({
    name: s.name,
    data: buf.subarray(s.offset + HEAD, s.offset + s.total),
  }));
}

// Шапка с изменёнными счётчиками: число тайлов и число блоков базы.
function patchHeader(data, counts) {
  const b = Buffer.from(data);
  const off = -HEAD;                      // data без имени и длины
  if (counts.tiles !== undefined) b.writeUInt32BE(counts.tiles, H.tiles + off);
  if (counts.blocks !== undefined) b.writeUInt32BE(counts.blocks, H.blocks + off);
  return b;
}

module.exports = { sections, section, header, build, explode, patchHeader,
                   bitsAccepted, BITS_OK, H, HEAD, NAME_LEN };

if (require.main === module) {
  const root = process.argv.find((a) => !a.startsWith('-') && fs.existsSync(path.join(a, 'pkgdb')));
  const st = require('./struktur');
  const idx = st.openIndex(root || dataset.resolveRoot());
  const buf = idx.buf;
  const h = header(buf);

  console.log('файл ' + idx.name + ', ' + buf.length + ' байт');
  console.log('шапка: версия ' + h.version + ', набор «' + h.name + '», сборка ' + h.built);
  console.log('тайлов ' + h.tiles + ', блоков VEKTORBLOCK в базе ' + h.blocks + ', поле +0x68 ' + h.mode);
  console.log('разрядности: ' + h.bits.map((x) => x.toString(16).padStart(2, '0')).join(' ') +
              ' — прошивка ' + (bitsAccepted(h.bits) ? 'проверку ПРОПУСКАЕТ' : 'будет ПРОВЕРЯТЬ'));
  console.log('десять границ: ' + h.bounds.join(', '));

  if (!process.argv.includes('--header')) {
    const list = sections(buf).list;
    console.log('разделов ' + list.length + ', покрытие ' +
                (sections(buf).complete ? 'полное, без остатка' : 'НЕПОЛНОЕ'));
    const again = build(explode(buf));
    console.log('обратная сборка: ' + (again.equals(buf) ? 'байт в байт' : 'РАСХОЖДЕНИЕ') +
                ' (' + again.length + ' из ' + buf.length + ')');
    if (!again.equals(buf)) process.exit(1);
  }
}
