'use strict';
// Чтение блоков VEKTORBLOCK версии 3 — тех, из которых состоят разреженные
// тайлы и уровни 3 и 4. В отличие от версии 5 таблицы векторов здесь нет:
// прошивка при версии ≤ 4 обнуляет указатель на неё (u_gvi, 0x08272a26), и
// смещение вектора приходит прямо из ссылки.
//
// Модель снята с машинного кода, а не угадана по статистике:
//
//   FUN_08272350   обходчик списка узла: идёт вперёд от вектора и возвращает
//                  начало своего узла (слово-самоиндекс × 2);
//   FUN_082727e8   u_get_koord_c — голова узла: координата и её добавочные поля;
//   FUN_08272938   u_gvi — разбор самой записи вектора (общий с версией 5,
//                  см. src/xacrec.js; вложенной цепочки у v3 нет: она под
//                  условием «версия > 3»).
//
// Устройство блока:
//
//   шапка 0x4c байт (размер лежит в поле 0x40)
//   заголовки под-блоков по 20 байт: [0xc000|знач][знач][4 × i32 рамка]
//   узлы подряд: [голова][элементы][терминатор]
//
// Элемент списка различается двумя старшими битами первого слова:
//
//   0xCxxx  запись вектора; дальше слово 1, при межблочной ссылке слово 2
//   0x8xxx  встречная ссылка в другой блок, четыре байта
//   0x4xxx  встречная ссылка внутри блока, два байта
//   0x0000  особый элемент на 18 байт
//   0x0xxx  ТЕРМИНАТОР: значение × 2 равно началу узла
//
// Длина элемента с взведённым битом 15 определяется не разбором, а правилом
// обходчика: слова читаются до первого слова со снятым битом 15 включительно.
// Поэтому граница элемента известна точно даже там, где содержимое непонятно.

const fs = require('fs');
const xac = require('./xac');
const xv = require('./xacvec');

// Голова узла. База — из u_get_koord_c: компактная форма 4 байта, длинная 6
// или 8 (бит 13 первого слова). Дальше идут добавочные поля: ниббл 8..11
// задаёт их число в словах (0xf — счётчик лежит отдельным словом), а бит 12
// добавляет ещё одно слово. Правило проверено самоиндексом: на 264 287 узлах
// ни одного расхождения.
function headLen(s, p) {
  if (p + 2 > s.length) return 0;
  const w = s.readUInt16BE(p);
  if ((w & 0xc000) !== 0x8000) return 4;
  let n = ((w >> 13) & 1) ? 8 : 6;
  const k = (w >> 8) & 0x0f;
  if (k === 0x0f) {
    if (p + n + 2 > s.length) return 0;
    n += 2 + s.readUInt16BE(p + n) * 2;
  } else {
    n += k * 2;
  }
  if ((w >> 12) & 1) n += 2;
  return n;
}

// Один узел: голова, список элементов, терминатор. `self` — то, что вернула бы
// прошивка: начало узла по слову-самоиндексу.
function readNode(s, at) {
  const hl = headLen(s, at);
  if (!hl || at + hl + 2 > s.length) return null;
  let p = at + hl;
  const els = [];
  for (let guard = 0; p + 2 <= s.length && guard < 4096; guard++) {
    const start = p, w = s.readUInt16BE(p);
    p += 2;
    if ((w & 0xc000) === 0) {
      if (w !== 0) return { at, head: hl, end: p, self: w * 2, els };
      // нулевое слово: FUN_08272350 смотрит на слово по +10 и шагает 12 или 16
      if (p + 12 > s.length) return null;
      p += (s.readUInt16BE(p + 10) & 0x8000) ? 16 : 12;
      els.push({ at: start, len: p - start, mark: 0 });
      continue;
    }
    if (!(w & 0x8000)) { els.push({ at: start, len: 2, mark: 1 }); continue; }
    while (p + 2 <= s.length && (s.readUInt16BE(p) & 0x8000)) p += 2;
    p += 2;                                    // слово со снятым битом 15 — тоже внутри
    els.push({ at: start, len: p - start, mark: w >> 14 });
  }
  return null;
}

// Заголовок под-блока: метка та же, что у вектора, отличает его рамка —
// две пары i32 внутри рамки блока.
function isSubHeader(s, p, bb) {
  if (p + 20 > s.length) return false;
  const v = [4, 8, 12, 16].map((o) => s.readInt32BE(p + o));
  return v[0] <= v[2] && v[1] <= v[3] &&
         v[0] >= bb[0] && v[2] <= bb[2] && v[1] >= bb[1] && v[3] <= bb[3];
}

// Блок целиком. Возвращает узлы с координатами и списками элементов.
function readBlock(s) {
  if (s.length < 0x4c || s.readUInt16BE(0x14) !== 3) return null;
  const bounds = [0x18, 0x1c, 0x20, 0x24].map((o) => s.readInt32BE(o));
  const origin = [s.readInt32BE(0x28), s.readInt32BE(0x2c)];
  const hdr = s.readUInt16BE(0x40);
  const nodes = [], subs = [];
  let p = hdr, fail = 0;
  for (let guard = 0; p + 4 <= s.length && guard < 1e6; guard++) {
    const w = s.readUInt16BE(p);
    if ((w & 0xc000) === 0xc000 && isSubHeader(s, p, bounds)) { subs.push(p); p += 20; continue; }
    const n = readNode(s, p);
    if (!n) { fail++; break; }
    const c = xv.koord(s, p, origin[0], origin[1]);
    nodes.push({ at: n.at, head: n.head, end: n.end, self: n.self, els: n.els,
                 x: c ? c.x : null, y: c ? c.y : null });
    p = n.end;
  }
  return {
    version: 3, bounds, origin, header: hdr, subs, nodes, fail,
    tail: s.length - p,
    count: { vectors: s.readUInt16BE(0x30), nodes: s.readUInt16BE(0x32) },
    block: s.readUInt16BE(0x34), first: s.readUInt16BE(0x36), country: s.readUInt16BE(0x3a),
  };
}

// Поля записи вектора, которые нужны для графа. Полный разбор — в src/xacrec.js.
function vector(s, el, base) {
  const w0 = s.readUInt16BE(el.at), w1 = s.readUInt16BE(el.at + 2);
  const cross = (w1 & 0x4000) !== 0;
  return {
    at: el.at, len: el.len, idx: w1 & 0x07ff, cross,
    ref: (w0 & 0x3fff) * 2,                    // смещение узла: ссылка × 2
    block: cross ? (s.readUInt16BE(el.at + 4) & 0x7fff) + base : null,
  };
}

// Рёбра одного блока. Межблочные пропускаются: их второй конец лежит в чужом
// блоке, внутри текущего его не разрешить (ключ `--keepCross` оставляет их).
function blockEdges(s, opts) {
  opts = opts || {};
  const b = readBlock(s);
  if (!b) return [];
  const byAt = new Map(b.nodes.map((n) => [n.at, n]));
  const out = [];
  for (const n of b.nodes) {
    for (const el of n.els) {
      if (el.mark !== 3) continue;
      const v = vector(s, el, b.first);
      if (v.cross) { if (opts.keepCross) out.push({ idx: v.idx, cross: true, a: { x: n.x, y: n.y }, b: null, block: v.block }); continue; }
      const t = byAt.get(v.ref);
      if (!t || n.x === null || t.x === null) continue;
      out.push({ idx: v.idx, cross: false, a: { x: n.x, y: n.y }, b: { x: t.x, y: t.y } });
    }
  }
  return out;
}

function fileEdges(buf, opts) {
  const res = [];
  for (const v of xac.vectorBlocks(buf)) {
    if (v.version !== 3) continue;
    res.push(...blockEdges(buf.subarray(v.offset, v.offset + v.size), opts));
  }
  return res;
}

// Обратная к koord: та же тройка форм, что у u_get_koord_c. Разряды, которых
// декодер не читает, переносятся из оригинала — и считаются отдельно.
function encodeCoord(x, y, ox, oy, form, keep) {
  if (form === 4) {
    const vx = x - ox + 16384, vy = y - oy + 32768;
    if (vx < 0 || vx > 0x7fff || vy < 0 || vy > 0xffff) return null;
    const out = Buffer.alloc(4);
    out.writeUInt16BE(vx & 0x7fff, 0);
    out.writeUInt16BE(vy, 2);
    return out;
  }
  if (form === 6) {
    const vx = x - ox + 524288, vy = y - oy + 524288;
    if (vx < 0 || vx > 0xfffff || vy < 0 || vy > 0xfffff) return null;
    const out = Buffer.alloc(6);
    out[0] = 0x80 | (keep[0] & 0x1f);
    out[1] = ((vy >> 16) << 4) | (vx >> 16);
    out.writeUInt16BE(vx & 0xffff, 2);
    out.writeUInt16BE(vy & 0xffff, 4);
    return out;
  }
  const vx = x - ox + 134217728, vy = y - oy + 134217728;
  if (vx < 0 || vx > 0xfffffff || vy < 0 || vy > 0xfffffff) return null;
  const out = Buffer.alloc(8);
  out[0] = 0xa0 | (keep[0] & 0x1f);
  out[1] = ((vy >> 24) << 4) | (vx >> 24);
  out[2] = (vx >> 16) & 0xff; out[3] = (vx >> 8) & 0xff; out[4] = vx & 0xff;
  out[5] = (vy >> 16) & 0xff; out[6] = (vy >> 8) & 0xff; out[7] = vy & 0xff;
  return out;
}

// Какой формой писать координату: компактной, если дельты в неё влезают,
// иначе длинной. Добавочных полей головы мы не пишем — ниббл и бит 12 нулевые.
function coordForm(x, y, ox, oy) {
  const dx = x - ox, dy = y - oy;
  if (dx + 16384 >= 0 && dx + 16384 <= 0x7fff && dy + 32768 >= 0 && dy + 32768 <= 0xffff) return 4;
  if (dx + 524288 >= 0 && dx + 524288 <= 0xfffff && dy + 524288 >= 0 && dy + 524288 <= 0xfffff) return 6;
  return 8;
}

// Обратный проход: собрать байты блока заново из разобранных значений.
// Мера честная: `made` — байты, посчитанные из смысла (координата узла, номер
// узла в записи, встречная ссылка, терминатор), `kept` — перенесённые как есть.
function rebuild(s) {
  const b = readBlock(s);
  if (!b) return null;
  const out = Buffer.from(s);                  // каркас переносим, поверх пишем своё
  let made = 0, kept = s.length;
  const put16 = (p, v) => { out.writeUInt16BE(v & 0xffff, p); made += 2; kept -= 2; };
  for (const n of b.nodes) {
    if (n.x !== null) {
      const w = s.readUInt16BE(n.at);
      const form = (w & 0xc000) === 0x8000 ? (((w >> 13) & 1) ? 8 : 6) : 4;
      const c = encodeCoord(n.x, n.y, b.origin[0], b.origin[1], form,
        s.subarray(n.at, n.at + form));
      if (c) { c.copy(out, n.at); made += form; kept -= form; }
    }
    for (const el of n.els) {
      if (el.mark === 1) {                     // встречная ссылка: адрес слова вектора
        put16(el.at, 0x4000 | (s.readUInt16BE(el.at) & 0x3fff));
      } else if (el.mark === 3) {
        const v = vector(s, el, b.first);
        put16(el.at, 0xc000 | (v.ref / 2));    // номер узла = смещение / 2
        const w1 = s.readUInt16BE(el.at + 2);
        put16(el.at + 2, (w1 & 0x8000) | (v.cross ? 0x4000 : 0) | (w1 & 0x3800) | v.idx);
        if (v.cross) {
          const w2 = s.readUInt16BE(el.at + 4);
          put16(el.at + 4, (w2 & 0x8000) | ((v.block - b.first) & 0x7fff));
        }
      }
    }
    put16(n.end - 2, n.at / 2);                // терминатор — самоиндекс узла
  }
  return { out, made, kept, same: out.equals(s), size: s.length };
}

// Сборка блока v3 из графа `{x, y, vectors: [{to, idx}]}`.
//
// Раскладка — прямое обращение обходчика: узел это координата, список
// элементов и слово-самоиндекс. Ребро пишется один раз записью вектора у узла
// с меньшим номером, а у второго конца лежит встречная ссылка на её слово —
// ровно так, как в заводских блоках, где встречная ссылка нашлась у всех
// 693 914 записей.
//
// Ограничения формата, которые здесь проверяются:
//   * смещение узла адресуется словом в 14 бит, значит блок не длиннее 32 766 б;
//   * координата пишется компактной формой, дельты должны влезть в неё.
function buildBlock(spec) {
  const nodes = spec.nodes || [];
  if (!nodes.length) throw new Error('блок без узлов');
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const n of nodes) {
    if (n.x < xmin) xmin = n.x;
    if (n.x > xmax) xmax = n.x;
    if (n.y < ymin) ymin = n.y;
    if (n.y > ymax) ymax = n.y;
  }
  const ox = spec.origin ? spec.origin[0] : Math.floor((xmin + xmax) / 2);
  const oy = spec.origin ? spec.origin[1] : Math.floor((ymin + ymax) / 2);

  // Ребро принадлежит узлу с меньшим номером; у второго конца — встречная ссылка.
  const own = nodes.map(() => []), back = nodes.map(() => []);
  nodes.forEach((n, i) => {
    for (const v of n.vectors || []) {
      if (v.to < 0 || v.to >= nodes.length) throw new Error('вектор узла ' + i + ' ведёт в никуда');
      if (v.to === i) throw new Error('вектор узла ' + i + ' ведёт сам в себя');
      if (i < v.to) own[i].push({ to: v.to, idx: v.idx | 0 });
      else own[v.to].push({ to: i, idx: v.idx | 0 });
    }
  });

  // Раскладка. Узел идёт слева направо, и все его встречные ссылки приходят от
  // узлов с меньшим номером — значит к моменту, когда до узла дошли, их число
  // уже известно и смещения считаются одним проходом.
  const HDR = 0x4c, SUB = 20;
  const at = new Array(nodes.length), form = nodes.map((n) => coordForm(n.x, n.y, ox, oy));
  let p = HDR + SUB, vectors = 0;
  for (let i = 0; i < nodes.length; i++) {
    at[i] = p;
    vectors += own[i].length;
    own[i].forEach((v, k) => back[v.to].push(at[i] + form[i] + k * 4));  // адрес слова вектора
    p += form[i] + own[i].length * 4 + back[i].length * 2 + 2;
  }
  const size = p;
  if (size > 0x7ffe) throw new Error('блок длиннее 32 766 байт — смещение не влезает в слово');

  const s = Buffer.alloc(size);
  s.write('VEKTORBLOCK     ', 0, 16, 'ascii');
  s.writeUInt32BE(size - 20, 0x10);
  s.writeUInt16BE(3, 0x14);
  // 0x16 — cos(широты) в формате 1.15, та же формула, что у v5
  const lat = ((ymin + ymax) / 2) / (40000000 / 360);
  s.writeUInt16BE(Math.min(0xffff,
    Math.floor(Math.cos(lat * Math.PI / 180) * (40000000 / 360) / 72000 * 32768)), 0x16);
  s.writeInt32BE(xmin, 0x18); s.writeInt32BE(ymin, 0x1c);
  s.writeInt32BE(xmax, 0x20); s.writeInt32BE(ymax, 0x24);
  s.writeInt32BE(ox, 0x28); s.writeInt32BE(oy, 0x2c);
  s.writeUInt16BE(vectors, 0x30);
  s.writeUInt16BE(nodes.length, 0x32);
  s.writeUInt16BE(spec.block || 0, 0x34);
  s.writeUInt16BE(spec.first || 0, 0x36);
  s.writeUInt16BE(2, 0x38);                            // «слов длины в записи нет»
  s.writeUInt16BE(spec.country || 0, 0x3a);
  s.writeUInt16BE(0x95, 0x3c);                         // как в заводских блоках; смысл не установлен
  s.writeUInt16BE(HDR, 0x40);

  // Заголовок под-блока: рамка всего блока. Слово 0 несёт число узлов —
  // так это выглядит у заводских блоков с единственным под-блоком.
  s.writeUInt16BE(0xc000 | (nodes.length & 0x3fff), HDR);
  s.writeInt32BE(xmin, HDR + 4); s.writeInt32BE(ymin, HDR + 8);
  s.writeInt32BE(xmax, HDR + 12); s.writeInt32BE(ymax, HDR + 16);

  // Байты узлов.
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const c = encodeCoord(n.x, n.y, ox, oy, form[i], Buffer.alloc(8));
    if (!c) throw new Error('узел ' + i + ': координата не лежит ни в одной из форм');
    c.copy(s, at[i]);
    let q = at[i] + form[i];
    for (const v of own[i]) {
      s.writeUInt16BE(0xc000 | (at[v.to] / 2), q);     // слово 0: номер узла-цели
      s.writeUInt16BE(v.idx & 0x07ff, q + 2);          // слово 1: бит 15 снят — запись кончилась
      q += 4;
    }
    for (const w of back[i]) { s.writeUInt16BE(0x4000 | (w / 2), q); q += 2; }
    s.writeUInt16BE(at[i] / 2, q);                     // терминатор — самоиндекс
  }
  return s;
}

module.exports = { headLen, readNode, isSubHeader, readBlock, vector, blockEdges,
                   fileEdges, encodeCoord, coordForm, rebuild, buildBlock };

if (require.main === module) {
  const [src, dst] = process.argv.slice(2);
  if (!src) { console.error('использование: node src/xacv3.js <файл.xac> [выход.geojson]'); process.exit(1); }
  const buf = fs.readFileSync(src);
  let nodes = 0, vecs = 0, bad = 0, blocks = 0;
  for (const v of xac.vectorBlocks(buf)) {
    if (v.version !== 3) continue;
    const s = buf.subarray(v.offset, v.offset + v.size);
    const b = readBlock(s);
    if (!b) continue;
    blocks++;
    const vec = b.nodes.reduce((a, n) => a + n.els.filter((e) => e.mark === 3).length, 0);
    const self = b.nodes.filter((n) => n.self !== n.at).length;
    nodes += b.nodes.length; vecs += vec; bad += self + b.fail;
    console.log('блок @%d: узлов %d (в шапке %d), векторов %d (в шапке %d), под-блоков %d, хвост %d б%s',
      v.offset, b.nodes.length, b.count.nodes, vec, b.count.vectors, b.subs.length, b.tail,
      self ? ', самоиндекс разошёлся у ' + self : '');
  }
  const edges = fileEdges(buf);
  console.log('блоков v3 %d; узлов %d; векторов %d; рёбер локальных %d; сбоев %d',
    blocks, nodes, vecs, edges.length, bad);
  if (dst) {
    fs.writeFileSync(dst, JSON.stringify(xv.toGeoJSON(edges.map((e, i) => ({ idx: i, type: e.idx, a: e.a, b: e.b })))));
    console.log('записано:', dst);
  }
}
