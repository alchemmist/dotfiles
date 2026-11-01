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
        if busy {
            item.button?.title = "night ..."
        } else if ready {
            item.button?.title = "night Ready"
        } else if running {
            item.button?.title = "night " + snapshot.node
        } else {
            item.button?.title = "night off"
        }

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
