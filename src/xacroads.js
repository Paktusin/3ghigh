'use strict';
// Дорожная сеть из GeoJSON в дорожный тайл `.xac`.
//
//   node src/xacroads.js <дороги.geojson> --out <файл.xac> [ключи]
//
// Ключи:
//   --classes motorway,trunk,primary   какие классы OSM брать (по умолчанию все)
//   --zen <файл.bin>   выложить раздел ZE-NAMEN отдельным файлом
//   --places <файл>    города с координатами: [{ name, lon, lat }] — дерево
//                      ZE-NAMEN-MMI «страна -> город -> улица»
//   --country-name CYPRUS   корень дерева
//   --houses <файл.osm.pbf> номера домов: садятся на ближайший отрезок своей
//                      улицы и уходят в раздел HAUSNUMMERN
//   --no-names         собрать тайл без разделов имён
//   --code CY00        код тайла            --index 3776   номер в реестре
//   --country 113      код страны (Кипр)    --base 0       сквозной номер первого блока
//   --max-nodes 9000   потолок узлов в блоке (у завода не больше 9962)
//   --room 1.45        запас длины раздела: во столько раз длиннее наших байт
//   --quiet            без отчёта
//
// Что здесь происходит и почему именно так.
//
// Узел — это точка ломаной, приведённая к единицам карты (X = долгота·72000,
// Y = широта·(40000000/360)). Две точки с одинаковыми единицами — один узел:
// шаг единицы это 1,5 м по долготе и 1 м по широте, и без склейки перекрёстки
// OSM остались бы разорванными.
//
// Ребро хранится ОДИН раз, записью вектора у одного конца; второй конец держит
// встречную ссылку — так устроены и заводские блоки (см. docs/formats/xac.md).
// Если концы попали в разные блоки, вместо пары «вектор + встречная» пишется
// пара «межблочный вектор + встречная ссылка в другой блок».
//
// Класс дороги задаётся индексом в заводской таблице `ATTRIBUTE`: младшие три
// бита её значения — это FRC, а нам нужен индекс, при котором запись вектора
// ровно четырёхбайтовая (`xacwrite.simpleAttributes`). Таблица берётся из
// набора, её мы не сочиняем.
//
// Блоки нарезаются рекурсивным делением по длинной стороне рамки: у блока есть
// потолок по числу записей (16 383 — номер не влезает в 14 бит) и по длине
// (смещения в таблице это u16 от половины байта, то есть 128 КБ).

const fs = require('fs');
const path = require('path');
const xw = require('./xacwrite');
const xv = require('./xacvec');
const tile = require('./xactile');
const xr = require('./xacrec');
const st = require('./struktur');
const zfn = require('./zfnamen');
const dataset = require('./dataset');

const LON = 72000, LAT = 40000000 / 360;
const MAX_ENTRIES = 16000;               // с запасом до 16 383
const MAX_BYTES = 120000;                // с запасом до 131 070

// Класс OSM -> FRC. Значения FRC взяты из прошивки: младшие три бита описателя
// `ATTRIBUTE`, и проверка маршрута сравнивает их с запрошенным maxfrc.
const FRC = {
  motorway: 0, motorway_link: 0,
  trunk: 1, trunk_link: 1,
  primary: 2, primary_link: 2,
  secondary: 3, secondary_link: 3,
  tertiary: 4, tertiary_link: 4,
  residential: 6, unclassified: 6, living_street: 6, road: 6,
  service: 7, track: 7, pedestrian: 7,
};

// Первый «простой» индекс таблицы ATTRIBUTE для каждого FRC. Нулевое значение
// не берём: это описатель без единого признака, и дорогой он быть не может.
// В заводской таблице нулей нет вовсе (0 из 2048), так что правило ничего не
// отнимает, зато не даёт синтетической таблице подсунуть пустой индекс.
// То же, но из индексов, у которых в хвосте записи лежит список имён ведения.
function attrByFrcNamed(attr) {
  const out = {};
  for (const i of xw.nameAttributes(attr)) {
    if (!attr[i]) continue;
    const frc = attr[i] & 7;
    if (out[frc] === undefined) out[frc] = i;
  }
  return out;
}

function attrByFrc(attr) {
  const out = {};
  for (const i of xw.simpleAttributes(attr)) {
    if (!attr[i]) continue;
    const frc = attr[i] & 7;
    if (out[frc] === undefined) out[frc] = i;
  }
  return out;
}

// Таблица ATTRIBUTE набора.
function setAttributes(root) {
  return xr.attributes(st.openIndex(root).buf);
}

// --- имена --------------------------------------------------------------------

// Имена в разделе `ZE-NAMEN` завод пишет ПРОПИСНОЙ латиницей: среди 81 483
// имён выборки нет ни одного со строчной буквой. Греческие названия там уже
// переложены на латиницу (`AGIOU GEORGIOU` в тайле `GR1T`), так что делаем то
// же самое. Старшие байты у завода свои (0x81, 0x84, 0x88…) — какая это
// кодовая страница, не разобрано, поэтому за пределы ASCII не выходим.
const GREEK = {
  Α: 'A', Ά: 'A', Β: 'V', Γ: 'G', Δ: 'D', Ε: 'E', Έ: 'E', Ζ: 'Z', Η: 'I', Ή: 'I',
  Θ: 'TH', Ι: 'I', Ί: 'I', Ϊ: 'I', Κ: 'K', Λ: 'L', Μ: 'M', Ν: 'N', Ξ: 'X',
  Ο: 'O', Ό: 'O', Π: 'P', Ρ: 'R', Σ: 'S', Σ: 'S', Τ: 'T', Υ: 'Y', Ύ: 'Y', Ϋ: 'Y',
  Φ: 'F', Χ: 'CH', Ψ: 'PS', Ω: 'O', Ώ: 'O',
};

// Строка -> прописная латиница без диакритики, только печатный ASCII.
// Байт 0x02 в имени невозможен по устройству потока, но здесь он отсеется сам.
function latinize(str) {
  let out = '';
  for (const ch of String(str).toUpperCase().normalize('NFD')) {
    if (GREEK[ch]) { out += GREEK[ch]; continue; }
    const c = ch.codePointAt(0);
    if (c >= 0x300 && c <= 0x36f) continue;            // диакритика после NFD
    out += (c >= 0x20 && c <= 0x7e) ? ch : ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Имя дороги: латиница предпочтительнее, дальше по убыванию надёжности.
function roadName(props) {
  const p = props || {};
  for (const v of [p.name_en, p['name:en'], p.int_name, p.name]) {
    if (!v) continue;
    const s = latinize(v);
    if (s) return s;
  }
  return null;
}

// --- граф --------------------------------------------------------------------

// GeoJSON -> узлы и рёбра в единицах карты. Точки, севшие в одну единицу,
// склеиваются; петля (ребро из узла в него же) отбрасывается.
function graphFromGeoJSON(fc, opt) {
  const classes = opt && opt.classes ? new Set(opt.classes) : null;
  const byKey = new Map(), nodes = [], edges = [], seen = new Set();
  const names = [], byName = new Map();
  // сырое имя OSM нужно отдельно от показываемого: дома ссылаются тегом
  // `addr:street` именно на него, а показываем мы `name:en`, когда он есть
  const rawNames = [], byRaw = new Map();
  let ways = 0, points = 0, loops = 0, dups = 0, named = 0;

  const nodeAt = (lon, lat) => {
    const x = Math.round(lon * LON), y = Math.round(lat * LAT);
    const k = x + ',' + y;
    let i = byKey.get(k);
    if (i === undefined) { i = nodes.length; nodes.push({ x, y }); byKey.set(k, i); }
    return i;
  };

  for (const f of fc.features || []) {
    if (!f.geometry || f.geometry.type !== 'LineString') continue;
    const hw = (f.properties || {}).highway || 'unclassified';
    if (classes && !classes.has(hw)) continue;
    const frc = FRC[hw] === undefined ? 6 : FRC[hw];
    const nm = roadName(f.properties);
    let ni = -1;
    if (nm) {
      ni = byName.get(nm);
      if (ni === undefined) { ni = names.length; names.push(nm); byName.set(nm, ni); }
      named++;
    }
    const rawText = latinize((f.properties || {}).name || '');
    let ri = -1;
    if (rawText) {
      ri = byRaw.get(rawText);
      if (ri === undefined) { ri = rawNames.length; rawNames.push(rawText); byRaw.set(rawText, ri); }
    }
    ways++;
    const c = f.geometry.coordinates;
    points += c.length;
    let prev = c.length ? nodeAt(c[0][0], c[0][1]) : -1;
    for (let k = 1; k < c.length; k++) {
      const cur = nodeAt(c[k][0], c[k][1]);
      if (cur === prev) { loops++; continue; }
      const key = prev < cur ? prev + '-' + cur : cur + '-' + prev;
      if (seen.has(key)) { dups++; prev = cur; continue; }
      seen.add(key);
      edges.push({ a: prev, b: cur, frc, name: ni, raw: ri });
      prev = cur;
    }
  }
  return { nodes, edges, names, rawNames, byRaw, ways, points, loops, dups, named };
}

// --- нарезка на блоки ---------------------------------------------------------

// Рекурсивное деление по длинной стороне рамки, пока в блоке больше `maxNodes`
// узлов. Медиана, а не середина рамки: иначе город в углу тайла даёт блок,
// набитый до потолка, рядом с пустыми.
function splitNodes(nodes, idx, maxNodes) {
  if (idx.length <= maxNodes) return [idx];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of idx) {
    const n = nodes[i];
    if (n.x < x0) x0 = n.x; if (n.x > x1) x1 = n.x;
    if (n.y < y0) y0 = n.y; if (n.y > y1) y1 = n.y;
  }
  const byX = (x1 - x0) >= (y1 - y0);
  const sorted = idx.slice().sort((p, q) => byX ? nodes[p].x - nodes[q].x : nodes[p].y - nodes[q].y);
  const half = sorted.length >> 1;
  if (half === 0 || half === sorted.length) return [idx];
  return splitNodes(nodes, sorted.slice(0, half), maxNodes)
    .concat(splitNodes(nodes, sorted.slice(half), maxNodes));
}

// --- раскладка записей --------------------------------------------------------

// Кто где лежит и какие записи у каждого узла. Ребро внутри блока — вектор у
// узла с меньшим номером и встречная ссылка у второго; ребро между блоками —
// межблочный вектор и встречная ссылка в другой блок.
function layout(graph, groups, attrIdx, named) {
  const blockOf = new Int32Array(graph.nodes.length).fill(-1);
  const localOf = new Int32Array(graph.nodes.length).fill(-1);
  groups.forEach((g, bi) => g.forEach((n, k) => { blockOf[n] = bi; localOf[n] = k; }));

  const recs = groups.map((g) => g.map(() => ({ vecs: [], backs: [] })));
  const place = new Array(graph.edges.length);   // где лежит запись ребра
  let local = 0, cross = 0;

  graph.edges.forEach((e, ei) => {
    // У дороги с именем ведения индекс берётся из «именующих»: у них в хвосте
    // записи лежит список имён, у простых хвоста нет вовсе.
    const zf = named && e.name >= 0 ? named.of[e.name] : -1;
    const tab = zf >= 0 ? named.attr : attrIdx;
    const idx = tab[e.frc] === undefined ? tab[6] : tab[e.frc];
    const names = zf >= 0 ? [zf] : null;
    const ba = blockOf[e.a], bb = blockOf[e.b];
    const la = localOf[e.a], lb = localOf[e.b];
    if (ba === bb) {
      const pos = recs[ba][la].vecs.length;
      recs[ba][la].vecs.push({ to: lb, idx, names });
      recs[bb][lb].backs.push({ from: la, at: pos });
      local++;
    } else {
      const pos = recs[ba][la].vecs.length;
      recs[ba][la].vecs.push({ cross: bb, node: lb, idx, names });   // номер запишем потом
      recs[bb][lb].backs.push({ crossBlock: ba, node: la, at: pos });
      cross++;
    }
    place[ei] = { block: ba, node: la, pos: recs[ba][la].vecs.length - 1 };
  });
  return { blockOf, localOf, recs, place, local, cross };
}

// Связь «имя -> дорога» для ZE-NAMEN: на каждое имя список { block, recs }.
// Номер записи — тот же, по которому её находит движок: `first` узла плюс
// позиция записи у этого узла (векторы идут раньше встречных ссылок).
function nameRefs(graph, lay, firsts, blockCount) {
  const per = new Map(), place = new Array(graph.edges.length);
  graph.edges.forEach((e, ei) => {
    if (e.name < 0) return;
    const p = lay.place[ei];
    const rec = firsts[p.block].first[p.node] + p.pos;
    place[ei] = { block: p.block, rec };
    if (!per.has(e.name)) per.set(e.name, new Map());
    const m = per.get(e.name);
    if (!m.has(p.block)) m.set(p.block, new Set());
    m.get(p.block).add(rec);
  });
  // порядок у завода: блоки и номера записей по возрастанию, без повторов
  const refs = graph.names.map((_, i) => {
    const m = per.get(i);
    if (!m) return null;
    return [...m.keys()].sort((a, b) => a - b)
      .map((block) => ({ block, recs: [...m.get(block)].sort((a, b) => a - b) }));
  });
  return { refs, blocks: blockCount, place };
}

// Номера записей: у узла столько номеров, сколько у него записей, счёт с
// единицы. Та же раскладка, что в генераторе (xacwrite.buildBlock).
function firstEntries(rec) {
  const first = new Array(rec.length);
  let id = 1;
  for (let i = 0; i < rec.length; i++) {
    first[i] = id;
    id += Math.max(1, rec[i].vecs.length + rec[i].backs.length);
  }
  return { first, count: id };
}

// --- сборка -------------------------------------------------------------------

// Граф -> блоки. Возвращает буферы блоков и сводку. Если блок не влезает в
// потолки, его группа делится пополам и раскладка считается заново.
function buildBlocks(graph, opt) {
  const o = opt || {};
  let maxNodes = o.maxNodes || 9000;
  const base = o.base || 0, country = o.country || 0;
  const attrIdx = o.attrIdx;

  for (let round = 0; round < 8; round++) {
    const groups = splitNodes(graph.nodes, graph.nodes.map((_, i) => i), maxNodes);
    const lay = layout(graph, groups, attrIdx, o.named);
    const firsts = lay.recs.map(firstEntries);
    const tooMany = firsts.findIndex((f) => f.count > MAX_ENTRIES);
    if (tooMany >= 0) { maxNodes = Math.floor(maxNodes * 0.7); continue; }

    const blocks = [];
    let over = false;
    for (let bi = 0; bi < groups.length && !over; bi++) {
      const nodes = groups[bi].map((gi, k) => {
        const r = lay.recs[bi][k];
        return {
          x: graph.nodes[gi].x, y: graph.nodes[gi].y,
          vectors: r.vecs.map((v) => v.cross === undefined
            ? { to: v.to, idx: v.idx, names: v.names }
            : { block: base + v.cross, ref: firsts[v.cross].first[v.node], idx: v.idx,
                names: v.names }),
          backs: r.backs.map((b) => b.crossBlock === undefined ? { from: b.from, at: b.at }
            : { block: base + b.crossBlock,
                ref: firsts[b.crossBlock].first[b.node] + b.at }),
        };
      });
      const blk = xw.buildBlock({ nodes, id: base + bi, tileBase: base, country,
                                  flags: o.flags === undefined ? 0x95 : o.flags });
      if (blk.length > MAX_BYTES) { over = true; break; }
      blocks.push(blk);
    }
    if (over) { maxNodes = Math.floor(maxNodes * 0.7); continue; }
    return { blocks, groups, local: lay.local, cross: lay.cross, maxNodes,
             names: nameRefs(graph, lay, firsts, groups.length) };
  }
  throw new Error('блоки не удалось уложить в потолки даже после деления');
}

// Список имён для раздела ZE-NAMEN и дерево для ZE-NAMEN-MMI.
//
// Имена идут по возрастанию — движок ищет по ключам двоичным поиском. Дерево
// у завода это «страна → область → район → город → улица»; своё мы строим в
// три уровня, «страна → город → улица»: областей и районов у нас нет.
//
// Улица вешается на БЛИЖАЙШИЙ город: у дорог OSM нет ни `addr:city`, ни
// `is_in`, а координаты городов берутся отдельным файлом (`opt.places` —
// записи `{ name, lon, lat }`). Город ищется на КАЖДОЕ РЕБРО, поэтому одно
// имя, встречающееся в нескольких городах, даёт несколько записей — по одной
// на город. Так же устроены и заводские разделы: повторы имён есть у 108
// разделов из 109 просмотренных.
//
// Байт флагов разобран лишь частично (бит 7 стоит только у листьев). Значения
// взяты самые частые у завода для своей роли — корень 0x3f (66 из 70), город
// 0x3c, улица 0xc0 — и это ДОГАДКА: что кодируют биты 0…6, не установлено.
const MMI_ROOT = 0x3f, MMI_PLACE = 0x3c, MMI_STREET = 0xc0;

// Номер дома из тега `addr:housenumber`. Формат хранит целые, поэтому буквенная
// приставка теряется («5A» -> 5), а диапазон «5-7» ложится на пару «от, до»
// как родной. Косая черта диапазоном НЕ считается: «12/3» — это дом 12,
// квартира 3. Что не разобрали — возвращаем null и считаем отдельно.
function houseNumber(str) {
  const s = String(str).trim();
  let m = /^(\d{1,5})\s*[-–]\s*(\d{1,5})$/.exec(s);
  if (m) {
    const a = +m[1], b = +m[2];
    return a <= b ? [a, b] : [b, a];
  }
  m = /^(\d{1,5})/.exec(s);
  if (!m) return null;
  const v = +m[1];
  return [v, v];
}

// Расстояние от точки до отрезка в единицах карты, в квадрате.
function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}

function zenModel(graph, built, opt) {
  const o = opt || {};
  const places = (o.places || []).filter((p) => p && p.lon != null && p.lat != null)
    .map((p) => ({ name: latinize(p.name), x: Math.round(p.lon * LON), y: Math.round(p.lat * LAT) }));

  const nearest = (x, y) => {
    if (!places.length) return -1;
    let best = -1, bd = Infinity;
    places.forEach((p, i) => {
      const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };

  // «имя в городе» -> блоки и номера записей
  const streets = new Map();
  const edgeKey = new Array(graph.edges.length);
  graph.edges.forEach((e, ei) => {
    if (e.name < 0) return;
    const pos = built.names.place[ei];
    if (!pos) return;
    const a = graph.nodes[e.a], b = graph.nodes[e.b];
    const pl = nearest((a.x + b.x) / 2, (a.y + b.y) / 2);
    const key = e.name + '@' + pl;
    edgeKey[ei] = key;
    let st = streets.get(key);
    if (!st) { st = { name: graph.names[e.name], place: pl, by: new Map() }; streets.set(key, st); }
    if (!st.by.has(pos.block)) st.by.set(pos.block, new Set());
    st.by.get(pos.block).add(pos.rec);
  });

  // Дома. Тег `addr:street` указывает на СЫРОЕ имя дороги, поэтому улицу ищем
  // по нему, а не по показываемому. Дальше дом садится на ближайший отрезок
  // своей улицы — номера записей у нас уже розданы, взять их неоткуда больше.
  const stat = { всего: 0, 'улица не найдена': 0, 'номер не разобран': 0, 'село на отрезок': 0 };
  if (o.houses && o.houses.length) {
    const byRaw = new Map();
    graph.edges.forEach((e, ei) => {
      if (e.raw === undefined || e.raw < 0) return;
      let a = byRaw.get(e.raw);
      if (!a) byRaw.set(e.raw, a = []);
      a.push(ei);
    });
    for (const h of o.houses) {
      stat.всего++;
      const ri = graph.byRaw.get(latinize(h.street || ''));
      const cand = ri === undefined ? null : byRaw.get(ri);
      if (!cand) { stat['улица не найдена']++; continue; }
      const nums = houseNumber(h.number);
      if (!nums) { stat['номер не разобран']++; continue; }
      const px = Math.round(h.lon * LON), py = Math.round(h.lat * LAT);
      let best = -1, bd = Infinity;
      for (const ei of cand) {
        const e = graph.edges[ei], a = graph.nodes[e.a], b = graph.nodes[e.b];
        const d = segDist2(px, py, a.x, a.y, b.x, b.y);
        if (d < bd) { bd = d; best = ei; }
      }
      const pos = best >= 0 ? built.names.place[best] : null;
      if (!pos) { stat['улица не найдена']++; continue; }
      const key = edgeKey[best];
      const st = key && streets.get(key);
      if (!st) { stat['улица не найдена']++; continue; }
      (st.houses || (st.houses = [])).push({ nums, block: pos.block, rec: pos.rec });
      stat['село на отрезок']++;
    }
  }

  // 0 — страна, дальше города, дальше улицы; порядок пока свой, сортируем ниже
  const rows = [{ name: latinize(o.countryName || 'COUNTRY'), refs: null, kind: 'root', up: -1 }];
  places.forEach((p) => rows.push({ name: p.name, refs: null, kind: 'place', up: 0 }));
  for (const st of streets.values()) rows.push({
    name: st.name, kind: 'street', up: st.place < 0 ? 0 : 1 + st.place,
    refs: [...st.by.keys()].sort((a, b) => a - b)
      .map((block) => ({ block, recs: [...st.by.get(block)].sort((a, b) => a - b) })),
    houses: st.houses || null,
  });

  const order = rows.map((_, i) => i)
    .sort((a, b) => (rows[a].name < rows[b].name ? -1
                   : rows[a].name > rows[b].name ? 1 : a - b));
  const nid = new Array(rows.length);
  order.forEach((from, to) => { nid[from] = to; });

  const names = order.map((i) => rows[i].name);
  const refs = order.map((i) => rows[i].refs);
  const mmi = order.map((i) => {
    const r = rows[i];
    if (r.kind === 'root') return { flags: MMI_ROOT, parent: null };
    return { flags: r.kind === 'place' ? MMI_PLACE : MMI_STREET, parent: nid[r.up] };
  });
  // Дома для HAUSNUMMERN: запись на каждый номер, ссылка одна — тот отрезок,
  // на который дом сел. Повторы «номер на том же отрезке» отбрасываем.
  const hnr = order.map((i) => {
    const list = rows[i].houses;
    if (!list || !list.length) return null;
    const seen = new Set(), out = [];
    list.sort((a, b) => a.block - b.block || a.rec - b.rec || a.nums[0] - b.nums[0]);
    for (const h of list) {
      const k = h.block + ':' + h.rec + ':' + h.nums[0] + ':' + h.nums[1];
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ left: h.nums, right: null, refs: [{ block: h.block, rec: h.rec }] });
    }
    return out;
  });
  return { names, refs, mmi, hnr, blocks: built.names.blocks,
           places: places.length, streets: streets.size,
           houses: hnr.reduce((a, x) => a + (x ? x.length : 0), 0), houseStat: stat };
}

// Блоки -> файл тайла. Раздел ZF-NAMEN обязателен по реестру, но может быть
// пустым: у 347 заводских тайлов он ровно такой.
function buildTileFile(blocks, opt) {
  const o = opt || {};
  const room = o.room === undefined ? 1.45 : o.room;
  const padded = blocks.map((b) => {
    const size = Math.ceil(b.length * room / 4) * 4;
    const out = Buffer.alloc(size, 0);
    b.copy(out, 0);
    out.writeUInt32BE(size - 20, 0x10);
    return out;
  });
  return tile.buildTile({
    code: o.code || 'CY00',
    file: o.file || ((o.prefix || 'EJ211') + '_' + (o.code || 'CY00') + '_1'),
    index: o.index || 0,
    country: o.country || 0,
    built: o.built || '20260922120000',
    zf: o.zfSection || tile.section('ZF-NAMEN',
      Buffer.alloc(o.zfSize === undefined ? 92 : o.zfSize)),
    blocks: padded,
    extra: o.extra,
  });
}

// --- проверка -----------------------------------------------------------------

// Прочитать собранный тайл нашими читателями и сверить рёбра с графом.
// Ключ ребра — координаты обоих концов, как в xacgraph.tileEdges.
function verify(file, graph) {
  const xg = require('./xacgraph');
  const xac = require('./xac');
  const blocks = xac.sections(file).list.filter((s) => s.name === 'VEKTORBLOCK')
    .map((s) => file.subarray(s.offset, s.offset + s.total));
  const got = xg.tileEdges(blocks);
  const want = new Set();
  for (const e of graph.edges) {
    const a = graph.nodes[e.a], b = graph.nodes[e.b];
    want.add(a.x + ',' + a.y + '->' + b.x + ',' + b.y);
  }
  let found = 0;
  for (const k of want) {
    const [a, b] = k.split('->');
    if (got.edges.has(k) || got.edges.has(b + '->' + a)) found++;
  }
  // узлы должны лежать в рамке своего блока, иначе координата соврала бы
  let outside = 0;
  for (const b of blocks) {
    const box = [b.readInt32BE(0x18), b.readInt32BE(0x1c), b.readInt32BE(0x20), b.readInt32BE(0x24)];
    const tab = b.readUInt32BE(0x6c), cnt = b.readUInt16BE(0x70);
    const ox = b.readInt32BE(0x28), oy = b.readInt32BE(0x2c);
    for (let i = 1; i < cnt; i++) {
      const at = xv.nodeOffset(b, tab, cnt, i);
      if (!at) continue;
      const c = xv.koord(b, at, ox, oy);
      if (!c || c.x < box[0] || c.x > box[2] || c.y < box[1] || c.y > box[3]) outside++;
    }
  }
  return { want: want.size, found, got: got.edges.size, unresolved: got.lost,
           sections: xac.sections(file).complete, outside };
}

// Сверка связи «имя -> дорога»: каждая ссылка обязана попасть в запись-вектор
// того же блока, и концы этой записи обязаны совпасть с концами ребра, от
// которого ссылка взялась. Читаем собранный файл своими читателями.
//
// У межблочной записи дальний конец нашим читателем не разрешается — номер
// узла в ней относится к ДРУГОМУ блоку, — поэтому у таких записей сверяем
// только ближний конец и считаем их отдельно.
function verifyNames(file, graph, built) {
  const xac = require('./xac');
  const blocks = xac.sections(file).list.filter((s) => s.name === 'VEKTORBLOCK')
    .map((s) => file.subarray(s.offset, s.offset + s.total));
  const byBlock = blocks.map((b) => {
    const m = new Map();
    for (const e of xv.blockEdges(b, { keepCross: true })) m.set(e.idx, e);
    return m;
  });
  // чего ждём: ребро -> (блок, номер записи)
  let total = 0, hit = 0, coords = 0, cross = 0, missing = 0;
  graph.edges.forEach((e, ei) => {
    if (e.name < 0) return;
    const p = built.names.place[ei];
    if (!p) { missing++; return; }
    total++;
    const rec = byBlock[p.block] && byBlock[p.block].get(p.rec);
    if (!rec) return;
    hit++;
    const a = graph.nodes[e.a], b = graph.nodes[e.b];
    const same = (u, v) => u.x === v.x && u.y === v.y;
    if (rec.cross) { cross++; if (same(rec.a, a)) coords++; }
    else if ((same(rec.a, a) && same(rec.b, b)) || (same(rec.a, b) && same(rec.b, a))) coords++;
  });
  return { total, hit, coords, cross, missing };
}

// Сверка имён ведения: у каждого именованного ребра запись в блоке обязана
// нести хвост, а номер в хвосте — раскрываться в имя той же улицы. Читаем
// собранный файл так же, как это делает прошивка (FUN_082740bc).
function verifyGuidance(file, graph, built, attr) {
  const xac = require('./xac');
  const list = xac.sections(file).list;
  const zfSec = list.find((x) => x.name === 'ZF-NAMEN');
  if (!zfSec) return null;
  const tok = zfn.tokens(st.openIndex(dataset.resolveRoot()).buf);
  const back = zfn.readSection(file.subarray(zfSec.offset, zfSec.offset + zfSec.total), tok);
  const texts = (back && back.names ? back.names : []).map((x) => x.text);
  const blocks = list.filter((x) => x.name === 'VEKTORBLOCK')
    .map((x) => file.subarray(x.offset, x.offset + x.total));

  // номер записи -> хвост, по каждому блоку
  const tail = blocks.map((s) => {
    const m = new Map();
    if (s.readUInt16BE(0x72) !== 1) return m;
    const tab = s.readUInt32BE(0x6c), cnt = s.readUInt16BE(0x70);
    for (let k = 0; k < cnt; k++) {
      let q = s.readUInt16BE(tab + k * 2) * 2;
      if (q <= 0 || q + 4 > s.length || (s[q] & 0xc0) !== 0xc0) continue;
      const b2 = s[q + 2], b3 = s[q + 3];
      q += 4;
      if (b2 & 0x08) continue;                        // встречная ссылка: имя у хозяина
      if (b2 & 0x40) q += 2;                          // межблочная: ещё слово
      const idx = ((b2 & 7) << 8) | b3;
      const desc = attr[idx] >>> 0;
      let b5 = (desc >>> 24) & 0xff;
      if (b5 & 0x80) { b5 = s[q]; q += 2; }
      if (((desc >>> 8) & 0xff) & 0x80) q += 2;
      if (b5 & 0x40) q += 4;
      if (b5 & 0x10) q += 4;
      if (!(b5 & 0x20)) continue;
      const got = [];
      for (let i = 0; i < 8 && q + 2 <= s.length; i++) {
        const b0 = s[q], v = ((b0 & 0x3f) << 8) | s[q + 1];
        q += 2;
        got.push(v);
        if (!((b0 >> 6) & 1)) break;
      }
      m.set(k, got);
    }
    return m;
  });

  let total = 0, withTail = 0, sameText = 0, outOfRange = 0;
  graph.edges.forEach((e, ei) => {
    if (e.name < 0) return;
    const pos = built.names.place[ei];
    if (!pos) return;
    total++;
    const got = tail[pos.block] && tail[pos.block].get(pos.rec);
    if (!got || !got.length) return;
    withTail++;
    const v = got[0];
    if (v >= texts.length) { outOfRange++; return; }
    if (texts[v] === graph.names[e.name]) sameText++;
  });
  return { names: texts.length, total, withTail, sameText, outOfRange,
           parsed: back ? back.names.length : 0, count: back ? back.count : 0 };
}

// --- всё вместе ---------------------------------------------------------------

function convert(geojson, opt) {
  const o = opt || {};
  const attr = o.attr || setAttributes(dataset.resolveRoot(o.root));
  const attrIdx = attrByFrc(attr);
  const graph = graphFromGeoJSON(geojson, o);
  if (!graph.nodes.length) throw new Error('в наборе дорог нет ни одной точки');
  // Имена ведения: те же показываемые имена, по возрастанию — по ним движок
  // ищет двоичным поиском. Номер имени 14-битный, больше 16 382 не влезет.
  let named = null, zfSection = null;
  if (o.guidance !== false && graph.names.length) {
    const order = graph.names.map((_, i) => i)
      .sort((a, b) => (graph.names[a] < graph.names[b] ? -1
                     : graph.names[a] > graph.names[b] ? 1 : a - b));
    if (order.length > 0x3ffe) throw new Error('имён ведения больше 16 382: ' + order.length);
    const of = new Int32Array(graph.names.length).fill(-1);
    order.forEach((gi, k) => { of[gi] = k; });
    named = { of, attr: attrByFrcNamed(attr) };
    const tok = o.tok || zfn.tokens(st.openIndex(dataset.resolveRoot(o.root)).buf);
    zfSection = zfn.buildSection(order.map((gi) => ({ text: graph.names[gi], kind: 0 })), tok);
  }
  const built = buildBlocks(graph, Object.assign({}, o, { attrIdx, named }));
  const zen = zenModel(graph, built, o);
  // Разделы имён идут после блоков и в жёстком порядке: ZE-NAMEN, затем
  // ZE-NAMEN-MMI (см. цепочку разделов в docs/formats/xac.md).
  const zn = require('./zenamen');
  const extra = [];
  if (o.names !== false && zen.names.length) {
    extra.push(zn.buildSection({ names: zen.names, refs: zen.refs, blocks: zen.blocks,
                                 version: 2, label: 'ZE-NAMEN', country: o.country || 0 }));
    extra.push(zn.mmiBuildSection(zen.mmi));
    if (zen.houses) extra.push(require('./hausnr').buildSection({ rows: zen.hnr }));
  }
  const file = buildTileFile(built.blocks, Object.assign({}, o,
    { extra: (o.extra || []).concat(extra), zfSection }));
  return { file, graph, built, zen,
           check: verify(file, graph),
           namecheck: verifyNames(file, graph, built),
           zfcheck: zfSection ? verifyGuidance(file, graph, built, attr) : null };
}

module.exports = { convert, graphFromGeoJSON, splitNodes, layout, buildBlocks,
                   buildTileFile, verify, verifyNames, verifyGuidance, nameRefs, zenModel,
                   latinize, roadName, houseNumber, segDist2,
                   attrByFrc, attrByFrcNamed, setAttributes, FRC };

if (require.main === module) {
  const args = process.argv.slice(2);
  const src = args[0];
  const flag = (name, def) => {
    const i = args.indexOf('--' + name);
    return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
  };
  if (!src || args.includes('--help')) {
    console.error('использование: node src/xacroads.js <дороги.geojson> --out <файл.xac> [--classes ...]');
    process.exit(1);
  }
  const out = flag('out');
  const classes = flag('classes') ? flag('classes').split(',') : null;
  const t0 = Date.now();
  const fc = JSON.parse(fs.readFileSync(src, 'utf8'));
  const placesFile = flag('places');
  const housesFile = flag('houses');
  let houses = null;
  if (housesFile) {
    const pbf = require('./osmpbf');
    const idx = pbf.read(housesFile, {
      node: (t) => t['addr:housenumber'] !== undefined && t['addr:street'] !== undefined,
      way: (t) => t['addr:housenumber'] !== undefined && t['addr:street'] !== undefined,
    });
    houses = [];
    for (const p of idx.points) {
      houses.push({ lon: p.lon / 1e7, lat: p.lat / 1e7,
                    number: p.tags['addr:housenumber'], street: p.tags['addr:street'] });
    }
    for (const w of idx.ways) {
      const c = pbf.center(idx, w.refs);
      if (!c) continue;
      houses.push({ lon: c[0] / 1e7, lat: c[1] / 1e7,
                    number: w.tags['addr:housenumber'], street: w.tags['addr:street'] });
    }
    console.log('дома из ' + housesFile + ': ' + houses.length +
                ' (точками ' + idx.points.length + ', контурами ' + idx.ways.length + ')');
  }
  const r = convert(fc, {
    houses,
    classes,
    names: !args.includes('--no-names'),
    places: placesFile ? JSON.parse(fs.readFileSync(placesFile, 'utf8')) : null,
    countryName: flag('country-name', 'CYPRUS'),
    code: flag('code', 'CY00'),
    index: Number(flag('index', 0)),
    country: Number(flag('country', 113)),
    base: Number(flag('base', 0)),
    maxNodes: Number(flag('max-nodes', 9000)),
    room: Number(flag('room', 1.45)),
  });
  if (!args.includes('--quiet')) {
    const g = r.graph, c = r.check;
    console.log('дорог ' + g.ways + ', точек ' + g.points + ' -> узлов ' + g.nodes.length +
      ', рёбер ' + g.edges.length + ' (склеено точек ' + g.loops + ', повторных рёбер ' + g.dups + ')');
    console.log('блоков ' + r.built.blocks.length + ' по ' + r.built.maxNodes +
      ' узлов, рёбер внутри блоков ' + r.built.local + ', межблочных ' + r.built.cross);
    console.log('тайл ' + (r.file.length / 1048576).toFixed(2) + ' МБ, разделы покрывают файл: ' +
      (c.sections ? 'да' : 'НЕТ'));
    console.log('сверка: рёбер в тайле ' + c.got + ', из графа нашлось ' + c.found + ' из ' + c.want +
      ' (' + (100 * c.found / c.want).toFixed(4) + ' %), не разобрано ссылок ' + c.unresolved +
      ', узлов вне рамки блока ' + c.outside);
    const n = r.namecheck;
    console.log('имена: дорог с именем ' + g.named + ' -> разных имён ' + g.names.length +
      ', ссылок «имя -> дорога» ' + n.total + ', попали в запись ' + n.hit +
      ', концы совпали ' + n.coords + ' (межблочных записей ' + n.cross + ')');
    console.log('раздел ZE-NAMEN: имён ' + r.zen.names.length + ' (городов ' + r.zen.places +
      ', записей улиц ' + r.zen.streets + '), дерево «страна -> город -> улица»');
    if (r.zfcheck) {
      const z = r.zfcheck;
      console.log('имена ведения: в ZF-NAMEN ' + z.names + ', рёбер с именем ' + z.total +
        ', запись несёт хвост у ' + z.withTail + ', имя совпало у ' + z.sameText +
        ', номер вне диапазона ' + z.outOfRange);
    }
    if (r.zen.houseStat.всего) {
      console.log('дома: ' + JSON.stringify(r.zen.houseStat) +
        ' -> записей HAUSNUMMERN ' + r.zen.houses);
    }
    console.log('за ' + ((Date.now() - t0) / 1000).toFixed(1) + ' с');
  }
  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, r.file);
    console.log('записано: ' + out);
  }
  const zenOut = flag('zen');
  if (zenOut) {
    const zen = require('./zenamen');
    const sec = zen.buildSection({ names: r.zen.names, refs: r.zen.refs,
                                   blocks: r.zen.blocks, version: 2, label: 'ZE-NAMEN',
                                   country: Number(flag('country', 113)) });
    fs.mkdirSync(path.dirname(zenOut), { recursive: true });
    fs.writeFileSync(zenOut, sec);
    const back = zen.allNames(sec), gr = zen.refGroups(sec);
    console.log('раздел ZE-NAMEN: ' + sec.length + ' байт, имён ' + back.names.length +
      ', поток съеден ' + (back.end === back.len ? 'ровно' : 'НЕ РОВНО') +
      ', групп ' + (gr ? gr.groups.length : 0) +
      ', область ссылок ' + (gr && !gr.err && gr.end === gr.len ? 'съедена ровно' : 'СБОЙ'));
    console.log('записано: ' + zenOut);
  }
}
