// Дизассемблер грамматики LIT. Схема лежит в блоке TTD (слово +56 заголовка
// Lit\x02) массивом 16-разрядных слов big-endian: заголовок 10 слов, дальше
// записи по 10 слов. Коды операций выведены из FUN_08cd0798.
'use strict';
const fs = require('fs');
const path = require('path');

// Коды операций. Числовые читают значение из потока данных, управляющие ходят
// по самой схеме.
const OPS = {
  0x10: ['СТРУКТУРА', 'начало структуры'],
  0x11: ['КОНЕЦ', 'конец структуры или возврат'],
  0x20: ['ЧИСЛО', 'знаковое переменной длины'],
  0x21: ['ЧИСЛО', 'знаковый байт'],
  0x22: ['ЧИСЛО', 'знаковые 2 байта'],
  0x23: ['ЧИСЛО', 'знаковые 3 байта'],
  0x24: ['ЧИСЛО', 'знаковые 4 байта'],
  0x25: ['ЧИСЛО', 'беззнаковое переменной длины'],
  0x26: ['ЧИСЛО', 'байт'],
  0x27: ['ЧИСЛО', '2 байта'],
  0x28: ['ЧИСЛО', '3 байта'],
  0x29: ['ЧИСЛО', '4 байта'],
  0x40: ['КООРД', 'упакованная пара'],
  0x41: ['КООРД', 'дельта-кодек'],
  0x43: ['ПРОПУСК', 'пропустить блок известной длины'],
  0x44: ['СТРОКА', 'текст записи'],
  0x60: ['ОП60', ''],
  0x62: ['ОП62', ''],
  0x64: ['ОП64', ''],
  0x65: ['ОП65', ''],
  0x80: ['КОНСТ', 'значение из слов 4 и 5'],
  0xa0: ['ЦИКЛ', 'начало'],
  0xa1: ['ЦИКЛ', 'шаг'],
  0xa2: ['ЦИКЛ', 'конец'],
  0xc0: ['ПЕРЕХОД', 'на слово w4'],
  0xc1: ['ВЫЗОВ', 'на слово w4'],
  0xc2: ['ВЫЗОВ', 'на слово w4, с аргументом из поля'],
  0xc3: ['ОПC3', ''],
};

function load(file, headerAt) {
  const fd = fs.openSync(file, 'r');
  const h = Buffer.alloc(16);
  fs.readSync(fd, h, 0, 16, headerAt + 368);         // подзаголовок TTD
  if (h.toString('latin1', 0, 4) !== 'TTD\0') throw new Error('не TTD');
  const off = h.readUInt32BE(8), size = h.readUInt32BE(12);
  const b = Buffer.alloc(size);
  fs.readSync(fd, b, 0, size, headerAt + off);
  fs.closeSync(fd);
  const w = new Array(size >> 1);
  for (let i = 0; i < w.length; i++) w[i] = b.readUInt16BE(i * 2);
  return { off, size, words: w, stride: 10, first: 10 };
}

function rule(s, i) {                                 // i — номер записи
  const p = s.first + i * s.stride;
  const w = s.words.slice(p, p + s.stride);
  return {
    at: p, words: w,
    op: w[0] & 0xff, flags: w[0] >> 8,
    skip: (w[0] & 0x8000) !== 0,
    cond: (w[0] & 0x0800) !== 0,
    inv:  (w[0] & 0x0400) !== 0,
    arg: w[1], type: w[2], target: w[4], k: w[5],
    maskHi: w[6], maskLo: w[7], valHi: w[8], valLo: w[9],
  };
}

function count(s) { return Math.floor((s.words.length - s.first) / s.stride); }

function text(r) {
  const [nm, note] = OPS[r.op] || ['?' + r.op.toString(16), 'неизвестен'];
  const bits = [];
  if (r.skip) bits.push('пропуск');
  if (r.cond) bits.push('если (знач & 0x' + r.maskLo.toString(16) + ') == 0x' + r.valLo.toString(16) +
                        (r.inv ? ', наоборот' : ''));
  let s = nm.padEnd(9) + note.padEnd(30);
  if (r.type) s += " тип 0x" + r.type.toString(16) +
                   (r.type >= 32 && r.type < 127 ? " '" + String.fromCharCode(r.type) + "'" : '');
  if (r.target) s += '  -> слово ' + r.target;
  if (r.arg) s += '  арг ' + r.arg;
  if (bits.length) s += '   [' + bits.join('; ') + ']';
  return s;
}

module.exports = { load, rule, count, text, OPS };

if (require.main === module) {
  const dir = process.argv[2] || 'maps/pkgdb/LIT';
  const from = Number(process.argv[3] || 0), n = Number(process.argv[4] || 40);
  const file = path.join(dir, fs.readdirSync(dir).find((x) => /\.(db|PIT)$/i.test(x)));
  const pre = Buffer.alloc(8192);
  const fd = fs.openSync(file, 'r'); fs.readSync(fd, pre, 0, 8192, 0); fs.closeSync(fd);
  const at = pre.indexOf(Buffer.from([0x4c, 0x69, 0x74, 0x02]));
  const s = load(file, at);
  console.log('схема TTD @%d, %d байт = %d слов, %d записей',
              s.off, s.size, s.words.length, count(s));
  for (let i = from; i < Math.min(from + n, count(s)); i++) {
    const r = rule(s, i);
    console.log(String(i).padStart(4) + ' сл.' + String(r.at).padStart(5) + '  ' + text(r));
  }
}
