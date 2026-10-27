// Помощник Luch для перевода страниц встроенным переводом macOS (тот же, что в Safari).
// Перевод идёт прямо на Mac: текст никуда не отправляется.
//
// Протокол: на вход по строке JSON {"id": 1, "texts": ["..."], "target": "ru"},
// на выход по строке JSON {"id": 1, "source": "en", "translations": ["..."]} или {"id": 1, "error": "..."}.
import Foundation
import NaturalLanguage
import Translation

struct Job: Decodable {
  let id: Int
  let texts: [String]
  let target: String
  let source: String?   // язык всей страницы; если нет — определяем по текстам
  let hint: String?     // подсказка для определения языка (атрибут lang страницы)
  let detectOnly: Bool?
}

func reply(_ object: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: object) else { return }
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

// Язык страницы определяем по всему тексту пачки
func detectLanguage(_ texts: [String], hint: String? = nil) -> Locale.Language? {
  let recognizer = NLLanguageRecognizer()
  if let hint, !hint.isEmpty {
    recognizer.languageHints = [NLLanguage(rawValue: hint): 0.8]
  }
  recognizer.processString(texts.joined(separator: "\n"))
  guard let lang = recognizer.dominantLanguage, lang != .undetermined else { return nil }
  return Locale.Language(identifier: lang.rawValue)
}

// Сессии переиспользуем: создание сессии дороже самого перевода
var sessions: [String: TranslationSession] = [:]

func handle(_ job: Job) async {
  let target = Locale.Language(identifier: job.target)
  if job.detectOnly == true {
    let lang = detectLanguage(job.texts, hint: job.hint)
    reply(["id": job.id, "source": lang?.languageCode?.identifier ?? "und"])
    return
  }
  let given = job.source.flatMap { $0.isEmpty || $0 == "und" ? nil : Locale.Language(identifier: $0) }
  guard let source = given ?? detectLanguage(job.texts, hint: job.hint) else {
    reply(["id": job.id, "translations": job.texts, "source": "und"])
    return
  }
  let sourceCode = source.languageCode?.identifier ?? source.minimalIdentifier
  // Текст уже на нужном языке — возвращаем как есть
  if sourceCode == target.languageCode?.identifier {
    reply(["id": job.id, "translations": job.texts, "source": sourceCode])
    return
  }

  switch await LanguageAvailability().status(from: source, to: target) {
  case .unsupported:
    reply(["id": job.id, "error": "unsupported", "source": sourceCode])
    return
  case .supported:
    // Пара поддерживается, но языковой пакет ещё не скачан
    reply(["id": job.id, "error": "not-installed", "source": sourceCode])
    return
  default:
    break
  }

  let key = "\(sourceCode)>\(job.target)"
  do {
    let session = sessions[key] ?? TranslationSession(installedSource: source, target: target)
    sessions[key] = session
    let requests = job.texts.enumerated().map { TranslationSession.Request(sourceText: $0.element, clientIdentifier: String($0.offset)) }
    let responses = try await session.translations(from: requests)
    var result = job.texts
    for r in responses {
      if let id = r.clientIdentifier, let i = Int(id), i < result.count { result[i] = r.targetText }
    }
    reply(["id": job.id, "translations": result, "source": sourceCode])
  } catch {
    sessions[key] = nil
    reply(["id": job.id, "error": String(describing: error), "source": sourceCode])
  }
}

// Задания читаем асинхронно и выполняем по одному в порядке поступления.
// Главный поток отдаём dispatchMain(), иначе переводчику негде работать
let decoder = JSONDecoder()
Task.detached {
  do {
    for try await line in FileHandle.standardInput.bytes.lines {
      guard let data = line.data(using: .utf8), let job = try? decoder.decode(Job.self, from: data) else { continue }
      await handle(job)
    }
  } catch {}
  exit(0)
}
dispatchMain()
