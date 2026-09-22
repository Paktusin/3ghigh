// Точки интереса из LIT: координаты, категория, название, адрес.
//
// Запись POI — это структура типа 0x24 грамматики (правила 216…242). Поля её
// названы в прошивке поимённо (`POIIndexName`, `POIIndexGeoPos`, …), а машина
// `src/litvm.js` кладёт их в запись по номеру типа:
//
//   0x22  пара координат — СМЕЩЕНИЕ от опорной точки блока, код 0x40,
//         ширина объявлена байтом 3 заголовка блока (8, 12, 16 или 24)
//   0x24  всегда 36 = 0x24 — сам тип записи
//   0x4b  подробности одной строкой-текстом: `<тег><значение>\n…`
//   0x4d  название, сжатое словарём блока (src/litdict.js)
//   0x4e  вид кухни у ресторанов — то же число, что и тег '7'
//   0x4f  КАТЕГОРИЯ: номер в таблице ниже, считая с единицы
//   0x66  позиция (номер блока, ключ записи) — ссылка, СВОЯ У КАЖДОЙ ТОЧКИ
//         (5360 разных на 5360 точек); блок-цель задаётся городом точки в область названий
//   0x73  всегда 0, 0x216 всегда 1 (на выборке в 2997 точек)
//   0x215 идентификатор, у 2996 точек из 2997 свой
//
// Опорная точка блока лежит в его заголовке: два знаковых четырёхбайтовых
// числа на смещениях 4 и 8 (правила 4 и 5 грамматики). У блоков названий она
// нулевая — геометрии в них нет.
//
// Проекция та же, что у XAC: долгота = X / 72000, широта = Y / (40000000/360).
'use strict';

const path = require('path');
const fs = require('fs');
const lit = require('./lit');
const S = require('./litschema');
const V = require('./litvm');
const D = require('./litdict');

const DEG = 40000000 / 360;                     // метров на градус по меридиану

// Теги строки подробностей. `getDetailLine` (0x08c9e3b8) сравнивает ПЕРВЫЙ
// байт строки с запрошенным тегом и отдаёт остаток до `\n`. Теги оказались
// обычными цифрами; значения ниже опознаны по содержимому на выборке из 38
// блоков и 5360 точек (Порту, Мальта, Босния).
const TAGS = {
  '0': 'post',                                  // почтовый индекс или код района
  '1': 'city',                                  // POIIndexCityName
  '2': 'street',                                // POIIndexStreet
  '3': 'house',                                 // POIIndexHouseNumber
  '4': 'phone',                                 // POIIndexPhoneNumber
  '6': 'brand',                                 // POIIndexBrand: SIXT, IBERENT
  '7': 'food',                                  // POIIndexFoodType: только у категории 46
};

// Таблица категорий — ресурс NAVRESOURCE `XAC` прямо в прошивке, по адресу
// 0x098aba7b образа `MMI3GApplication`; заголовок ресурса — строка
// `!14!NRC:XAC/D!v0.28!22.11.2007!41!`, за именами идёт метка языка `D`.
// Имена немецкие и лежат подряд, через ноль. Номер в поле 0x4f — индекс в этой
// таблице, СЧИТАЯ С ЕДИНИЦЫ; проверено содержимым: 43 — аптеки на Мальте,
// 45 — участки `PULIZIJA`, 46 — рестораны, 56 — заправки `HIFA PETROL`/`INA`
// в Боснии, 174 — португальские `CENTRO DE SAÚDE`.
const CATEGORIES = [
  'ANSCHLUSSSTELLE', 'AUTOBAHN-KNOTEN', 'P AUTOVERMIETG', 'AUTOMOBILCLUB', 'AUTOVERMIETUNG',
  'AUTOWERKSTATT', 'BAHNHOF', 'BANK', 'BIBLIOTHEK', 'POSTAMT', 'BUSBAHNHOF', 'CASINO',
  'KULTURDENKMAL', 'FLUGH. TERMINAL', 'EINKAUFSZENTRUM', 'EISLAUFHALLE', 'FÄHRE/AUTOZUG',
  'FLUGHAFEN', 'ERHOLUNG', 'BEHÖRDE', 'PARK/ERHOLUNG', 'GELDAUTOMAT', 'VERANSTALTUNGEN',
  'GERICHTSGEBÄUDE', 'FIRMENFILIALE', 'STADION', 'GOLFPLATZ', 'GEBIRGSPASS', 'HOTEL/MOTEL',
  'KINO', 'KRANKENHAUS', 'LEBENSMITTEL', 'MESSE/KONGRESS', 'MUSEUM', 'KULTURZENTRUM',
  'NATURRESERVAT', 'SPORTFLUGPLATZ', 'PARK & RIDE', 'PARKHAUS', 'PARKPLATZ', 'NAHVERKEHRSZUG',
  'NAMENS-ORT', 'APOTHEKE', 'RASTPLATZ', 'POLIZEIWACHE', 'RESTAURANT', 'SCHULE', 'WOHNANLAGE',
  'GEWERBEGEBIET', 'SKIURLAUBSORT', 'WEINGUT', 'BOWLINGCENTER', 'AKTIVER SPORT', 'STADION/ARENA',
  'RATHAUS', 'TANKSTELLE', 'THEATER', 'TOURIST INFO', 'SEHENSWÜRDIGKT.', 'HOCHSCHULE',
  'UNTERHALTUNG', 'FREIZEITPARK', 'YACHTHAFEN', 'FEUERWACHE', 'P-VERANSTALTUNG',
  'VERANSTALTUNGEN', 'MAUTSTELLE', 'NIGHTLIFE', 'MB-WERKST. PKW', 'MB-WERKST. LKW',
  'AUTOHÄNDLER', 'GRENZÜBERGANG', 'AUTOBAHNSERVICE', 'PARKPLATZ/-HAUS', 'HIGHWAY-RAMPE',
  'BECKER HÄNDLER', 'HYUNDAI SERVICE', 'ROVER SERVICE', 'PORSCHE SERVICE', 'CHRYSLER-VERTR.',
  'FORD SERVICE', 'BMW HÄNDLER', 'RENAULT SERVICE', 'AUDI SERVICE', 'VW SERVICE',
  'FERRARI SERVICE', 'AUDI ZENTRUM', 'CAMPINGPLATZ', 'MOTORRADHÄNDLER', 'ARZT',
  'AUSSICHTSPUNKT', 'BERGGIPFEL', 'BOTSCHAFT', 'GESCHÄFT', 'GETRÄNKEMARKT', 'GOTTESHAUS',
  'KONZERTHALLE', 'MESSEZENTRUM', 'MUSIKZENTRUM', 'OPERNHAUS', 'RESTAURANTMEILE', 'SCHWIMMBAD',
  'STRAND', 'TENNISPLATZ', 'TIERARZT', 'WASSERSPORT', 'ZAHNARZT', 'ZOO', 'MINI HÄNDLER',
  'ALFA ROMEO', 'CITROËN HÄNDLER', 'FIAT HÄNDLER', 'LANCIA HÄNDLER', 'OPEL HÄNDLER',
  'SEAT HÄNDLER', 'SKODA HÄNDLER', 'HONDA HÄNDLER', 'JAGUAR HÄNDLER', 'LAMBORGHINI',
  'LAND ROVER', 'MASERATI HÄNDL.', 'MAZDA HÄNDLER', 'MITSUBISHI', 'NISSAN HÄNDLER',
  'PEUGEOT HÄNDLER', 'ROLLS ROYCE', 'SAAB HÄNDLER', 'SMART HÄNDLER', 'TOYOTA HÄNDLER',
  'VOLVO HÄNDLER', 'DAEWOO HÄNDLER', 'KIA HÄNDLER', 'LEXUS HÄNDLER', 'SUZUKI HÄNDLER',
  'DAIHATSU HÄNDL.', 'LADA HÄNDLER', 'LOTUS HÄNDLER', 'SSANG YONG', 'SUBARU HÄNDLER',
  'MEGA HÄNDLER', 'PROTON HÄNDLER', 'AIXAM HÄNDLER', 'ASTON MARTIN', 'BENTLEY HÄNDLER',
  'CADILLAC HÄNDL.', 'CHEVROLET', 'FORD USA HÄNDL.', 'JEEP HÄNDLER', 'LINCOLN HÄNDLER',
  'MERCURY HÄNDLER', 'MG HÄNDLER', 'TATA HÄNDLER', 'BUICK HÄNDLER', 'PONTIAC HÄNDLER',
  'RADARBLITZGERÄT', 'CHEM. REINIGUNG', 'FÄHRE', 'AUTOZUG', 'WEILER', 'MAYBACH HÄNDLER',
  'KAUFHAUS', 'RASTHAUS', 'REISEBÜRO', 'GEFÄNGNIS', 'WANDERGEBIET', 'AUTORENNSTRECKE',
  'BUCHHANDLUNG', 'COFFEE SHOP', 'GEBRAUCHTWAGEN', 'KREISVERWALTUNG', 'GÄSTEHAUS',
  'PREMIUM POIS', 'BAR/PUB', 'ÄRZTL. DIENST', 'GAS-TANKSTELLE', 'FABRIKVERKAUF',
  'DODGE HÄNDLER', 'VW LKW', 'KINDERGARTEN', 'SUPERMARKT', 'BEKLEIDUNG', 'MÖBELMARKT',
  'FACHGESCHÄFT', 'SPORTGESCHÄFT', 'WOHNANLAGE', 'FRIEDHOF', 'TRANSPORTWESEN', 'BAUMARKT',
  'ELEKTROMARKT', 'BÜROARTIKEL', 'GESCHÄFTSHAUS', 'AUTOHOF',
];

function category(n) { return CATEGORIES[n - 1]; }

// Опорная точка блока и ширина координат — из его заголовка.
function origin(block) {
  return { x: block.readInt32BE(4), y: block.readInt32BE(8), width: block[3] };
}

// Разбор строки подробностей: `<тег><значение>\n<тег><значение>\n…`.
function details(text) {
  const out = {};
  for (const line of text.split('\n')) {
    if (!line) continue;
    const key = TAGS[line[0]];
    if (key) out[key] = line.slice(1);
    else (out.unknown || (out.unknown = {}))[line[0]] = line.slice(1);
  }
  return out;
}

// Точки интереса одного блока. `blk` — его номер в каталоге: им засевается
// база дельта-кодека (см. src/litvm.js), без неё ссылки 0x66 бессмысленны.
function poisOf(schema, block, blk, opt) {
  const o = origin(block);
  const r = V.run(schema, block, 0, Object.assign({ limit: 4000000, blk: blk }, opt || {}));
  const out = [];
  for (const rec of r.records) {
    if (rec[0x24] !== 0x24 || !Array.isArray(rec[0x22])) continue;
    const x = o.x + rec[0x22][0], y = o.y + rec[0x22][1];
    // Записей типа 0x24 две формы. Полная несёт название, категорию и
    // подробности; короткая — только координату, идентификатор и ссылку 0x66,
    // и ссылка ведёт В ТОТ ЖЕ блок (X у неё равен его номеру, то есть в потоке
    // не записан вовсе), а ключи у идущих подряд коротких записей идут подряд.
    // Ключ — порядковый номер записи в блоке, считая ноль первой записью после
    // заголовка (проверено обходом дерева: 330 720 ссылок из 330 720). В блоках
    // с повторяющимися группами нумерация идёт и по виткам — там ключ пока не
    // воспроизводится, поэтому короткие записи отдаются как есть, с пометкой
    // `short`.
    const poi = {
      x: x, y: y, lon: x / 72000, lat: y / DEG,
      cat: rec[0x4f], category: category(rec[0x4f]),
      name: Buffer.isBuffer(rec[0x4d]) ? D.expand(r.codes, rec[0x4d]).toString('utf8') : '',
      id: rec[0x215], ref: rec[0x66], short: rec[0x4f] === undefined,
    };
    if (Buffer.isBuffer(rec[0x4b]))
      Object.assign(poi, details(D.expand(r.codes, rec[0x4b]).toString('utf8')));
    out.push(poi);
  }
  return out;
}

function schemaOf(file) {
  const pre = Buffer.alloc(8192);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, pre, 0, pre.length, 0);
  fs.closeSync(fd);
  const at = pre.indexOf(Buffer.from([0x4c, 0x69, 0x74, 0x02]));
  if (at < 0) throw new Error('магия Lit\\x02 не найдена в ' + file);
  return S.load(file, at);
}

function open(dirs) {
  const L = lit.open(dirs);
  const schema = schemaOf(L.vols[0].file);
  const cat = L.catalog();
  return {
    lit: L, schema, catalog: () => cat,
    pois: (i) => poisOf(schema, L.block(cat[i]), i),
    origin: (i) => origin(L.block(cat[i])),
  };
}

module.exports = { open, poisOf, origin, details, category, CATEGORIES, TAGS, DEG };

// Показать точки интереса блока (или пройтись по выборке и собрать сводку):
//
//   node src/litpoi.js 102275            точки одного блока
//   node src/litpoi.js --scan 200        сводка по выборке блоков
if (require.main === module) {
  const argv = process.argv.slice(2);
  const dirs = ['LIT', 'LIT2', 'LIT3', 'LIT4'].map((d) => path.join('maps/pkgdb', d));
  const P = open(dirs);
  const num = Number(argv.find((a) => /^\d+$/.test(a)) || 0);
  if (argv.includes('--scan')) {
    const cat = P.catalog(), want = num || 200;
    const step = Math.max(1, Math.floor(120000 / want));
    const byCat = new Map();
    let pois = 0, blocks = 0, named = 0, shortN = 0;
    for (let i = 0; i < 120000; i += step) {
      const b = P.lit.block(cat[i]);
      if (b.readInt32BE(4) === 0) continue;             // блок без геометрии
      let list;
      try { list = poisOf(P.schema, b, i); } catch (e) { continue; }
      if (!list.length) continue;
      blocks++; pois += list.length;
      for (const p of list) {
        if (p.short) { shortN++; continue; }
        if (p.name) named++;
        byCat.set(p.cat, (byCat.get(p.cat) || 0) + 1);
      }
    }
    console.log('блоков с точками %d, точек %d, из них полных %d (с названием %d)',
                blocks, pois, pois - shortN, named);
    for (const [c, n] of [...byCat].sort((a, b) => b[1] - a[1]).slice(0, 25))
      console.log('  %s %s %s', String(c).padStart(4), String(n).padStart(7), category(c));
  } else {
    const o = P.origin(num);
    console.log('блок %d: опора %d %d (%s %s), ширина %d',
                num, o.x, o.y, (o.x / 72000).toFixed(4), (o.y / DEG).toFixed(4), o.width);
    for (const p of P.pois(num))
      console.log('%s %s  %s  %s  %s',
                  p.lon.toFixed(5), p.lat.toFixed(5), String(p.cat).padStart(4),
                  (p.category || '?').padEnd(16), JSON.stringify(p.name) + ' ' +
                  JSON.stringify([p.post, p.city, p.street, p.house, p.phone].filter(Boolean)));
  }
}
