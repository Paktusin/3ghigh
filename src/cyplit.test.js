'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const CL = require('./cyplit');
const LF = require('./litfile');

// Образец заголовка: сборщику от него нужны только байты, которые он переносит
// в свой файл, поля каталога он проставляет сам.
function template() {
  const head = Buffer.alloc(368);
  head.writeUInt32BE(LF.MAGIC, 0);
  head.writeUInt16BE(1, LF.F.version);              // версия 12
  return { head, ttd: Buffer.alloc(7896) };
}

// Точки раскиданы по рамке, чтобы деление дерева было осмысленным.
const pois = (n) => Array.from({ length: n }, (_, i) => ({
  x: 2318400 + (i % 100) * 37, y: 3833333 + Math.floor(i / 100) * 41,
  name: 'ТОЧКА ' + i, cat: 56,
}));

test('блок узлов идёт нулевым, листья — с первого и подряд', () => {
  const r = CL.build(pois(400), { template: template(), cap: 2000 });
  const m = LF.read(r.buf);
  assert.equal(m.header.count, r.leaves + 1, 'блоков: узлы плюс листья');
  assert.ok(r.leaves > 1, 'при малом потолке лист обязан поделиться');
  for (let i = 0; i + 1 < m.catalog.length; i++) {
    assert.equal(m.catalog[i + 1].off, m.catalog[i].off + m.catalog[i].size, 'без дыр');
  }
  assert.equal(m.blocks[CL.NODE].length, r.node);
});

test('все точки расходятся по листьям и ни одна не теряется', () => {
  const r = CL.build(pois(250), { template: template(), cap: 1500 });
  assert.equal(r.pois, 250);
});

test('потолок листа соблюдается', () => {
  const cap = 1200;
  const r = CL.build(pois(300), { template: template(), cap });
  const m = LF.read(r.buf);
  for (let i = 1; i < m.blocks.length; i++) {
    assert.ok(m.blocks[i].length <= cap, 'лист ' + i + ': ' + m.blocks[i].length + ' > ' + cap);
  }
});

test('чем ниже потолок, тем больше листьев', () => {
  const a = CL.build(pois(400), { template: template(), cap: 4000 });
  const b = CL.build(pois(400), { template: template(), cap: 1000 });
  assert.ok(b.leaves > a.leaves, a.leaves + ' -> ' + b.leaves);
});

test('слотов может не хватить, и это говорится вслух', () => {
  assert.throws(() => CL.build(pois(400), { template: template(), cap: 400, slots: 2 }),
                /не сошлось|не влезает/);
});
