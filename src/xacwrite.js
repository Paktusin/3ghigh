// Сборка векторного блока .xac версии 5: чтение в модель, обратная запись
// байт в байт и генерация блока с нуля.
//
// Обратный проход — единственная честная проверка разбора: пока байты не
// собираются заново, «прочитали» ещё не значит «поняли». Разряды, которых
// прошивка не читает, переносятся из оригинала и считаются ОТДЕЛЬНО.
//
//   node src/xacwrite.js <база.db> [тайлов]     — отчёт об обратном проходе
'use strict';

const xac = require('./xac');
const xv = require('./xacvec');
const xr = require('./xacrec');

const HDR = 0x74;          // размер шапки, он же лежит в поле 0x40
const SUB = 0x16;          // заголовок под-блока сразу за шапкой
const K = (40000000 / 360) / 72000;   // единиц X на метр по экватору

// Поле 0x16 — множитель перевода дельт X в метры: cos(широты середины рамки)
// в формате 1.15. Совпадает с данными на 1286 блоках из 1288; оба промаха
// лежат ближе 0.001 к целому, то есть это разница округления во float.
function scaleAt(ymin, ymax) {
  const lat = (ymin + ymax) / 2 / (40000000 / 360) * Math.PI / 180;
  return Math.floor(Math.cos(lat) * K * 32768);
}

// ---------------------------------------------------------------- координаты

// Обратная к u_get_koord_c. `keep` — байт 0 оригинала: у длинных форм младшие
// пять разрядов декодер не читает, и переносятся они как есть.
function encodeCoord(c, ox, oy, form, keep) {
  const low5 = keep === undefined ? 0 : (keep & 0x1f);
  if (form === 4) {
    const vx = c.x - ox + 16384, vy = c.y - oy + 32768;
    if (vx < 0 || vx > 0x7fff || vy < 0 || vy > 0xffff) return null;
    const out = Buffer.alloc(4);
    out.writeUInt16BE(vx & 0x7fff, 0);
    out.writeUInt16BE(vy, 2);
    return out;
  }
  if (form === 6) {
    const vx = c.x - ox + 524288, vy = c.y - oy + 524288;
    if (vx < 0 || vx > 0xfffff || vy < 0 || vy > 0xfffff) return null;
    const out = Buffer.alloc(6);
    out[0] = 0x80 | low5;
    out[1] = ((vy >> 16) << 4) | (vx >> 16);
    out.writeUInt16BE(vx & 0xffff, 2);
    out.writeUInt16BE(vy & 0xffff, 4);
    return out;
  }
  if (form === 8) {
    const vx = c.x - ox + 134217728, vy = c.y - oy + 134217728;
    if (vx < 0 || vx > 0xfffffff || vy < 0 || vy > 0xfffffff) return null;
    const out = Buffer.alloc(8);
    out[0] = 0xa0 | low5;
    out[1] = ((vy >> 24) << 4) | (vx >> 24);
    out[2] = (vx >> 16) & 0xff; out[3] = (vx >> 8) & 0xff; out[4] = vx & 0xff;
    out[5] = (vy >> 16) & 0xff; out[6] = (vy >> 8) & 0xff; out[7] = vy & 0xff;
    return out;
  }
  return null;
}

// Самая короткая форма, в которую влезает координата.
//
// `strict` требует, чтобы компактная форма была ОДНОЗНАЧНОЙ. У неё первое
// слово равно (dx + 16384) & 0x7fff, и при dx >= 0 в нём поднят бит 14 — то
// есть слово неотличимо от обратной ссылки 0x4000. Прошивке это не мешает:
// она не идёт по области подряд, а прыгает по таблице. Нам, когда пишем своё,
// мешать не должно тоже — поэтому при dx >= 0 берём шестибайтовую форму с
// меткой 0x8000, которая ни с чем не путается.
function coordForm(c, ox, oy, strict) {
  const dx = c.x - ox, dy = c.y - oy;
  const compact = strict ? (dx >= -16384 && dx < 0) : (dx >= -16384 && dx <= 16383);
  if (compact && dy >= -32768 && dy <= 32767) return 4;
  if (dx >= -524288 && dx <= 524287 && dy >= -524288 && dy <= 524287) return 6;
  return 8;
}

function formAt(s, p) {
  return (s.readUInt16BE(p) & 0xc000) === 0x8000 ? (((s[p] >> 5) & 1) ? 8 : 6) : 4;
}

// Заголовок под-блока: 22 байта, метка 0xc0 — та же, что у записи вектора.
// Прошивка их не путает, потому что никогда не идёт по области подряд: она
// прыгает по таблице, и FUN_08272410 перескакивает 0x16 байт, когда отход
// назад попал на метку 0xc0. Нам подряд идти надо, и различает их раскладка:
//
//   +0x00 u16  0xc000 | значение
//   +0x02 u16  значение (старший полубайт всегда ноль)
//   +0x04 i32  xmin, +0x08 i32 ymin, +0x0c i32 xmax, +0x10 i32 ymax — своя рамка
//   +0x14 u16  счётчик, растущий вдоль области
//
// Признак «две пары i32 внутри рамки блока, xmin<=xmax, ymin<=ymax» сошёлся на
// 12 722 из 12 722 заголовков, найденных отходом по таблице, и не сработал ни
// разу на 463 543 настоящих записях вектора.
function looksSub(s, o, b) {
  if (o + SUB > s.length || (s[o] & 0xc0) !== 0xc0) return false;
  const x1 = s.readInt32BE(o + 4), y1 = s.readInt32BE(o + 8);
  const x2 = s.readInt32BE(o + 12), y2 = s.readInt32BE(o + 16);
  return x1 >= b[0] && x2 <= b[2] && y1 >= b[1] && y2 <= b[3] && x1 <= x2 && y1 <= y2;
}

// ------------------------------------------------------------------- слова

// Длина в метрах: мантисса в младших 12 битах, поле сдвига в битах 12..14,
// сдвиг равен удвоенному значению поля. Бит 15 декодер не читает.
function encodeLength(v) {
  for (let n = 0; n <= 7; n++) {
    const sh = n * 2;
    if (((v >>> sh) << sh) === v && (v >>> sh) <= 0xfff) return (n << 12) | (v >>> sh);
  }
  return null;
}

// Заголовок записи вектора. Бит 15 слова 1 прошивка не читает — переносим.
function encodeHeader(node, idx, hi, keep15) {
  return [
    (0xc000 | (node & 0x3fff)) & 0xffff,
    ((keep15 || 0) & 0x8000) | (((hi >> 6) & 1) << 14) | (((hi >> 5) & 1) << 13)
      | (((hi >> 4) & 1) << 12) | (((hi >> 3) & 1) << 11) | (idx & 0x07ff),
  ];
}

// ------------------------------------------------------------------- чтение

// Куски записи, попавшие в её собственные границы [at, end). Отход в пул и
// цепочка после него читают чужие байты — они принадлежат соседним записям.
function recordParts(s, at, attr) {
  const parts = [];
  const r = xr.record(s, at, attr, (a, b, role) => {
    if (a >= at) parts.push({ at: a, len: b - a, role: role || 'raw' });
  });
  if (!r) return null;
  const own = parts.filter((x) => x.at >= at && x.at + x.len <= r.end)
    .sort((a, b) => a.at - b.at);
  // дыры внутри записи переносим как есть
  const out = [];
  let p = at;
  for (const x of own) {
    if (x.at < p) continue;
    if (x.at > p) out.push({ at: p, len: x.at - p, role: 'gap', raw: s.subarray(p, x.at) });
    out.push(Object.assign({}, x, { raw: s.subarray(x.at, x.at + x.len) }));
    p = x.at + x.len;
  }
  if (p < r.end) out.push({ at: p, len: r.end - p, role: 'gap', raw: s.subarray(p, r.end) });
  return { rec: r, parts: out };
}

// Начала узлов, заверенные таблицей. Это единственный надёжный якорь: слово
// компактной координаты с неотрицательным dx выглядит ровно как обратная
// ссылка 0x4000, и по одним меткам их не различить (см. docs/formats/xac.md).
function certifiedNodes(s, tab, cnt) {
  const set = new Set();
  for (let i = 1; i < cnt; i++) {
    const o = xv.nodeOffset(s, tab, cnt, i);
    if (o > 0) set.add(o);
  }
  return set;
}

// Разбор блока в модель. Возвращает null, если блок не v5 или шапка не та.
function readBlock(s, attr) {
  if (s.length < HDR + SUB || s.readUInt16BE(0x14) !== 5 || s.readUInt16BE(0x72) !== 1) return null;
  const tab = s.readUInt32BE(0x6c), cnt = s.readUInt16BE(0x70);
  if (!(tab > HDR && tab + cnt * 2 + 2 + cnt <= s.length && cnt > 0)) return null;
  const ox = s.readInt32BE(0x28), oy = s.readInt32BE(0x2c);
  const box = [s.readInt32BE(0x18), s.readInt32BE(0x1c), s.readInt32BE(0x20), s.readInt32BE(0x24)];
  const items = [];
  const node = certifiedNodes(s, tab, cnt);
  let p = HDR, guard = 0, broke = false;

  const readList = () => {
    while (p + 2 <= tab) {
      const w = s.readUInt16BE(p), t = (w & 0xc000) >>> 14;
      if (node.has(p)) return;                    // таблица говорит: тут новый узел
      if (t === 3) {
        if (looksSub(s, p, box)) return;          // дальше не список, а под-блок
        const q = recordParts(s, p, attr);
        if (!q) { skip(); return; }
        const o1 = s.readUInt16BE(p + 2);
        items.push({ kind: 'vector', at: p, len: q.rec.end - p, node: q.rec.node,
                     idx: q.rec.idx, hi: o1 >> 8, w1: o1, parts: q.parts });
        p = Math.max(q.rec.end, p + 4);
      } else if (t === 1) {
        items.push({ kind: 'backref', at: p, len: 2, ref: w & 0x3fff, word: w });
        p += 2;
      } else if (w === 0 && p + 14 <= tab) {
        // Нульвектор: связи узла с тем же узлом в соседнем тайле, по паре на
        // уровень (см. src/nullvec.js). Длину задаёт бит 15 третьей пары —
        // ровно так её берёт обходчик FUN_08272350. Спутать с координатой
        // нельзя: начала узлов заверены таблицей и проверяются выше.
        const len = (s.readUInt16BE(p + 12) & 0x8000) ? 18 : 14;
        if (p + len > tab) return;
        items.push({ kind: 'null', at: p, len, raw: s.subarray(p, p + len) });
        p += len;
        return;                                   // список узла на этом кончился
      } else return;
    }
  };

  // Пересинхронизация: место, где грамматика не сходится, переносится как есть
  // словом за словом. На 216 блоках таких мест 64 — и это не сбой разбора, а
  // признак того, что в потоке лежит что-то ещё, чего мы пока не назвали.
  const skip = () => {
    const n = Math.min(2, tab - p);
    if (n <= 0) { p = tab; return; }
    items.push({ kind: 'raw', at: p, len: n, raw: s.subarray(p, p + n) });
    p += n; broke = true;
  };

  while (p < tab && ++guard < 4000000) {
    if (tab - p < 4) break;                        // хвост короче координаты — выравнивание
    if ((s[p] & 0xc0) === 0xc0) {                  // заголовок под-блока
      if (!looksSub(s, p, box)) { skip(); continue; }
      items.push({ kind: 'sub', at: p, len: SUB, raw: s.subarray(p, p + SUB),
                   box: [s.readInt32BE(p + 4), s.readInt32BE(p + 8),
                         s.readInt32BE(p + 12), s.readInt32BE(p + 16)],
                   seq: s.readUInt16BE(p + 20) });
      p += SUB; continue;
    }
    const form = formAt(s, p);
    if (p + form > tab) break;
    const c = xv.koord(s, p, ox, oy);
    if (!c) { skip(); continue; }
    items.push({ kind: 'coord', at: p, len: form, form, x: c.x, y: c.y, low5: s[p] & 0x1f });
    p += form;
    readList();
  }
  return {
    head: Buffer.from(s.subarray(0, HDR)),
    ox, oy, tab, cnt, items, broke, end: p,
    pad: Buffer.from(s.subarray(p, tab)),
    table: Buffer.from(s.subarray(tab, s.length)),
    size: s.length,
  };
}

// ------------------------------------------------------------------- запись

// Собрать байты записи вектора заново из разобранных полей.
function writeVector(v, tally) {
  const out = [];
  for (const q of v.parts) {
    if (q.role === 'head') {
      const b = Buffer.alloc(4);
      const [w0, w1] = encodeHeader(v.node, v.idx, v.hi, v.w1);
      b.writeUInt16BE(w0, 0); b.writeUInt16BE(w1, 2);
      out.push(b); if (tally) tally.value += 4;
    } else {
      out.push(Buffer.from(q.raw));
      if (tally) tally[q.role === 'gap' ? 'raw' : 'frame'] += q.len;
    }
  }
  return Buffer.concat(out);
}

// Собрать блок целиком. tally — счётчик байт по происхождению.
function writeBlock(m, tally) {
  const t = tally || { value: 0, frame: 0, raw: 0, opaque: 0 };
  const out = [Buffer.from(m.head)];
  t.raw += m.head.length;
  for (const it of m.items) {
    if (it.kind === 'coord') {
      const b = encodeCoord({ x: it.x, y: it.y }, m.ox, m.oy, it.form, it.low5);
      if (!b) return null;
      out.push(b); t.value += it.form;
      if (it.form !== 4) t.opaque += 5;            // младшие 5 разрядов байта 0
    } else if (it.kind === 'backref') {
      const b = Buffer.alloc(2); b.writeUInt16BE(0x4000 | (it.ref & 0x3fff), 0);
      out.push(b); t.value += 2;
    } else if (it.kind === 'vector') {
      out.push(writeVector(it, t));
    } else {
      out.push(Buffer.from(it.raw)); t.raw += it.len;
    }
  }
  out.push(Buffer.from(m.pad), Buffer.from(m.table));
  t.raw += m.pad.length + m.table.length;
  return Buffer.concat(out);
}

// ---------------------------------------------------------------- генерация

// Индексы таблицы ATTRIBUTE, при которых запись вектора занимает ровно четыре
// байта: разборщик не потребует ни подстановки половин слова (биты 31 и 15
// заготовки), ни дополнительных полей (биты 30, 29, 28, 27).
function simpleAttributes(attr) {
  const out = [];
  for (let i = 0; i < attr.length && i <= 0x07ff; i++) {
    const v = attr[i] >>> 0;
    if (v & 0x80000000) continue;
    if ((v >>> 15) & 1) continue;
    if (v & 0x78000000) continue;
    out.push(i);
  }
  return out;
}

// Нульвектор узла: маркер 0x0000 и до четырёх пар «номер блока, ссылка».
// Пара k стоит на уровне k, поэтому массив адресуется уровнем, а не порядком.
// Раскладка и смысл — в src/nullvec.js, снято с u_get_vecttree_of_vid_or_vinfo.
//
// Бит 15 второго слова означает «за этой парой есть ещё»: его надо держать до
// последней ЗАНЯТОЙ пары, иначе разбор остановится раньше времени. Он же
// задаёт длину элемента: обходчик списка смотрит именно на третью пару и
// шагает 14 или 18 байт.
function encodeNull(links) {
  const byLevel = [];
  for (const l of links) {
    if (!(l.level >= 1 && l.level <= 4)) throw new Error('нульвектор: уровень ' + l.level);
    if (byLevel[l.level]) throw new Error('нульвектор: два раза уровень ' + l.level);
    if (!(l.ref > 0 && l.ref <= 0x7fff)) throw new Error('нульвектор: ссылка ' + l.ref);
    if (!(l.block >= 0 && l.block <= 0xffff)) throw new Error('нульвектор: блок ' + l.block);
    byLevel[l.level] = l;
  }
  let last = 0;
  for (let k = 1; k <= 4; k++) if (byLevel[k]) last = k;
  if (!last) throw new Error('нульвектор без пар');
  const pairs = last > 3 ? 4 : 3;
  const out = Buffer.alloc(2 + pairs * 4);
  for (let k = 1; k <= pairs; k++) {
    const l = byLevel[k];
    out.writeUInt16BE(l ? l.block & 0xffff : 0, 2 + (k - 1) * 4);
    out.writeUInt16BE((k < last ? 0x8000 : 0) | (l ? l.ref & 0x7fff : 0), 4 + (k - 1) * 4);
  }
  return out;
}

// Построить блок v5 из графа. Узел = {x, y, vectors: [...], links: [...]}.
//
// Вектор бывает двух видов:
//   {to, idx}            — ребро внутри блока: `to` номер узла-конца,
//                          `idx` индекс в таблице ATTRIBUTE;
//   {block, ref, idx}    — ребро в ДРУГОЙ блок: `block` сквозной номер блока,
//                          `ref` номер записи в его таблице. Пишется шестью
//                          байтами: бит 14 слова 1 говорит «дальше слово с
//                          номером блока», и он же для разборщика значит
//                          «пропустить слово», так что длина сходится сама.
//                          Номер кладётся разностью с `tileBase` — прошивка
//                          складывает его с полем 0x36 блока.
//
// `backs` — встречные ссылки, без которых ребро видно только с одного конца.
// Две разновидности, обе проверены на заводских данных:
//   {from, at}      запись `at` узла `from` ЭТОГО блока ведёт сюда. Пишется
//                   словом `0x4000 | номер записи` — в v5 это именно НОМЕР
//                   ЗАПИСИ, а не смещение (88 642 из 88 642: запись под этим
//                   номером — вектор, указывающий обратно в наш узел);
//   {block, ref}    запись `ref` ДРУГОГО блока. Четыре байта: `0x8000 | ref`
//                   и номер блока разностью с `tileBase` (3635 из 3635 ведут
//                   на межблочный вектор, указывающий обратно в наш узел).
//
// `links` — нульвектор узла: [{level, block, ref}], см. encodeNull.
//
// Раскладка таблицы — прямое обращение FUN_08272410: запись i указывает на
// запись вектора, а байт шага говорит, на сколько СЛОВ назад от неё лежит
// координата узла-начала. У второго и следующих векторов одного узла шаг 0 —
// «взять смещение у предыдущей записи». Значения 0, 1 и 255 заняты (взять у
// предыдущей, длинный шаг словом перед записью, узла нет), поэтому шагом
// первого вектора служит длина координаты в словах: 2, 3 или 4.
//
// Номер 0 использовать нельзя: FUN_08272410 отвечает на него нулём.
function buildBlock(spec) {
  const nodes = spec.nodes;
  if (!nodes.length) throw new Error('блок без узлов');
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const n of nodes) {
    if (n.x < xmin) xmin = n.x;
    if (n.x > xmax) xmax = n.x;
    if (n.y < ymin) ymin = n.y;
    if (n.y > ymax) ymax = n.y;
  }
  // Опора по умолчанию стоит правее всей рамки: тогда dx у каждого узла
  // отрицателен и компактная координата никогда не поднимает бит 14.
  const ox = spec.origin ? spec.origin[0] : xmax + 1;
  const oy = spec.origin ? spec.origin[1] : Math.floor((ymin + ymax) / 2);

  // Номера в таблице раздаются подряд, начиная с единицы: у узла с k векторами
  // занято k номеров, у узла без векторов — один.
  const first = new Array(nodes.length);
  let id = 1;
  for (let i = 0; i < nodes.length; i++) {
    first[i] = id;
    id += Math.max(1, (nodes[i].vectors || []).length + (nodes[i].backs || []).length);
  }
  const cnt = id;
  if (cnt > 0x3fff) throw new Error('записей больше 16383 — номер не влезает в слово');

  const body = [];
  let p = HDR;
  const sub = Buffer.alloc(SUB);                   // заголовок под-блока
  sub.writeUInt16BE(0xc000, 0);
  sub.writeInt32BE(xmin, 4); sub.writeInt32BE(ymin, 8);
  sub.writeInt32BE(xmax, 12); sub.writeInt32BE(ymax, 16);
  sub.writeUInt16BE(1, 20);
  body.push(sub); p += SUB;

  const word = new Array(cnt).fill(0), step = new Array(cnt).fill(255);
  word[0] = (HDR + SUB) / 2;                       // номер 0 не используется: FUN_08272410
                                                   // отвечает на него нулём, а слово по
                                                   // этому смещению — координата, не вектор
  let vectors = 0, junctions = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i], vs = n.vectors || [];
    const form = coordForm(n, ox, oy, true);
    const c = encodeCoord(n, ox, oy, form, 0);
    if (!c) throw new Error('узел ' + i + ': координата не лежит в рамке блока');
    body.push(c);
    const nodeAt = p;
    p += form;
    junctions++;
    const backs = n.backs || [];
    if (!vs.length && !backs.length) {                              // узел без векторов всё равно адресуем
      word[first[i]] = p / 2;
      step[first[i]] = form / 2;
    } else {
      for (let k = 0; k < vs.length; k++) {
        const v = vs[k];
        let b;
        if (v.block === undefined) {
          const to = first[v.to];
          if (to === undefined) throw new Error('вектор узла ' + i + ' ведёт в никуда');
          b = Buffer.alloc(4);
          const [w0, w1] = encodeHeader(to, v.idx, 0, 0);
          b.writeUInt16BE(w0, 0); b.writeUInt16BE(w1, 2);
        } else {
          const off = v.block - (spec.tileBase || 0);
          if (off < 0 || off > 0x7fff)
            throw new Error('межблочный вектор узла ' + i + ': блок ' + v.block +
                            ' не лежит в 0x7fff от tileBase ' + (spec.tileBase || 0));
          if (!(v.ref > 0 && v.ref <= 0x3fff))
            throw new Error('межблочный вектор узла ' + i + ': запись ' + v.ref);
          b = Buffer.alloc(6);
          const [w0, w1] = encodeHeader(v.ref, v.idx, 0x40, 0);   // бит 6 старшего байта
          b.writeUInt16BE(w0, 0); b.writeUInt16BE(w1, 2); b.writeUInt16BE(off, 4);
        }
        body.push(b);
        word[first[i] + k] = p / 2;
        step[first[i] + k] = k === 0 ? form / 2 : 0;
        vectors++;
        p += b.length;
      }
    }
    for (let k = 0; k < backs.length; k++) {
      const q = backs[k];
      let b;
      if (q.block === undefined) {
        const owner = first[q.from];
        if (owner === undefined) throw new Error('встречная ссылка узла ' + i + ' ведёт в никуда');
        const e = owner + (q.at || 0);
        if (e > 0x3fff) throw new Error('встречная ссылка узла ' + i + ': номер записи ' + e);
        b = Buffer.alloc(2);
        b.writeUInt16BE(0x4000 | e, 0);
      } else {
        const off = q.block - (spec.tileBase || 0);
        if (off < 0 || off > 0x7fff)
          throw new Error('встречная ссылка узла ' + i + ': блок ' + q.block +
                          ' не лежит в 0x7fff от tileBase ' + (spec.tileBase || 0));
        if (!(q.ref > 0 && q.ref <= 0x3fff))
          throw new Error('встречная ссылка узла ' + i + ': запись ' + q.ref);
        b = Buffer.alloc(4);
        b.writeUInt16BE(0x8000 | q.ref, 0);
        b.writeUInt16BE(off, 2);
      }
      body.push(b);
      const slot = first[i] + vs.length + k;
      word[slot] = p / 2;
      step[slot] = (vs.length === 0 && k === 0) ? form / 2 : 0;
      p += b.length;
    }
    if (n.links && n.links.length) {               // нульвектор идёт сразу за записями
      const nul = encodeNull(n.links);
      body.push(nul);
      p += nul.length;
    }
  }
  while (p % 4) { body.push(Buffer.alloc(1)); p++; }   // таблица выровнена на 4

  const tab = p;
  const table = Buffer.alloc(cnt * 2 + 2 + cnt);
  for (let i = 0; i < cnt; i++) table.writeUInt16BE(word[i], i * 2);
  for (let i = 0; i < cnt; i++) table[cnt * 2 + 2 + i] = step[i];

  const head = Buffer.alloc(HDR);
  head.write('VEKTORBLOCK     ', 0, 16, 'latin1');
  head.writeUInt16BE(5, 0x14);
  head.writeUInt16BE(scaleAt(ymin, ymax), 0x16);   // cos(широты) в формате 1.15
  head.writeInt32BE(xmin, 0x18); head.writeInt32BE(ymin, 0x1c);
  head.writeInt32BE(xmax, 0x20); head.writeInt32BE(ymax, 0x24);
  head.writeInt32BE(ox, 0x28); head.writeInt32BE(oy, 0x2c);
  head.writeUInt16BE(vectors, 0x30);               // записей таблицы с меткой 0xc000
  head.writeUInt16BE(junctions, 0x32);             // разных узлов, адресуемых таблицей
  head.writeUInt16BE(spec.id || 0, 0x34);
  head.writeUInt16BE(spec.tileBase || 0, 0x36);
  head.writeUInt16BE(2, 0x38);                     // (байт 0x39 >> 1) & 3 == 1: длин в записи нет
  head.writeUInt16BE(spec.country || 0, 0x3a);
  head.writeUInt16BE(spec.flags === undefined ? 0x95 : spec.flags, 0x3c);
  head.writeUInt16BE(HDR, 0x40);                   // размер шапки, он же 0x74
  head.writeUInt32BE(2, 0x68);
  head.writeUInt32BE(tab, 0x6c);
  head.writeUInt16BE(cnt, 0x70);
  head.writeUInt16BE(1, 0x72);
  let out = Buffer.concat([head].concat(body).concat([table]));
  if (out.length % 4) out = Buffer.concat([out, Buffer.alloc(4 - (out.length % 4))]);
  out.writeUInt32BE(out.length - 20, 0x10);        // длина полезной части раздела
  return out;
}

module.exports = { readBlock, writeBlock, buildBlock, simpleAttributes, encodeCoord,
                   coordForm, looksSub, encodeLength, encodeHeader, encodeNull, scaleAt,
                   recordParts, HDR, SUB };

if (require.main === module) {
  const fldb = require('./fldb');
  const db = fldb.open(process.argv[2] || 'maps/pkgdb/XAC/kN221EUx01_0.db');
  const list = fldb.entries(db);
  const attr = xr.attributes(fldb.read(db, list.find((x) => /\.xah$/i.test(x.name))));
  const tiles = list.filter((x) => /\.xac$/i.test(x.name)).slice(0, Number(process.argv[3] || 40));
  const t = { value: 0, frame: 0, raw: 0, opaque: 0 };
  let blocks = 0, same = 0, broke = 0, bytes = 0, nodes = 0, vecs = 0, brefs = 0, reach = 0;
  for (const e of tiles) {
    const buf = fldb.read(db, e);
    for (const b of xac.vectorBlocks(buf)) {
      if (b.version !== 5) continue;
      const s = buf.subarray(b.offset, b.offset + b.size);
      const m = readBlock(s, attr);
      if (!m) continue;
      blocks++; if (m.broke) broke++;
      reach += m.end - HDR - SUB;
      for (const it of m.items) {
        if (it.kind === 'coord') nodes++;
        else if (it.kind === 'vector') vecs++;
        else if (it.kind === 'backref') brefs++;
      }
      const back = writeBlock(m, t);
      bytes += s.length;
      if (back && back.equals(s)) same++;
    }
  }
  console.log('блоков %d, собрано байт в байт %d (%s%%), разбор оборвался в %d',
    blocks, same, (100 * same / blocks).toFixed(1), broke);
  console.log('узлов %d, векторов %d, обратных ссылок %d', nodes, vecs, brefs);
  const tot = t.value + t.frame + t.raw;
  console.log('байт: из значений %d (%s%%), каркас со своим словом %d (%s%%), перенесено %d (%s%%)',
    t.value, (100 * t.value / tot).toFixed(1), t.frame, (100 * t.frame / tot).toFixed(1),
    t.raw, (100 * t.raw / tot).toFixed(1));
  console.log('неопределённых разрядов в координатах: %d', t.opaque);
}
