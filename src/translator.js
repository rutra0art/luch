// Переводчик Luch. Основной способ — онлайн через Google (без ключа): отправляется только текст,
// перевод подставляется прямо на странице. Запасной — встроенный перевод macOS (Translation
// framework), он работает без интернета. Помощники на Swift собираются из src/native при первом
// использовании и лежат в папке данных программы.
const { app } = require('electron');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const binDir = () => path.join(app.getPath('userData'), 'bin');
const HELPERS = {
  translate: { src: 'translate.swift', flags: [] },
  prepare: { src: 'prepare.swift', flags: ['-parse-as-library'] },
};

const building = new Map();

// Собираем помощника, если его нет или исходник новее
function ensureBuilt(name) {
  if (building.has(name)) return building.get(name);
  const { src, flags } = HELPERS[name];
  const source = path.join(__dirname, 'native', src);
  const out = path.join(binDir(), `luch-${name}`);
  const promise = (async () => {
    let fresh = false;
    try { fresh = fs.statSync(out).mtimeMs >= fs.statSync(source).mtimeMs; } catch {}
    if (fresh) return out;
    fs.mkdirSync(binDir(), { recursive: true });
    await new Promise((resolve, reject) => {
      execFile('/usr/bin/xcrun', ['swiftc', '-O', ...flags, source, '-o', out], { timeout: 300000 }, (err) => {
        if (err) reject(new Error('Не удалось собрать переводчик: нужны инструменты разработчика Xcode'));
        else resolve();
      });
    });
    return out;
  })();
  building.set(name, promise);
  promise.catch(() => building.delete(name));
  return promise;
}

// ---------- Постоянно запущенный переводчик ----------

let proc = null;
let buffer = '';
let nextId = 1;
const pending = new Map();

async function helper() {
  if (proc && proc.exitCode === null) return proc;
  const bin = await ensureBuilt('translate');
  proc = spawn(bin, [], { stdio: ['pipe', 'pipe', 'ignore'] });
  buffer = '';
  proc.stdout.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      const p = pending.get(msg.id);
      if (!p) continue;
      pending.delete(msg.id);
      p.resolve(msg);
    }
  });
  proc.on('exit', () => {
    for (const p of pending.values()) p.resolve({ error: 'stopped' });
    pending.clear();
    proc = null;
  });
  return proc;
}

function send(job) {
  return helper().then((p) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, { resolve });
    p.stdin.write(JSON.stringify({ id, ...job }) + '\n');
  }));
}

// ---------- Онлайн-перевод через Google ----------

const ONLINE_URL = 'https://translate.googleapis.com/translate_a/t';

async function translateOnline(texts, target, source) {
  const params = new URLSearchParams({ client: 'gtx', sl: source && source !== 'und' ? source : 'auto', tl: target });
  const body = new URLSearchParams();
  for (const t of texts) body.append('q', t);
  const res = await fetch(`${ONLINE_URL}?${params}`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Google: ${res.status}`);
  const data = await res.json();
  // При sl=auto каждый ответ — [перевод, язык]; при заданном языке — просто строка.
  // Если строка в запросе одна, ответ приходит без внешнего массива
  const list = texts.length === 1 && !Array.isArray(data[0]) && typeof data[0] === 'string' && params.get('sl') === 'auto'
    ? [data]
    : data;
  const translations = list.map((x) => (Array.isArray(x) ? x[0] : x));
  if (translations.length !== texts.length) throw new Error('Google вернул неполный перевод');
  const detected = list.find(Array.isArray)?.[1];
  return { translations, source: source && source !== 'und' ? source : detected || 'und', engine: 'online' };
}

// Перевод на Mac: { translations, source } или { error, source }: not-installed, unsupported, stopped…
function translateOffline(texts, target, source) {
  return send({ texts, target, source: source || null }).then((r) => ({ ...r, engine: 'offline' }));
}

// engine: 'online' — Google, при сбое сети запасной перевод macOS; 'offline' — только на Mac
async function translate(texts, target, source, engine = 'online') {
  if (engine === 'online') {
    try {
      return await translateOnline(texts, target, source);
    } catch {
      return translateOffline(texts, target, source);
    }
  }
  return translateOffline(texts, target, source);
}

// Язык всей страницы по большому куску текста и атрибуту lang
async function detect(sample, hint) {
  const r = await send({ texts: [sample], target: 'en', hint: hint || null, detectOnly: true });
  return r.source || 'und';
}

// Показывает системный диалог macOS для скачивания языкового пакета.
// Повторный запрос той же пары ждёт уже идущую загрузку, а не открывает второе окно
const preparing = new Map();
function prepare(source, target) {
  const key = `${source}>${target}`;
  if (preparing.has(key)) return preparing.get(key);
  const promise = ensureBuilt('prepare').then((bin) => new Promise((resolve) => {
    execFile(bin, [source, target], { timeout: 600000 }, (_err, stdout) => resolve(String(stdout).trim().startsWith('ok')));
  }));
  preparing.set(key, promise);
  promise.finally(() => preparing.delete(key));
  return promise;
}

// Собираем заранее, чтобы первый перевод не ждал компиляции
function warmUp() {
  ensureBuilt('translate').catch(() => {});
  ensureBuilt('prepare').catch(() => {});
}

function stop() { proc?.kill(); }

module.exports = { translate, detect, prepare, warmUp, stop };
// Для тестов
module.exports._test = { translateOnline };
