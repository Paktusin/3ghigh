'use strict';
// Архив стилей карты MMI3G_MapArchive_*.xar (pkgdb/StyleDBMMI3G_*): разбор и выгрузка.
//
//   node src/xar.js <file.xar>                    разделы архива
//   node src/xar.js <file.xar> --tree [путь]      дерево свойств (dpx), путь — имена через /
//   node src/xar.js <file.xar> --areas [night]    стили площадей по классам GDB
//   node src/xar.js <file.xar> --lines [night]    стили линий по классам GDB
//   node src/xar.js <file.xar> --icons <dir> [poi…]  значки POI в PNG (все или перечисленные)
//   node src/xar.js <file.xar> --bitmap <dir> <id…>  растр ресурса по номеру в PNG
//
// Устройство (docs/formats/xar.md, читатель — CGMapStyleArchive/CGMapStylePropertyDB):
//   шапка 'rax\0', u32 версия, u32 ?, u32 0, u32 длина файла, u32 0, u32 0,
//   u32 число разделов, затем смещения разделов в словах (×4 от начала файла);
//   'drx' — растры (RLE BGRx + RLE альфы), 'dpx' — дерево свойств с именами-
//   хешами h = h·37 + байт, 'XPF ' — шрифты, 'xg3d' — 3D-модели.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const u32 = (b, o) => b.readUInt32LE(o);

// ---------- архив и разделы ----------

function open(buf) {
  if (buf.toString('latin1', 0, 4) !== 'rax\0') throw new Error('не архив rax');
  const n = u32(buf, 0x1c);
  const offs = [];
  for (let i = 0; i < n; i++) offs.push(u32(buf, 0x20 + 4 * i) * 4);
  const sections = offs.map((off, i) => {
    const end = i + 1 < n ? offs[i + 1] : buf.length;
    const magic = buf.toString('latin1', off, off + 4).replace(/\0+$/, '');
    const s = { magic, off, size: end - off };
    if (magic === 'XPF') s.name = buf.toString('latin1', off + 12, off + 44).replace(/\0.*$/s, '');
    if (magic === 'xg3d') s.name = buf.toString('latin1', off + 0x32, off + 0x52).replace(/\0.*$/s, '');
    return s;
  });
  return { buf, version: u32(buf, 4), length: u32(buf, 0x10), sections };
}
const section = (a, magic) => a.sections.find(s => s.magic === magic);

// ---------- drx: растры ----------
// 'drx\0', u32 версия, u32 0, u32 5, u32 0, u32 n, n × u32 номер, n × u32 смещение
// (слова от начала раздела). Растр '2MIX': u32 длина, u16 w, u16 h, u32 0x1c,
// u32 смещение альфы (0 — нет), u32 0, u32 0, u32 длина цвета, затем цвет: u32 формат
// (0x01072000 / 0x01052000), RLE по словам: n со старшим битом — n слов как есть,
// иначе одно слово n раз; слово = B,G,R,x. Альфа: u32 длина, u32 0x108, RLE по
// байтам: c & 0x80 — (c & 0x7f) байт как есть, иначе следующий байт c раз.

function bitmaps(a) {
  const s = section(a, 'drx'), b = a.buf, o = s.off;
  const n = u32(b, o + 20), list = [];
  for (let i = 0; i < n; i++) {
    const off = o + 4 * u32(b, o + 24 + 4 * n + 4 * i);
    list.push({ id: u32(b, o + 24 + 4 * i), off, w: b.readUInt16LE(off + 8), h: b.readUInt16LE(off + 10),
      fmt: u32(b, off + 0x20), alpha: u32(b, off + 0x10) !== 0 });
  }
  return list;
}

function decodeBitmap(b, off) {
  if (b.toString('latin1', off, off + 4) !== '2MIX') throw new Error('нет 2MIX по ' + off);
  const w = b.readUInt16LE(off + 8), h = b.readUInt16LE(off + 10), n = w * h;
  const rgba = Buffer.alloc(n * 4, 0xff);
  let p = off + 0x24, k = 0;
  const px = (v) => { rgba[k * 4] = (v >> 16) & 0xff; rgba[k * 4 + 1] = (v >> 8) & 0xff; rgba[k * 4 + 2] = v & 0xff; k++; };
  while (k < n) {
    const c = u32(b, p); p += 4;
    if (c & 0x80000000) for (let i = 0; i < (c & 0x7fffffff); i++, p += 4) px(u32(b, p));
    else { const v = u32(b, p); p += 4; for (let i = 0; i < c; i++) px(v); }
  }
  if (k !== n || p !== off + 0x1c + u32(b, off + 0x1c)) throw new Error('цвет растра не сошёлся по ' + off);
  const ao = u32(b, off + 0x10);
  if (ao) {
    let q = off + ao + 8; k = 0;
    while (k < n) {
      const c = b[q++];
      if (c & 0x80) for (let i = 0; i < (c & 0x7f); i++) rgba[4 * k++ + 3] = b[q++];
      else { const v = b[q++]; for (let i = 0; i < c; i++) rgba[4 * k++ + 3] = v; }
    }
    if (k !== n) throw new Error('альфа растра не сошлась по ' + off);
  }
  return { w, h, rgba };
}

function bitmap(a, id) {
  const m = bitmaps(a).find(x => x.id === id);
  if (!m) throw new Error('нет растра ' + id);
  return decodeBitmap(a.buf, m.off);
}

let crcTab;
function crc32(buf) {
  if (!crcTab) {
    crcTab = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTab[n] = c; }
  }
  let c = -1;
  for (const x of buf) c = crcTab[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function png({ w, h, rgba }) {
  const chunk = (type, data) => {
    const t = Buffer.concat([Buffer.from(type, 'latin1'), data]), b = Buffer.alloc(4 + t.length + 4);
    b.writeUInt32BE(data.length, 0); t.copy(b, 4); b.writeUInt32BE(crc32(t), 8 + data.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- dpx: дерево свойств ----------
// Узел: u32 хеш имени, u16 вид, u16 длина данных, u32 следующий, u32 первый ребёнок,
// данные. Смещения — от начала раздела + 4. Вид 0 — ветвь, 1 — u32, 2 — строка,
// 3 — массив u32 (первое слово — число слов). Имя '*' (хеш 42) — «любое».

const hash = (s) => { let h = 0; for (const c of Buffer.from(s, 'latin1')) h = (Math.imul(h, 37) + c) >>> 0; return h; };

const BASE = ('* 2d 3d 3dcarID 3dlighting CityCentre RAboundary Street ZOrders airport area arrow arrowBoundary ' +
  'arrowLength arrowWidth attrib bgcolor boundary building cameraParameter capital cars carsor carsor3d ' +
  'carsor3dlight centre channel city citymodelattrib citymodellod citymodellight citymodellanduse coloramplification ' +
  'coloredSignsWithoutRouteGuidance config configChange countryborder crosshair crosshair3dlight cutRouteBehindCar ' +
  'day direction directionArrow directionIndices disableDepthTestForCityModel distance distanceToCombine ' +
  'extractAllSigns final forest frozeOnFirstManeuver gdbpoi gdbpoitypes globalNamingAttr graveyard groundcolor ' +
  'heightParams heights highguiding hmi hospital ignoreCombineHint industry inter island izbgcolor jv landFC ' +
  'landMR landNR lightAngle line lineStyles loadDataScale lr lrBitmaps lrLines lrShapeBitmaps magnifyRoundabout ' +
  'mainMap maneuver maxScaleForBrunnel meterToPixel minPixelBeforeManeuver minScaleForTerrain naming ' +
  'namingDistance night normal normalScale overlapBitmap overlapRules park pedestrian pixelAfterManeuver poi ' +
  'poiContainer poiDefault poiTunnel poiHoppingSpeed poiOrder poitypes preselect railroad rendering river route ' +
  'routeHeight routeStyle ruledRoute rules runway scales scrollParams selectedcity settlement shadowParams sign ' +
  'signtypes skySettings layeredSkySettings globeSettings stateborder streetWidthType streetcolor stripecolor ' +
  'styleDBVersion target texturedFaceFadeOut textures tiltingAngle tmcmarkertable tmctable top trafficarea ' +
  'transformationrules transformations triangulationAccuracy turnToStreetParts type typespoisub unknown ' +
  'useLocalCoordinates viewsUsingColorAmplification vcard vcardtypes alertpoint alertpointtypes water ' +
  'windowBoundary trail heightScalePosScale minFRCForBrunnels minFogAngle depthTestForNaming useTmcStyleSet ' +
  'tmcmarker tmcmarkerroute tmcmarkerboth tmcmarkerrouteboth alignMarkerOnRoad flags').split(' ');
const FAMILIES = ('poi sub height line frc font icon city streetsign ZOrder lrBitmaps overlapRule points tmcmarker ' +
  'tmcmarkerroute tmcmarkerboth tmcmarkerrouteboth streetmarker streetmarkerroute streetmarkerboth ' +
  'streetmarkerrouteboth trail anim markerbmps textPos').split(' ');
let NAMES;
function names() {
  if (NAMES) return NAMES;
  NAMES = new Map();
  for (const s of BASE) NAMES.set(hash(s), s);
  for (const f of FAMILIES) for (let i = 0; i < 1000; i++) if (!NAMES.has(hash(f + i))) NAMES.set(hash(f + i), f + i);
  for (let i = 0; i < 1000; i++) if (!NAMES.has(hash(String(i)))) NAMES.set(hash(String(i)), String(i));
  return NAMES;
}
const nameOf = (h) => names().get(h) || '#' + h.toString(16).padStart(8, '0');

function tree(a) {
  const s = section(a, 'dpx'), b = a.buf, B = s.off + 4;
  const read = (o) => {
    const out = [];
    while (true) {
      const h = u32(b, B + o), type = b.readUInt16LE(B + o + 4), size = b.readUInt16LE(B + o + 6);
      const next = u32(b, B + o + 8), child = u32(b, B + o + 12), d = b.subarray(B + o + 16, B + o + 16 + size);
      const n = { hash: h, name: nameOf(h), type, off: o };
      if (type === 1) n.value = u32(d, 0);
      else if (type === 2) n.value = d.toString('latin1').replace(/\0+$/, '');
      else if (type === 3) { const c = u32(d, 0); n.value = []; for (let i = 0; i < c; i++) n.value.push(u32(d, 4 + 4 * i)); }
      if (child) n.children = read(child);
      out.push(n);
      if (!next) break;
      o = next;
    }
    return out;
  };
  return read(0)[0];
}

const child = (n, h) => (n && n.children || []).find(c => c.hash === h);

// Поиск как в прошивке (FUN_08d1dc68): на каждом шаге — ребёнок с нужным именем,
// иначе '*', который поглощает один и более элементов пути. null в пути — «нет
// такого имени», то есть только через '*'.
function lookup(node, p) {
  const hs = p.map(x => x == null ? -1 : hash(x));
  const go = (n, i) => {
    if (i === hs.length) return n;
    const c = child(n, hs[i]);
    if (c) { const r = go(c, i + 1); if (r) return r; }
    const star = child(n, 42);
    if (star && i + 1 < hs.length) for (let j = i + 1; j < hs.length; j++) { const r = go(star, j); if (r) return r; }
    return null;
  };
  return go(node, 0);
}

// ---------- стили ----------

// 44 масштаба; «масштаб от/до» в записях стилей — индексы в этой таблице.
const scales = (root) => (lookup(root, ['mainMap', 'day', '2d', null, null, null, 'scales']) || { value: [] }).value;
const rgb = (v) => '#' + [(v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff].map(x => x.toString(16).padStart(2, '0')).join('');
const alpha = (v) => v >>> 24;

// Классы GDB (младшие 6 бит атрибута) — таблица имён в прошивке по 0x09a5f208.
const GDB_CLASSES = ['FRC0', 'FRC1', 'FRC2', 'FRC3', 'FRC4', 'FRC5', 'FRC6', 'FRC7', 'EISENBAHN', 'FLUSS', 'KANAL',
  'UNBEKANNT', 'GRENZE_STAAT', 'GRENZE_BUNDESLAND', 'ROUTE', 'BRUNNEL', 'WASSER', 'WALD', 'PARK', 'SIEDLUNG',
  'INDUSTRIE', 'GEBAEUDE', 'FLUGHAFEN', 'LANDEBAHN', 'FUZO', 'TRAFFIC_AREA', 'INSEL', 'KRANKENHAUS', 'FRIEDHOF',
  'LAND_MAPINFO', 'LAND_MJ', 'LAND_FC', 'HOEHE', 'FEHLER', 'LAND'];
// Стиль площади: класс 0x10…0x1F → имя (статическая таблица 0x09a5f1c4), 0x20 и прочее — 'unknown'.
const AREA_STYLES = ['water', 'forest', 'park', 'settlement', 'industry', 'building', 'airport', 'runway',
  'pedestrian', 'trafficarea', 'island', 'hospital', 'graveyard', 'landNR', 'landMR', 'landFC', 'unknown'];
// Стиль линии: класс 0…13 → имя (таблица 0x09a5f14c), за пределами — 'unknown' (индекс 11).
const LINE_STYLES = ['frc0', 'frc1', 'frc2', 'frc3', 'frc4', 'frc5', 'frc6', 'frc7', 'railroad', 'river', 'channel',
  'unknown', 'countryborder', 'stateborder'];

// запись площади: 8 слов — масштаб от, до, заливка, цвет 2, флаги, ?, цвет 3, текстура
const areaEntries = (v) => { const r = []; for (let i = 0; i + 8 <= v.length; i += 8) r.push({ from: v[i], to: v[i + 1], fill: v[i + 2], color2: v[i + 3], flags: v[i + 4], v5: v[i + 5], color3: v[i + 6], texture: v[i + 7] }); return r; };
// запись линии: 20 слов — масштаб от, до, внутреннее перо (флаги, ширина, цвет, цвет), 2 слова,
// внешнее перо (флаги, ширина, цвет, цвет), 8 слов
const lineEntries = (v) => { const r = []; for (let i = 0; i + 20 <= v.length; i += 20) r.push({ from: v[i], to: v[i + 1], flags: v[i + 2], width: v[i + 3], color: v[i + 4], color2: v[i + 5], outerFlags: v[i + 8], outerWidth: v[i + 9], outerColor: v[i + 10], outerColor2: v[i + 11], rest: v.slice(i + 12, i + 20) }); return r; };
// запись значка POI: 19 слов — масштаб от, до, ширина, высота, номер растра, …
const poiEntries = (v) => { const r = []; for (let i = 0; i + 19 <= v.length; i += 19) r.push({ from: v[i], to: v[i + 1], w: v[i + 2], h: v[i + 3], bitmap: v[i + 4], rest: v.slice(i + 5, i + 19) }); return r; };

function areaStyles(root, { night = false, dim = '2d' } = {}) {
  const dn = night ? 'night' : 'day', out = [];
  AREA_STYLES.forEach((name, i) => {
    const n = lookup(root, ['mainMap', dn, dim, 'area', null, name, 'rendering']);
    out.push({ cls: 0x10 + i, attr: 0x50 + i, gdb: GDB_CLASSES[0x10 + i], name, entries: n ? areaEntries(n.value) : [] });
  });
  const hs = lookup(root, ['mainMap', dn, dim, 'area', null, null, 'heights']);
  const heights = [];
  for (let i = 0; i < 12; i++) {
    const n = lookup(root, ['mainMap', dn, dim, 'area', null, 'height' + i, 'rendering']);
    heights.push({ band: i, name: 'height' + i, entries: n ? areaEntries(n.value) : [] });
  }
  return { classes: out, heights, thresholds: hs ? hs.value : [] };
}

function lineStyles(root, { night = false, dim = '2d' } = {}) {
  const dn = night ? 'night' : 'day';
  const all = LINE_STYLES.concat(['line0', 'line1', 'line2', 'line3', 'line4']);
  const out = all.map((name, i) => {
    const n = lookup(root, ['mainMap', dn, dim, 'line', null, name, 'rendering']);
    return { cls: i < 14 ? i : null, gdb: i < 14 ? GDB_CLASSES[i] : null, name, entries: n ? lineEntries(n.value) : [] };
  });
  const rules = lookup(root, ['mainMap', dn, dim, 'line', null, null, 'rules']);
  const r = [];
  if (rules) for (let i = 0; i + 3 <= rules.value.length; i += 3) r.push({ value: rules.value[i], style: 'line' + rules.value[i + 1], mask: rules.value[i + 2] });
  return { styles: out, rules: r };
}

// Значки POI (CGMapStylePOIHandler, FUN_09272bc4 / getPOI FUN_09273004).
// Загрузка: узел 'poitypes' (режим 0, тогда же создаётся стиль по умолчанию, тип
// 0xfffe) или, если его нет, 'typespoisub' (режим 1) — пары (тип, подтип); стиль
// строится ТОЛЬКО для перечисленных пар, по пути
// mainMap/<день>/<2d|3d>/poi/*/poi<тип>/sub<подтип>. В заводском архиве 'poitypes'
// нет — работает режим 1, и стиля по умолчанию нет.
// Тип — номер категории LIT (0x4f, он же тип в заголовке POI 0x20).
function poiStyles(root, { night = false, dim = '2d' } = {}) {
  const dn = night ? 'night' : 'day', out = new Map();
  const node = (k) => lookup(root, ['mainMap', dn, dim, 'poi', null, null, k]);
  const types = node('poitypes'), pairsNode = node('typespoisub');
  const pairs = pairsNode ? pairsNode.value : [];
  let min = Infinity, max = -Infinity, maxSub = 0;
  const list = [];
  if (types) for (const t of types.value) list.push([t, 0]);
  else for (let i = 0; i + 1 < pairs.length; i += 2) list.push([pairs[i], pairs[i + 1]]);
  for (const [t, sb] of list) {
    min = Math.min(min, t); max = Math.max(max, t); maxSub = Math.max(maxSub, sb);
    const n = lookup(root, ['mainMap', dn, dim, 'poi', null, 'poi' + t, 'sub' + sb]);
    if (!n || n.name !== 'sub' + sb) continue;   // стиль без записей: точка не рисуется (isVisible = 0)
    if (!out.has(t)) out.set(t, new Map());
    out.get(t).set(sb, poiEntries(n.value));
  }
  const def = types ? lookup(root, ['mainMap', dn, dim, 'poi', null, 'poiDefault', 'sub0']) : null;
  return { mode: types ? 0 : 1, pairs, styles: out, min, max, maxSub, def: def ? poiEntries(def.value) : null };
}

// Что нарисует прошивка для точки (категория, подтип): getPOI FUN_09273004.
// Режим 1: тип в [min, max] → стиль (тип, подтип); подтип > maxSub или стиля нет →
// стиль (тип, 0); нет и его → стиль по умолчанию, если он есть, иначе null —
// точка не рисуется (FUN_092834f4 рисует только при ненулевом стиле).
function iconFor(ps, cat, sub = 0) {
  let e = null;
  if (cat >= ps.min && cat <= ps.max) {
    const m = ps.styles.get(cat);
    if (m) {
      if (ps.mode === 1 && sub <= ps.maxSub && m.get(sub)) e = m.get(sub);
      else e = m.get(0) || null;
    }
  }
  if (!e || !e.length) e = ps.def && ps.def.length ? ps.def : null;
  return e ? { entries: e, bitmap: e[0].bitmap, fallback: !(ps.styles.get(cat) && ps.styles.get(cat).get(sub)) } : null;
}

module.exports = { open, bitmaps, bitmap, decodeBitmap, png, tree, lookup, hash, nameOf, areaStyles, lineStyles,
  poiStyles, iconFor, rgb, alpha, scales, GDB_CLASSES, AREA_STYLES, LINE_STYLES };

// ---------- CLI ----------

if (require.main === module) {
  const [file, cmd, ...rest] = process.argv.slice(2);
  if (!file) { console.error('node src/xar.js <file.xar> [--tree [путь]|--areas|--lines|--icons dir|--bitmap dir id…]'); process.exit(1); }
  const a = open(fs.readFileSync(file));
  const fmtE = (e) => e.map(x => `${x.from}-${x.to} ${rgb(x.fill)}${alpha(x.fill) === 255 ? '' : '/a' + alpha(x.fill)}`).join('  ');
  if (!cmd) {
    for (const s of a.sections) console.log('%s  %s  %s  %s', s.magic.padEnd(5), ('0x' + s.off.toString(16)).padStart(9), String(s.size).padStart(8), s.name || '');
    console.log('масштабы:', scales(tree(a)).join(' '));
    const bm = bitmaps(a);
    console.log('растров %d (%d с альфой); узлов дерева: %d', bm.length, bm.filter(x => x.alpha).length,
      (function cnt(n) { return 1 + (n.children || []).reduce((s, c) => s + cnt(c), 0); })(tree(a)));
  } else if (cmd === '--tree') {
    let n = tree(a);
    if (rest[0]) for (const p of rest[0].split('/')) n = (n.children || []).find(c => c.name === p) || (() => { throw new Error('нет ' + p); })();
    const pr = (n, d) => {
      const v = n.value === undefined ? '' : Array.isArray(n.value) ? '[' + n.value.length + '] ' + n.value.slice(0, 12).join(' ') : JSON.stringify(n.value);
      console.log('  '.repeat(d) + n.name + (v ? '  ' + v : ''));
      for (const c of (n.children || []).slice().reverse()) pr(c, d + 1);
    };
    pr(n, 0);
  } else if (cmd === '--areas') {
    const r = areaStyles(tree(a), { night: rest[0] === 'night' });
    for (const c of r.classes) console.log('0x%s %s %s  %s', c.attr.toString(16), c.gdb.padEnd(14), c.name.padEnd(12), fmtE(c.entries));
    console.log('пороги высот, м (ступень s·10 м < порога):', r.thresholds.join(' '));
    for (const c of r.heights) console.log('%s  %s', c.name.padEnd(9), fmtE(c.entries));
  } else if (cmd === '--lines') {
    const r = lineStyles(tree(a), { night: rest[0] === 'night' });
    for (const c of r.styles) {
      console.log('%s %s %s', String(c.cls == null ? '' : c.cls).padStart(2), (c.gdb || '').padEnd(18), c.name);
      for (const e of c.entries) console.log('     %s-%s  ширина %d %s/%s, кайма %d %s/%s', e.from, e.to, e.width, rgb(e.color), rgb(e.color2), e.outerWidth, rgb(e.outerColor), rgb(e.outerColor2));
    }
    for (const x of r.rules) console.log('правило: значение 0x%s маска 0x%s → %s', x.value.toString(16), x.mask.toString(16), x.style);
  } else if (cmd === '--icons' || cmd === '--bitmap') {
    const dir = rest[0];
    fs.mkdirSync(dir, { recursive: true });
    if (cmd === '--bitmap') {
      for (const id of rest.slice(1).map(Number)) fs.writeFileSync(path.join(dir, 'bmp' + id + '.png'), png(bitmap(a, id)));
    } else {
      const want = new Set(rest.slice(1).map(Number));
      const { styles } = poiStyles(tree(a));
      for (const [t, subs] of styles) {
        if (want.size && !want.has(t)) continue;
        for (const [s, e] of subs) {
          if (!e || !e.length) continue;
          const f = path.join(dir, `poi${t}_sub${s}_bmp${e[0].bitmap}.png`);
          fs.writeFileSync(f, png(bitmap(a, e[0].bitmap)));
          console.log(f, e[0].w + '×' + e[0].h);
        }
      }
    }
  } else throw new Error('неизвестная команда ' + cmd);
}
