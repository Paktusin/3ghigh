// Сборка блока точек интереса LIT: модель -> байты.
//
// Раскладка взята из грамматики `TTD` (правила 0…16 — заголовок блока,
// 140…143 — запись-тайл, 216…242 — точка интереса) и проверена отводом по
// живым блокам. Ведущий байт записи читает диспетчер (правило 18), а первое
// правило самой структуры помечено битом 0x4000 и при входе пропускается —
// поэтому в байтах структуры своего «типа» нет, он в ведущем байте.
//
//   заголовок блока   u16 число элементов, байт 0, байт ширина координат,
//                     s32 X опоры, s32 Y опоры, байт число кодов, словарь
//   узел дерева       байт 0x95, пара минимума A, пара максимума A, ссылка A,
//                     пара минимума B, пара максимума B, ссылка B, ссылка 0x79,
//                     varint, ссылка 0x7a, varint — все поля без условий,
//                     «нет ссылки» пишется сбросом кодека 0xff
//   запись-тайл       байт 0x96, varint — сколько точек в блоке
//   точка интереса    байт 0xa8|флаги, дельта-ссылка, упакованная пара,
//                     и при бите 2 — категория, название, блоб, [кухня],
//                     0x73, u32 идентификатор, байт 1, СБРОС 0xff, подробности
//   конец блока       байт 0x80 — структура 0x80, её КОНЕЦ без цели и
//                     останавливает разбор; стоит в конце КАЖДОГО блока
//
// Флаги: бит 0 — есть вид кухни, бит 1 — хвостовые циклы, бит 2 — полная
// запись. Без бита 2 остаются только ссылка, координата и идентификатор.
'use strict';

const path = require('path');
const S = require('./litschema');
const V = require('./litvm');
const D = require('./litdict');
const E = require('./litenc');

const LEAD_NODE = 0x95;                    // весь байт — признак узла дерева
const LEAD_TILE = 0x96;                    // весь байт — признак записи-тайла
const LEAD_POI = 0xa8;                     // старшие пять бит записи точки
const LEAD_END = 0x80;                     // запись-конец: структура 0x80
const RESET = 0xff;                        // сброс дельта-кодека (поле 0x36)

const F_FOOD = 1;                          // бит 0 — вид кухни
const F_TAIL = 2;                          // бит 1 — хвостовые циклы
const F_FULL = 4;                          // бит 2 — вся полезная часть

// --- чтение модели ----------------------------------------------------------
//
// Собирается отводом по номерам правил, а не из готовых записей: модели нужны
// и ведущий байт (его в записи нет), и сырые байты строк — они уже сжаты
// словарём блока, и для побайтовой пересборки их надо перенести как есть.
function readBlock(schema, block, blk) {
  const m = {
    origin: { x: block.readInt32BE(4), y: block.readInt32BE(8) },
    width: block[3],
    count: block.readUInt16BE(0),
    byte2: block[2],
    dict: (D.dict(block) || { codes: new Map() }).codes,
    tile: null,
    pois: [],
    nodes: [],
    other: new Map(),                        // ведущие байты записей, которых писатель не знает
  };
  let cur = null, node = null, lead = 0;
  const fin = () => {
    if (cur) m.pois.push(cur);
    if (node) m.nodes.push(node);
    cur = null; node = null;
  };
  V.run(schema, block, 0, { blk: blk, limit: 4000000, tap: (t) => {
    const r = t.rule;
    if (r === 18) {
      fin();
      lead = block[t.at];
      // 0x95 узел, 0x96 тайл, 0xa8|флаги точка, 0x80 конец блока — остальное
      // писатель не знает и молчать об этом нельзя.
      if (lead !== LEAD_NODE && lead !== LEAD_TILE && lead !== LEAD_END &&
          (lead & 0xf8) !== LEAD_POI) m.other.set(lead, (m.other.get(lead) || 0) + 1);
      return;
    }
    if (r === 142) { m.tile = { count: t.val }; return; }
    if (r >= 129 && r <= 138) {
      if (r === 129) node = { aMin: null, aMax: null, a: null,
                              bMin: null, bMax: null, b: null,
                              x79: null, n42: 0, x7a: null, n7b: 0 };
      if (!node) return;
      // ссылка «нет» приходит сбросом кодека: X и Y становятся −1
      const link = () => (t.x === -1 && t.y === -1 ? null : [t.x, t.y]);
      switch (r) {
        case 129: node.aMin = t.pair; break;
        case 130: node.aMax = t.pair; break;
        case 131: node.a = link(); break;
        case 132: node.bMin = t.pair; break;
        case 133: node.bMax = t.pair; break;
        case 134: node.b = link(); break;
        case 135: node.x79 = link(); break;
        case 136: node.n42 = t.val; break;
        case 137: node.x7a = link(); break;
        case 138: node.n7b = t.val; break;
        default: break;
      }
      return;
    }
    if (r < 218 || r > 241) return;
    if (r === 218) cur = { flags: lead & 7, ref: null, xy: null };
    if (!cur) return;
    switch (r) {
      case 218: cur.ref = [t.x, t.y]; break;                   // 0x66, дельта
      case 219: cur.xy = t.pair; break;                        // 0x22, пара
      case 220: cur.cat = t.val; break;                        // 0x4f
      case 222: cur.name = block.subarray(t.at, t.end); break;  // 0x4d, сжатое
      case 224: cur.blob = block.subarray(t.at, t.end); break;  // 0x67
      case 225: cur.food = t.val; break;                       // 0x4e
      case 226: cur.f73 = t.val; break;                        // 0x73
      case 227: cur.id = t.val; break;                         // 0x215
      case 228: cur.f216 = t.val; break;                       // 0x216
      case 231: cur.details = block.subarray(t.at, t.end); break; // 0x4b
      default: break;
    }
  } });
  fin();
  return m;
}

// --- запись -----------------------------------------------------------------

// Заголовок блока и словарь. Число элементов — это запись-тайл плюс точки.
function writeHeader(m) {
  const dict = D.serialize(m.dict);
  const h = Buffer.alloc(13);
  h.writeUInt16BE(m.count !== undefined ? m.count : m.pois.length + (m.tile ? 1 : 0), 0);
  h[2] = m.byte2 || 0;
  h[3] = m.width;
  h.writeInt32BE(m.origin.x, 4);
  h.writeInt32BE(m.origin.y, 8);
  h[12] = m.dict.size;
  return Buffer.concat([h, dict]);
}

// Запись-тайл: ведущий байт и число точек в блоке.
function writeTile(tile, pois) {
  const n = tile && tile.count !== undefined ? tile.count : pois.length;
  return Buffer.concat([Buffer.from([LEAD_TILE]), E.encVarint(n)]);
}

// Одна точка интереса. `st` — состояние дельта-кодека: оно сквозное по блоку,
// и запись с битом 2 в конце сама сбрасывает его байтом 0xff.
function writePoi(p, width, st) {
  const out = [Buffer.from([LEAD_POI | (p.flags & 7)])];
  const d = E.encDelta({ x: p.ref[0], y: p.ref[1], px: st.x, py: st.y,
                         base: st.base, first: st.first });
  if (!d) throw new Error('ссылка не кодируется: ' + JSON.stringify(p.ref));
  out.push(d.buf);
  st.x = p.ref[0]; st.y = p.ref[1]; st.first = false;
  const pair = E.encPair(p.xy[0], p.xy[1], width);
  if (!pair) throw new Error('ширина ' + width + ' не поддерживается');
  out.push(pair);
  if (p.flags & F_FULL) {
    out.push(E.encVarint(p.cat));
    out.push(E.encVarint(p.name.length), p.name);
    const blob = p.blob || Buffer.alloc(0);
    out.push(E.encVarint(blob.length), blob);
  }
  if (p.flags & F_FOOD) out.push(E.encVarint(p.food));
  if (p.flags & F_FULL) {
    out.push(E.encVarint(p.f73 || 0));
    out.push(E.encFixed(p.id, 4));
    out.push(Buffer.from([p.f216 === undefined ? 1 : p.f216]));
    out.push(Buffer.from([RESET]));
    st.x = -1; st.y = -1;                        // сброс кодека, как в прошивке
    out.push(E.encVarint(p.details.length), p.details);
  }
  if (p.flags & F_TAIL) throw new Error('хвостовые циклы (бит 1) не пишутся');
  return Buffer.concat(out);
}

// Ссылка узла: позиция дельта-кодеком, а «нет ссылки» — сброс 0xff. Прошивка
// проверяет ссылку сравнением с нулём (`if (-1 < piVar3[4])`), так что минус
// единица и значит «потомка нет».
function writeLink(link, st) {
  if (!link) { st.x = -1; st.y = -1; st.first = false; return Buffer.from([RESET]); }
  const d = E.encDelta({ x: link[0], y: link[1], px: st.x, py: st.y,
                         base: st.base, first: st.first });
  if (!d) throw new Error('ссылка не кодируется: ' + JSON.stringify(link));
  st.x = link[0]; st.y = link[1]; st.first = false;
  return d.buf;
}

// Узел дерева. Полей одиннадцать и все безусловные — порядок задан правилами
// 128…138 и менять его нельзя.
function writeNode(n, width, st) {
  const pair = (p) => {
    const b = E.encPair(p[0], p[1], width);
    if (!b) throw new Error('ширина ' + width + ' не поддерживается');
    return b;
  };
  return Buffer.concat([
    Buffer.from([LEAD_NODE]),
    pair(n.aMin), pair(n.aMax), writeLink(n.a, st),
    pair(n.bMin), pair(n.bMax), writeLink(n.b, st),
    writeLink(n.x79, st), E.encVarint(n.n42 || 0),
    writeLink(n.x7a, st), E.encVarint(n.n7b || 0),
  ]);
}

// Блок целиком. `blk` — его номер в каталоге: им засевается база дельта-кодека.
function writeBlock(m, blk) {
  const st = { x: blk, y: 0, base: blk, first: true };
  const parts = [writeHeader(m)];
  if (m.tile) parts.push(writeTile(m.tile, m.pois));
  for (const p of m.pois) parts.push(writePoi(p, m.width, st));
  for (const n of m.nodes || []) parts.push(writeNode(n, m.width, st));
  parts.push(Buffer.from([LEAD_END]));
  return Buffer.concat(parts);
}

// --- сборка модели из своих данных ------------------------------------------
//
// Названия и подробности сжимаются словарём, который строится по ним же
// (`litdict.build`). Подробности — строки с однобайтовым тегом: '0' индекс,
// '1' город, '2' улица, '3' дом, '4' телефон, '6' бренд, '7' кухня.
function detailText(p) {
  const lines = [];
  for (const [tag, key] of [['0', 'post'], ['1', 'city'], ['2', 'street'],
                            ['3', 'house'], ['4', 'phone'], ['6', 'brand'], ['7', 'food']])
    if (p[key] !== undefined && p[key] !== null && p[key] !== '') lines.push(tag + p[key]);
  return lines.length ? lines.join('\n') + '\n' : '';
}

// Опора блока — минимум по обеим осям, ширина — наименьшая из 8/12/16/24,
// в которую влезает размах. Так же устроены и заводские блоки: смещения там
// неотрицательные и укладываются в объявленную разрядность (проверено на
// 39 571 точке).
function fit(pois) {
  const xs = pois.map((p) => p.x), ys = pois.map((p) => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0);
  for (const w of [8, 12, 16, 24]) if (span < Math.pow(2, w)) return { x0, y0, width: w };
  throw new Error('размах ' + span + ' не влезает в 24 бита');
}

// Точки -> модель блока. Каждая точка: {x, y, cat, name, post, city, street,
// house, phone, brand, food, id, ref}.
function model(pois, opt) {
  const o = opt || {};
  const { x0, y0, width } = fit(pois);
  const texts = [];
  for (const p of pois) {
    texts.push(Buffer.from(p.name || '', 'utf8'));
    texts.push(Buffer.from(detailText(p), 'utf8'));
  }
  const dict = D.build(texts.filter((t) => t.length), o.dictLimit);
  const full = E.expandMap(dict), order = E.byLength(full);
  const out = [];
  for (const p of pois) {
    const det = Buffer.from(detailText(p), 'utf8');
    out.push({
      flags: F_FULL | (p.food !== undefined ? F_FOOD : 0),
      ref: p.ref || [o.refBlock === undefined ? 0 : o.refBlock, 0],
      xy: [p.x - x0, p.y - y0],
      cat: p.cat,
      name: E.compress(Buffer.from(p.name || '', 'utf8'), full, order),
      blob: Buffer.alloc(0),
      food: p.food,
      f73: 0,
      id: p.id,
      f216: 1,
      details: E.compress(det, full, order),
    });
  }
  return { origin: { x: x0, y: y0 }, width, byte2: 0,
           count: out.length + 1, dict, tile: { count: out.length }, pois: out };
}

module.exports = { readBlock, writeBlock, writeHeader, writeTile, writePoi,
                   writeNode, writeLink, model, detailText, fit,
                   LEAD_NODE, LEAD_TILE, LEAD_POI, LEAD_END, RESET,
                   F_FOOD, F_TAIL, F_FULL };

// Сверка: прочитать заводской блок в модель, собрать обратно и сравнить байты.
//
//   node src/litblock.js 112447        один блок
//   node src/litblock.js --scan 400    выборка блоков с точками интереса
if (require.main === module) {
  const lit = require('./lit');
  const fs = require('fs');
  const argv = process.argv.slice(2);
  const dirs = ['LIT', 'LIT2', 'LIT3', 'LIT4'].map((d) => path.join('maps/pkgdb', d));
  const l = lit.open(dirs);
  const pre = Buffer.alloc(8192);
  const fd = fs.openSync(l.vols[0].file, 'r');
  fs.readSync(fd, pre, 0, pre.length, 0);
  fs.closeSync(fd);
  const schema = S.load(l.vols[0].file, pre.indexOf(Buffer.from([0x4c, 0x69, 0x74, 0x02])));
  const cat = l.catalog();
  const one = (i, quiet) => {
    const b = l.block(cat[i]);
    let m;
    try { m = readBlock(schema, b, i); } catch (e) { return { why: 'не читается: ' + e.message }; }
    if (m.other.size) return { why: 'записи, которых писатель не знает: ' +
        [...m.other.keys()].map((v) => '0x' + v.toString(16)).join(',') };
    if (!m.tile && !m.nodes.length) return { why: 'не блок точек интереса и не блок узлов' };
    if (m.pois.some((p) => p.flags & F_TAIL)) return { why: 'есть хвостовые циклы' };
    let out;
    try { out = writeBlock(m, i); } catch (e) { return { why: 'не пишется: ' + e.message }; }
    const ok = out.length === b.length && out.equals(b);
    if (!ok && !quiet) {
      let k = 0;
      while (k < Math.min(out.length, b.length) && out[k] === b[k]) k++;
      console.log('  разошлось с байта %d: наш %s, их %s', k,
                  out.subarray(k, k + 12).toString('hex'), b.subarray(k, k + 12).toString('hex'));
    }
    return { ok, len: out.length, orig: b.length, pois: m.pois.length, nodes: m.nodes.length };
  };
  if (argv.includes('--scan')) {
    const want = Number(argv.find((a) => /^\d+$/.test(a)) || 400);
    const step = Math.max(1, Math.floor(120000 / want));
    const why = new Map();
    let n = 0, ok = 0;
    for (let i = 0; i < 120000; i += step) {
      const r = one(i, true);
      if (r.why) { why.set(r.why.split(':')[0], (why.get(r.why.split(':')[0]) || 0) + 1); continue; }
      n++; ok += Number(r.ok);
    }
    console.log('блоков с точками %d, собрано побайтово %d', n, ok);
    for (const [k, v] of [...why].sort((a, b) => b[1] - a[1])) console.log('   пропущено: %s ×%d', k, v);
  } else {
    const i = Number(argv[0] || 112447);
    const r = one(i);
    console.log('блок %d: %s', i, r.why ? r.why
      : (r.ok ? 'собран побайтово, ' + r.len + ' байт, точек ' + r.pois + ', узлов ' + r.nodes
              : 'РАЗОШЁЛСЯ: наш ' + r.len + ', их ' + r.orig));
  }
}
