// Эмулятор пути прошивки «страна -> список городов» по LIT (см. docs/formats/lit.md,
// раздел «Путь списка городов по коду»). Повторяет решения кода, а не наш писатель:
//
//   FUN_08cda414 / FUN_08cd38c0   корень (0,0) — структура 0x01; узел корня
//                                 перечисляет витки по языкам, при вводе адреса
//                                 глубже страны берётся виток 0 (local_28 = 0)
//   FUN_08cd7490, вид 1           виток -> узел вида 2 (список названий стран)
//   FUN_08cd5360                  имя страны ищется в этом списке
//   FUN_08cd7490, вид 2 /
//   FUN_08cd2118                  по ссылке имени — запись, она обязана быть 0x02
//                                 (`+0x17e0 == 2`); первая ссылка 0x36 (w3 = 4)
//                                 -> узел вида 4, его граница +0x94 — поле 0x2b
//   FUN_08cd5d10 (тип 1) /
//   FUN_08cd4400                  перечисление: у индекса 0x32 — с его 0x2d,
//                                 дальше имена подряд; в следующую запись — только
//                                 если она 0x30/0x31/0x32 с полем 0x38 == 0 (бит 0
//                                 ведущего), и не дальше позиции 0x2b
//   FUN_08cd439c                  фильтр имени: при режиме 0 узла проходят все
'use strict';

const KS = require('./litkeys');

// Перечислить имена списка начиная с позиции pos (FUN_08cd5d10 + FUN_08cd4400).
function enumerate(get, pos, last, limit) {
  const out = [];
  let g = get(pos[0]);
  let i = g.els.findIndex((e) => e.key === pos[1] || (e.keys && e.keys[0] === pos[1]));
  if (i < 0) return { out, why: 'нет элемента ' + pos };
  let e = g.els[i];
  if (e.type === 0x32) {                       // индекс: начать с его первого имени (0x2d)
    const first = e.f['2d'];
    g = get(first[0]);
    i = g.els.findIndex((x) => x.key === first[1] || (x.keys && x.keys[1] === first[1]));
    if (i < 0) return { out, why: '0x2d индекса никуда' };
  } else if (e.type !== 0x30 && e.type !== 0x31) return { out, why: 'не список: 0x' + e.type.toString(16) };
  let started = false, blk = g === get(pos[0]) ? pos[0] : null;
  if (blk === null) blk = e.type === 0x32 ? e.f['2d'][0] : pos[0];
  for (;;) {
    for (; i < g.els.length; i++) {
      const x = g.els[i];
      if (!x.loop) {
        if (started) {
          // следующая запись: продолжаем только в список с 0x38 == 0
          // вложенный индекс (0xda, бит 0 сброшен) лежит между списками —
          // пропускается; верхний (0xd9, бит 0 = 1) — уже чужая группа. Так у
          // Мальты 93227: индексы почты (1) и городов (96) — 0xd9 вплотную за
          // списками соседа, вложенные 0xda (700, 721…) — между своими списками
          if (x.type === 0x32 && !(x.lead & 1)) continue;
          if ((x.type !== 0x30 && x.type !== 0x31) || (x.lead & 1)) return { out, why: 'конец списка' };
        }
        started = true;
      }
      if (x.type !== 0x30 && x.type !== 0x31) continue;
      const key = x.keys ? x.keys[1] : x.key;
      if (last && (blk > last[0] || (blk === last[0] && key > last[1]))) return { out, why: 'граница 0x2b' };
      out.push({ name: x.name, key, blk, target: x.f['3c'] });
      if (limit && out.length >= limit) return { out, why: 'предел' };
    }
    // FUN_08ccece8: следующая запись может лежать уже в следующем блоке
    try { g = get(++blk); } catch (err) { return { out, why: 'конец тома' }; }
    i = 0;
  }
}

// Страна -> города, как ввод цели. dirs — каталоги тома LIT.
function cities(dirs, country) {
  const o = KS.open(dirs);
  const get = (b) => o.get(b);
  const rep = { country, steps: [], cities: [] };
  const root = get(0).map.get(0);
  if (!root || root.type !== 1) { rep.steps.push('(0,0) не корень 0x01'); return rep; }
  const list0 = root.f['3c'];                   // виток 0 корня: список всех названий
  rep.steps.push('корень 0x01, виток 0 -> ' + list0);
  const names = enumerate(get, list0, null, 5000).out;
  const hit = names.find((x) => x.name === country);
  if (!hit) { rep.steps.push('«' + country + '» нет в списке витка 0 (' + names.length + ' имён)'); return rep; }
  const c = get(hit.target[0]).map.get(hit.target[1]);
  rep.steps.push('«' + country + '» -> ' + hit.target + ': запись 0x' + (c ? c.type.toString(16) : '??'));
  if (!c || c.type !== 2) { rep.steps.push('FUN_08cd2118: запись не 0x02 — узлов-детей нет'); return rep; }
  const ref = c.f['36'], last = c.f['2b'];
  if (!ref || ref[0] < 0) { rep.steps.push('у страны нет 0x36 вида 4'); return rep; }
  rep.code = c.f['201'];
  const r = enumerate(get, ref, last && last[0] >= 0 ? last : null, 100000);
  rep.steps.push('вид 4 -> ' + ref + ', граница 0x2b ' + last + ': имён ' + r.out.length + ' (' + r.why + ')');
  for (const x of r.out) {
    const t = x.target && get(x.target[0]).map.get(x.target[1]);
    rep.cities.push({ name: x.name, target: x.target, type: t ? t.type : null });
  }
  o.L.vols.forEach((v) => require('fs').closeSync(v.fd));
  return rep;
}

// FUN_08ccd098 (вызывается из CLwtLocDescTransform, FUN_08f0ee68, когда страна
// в описании места записана как «имя\t#код язык»): идти по общей таблице корня
// (0x54, счёт 0x40) до записи 0x18 с номером 7000 и кодом страны в байтах 4–5;
// байты 0–1 — блок, 2–3 — ключ записи страны. Затем в списке названий стран
// языка `lang` (виток корня) искать имя, чья ссылка ведёт ровно туда. Не нашлось —
// FUN_08f0ee68 стирает страну в описании места.
function countryByCode(dirs, code, lang) {
  const own = Array.isArray(dirs);
  const o = own ? KS.open(dirs) : dirs;           // можно передать уже открытый KS.open
  const get = (b) => o.get(b);
  const root = get(0).map.get(0);
  const rep = { code, lang };
  const start = root.f['54'], count = root.f['40'];
  let blk = start[0], g = get(blk);
  let i = g.els.findIndex((e) => e.key === start[1]);
  let seen = 0, hit = null;
  while (seen < count && !hit) {
    if (i >= g.els.length) { g = get(++blk); i = 0; continue; }
    const e = g.els[i++];
    seen++;
    if (e.type !== 0x18 || e.f['21'] !== 7000) continue;
    const b = Buffer.from(e.f['20']);
    // блок: младшие 16 бит + (старшие биты << 13 во втором слове), ключ — младшие 13
    if (b.readUInt16BE(4) === code) hit = [b.readUInt16BE(0) | ((b.readUInt16BE(2) >>> 13) << 16), b.readUInt16BE(2) & 0x1fff];
  }
  rep.records = seen;
  if (!hit) {
    rep.why = 'кода ' + code + ' нет в наборе стран 7000';
    if (own) o.L.vols.forEach((v) => require('fs').closeSync(v.fd));
    return rep;
  }
  rep.pos = hit;
  const iters = [root].concat(get(0).els.filter((x) => x.loop && x.type === 1));
  const it = iters[lang];
  const list = enumerate(get, it.f['3c'], null, 100000).out;
  const m = list.find((x) => x.target && x.target[0] === hit[0] && x.target[1] === hit[1]);
  rep.name = m ? m.name : null;
  rep.why = m ? 'ок' : 'в списке языка нет имени с такой ссылкой';
  if (own) o.L.vols.forEach((v) => require('fs').closeSync(v.fd));
  return rep;
}

// Поиск POI по названию (вид 0x10 -> узел 0x33 -> список названий -> точка).
// Узел 0x33: витки «0x49 селектор, 0x3c куда»; уровень поиска 7…18 — нечётный
// вид 0x10 (узел), чётный — по селектору: {2,3,4,13,14,15,17,19,20,22,23,24,25}
// и 600…799 -> снова узел (вид 0x12), прочие -> список имён (вид 0x11)
// (FUN_08ccdd2c, FUN_08cd05c0). Какой виток выбирает интерфейс — из кода не
// дочитано; у завода порядок постоянный: страна — 9 телефоны, 9 названия, 2
// категории (Ватикан 176815:0, Мальта 245455:0), город — 1 названия (Валлетта
// 245484:2188). Имя с несколькими точками ведёт в узел 0x33 с селектором 1 ->
// список 0x31 точек (Ватикан 176815:4 -> :7 -> :10).
function elAt(get, pos) {
  const g = get(pos[0]);
  const e = g.map.get(pos[1]);
  return e || null;
}
function selectors(get, pos) {
  const g = get(pos[0]);
  const i = g.els.findIndex((e) => e.key === pos[1]);
  if (i < 0 || g.els[i].type !== 0x33) return null;
  const out = [{ sel: g.els[i].f['49'], target: g.els[i].f['3c'] }];
  for (let j = i + 1; j < g.els.length && g.els[j].loop && g.els[j].type === 0x33; j++)
    out.push({ sel: g.els[j].f['49'], target: g.els[j].f['3c'] });
  return out;
}
const POI_NODE_SELS = new Set([2, 3, 4, 13, 14, 15, 17, 19, 20, 22, 23, 24, 25]);
function poisOf(get, target, out, depth) {
  const e = elAt(get, target);
  if (!e) { out.bad.push('нет ' + target); return; }
  if (e.type === 0x24) { out.pois.add(target.join(':')); return; }
  if (e.type === 0x33 && (depth || 0) < 4) {
    const s = selectors(get, target).find((x) => x.sel === 1);
    if (!s) { out.bad.push('0x33 без селектора 1 ' + target); return; }
    for (const x of enumerate(get, s.target, null, 100000).out) poisOf(get, x.target, out, (depth || 0) + 1);
    return;
  }
  out.bad.push('0x' + e.type.toString(16) + ' вместо точки ' + target);
}
// node — позиция узла 0x33; sel — селектор; nth — который из витков с ним.
function poiSearch(get, node, sel, nth) {
  const rep = { names: 0, pois: new Set(), bad: [], sample: [] };
  const ss = selectors(get, node);
  if (!ss) { rep.bad.push('не узел 0x33 ' + node); return rep; }
  const s = ss.filter((x) => x.sel === sel)[nth || 0];
  if (!s) { rep.bad.push('нет селектора ' + sel); return rep; }
  if (POI_NODE_SELS.has(sel) || (sel >= 600 && sel < 800)) { rep.bad.push('селектор ' + sel + ' — узел, не список'); return rep; }
  const list = enumerate(get, s.target, null, 1000000);
  rep.names = list.out.length;
  rep.why = list.why;
  for (const x of list.out) {
    if (rep.sample.length < 3) rep.sample.push(x.name);
    poisOf(get, x.target, rep);
  }
  rep.pois = rep.pois.size;
  return rep;
}

module.exports = { enumerate, cities, countryByCode, selectors, poiSearch };

if (require.main === module) {
  const [dirs, country] = process.argv.slice(2);
  const r = cities((dirs || 'out/cyprus/pkgdb/LIT').split(','), country || 'CYPRUS');
  for (const s of r.steps) console.log(s);
  const bad = r.cities.filter((c) => c.type !== 3);
  console.log('городов: ' + r.cities.length + ', из них не 0x03: ' + bad.length);
  console.log(r.cities.slice(0, 12).map((c) => c.name).join(' | '));
  if (process.argv[4]) {
    const c = countryByCode((dirs || 'out/cyprus/pkgdb/LIT').split(','), Number(process.argv[4]), Number(process.argv[5] || 2));
    console.log('FUN_08ccd098(код ' + c.code + ', язык ' + c.lang + '): записей таблицы пройдено ' + c.records +
                ', позиция ' + c.pos + ', имя «' + c.name + '» — ' + c.why);
  }
}
