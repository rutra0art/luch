// Перенос данных из других браузеров: закладки, история и cookie (входы на сайты).
// Chromium-браузеры шифруют cookie ключом из связки ключей macOS — при первом
// импорте система сама спросит разрешение на доступ к записи «… Safe Storage».
const { session } = require('electron');
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SUPPORT = path.join(os.homedir(), 'Library', 'Application Support');

const CHROMIUM = [
  { id: 'chrome', name: 'Google Chrome', dir: 'Google/Chrome', keychain: 'Chrome Safe Storage' },
  { id: 'arc', name: 'Arc', dir: 'Arc/User Data', keychain: 'Arc Safe Storage' },
  { id: 'dia', name: 'Dia', dir: 'Dia/User Data', keychain: 'Dia Safe Storage' },
  { id: 'edge', name: 'Microsoft Edge', dir: 'Microsoft Edge', keychain: 'Microsoft Edge Safe Storage' },
  { id: 'brave', name: 'Brave', dir: 'BraveSoftware/Brave-Browser', keychain: 'Brave Safe Storage' },
  { id: 'yandex', name: 'Яндекс Браузер', dir: 'Yandex/YandexBrowser', keychain: 'Yandex Safe Storage' },
  { id: 'vivaldi', name: 'Vivaldi', dir: 'Vivaldi', keychain: 'Vivaldi Safe Storage' },
  { id: 'opera', name: 'Opera', dir: 'com.operasoftware.Opera', keychain: 'Opera Safe Storage', flat: true },
  { id: 'chromium', name: 'Chromium', dir: 'Chromium', keychain: 'Chromium Safe Storage' },
];

const run = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, { maxBuffer: 512 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
});

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

// Браузер держит свои базы открытыми, поэтому читаем копию вместе с журналом WAL
async function querySqlite(dbPath, sql) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'luch-import-'));
  try {
    const copy = path.join(tmp, 'db');
    fs.copyFileSync(dbPath, copy);
    for (const ext of ['-wal', '-shm']) {
      if (exists(dbPath + ext)) fs.copyFileSync(dbPath + ext, copy + ext);
    }
    const out = await run('/usr/bin/sqlite3', ['-json', copy, sql]);
    return out.trim() ? JSON.parse(out) : [];
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function chromiumProfiles(b) {
  const root = path.join(SUPPORT, b.dir);
  if (!exists(root)) return [];
  if (b.flat) return exists(path.join(root, 'History')) ? [{ id: '', name: 'Основной', path: root }] : [];
  let names = {};
  try { names = JSON.parse(fs.readFileSync(path.join(root, 'Local State'), 'utf8')).profile?.info_cache || {}; } catch {}
  return fs.readdirSync(root)
    .filter(d => (d === 'Default' || /^Profile \d+$/.test(d)) && exists(path.join(root, d, 'History')))
    .map(d => ({ id: d, name: names[d]?.name || (d === 'Default' ? 'Основной' : d), path: path.join(root, d) }));
}

function firefoxProfiles() {
  const root = path.join(SUPPORT, 'Firefox', 'Profiles');
  if (!exists(root)) return [];
  return fs.readdirSync(root)
    .filter(d => exists(path.join(root, d, 'places.sqlite')))
    .map(d => ({ id: d, name: d.replace(/^[^.]+\./, ''), path: path.join(root, d) }));
}

// Список браузеров и профилей, из которых есть что перенести
function detect() {
  const list = [];
  for (const b of CHROMIUM) {
    const profiles = chromiumProfiles(b);
    if (profiles.length) list.push({ id: b.id, name: b.name, profiles: profiles.map(({ id, name }) => ({ id, name })) });
  }
  const ff = firefoxProfiles();
  if (ff.length) list.push({ id: 'firefox', name: 'Firefox', profiles: ff.map(({ id, name }) => ({ id, name })) });
  return list;
}

// ---------- Chromium ----------

// Время Chromium — микросекунды с 1601 года
const fromChromeTime = (t) => (Number(t) ? Number(t) / 1000 - 11644473600000 : 0);

async function chromiumHistory(dir) {
  const rows = await querySqlite(path.join(dir, 'History'),
    'SELECT url, title, last_visit_time AS t FROM urls WHERE hidden = 0 ORDER BY last_visit_time DESC LIMIT 5000');
  return rows.filter(r => /^https?:/.test(r.url)).map(r => ({ url: r.url, title: r.title || '', ts: Math.round(fromChromeTime(r.t)) }));
}

function chromiumBookmarks(dir) {
  const file = path.join(dir, 'Bookmarks');
  if (!exists(file)) return [];
  const out = [];
  const walk = (node, folder) => {
    if (node.type === 'url' && /^https?:/.test(node.url)) out.push({ title: node.name || node.url, url: node.url, folder });
    for (const child of node.children || []) walk(child, node.type === 'folder' && node.name ? node.name : folder);
  };
  const roots = JSON.parse(fs.readFileSync(file, 'utf8')).roots || {};
  for (const [key, node] of Object.entries(roots)) {
    if (node && typeof node === 'object' && node.children) walk({ ...node, name: '' }, key === 'bookmark_bar' ? 'Панель закладок' : 'Другие закладки');
  }
  return out;
}

async function chromiumKey(service) {
  // macOS покажет окно с просьбой разрешить доступ к «… Safe Storage» — решает пользователь
  const password = (await run('/usr/bin/security', ['find-generic-password', '-w', '-s', service])).trim();
  return crypto.pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
}

function decryptCookie(hex, key, stripDomainHash) {
  const buf = Buffer.from(hex, 'hex');
  const prefix = buf.subarray(0, 3).toString();
  if (prefix !== 'v10' && prefix !== 'v11') return null;
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '));
  let plain = Buffer.concat([decipher.update(buf.subarray(3)), decipher.final()]);
  // Начиная с версии базы 24 перед значением лежит SHA-256 домена (32 байта)
  if (stripDomainHash) plain = plain.subarray(32);
  return plain.toString('utf8');
}

const CHROME_SAME_SITE = { '-1': 'unspecified', 0: 'no_restriction', 1: 'lax', 2: 'strict' };

async function chromiumCookies(dir, service) {
  const db = [path.join(dir, 'Network', 'Cookies'), path.join(dir, 'Cookies')].find(exists);
  if (!db) return [];
  const key = await chromiumKey(service);
  const meta = await querySqlite(db, "SELECT value FROM meta WHERE key = 'version'");
  const strip = Number(meta[0]?.value || 0) >= 24;
  const rows = await querySqlite(db,
    'SELECT host_key AS host, name, value, hex(encrypted_value) AS ev, path, expires_utc AS exp, is_secure AS secure, is_httponly AS httpOnly, samesite FROM cookies');
  const now = Date.now() / 1000;
  const out = [];
  for (const r of rows) {
    let value = r.value;
    if (!value && r.ev) {
      try { value = decryptCookie(r.ev, key, strip); } catch { value = null; }
    }
    if (value == null) continue;
    const expires = Number(r.exp) ? fromChromeTime(r.exp) / 1000 : 0;
    if (expires && expires < now) continue;
    out.push({
      host: r.host, name: r.name, value, path: r.path || '/', expires,
      secure: Boolean(r.secure), httpOnly: Boolean(r.httpOnly), sameSite: CHROME_SAME_SITE[r.samesite],
    });
  }
  return out;
}

// ---------- Firefox ----------

async function firefoxHistory(dir) {
  const rows = await querySqlite(path.join(dir, 'places.sqlite'),
    'SELECT url, title, last_visit_date AS t FROM moz_places WHERE last_visit_date IS NOT NULL ORDER BY last_visit_date DESC LIMIT 5000');
  return rows.filter(r => /^https?:/.test(r.url)).map(r => ({ url: r.url, title: r.title || '', ts: Math.round(Number(r.t) / 1000) }));
}

async function firefoxBookmarks(dir) {
  const rows = await querySqlite(path.join(dir, 'places.sqlite'),
    'SELECT b.title AS title, p.url AS url, f.title AS folder FROM moz_bookmarks b JOIN moz_places p ON p.id = b.fk LEFT JOIN moz_bookmarks f ON f.id = b.parent WHERE b.type = 1');
  return rows.filter(r => /^https?:/.test(r.url)).map(r => ({ title: r.title || r.url, url: r.url, folder: r.folder || 'Закладки' }));
}

async function firefoxCookies(dir) {
  const db = path.join(dir, 'cookies.sqlite');
  if (!exists(db)) return [];
  const rows = await querySqlite(db,
    'SELECT host, name, value, path, expiry, isSecure AS secure, isHttpOnly AS httpOnly, sameSite FROM moz_cookies');
  const now = Date.now() / 1000;
  return rows
    // В новых версиях Firefox срок хранится в миллисекундах, в старых — в секундах
    .map(r => ({ ...r, expires: Number(r.expiry) > 1e11 ? Number(r.expiry) / 1000 : Number(r.expiry) }))
    .filter(r => !r.expires || r.expires > now)
    .map(r => ({
      host: r.host, name: r.name, value: r.value, path: r.path || '/', expires: r.expires,
      secure: Boolean(r.secure), httpOnly: Boolean(r.httpOnly), sameSite: { 0: 'no_restriction', 1: 'lax', 2: 'strict' }[r.sameSite],
    }));
}

// ---------- Запись cookie в сессию пространства ----------

async function writeCookies(ses, cookies) {
  let ok = 0;
  for (const c of cookies) {
    const host = c.host.replace(/^\./, '');
    const details = {
      url: `${c.secure ? 'https' : 'http'}://${host}${c.path}`,
      name: c.name,
      value: c.value,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
    };
    // Cookie с точкой в начале действует на все поддомены, без неё — только на этот хост
    if (c.host.startsWith('.')) details.domain = c.host;
    if (c.expires) details.expirationDate = c.expires;
    if (c.sameSite && c.sameSite !== 'unspecified') details.sameSite = c.sameSite;
    try { await ses.cookies.set(details); ok++; } catch {}
  }
  await ses.cookies.flushStore();
  return ok;
}

function sessionFor(partition) {
  return partition ? session.fromPartition(partition) : session.defaultSession;
}

// what: { bookmarks, history, cookies }; partition — сессия пространства, куда переносятся входы
async function runImport({ browser, profile, what, partition }) {
  const result = { history: [], bookmarks: [], cookies: 0, errors: [] };
  const step = async (label, fn) => {
    try { await fn(); } catch (err) { result.errors.push(`${label}: ${String(err.message || err).split('\n')[0]}`); }
  };

  let src;
  if (browser === 'firefox') {
    const p = firefoxProfiles().find(x => x.id === profile);
    if (!p) throw new Error('Профиль Firefox не найден');
    src = { history: () => firefoxHistory(p.path), bookmarks: () => firefoxBookmarks(p.path), cookies: () => firefoxCookies(p.path) };
  } else {
    const b = CHROMIUM.find(x => x.id === browser);
    const p = b && chromiumProfiles(b).find(x => x.id === profile);
    if (!p) throw new Error('Профиль браузера не найден');
    src = { history: () => chromiumHistory(p.path), bookmarks: async () => chromiumBookmarks(p.path), cookies: () => chromiumCookies(p.path, b.keychain) };
  }

  if (what.history) await step('История', async () => { result.history = await src.history(); });
  if (what.bookmarks) await step('Закладки', async () => { result.bookmarks = await src.bookmarks(); });
  if (what.cookies) await step('Входы на сайты', async () => { result.cookies = await writeCookies(sessionFor(partition), await src.cookies()); });
  return result;
}

module.exports = { detect, runImport };
// Для тестов
module.exports._test = { decryptCookie, fromChromeTime, chromiumBookmarks };
