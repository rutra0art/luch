// Скачивание языкового пакета для перевода. macOS разрешает загрузку только через
// собственный системный диалог, поэтому это маленькое окно SwiftUI, которое его вызывает.
// Запуск: prepare <исходный язык> <целевой язык>; печатает «ok» или «error: …».
import SwiftUI
import Translation

// Окно создаём сами через AppKit: у программы без оболочки .app SwiftUI-сцена окно не открывает,
// а системному диалогу загрузки языка нужно окно, к которому он прикрепится
@main
struct PrepareMain {
  static func main() {
    let app = NSApplication.shared
    app.setActivationPolicy(.regular)
    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 360, height: 130),
      styleMask: [.titled, .closable],
      backing: .buffered, defer: false)
    window.title = "Luch — языки перевода"
    window.contentView = NSHostingView(rootView: PrepareView())
    window.center()
    window.makeKeyAndOrderFront(nil)
    app.activate(ignoringOtherApps: true)
    app.run()
  }
}

struct PrepareView: View {
  private let source = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "en"
  private let target = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "ru"
  @State private var config: TranslationSession.Configuration?
  @State private var status = "Скачиваем язык для перевода…"

  var body: some View {
    VStack(spacing: 10) {
      ProgressView()
      Text(status)
    }
    .frame(width: 340, height: 110)
    .onAppear {
      config = .init(source: Locale.Language(identifier: source), target: Locale.Language(identifier: target))
    }
    .translationTask(config) { session in
      do {
        try await session.prepareTranslation()
        print("ok")
      } catch {
        print("error: \(error)")
      }
      fflush(stdout)
      NSApp.terminate(nil)
    }
  }
}
