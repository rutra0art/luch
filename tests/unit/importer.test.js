// Модульные тесты импорта из других браузеров: расшифровка cookie, время Chromium, закладки
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { decryptCookie, fromChromeTime, chromiumBookmarks } = require('../../src/importer')._test;

// Шифруем значение так же, как Chromium на macOS: AES-128-CBC, IV из 16 пробелов, префикс v10
function chromeEncrypt(value, key, domainHash = null) {
  const cipher = crypto.createCipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '));
  const plain = domainHash ? Buffer.concat([domainHash, Buffer.from(value)]) : Buffer.from(value);
  return Buffer.concat([Buffer.from('v10'), cipher.update(plain), cipher.final()]).toString('hex');
}

const key = crypto.pbkdf2Sync('test-password', 'saltysalt', 1003, 16, 'sha1');

test('расшифровывает cookie старого формата', () => {
  assert.equal(decryptCookie(chromeEncrypt('session=abc123', key), key, false), 'session=abc123');
});

test('отрезает хэш домена у cookie версии 24 и новее', () => {
  const domainHash = crypto.createHash('sha256').update('.example.com').digest();
  assert.equal(decryptCookie(chromeEncrypt('token-xyz', key, domainHash), key, true), 'token-xyz');
});

test('пропускает значения без префикса v10/v11', () => {
  assert.equal(decryptCookie(Buffer.from('plain').toString('hex'), key, false), null);
});

test('переводит время Chromium (микросекунды с 1601 года) в миллисекунды Unix', () => {
  const unixMs = Date.UTC(2026, 0, 1);
  assert.equal(Math.round(fromChromeTime((unixMs + 11644473600000) * 1000)), unixMs);
  assert.equal(fromChromeTime(0), 0);
});

test('читает закладки Chrome с папками и пропускает не-веб ссылки', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luch-test-'));
  try {
    fs.writeFileSync(path.join(dir, 'Bookmarks'), JSON.stringify({
      roots: {
        bookmark_bar: { type: 'folder', name: 'Bookmarks bar', children: [
          { type: 'url', name: 'Example', url: 'https://example.com/' },
          { type: 'folder', name: 'Работа', children: [{ type: 'url', name: 'Docs', url: 'https://docs.example.com/' }] },
          { type: 'url', name: 'Локальный файл', url: 'file:///tmp/x.html' },
        ] },
        other: { type: 'folder', name: 'Other', children: [{ type: 'url', name: 'Wiki', url: 'https://ru.wikipedia.org/' }] },
      },
    }));
    assert.deepEqual(chromiumBookmarks(dir), [
      { title: 'Example', url: 'https://example.com/', folder: 'Панель закладок' },
      { title: 'Docs', url: 'https://docs.example.com/', folder: 'Работа' },
      { title: 'Wiki', url: 'https://ru.wikipedia.org/', folder: 'Другие закладки' },
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('нет файла закладок — пустой список', () => {
  assert.deepEqual(chromiumBookmarks(path.join(os.tmpdir(), 'luch-nonexistent-dir')), []);
});
