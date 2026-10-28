// Помощник импорта Luch (native messaging, имя org.luch.importer): читает закладки, историю
// и cookie других браузеров и отдаёт их интерфейсу Luch. Перенос src/importer.js из версии
// на Electron. Chromium-браузеры шифруют cookie ключом из связки ключей macOS — при первом
// импорте система сама спросит разрешение на доступ к записи «… Safe Storage».
//
// Протокол Chrome native messaging: 4 байта длины + JSON в обе стороны.
//   {"cmd":"detect"}                                  → {"type":"detect","browsers":[…]}
//   {"cmd":"read","browser","profile","what":{…}}     → {"type":"history"|"bookmarks"|"cookies","items":[…]} частями,
//                                                       {"type":"error","label","message"}, в конце {"type":"done"}
//   {"cmd":"update","dmg","sha256","restart"?}        → {"type":"update"}: подготовка новой версии Luch (см. update())
//   {"cmd":"restart"}                                 → перезапуск Luch с подготовленной версией
import CommonCrypto
import Foundation

let support = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support")

struct ChromiumBrowser { let id, name, dir, keychain: String; var flat = false }

let chromium: [ChromiumBrowser] = [
  .init(id: "chrome", name: "Google Chrome", dir: "Google/Chrome", keychain: "Chrome Safe Storage"),
  .init(id: "arc", name: "Arc", dir: "Arc/User Data", keychain: "Arc Safe Storage"),
  .init(id: "dia", name: "Dia", dir: "Dia/User Data", keychain: "Dia Safe Storage"),
  .init(id: "edge", name: "Microsoft Edge", dir: "Microsoft Edge", keychain: "Microsoft Edge Safe Storage"),
  .init(id: "brave", name: "Brave", dir: "BraveSoftware/Brave-Browser", keychain: "Brave Safe Storage"),
  .init(id: "yandex", name: "Яндекс Браузер", dir: "Yandex/YandexBrowser", keychain: "Yandex Safe Storage"),
  .init(id: "vivaldi", name: "Vivaldi", dir: "Vivaldi", keychain: "Vivaldi Safe Storage"),
  .init(id: "opera", name: "Opera", dir: "com.operasoftware.Opera", keychain: "Opera Safe Storage", flat: true),
  .init(id: "chromium", name: "Chromium", dir: "Chromium", keychain: "Chromium Safe Storage"),
]

// ---------- Обмен сообщениями с Luch ----------

func readMessage() -> [String: Any]? {
  let header = FileHandle.standardInput.readData(ofLength: 4)
  guard header.count == 4 else { return nil }
  let length = header.withUnsafeBytes { $0.load(as: UInt32.self) }
  let body = FileHandle.standardInput.readData(ofLength: Int(length))
  return (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
}

func send(_ message: [String: Any]) {
  guard let body = try? JSONSerialization.data(withJSONObject: message) else { return }
  var length = UInt32(body.count)
  FileHandle.standardOutput.write(Data(bytes: &length, count: 4))
  FileHandle.standardOutput.write(body)
}

// Сообщение для Chrome не больше 1 МБ — длинные списки отправляем частями
func sendItems(_ type: String, _ items: [[String: Any]], chunk: Int) {
  var start = 0
  repeat {
    let part = Array(items[start..<min(start + chunk, items.count)])
    send(["type": type, "items": part])
    start += chunk
  } while start < items.count
}

// ---------- Файлы и базы ----------

func exists(_ url: URL) -> Bool { FileManager.default.fileExists(atPath: url.path) }

func run(_ tool: String, _ args: [String]) throws -> Data {
  let p = Process()
  p.executableURL = URL(fileURLWithPath: tool)
  p.arguments = args
  let out = Pipe()
  p.standardOutput = out
  p.standardError = FileHandle.nullDevice
  try p.run()
  let data = out.fileHandleForReading.readDataToEndOfFile()
  p.waitUntilExit()
  guard p.terminationStatus == 0 else {
    throw NSError(domain: "luch", code: Int(p.terminationStatus), userInfo: [NSLocalizedDescriptionKey: "\(tool) завершился с ошибкой"])
  }
  return data
}

// Браузер держит свои базы открытыми, поэтому читаем копию вместе с журналом WAL
func querySqlite(_ db: URL, _ sql: String) throws -> [[String: Any]] {
  let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("luch-import-\(UUID().uuidString)")
  try FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)
  defer { try? FileManager.default.removeItem(at: tmp) }
  let copy = tmp.appendingPathComponent("db")
  try FileManager.default.copyItem(at: db, to: copy)
  for ext in ["-wal", "-shm"] {
    let src = URL(fileURLWithPath: db.path + ext)
    if exists(src) { try? FileManager.default.copyItem(at: src, to: URL(fileURLWithPath: copy.path + ext)) }
  }
  let out = try run("/usr/bin/sqlite3", ["-json", copy.path, sql])
  if out.isEmpty { return [] }
  return (try JSONSerialization.jsonObject(with: out) as? [[String: Any]]) ?? []
}

func isWeb(_ url: Any?) -> Bool { (url as? String).map { $0.hasPrefix("http://") || $0.hasPrefix("https://") } ?? false }
func num(_ v: Any?) -> Double { (v as? NSNumber)?.doubleValue ?? Double(v as? String ?? "") ?? 0 }
func nonEmpty(_ v: Any?) -> String? { (v as? String).flatMap { $0.isEmpty ? nil : $0 } }

// ---------- Профили ----------

typealias Profile = (id: String, name: String, path: URL)

func chromiumProfiles(_ b: ChromiumBrowser) -> [Profile] {
  let root = support.appendingPathComponent(b.dir)
  guard exists(root) else { return [] }
  if b.flat { return exists(root.appendingPathComponent("History")) ? [("", "Основной", root)] : [] }
  var names: [String: Any] = [:]
  if let data = try? Data(contentsOf: root.appendingPathComponent("Local State")),
     let state = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
     let profile = state["profile"] as? [String: Any],
     let cache = profile["info_cache"] as? [String: Any] { names = cache }
  let dirs = (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []
  return dirs.sorted()
    .filter { ($0 == "Default" || $0.range(of: #"^Profile \d+$"#, options: .regularExpression) != nil) && exists(root.appendingPathComponent($0).appendingPathComponent("History")) }
    .map { d in (d, nonEmpty((names[d] as? [String: Any])?["name"]) ?? (d == "Default" ? "Основной" : d), root.appendingPathComponent(d)) }
}

func firefoxProfiles() -> [Profile] {
  let root = support.appendingPathComponent("Firefox/Profiles")
  let dirs = (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []
  return dirs.sorted()
    .filter { exists(root.appendingPathComponent($0).appendingPathComponent("places.sqlite")) }
    .map { d in (d, d.replacingOccurrences(of: #"^[^.]+\."#, with: "", options: .regularExpression), root.appendingPathComponent(d)) }
}

func detect() -> [[String: Any]] {
  var list: [[String: Any]] = []
  for b in chromium {
    let profiles = chromiumProfiles(b)
    if !profiles.isEmpty { list.append(["id": b.id, "name": b.name, "profiles": profiles.map { ["id": $0.id, "name": $0.name] }]) }
  }
  let ff = firefoxProfiles()
  if !ff.isEmpty { list.append(["id": "firefox", "name": "Firefox", "profiles": ff.map { ["id": $0.id, "name": $0.name] }]) }
  return list
}

// ---------- Chromium ----------

// Время Chromium — микросекунды с 1601 года
func fromChromeTime(_ t: Double) -> Double { t > 0 ? t / 1000 - 11644473600000 : 0 }

func chromiumHistory(_ dir: URL) throws -> [[String: Any]] {
  let rows = try querySqlite(dir.appendingPathComponent("History"),
    "SELECT url, title, last_visit_time AS t FROM urls WHERE hidden = 0 ORDER BY last_visit_time DESC LIMIT 5000")
  return rows.filter { isWeb($0["url"]) }.map { ["url": $0["url"]!, "title": $0["title"] as? String ?? "", "ts": Int(fromChromeTime(num($0["t"])))] }
}

func chromiumBookmarks(_ dir: URL) throws -> [[String: Any]] {
  let file = dir.appendingPathComponent("Bookmarks")
  guard exists(file) else { return [] }
  let json = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any]
  var out: [[String: Any]] = []
  func walk(_ node: [String: Any], _ folder: String) {
    if node["type"] as? String == "url", isWeb(node["url"]) {
      out.append(["title": nonEmpty(node["name"]) ?? node["url"]!, "url": node["url"]!, "folder": folder])
    }
    let next = node["type"] as? String == "folder" ? nonEmpty(node["name"]) ?? folder : folder
    for child in node["children"] as? [[String: Any]] ?? [] { walk(child, next) }
  }
  let roots = (json?["roots"] as? [String: Any]) ?? [:]
  for key in ["bookmark_bar", "other", "synced"] {
    guard var node = roots[key] as? [String: Any], node["children"] != nil else { continue }
    node["name"] = ""
    walk(node, key == "bookmark_bar" ? "Панель закладок" : "Другие закладки")
  }
  return out
}

func chromiumKey(_ service: String) throws -> Data {
  // macOS покажет окно с просьбой разрешить доступ к «… Safe Storage» — решает пользователь
  let password = String(decoding: try run("/usr/bin/security", ["find-generic-password", "-w", "-s", service]), as: UTF8.self)
    .trimmingCharacters(in: .whitespacesAndNewlines)
  var key = Data(count: 16)
  let salt = Array("saltysalt".utf8)
  let status = key.withUnsafeMutableBytes { keyPtr in
    CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2), password, password.utf8.count, salt, salt.count,
                         CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA1), 1003,
                         keyPtr.bindMemory(to: UInt8.self).baseAddress, 16)
  }
  guard status == kCCSuccess else { throw NSError(domain: "luch", code: Int(status)) }
  return key
}

func decryptCookie(_ hex: String, key: Data, stripDomainHash: Bool) -> String? {
  var bytes = [UInt8]()
  bytes.reserveCapacity(hex.count / 2)
  var idx = hex.startIndex
  while idx < hex.endIndex {
    let next = hex.index(idx, offsetBy: 2)
    guard let b = UInt8(hex[idx..<next], radix: 16) else { return nil }
    bytes.append(b)
    idx = next
  }
  guard bytes.count > 3, let prefix = String(bytes: bytes[0..<3], encoding: .ascii), prefix == "v10" || prefix == "v11" else { return nil }
  let cipher = Array(bytes[3...])
  var plain = [UInt8](repeating: 0, count: cipher.count + kCCBlockSizeAES128)
  var moved = 0
  let iv = [UInt8](repeating: 0x20, count: 16)
  let status = key.withUnsafeBytes { k in
    CCCrypt(CCOperation(kCCDecrypt), CCAlgorithm(kCCAlgorithmAES128), CCOptions(kCCOptionPKCS7Padding),
            k.baseAddress, 16, iv, cipher, cipher.count, &plain, plain.count, &moved)
  }
  guard status == kCCSuccess else { return nil }
  var result = Array(plain[0..<moved])
  // Начиная с версии базы 24 перед значением лежит SHA-256 домена (32 байта)
  if stripDomainHash { result = result.count >= 32 ? Array(result[32...]) : [] }
  return String(bytes: result, encoding: .utf8)
}

let chromeSameSite: [Int: String] = [-1: "unspecified", 0: "no_restriction", 1: "lax", 2: "strict"]

func chromiumCookies(_ dir: URL, _ service: String) throws -> [[String: Any]] {
  guard let db = [dir.appendingPathComponent("Network/Cookies"), dir.appendingPathComponent("Cookies")].first(where: exists) else { return [] }
  let key = try chromiumKey(service)
  let meta = try querySqlite(db, "SELECT value FROM meta WHERE key = 'version'")
  let strip = num(meta.first?["value"]) >= 24
  let rows = try querySqlite(db,
    "SELECT host_key AS host, name, value, hex(encrypted_value) AS ev, path, expires_utc AS exp, is_secure AS secure, is_httponly AS httpOnly, samesite FROM cookies")
  let now = Date().timeIntervalSince1970
  var out: [[String: Any]] = []
  for r in rows {
    var value = r["value"] as? String ?? ""
    if value.isEmpty, let ev = nonEmpty(r["ev"]) {
      guard let v = decryptCookie(ev, key: key, stripDomainHash: strip) else { continue }
      value = v
    }
    let expires = num(r["exp"]) > 0 ? fromChromeTime(num(r["exp"])) / 1000 : 0
    if expires > 0 && expires < now { continue }
    out.append(["host": r["host"] ?? "", "name": r["name"] ?? "", "value": value, "path": nonEmpty(r["path"]) ?? "/",
                "expires": expires, "secure": num(r["secure"]) != 0, "httpOnly": num(r["httpOnly"]) != 0,
                "sameSite": chromeSameSite[Int(num(r["samesite"]))] ?? "unspecified"])
  }
  return out
}

// ---------- Firefox ----------

func firefoxHistory(_ dir: URL) throws -> [[String: Any]] {
  let rows = try querySqlite(dir.appendingPathComponent("places.sqlite"),
    "SELECT url, title, last_visit_date AS t FROM moz_places WHERE last_visit_date IS NOT NULL ORDER BY last_visit_date DESC LIMIT 5000")
  return rows.filter { isWeb($0["url"]) }.map { ["url": $0["url"]!, "title": $0["title"] as? String ?? "", "ts": Int(num($0["t"]) / 1000)] }
}

func firefoxBookmarks(_ dir: URL) throws -> [[String: Any]] {
  let rows = try querySqlite(dir.appendingPathComponent("places.sqlite"),
    "SELECT b.title AS title, p.url AS url, f.title AS folder FROM moz_bookmarks b JOIN moz_places p ON p.id = b.fk LEFT JOIN moz_bookmarks f ON f.id = b.parent WHERE b.type = 1")
  return rows.filter { isWeb($0["url"]) }.map { ["title": nonEmpty($0["title"]) ?? $0["url"]!, "url": $0["url"]!, "folder": nonEmpty($0["folder"]) ?? "Закладки"] }
}

func firefoxCookies(_ dir: URL) throws -> [[String: Any]] {
  let db = dir.appendingPathComponent("cookies.sqlite")
  guard exists(db) else { return [] }
  let rows = try querySqlite(db, "SELECT host, name, value, path, expiry, isSecure AS secure, isHttpOnly AS httpOnly, sameSite FROM moz_cookies")
  let now = Date().timeIntervalSince1970
  let sameSite: [Int: String] = [0: "no_restriction", 1: "lax", 2: "strict"]
  return rows.compactMap { r in
    // В новых версиях Firefox срок хранится в миллисекундах, в старых — в секундах
    let expiry = num(r["expiry"])
    let expires = expiry > 1e11 ? expiry / 1000 : expiry
    if expires > 0 && expires < now { return nil }
    return ["host": r["host"] ?? "", "name": r["name"] ?? "", "value": r["value"] ?? "", "path": nonEmpty(r["path"]) ?? "/",
            "expires": expires, "secure": num(r["secure"]) != 0, "httpOnly": num(r["httpOnly"]) != 0,
            "sameSite": sameSite[Int(num(r["sameSite"]))] ?? "unspecified"]
  }
}

// ---------- Импорт ----------

func read(_ msg: [String: Any]) {
  let browser = msg["browser"] as? String ?? ""
  let profile = msg["profile"] as? String ?? ""
  let what = msg["what"] as? [String: Any] ?? [:]
  let history, bookmarks, cookies: () throws -> [[String: Any]]
  if browser == "firefox" {
    guard let p = firefoxProfiles().first(where: { $0.id == profile }) else {
      send(["type": "error", "label": "Firefox", "message": "Профиль Firefox не найден"]); return
    }
    history = { try firefoxHistory(p.path) }
    bookmarks = { try firefoxBookmarks(p.path) }
    cookies = { try firefoxCookies(p.path) }
  } else {
    guard let b = chromium.first(where: { $0.id == browser }), let p = chromiumProfiles(b).first(where: { $0.id == profile }) else {
      send(["type": "error", "label": "Браузер", "message": "Профиль браузера не найден"]); return
    }
    history = { try chromiumHistory(p.path) }
    bookmarks = { try chromiumBookmarks(p.path) }
    cookies = { try chromiumCookies(p.path, b.keychain) }
  }
  let steps: [(key: String, label: String, chunk: Int, fn: () throws -> [[String: Any]])] = [
    ("history", "История", 400, history),
    ("bookmarks", "Закладки", 400, bookmarks),
    ("cookies", "Входы на сайты", 100, cookies),
  ]
  for step in steps where (what[step.key] as? Bool) == true {
    do { sendItems(step.key, try step.fn(), chunk: step.chunk) }
    catch { send(["type": "error", "label": step.label, "message": error.localizedDescription]) }
  }
}

// ---------- Обновление Luch ----------
// {"cmd":"update","dmg":путь,"sha256":hex} → {"type":"update"} или {"type":"error"}.
// Образ скачивает Luch из релиза на GitHub; помощник сверяет SHA-256, проверяет, что внутри
// Luch с целой подписью, и кладёт его рядом со старым. Затем отдельный процесс закрывает
// Luch, меняет приложения местами и запускает новое.

struct UpdateError: LocalizedError {
  let errorDescription: String?
  init(_ text: String) { errorDescription = text }
}

func sha256(_ url: URL) throws -> String {
  let handle = try FileHandle(forReadingFrom: url)
  defer { try? handle.close() }
  var ctx = CC_SHA256_CTX()
  CC_SHA256_Init(&ctx)
  while let chunk = try handle.read(upToCount: 1 << 20), !chunk.isEmpty {
    chunk.withUnsafeBytes { _ = CC_SHA256_Update(&ctx, $0.baseAddress, CC_LONG(chunk.count)) }
  }
  var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
  CC_SHA256_Final(&digest, &ctx)
  return digest.map { String(format: "%02x", $0) }.joined()
}

// Процесс в своей сессии: Chromium закрывает помощника вместе с собой, а замена должна пережить выход Luch
func spawnDetached(_ args: [String]) throws {
  var attr: posix_spawnattr_t?
  posix_spawnattr_init(&attr)
  defer { posix_spawnattr_destroy(&attr) }
  posix_spawnattr_setflags(&attr, Int16(POSIX_SPAWN_SETSID))
  var files: posix_spawn_file_actions_t?
  posix_spawn_file_actions_init(&files)
  defer { posix_spawn_file_actions_destroy(&files) }
  // stdout помощника — канал сообщений Chromium, в него ничего постороннего писать нельзя
  for fd: Int32 in [0, 1, 2] { posix_spawn_file_actions_addopen(&files, fd, "/dev/null", fd == 0 ? O_RDONLY : O_WRONLY, 0) }
  var argv = args.map { strdup($0) } + [nil]
  defer { argv.forEach { free($0) } }
  var pid: pid_t = 0
  guard posix_spawn(&pid, args[0], &files, &attr, &argv, environ) == 0 else { throw UpdateError("Не удалось запустить установку") }
}

func update(_ msg: [String: Any]) throws {
  guard let dmgPath = msg["dmg"] as? String, let expected = (msg["sha256"] as? String)?.lowercased(), expected.count == 64 else {
    throw UpdateError("Нет образа или его контрольной суммы")
  }
  let dmg = URL(fileURLWithPath: dmgPath)
  guard try sha256(dmg) == expected else { throw UpdateError("Контрольная сумма образа не совпадает с релизом на GitHub") }

  // Помощник лежит в Luch.app/Contents/Resources
  let app = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
  guard app.pathExtension == "app" else { throw UpdateError("Не найдено приложение Luch") }

  let mount = FileManager.default.temporaryDirectory.appendingPathComponent("luch-update-\(UUID().uuidString)")
  try FileManager.default.createDirectory(at: mount, withIntermediateDirectories: true)
  _ = try run("/usr/bin/hdiutil", ["attach", "-nobrowse", "-readonly", "-noautoopen", "-mountpoint", mount.path, dmg.path])
  defer { _ = try? run("/usr/bin/hdiutil", ["detach", "-force", mount.path]) }
  let fresh = mount.appendingPathComponent("Luch.app")
  let info = NSDictionary(contentsOf: fresh.appendingPathComponent("Contents/Info.plist"))
  guard info?["CFBundleIdentifier"] as? String == "org.luch.Luch" else { throw UpdateError("В образе нет Luch") }
  do { _ = try run("/usr/bin/codesign", ["--verify", "--deep", "--strict", fresh.path]) }
  catch { throw UpdateError("Подпись приложения в образе повреждена") }

  let staged = app.deletingLastPathComponent().appendingPathComponent(".Luch-update.app")
  if exists(staged) { try FileManager.default.removeItem(at: staged) }
  do { _ = try run("/usr/bin/ditto", [fresh.path, staged.path]) }
  catch { throw UpdateError("Нет доступа к папке \(app.deletingLastPathComponent().path)") }
  // Образ проверен по контрольной сумме — снимаем пометку «скачано из интернета», иначе macOS
  // не даст запустить обновлённый Luch без подтверждения в настройках
  _ = try? run("/usr/bin/xattr", ["-dr", "com.apple.quarantine", staged.path])
  // Образ из папки обновлений больше не нужен — не копим их в «Загрузках»
  if dmg.deletingLastPathComponent().lastPathComponent == "Luch-update" {
    try? FileManager.default.removeItem(at: dmg)
    try? FileManager.default.removeItem(at: dmg.deletingLastPathComponent())  // только если папка пуста
  }

  // Замена — когда Luch закроется: сам пользователем или по «Перезапустить сейчас» (флаг .restart,
  // тогда новая версия сразу запускается). Повторная подготовка той же версии запускает ещё один
  // такой процесс; меняет приложение только первый, кто займёт .lock
  let pid = getppid()
  guard pid > 1 else { throw UpdateError("Не удалось определить запущенный Luch") }
  let script = """
    while kill -0 \(pid) 2>/dev/null; do sleep 1; done
    sleep 1
    mkdir "$2.lock" 2>/dev/null || exit 0
    if [ -d "$2" ]; then mv "$1" "$1.old" && mv "$2" "$1" && rm -rf "$1.old"; fi
    rmdir "$2.lock"
    if [ -f "$2.restart" ]; then rm -f "$2.restart"; open "$1"; fi
    """
  try spawnDetached(["/bin/sh", "-c", script, "luch-update", app.path, staged.path])
  if msg["restart"] as? Bool == true { try restart() }
  send(["type": "update"])
}

// «Перезапустить сейчас»: флаг для процесса замены и штатный выход Luch (SIGTERM, как ⌘Q)
func restart() throws {
  let app = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
  let staged = app.deletingLastPathComponent().appendingPathComponent(".Luch-update.app")
  guard exists(staged) else { throw UpdateError("Обновление ещё не подготовлено") }
  FileManager.default.createFile(atPath: staged.path + ".restart", contents: nil)
  let pid = getppid()
  guard pid > 1 else { throw UpdateError("Не удалось определить запущенный Luch") }
  kill(pid, SIGTERM)
}

while let msg = readMessage() {
  switch msg["cmd"] as? String {
  case "detect": send(["type": "detect", "browsers": detect()])
  case "read": read(msg)
  case "update":
    do { try update(msg) } catch { send(["type": "error", "label": "Обновление", "message": error.localizedDescription]) }
  case "restart":
    do { try restart(); send(["type": "restart"]) } catch { send(["type": "error", "label": "Обновление", "message": error.localizedDescription]) }
  default: send(["type": "error", "label": "Импорт", "message": "Неизвестная команда"])
  }
  send(["type": "done"])
}
