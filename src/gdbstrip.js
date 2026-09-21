'use strict';
// Урезанный том GDB: оставить данные только вокруг заданной точки (по умолчанию
// Кипр), всё остальное перевести на общий пустой кластер.
//
// Зачем: полный набор — 3,6 ГБ на два тома, и каждый цикл проверки на машине
// упирается в копирование. Структура это позволяет: большинство клеток и так
// ссылаются на ОДИН общий пустой кластер, а таблица кластеров лежит в области
// уровней (751 КБ) и переписывается целиком.
//
// Состав нового тома:
//   [0 … regionEnd)  область уровней как есть (шапка, таблицы уровней и кластеров)
//   далее            общий пустой кластер, общий пустой тайл,
//                    затем сохраняемые кластеры и их тайлы
// После сборки все записи таблицы кластеров переписываются на новые смещения,
// а несохраняемые — на общий пустой кластер.
//
// ВАЖНО: тома .gdb и .gd2 логически один файл со сквозными смещениями. Урезанный
// том делается одним файлом .gdb, а .gd2 становится пустым (нулевой длины), что
// допустимо — сквозных ссылок за границу просто не остаётся.
//
//   node src/gdbstrip.js maps --out out/cyprus-only [--around 33.36,35.17] [--radius 3]

const fs = require('fs');
const path = require('path');
const gm = require('./gdb');
const dataset = require('./dataset');

function strip(root, outDir, lon, lat, radius) {
  const g = gm.openGdb(root);
  const h = gm.header(g);
  const regionEnd = h.regionEnd;

  // область уровней — как есть
  const region = gm.read(g, 0, regionEnd);

  // За областью уровней в оригинале лежит каталог блобов (44 747 пар) и 318 МБ
  // самих блобов; урезанный том их не несёт, а поля шапки на них указывают —
  // и указывали бы в наши же кластеры. Обнуляем: пусть каталог будет пустым,
  // а не ложным. Поле «начало данных» (+589) остаётся верным: область уровней
  // копируется целиком и её конец не двигается.
  region.writeUInt32BE(0, 577);      // число записей каталога
  region.writeUInt32BE(0, 581);      // смещение каталога
  region.writeUInt32BE(0, 585);      // его размер

  const chunks = [region];
  let pos = regionEnd;
  const put = buf => { const at = pos; chunks.push(buf); pos += buf.length; return at; };

  const report = [];
  for (const L of h.levels) {
    const gr = gm.levelGrid(g, h, L);
    if (!gr) { report.push('L' + L.i + ': таблица не найдена — пропущен'); continue; }

    // Общий пустой кластер переносим один раз на уровень. У части уровней его
    // нет вовсе (ни один указатель не повторяется) — тогда незанятые слоты
    // получают обычный пустой маркер {0, 0}.
    const emptyEntry = gr.entries.find(e => e.off === gr.emptyOff && e.sz > 0);
    const emptyBlob = emptyEntry ? gm.read(g, gr.emptyOff, emptyEntry.sz) : null;
    const emptyRef = emptyBlob ? { off: put(emptyBlob), sz: emptyBlob.length } : { off: 0, sz: 0 };

    // какие кластеры сохраняем: окно вокруг точки (только там, где сетка выверена).
    // Калибровка поуровневая: ячейка у каждого уровня своя, а мировая единица
    // общая — см. gm.cellOfLon/cellOfLat.
    const keep = new Set();
    if (!gr.table.lowGrid && gr.W) {
      const cx = Math.floor(gm.cellOfLon(lon, gr.head.cellX)) >> gr.head.potX;
      const cy = Math.floor(gm.cellOfLat(lat, gr.head.cellY)) >> gr.head.potY;
      // радиус задаётся в кластерах L0; на грубых уровнях кластер крупнее, и
      // тот же счёт кластеров захватил бы пол-Европы — пересчитываем окно в
      // градусы и берём столько кластеров, сколько их в этих градусах.
      const degX0 = (789 << 7) / gm.UNITS_PER_LON;          // кластер L0 в градусах
      const degY0 = (546 << 7) / gm.UNITS_PER_LAT;
      const degX = (gr.head.cellX << gr.head.potX) / gm.UNITS_PER_LON;
      const degY = (gr.head.cellY << gr.head.potY) / gm.UNITS_PER_LAT;
      const rx = Math.max(1, Math.round(radius * degX0 / degX));
      const ry = Math.max(1, Math.round(radius * degY0 / degY));
      for (let dy = -ry; dy <= ry; dy++)
        for (let dx = -rx; dx <= rx; dx++) {
          const s = (cy + dy) * gr.W + (cx + dx);
          if (s >= 0 && s < gr.entries.length) keep.add(s);
        }
    }

    // переносим сохраняемые кластеры вместе с их тайлами
    const newEntries = gr.entries.map(() => ({ off: emptyRef.off, sz: emptyRef.sz }));
    const moved = new Map();                     // блоб тайла → его новое место
    let kept = 0, tiles = 0;
    for (const slot of keep) {
      const e = gr.entries[slot];
      if (!e || e.off < regionEnd || e.off === gr.emptyOff || e.sz === 0) continue;
      const blob = Buffer.from(gm.read(g, e.off, e.sz));
      const c = gm.cluster(g, h, e.off, e.sz);
      // Сначала кладём тайлы, потом правим записи в копии блоба кластера.
      // Один и тот же блоб переносим один раз: в кластере до пятнадцати записей
      // из шестнадцати смотрят на общий пустой тайл, и копировать его столько же
      // раз — и расход, и потеря структуры оригинала.
      for (let k = 0; k < c.tiles.length; k++) {
        const t = c.tiles[k];
        if (t.off === 0 || t.size === 0) continue;
        let tileAt = moved.get(t.off + ':' + t.size);
        if (tileAt === undefined) {
          tileAt = put(Buffer.from(gm.read(g, t.off, t.size)));
          moved.set(t.off + ':' + t.size, tileAt);
          tiles++;
        }
        blob.writeUInt32BE(tileAt, k * 19 + 11);
        blob.writeUInt32BE(t.size, k * 19 + 15);
      }
      newEntries[slot] = { off: put(blob), sz: e.sz };
      kept++;
    }

    // переписать таблицу кластеров прямо в скопированной области уровней
    const base = L.offset + gr.table.start;
    for (let i = 0; i < gr.entries.length; i++) {
      region.writeUInt32BE(newEntries[i].off, base + i * 6);
      region.writeUInt16BE(newEntries[i].sz, base + i * 6 + 4);
    }
    report.push('L' + String(L.i).padStart(2) + ': кластеров ' + gr.entries.length +
      ', сохранено ' + kept + ', тайлов перенесено ' + tiles +
      (gr.table.lowGrid ? '  (сетка не выверена — всё пусто)' : ''));
    if (!gr.table.lowGrid && kept === 0) report.push('        (в окне вокруг точки данных нет)');
  }

  const outGdb = path.join(outDir, 'pkgdb', 'GDB');
  const outGd2 = path.join(outDir, 'pkgdb', 'GDB2');
  fs.mkdirSync(outGdb, { recursive: true });
  fs.mkdirSync(outGd2, { recursive: true });
  const name1 = path.basename(g.p1), name2 = g.p2 ? path.basename(g.p2) : null;
  fs.writeFileSync(path.join(outGdb, name1), Buffer.concat(chunks));
  if (name2) fs.writeFileSync(path.join(outGd2, name2), Buffer.alloc(0));
  // .conf копируем как есть — их size/MD5 обновляются отдельно перед установкой
  for (const [dir, out] of [['GDB', outGdb], ['GDB2', outGd2]]) {
    const src = path.join(root, 'pkgdb', dir);
    for (const f of fs.readdirSync(src)) if (f.endsWith('.conf')) fs.copyFileSync(path.join(src, f), path.join(out, f));
  }
  return { size: pos, report, file: path.join(outGdb, name1) };
}

module.exports = { strip };

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const root = dataset.resolveRoot(args.find(a => !a.startsWith('--') && !/^\d/.test(a)));
  const outDir = opt('--out') || 'out/cyprus-only';
  const [lon, lat] = (opt('--around') || '33.36,35.17').split(',').map(Number);
  const radius = Number(opt('--radius') || 3);

  console.log('=== урезанный том GDB вокруг ' + lon + '°E ' + lat + '°N, радиус ' + radius + ' кластеров ===');
  const r = strip(root, outDir, lon, lat, radius);
  r.report.forEach(l => console.log('  ' + l));
  console.log('\nитог: ' + r.file + ' — ' + r.size + ' б (' + (r.size / 1048576).toFixed(2) + ' МБ)');
  console.log('каталог блобов обнулён: 318 МБ блобов оригинала в урезанный том не переносятся');
  console.log('.gd2 записан нулевой длины; .conf скопированы — перед установкой обновить size/MD5/check=qa');
}
