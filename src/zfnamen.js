// Раздел ZF-NAMEN дорожного тайла: названия для ведения по маршруту.
//
// Сжатие снято с прошивки, FUN_08279074 («u_dekomprimieren», строка ошибки
// «XAC: Leertoken bei u_dekomprimieren»). Поток байт читается так:
//
//   код 1      следующий байт — литерал
//   код 2      конец имени
//   код 3      следующий байт n, дальше n литералов
//   коды 0,4,5 ошибка («FATAL: Code bei u_dekomprimieren»)
//   код >= 6   токен номер (код - 6) из таблицы ZF-TOKEN общего индекса:
//              байты токена до NUL; байт 0x02 внутри токена тоже кончает имя
//
// Общая приставка с предыдущим именем приходит в разборщик отдельным
// параметром — она лежит в младшем байте записи группы 1.
//
//   node src/zfnamen.js <база.db> [тайлов]     — отчёт об обратном проходе
'use strict';

const xac = require('./xac');

const STRIDE = 16;     // ключ группы 0 ставится на каждое шестнадцатое имя
const REC0 = 12;       // запись группы 0: восемь байт ключа и u32 смещения
const KEY = 8;
const TOK = 10;        // запись таблицы ZF-TOKEN

// Таблица токенов из общего индекса .xah. Возвращает массив Buffer.
function tokens(xahBuf) {
  const s = xac.sections(xahBuf).list.find((x) => x.name === 'ZF-TOKEN');
  if (!s) throw new Error('раздел ZF-TOKEN не найден');
  const t = xahBuf.subarray(s.offset, s.offset + s.total);
  const n = t.readUInt16BE(0x16);
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = 0x1c + i * TOK;
    let e = o;
    while (e < o + TOK && t[e] !== 0) e++;
    out.push(Buffer.from(t.subarray(o, e)));
  }
  out.stamp = t.readUInt32BE(0x18);        // печать таблицы, она же лежит в ZF-NAMEN +0x3c
  return out;
}

// Развернуть одно имя. Возвращает {text, end} либо {err}.
function decode(s, p, tok) {
  const out = [];
  let done = false;
  while (p < s.length && !done) {
    const c = s[p++];
    if (c === 1) {
      const b = s[p++];
      if (b === 2) break;
      out.push(b);
    } else if (c === 2) {
      done = true;
    } else if (c === 3) {
      let n = s[p++];
      while (n-- > 0) {
        const b = s[p++];
        if (b === 2) { done = true; break; }
        out.push(b);
      }
    } else if (c < 6) {
      return { err: 'код ' + c + ' на ' + (p - 1) };
    } else {
      const t = tok[c - 6];
      if (!t || !t.length) return { err: 'пустой токен ' + (c - 6) + ' на ' + (p - 1) };
      for (const b of t) {
        if (b === 2) { done = true; break; }
        out.push(b);
      }
    }
  }
  return { text: Buffer.from(out).toString('latin1'), end: p };
}

// Указатели для сборки: обычные токены и токены-с-концом.
// Токен, внутри которого есть 0x02, кончает имя — его можно ставить только
// последним, и оригинал именно так и делает: явный код 2 в потоке не
// встречается, вместо него идёт токен 0 («\x02») или токен вида «)\x02».
function tokenIndex(tok) {
  const plain = new Map(), final = new Map();
  for (let i = 0; i < tok.length; i++) {
    const at = tok[i].indexOf(2);
    if (at < 0) {
      const k = tok[i].toString('latin1');
      if (k && !plain.has(k)) plain.set(k, i);
    } else {
      const k = tok[i].toString('latin1', 0, at);
      if (!final.has(k)) final.set(k, i);
    }
  }
  return { plain, final };
}

// Собрать байты имени. На каждом шаге сначала пробуется токен-с-концом, целиком
// закрывающий остаток; иначе берётся самый длинный обычный токен; что не
// совпало — литералами (код 1 на один байт, код 3 на серию).
function encode(text, tok, index) {
  const idx = index || tokenIndex(tok);
  const buf = Buffer.from(text, 'latin1');
  const out = [];
  let lit = [];
  const flush = () => {
    let k = 0;
    while (k < lit.length) {
      const n = Math.min(lit.length - k, 255);
      if (n === 1) out.push(1, lit[k]);
      else { out.push(3, n); for (let j = 0; j < n; j++) out.push(lit[k + j]); }
      k += n;
    }
    lit = [];
  };
  let p = 0;
  while (p <= buf.length) {
    const rest = buf.toString('latin1', p);
    const fin = idx.final.get(rest);
    if (fin !== undefined && !lit.length) { out.push(fin + 6); return Buffer.from(out); }
    if (p === buf.length) break;
    let best = -1, bestLen = 0;
    for (let l = Math.min(TOK, buf.length - p); l >= 1; l--) {
      const id = idx.plain.get(buf.toString('latin1', p, p + l));
      if (id !== undefined) { best = id; bestLen = l; break; }
    }
    if (best < 0) { lit.push(buf[p]); p++; continue; }
    flush();
    out.push(best + 6);
    p += bestLen;
  }
  flush();
  const end = idx.final.get('');
  out.push(end === undefined ? 2 : end + 6);
  return Buffer.from(out);
}

// Разбор раздела. Возвращает модель или null, если это не ZF-NAMEN версии 3.
//
// Поток читается подряд: каждая запись — одно имя. Запись группы 1 даёт вид
// имени (старший байт) и длину общей приставки с предыдущим именем (младший).
// У больших разделов записей группы 1 больше, чем имён в потоке (например
// 1148 против 717) — это несоответствие не разгадано, см. docs/formats/zf.md.
function readSection(s, tok) {
  if (s.length < 0x4c || s.readUInt16BE(0x14) !== 3) return null;
  const at = (o) => s.readUInt32BE(o);
  const n0 = at(0x18), o0 = at(0x1c), o1 = at(0x28), c1 = at(0x30);
  const o2 = at(0x34), l2 = at(0x38);
  const names = [];
  let p = o2, prev = '', err = null;
  while (p < o2 + l2) {
    const r = decode(s, p, tok);
    if (r.err) { err = r.err; break; }
    const i = names.length;
    const kind = i < c1 ? s[o1 + i * 2] : 0;
    const pre = i < c1 ? s[o1 + i * 2 + 1] : 0;
    names.push({ text: prev.slice(0, pre) + r.text, tail: r.text, prefix: pre, kind,
                 at: p - o2, raw: Buffer.from(s.subarray(p, r.end)) });
    prev = names[i].text;
    p = r.end;
  }
  const keys = [];
  for (let i = 0; i < n0; i++) {
    keys.push({ key: s.toString('latin1', o0 + i * REC0, o0 + i * REC0 + KEY).replace(/\0+$/, ''),
                offset: at(o0 + i * REC0 + KEY) });
  }
  return {
    names, keys, count: c1, stamp: at(0x3c), err, clean: !err && names.length === c1,
    fields: { f18: at(0x18), f24: at(0x24), f40: at(0x40), f48: at(0x48) },
    stream: Buffer.from(s.subarray(o2, o2 + l2)),
    group3: { count: at(0x40), data: Buffer.from(s.subarray(at(0x44), at(0x44) + at(0x48))) },
    size: s.length,
  };
}

// Собрать раздел из списка имён. Имя = {text, kind}; порядок сохраняется —
// по нему идёт двоичный поиск, и менять его нельзя.
//
// Ключ ставится на каждое шестнадцатое имя: в настоящих разделах ключей ровно
// ceil(имён / 16), и смещение ключа j попадает на имя 16j.
function buildSection(names, tok, opt) {
  opt = opt || {};
  const idx = tokenIndex(tok);
  const parts = [], meta = Buffer.alloc(names.length * 2), keys = [];
  let prev = '', at = 0;
  for (let i = 0; i < names.length; i++) {
    const text = names[i].text;
    let pre = 0;
    while (pre < 255 && pre < prev.length && pre < text.length && prev[pre] === text[pre]) pre++;
    if (opt.prefixes) pre = opt.prefixes[i];
    if (i % STRIDE === 0) {
      const k = Buffer.alloc(REC0);
      k.write(text.slice(0, KEY), 0, KEY, 'latin1');
      k.writeUInt32BE(at, KEY);
      keys.push(k);
    }
    const b = opt.raw ? opt.raw[i] : encode(text.slice(pre), tok, idx);
    parts.push(b);
    meta[i * 2] = names[i].kind === undefined ? 0 : (names[i].kind & 0xff);
    meta[i * 2 + 1] = pre;
    at += b.length;
    prev = text;
  }
  const stream = Buffer.concat(parts);
  const o0 = 0x4c, l0 = keys.length * REC0;
  const o1 = o0 + l0, l1 = meta.length;
  const gap = (4 - ((o1 + l1) % 4)) % 4;          // поток выровнен на четыре байта
  const o2 = o1 + l1 + gap, l2 = stream.length;
  const tail = opt.group3 || { count: 0, data: Buffer.alloc(0) };
  let out = Buffer.concat([Buffer.alloc(0x4c)].concat(keys)
    .concat([meta, Buffer.alloc(gap), stream]));
  while (out.length % 4) out = Buffer.concat([out, Buffer.alloc(1)]);
  const o3 = out.length;
  out = Buffer.concat([out, tail.data]);
  out.write('ZF-NAMEN        ', 0, 16, 'latin1');
  out.writeUInt32BE(out.length - 20, 0x10);
  out.writeUInt16BE(3, 0x14);
  out.writeUInt32BE(keys.length, 0x18);
  out.writeUInt32BE(o0, 0x1c); out.writeUInt32BE(l0, 0x20); out.writeUInt32BE(names.length, 0x24);
  out.writeUInt32BE(o1, 0x28); out.writeUInt32BE(l1, 0x2c); out.writeUInt32BE(names.length, 0x30);
  out.writeUInt32BE(o2, 0x34); out.writeUInt32BE(l2, 0x38);
  out.writeUInt32BE(tok.stamp === undefined ? 0x363da028 : tok.stamp, 0x3c);
  out.writeUInt32BE(tail.count, 0x40);
  out.writeUInt32BE(o3, 0x44);
  out.writeUInt32BE(tail.data.length, 0x48);
  out.writeUInt32BE(out.length - 20, 0x10);
  return out;
}

module.exports = { tokens, decode, encode, tokenIndex, readSection, buildSection,
                   STRIDE, REC0, KEY, TOK };

if (require.main === module) {
  const fldb = require('./fldb');
  const db = fldb.open(process.argv[2] || 'maps/pkgdb/XAC/kN221EUx01_0.db');
  const list = fldb.entries(db);
  const tok = tokens(fldb.read(db, list.find((x) => /\.xah$/i.test(x.name))));
  const idx = tokenIndex(tok);
  console.log('таблица ZF-TOKEN: %d токенов, печать %s', tok.length, tok.stamp.toString(16));
  const tiles = list.filter((x) => /\.xac$/i.test(x.name));
  const step = Math.max(1, Math.floor(tiles.length / Number(process.argv[3] || 200)));
  let secs = 0, clean = 0, fail = 0, names = 0;
  let keysOk = 0, keysAll = 0, encSame = 0, encAll = 0, same = 0;
  for (let i = 0; i < tiles.length; i += step) {
    const buf = fldb.read(db, tiles[i]);
    const sec = xac.sections(buf).list.find((x) => x.name === 'ZF-NAMEN');
    if (!sec) continue;
    const s = buf.subarray(sec.offset, sec.offset + sec.total);
    const m = readSection(s, tok);
    if (!m) continue;
    secs++;
    if (m.err) fail++;
    if (m.clean) clean++;
    names += m.names.length;
    const o2 = s.readUInt32BE(0x34);
    for (const k of m.keys) {
      keysAll++;
      const r = decode(s, o2 + k.offset, tok);
      if (!r.err && r.text.slice(0, KEY) === k.key) keysOk++;
    }
    for (const n of m.names) {
      encAll++;
      if (encode(n.tail, tok, idx).equals(n.raw)) encSame++;
    }
    if (m.clean) {
      const back = buildSection(m.names, tok,
        { prefixes: m.names.map((n) => n.prefix), raw: m.names.map((n) => n.raw),
          group3: m.group3 });
      if (back.equals(s)) same++;
    }
  }
  console.log('разделов %d: имён %d, сбоев разбора %d', secs, names, fail);
  console.log('  записей группы 1 столько же, сколько имён в потоке: %d (%s%%)',
    clean, (100 * clean / secs).toFixed(1));
  console.log('  ключи группы 0 совпали с раскрытыми именами: %d из %d (%s%%)',
    keysOk, keysAll, (100 * keysOk / keysAll).toFixed(2));
  console.log('  имя сжимается в те же байты, что в оригинале: %d из %d (%s%%)',
    encSame, encAll, (100 * encSame / encAll).toFixed(2));
  console.log('  раздел собран байт в байт: %d из %d согласованных', same, clean);
}
