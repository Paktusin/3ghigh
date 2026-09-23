'use strict';
// Раздел `FE GRUPPEN` общего индекса `.xah`: группы тайлов и страны.
//
//   node src/fegruppen.js            сводка и обратная сборка
//   node src/fegruppen.js --lands    страны со списком тайлов
//
// Раскладка взята из кода, а не из данных. `FUN_0827ddcc`
// (`xac_get_land_info_from_fe_gruppen`) читает версию раздела по +0x14, число
// записей по +0x20, смещение записей по +0x1c, а при версии 3…5 идёт по
// записям, помеченным буквами `LD`, шагая на их собственную длину. У нашего
// набора версия 4 — значит форма именно такая.
//
// Оттуда же видно, что перед записями стран лежит такая же по устройству
// область записей с меткой `GR` (Gruppe): её начало в +0x18, число записей в
// +0x1a.
//
//   ── заголовок раздела (смещения от начала раздела) ─────────────────────
//     +0x10 u32  длина данных            +0x14 u16  версия (4)
//     +0x18 u16  начало записей GR       +0x1a u16  сколько их (45)
//     +0x1c u32  начало записей LD       +0x20 u16  сколько их (46)
//
//   ── запись группы ──────────────────────────────────────────────────────
//     'GR', u16 длина, u16 номер группы, u16 сколько тайлов, затем номера
//     тайлов по u16. Длина = 8 + 2·число тайлов.
//
//   ── запись страны ──────────────────────────────────────────────────────
//     'LD', u16 длина, u16 код страны, u8 (назначение не установлено),
//     u8 флаги (бит 0 и биты 1–2 читает прошивка), u32 значение,
//     u16 сколько тайлов, затем номера тайлов по u16.
//     Длина = 14 + 2·число тайлов.
//
// Сверка с двух концов: 45 групп и 46 стран, и те и другие покрывают **все
// 3777 тайлов ровно по разу**; ни в одной записи страны не смешаны тайлы с
// разными двухбуквенными кодами (46 из 46). Страна 1 — `DE`, 415 тайлов;
// страна 4 — `LI`, один тайл.

const xah = require('./xah');

const SEC = 'FE GRUPPEN';
const H = { version: 0x14, grOff: 0x18, grCount: 0x1a, ldOff: 0x1c, ldCount: 0x20 };

function tilesAt(b, at, count) {
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = b.readUInt16BE(at + i * 2);
  return out;
}

function read(xahBuf) {
  const s = xah.section(xahBuf, SEC);
  if (!s) return null;
  const b = s.bytes;
  const grOff = b.readUInt16BE(H.grOff), grCount = b.readUInt16BE(H.grCount);
  const ldOff = b.readUInt32BE(H.ldOff), ldCount = b.readUInt16BE(H.ldCount);

  const groups = [];
  let p = grOff;
  for (let i = 0; i < grCount; i++) {
    if (b.toString('latin1', p, p + 2) !== 'GR') throw new Error('не GR на ' + p);
    const len = b.readUInt16BE(p + 2);
    groups.push({ id: b.readUInt16BE(p + 4), tiles: tilesAt(b, p + 8, b.readUInt16BE(p + 6)) });
    p += len;
  }
  const gap = ldOff - p;                       // выравнивание перед областью стран

  const lands = [];
  p = ldOff;
  for (let i = 0; i < ldCount; i++) {
    if (b.toString('latin1', p, p + 2) !== 'LD') throw new Error('не LD на ' + p);
    const len = b.readUInt16BE(p + 2);
    lands.push({
      id: b.readUInt16BE(p + 4), byte6: b[p + 6], flags: b[p + 7],
      value: b.readUInt32BE(p + 8),
      tiles: tilesAt(b, p + 14, b.readUInt16BE(p + 12)),
    });
    p += len;
  }
  const tail = b.length - p;                   // хвост после последней страны

  return { head: Buffer.from(b.subarray(20, grOff)), version: b.readUInt16BE(H.version),
           grOff, ldOff, gap, tail, groups, lands };
}

// Модель обратно в байты РАЗДЕЛА (без имени и длины — их ставит xah.build).
function build(m) {
  const grBytes = m.groups.map((g) => {
    const b = Buffer.alloc(8 + g.tiles.length * 2);
    b.write('GR', 0, 'latin1');
    b.writeUInt16BE(b.length, 2);
    b.writeUInt16BE(g.id, 4);
    b.writeUInt16BE(g.tiles.length, 6);
    g.tiles.forEach((t, i) => b.writeUInt16BE(t, 8 + i * 2));
    return b;
  });
  const ldBytes = m.lands.map((l) => {
    const b = Buffer.alloc(14 + l.tiles.length * 2);
    b.write('LD', 0, 'latin1');
    b.writeUInt16BE(b.length, 2);
    b.writeUInt16BE(l.id, 4);
    b[6] = l.byte6; b[7] = l.flags;
    b.writeUInt32BE(l.value, 8);
    b.writeUInt16BE(l.tiles.length, 12);
    l.tiles.forEach((t, i) => b.writeUInt16BE(t, 14 + i * 2));
    return b;
  });

  const grOff = 20 + m.head.length;            // головка идёт сразу за u32 длины
  const grLen = grBytes.reduce((a, b) => a + b.length, 0);
  const gap = m.gap === undefined ? 0 : m.gap;
  const ldOff = grOff + grLen + gap;
  const ldLen = ldBytes.reduce((a, b) => a + b.length, 0);

  const head = Buffer.from(m.head);            // правим в ней смещения и счётчики
  const at = (o) => o - 20;                    // смещения в разделе -> в head
  head.writeUInt16BE(grOff, at(H.grOff));
  head.writeUInt16BE(m.groups.length, at(H.grCount));
  head.writeUInt32BE(ldOff, at(H.ldOff));
  head.writeUInt16BE(m.lands.length, at(H.ldCount));

  return Buffer.concat([head, ...grBytes, Buffer.alloc(gap), ...ldBytes,
                        Buffer.alloc(m.tail === undefined ? 0 : m.tail)]);
}

module.exports = { read, build, SEC, H };

if (require.main === module) {
  const st = require('./struktur');
  const idx = st.openIndex();
  const m = read(idx.buf);
  const codes = [...st.parse(idx.buf).keys()];

  const inGroups = new Set(), inLands = new Set();
  m.groups.forEach((g) => g.tiles.forEach((t) => inGroups.add(t)));
  m.lands.forEach((l) => l.tiles.forEach((t) => inLands.add(t)));
  console.log('версия ' + m.version + ': групп ' + m.groups.length +
              ', стран ' + m.lands.length);
  console.log('тайлов в группах ' + inGroups.size + ', в странах ' + inLands.size +
              ', в реестре ' + codes.length);
  const mixed = m.lands.filter((l) => new Set(l.tiles.map((t) => (codes[t] || '??').slice(0, 2))).size !== 1);
  console.log('стран со смешанными кодами тайлов: ' + mixed.length + ' из ' + m.lands.length);

  if (process.argv.includes('--lands')) {
    for (const l of m.lands) {
      console.log('  страна ' + String(l.id).padStart(3) + ': тайлов ' +
                  String(l.tiles.length).padStart(4) + '  ' +
                  (codes[l.tiles[0]] || '??').slice(0, 2) +
                  '  байт6 ' + l.byte6 + ', флаги 0x' + l.flags.toString(16) +
                  ', значение ' + l.value);
    }
  }

  const want = xah.section(idx.buf, SEC).bytes.subarray(20);
  const again = build(m);
  console.log('обратная сборка: ' + (again.equals(want) ? 'байт в байт' : 'РАСХОЖДЕНИЕ') +
              ' (' + again.length + ' из ' + want.length + ')');
  if (!again.equals(want)) process.exit(1);
}
