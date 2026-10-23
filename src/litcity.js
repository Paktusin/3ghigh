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
// Узел 0x33: витки «0x49 селектор, 0x3c куда»; селектор в данных — приращение
// к предыдущему витку (правило 0x49 с флагом ADD, FUN_08cc7b3c), здесь он уже
// сложен. Номер селектора — критерий описания места «Имя\t#N»: 1 Name,
// 2 POI Kategorie, 9 PhoneNumber, 16 Geopos, 18 OriginalName, 20 Oberkategorie
// (строки 0x093f7f34…, 0x09577e10…; LiPoiAh — 0x085a02a2). Уровень поиска
// 7…18 — нечётный вид 0x10 (узел), чётный — по селектору: {2,3,4,13,14,15,17,
// 19,20,22,23,24,25} и 600…799 -> снова узел (вид 0x12), прочие -> список имён
// (вид 0x11) (FUN_08ccdd2c, FUN_08cd05c0). У завода страна — 9 телефоны,
// 18 названия, 20 категории (все 46 стран EU), город — 1 названия, 20
// категории (Валлетта, Ватикан 176815:238). Имя с несколькими точками ведёт в
// узел 0x33: [16 -> 0x34] (Мальта, geo34) или [1 -> 0x31] (Ватикан 176815:4 -> :7 -> :10).
function elAt(get, pos) {
  const g = get(pos[0]);
  const e = g.map.get(pos[1]);
  return e || null;
}
function selectors(get, pos) {
  const g = get(pos[0]);
  const i = g.els.findIndex((e) => e.key === pos[1]);
  if (i < 0 || g.els[i].type !== 0x33) return null;
  let sel = g.els[i].f['49'];
  const out = [{ sel, target: g.els[i].f['3c'] }];
  for (let j = i + 1; j < g.els.length && g.els[j].loop && g.els[j].type === 0x33; j++)
    out.push({ sel: (sel += g.els[j].f['49']), target: g.els[j].f['3c'] });
  return out;
}
// Точки имени под узлом 0x33 [16 -> 0x34] — путь CLwtLitAccess::goToPoiGeoIndex
// (FUN_08f098ac -> FUN_08ccd298: критерий 0x10 -> FUN_08cdae88). Запись 0x34
// с битом 1 флагов (b1) — узел: дети 0x5f и 0x62 в очередь, у левого предел —
// начало правого. Лист: витки записи (FUN_08cc7b3c), затем стоп, если поле
// 0x2b (бит 6, +0x614) не ноль, иначе следующая запись (FUN_08ccece8), пока
// она 0x34 и стоит до предела. Ответ — {pts: [{pos, xy}], total: 0x65, bad}.
function geo34(get, pos) {
  const rep = { pts: [], total: null, bad: [] };
  const before = (p, lim) => !lim || p[0] < lim[0] || (p[0] === lim[0] && p[1] < lim[1]);
  const queue = [{ pos, lim: null }];
  for (let guard = 0; queue.length && guard < 100000; guard++) {
    const { pos: p, lim } = queue.pop();
    let blk = p[0], g = get(blk);
    let i = g.els.findIndex((e) => e.key === p[1] && !e.loop);
    if (i < 0 || g.els[i].type !== 0x34) { rep.bad.push('не 0x34 ' + p); continue; }
    if (rep.total === null) rep.total = g.els[i].f['65'];
    const head = g.els[i];
    if (head.b1 & 2) { queue.push({ pos: head.f['62'], lim }, { pos: head.f['5f'], lim: head.f['62'] }); continue; }
    for (;;) {
      const e = g.els[i];
      for (let j = i; j < g.els.length && (j === i || g.els[j].loop); j++) {
        const x = g.els[j];
        if (!x.f['3c']) continue;
        rep.pts.push({ pos: x.f['3c'], xy: [x.f['22'][0] + g.origin[0], x.f['22'][1] + g.origin[1]] });
      }
      if (e.b1 & 0x40) break;
      do i++; while (i < g.els.length && g.els[i].loop);
      if (i >= g.els.length) { g = get(++blk); i = 0; }
      const nx = g.els[i];
      if (!nx || nx.type !== 0x34 || !before([blk, nx.key], lim)) break;
    }
  }
  return rep;
}
const POI_NODE_SELS = new Set([2, 3, 4, 13, 14, 15, 17, 19, 20, 22, 23, 24, 25]);
function poisOf(get, target, out, depth) {
  const e = elAt(get, target);
  if (!e) { out.bad.push('нет ' + target); return; }
  if (e.type === 0x24) { out.pois.add(target.join(':')); return; }
  if (e.type === 0x33 && (depth || 0) < 4) {
    const ss = selectors(get, target);
    const z = ss.find((x) => x.sel === 16);
    if (z) {                                   // точки одного имени: 0x34
      const r = geo34(get, z.target);
      out.multiNames = (out.multiNames || 0) + 1;
      out.bad.push(...r.bad);
      if (r.total !== r.pts.length) out.bad.push('0x34 ' + z.target + ': 0x65 = ' + r.total + ', прочитано ' + r.pts.length);
      for (const p of r.pts) {
        const q = elAt(get, p.pos);
        if (!q || q.type !== 0x24) { out.bad.push('0x34: не точка ' + p.pos); continue; }
        // пара 0x22 витка от опоры его блока — та же точка, что пара 0x22 самой 0x24
        const og = get(p.pos[0]).origin;
        if (q.f['22'][0] + og[0] !== p.xy[0] || q.f['22'][1] + og[1] !== p.xy[1]) out.bad.push('0x34: координата не та ' + p.pos);
        out.pois.add(p.pos.join(':'));
        out.multi = (out.multi || 0) + 1;
      }
      return;
    }
    const s = ss.find((x) => x.sel === 1);
    if (!s) { out.bad.push('0x33 без селектора 1 и 16 ' + target); return; }
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

// Поиск по категории (LiPoiAh: «Oberkategorie\t#20» -> «POI Kategorie\t#2»,
// FUN_0813f45c сверяет предпоследний критерий с «Type\t#2» / «Category\t#20»):
// узел 0x33 -> 20 -> узел групп -> группа: узел [2 -> узел категорий,
// sel -> названия точек группы] -> категория: узел [sel -> названия её точек].
// sel — 18 у страны, 1 у города. Ответ: группы {номер -> {pois, cats}} и
// категории {номер -> pois} (позиции точек «блок:ключ»).
function catSearch(get, node, sel) {
  const rep = { groups: new Map(), cats: new Map(), bad: [] };
  const pick = (pos, s) => {
    const x = ((pos && selectors(get, pos)) || []).find((y) => y.sel === s);
    if (!x) rep.bad.push('нет селектора ' + s + ' в ' + pos);
    return x ? x.target : null;
  };
  const pois = (list) => {
    const o = { pois: new Set(), bad: rep.bad };
    if (list) for (const x of enumerate(get, list, null, 1e6).out) poisOf(get, x.target, o);
    return o.pois;
  };
  const top = pick(node, 20);
  for (const g of (top && selectors(get, top)) || []) {
    const sub = pick(g.target, 2);
    const ent = { pois: pois(pick(g.target, sel)), cats: [] };
    for (const c of (sub && selectors(get, sub)) || []) {
      ent.cats.push(c.sel);
      // у каждой группы своя копия категории (как у завода) — точки те же
      const ps = pois(pick(c.target, sel)), was = rep.cats.get(c.sel);
      if (!was) rep.cats.set(c.sel, ps);
      else if (was.size !== ps.size || [...ps].some((x) => !was.has(x)))
        rep.bad.push('категория ' + c.sel + ' в группе ' + g.sel + ': точки не те, что в первой');
    }
    rep.groups.set(g.sel, ent);
  }
  return rep;
}

// Дома улицы (запись 0x07, бит 4 ведущего -> вызов 0x1002). Прочитано в коде:
//
//   FUN_08cd7490, вид 7   у выбранной улицы узел-ребёнок вида 10 (дома) — только
//                         если FUN_08ccb09c: запись типа 5/6/7/0x10 и счётчик
//                         домов (+0x4f8+0xf0) не ноль; в узел +0xb4/+0xb8 — мин. и
//                         макс. номер (FUN_08ccb0d4/FUN_08ccb10c -> FUN_08ccf230)
//   FUN_08ccefac          очередная группа: поля 0x32 вид, 0x31 от, 0x30 до; или
//                         короткая форма 0x203: вид = v & 3, от = v >> 2; вид 0 —
//                         до = от, иначе до = от + следующее значение 0x203; вид
//                         1 — оба ×2, вид 2 — ×2 + 1 (чётные/нечётные)
//   FUN_08ccb340          строка диапазона: «%ld», «e%ld-%ld», «o%ld-%ld»,
//                         «%ld-%ld» через запятую (то, что уходит в HMI как
//                         LI_SP_HouseNumberRange)
//   FUN_08ccacb8 /
//   FUN_08ccf41c          номер принят, если попал хоть в одну группу: вид 0 —
//                         равен, 1 — в рамке и чётный, 2 — нечётный, 3 — в рамке
// Длинная форма (бит 6 флагов: поля 0x31/0x30/0x32, текст 0x8a, точка 0x22)
// здесь не читается — мы её не пишем.
function houses(e) {
  if (!e || e.type !== 7 || !(e.lead & 0x10)) return null;
  const v = [e.f['203']].concat(e.f['203*'] || []).filter((x) => x !== undefined);
  const out = [];
  for (let i = 0; i < v.length; i++) {
    const kind = v[i] & 3;
    let from = v[i] >> 2, to = from;
    if (kind) {
      if (i + 1 >= v.length) return { groups: out, bad: 'нет второго значения у вида ' + kind };
      to = from + v[++i];
      if (kind < 3) { from = from * 2 + kind - 1; to = to * 2 + kind - 1; }
    }
    out.push({ kind, from, to });
  }
  const text = out.map((g) => (g.kind === 0 ? '' + g.from : (g.kind === 1 ? 'e' : g.kind === 2 ? 'o' : '') +
                                                     g.from + '-' + g.to)).join(',');
  return { groups: out, text, min: Math.min(...out.map((g) => g.from)), max: Math.max(...out.map((g) => g.to)) };
}
function houseOk(h, n) {
  return h.groups.some((g) => (g.kind === 0 ? n === g.from : n >= g.from && n <= g.to &&
                                (g.kind === 3 || (n & 1) === (g.kind === 2 ? 1 : 0))));
}

module.exports = { enumerate, cities, countryByCode, selectors, geo34, poisOf, poiSearch, catSearch, houses, houseOk };

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
