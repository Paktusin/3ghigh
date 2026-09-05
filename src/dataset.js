'use strict';
// Поиск каталога навигационного набора — того, внутри которого лежит pkgdb.
//
// Порядок проверки: явный аргумент, переменная окружения MMI3G_MAPS,
// каталог maps рядом с репозиторием, сам корень репозитория, текущий каталог.
// Сами данные в репозитории не хранятся, поэтому путь к ним ищется, а не задан.

const fs = require('fs');
const path = require('path');

function candidates(explicit) {
  const repo = path.join(__dirname, '..');
  const list = [];
  if (explicit) list.push(explicit);
  if (process.env.MMI3G_MAPS) list.push(process.env.MMI3G_MAPS);
  list.push(path.join(repo, 'maps'), repo, '.');
  return list;
}

function resolveRoot(explicit) {
  for (const c of candidates(explicit))
    if (fs.existsSync(path.join(c, 'pkgdb'))) return c;
  throw new Error('каталог набора не найден (нет подкаталога pkgdb). Проверено: ' +
    candidates(explicit).map(c => path.resolve(c)).join(', ') +
    '. Укажите путь аргументом или задайте MMI3G_MAPS.');
}

// Первый существующий файл по шаблону пути внутри набора, например
// pick(root, 'pkgdb/TMC3GP', 'pkgdb/TMC') вернёт тот каталог, который есть.
function pick(root, ...rel) {
  for (const r of rel) {
    const p = path.join(root, r);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

module.exports = { resolveRoot, pick };
