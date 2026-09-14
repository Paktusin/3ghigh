'use strict';
// Обновление .conf компонента под изменившийся файл данных.
//
// В отличие от rewriteConf внутри relocate.js, здесь правится и `size=` — это
// нужно, когда том вырос (дозапись блобов в .gd2). Если размер не обновить,
// установщик отвергает компонент.
//
// Три пробы `check=qa` — это MD5 трёх кусков по 102 400 байт:
//   #1  смещение 0
//   #2  size / 2 (целочисленно)
//   #3  size - 102400 - 1
// У третьей пробы смещение на байт меньше, чем дало бы «последние 102 400»:
// чтение кончается за байт до конца файла. Это ошибка на единицу в коде
// производителя, но повторять её обязательно — иначе значение не сойдётся.
// Файл короче пробы читается целиком, и все три значения совпадают.
//
// `checkcrc` не пересчитывается: алгоритм не вскрыт. На устройстве проверка
// целостности выключена («database checking is not enabled»), а установщик его
// не сверяет — см. README.
//
//   node src/conf.js <файл.conf> <файл данных>

const fs = require('fs');
const crypto = require('crypto');

const QA = 102400;

function md5File(p) {
  const h = crypto.createHash('md5');
  const fd = fs.openSync(p, 'r');
  const size = fs.statSync(p).size;
  const buf = Buffer.alloc(1 << 22);
  let done = 0;
  while (done < size) {
    const k = fs.readSync(fd, buf, 0, Math.min(buf.length, size - done), done);
    if (k <= 0) break;
    h.update(buf.subarray(0, k)); done += k;
  }
  fs.closeSync(fd);
  return h.digest('hex');
}

function md5Chunk(p, off, n) {
  const h = crypto.createHash('md5');
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(n);
  const k = fs.readSync(fd, buf, 0, n, off);
  fs.closeSync(fd);
  h.update(buf.subarray(0, k));
  return h.digest('hex');
}

function qaProbes(p) {
  const size = fs.statSync(p).size;
  const offs = size <= QA ? [0, 0, 0] : [0, Math.floor(size / 2), size - QA - 1];
  return offs.map(off => md5Chunk(p, off, QA));
}

// обновить .conf на месте под текущее состояние файла данных
function updateConf(confPath, dataPath) {
  const size = fs.statSync(dataPath).size;
  let t = fs.readFileSync(confPath, 'latin1');
  const before = { size: /^size=(\d+)/m.exec(t), md5: /^MD5=([0-9a-f]+)/m.exec(t) };
  t = t.replace(/^size=\d+/m, 'size=' + size);
  t = t.replace(/^MD5=[0-9a-f]+/m, 'MD5=' + md5File(dataPath));
  t = t.replace(/^check=qa,100,[0-9a-f]+,[0-9a-f]+,[0-9a-f]+/m,
    'check=qa,100,' + qaProbes(dataPath).join(','));
  fs.writeFileSync(confPath, Buffer.from(t, 'latin1'));
  return { size, sizeBefore: before.size && Number(before.size[1]), md5Before: before.md5 && before.md5[1] };
}

module.exports = { updateConf, md5File, qaProbes, QA };

if (require.main === module) {
  const [, , confPath, dataPath] = process.argv;
  if (!confPath || !dataPath) {
    console.error('использование: node src/conf.js <файл.conf> <файл данных>');
    process.exit(1);
  }
  const r = updateConf(confPath, dataPath);
  console.log(confPath);
  console.log('  size : ' + r.sizeBefore + ' → ' + r.size + (r.sizeBefore === r.size ? '  (не менялся)' : ''));
  console.log('  MD5  : ' + r.md5Before + ' → ' + md5File(dataPath));
  console.log('  check=qa пересчитан (3 пробы по ' + QA + ' б)');
  console.log('  checkcrc НЕ пересчитан — алгоритм не вскрыт, на устройстве проверка выключена');
}
