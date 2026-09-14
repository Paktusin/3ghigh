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

  const chunks = [region];
  let pos = regionEnd;
  const put = buf => { const at = pos; chunks.push(buf); pos += buf.length; return at; };

  const report = [];
  for (const L of h.levels) {
    const gr = gm.levelGrid(g, h, L);
    if (!gr) { report.push('L' + L.i + ': таблица не найдена — пропущен'); continue; }

    // общий пустой кластер переносим один раз на уровень
    const emptyBlob = gm.read(g, gr.emptyOff, gr.entries.find(e => e.off === gr.emptyOff).sz);
    const emptyAt = put(emptyBlob);

    // какие кластеры сохраняем: окно вокруг точки (только там, где сетка выверена)
    const keep = new Set();
    if (!gr.table.lowGrid && gr.W) {
      const cx = Math.round((11264 + 93.1 * lon) / (1 << gr.head.potX));
      const cy = Math.round((934 + 181.8 * lat) / (1 << gr.head.potY));
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const s = (cy + dy) * gr.W + (cx + dx);
          if (s >= 0 && s < gr.entries.length) keep.add(s);
        }
    }

    // переносим сохраняемые кластеры вместе с их тайлами
    const newEntries = gr.entries.map(e => ({ off: emptyAt, sz: emptyBlob.length }));
    let kept = 0, tiles = 0;
    for (const slot of keep) {
      const e = gr.entries[slot];
      if (!e || e.off < regionEnd || e.off === gr.emptyOff || e.sz === 0) continue;
      const blob = Buffer.from(gm.read(g, e.off, e.sz));
      const c = gm.cluster(g, h, e.off, e.sz);
      // сначала кладём тайлы, потом правим записи в копии блоба кластера
      for (let k = 0; k < c.tiles.length; k++) {
        const t = c.tiles[k];
        if (t.off === 0 || t.size === 0) continue;
        const tileAt = put(Buffer.from(gm.read(g, t.off, t.size)));
        blob.writeUInt32BE(tileAt, k * 19 + 11);
        blob.writeUInt32BE(t.size, k * 19 + 15);
        tiles++;
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
  console.log('.gd2 записан нулевой длины; .conf скопированы — перед установкой обновить size/MD5/check=qa');
}
