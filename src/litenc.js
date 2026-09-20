// Обратный проход для LIT: собрать байты обратно из прочитанного и сверить.
//
// Смысл тот же, что у `xacenc.js` для XAC и `encodePoints` для GDB: пока мы не
// умеем воспроизвести исходные байты, «прочитали» — это ещё не «понимаем».
// Сходимость по длине (245 518 блоков из 245 518) говорит лишь, что мы знаем
// ДЛИНУ каждого поля; здесь проверяется, что мы знаем и СОДЕРЖИМОЕ.
//
//   node src/litenc.js [сколько блоков] [--from N] [--pit]
//
// Машина зовёт `o.tap` на каждом коде, который съел байты, и отдаёт значения
// вместе с состоянием дельта-кодека до шага. Кодировщик строит байты заново
// только из значений и сравнивает с оригиналом.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lit');
const S = require('./litschema');
const V = require('./litvm');

// --- числа -----------------------------------------------------------------

function encFixed(val, n) {
  const b = Buffer.alloc(n);
  let v = val >>> 0;
  for (let i = n - 1; i >= 0; i--) { b[i] = v & 0xff; v = Math.floor(v / 256); }
  return b;
}

// Беззнаковое переменной длины. Escape-байты 252/253/254 прочитаны из
// литерального пула (DAT_08cd0c1c = 253, DAT_08cd0c1e = 254). Каноническая
// форма — самая короткая; так ли кодировал оригинал, и проверяем.
function encVarint(v) {
  if (v < 252) return Buffer.from([v]);
  if (v <= 0xffff) return Buffer.concat([Buffer.from([252]), encFixed(v, 2)]);
  if (v <= 0xffffff) return Buffer.concat([Buffer.from([253]), encFixed(v, 3)]);
  return Buffer.concat([Buffer.from([254]), encFixed(v, 4)]);
}

// --- упакованная пара 0x40 --------------------------------------------------

function encPair(x, y, wid) {
  if (wid === 12) return Buffer.from([x & 0xff, y & 0xff,
                                      ((x >> 8) & 0x0f) | (((y >> 8) & 0x0f) << 4)]);
  if (wid === 8)  return Buffer.from([x & 0xff, y & 0xff]);
  if (wid === 16) return Buffer.concat([encFixed(x, 2), encFixed(y, 2)]);
  if (wid === 24) return Buffer.concat([encFixed(x, 3), encFixed(y, 3)]);
  return null;                                    // прочие ширины байт не читают
}

// --- дельта-кодек 0x41 ------------------------------------------------------
//
// Первый байт при взведённом старшем бите: бит 7 = 1, биты 6-5 — режим X,
// бит 4 — форма Y, биты 3-0 — полезная нагрузка или подрежим.
// Режимов X восемь, и диапазоны у них перекрываются: дельту 5 можно записать
// полубайтом, двенадцатью битами и абсолютно. Кодировщик выбирает самую
// короткую форму — совпадёт ли выбор с оригиналом, и есть главный вопрос.

const MODES = ['ff', 'Y+', 'X0', 'X+', 'X-', 'X12', 'Xбаза', 'Xбаза+', 'Xабс'];

// Правило выбора выведено из расхождений первого прогона, не угадано:
//
//  * «самая короткая форма» — НЕ правило. При dX = -16 оригинал пишет X12
//    (`dff0`), хотя X = база дала бы один байт (`fc`).
//  * относительные формы предпочитаются базовым, пока дельта влезает в 12 бит;
//    базовые и абсолютная идут только когда не влезает;
//  * «X без изменения» пишется как X- с нулевой нагрузкой (`a0`), а не как
//    X+ с нулевой (`80`): это 19 349 расхождений из 21 360 в первом прогоне;
//  * после сброса `0xff` (px = py = -1) относительные формы не используются
//    вовсе — ни по X, ни по Y: -1 это метка, а не координата. А вот сам переход
//    В метку (x = -1 при обычном px) пишется относительной формой как всегда:
//    попытка загнать его в базовую дала 582 расхождения против одного;
//  * первое чтение дельты в блоке ведёт себя как «после сброса»: состояние
//    кодека ещё не задано, и пишется базовая либо абсолютная форма;
//  * граница формы Y — не -128..127, а ровно **-126..126**. Замер: 29 681
//    относительная запись, все внутри -126..126; при dY = ±127 и дальше форма
//    всегда абсолютная, без единого исключения;
//  * а вот «при абсолютном X и Y абсолютный» — гипотеза ОТВЕРГНУТА: навязывание
//    дало 6833 расхождения, у `Xабс` форма Y выбирается как у всех прочих.
//    Однобайтовая форма Y+ берёт беззнаковое 0..127, а знаковый байт -126..126:
//    это разные кодировки, и границы у них разные.
function encDelta(t) {
  const x = t.x, y = t.y, px = t.px, py = t.py, base = t.base;
  if (x === -1 && y === -1) return { buf: Buffer.from([0xff]), mode: 'ff' };
  // Относительных форм нет только сразу ПОСЛЕ сброса: там px = py = -1, и это
  // метка, а не координата. Сам переход В метку (x = -1) пишется как обычно,
  // относительной формой — проверено, 582 случая против одного базового.
  // Первое чтение дельты в блоке — состояние кодека ещё не задано, и оригинал
  // пишет базовую или абсолютную форму, как и после сброса.
  const reset = (px === -1 && py === -1) || t.first;
  const dX = x - px, dY = y - py;

  // Однобайтовая форма: X не меняется, Y прибавляется без знака 0..127.
  if (!reset && dX === 0 && dY >= 0 && dY <= 127)
    return { buf: Buffer.from([dY]), mode: 'Y+' };

  // Режим X — сперва относительные, базовые и абсолютный только если не влезло.
  let head = null, extra = null, mode = null;
  if (!reset && dX === 0)                   { head = 0xa0; mode = 'X-'; }
  else if (!reset && dX >= 1 && dX <= 15)   { head = 0x80 | dX;    mode = 'X+'; }
  else if (!reset && dX <= -1 && dX >= -15) { head = 0xa0 | (-dX); mode = 'X-'; }
  else if (!reset && dX >= -2048 && dX <= 2047) {
    const d = dX & 0xfff;
    head = 0xc0 | (d >> 8); extra = Buffer.from([d & 0xff]);        mode = 'X12';
  } else if (x === base)                    { head = 0xe0 | 0x0c;  mode = 'Xбаза'; }
  // «База + смещение» не используется только на САМОМ ПЕРВОМ чтении блока:
  // базы там ещё нет, и оригинал пишет абсолют, даже когда он на байт длиннее
  // (все 16 расхождений PIT). А после сброса 0xff база работает как обычно —
  // запрет на неё и там дал 142 расхождения против одного.
  else if (!t.first && x - base >= -128 && x - base <= 127) {
    head = 0xe0 | 0x0d; extra = Buffer.from([(x - base) & 0xff]);   mode = 'Xбаза+';
  } else if (x >= 0 && x <= 0xfffff && ![0x0c, 0x0d, 0x0e].includes(x >>> 16)) {
    head = 0xe0 | (x >>> 16);
    extra = Buffer.from([(x >> 8) & 0xff, x & 0xff]);               mode = 'Xабс';
  } else return null;

  // Часть Y: короткая со знаком либо двухбайтовая абсолютная (бит 4).
  const yRel = !reset && dY >= -126 && dY <= 126;
  if (!yRel && (y < 0 || y > 0xffff)) return null;
  const yBuf = yRel ? Buffer.from([dY & 0xff]) : Buffer.from([(y >> 8) & 0xff, y & 0xff]);
  if (!yRel) head |= 0x10;

  return { buf: Buffer.concat([Buffer.from([head]), extra || Buffer.alloc(0), yBuf]),
           mode: mode };
}

// Какой режим стоит в исходных байтах — чтобы видеть, с чем разошлись.
function modeOf(b) {
  if (b === 0xff) return 'ff';
  if ((b & 0x80) === 0) return 'Y+';
  const m = b & 0x60;
  if (m === 0x40) return 'X12';
  if (m === 0x00) return (b & 0x0f) === 0 ? 'X0' : 'X+';
  if (m === 0x20) return 'X-';
  const v = b & 0x0f;
  if (v === 0x0c) return 'Xбаза';
  if (v === 0x0d) return 'Xбаза+';
  if (v === 0x0e) return 'X=(4б)';
  return 'Xабс';
}

// --- сверка одного шага -----------------------------------------------------

// Строки и блобы (0x42, 0x43, 0x44) переносятся как есть: их содержимое — это
// и есть полезная нагрузка, восстанавливать из значений нечего. Они считаются
// отдельно и в доказательство не идут.
const BLOB = new Set([0x42, 0x43, 0x44]);
const FIXED = { 0x21: 1, 0x22: 2, 0x23: 3, 0x24: 4, 0x26: 1, 0x27: 2, 0x28: 3, 0x29: 4 };

function encodeStep(t) {
  if (BLOB.has(t.op)) return { skip: 'блоб' };
  if (FIXED[t.op] !== undefined) return { buf: encFixed(t.val, FIXED[t.op]) };
  if (t.op === 0x25) return { buf: encVarint(t.val) };
  if (t.op === 0x20) return { skip: 'знаковый varint (в схеме LIT не встречается)' };
  if (t.op === 0x40) {
    const b = encPair(t.pair[0], t.pair[1], t.wid);
    return b ? { buf: b } : { skip: 'ширина ' + t.wid };
  }
  if (t.op === 0x41) {
    const r = encDelta(t);
    return r ? { buf: r.buf, mode: r.mode } : { skip: 'дельта вне форм' };
  }
  return { skip: 'код 0x' + t.op.toString(16) };
}

function roundBlock(schema, block, opt) {
  const st = opt.stats;
  let firstDelta = true;
  const r = V.run(schema, block, 0, Object.assign({ limit: 4000000, tap: (t) => {
    if (t.op === 0x41) { t.first = firstDelta; firstDelta = false; }
    const orig = block.subarray(t.at, t.end);
    const e = encodeStep(t);
    const key = '0x' + t.op.toString(16);
    const s = st.byOp[key] = st.byOp[key] || { всего: 0, сошлось: 0, байт: 0, перенесено: 0 };
    s.всего++; s.байт += orig.length;
    if (e.skip) { s.перенесено += orig.length; st.перенесеноБайт += orig.length; return; }
    st.сверяноБайт += orig.length;
    if (e.buf.equals(orig)) { s.сошлось++; st.сошлосьБайт += orig.length;
      if (e.mode) st.режимСошёлся[e.mode] = (st.режимСошёлся[e.mode] || 0) + 1;
      return; }
    st.разошлось++;
    if (t.op === 0x41) {
      const был = modeOf(orig[0]), стал = e.mode;
      const k = был + ' -> ' + стал;
      st.режимРазошёлся[k] = (st.режимРазошёлся[k] || 0) + 1;
      if (st.примеры.length < 12)
        st.примеры.push({ правило: t.rule, было: orig.toString('hex'), стало: e.buf.toString('hex'),
                          px: t.px, py: t.py, x: t.x, y: t.y, база: t.base });
    } else {
      const k = '0x' + t.op.toString(16);
      st.разошлисьКоды[k] = (st.разошлисьКоды[k] || 0) + 1;
      if (st.примерыЧисел.length < 10)
        st.примерыЧисел.push({ код: k, правило: t.rule, знач: t.val,
                               было: orig.toString('hex'), стало: e.buf.toString('hex') });
    }
  } }, opt.run || {}));
  return r;
}

// Полная пересборка блока: пройти его машиной и склеить байты заново — числа
// и координаты из значений, строки и блобы переносом. Если результат совпал с
// оригиналом побайтово и по длине, блок воспроизводится целиком.
//
// Куски обязаны стыковаться без дыр и нахлёстов: любая дыра значит, что байты
// съел код, которого мы не заметили, а нахлёст — что код читал с возвратом
// (бит 13). И то и другое считается отдельно и провалом сборки.
function rebuildBlock(schema, block, runOpt) {
  const parts = [];
  let cur = 0, holes = 0, overlaps = 0, skipped = 0, failed = 0;
  let firstDelta = true;
  const r = V.run(schema, block, 0, Object.assign({ limit: 4000000, tap: (t) => {
    if (t.op === 0x41) { t.first = firstDelta; firstDelta = false; }
    if (t.at > cur) { holes += t.at - cur; parts.push(block.subarray(cur, t.at)); }
    if (t.at < cur) { overlaps += cur - t.at; return; }        // чтение с возвратом
    const orig = block.subarray(t.at, t.end);
    const e = encodeStep(t);
    if (e.skip) { skipped += orig.length; parts.push(orig); }
    else if (e.buf.equals(orig)) parts.push(e.buf);
    else { failed += orig.length; parts.push(orig); }
    cur = t.end;
  } }, runOpt || {}));
  if (cur < block.length) { holes += block.length - cur; parts.push(block.subarray(cur)); }
  const out = Buffer.concat(parts);
  // Честно: блок засчитывается только если он и сошёлся побайтово, И при этом
  // ни один кусок не пришлось подставить из оригинала. Строки и блобы (skipped)
  // переносятся по определению и в failed не идут.
  return { ok: out.length === block.length && out.equals(block) && failed === 0,
           len: out.length, holes: holes, overlaps: overlaps,
           skipped: skipped, failed: failed, why: r.why, pos: r.pos };
}

module.exports = { encFixed, encVarint, encPair, encDelta, modeOf, roundBlock, rebuildBlock };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const pit = argv.includes('--pit');
  const fromArg = argv.indexOf('--from');
  const from = fromArg >= 0 ? Number(argv[fromArg + 1]) : 0;
  const want = Number(argv.find((a) => /^\d+$/.test(a)) || 60);
  const dirs = pit ? ['PIT'] : ['LIT', 'LIT2', 'LIT3', 'LIT4'];
  const l = L.open(dirs.map((d) => path.join('maps/pkgdb', d)));
  const schema = S.load(l.vols[0].file, l.header.at), cat = l.catalog();
  const st = { byOp: {}, сверяноБайт: 0, сошлосьБайт: 0, перенесеноБайт: 0,
               разошлось: 0, режимСошёлся: {}, режимРазошёлся: {},
               разошлисьКоды: {}, примеры: [], примерыЧисел: [] };
  const step = Math.max(1, Math.floor((cat.length - from) / want));
  let n = 0;
  for (let i = from; i < cat.length && n < want; i += step) { roundBlock(schema, l.block(cat[i]), { stats: st }); n++; }
  l.vols.forEach((v) => fs.closeSync(v.fd));

  console.log('блоков: %d (%s)', n, pit ? 'PIT' : 'LIT');
  console.log('\nпо кодам операций:');
  console.log('  код    шагов    сошлось   байт сверено  байт перенесено');
  for (const k of Object.keys(st.byOp).sort()) {
    const s = st.byOp[k];
    const сверено = s.байт - s.перенесено;
    console.log('  ' + k.padEnd(6), String(s.всего).padStart(8), String(s.сошлось).padStart(10),
                String(сверено).padStart(13), String(s.перенесено).padStart(16));
  }
  const pct = (a, b) => b ? (100 * a / b).toFixed(3) + ' %' : '—';
  console.log('\nбайт сверено %d, из них сошлось %d (%s)',
              st.сверяноБайт, st.сошлосьБайт, pct(st.сошлосьБайт, st.сверяноБайт));
  console.log('байт перенесено как есть (строки и блобы): %d', st.перенесеноБайт);
  console.log('шагов разошлось: %d', st.разошлось);
  if (Object.keys(st.режимСошёлся).length) {
    console.log('\nрежимы 0x41, где выбор совпал:');
    Object.entries(st.режимСошёлся).sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log('   ' + k.padEnd(10), v));
  }
  if (Object.keys(st.режимРазошёлся).length) {
    console.log('\nрежимы 0x41, где выбор разошёлся (было -> выбрали):');
    Object.entries(st.режимРазошёлся).sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log('   ' + k.padEnd(24), v));
    console.log('  примеры:');
    st.примеры.forEach((e) => console.log('   ', JSON.stringify(e)));
  }
  if (Object.keys(st.разошлисьКоды).length) {
    console.log('\nчисловые коды, где разошлось:');
    Object.entries(st.разошлисьКоды).sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log('   ' + k.padEnd(8), v));
    st.примерыЧисел.forEach((e) => console.log('   ', JSON.stringify(e)));
  }
}
