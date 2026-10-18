// Элементы блока LIT в нумерации прошивки — по КЛЮЧАМ позиции (блок, ключ).
//
// Правило нумерации (проверено: число ключей совпало с u16 заголовка блока у
// 205 блоков EU из 205 и 112 блоков AU из 112, а все ссылки внутри блоков
// попадают в начала записей нужных типов):
//
//   * структура верхнего уровня со своим типом занимает ключ K;
//   * если у неё есть цикл 0xa2 (повторяющаяся группа), то виток i — это
//     ключ K + 1 + i, и вся структура съедает n + 1 ключ;
//   * структуры, вызванные изнутри (0x1001…0x1003, уровень > 0), ключей не
//     занимают.
//
// В коде это видно по `FUN_08cce9ec`: текущий ключ = база + номер витка + 1,
// а без витка — база + 1.
'use strict';

const lit = require('./lit');
const N = require('./litnames');
const V = require('./litvm');
const D = require('./litdict');

// Разобрать блок. Возвращает элементы: {key, keys?, type, loop, lead, b1, f, name}.
// f — поля по типу (шестнадцатеричная строка), повторы — в `тип*`.
function keyed(schema, block, blk) {
  const els = [];
  let cur = null, K = -1, next = 0, lead = 0;
  const r = V.run(schema, block, 0, {
    blk, limit: 4000000,
    onKey: (k) => {
      if (k.lvl > 0) return;
      if (!k.loop) {
        K = next; next = K + 1;
        cur = { key: K, type: k.type, loop: false, at: k.at, lead, f: {} };
        els.push(cur);
        return;
      }
      const key = K + 1 + k.iter;
      next = key + 1;
      if (k.iter === 0) { cur.keys = [K, key]; return; }     // первый виток — в той же записи
      cur = { key, type: k.type, loop: true, at: k.at, f: {} };
      els.push(cur);
    },
    tap: (t) => {
      if (t.rule === 18) { lead = t.val; return; }
      if (!cur) return;
      if (!cur.loop && cur.b1 === undefined && (t.rule === 287 || t.rule === 195 || t.rule === 165)) cur.b1 = t.val;
      if (!t.type) return;
      const h = t.type.toString(16);
      let v;
      if (t.op === 0x41) v = [t.x, t.y];
      else if (t.op === 0x40) v = t.pair;
      else if (t.op === 0x44 || t.op === 0x42 || t.op === 0x43) v = block.subarray(t.at, t.end);
      else v = t.val;
      if (cur.f[h] !== undefined) (cur.f[h + '*'] = cur.f[h + '*'] || []).push(v);
      else cur.f[h] = v;
    },
  });
  // названия: та же склейка приставок, что в litnames
  const items = r.strings.filter((s) => s.type === 0x3b).sort((a, b) => a.at - b.at);
  const byAt = new Map();
  let prev = Buffer.alloc(0);
  for (const it of items) {
    const raw = Buffer.concat([prev.subarray(0, Math.min(it.pre, prev.length)), it.txt]);
    byAt.set(it.at, D.expand(r.codes, raw).toString('utf8'));
    prev = raw;
  }
  for (const e of els) {
    const v = e.f['3b'];
    if (Buffer.isBuffer(v)) e.name = byAt.get(v.byteOffset - block.byteOffset);
  }
  const count = block.readUInt16BE(0);
  return { els, run: r, count, next };
}

// Карта ключ -> элемент (первый виток доступен и по своему ключу).
function index(els) {
  const m = new Map();
  for (const e of els) {
    m.set(e.key, e);
    if (e.keys) m.set(e.keys[1], Object.assign({}, e, { loop: true, first: true }));
  }
  return m;
}

function open(dirs) {
  const L = lit.open(dirs);
  const schema = N.schemaOf(L.vols[0].file);
  const cat = L.catalog();
  const cache = new Map();
  const get = (i) => {
    if (!cache.has(i)) {
      const k = keyed(schema, L.block(cat[i]), i);
      k.map = index(k.els);
      cache.set(i, k);
    }
    return cache.get(i);
  };
  return { L, schema, cat, get };
}

// Типы точек, которые карта вообще рисует: поле 0x49 шапки POI (структура 0x20,
// первые «поле 0x44» витков; дальше — слои). По ним CLitPoiTileDb строит тайлы
// точек (docs/formats/xar.md): точка другого типа на карту не попадает, даже
// если стиль у типа есть. null — шапки нет.
function mapTypes(dir) {
  const o = open([dir]);
  for (let i = 0; i < o.cat.length; i++) {
    const k = o.get(i);
    if (!k.els.length || k.els[0].type !== 0x20) continue;
    const n = k.els[0].f['44'] !== undefined ? k.els[0].f['44'] : 58;
    const t = k.els.slice(1).map(e => e.f && e.f['49']).filter(v => v !== undefined);
    return new Set(t.slice(0, n));
  }
  return null;
}

module.exports = { keyed, index, open, mapTypes };

if (require.main === module) {
  const [dirs, bi, from, to] = process.argv.slice(2);
  const o = open((dirs || 'maps/pkgdb/LIT').split(','));
  const g = o.get(Number(bi || 0));
  console.log('блок %s: ключей %d (в заголовке %d), разбор: %s', bi || 0, g.next, g.count, g.run.why);
  const fmt = (v) => Buffer.isBuffer(v)
    ? (/^[\x20-\x7e]*$/.test(v.toString('latin1')) && v.length < 20 ? "'" + v.toString('latin1') + "'" : 'b' + v.length)
    : v;
  for (const e of g.els) {
    if (e.key < Number(from || 0) || e.key > Number(to || 40)) continue;
    const f = {};
    for (const [k, v] of Object.entries(e.f)) f[k] = Array.isArray(v) && v.some(Buffer.isBuffer) ? v.map(fmt) : fmt(v);
    console.log(e.key + ' t' + e.type.toString(16) + (e.loop ? 'L' : e.keys ? '+' : ' ') + ' ' +
                (e.name !== undefined ? JSON.stringify(e.name) + ' ' : '') + JSON.stringify(f).slice(0, 300));
  }
}
