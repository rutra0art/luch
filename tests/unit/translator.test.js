// Модульные тесты онлайн-перевода: разбор ответов Google в разных форматах (сеть подменена)
const test = require('node:test');
const assert = require('node:assert/strict');
const { translateOnline } = require('../../src/translator')._test;

function mockFetch(payload, { ok = true, status = 200 } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: String(init.body) });
    return { ok, status, json: async () => payload };
  };
  return calls;
}

test('язык определяет Google: ответы вида [перевод, язык]', async () => {
  const calls = mockFetch([['Привет', 'en'], ['Магазин', 'en']]);
  const r = await translateOnline(['Hello', 'Store'], 'ru');
  assert.deepEqual(r.translations, ['Привет', 'Магазин']);
  assert.equal(r.source, 'en');
  assert.match(calls[0].url, /sl=auto/);
  assert.match(calls[0].body, /q=Hello&q=Store/);
});

test('язык задан: ответы — простые строки', async () => {
  const calls = mockFetch(['Привет', 'Магазин']);
  const r = await translateOnline(['Hello', 'Store'], 'ru', 'en');
  assert.deepEqual(r.translations, ['Привет', 'Магазин']);
  assert.equal(r.source, 'en');
  assert.match(calls[0].url, /sl=en/);
});

test('одна строка с автоопределением приходит без внешнего массива', async () => {
  mockFetch(['Привет', 'en']);
  const r = await translateOnline(['Hello'], 'ru');
  assert.deepEqual(r.translations, ['Привет']);
  assert.equal(r.source, 'en');
});

test('одна строка с заданным языком', async () => {
  mockFetch(['Привет']);
  const r = await translateOnline(['Hello'], 'ru', 'en');
  assert.deepEqual(r.translations, ['Привет']);
});

test('ошибка сервера — исключение (сработает запасной перевод macOS)', async () => {
  mockFetch({}, { ok: false, status: 429 });
  await assert.rejects(() => translateOnline(['Hello'], 'ru', 'en'), /429/);
});

test('неполный ответ — исключение, а не сдвиг переводов', async () => {
  mockFetch(['Привет']);
  await assert.rejects(() => translateOnline(['Hello', 'Store'], 'ru', 'en'), /неполный/);
});
