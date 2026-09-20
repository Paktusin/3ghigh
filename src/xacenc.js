// Обратный проход для XAC: собрать байты обратно из прочитанного и сверить.
//
// Смысл проверки тот же, что у `encodePoints` для GDB: пока мы не умеем
// воспроизвести исходные байты, «прочитали» — это ещё не «понимаем».
// Разметка байт в `blockSpan` говорит только о том, что мы знаем ДЛИНУ куска;
// здесь проверяется, что мы знаем и СОДЕРЖИМОЕ.
'use strict';

const fldb = require('./fldb');
const xac = require('./xac');
const xv = require('./xacvec');
const xr = require('./xacrec');

// Обратная к koord: три формы, точно по u_get_koord_c (FUN_082727e8).
// `keep` — байты оригинала: из них берутся разряды, которых декодер не читает.
function encodeCoord(c, ox, oy, form, keep) {
  if (form === 4) {
    const vx = c.x - ox + 16384, vy = c.y - oy + 32768;
    if (vx < 0 || vx > 0x7fff || vy < 0 || vy > 0xffff) return null;
    const out = Buffer.alloc(4);
    out.writeUInt16BE(vx & 0x7fff, 0);
    out.writeUInt16BE(vy, 2);
    return out;                                // все разряды определены
  }
  if (form === 6) {
    const vx = c.x - ox + 524288, vy = c.y - oy + 524288;
    if (vx < 0 || vx > 0xfffff || vy < 0 || vy > 0xfffff) return null;
    const out = Buffer.alloc(6);
    out[0] = 0x80 | (keep[0] & 0x1f);          // метка, бит 5 = 0, остальное как было
    out[1] = ((vy >> 16) << 4) | (vx >> 16);
    out.writeUInt16BE(vx & 0xffff, 2);
    out.writeUInt16BE(vy & 0xffff, 4);
    return out;
  }
  if (form === 8) {
    const vx = c.x - ox + 134217728, vy = c.y - oy + 134217728;
    if (vx < 0 || vx > 0xfffffff || vy < 0 || vy > 0xfffffff) return null;
    const out = Buffer.alloc(8);
    out[0] = 0xa0 | (keep[0] & 0x1f);          // метка и бит 5 = 1
    out[1] = ((vy >> 24) << 4) | (vx >> 24);
    out[2] = (vx >> 16) & 0xff; out[3] = (vx >> 8) & 0xff; out[4] = vx & 0xff;
    out[5] = (vy >> 16) & 0xff; out[6] = (vy >> 8) & 0xff; out[7] = vy & 0xff;
    return out;
  }
  return null;
}

// Длина: мантисса в младших 12 битах, поле сдвига в битах 12..14, сдвиг = n*2.
// Бит 15 декодер не читает; в данных он стоит почти всегда.
function encodeLength(v) {
  for (let n = 0; n <= 7; n++) {
    const sh = n * 2;
    if (((v >>> sh) << sh) === v && (v >>> sh) <= 0xfff) return (n << 12) | (v >>> sh);
  }
  return null;
}

// Заголовок записи вектора: слово 0 и слово 1.
// Бит 15 слова 1 прошивка не читает — переносим как есть.
function encodeHeader(node, idx, hi, keep15) {
  return [
    (0xc000 | (node & 0x3fff)) & 0xffff,
    (keep15 & 0x8000) | (((hi >> 6) & 1) << 14) | (((hi >> 5) & 1) << 13)
      | (((hi >> 4) & 1) << 12) | (((hi >> 3) & 1) << 11) | (idx & 0x07ff),
  ];
}

function formAt(s, p) {
  const w = s.readUInt16BE(p);
  if ((w & 0xc000) === 0x8000) return ((s[p] >> 5) & 1) ? 8 : 6;
  return 4;
}

// Проход по узлам блока с обратной сборкой координат.
function blockRound(s, attr, stat) {
  if (s.length < 0x74 || s.readUInt16BE(0x72) !== 1) return;
  const tab = s.readUInt32BE(0x6c), cnt = s.readUInt16BE(0x70);
  if (!(tab > 0 && tab + cnt * 2 + 2 + cnt <= s.length && cnt > 0)) return;
  const ox = s.readInt32BE(0x28), oy = s.readInt32BE(0x2c);
  const mode = (s[0x39] >> 1) & 3;
  const ver = s.readUInt16BE(0x14);
  const two = (ver === 2 || (ver > 2 && (s[0x3d] & 0x80))) ? 1 : 0;
  const starts = [];
  for (let i = 0; i < cnt; i++) {
    const o = xv.nodeOffset(s, tab, cnt, i);
    if (o > 0) starts.push(o);
  }
  starts.sort((a, b) => a - b);

  const check = (p) => {
    const form = formAt(s, p);
    if (p + form > s.length) return form;
    const c = xv.koord(s, p, ox, oy);
    const orig = s.subarray(p, p + form);
    stat.form[form] = (stat.form[form] || 0) + 1;
    if (!c) { stat.nodec++; return form; }
    const back = encodeCoord(c, ox, oy, form, orig);
    if (!back) { stat.range++; return form; }
    stat.total++;
    if (back.equals(orig)) stat.same++;
    else {
      stat.diff++;
      for (let k = 0; k < form; k++) {
        const x = back[k] ^ orig[k];
        for (let b = 0; b < 8; b++) if ((x >> b) & 1) {
          const key = form + ':' + k + ':' + b;
          stat.bits.set(key, (stat.bits.get(key) || 0) + 1);
        }
      }
    }
    // Разряды, которых декодер не читает. У компактной формы таких нет:
    // бит 15 обязан быть нулём, иначе метка увела бы в другую ветку.
    // У длинных форм это младшие пять разрядов байта 0.
    if (form !== 4) stat.opaque += 5;
    return form;
  };

  for (let k = 0; k < starts.length; k++) {
    const lim = Math.min(k + 1 < starts.length ? starts[k + 1] : s.length, s.length);
    let p = starts[k];
    if (p + 2 > lim) continue;
    p += check(p);
    let guard = 0;
    while (p + 2 <= lim && ++guard < 4096) {
      const t = (s.readUInt16BE(p) & 0xc000) >>> 14;
      if (t === 3) {
        const r = xr.record(s, p, attr, () => {});
        if (!r) break;
        const o0 = s.readUInt16BE(p), o1 = s.readUInt16BE(p + 2);
        const [e0, e1] = encodeHeader(r.node, r.idx, o1 >> 8, o1);
        stat.rec++;
        if (e0 === o0) stat.w0++;
        if (e1 === o1) stat.w1++;
        if (o1 & 0x8000) stat.w1bit15++;
        if (mode !== 1 && r.length[0] > 0) {
          const q = r.end - 2 - two * 2;
          if (q >= 0 && q + 2 <= s.length) {
            const orig = s.readUInt16BE(q), enc = encodeLength(r.length[0]);
            stat.len++;
            if (enc !== null && (enc | (orig & 0x8000)) === orig) stat.lenOk++;
            if (orig & 0x8000) stat.lenBit15++;
          }
        }
        p = Math.max(r.end, p + 4);
      } else if (t === 1) { p += 2; }
      else p += check(p);
    }
  }
}

module.exports = { encodeCoord, encodeLength, encodeHeader, blockRound };

if (require.main === module) {
  const db = fldb.open(process.argv[2] || 'maps/pkgdb/XAC/kN221EUx01_0.db');
  const list = fldb.entries(db);
  const attr = xr.attributes(fldb.read(db, list.find((x) => /\.xah$/i.test(x.name))));
  const stat = { total: 0, same: 0, diff: 0, nodec: 0, range: 0, opaque: 0,
                 form: {}, bits: new Map(),
                 rec: 0, w0: 0, w1: 0, w1bit15: 0, len: 0, lenOk: 0, lenBit15: 0 };
  for (const e of list.filter((x) => /\.xac$/i.test(x.name)).slice(0, Number(process.argv[3] || 20))) {
    const buf = fldb.read(db, e);
    for (const b of xac.vectorBlocks(buf)) {
      if (b.version !== 5) continue;
      blockRound(buf.subarray(b.offset, b.offset + b.size), attr, stat);
    }
  }
  console.log('координат собрано обратно: %d, совпало %d (%s%%), разошлось %d',
    stat.total, stat.same, (100 * stat.same / stat.total).toFixed(2), stat.diff);
  console.log('формы: ' + Object.entries(stat.form).map(([k, v]) => k + ' байт: ' + v).join(', '));
  console.log('не читается декодером: %d бит на %d координат (%s бит на штуку)',
    stat.opaque, stat.total, (stat.opaque / stat.total).toFixed(2));
  console.log('');
  console.log('записей вектора: %d', stat.rec);
  console.log('  слово 0 собрано: %d (%s%%)', stat.w0, (100 * stat.w0 / stat.rec).toFixed(2));
  console.log('  слово 1 собрано: %d (%s%%), бит 15 стоит у %s%%',
    stat.w1, (100 * stat.w1 / stat.rec).toFixed(2), (100 * stat.w1bit15 / stat.rec).toFixed(2));
  if (stat.len) console.log('  слово длины собрано: %d из %d (%s%%), бит 15 стоит у %s%%',
    stat.lenOk, stat.len, (100 * stat.lenOk / stat.len).toFixed(2),
    (100 * stat.lenBit15 / stat.len).toFixed(2));
  if (stat.diff) {
    console.log('\nгде расходится (форма:байт:бит — сколько раз):');
    for (const [k, v] of [...stat.bits].sort((a, b) => b[1] - a[1]).slice(0, 12))
      console.log('   ' + k + '   ' + v);
  }
}
