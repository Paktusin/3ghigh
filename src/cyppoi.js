// Точки интереса Кипра: OpenStreetMap -> блок LIT.
//
//   node src/cyppoi.js --stats                 что вообще есть в извлечении
//   node src/cyppoi.js --build                 собрать блок на место листа
//   node src/cyppoi.js --build --limit 300     ограничить число точек
//
// Куда это кладётся. Дерево POI европейского набора Кипр уже накрывает: спуск
// по нему (`node src/litpoi.js --find 33 35`) доходит до листа за девять шагов
// и приводит в блок 112447 — 365 точек, все родосские, от 27.96 до 29.60 в. д.
// Кипр в рамке листа есть, данных в нём нет. Значит новый слой не нужен: блок
// переписывается на месте, и Кипр появляется там, где дерево его и ищет.
//
// Ограничение по размеру жёсткое. Блоки в `LIT` лежат вплотную, и хотя каталог
// хранит смещение и размер каждого явно, ВЫРАСТИ блок не может — за ним сразу
// начинается следующий. Уменьшиться может: каталог переживёт дыру. Поэтому
// сборка подрезает список под размер исходного блока.
'use strict';

const path = require('path');
const fs = require('fs');
const osm = require('./osmpbf');
const B = require('./litblock');
const P = require('./litpoi');
const { latinize } = require('./xacroads');

const DEG = 40000000 / 360;

// Соответствие заводских типов мест и тегов OSM. Таблица идёт ОТ ЗАВОДА: слева
// категория ровно так, как она названа в прошивке (`litpoi.CATEGORIES`, 192
// строки), справа — теги OSM, которые в неё попадают. Направление важно: если
// строить от OSM, заводская категория без «своего» тега молча выпадает и этого
// не видно. Отсюда же берётся отчёт `--cover`: какие заводские типы остались
// пустыми и какие частые теги OSM никуда не размечены.
//
// Порядок строк — это порядок важности в машине, а не номер в заводской
// таблице. Он же задаёт вес при подрезке под размер блока.
//
// Пустой список справа значит «в OSM источника нет»: полсотни заводских типов
// это дилерские марки (`AUDI SERVICE`, `MAYBACH HÄNDLER`), их в OSM не размечают.
const BY_CATEGORY = [
  ['TANKSTELLE',      ['amenity=fuel']],
  ['KRANKENHAUS',     ['amenity=hospital', 'healthcare=hospital']],
  ['APOTHEKE',        ['amenity=pharmacy', 'healthcare=pharmacy']],
  ['POLIZEIWACHE',    ['amenity=police']],
  ['PARKPLATZ',       ['amenity=parking']],
  ['FLUGHAFEN',       ['aeroway=aerodrome']],
  ['FLUGH. TERMINAL', ['aeroway=terminal']],
  ['HOTEL/MOTEL',     ['tourism=hotel', 'tourism=motel']],
  ['BANK',            ['amenity=bank']],
  ['GELDAUTOMAT',     ['amenity=atm']],
  ['ÄRZTL. DIENST',   ['amenity=clinic', 'healthcare=clinic', 'healthcare=centre']],
  ['ARZT',            ['amenity=doctors', 'healthcare=doctor']],
  ['RESTAURANT',      ['amenity=restaurant', 'amenity=fast_food']],
  ['COFFEE SHOP',     ['amenity=cafe', 'amenity=ice_cream']],
  ['SUPERMARKT',      ['shop=supermarket']],
  ['NAMENS-ORT',      ['place=city', 'place=town', 'place=village', 'place=suburb']],
  ['WEILER',          ['place=hamlet']],
  ['FÄHRE/AUTOZUG',   ['amenity=ferry_terminal']],
  ['GRENZÜBERGANG',   ['barrier=border_control']],
  ['AUTOBAHNSERVICE', ['highway=services']],
  ['RASTPLATZ',       ['highway=rest_area']],
  ['MAUTSTELLE',      ['barrier=toll_booth']],
  ['AUTOWERKSTATT',   ['shop=car_repair', 'shop=tyres', 'shop=car_parts']],
  ['AUTOVERMIETUNG',  ['amenity=car_rental']],
  ['AUTOHÄNDLER',     ['shop=car']],
  ['MOTORRADHÄNDLER', ['shop=motorcycle']],
  ['BUSBAHNHOF',      ['amenity=bus_station']],
  ['BAHNHOF',         ['railway=station']],
  ['NAHVERKEHRSZUG',  ['railway=halt', 'railway=tram_stop']],
  ['POSTAMT',         ['amenity=post_office']],
  ['RATHAUS',         ['amenity=townhall']],
  ['BEHÖRDE',         ['office=government']],
  ['GERICHTSGEBÄUDE', ['amenity=courthouse']],
  ['FEUERWACHE',      ['amenity=fire_station']],
  ['BOTSCHAFT',       ['amenity=embassy', 'office=diplomatic']],
  ['GEFÄNGNIS',       ['amenity=prison']],
  ['ZAHNARZT',        ['amenity=dentist', 'healthcare=dentist']],
  ['TIERARZT',        ['amenity=veterinary']],
  ['SCHULE',          ['amenity=school']],
  ['KINDERGARTEN',    ['amenity=kindergarten']],
  ['HOCHSCHULE',      ['amenity=university', 'amenity=college']],
  ['BIBLIOTHEK',      ['amenity=library']],
  ['TOURIST INFO',    ['tourism=information']],
  ['SEHENSWÜRDIGKT.', ['tourism=attraction', 'tourism=artwork']],
  ['AUSSICHTSPUNKT',  ['tourism=viewpoint']],
  ['BERGGIPFEL',      ['natural=peak']],
  ['GEBIRGSPASS',     ['natural=saddle', 'mountain_pass=yes']],
  ['STRAND',          ['natural=beach']],
  ['NATURRESERVAT',   ['leisure=nature_reserve']],
  ['KULTURDENKMAL',   ['historic=monument', 'historic=memorial', 'historic=castle',
                       'historic=ruins', 'historic=archaeological_site']],
  ['MUSEUM',          ['tourism=museum']],
  ['GOTTESHAUS',      ['amenity=place_of_worship', 'amenity=monastery']],
  ['FRIEDHOF',        ['landuse=cemetery', 'amenity=grave_yard']],
  ['GÄSTEHAUS',       ['tourism=guest_house', 'tourism=hostel', 'tourism=apartment',
                       'tourism=chalet']],
  ['CAMPINGPLATZ',    ['tourism=camp_site', 'tourism=caravan_site']],
  ['BAR/PUB',         ['amenity=bar', 'amenity=pub']],
  ['NIGHTLIFE',       ['amenity=nightclub']],
  ['CASINO',          ['amenity=casino']],
  ['KINO',            ['amenity=cinema']],
  ['THEATER',         ['amenity=theatre']],
  ['KONZERTHALLE',    ['amenity=music_venue']],
  ['KULTURZENTRUM',   ['amenity=arts_centre', 'amenity=community_centre']],
  ['VERANSTALTUNGEN', ['amenity=events_venue']],
  ['MESSE/KONGRESS',  ['amenity=conference_centre', 'amenity=exhibition_centre']],
  ['FREIZEITPARK',    ['tourism=theme_park']],
  ['ZOO',             ['tourism=zoo']],
  ['PARK/ERHOLUNG',   ['leisure=park', 'leisure=garden']],
  ['AKTIVER SPORT',   ['leisure=sports_centre', 'leisure=fitness_centre']],
  ['SCHWIMMBAD',      ['leisure=swimming_pool', 'leisure=water_park']],
  ['TENNISPLATZ',     ['leisure=tennis']],
  ['STADION',         ['leisure=stadium']],
  ['GOLFPLATZ',       ['leisure=golf_course']],
  ['BOWLINGCENTER',   ['leisure=bowling_alley']],
  ['EISLAUFHALLE',    ['leisure=ice_rink']],
  ['YACHTHAFEN',      ['leisure=marina']],
  ['WASSERSPORT',     ['shop=scuba_diving', 'leisure=slipway']],
  ['AUTORENNSTRECKE', ['highway=raceway']],
  ['RADARBLITZGERÄT', ['highway=speed_camera']],
  ['EINKAUFSZENTRUM', ['shop=mall']],
  ['KAUFHAUS',        ['shop=department_store']],
  ['LEBENSMITTEL',    ['shop=convenience', 'shop=bakery', 'shop=butcher',
                       'shop=greengrocer', 'shop=deli', 'shop=seafood']],
  ['GETRÄNKEMARKT',   ['shop=alcohol', 'shop=beverages', 'shop=wine']],
  ['BEKLEIDUNG',      ['shop=clothes', 'shop=shoes', 'shop=boutique']],
  ['SPORTGESCHÄFT',   ['shop=sports', 'shop=bicycle']],
  ['BUCHHANDLUNG',    ['shop=books']],
  ['ELEKTROMARKT',    ['shop=electronics', 'shop=computer', 'shop=mobile_phone']],
  ['MÖBELMARKT',      ['shop=furniture', 'shop=interior_decoration']],
  ['BAUMARKT',        ['shop=doityourself', 'shop=hardware', 'shop=trade',
                       'shop=paint', 'shop=garden_centre']],
  ['BÜROARTIKEL',     ['shop=stationery', 'shop=copyshop']],
  ['CHEM. REINIGUNG', ['shop=dry_cleaning', 'shop=laundry']],
  ['REISEBÜRO',       ['shop=travel_agency']],
  ['MUSIKZENTRUM',    ['shop=musical_instrument']],
  ['WEINGUT',         ['craft=winery']],
  ['FACHGESCHÄFT',    ['shop=jewelry', 'shop=gift', 'shop=florist', 'shop=optician',
                       'shop=toys', 'shop=pet', 'shop=cosmetics', 'shop=beauty',
                       'shop=hairdresser', 'shop=photo', 'shop=watches']],
  ['GESCHÄFT',        ['shop=yes', 'shop=general', 'shop=variety_store']],
  ['FIRMENFILIALE',   ['office=company', 'office=insurance', 'office=estate_agent']],
  ['GEWERBEGEBIET',   ['landuse=industrial', 'landuse=commercial']],
  ['AUTOMOBILCLUB',   ['club=automobile']],
  // Заводские типы без источника в OSM: дилерские марки (AUDI SERVICE,
  // BMW HÄNDLER и ещё полсотни), служебные (ANSCHLUSSSTELLE, HIGHWAY-RAMPE,
  // PREMIUM POIS) и повторы (STADION/ARENA, PARKPLATZ/-HAUS, VERANSTALTUNGEN).
];

// Плоская таблица «тег -> категория» и место категории в порядке важности.
const MAP = [];
for (let rank = 0; rank < BY_CATEGORY.length; rank++)
  for (const sel of BY_CATEGORY[rank][1]) {
    const [k, v] = sel.split('=');
    MAP.push([k, v, BY_CATEGORY[rank][0], rank]);
  }

// Номер категории по её названию. Считается с единицы — так устроена таблица.
function catNo(name) {
  const i = P.CATEGORIES.indexOf(name);
  if (i < 0) throw new Error('нет такой категории: ' + name);
  return i + 1;
}

// Разметка тегов: первая подошедшая строка таблицы и задаёт категорию.
function classify(tags) {
  let best = null;
  for (const [k, v, name, rank] of MAP)
    if (tags[k] === v && (!best || rank < best.rank))
      best = { rank: rank, cat: catNo(name), category: name };
  return best;
}

// Название: латиница предпочтительнее греческого, как и в дорожных именах.
function nameOf(tags) {
  for (const v of [tags['name:en'], tags.int_name, tags.name]) {
    if (!v) continue;
    const s = latinize(v);
    if (s) return s;
  }
  return null;
}

function fieldsOf(tags) {
  const out = {};
  const put = (key, v) => { if (v) { const s = latinize(v); if (s) out[key] = s; } };
  put('city', tags['addr:city']);
  put('street', tags['addr:street']);
  put('house', tags['addr:housenumber']);
  put('post', tags['addr:postcode']);
  put('brand', tags.brand);
  const tel = tags.phone || tags['contact:phone'];
  if (tel) out.phone = String(tel).replace(/[^\d+()\- ]/g, '').trim();
  return out;
}

// Сбор точек из извлечения. Узлы берутся как есть, линии — серединой.
function collect(pbf) {
  const keys = new Set(MAP.map((m) => m[0]));
  const want = (tags) => {
    for (const [k, v] of MAP) if (tags[k] === v) return true;
    return false;
  };
  const idx = osm.read(pbf, { node: want, way: want });
  const out = [];
  const add = (tags, lon, lat) => {
    const c = classify(tags);
    const name = nameOf(tags);
    if (!c || !name) return;                       // без названия точка бесполезна
    out.push(Object.assign({
      rank: c.rank, cat: c.cat, category: c.category, name: name,
      lon: lon / 1e7, lat: lat / 1e7,
    }, fieldsOf(tags)));
  };
  for (const p of idx.points) add(p.tags, p.lon, p.lat);
  for (const w of idx.ways) {
    const c = osm.center(idx, w.refs);
    if (c) add(w.tags, c[0], c[1]);
  }
  void keys;
  return out;
}

// Порядок отбора. Строгий по важности негоден: заправок на Кипре 397, и они
// одни съедают весь блок — получается карта из заправок и больниц. Поэтому
// категории чередуются, но не поровну: каждой даётся вес по её месту в таблице,
// и очередь внутри категории умножается на него. У заправок (место 0) вес 1, у
// последней строки таблицы — около 9, то есть важного попадает примерно в
// девять раз больше, но не встречается категория, которой нет вовсе.
function order(pois) {
  const seen = new Map();
  return pois.slice()
    .sort((a, b) => a.rank - b.rank || a.lon - b.lon)
    .map((p) => {
      const i = seen.get(p.cat) || 0;
      seen.set(p.cat, i + 1);
      return { p: p, score: i * (1 + p.rank / 8) };
    })
    .sort((a, b) => a.score - b.score)
    .map((x) => x.p);
}

// Точки -> модель блока. `slot` — размер, в который надо уложиться; список
// режется по порядку отбора, пока не влезет.
function build(pois, opt) {
  const o = opt || {};
  const idBase = o.idBase === undefined ? 0x30000000 : o.idBase;
  const list = o.keepOrder ? pois.slice() : order(pois);
  const toModel = (take) => {
    const items = take.map((p, i) => Object.assign({}, p, {
      x: Math.round(p.lon * 72000),
      y: Math.round(p.lat * DEG),
      id: idBase + i,
      ref: o.ref,
    }));
    return B.model(items, { dictLimit: o.dictLimit });
  };
  let lo = 0, hi = list.length, best = null;
  if (!o.slot) { const m = toModel(list); return { model: m, bytes: B.writeBlock(m, o.blk), used: list.length }; }
  while (lo <= hi) {                               // двоичный поиск по числу точек
    const mid = (lo + hi) >> 1;
    if (!mid) { lo = 1; continue; }
    let bytes = null;
    try { bytes = B.writeBlock(toModel(list.slice(0, mid)), o.blk); } catch (e) { bytes = null; }
    if (bytes && bytes.length <= o.slot) { best = { n: mid, bytes: bytes }; lo = mid + 1; }
    else hi = mid - 1;
  }
  if (!best) throw new Error('в слот ' + o.slot + ' не влезает ни одна точка');
  const m = toModel(list.slice(0, best.n));
  return { model: m, bytes: best.bytes, used: best.n, dropped: list.length - best.n };
}

module.exports = { MAP, BY_CATEGORY, classify, nameOf, fieldsOf, collect, build, order, catNo, DEG };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const pbf = argv.find((a) => a.endsWith('.pbf')) || 'out/cyp/cyprus-latest.osm.pbf';
  if (!fs.existsSync(pbf)) { console.error('нет файла ' + pbf); process.exit(1); }
  const pois = collect(pbf);
  if (argv.includes('--cover')) {
    // Отчёт о покрытии в обе стороны: какие заводские типы наполнились, какие
    // остались пустыми, и какие частые теги OSM никуда не размечены.
    const got = new Map();
    for (const p of pois) got.set(p.category, (got.get(p.category) || 0) + 1);
    const mapped = new Set(MAP.map((m) => m[0] + '=' + m[1]));
    const empty = BY_CATEGORY.filter(([n]) => !got.has(n)).map(([n]) => n);
    const noSource = P.CATEGORIES.filter((n) => !BY_CATEGORY.some(([c]) => c === n));
    console.log('заводских типов 192: размечено %d, из них наполнилось %d',
                BY_CATEGORY.length, got.size);
    console.log('размечены, но пусты на Кипре (%d): %s', empty.length, empty.join(', '));
    console.log('без источника в OSM (%d): %s', noSource.length,
                noSource.slice(0, 12).join(', ') + (noSource.length > 12 ? ' …' : ''));
    const cnt = new Map();
    const scan = (tags) => {
      for (const k of ['amenity', 'shop', 'tourism', 'leisure', 'office', 'historic',
                       'natural', 'aeroway', 'railway', 'healthcare', 'craft', 'place']) {
        const v = tags[k];
        if (!v) continue;
        const key = k + '=' + v;
        if (!mapped.has(key)) cnt.set(key, (cnt.get(key) || 0) + 1);
      }
    };
    const idx = osm.read(pbf, { node: (t) => !!(t.name || t['name:en']),
                                way: (t) => !!(t.name || t['name:en']) });
    for (const p of idx.points) scan(p.tags);
    for (const w of idx.ways) scan(w.tags);
    console.log('частые теги OSM вне таблицы:');
    for (const [k, v] of [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 20))
      console.log('  %s %s', String(v).padStart(5), k);
    return;
  }
  if (argv.includes('--stats') || !argv.includes('--build')) {
    const by = new Map();
    for (const p of pois) by.set(p.category, (by.get(p.category) || 0) + 1);
    const withAddr = pois.filter((p) => p.street).length;
    const withTel = pois.filter((p) => p.phone).length;
    console.log('точек с названием %d, из них с улицей %d, с телефоном %d',
                pois.length, withAddr, withTel);
    for (const [k, v] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 25))
      console.log('  %s %s', String(v).padStart(5), k);
    return;
  }
  // --build: уложить в слот листа, который накрывает Кипр
  const lit = require('./lit');
  const l = lit.open(['LIT', 'LIT2', 'LIT3', 'LIT4'].map((d) => path.join('maps/pkgdb', d)));
  const cat = l.catalog();
  const leafArg = argv.indexOf('--leaf');
  const blk = leafArg >= 0 ? Number(argv[leafArg + 1]) : 112447;
  const slot = cat[blk].size;
  const old = B.readBlock(P.open(['LIT', 'LIT2', 'LIT3', 'LIT4']
                                 .map((d) => path.join('maps/pkgdb', d))).schema,
                          l.block(cat[blk]), blk);
  const ref = old.pois.length ? old.pois[0].ref : [blk, 0];
  const limArg = argv.indexOf('--limit');
  const list = limArg >= 0 ? pois.slice(0, Number(argv[limArg + 1])) : pois;
  const r = build(list, { slot, blk, ref });
  console.log('лист %d: слот %d байт, наших %d байт', blk, slot, r.bytes.length);
  console.log('точек взято %d из %d, отброшено %d', r.used, list.length, r.dropped || 0);
  console.log('опора %d %d (%s, %s), ширина %d, кодов в словаре %d',
              r.model.origin.x, r.model.origin.y,
              (r.model.origin.x / 72000).toFixed(3), (r.model.origin.y / DEG).toFixed(3),
              r.model.width, r.model.dict.size);
  const outDir = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'out/cyp';
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'lit-' + blk + '.bin');
  fs.writeFileSync(file, r.bytes);
  console.log('записано: %s', file);
}
