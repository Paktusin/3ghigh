'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const fldb = require('./fldb');

// Сумма записи каталога у томов LIT считается по двум гигабайтам, и целиком в
// буфер такую запись читать незачем. Потоковый счёт обязан давать то же самое,
// что счёт по буферу, — включая хвост в неполные четыре байта.
function tmp(buf) {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fldb-')), 'data.bin');
  fs.writeFileSync(p, buf);
  return p;
}

const fill = (n) => {
  const b = Buffer.alloc(n);
  for (let i = 0; i < n; i++) b[i] = (i * 31 + 7) & 0xff;
  return b;
};

test('потоковая сумма совпадает с суммой по буферу', () => {
  for (const n of [0, 1, 2, 3, 4, 5, 7, 8, 1000, 1001, 1002, 1003, 65536]) {
    const b = fill(n);
    const fd = fs.openSync(tmp(b), 'r');
    assert.equal(fldb.checksumFd(fd, 0, n), fldb.checksum(b), 'длина ' + n);
    fs.closeSync(fd);
  }
});

test('размер куска на результат не влияет', () => {
  const b = fill(100003);
  const fd = fs.openSync(tmp(b), 'r');
  const want = fldb.checksum(b);
  for (const c of [4, 8, 4096, 1 << 16, 1 << 22]) {
    assert.equal(fldb.checksumFd(fd, 0, b.length, c), want, 'кусок ' + c);
  }
  fs.closeSync(fd);
});

test('запись читается со своего смещения, а не с начала файла', () => {
  const head = fill(2048), body = fill(5001);
  const fd = fs.openSync(tmp(Buffer.concat([head, body])), 'r');
  assert.equal(fldb.checksumFd(fd, head.length, body.length), fldb.checksum(body));
  fs.closeSync(fd);
});
