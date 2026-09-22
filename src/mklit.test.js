'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const M = require('./mklit');

function dir(files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mklit-'));
  for (const [n, b] of Object.entries(files)) fs.writeFileSync(path.join(d, n), b);
  return d;
}

// Блоки cyptree лежат файлами `<номер>.bin`; номер — это позиция в каталоге
// LIT, а plan.json рядом с ними блоком не является.
test('блоки читаются по номерам и в порядке номеров', () => {
  const d = dir({ '112447.bin': Buffer.from([1]), '101169.bin': Buffer.from([2, 2]),
                  '112173.bin': Buffer.from([3, 3, 3]), 'plan.json': '{}',
                  'заметка.txt': 'не блок' });
  const got = M.readBlocks(d);
  assert.deepEqual(got.map((b) => b.blk), [101169, 112173, 112447]);
  assert.deepEqual(got.map((b) => b.bytes.length), [2, 3, 1]);
});

test('пустой каталог даёт пустой список', () => {
  assert.deepEqual(M.readBlocks(dir({ 'plan.json': '{}' })), []);
});
