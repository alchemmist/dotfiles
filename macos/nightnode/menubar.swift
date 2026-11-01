import Cocoa

let nightnode = NSString(string: "~/.local/bin/nightnode").expandingTildeInPath

struct Snapshot {
    var vm = "unknown"
    var resources = ""
    var node = "unknown"
    var ip = ""
    var pods = "-"
}

func runNightnode(_ args: [String]) -> String {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/bin/bash")
    process.arguments = [nightnode] + args
    let out = Pipe()
    let err = Pipe()
    process.standardOutput = out
    process.standardError = err
    do { try process.run() } catch {
        return "error: \(error.localizedDescription)"
    }
    process.waitUntilExit()
    let text = String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    let errorText = String(data: err.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    if process.terminationStatus != 0 {
        return errorText.isEmpty ? text : errorText
    }
    return text
}

func parse(_ text: String) -> Snapshot {
    var snap = Snapshot()
    for line in text.split(separator: "\n") {
        let parts = line.split(separator: "=", maxSplits: 1).map(String.init)
        guard parts.count == 2 else { continue }
        switch parts[0] {
        case "vm": snap.vm = parts[1]
        case "resources": snap.resources = parts[1]
        case "node": snap.node = parts[1]
        case "ip": snap.ip = parts[1]
        case "pods": snap.pods = parts[1]
        default: break
        }
    }
    return snap
}

final class App: NSObject, NSApplicationDelegate {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    var busy = false
    var snapshot = Snapshot()

    func applicationDidFinishLaunching(_ notification: Notification) {
        item.button?.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .medium)
        refresh()
        Timer.scheduledTimer(withTimeInterval: 8, repeats: true) { [weak self] _ in
            self?.refresh()
        }
    }

    func refresh() {
        if busy { return }
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let snap = parse(runNightnode(["menu"]))
            DispatchQueue.main.async {
                self?.snapshot = snap
                self?.render()
            }
        }
    }

    func render() {
        let running = snapshot.vm == "Running"
        let ready = snapshot.node == "Ready"
        let color: NSColor
        let status: String
        if busy {
            color = .systemYellow
            status = "Выполняется операция"
        } else if !running {
            color = .systemGray
            status = "VM выключена"
        } else if ready {
            color = .systemGreen
            status = "Нода Ready"
        } else {
            color = .systemRed
            status = "Нода: " + snapshot.node
        }
        let dot = NSImage(size: NSSize(width: 18, height: 18), flipped: false) { rect in
            color.setFill()
            NSBezierPath(ovalIn: NSRect(x: 5, y: 5, width: 8, height: 8)).fill()
            return true
        }
        dot.isTemplate = false
        item.button?.title = ""
        item.button?.image = dot
        item.button?.toolTip = "Socrat Night — " + status
        item.button?.setAccessibilityLabel("Socrat Night: " + status)

        let menu = NSMenu()
        let headline = NSMenuItem(
            title: ready ? "socrat-mac в кластере" : "socrat-mac не в кластере",
            action: nil,
            keyEquivalent: ""
        )
        headline.isEnabled = false
        menu.addItem(headline)

        func info(_ title: String) {
            let row = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            row.isEnabled = false
            menu.addItem(row)
        }
        info("VM: " + snapshot.vm + " " + snapshot.resources)
        info("Node: " + snapshot.node + " " + snapshot.ip)
        info("Pods: " + snapshot.pods)
        menu.addItem(.separator())

        let resources = NSMenuItem(title: "CPU и память следующего запуска…", action: #selector(configureResources), keyEquivalent: "")
        resources.target = self
        resources.isEnabled = !busy
        menu.addItem(resources)

        let start = NSMenuItem(title: "Запустить VM", action: #selector(startVM), keyEquivalent: "")
        start.target = self
        start.isEnabled = !busy && snapshot.vm != "Running"
        menu.addItem(start)

        let stop = NSMenuItem(title: "Остановить и убрать из кластера", action: #selector(stopVM), keyEquivalent: "")
        stop.target = self
        stop.isEnabled = !busy && snapshot.vm == "Running"
        menu.addItem(stop)

        menu.addItem(.separator())
        let refreshItem = NSMenuItem(title: "Обновить", action: #selector(refreshNow), keyEquivalent: "r")
        refreshItem.target = self
        menu.addItem(refreshItem)
        let quit = NSMenuItem(title: "Закрыть меню", action: #selector(quit), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
        item.menu = menu
    }

    @objc func refreshNow() { refresh() }

    @objc func startVM() { operate(["up"]) }

    @objc func configureResources() {
        let current = runNightnode(["resources"]).split(separator: " ").compactMap { Int($0.trimmingCharacters(in: .whitespacesAndNewlines)) }
        let maxCPU = max(1, ProcessInfo.processInfo.processorCount - 2)
        let maxRAM = max(2, Int(ProcessInfo.processInfo.physicalMemory / 1073741824) - 8)
        let cpu = NSPopUpButton(frame: NSRect(x: 180, y: 48, width: 100, height: 26))
        cpu.addItems(withTitles: (1...maxCPU).map(String.init))
        cpu.selectItem(withTitle: String(current.first ?? 1))
        let ram = NSPopUpButton(frame: NSRect(x: 180, y: 8, width: 100, height: 26))
        ram.addItems(withTitles: (2...maxRAM).map(String.init))
        ram.selectItem(withTitle: String(current.count > 1 ? current[1] : 2))
        let view = NSView(frame: NSRect(x: 0, y: 0, width: 300, height: 84))
        for (text, y) in [("CPU (ядра)", 52), ("Память (ГБ)", 12)] {
            let label = NSTextField(labelWithString: text)
            label.frame = NSRect(x: 0, y: y, width: 160, height: 22)
            view.addSubview(label)
        }
        view.addSubview(cpu)
        view.addSubview(ram)
        let alert = NSAlert()
        alert.messageText = "Ресурсы виртуалки"
        alert.informativeText = "Применятся при следующем запуске. Текущая VM не изменится. Mac остаются минимум 2 ядра и 8 ГБ RAM."
        alert.accessoryView = view
        alert.addButton(withTitle: "Сохранить")
        alert.addButton(withTitle: "Отмена")
        NSApp.activate(ignoringOtherApps: true)
        if alert.runModal() == .alertFirstButtonReturn {
            operate(["resources", cpu.titleOfSelectedItem ?? "1", ram.titleOfSelectedItem ?? "2"])
        }
    }

    @objc func stopVM() {
        let alert = NSAlert()
        alert.messageText = "Убрать Mac из кластера?"
        alert.informativeText = "Виртуалка остановится, нода socrat-mac будет снята с расписания и удалена."
        alert.addButton(withTitle: "Остановить")
        alert.addButton(withTitle: "Отмена")
        NSApp.activate(ignoringOtherApps: true)
        if alert.runModal() != .alertFirstButtonReturn { return }
        operate(["down"])
    }

    func operate(_ args: [String]) {
        busy = true
        render()
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            _ = runNightnode(args)
            DispatchQueue.main.async {
                self?.busy = false
                self?.refresh()
            }
        }
    }

    @objc func quit() { NSApp.terminate(nil) }
}

@main
enum Main {
    static func main() {
        let app = NSApplication.shared
        let delegate = App()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        app.run()
    }
}
