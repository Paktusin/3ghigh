// Машина, исполняющая грамматику LIT из блока TTD.
//
// Грамматика — таблица записей по 10 слов (src/litschema.js). Числовые коды
// читают значения из потока, управляющие ходят по самой таблице. Семантика
// выведена из FUN_08cd0798 (чтение записи и раскладка по полям) и
// FUN_08ccf84c (раскладка по типам).
//
// Ключ ко всему — switch(puVar23[1]) в хвосте FUN_08cd0798: слово w1 записи
// схемы задаёт, КУДА положить прочитанное значение. Отсюда и счётчики циклов,
// и длина строки, и регистр, по которому проверяются условия:
//
//   w1 = 0   никуда (значение только уходит в поле по типу)
//   w1 = 1   счётчик цикла 0xa0            (кадр +36, short)
//   w1 = 2   кадр +38, short
//   w1 = 3   ширина координат для 0x40     (поле схемы)
//   w1 = 4   регистр кадра, байт 0         (кадр +32, uint)
//   w1 = 5   тот же регистр, сдвиг 8
//   w1 = 6   тот же регистр, сдвиг 16
//   w1 = 7   тот же регистр, сдвиг 24
//   w1 = 8   счётчик цикла 0xa2            (кадр +40, short)
//   w1 = 9   длина строки для 0x44 и 0x43  (кадр +42, short)
//
// Бит 12 флагов у любого из них означает «прибавить» вместо «задать».
// Условия и код 0x81 смотрят на регистр (w1 = 4..7), а не на «последнее
// значение вообще»: пока это было не так, словарь набирал 67 кодов из 212.
'use strict';

const SKIP = 0x8000, REWIND = 0x2000, ADD = 0x1000, COND = 0x0800, INV = 0x0400;

// Естественная маска разрядности чтения — из FUN_08cd0798 (local_34).
const MASK = {
  0x20: 0xffffffff, 0x21: 0xff, 0x22: 0xffff, 0x23: 0xffffff, 0x24: 0xffffffff,
  0x25: 0xffffffff, 0x26: 0xff, 0x27: 0xffff, 0x28: 0xffffff, 0x29: 0xffffffff,
};

function run(schema, data, startRule, opt) {
  const o = opt || {};
  const limit = o.limit || 500000;
  const words = schema.words, stride = schema.stride, first = schema.first;
  const wordAt = (i, k) => words[first + i * stride + k];
  const idxOfWord = (w) => (w - first) / stride;

  // Кадры постоянны: в прошивке это четыре области по уровню (this+156), и
  // вызов НЕ обнуляет их — он только кладёт аргумент. Уровней не больше трёх.
  const newFrame = () => ({ reg: 0, cnt0: 0, f38: 0, cnt2: 0, len: 0, arg: 0 });
  const F = [newFrame(), newFrame(), newFrame(), newFrame()];
  let lvl = 0, fr = F[0];

  let pc = startRule, p = o.from || 0, code = 0, steps = 0, wid = 12;
  let X = 0, Y = 0, baseX = 0, mark = 0, home = -1, lastHome = -1, byGoto = false;
  // Словарь можно передать снаружи: при пересинхронизации внутри буфера он
  // уже набран и заново в данных не встретится.
  const codes = o.codes || new Map();
  const loops = [], calls = [], records = [];
  // Строки собираются ещё и отдельным потоком: внутри одной структуры бывает
  // цикл, и второе имя затирало бы первое в rec[тип].
  const strings = [];
  let rec = null;

  const u = (n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + data[p++]; return v; };
  const s = (n) => { const v = u(n), top = Math.pow(2, n * 8); return v >= top / 2 ? v - top : v; };
  const varint = (signed) => {
    const b = data[p];
    if (b === 252) { p++; return signed ? s(2) : u(2); }
    if (b === 253) { p++; return signed ? s(3) : u(3); }
    if (b === 254) { p++; return signed ? s(4) : u(4); }
    p++; return signed && b > 127 ? b - 256 : b;
  };

  // Положить значение в поле кадра — это и есть switch(w1) из прошивки.
  function store(w1, v, w0, mask) {
    const add = (w0 & ADD) !== 0;
    const put = (cur) => ((add ? cur + v : v) << 16) >> 16;
    switch (w1) {
      case 1: fr.cnt0 = put(fr.cnt0); return;
      case 2: fr.f38 = put(fr.f38); return;
      case 3: wid = add ? wid + v : v; return;
      case 4: case 5: case 6: case 7: {
        const sh = (w1 - 4) * 8, m = (mask << sh) >>> 0;
        const cur = fr.reg;
        fr.reg = add ? (((cur & ~m) | ((cur + ((v << sh) >>> 0)) & m)) >>> 0)
                     : (((cur & ~m) | (((v << sh) >>> 0) & m)) >>> 0);
        return;
      }
      case 8: fr.cnt2 = put(fr.cnt2); return;
      case 9: fr.len = put(fr.len); return;
      default: return;
    }
  }

  while (p < data.length && steps++ < limit) {
    if (pc < 0 || first + pc * stride + stride > words.length) return fin('схема кончилась');
    const w0 = wordAt(pc, 0), op = w0 & 0xff;
    const w1 = wordAt(pc, 1), type = wordAt(pc, 2);
    const tgt = wordAt(pc, 4), k = wordAt(pc, 5);

    if (w0 & SKIP) { pc++; continue; }
    if (w0 & COND) {
      let hit = ((fr.reg & wordAt(pc, 7)) === wordAt(pc, 9)) &&
                (((fr.reg >>> 16) & wordAt(pc, 6)) === wordAt(pc, 8));
      if (w0 & INV) hit = !hit;
      if (!hit) { pc++; continue; }
    }

    const p0 = p;                                     // для бита 13 — «подсмотреть»
    let val = null;
    switch (op) {
      case 0x10:
        if (rec && Object.keys(rec).length) records.push(rec);
        rec = {}; mark = p;
        // Придя сюда переходом 0xc0, прошивка пропускает подряд идущие записи
        // со взведённым битом 14 — это продолжения предыдущей ветки.
        if (byGoto) {
          while (first + (pc + 1) * stride < words.length &&
                 (words[first + (pc + 1) * stride] & 0x4000)) pc++;
          byGoto = false;
        }
        fr.cnt2 = 0;                                  // 0x10 сбрасывает счётчики кадра
        while (loops.length && loops[loops.length - 1].op === 0xa2) loops.pop();
        if (type) val = type;                         // тип структуры — это и значение
        break;
      case 0xc3:                                      // выход из под-грамматики
      case 0x11: {
        // 0x11 — это конец цикла 0xa2: сперва проверяем, остались ли витки.
        // В прошивке это счётчик кадра +56 против предела в кадре +40.
        const Lp = loops[loops.length - 1];
        if (Lp && Lp.op === 0xa2) {
          Lp.done++;
          if (--Lp.left > 0) { pc = Lp.back; continue; }
          loops.pop();
        }
        if (calls.length) { pc = calls.pop(); if (lvl > 0) fr = F[--lvl]; continue; }
        // Переход по w4 ведёт к началу цикла записей — запоминаем его как дом.
        if (tgt) { home = idxOfWord(tgt); pc = home; continue; }
        // Под-грамматики вызываются переходом 0xc0, а не вызовом, поэтому
        // возвращаться некуда: конец записи — это возврат к началу цикла.
        // Виток цикла записей обязан съедать байты — иначе разбор крутится
        // вхолостую и плодит пустые записи.
        if (home >= 0 && p < data.length && p > lastHome) { lastHome = p; pc = home; continue; }
        return fin(home >= 0 && p <= lastHome ? 'виток без продвижения' : 'конец');
      }
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
      case 0x60: val = fr.arg & 0xff; break;          // читают аргумент вызова
      case 0x61: val = fr.arg & 0xffff; break;
      case 0x62: val = fr.arg; break;
      case 0x63: val = loops.length ? loops[loops.length - 1].done : 0; break;  // номер витка
      case 0x64: val = loops.length ? loops[loops.length - 1].done : 0; break;
      case 0x65:                                      // следующий элемент: данные не читает
        if (rec && Object.keys(rec).length) { records.push(rec); rec = {}; }
        break;
      case 0x80: val = ((tgt << 16) | k) >>> 0; break;
      case 0x81: val = (fr.reg >>> tgt) & (k < 32 ? (1 << k) - 1 : 0xffffffff); break;
      case 0x40: {                                    // упакованная пара координат
        let x, y;
        if (wid === 12) { const a = u(1), b = u(1), c = u(1); x = a + (c & 0x0f) * 256; y = b + (c >> 4) * 256; }
        else if (wid === 8) { x = u(1); y = u(1); }
        else if (wid === 16) { x = u(2); y = u(2); }
        else if (wid === 24) { x = u(3); y = u(3); }
        else { x = 0; y = 0; }                        // прочие ширины байт не читают
        if (rec) rec['xy'] = [x, y];
        break;
      }
      case 0x41: {                                    // дельта-кодек координат
        const st0 = p;
        let b = data[p++];
        if (b === 0xff) { X = -1; Y = -1; break; }
        if ((b & 0x80) === 0) { Y += b; if (rec) rec['xy'] = [X, Y]; break; }
        const m = b & 0x60;
        if (m === 0x40) { let d = ((b & 0x0f) << 8) | data[p++]; if (b & 0x08) d -= 0x1000; X += d; }
        else if (m === 0x00) X += b & 0x0f;
        else if (m === 0x20) X -= b & 0x0f;
        else {
          const v = b & 0x0f;
          if (v === 0x0d) { const t = data[p++]; X = baseX + (t > 127 ? t - 256 : t); }
          else if (v === 0x0c) X = baseX;
          else if (v === 0x0e) p = st0 + 4;
          else { X = (v << 16) | (data[st0 + 1] << 8) | data[st0 + 2]; p = st0 + 3; }
        }
        const fl = b >> 2;
        b = data[p++];
        if ((fl >> 2) & 1) Y = (b << 8) | data[p++];
        else Y += (b > 127 ? b - 256 : b);
        if (rec) rec['xy'] = [X, Y];
        break;
      }
      case 0x42: {                                    // блок длиной из поля 2
        const n = fr.f38, txt = data.subarray(p, p + n); p += n;
        if (rec && type) rec[type] = txt;
        break;
      }
      case 0x43: p += fr.len; break;
      case 0x44: {
        const n = fr.len, at = p, txt = data.subarray(p, p + n); p += n;
        if (type === 0x5d) codes.set(code, txt);
        else {
          strings.push({ type, at, txt, pre: fr.reg >>> 21 & 7 });
          if (rec) { rec[type] = txt; rec['@'] = at; }
        }
        break;
      }
      case 0xa0: case 0xa2: {
        const n = op === 0xa0 ? fr.cnt0 : fr.cnt2;
        if (n <= 0) {
          const t = skipTo(pc, op === 0xa0 ? 0xa1 : 0x11);
          if (t < 0) return fin('цикл без конца');
          pc = t; continue;
        }
        loops.push({ back: pc + 1, left: n, op, done: 0 });
        break;
      }
      case 0xa1: {
        const L = loops[loops.length - 1];
        if (L) L.done++;
        if (L && --L.left > 0) { pc = L.back; continue; }
        loops.pop();
        break;
      }
      case 0xc0: byGoto = true; pc = idxOfWord(tgt); continue;
      case 0xc1: case 0xc2: {
        if (lvl >= 3) break;                          // глубже трёх прошивка просто не вызывает
        // У 0xc2 аргумент — поле регистра: сдвиг вправо на (w5 >> 8),
        // ширина (w5 & 0x1f). У 0xc1 аргумент равен самому w5.
        const a = op === 0xc2
          ? ((fr.reg >>> ((k >> 8) & 0x1f)) & ((1 << (k & 0x1f)) - 1)) >>> 0
          : k;
        calls.push(pc + 1);
        fr = F[++lvl];
        fr.arg = a;                                   // остальные поля кадра сохраняются
        pc = idxOfWord(tgt); continue;
      }
      default: return fin('неизвестный код 0x' + op.toString(16) + ' в записи ' + pc);
    }

    if (p > data.length) return fin('чтение за концом блока');
    if (val !== null) {
      store(w1, val, w0, MASK[op] !== undefined ? MASK[op] : 0xffffffff);
      if (type === 0x5b) code = (w0 & ADD) ? (code + (val & 0xff)) & 0xffff : (val & 0xff);
      else if (type && rec) rec[type] = val;
    }
    if (w0 & REWIND) p = p0;                          // бит 13 — прочитать, не съедая
    pc++;
  }
  return fin(steps >= limit ? 'предел шагов' : 'данные кончились');

  function skipTo(from, want) {
    for (let i = from + 1; first + i * stride < words.length; i++)
      if ((words[first + i * stride] & 0xff) === want) return i;
    return -1;
  }
  function fin(why) {
    if (rec && Object.keys(rec).length) records.push(rec);
    return { why, pos: p, codes, records, strings, steps };
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
  console.log('блок %d: «%s» на байте %d из %d (%d%%), шагов %d',
              i, r.why, r.pos, b.length, Math.round(100 * r.pos / b.length), r.steps);
  console.log('кодов словаря: %d, записей: %d', r.codes.size, r.records.length);
}
