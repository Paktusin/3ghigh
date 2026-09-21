'use strict';
// Проверка разбора разделов .xac/.xah. Тесты автономные: разделы собираются
// здесь же, карта не нужна.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const xac = require('./xac');

// Раздел: имя 16 байт, u32 BE длины полезной части, сама часть.
function section(name, payload) {
  const head = Buffer.alloc(20);
  head.write(name.padEnd(16, ' '), 0, 16, 'ascii');
  head.writeUInt32BE(payload.length, 16);
  return Buffer.concat([head, payload]);
}

test('разделы: имя, размер и сплошное покрытие', () => {
  const buf = Buffer.concat([
    section('XAC HEADER', Buffer.alloc(8)),
    section('ZF-NAMEN', Buffer.alloc(12)),
  ]);
  const s = xac.sections(buf);
  assert.equal(s.complete, true);
  assert.deepEqual(s.list.map((x) => [x.name, x.total]), [['XAC HEADER', 28], ['ZF-NAMEN', 32]]);
});

// Реестр COUNTRY: 216 записей по 10 байт со смещения 64 ОТ НАЧАЛА РАЗДЕЛА,
// то есть с 44-го байта полезной части (первые 20 байт — имя и размер).
function countrySection(rows) {
  const p = Buffer.alloc(44 + 216 * 10);
  rows.forEach(([i, cc, iso2, iso3, car]) => {
    const at = 44 + i * 10;
    p.write(cc, at, 2, 'ascii');
    p.write(iso2, at + 2, 2, 'ascii');
    p.write(iso3, at + 4, 3, 'ascii');
    p.write(car, at + 7, 3, 'ascii');
  });
  return section('COUNTRY', p);
}

test('реестр COUNTRY: код для шапки блока — номер записи плюс один', () => {
  // Номера как в настоящем индексе: Германия первая, Кипр 112-й.
  const xah = Buffer.concat([
    section('STRING', Buffer.alloc(4)),
    countrySection([[0, 'DE', 'DE', 'DEU', 'D'], [111, 'BY', 'BY', 'BLR', 'BY'],
                    [112, 'CY', 'CY', 'CYP', 'CY']]),
  ]);
  const all = xac.countries(xah);
  assert.equal(all.length, 216);
  assert.deepEqual(all[0], { code: 1, cc: 'DE', iso2: 'DE', iso3: 'DEU', car: 'D' });
  assert.equal(all[112].cc, 'CY');
  assert.equal(all[112].code, 113);              // поле 0x3a Кипра
  assert.equal(xac.countryCode(xah, 'CY'), 113);
  assert.equal(xac.countryCode(xah, 'cyp'), 113);
  assert.equal(xac.countryCode(xah, 'DE'), 1);
  assert.equal(xac.countryCode(xah, 'BY'), 112); // сосед по реестру, не Кипр
  assert.equal(xac.countryCode(xah, 'ZZ'), null);
});

test('реестр COUNTRY: без раздела не молчим', () => {
  assert.throws(() => xac.countries(section('STRING', Buffer.alloc(4))), /COUNTRY/);
});
