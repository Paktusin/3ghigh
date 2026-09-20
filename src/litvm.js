// Машина, исполняющая грамматику LIT из блока TTD.
//
// Грамматика — таблица записей по 10 слов (src/litschema.js). Разбор идёт по
// ней: числовые коды читают значения из потока данных, управляющие ходят по
// самой таблице. Семантика выведена из FUN_08cd0798 (чтение записи) и
// FUN_08ccf84c (раскладка прочитанного по полям).
//
// Проверенные соответствия:
//   0x81  значение = (последнее >> w4) & маска(w5)   — записи 10 и 12 дают
//         старший и младший полубайты, что и подтвердилось на данных
//   условие: (последнее & w7) == w9, бит 10 флагов инвертирует
//   бит 12 флагов у типа '[' выбирает «прибавить» вместо «задать»
'use strict';

const SKIP = 0x8000, COND = 0x0800, INV = 0x0400, ADD = 0x1000;

function run(schema, data, startRule, opt) {
  const o = opt || {};
  const limit = o.limit || 200000;
  const words = schema.words, stride = schema.stride, first = schema.first;
  const ruleOf = (i) => words.slice(first + i * stride, first + i * stride + stride);
  const idxOfWord = (w) => (w - first) / stride;

  // reg — последнее значение, ПРОЧИТАННОЕ ИЗ ПОТОКА. Условия и код 0x81
  // смотрят именно на него, а не на результат предыдущей выборки полубайта:
  // в прошивке это отдельный регистр кадра, а не «последнее значение вообще».
  let pc = startRule, p = 0, reg = 0, code = 0, steps = 0, wid = 12;
  let X = 0, Y = 0, baseX = 0;                       // состояние дельта-кодека координат
  const slot = {}, field = {}, codes = new Map();
  const loops = [], calls = [], records = [];
  let rec = null;

  const u = (n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + data[p++]; return v; };
  const s = (n) => { const v = u(n), top = Math.pow(2, n * 8); return v >= top / 2 ? v - top : v; };
  const varint = (signed) => {                       // 252/253/254 — длиннее
    const b = data[p];
    if (b === 252) { p++; return signed ? s(2) : u(2); }
    if (b === 253) { p++; return signed ? s(3) : u(3); }
    if (b === 254) { p++; return signed ? s(4) : u(4); }
    p++; return signed && b > 127 ? b - 256 : b;
  };

  while (p < data.length && steps++ < limit) {
    if (pc < 0 || first + pc * stride + stride > words.length) return fin('схема кончилась');
    const r = ruleOf(pc), w0 = r[0], op = w0 & 0xff;
    const arg = r[1], type = r[2], tgt = r[4], k = r[5];

    if (w0 & SKIP) { pc++; continue; }
    if (w0 & COND) {                                  // условие по последнему значению
      let hit = (reg & r[7]) === r[9] && ((reg >>> 16) & r[6]) === r[8];
      if (w0 & INV) hit = !hit;
      if (!hit) { pc++; continue; }
    }

    let val = null;
    switch (op) {
      case 0x10: if (rec && Object.keys(rec).length) records.push(rec); rec = {}; break;
      case 0x11:
        if (calls.length) { pc = calls.pop(); continue; }
        if (tgt) { pc = idxOfWord(tgt); continue; }
        return fin('конец');
      case 0x20: val = varint(true); break;
      case 0x21: val = s(1); break;
      case 0x22: val = s(2); break;
      case 0x23: val = s(3); break;
      case 0x24: val = s(4); break;
      case 0x25: val = varint(false); break;
      case 0x26: val = u(1); break;
      case 0x27: val = u(2); break;
      case 0x28: val = u(3); break;
      case 0x29: val = u(4); break;
      case 0x80: val = (tgt << 16) | k; break;
      case 0x81: val = (reg >>> tgt) & ((1 << k) - 1); break;
      case 0x40: {                                    // упакованная пара координат
        let x, y;
        if (wid === 12) { const a = u(1), b = u(1), c = u(1); x = a + (c & 0x0f) * 256; y = b + (c >> 4) * 256; }
        else if (wid === 8) { x = u(1); y = u(1); }
        else { x = u(2); y = u(2); }
        if (rec) rec[type || 'xy'] = [x, y];
        break;
      }
      case 0x41: {                                    // дельта-кодек координат
        const st0 = p;
        let b = data[p++];
        if (b === 0xff) { X = -1; Y = -1; break; }
        if ((b & 0x80) === 0) { Y += b; if (rec) rec[type || 'xy'] = [X, Y]; break; }
        const m = b & 0x60;
        if (m === 0x40) {                             // 12 бит со знаком
          let d = ((b & 0x0f) << 8) | data[p++];
          if (b & 0x08) d -= 0x1000;
          X += d;
        } else if (m === 0x00) { X += b & 0x0f; }
        else if (m === 0x20) { X -= b & 0x0f; }
        else {                                        // 0x60 — перезадать X
          const v = b & 0x0f;
          if (v === 0x0d) { const t = data[p++]; X = baseX + (t > 127 ? t - 256 : t); }
          else if (v === 0x0c) { X = baseX; }
          else if (v === 0x0e) { p = st0 + 4; }
          else { X = (v << 16) | (data[st0 + 1] << 8) | data[st0 + 2]; p = st0 + 3; }
        }
        const fl = b >> 2;                            // хвост задаёт Y
        b = data[p++];
        if ((fl >> 2) & 1) Y = (b << 8) | data[p++];
        else Y += (b > 127 ? b - 256 : b);
        if (rec) rec[type || 'xy'] = [X, Y];
        break;
      }
      case 0x43: p += slot[9] | 0; break;             // пропустить блок известной длины
      case 0x44: {                                    // строка длиной из поля 9
        const n = slot[9] | 0, txt = data.subarray(p, p + n); p += n;
        if (type === 0x5d) codes.set(code, txt);       // ']' — запись словаря
        else if (rec) rec[type] = txt;
        break;
      }
      case 0xa0: case 0xa2: {
        const n = op === 0xa0 ? (slot[1] | 0) : (slot[10] | 0);
        if (n <= 0) { pc = skipTo(pc, 0xa1); continue; }
        loops.push({ back: pc + 1, left: n });
        break;
      }
      case 0xa1: {
        const L = loops[loops.length - 1];
        if (L && --L.left > 0) { pc = L.back; continue; }
        loops.pop();
        break;
      }
      case 0xc0: pc = idxOfWord(tgt); continue;       // переход
      case 0xc1: case 0xc2: calls.push(pc + 1); pc = idxOfWord(tgt); continue;
      default: return fin('неизвестный код 0x' + op.toString(16) + ' в записи ' + pc);
    }

    if (val !== null) {
      if (op >= 0x20 && op <= 0x29) reg = val;        // только чтения из потока
      if (arg) slot[arg] = val;
      if (type === 0x5b) code = (w0 & ADD) ? code + (val & 0xff) : (val & 0xff);
      else if (type && rec) rec[type] = val;
    }
    pc++;
  }
  return fin(steps >= limit ? 'предел шагов' : 'данные кончились');

  function skipTo(from, want) {                        // вперёд до нужного кода
    for (let i = from + 1; first + i * stride < words.length; i++)
      if ((words[first + i * stride] & 0xff) === want) return i;
    return -1;
  }
  function fin(why) {
    if (rec && Object.keys(rec).length) records.push(rec);
    return { why, pos: p, codes, records, slot, field, steps };
  }
}

module.exports = { run };

if (require.main === module) {
  const lit = require('./lit'), S = require('./litschema'), fs = require('fs');
  const file = 'maps/pkgdb/LIT/EJ211Ga_L1.db';
  const pre = Buffer.alloc(8192);
  const fd = fs.openSync(file, 'r'); fs.readSync(fd, pre, 0, 8192, 0); fs.closeSync(fd);
  const schema = S.load(file, pre.indexOf(Buffer.from([0x4c, 0x69, 0x74, 0x02])));
  const L = lit.open(['maps/pkgdb/LIT', 'maps/pkgdb/LIT2', 'maps/pkgdb/LIT3', 'maps/pkgdb/LIT4']);
  const i = Number(process.argv[2] || 0);
  const b = L.block(L.catalog()[i]);
  const r = run(schema, b, 0);
  console.log('блок %d: остановка «%s» на байте %d из %d, шагов %d',
              i, r.why, r.pos, b.length, r.steps);
  console.log('кодов словаря: %d, записей: %d', r.codes.size, r.records.length);
}
