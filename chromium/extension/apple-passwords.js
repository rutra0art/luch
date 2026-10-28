// Пароли Apple: Luch обращается к системному помощнику macOS — тому же, что у расширения
// iCloud Passwords в Chrome. Подключение подтверждается шестизначным кодом, который показывает
// macOS (протокол SRP, RFC 5054), дальше запросы шифруются AES-GCM общим ключом.
// Устройство протокола — по проекту apw (github.com/bendews/apw, GPL-3.0).
const ApplePasswords = (() => {
  const HOST = 'com.apple.passwordmanager';
  const BROWSER = 'Luch';
  const STORE = 'applePasswords';

  // Группа 3072 бит из RFC 5054, приложение A
  const N = BigInt('0x' + `
    FFFFFFFF FFFFFFFF C90FDAA2 2168C234 C4C6628B 80DC1CD1 29024E08 8A67CC74 020BBEA6 3B139B22 514A0879
    8E3404DD EF9519B3 CD3A431B 302B0A6D F25F1437 4FE1356D 6D51C245 E485B576 625E7EC6 F44C42E9 A637ED6B
    0BFF5CB6 F406B7ED EE386BFB 5A899FA5 AE9F2411 7C4B1FE6 49286651 ECE45B3D C2007CB8 A163BF05 98DA4836
    1C55D39A 69163FA8 FD24CF5F 83655D23 DCA3AD96 1C62F356 208552BB 9ED52907 7096966D 670C354E 4ABC9804
    F1746C08 CA18217C 32905E46 2E36CE3B E39E772C 180E8603 9B2783A2 EC07A28F B5C55DF0 6F4C52C9 DE2BCBF6
    95581718 3995497C EA956AE5 15D22618 98FA0510 15728E5A 8AAAC42D AD33170D 04507A33 A85521AB DF1CBA64
    ECFB8504 58DBEF0A 8AEA7157 5D060C7D B3970F85 A6E1E4C7 ABF5AE8C DB0933D7 1E8C94E0 4A25619D CEE3D226
    1AD2EE6B F12FFA06 D98A0864 D8760273 3EC86A64 521F2B18 177B200C BBE11757 7A615D6C 770988C0 BAD946E2
    08E24FA0 74E5AB31 43DB5BFC E0FD108E 4B82D120 A93AD2CA FFFFFFFF FFFFFFFF`.replace(/\s/g, ''));
  const N_BYTES = 384;
  const G = 5n;

  const CMD = { HANDSHAKE: 2, LOGIN_NAMES: 4, PASSWORD: 5, PASSWORDS_DISABLED: 9, RELOGIN_NEEDED: 10, HELLO: 14 };
  const ACT = { SEARCH: 2, GHOST_SEARCH: 5 };
  const STATUS = { SUCCESS: 0, NO_RESULTS: 3 };

  // ---------- Байты и числа ----------
  const utf8 = (s) => new TextEncoder().encode(s);
  const concat = (...parts) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let i = 0;
    for (const p of parts) { out.set(p, i); i += p.length; }
    return out;
  };
  // Числа кодируются без ведущих нулей — так же, как у Apple и в apw
  const toBytes = (n) => {
    let hex = n.toString(16);
    if (hex === '0') return new Uint8Array();
    if (hex.length % 2) hex = '0' + hex;
    return Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16));
  };
  const toBig = (bytes) => bytes.reduce((n, b) => (n << 8n) | BigInt(b), 0n);
  const pad = (bytes, len) => concat(new Uint8Array(Math.max(len - bytes.length, 0)), bytes);
  const mod = (a, m) => ((a % m) + m) % m;
  const modPow = (base, exp, m) => {
    let result = 1n;
    base = mod(base, m);
    while (exp > 0n) {
      if (exp & 1n) result = result * base % m;
      base = base * base % m;
      exp >>= 1n;
    }
    return result;
  };
  const random = (n) => crypto.getRandomValues(new Uint8Array(n));
  const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
  const fromBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const jsonToBase64 = (obj) => toBase64(utf8(JSON.stringify(obj)));
  const jsonFromBase64 = (s) => JSON.parse(new TextDecoder().decode(fromBase64(s)));

  // Помощник выбирает base64 или hex (с 0x) в ответе на приветствие
  let useBase64 = true;
  const serialize = (bytes, prefix = true) => useBase64
    ? toBase64(bytes)
    : (prefix ? '0x' : '') + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const deserialize = (s) => useBase64
    ? fromBase64(s)
    : Uint8Array.from(s.replace(/^0x/, '').match(/../g) || [], (h) => parseInt(h, 16));

  // ---------- Связь с помощником ----------
  let port = null;
  let waiting = null; // { cmd, resolve, reject, timer }
  let queue = Promise.resolve();

  function connect() {
    if (port) return port;
    port = chrome.runtime.connectNative(HOST);
    port.onMessage.addListener((msg) => {
      // Помощник сам сообщает, что Пароли выключены или нужен повторный вход в iCloud
      if (msg.cmd === CMD.PASSWORDS_DISABLED || msg.cmd === CMD.RELOGIN_NEEDED) forget();
      if (!waiting || msg.cmd !== waiting.cmd) return;
      const w = waiting;
      waiting = null;
      clearTimeout(w.timer);
      w.resolve(msg);
    });
    port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError?.message || 'Помощник паролей Apple завершился';
      port = null;
      if (waiting) { clearTimeout(waiting.timer); waiting.reject(new Error(error)); waiting = null; }
    });
    return port;
  }

  // Запросы идут строго по одному: помощник отвечает той же командой, без номера запроса
  function send(message, timeout = 15000) {
    const run = () => new Promise((resolve, reject) => {
      const p = connect();
      waiting = {
        cmd: message.cmd, resolve, reject,
        timer: setTimeout(() => { waiting = null; reject(new Error('Помощник паролей Apple не ответил')); }, timeout),
      };
      p.postMessage(message);
    });
    const result = queue.then(run, run);
    queue = result.catch(() => {});
    return result;
  }

  // ---------- Сеанс ----------
  // Ключ хранится только в памяти браузера (storage.session) и пропадает при выходе из Luch —
  // как у расширения Apple, после перезапуска код нужно ввести снова
  let session = null; // { tid, key }
  let pairing = null; // { tid, a, A, B, salt }

  async function loadSession() {
    if (session) return session;
    const saved = (await chrome.storage.session.get(STORE))[STORE];
    if (saved) {
      session = { tid: saved.tid, key: fromBase64(saved.key) };
      useBase64 = saved.useBase64;
    }
    return session;
  }

  async function forget() {
    session = null;
    pairing = null;
    await chrome.storage.session.remove(STORE);
  }

  async function hello() {
    const reply = await send({ cmd: CMD.HELLO });
    useBase64 = reply.capabilities?.shouldUseBase64 !== false;
    return reply.capabilities || {};
  }

  const parsePake = (reply) => {
    const payload = typeof reply.payload === 'string' ? JSON.parse(reply.payload) : reply.payload;
    if (!payload?.PAKE) throw new Error('Помощник паролей Apple ответил без данных подключения');
    const pake = jsonFromBase64(payload.PAKE);
    if (pake.TID !== pairing?.tid) throw new Error('Ответ помощника относится к другому подключению');
    return pake;
  };

  // Шаг 1: macOS показывает окно с шестизначным кодом
  async function requestPin() {
    await hello();
    const tid = serialize(random(16));
    const a = toBig(random(32));
    const A = modPow(G, a, N);
    pairing = { tid, a, A };
    const reply = await send({
      cmd: CMD.HANDSHAKE,
      msg: JSON.stringify({
        QID: 'm0',
        HSTBRSR: BROWSER,
        PAKE: jsonToBase64({ TID: tid, MSG: 0, A: serialize(toBytes(A)), VER: '1.0', PROTO: [1] }),
      }),
    });
    const pake = parsePake(reply);
    if (pake.ErrCode !== undefined) throw new Error(`Помощник отказал в подключении (код ${pake.ErrCode})`);
    if (String(pake.MSG) !== '1' || pake.PROTO !== 1) throw new Error('Помощник паролей Apple ответил в неизвестном формате');
    const B = toBig(deserialize(pake.B));
    if (mod(B, N) === 0n) throw new Error('Помощник прислал неверный ключ');
    pairing.B = B;
    pairing.salt = toBig(deserialize(pake.s));
  }

  // Шаг 2: проверка кода и общий ключ сеанса
  async function confirmPin(pin) {
    if (!pairing?.B) throw new Error('Сначала запросите код');
    const { tid, a, A, B, salt } = pairing;
    const u = toBig(await sha256(concat(pad(toBytes(A), N_BYTES), pad(toBytes(B), N_BYTES))));
    const k = toBig(await sha256(concat(toBytes(N), pad(toBytes(G), N_BYTES))));
    const x = toBig(await sha256(concat(toBytes(salt), await sha256(utf8(`${tid}:${pin}`)))));
    const S = modPow(B - k * modPow(G, x, N), a + u * x, N);
    const K = toBytes(toBig(await sha256(toBytes(S))));

    const hN = await sha256(toBytes(N));
    const hG = await sha256(pad(toBytes(G), N_BYTES));
    const M = await sha256(concat(
      hN.map((byte, i) => byte ^ hG[i]), await sha256(utf8(tid)),
      toBytes(salt), toBytes(A), toBytes(B), K,
    ));
    const reply = await send({
      cmd: CMD.HANDSHAKE,
      msg: JSON.stringify({ QID: 'm2', HSTBRSR: BROWSER, PAKE: jsonToBase64({ TID: tid, MSG: 2, M: serialize(M, false) }) }),
    });
    const pake = parsePake(reply);
    if (pake.ErrCode === 1) { pairing = null; throw new Error('Неверный код. Запросите новый.'); }
    if (pake.ErrCode !== 0 || String(pake.MSG) !== '3') throw new Error(`Помощник не принял подключение (код ${pake.ErrCode})`);
    // Помощник доказывает, что тоже знает ключ
    const hamk = await sha256(concat(toBytes(A), M, K));
    if (toBig(deserialize(pake.HAMK)) !== toBig(hamk)) throw new Error('Помощник не подтвердил ключ');

    pairing = null;
    session = { tid, key: K };
    await chrome.storage.session.set({ [STORE]: { tid, key: toBase64(K), useBase64 } });
  }

  // ---------- Зашифрованные запросы ----------
  const aesKey = () => crypto.subtle.importKey('raw', session.key.slice(0, 16), 'AES-GCM', false, ['encrypt', 'decrypt']);

  // Свои сообщения: шифротекст, затем вектор; ответы помощника: вектор, затем шифротекст
  async function encrypt(obj) {
    const iv = random(16);
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(), utf8(JSON.stringify(obj))));
    return JSON.stringify({ TID: session.tid, SDATA: serialize(concat(data, iv)) });
  }

  async function decrypt(smsg) {
    const msg = typeof smsg === 'string' ? JSON.parse(smsg) : smsg;
    if (msg?.TID !== session.tid) throw new Error('Ответ помощника относится к другому подключению');
    const bytes = deserialize(msg.SDATA);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 16) }, await aesKey(), bytes.slice(16));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  async function query(cmd, qid, host, body, timeout) {
    if (!await loadSession()) throw new Error('Пароли Apple не подключены');
    const reply = await send({
      cmd, tabId: 0, frameId: 0, url: host,
      payload: JSON.stringify({ QID: qid, SMSG: await encrypt(body) }),
    }, timeout);
    const payload = typeof reply.payload === 'string' ? JSON.parse(reply.payload) : reply.payload;
    if (!payload?.SMSG) {
      // Без зашифрованного ответа помощник больше не знает этот сеанс
      await forget();
      throw new Error('Подключение к Паролям Apple сброшено. Подключите заново в настройках.');
    }
    const data = await decrypt(payload.SMSG);
    if (data.STATUS === STATUS.NO_RESULTS) return [];
    if (data.STATUS !== STATUS.SUCCESS) throw new Error(`Пароли Apple вернули ошибку ${data.STATUS}`);
    if (Array.isArray(data.Entries)) return data.Entries;
    return Object.keys(data).filter((k) => k.startsWith('Entry_'))
      .sort((x, y) => x.localeCompare(y, undefined, { numeric: true })).map((k) => data[k]);
  }

  return {
    async status() {
      const paired = Boolean(await loadSession());
      try {
        const caps = await hello();
        return { available: true, paired, os: caps.operatingSystem };
      } catch (e) {
        return { available: false, paired, error: e.message };
      }
    },
    requestPin,
    confirmPin,
    forget,
    // Имена входов для сайта, без паролей
    async logins(host) {
      const entries = await query(CMD.LOGIN_NAMES, 'CmdGetLoginNames4URL', host, { ACT: ACT.GHOST_SEARCH, URL: host });
      return entries.map((e) => ({ user: e.USR || '', sites: e.sites || [] }));
    },
    // Пароль одного входа; macOS может спросить Touch ID, поэтому ждём дольше
    async password(host, user) {
      const entries = await query(CMD.PASSWORD, 'CmdGetPassword4LoginName', host, { ACT: ACT.SEARCH, URL: host, USR: user }, 120000);
      const hit = entries.find((e) => (e.USR || '') === user);
      return hit ? { user: hit.USR || '', password: hit.PWD || '' } : null;
    },
  };
})();
