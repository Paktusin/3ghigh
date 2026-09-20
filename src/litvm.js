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

// Маска разрядности (local_34 в FUN_08cd0798). Важно: она сбрасывается в ноль
// на КАЖДОЙ записи, и задаёт её сам код операции. Нулевая маска означает, что
// запись в регистр не меняет ничего.
const MASK = {
  0x10: 0xffffffff,
  0x20: 0xffffffff, 0x21: 0xff, 0x22: 0xffff, 0x23: 0xffffff, 0x24: 0xffffffff,
  0x25: 0xffffffff, 0x26: 0xff, 0x27: 0xffff, 0x28: 0xffffff, 0x29: 0xffffffff,
  0x60: 0xff, 0x61: 0xffff, 0x62: 0xffffffff, 0x63: 0xffff, 0x64: 0xffff,
  0x80: 0xffffffff,
};

function run(schema, data, startRule, opt) {
  const o = opt || {};
  const limit = o.limit || 500000;
  const words = schema.words, stride = schema.stride, first = schema.first;
  const wordAt = (i, k) => words[first + i * stride + k];
  const idxOfWord = (w) => (w - first) / stride;

  // Кадр — область по уровню (уровень лежит в this+156, уровней не больше трёх).
  // iter0/iter2 — счётчики витков циклов 0xa0 и 0xa2, ptr0/ptr2 — сохранённые
  // правила. В прошивке это поля кадра (+58, +56, +52, +48), а не стек.
  //
  // Кадр НЕ постоянен: `FUN_08cd066c` чистит его целиком — регистр, оба
  // счётчика, длину, указатели циклов, а итераторы ставит в -1. Аргумент
  // (+0x10) она намеренно не трогает, его кладут следом за ней. Вызывается она
  // ровно из двух мест `FUN_08cd0798`: при вызове 0xc1/0xc2 — по новому кадру,
  // и при переходе 0x11 по w4 — по текущему. См. reset() ниже.
  const newFrame = () => ({ reg: 0, cnt0: 0, f38: 0, cnt2: 0, len: 0, arg: 0,
                            iter0: -1, iter2: -1, ptr0: 0, ptr2: 0 });
  const F = [newFrame(), newFrame(), newFrame(), newFrame()];
  let lvl = 0, fr = F[0];

  let pc = startRule, p = o.from || 0, code = 0, steps = 0, wid = o.wid || 12;
  let X = 0, Y = 0, baseX = 0, mark = 0, home = -1, lastHome = -1, byGoto = false;
  let curStruct = 0, curRule = -1;                  // какая структура сейчас разбирается
  // Словарь можно передать снаружи: при пересинхронизации внутри буфера он
  // уже набран и заново в данных не встретится.
  const trace = o.trace ? [] : null;
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
  //
  // Кладётся `(short)значение`, то есть с обрезкой до 16 разрядов, но ЧИТАЮТСЯ
  // эти поля без знака: длины в `0x42`, `0x43`, `0x44` берутся через
  // `*(ushort *)`, а пределы циклов в `0xa1` и `0x11` сравниваются через
  // `(int)(uint)`. Пока здесь стояло знаковое расширение, длина 0xffff
  // превращалась в -1 и указатель уезжал НАЗАД по буферу — в блоке 28 он
  // уходил до -3906. Обрезка без знака совпадает с прошивкой во всех местах:
  // сравнение счётчика с нулём от знака не зависит.
  function store(w1, v, w0, mask) {
    const add = (w0 & ADD) !== 0;
    const put = (cur) => ((add ? cur + v : v) & 0xffff);
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
    if (trace) { trace.push([pc, op, p]); if (trace.length > 400) trace.shift(); }
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
        if (type) { curStruct = type; curRule = pc; if (rec) rec['#'] = type; }
        fr.cnt2 = 0;                                  // 0x10 сбрасывает состояние циклов
        fr.iter0 = -1; fr.iter2 = -1; fr.ptr0 = 0; fr.ptr2 = 0;
        if (type) val = type;                         // тип структуры — это и значение
        break;
      // 0xc3 в прошивке не выставляет код возврата, и тот остаётся -5 — это
      // ошибка, а не выход: у FUN_08ccf84c нет обработчика для -5. Значит в
      // исправных данных такой код не встречается, и попадание в него означает
      // потерю синхронизации.
      case 0xc3: return fin('рассинхронизация после 0x' + curStruct.toString(16) + ' (запись ' + curRule + ')');
      case 0x11: {
        // 0x11 — это конец цикла 0xa2: сперва проверяем, остались ли витки.
        // В прошивке это счётчик кадра +56 против предела в кадре +40.
        // 0x11 — это ещё и конец цикла 0xa2: пока витки есть, возврат назад.
        if (fr.iter2 >= 0 && fr.ptr2 !== 0 && fr.cnt2 > fr.iter2 + 1) {
          fr.iter2 += 1; pc = fr.ptr2 + 1; continue;
        }
        fr.iter2 = -1;
        // Порядок важен: прошивка смотрит w4 РАНЬШЕ уровня. Непустой w4 —
        // это переход, а не возврат из подпрограммы, и он идёт по цели даже
        // изнутри вызова. Перед переходом кадр чистится целиком (тот же
        // FUN_08cd066c, что и при вызове), поэтому регистр и состояние циклов
        // не перетекают из записи в запись.
        if (tgt) { reset(fr); byGoto = false; home = idxOfWord(tgt); pc = home; continue; }
        if (calls.length) { pc = calls.pop(); if (lvl > 0) fr = F[--lvl]; continue; }
        // Под-грамматики вызываются переходом 0xc0, а не вызовом, поэтому
        // Без цели и на нулевом уровне прошивка возвращает -4, а итератор на
        // нём останавливается (уровень < 1 и код < -1). Значит это конец
        // разбора, а не возврат к началу цикла записей.
        return fin('конец (0x11 без цели)');
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
      case 0x63: val = fr.iter2; break;                // номер витка цикла 0xa2
      case 0x64: val = fr.iter0; break;                // номер витка цикла 0xa0
      case 0x65:                                      // следующий элемент: данные не читает
        if (rec && Object.keys(rec).length) { records.push(rec); rec = {}; }
        break;
      case 0x80: val = ((tgt << 16) | k) >>> 0; break;
      case 0x81: val = (fr.reg >>> tgt) & (k < 32 ? (1 << k) - 1 : 0xffffffff); break;
      // Координата кладётся в поле СВОЕГО типа, как и числа. Раньше все пары
      // писались в один ключ 'xy' и затирали друг друга: у структуры 0x22 семь
      // координатных полей, и выживало только последнее — узел дерева выглядел
      // пустым. Ключ 'xy' сохранён как «последняя прочитанная пара».
      case 0x40: {                                    // упакованная пара координат
        let x, y;
        if (wid === 12) { const a = u(1), b = u(1), c = u(1); x = a + (c & 0x0f) * 256; y = b + (c >> 4) * 256; }
        else if (wid === 8) { x = u(1); y = u(1); }
        else if (wid === 16) { x = u(2); y = u(2); }
        else if (wid === 24) { x = u(3); y = u(3); }
        else { x = 0; y = 0; }                        // прочие ширины байт не читают
        if (rec) { rec['xy'] = [x, y]; if (type) rec[type] = [x, y]; }
        break;
      }
      case 0x41: {                                    // дельта-кодек координат
        const st0 = p;
        let b = data[p++];
        if (b === 0xff) { X = -1; Y = -1; break; }
        if ((b & 0x80) === 0) { Y += b; if (rec) { rec['xy'] = [X, Y]; if (type) rec[type] = [X, Y]; } break; }
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
        if (rec) { rec['xy'] = [X, Y]; if (type) rec[type] = [X, Y]; }
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
          strings.push({ type, at, txt, pre: fr.reg >>> 21 & 7, st: curStruct, sr: curRule, rule: pc });
          if (rec) { rec[type] = txt; rec['@'] = at; }
        }
        break;
      }
      case 0xa0: case 0xa2: {
        const n = op === 0xa0 ? fr.cnt0 : fr.cnt2;
        if (n === 0) {
          // Для 0xa0 прошивка ищет саму 0xa1 и продолжает после неё.
          // Для 0xa2 она проверяет СЛЕДУЮЩЕЕ правило (puVar23[stride]):
          // останавливается перед 0x11, чтобы исполнить её переход/возврат.
          const t = skipTo(pc, op === 0xa0 ? 0xa1 : 0x11);
          if (t < 0) return fin('цикл без конца');
          pc = op === 0xa2 ? t : t + 1; continue;
        }
        if (op === 0xa0) { if (fr.iter0 >= 0) return fin('повторный вход в цикл 0xa0');
                           fr.iter0 = 0; fr.ptr0 = pc; }
        else             { if (fr.iter2 >= 0) return fin('повторный вход в цикл 0xa2');
                           fr.iter2 = 0; fr.ptr2 = pc; }
        break;
      }
      case 0xa1: {
        if (fr.cnt0 === 0 || fr.iter0 < 0 || fr.ptr0 === 0) return fin('цикл 0xa0 без начала');
        fr.iter0 += 1;
        if (fr.cnt0 <= fr.iter0) { fr.iter0 = -1; break; }   // выход: дальше за 0xa1
        pc = fr.ptr0 + 1; continue;                          // виток: за 0xa0
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
        reset(fr);                                    // FUN_08cd066c чистит кадр вызываемого
        fr.arg = a;                                   // и только потом кладут аргумент
        pc = idxOfWord(tgt); continue;
      }
      default: return fin('неизвестный код 0x' + op.toString(16) + ' в записи ' + pc);
    }

    if (p > data.length) return fin('чтение за концом блока');
    if (val !== null) {
      // у 0x81 маска своя: (1 << w5) - 1, если w5 меньше 32
      const mask = op === 0x81 ? (k < 32 ? ((1 << k) - 1) >>> 0 : 0xffffffff)
                               : (MASK[op] !== undefined ? MASK[op] : 0);
      store(w1, val, w0, mask);
      if (type === 0x5b) code = (w0 & ADD) ? (code + (val & 0xff)) & 0xffff : (val & 0xff);
      else if (type && rec) rec[type] = val;
    }
    if (w0 & REWIND) p = p0;                          // бит 13 — прочитать, не съедая
    pc++;
  }
  return fin(steps >= limit ? 'предел шагов' : 'данные кончились');

  // FUN_08cd066c. Поля кадра относительно его начала (слово уровень*8+7):
  // +0 указатель схемы, +4 регистр, +8 cnt0, +10 f38, +12 cnt2, +14 len,
  // +16 аргумент (НЕ трогается), +20 ptr2, +24 ptr0, +28 iter2, +30 iter0.
  function reset(f) {
    f.reg = 0; f.cnt0 = 0; f.f38 = 0; f.cnt2 = 0; f.len = 0;
    f.ptr0 = 0; f.ptr2 = 0; f.iter0 = -1; f.iter2 = -1;
  }

  function skipTo(from, want) {
    for (let i = from + 1; first + i * stride < words.length; i++)
      if ((words[first + i * stride] & 0xff) === want) return i;
    return -1;
  }
  function fin(why) {
    if (rec && Object.keys(rec).length) records.push(rec);
    return { why, pos: p, codes, records, strings, steps, trace };
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
