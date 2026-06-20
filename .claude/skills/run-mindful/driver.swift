// Mindful run-driver — headless WebKit harness for the web app.
//
// Mindful is a static HTML/CSS/JS app that the macOS wrapper serves over a
// custom `mindful://` scheme (so localStorage, the service worker, and relative
// fetches all behave like real https). This driver does the same thing from the
// command line using WKWebView — the same engine the shipped app uses — so an
// agent can screenshot any page or run JS against it WITHOUT building the .app.
//
// Usage:
//   swift driver.swift shot <page.html> <out.png> [js] [width] [height]
//   swift driver.swift eval <page.html> <js-with-return>
//
// `js` runs after the page settles; for `shot` it's handy for forcing the
// scroll-reveal animations visible or seeding localStorage. Examples:
//   swift driver.swift shot index.html /tmp/home.png \
//     'document.querySelectorAll(".reveal").forEach(e=>e.classList.add("visible"));'
//   swift driver.swift eval today.html 'return document.title;'
//
// WEB_ROOT env var overrides where pages are served from (default: the
// "Mental Health Tracker" source folder, located relative to this script).

import Cocoa
import WebKit

let args = CommandLine.arguments
guard args.count >= 4 else {
    FileHandle.standardError.write(Data("""
    usage:
      swift driver.swift shot <page.html> <out.png> [js] [width] [height]
      swift driver.swift eval <page.html> <js-with-return>

    """.utf8))
    exit(2)
}
let mode = args[1]            // "shot" | "eval"
let page = args[2]
let arg3 = args[3]            // shot: out.png   eval: js
let shotJS = args.count > 4 ? args[4] : ""
let width = args.count > 5 ? Int(args[5]) ?? 1100 : 1100
let height = args.count > 6 ? Int(args[6]) ?? 760 : 760

// Web root: $WEB_ROOT, else the source folder four levels up from this script
// (.claude/skills/run-mindful/driver.swift -> unit root -> "Mental Health Tracker").
let webRoot: URL = {
    if let env = ProcessInfo.processInfo.environment["WEB_ROOT"] {
        return URL(fileURLWithPath: env)
    }
    let unit = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // run-mindful
        .deletingLastPathComponent()   // skills
        .deletingLastPathComponent()   // .claude
        .deletingLastPathComponent()   // unit root
    return unit.appendingPathComponent("Mental Health Tracker")
}()

final class SchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ w: WKWebView, start task: WKURLSchemeTask) {
        let url = task.request.url!
        var path = url.path
        if path.isEmpty || path == "/" { path = "/" + page }
        let file = webRoot.appendingPathComponent(String(path.dropFirst()))
        let mime: String = {
            switch file.pathExtension {
            case "css": return "text/css"
            case "js": return "text/javascript"
            case "png": return "image/png"
            case "svg": return "image/svg+xml"
            case "json": return "application/json"
            case "webmanifest": return "application/manifest+json"
            default: return "text/html"
            }
        }()
        let data = (try? Data(contentsOf: file)) ?? Data()
        task.didReceive(URLResponse(url: url, mimeType: mime,
                                    expectedContentLength: data.count, textEncodingName: "utf-8"))
        task.didReceive(data)
        task.didFinish()
    }
    func webView(_ w: WKWebView, stop task: WKURLSchemeTask) {}
}

final class Delegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var web: WKWebView!
    var window: NSWindow!

    func applicationDidFinishLaunching(_ note: Notification) {
        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(SchemeHandler(), forURLScheme: "mindful")
        let rect = NSRect(x: 0, y: 0, width: width, height: height)
        web = WKWebView(frame: rect, configuration: cfg)
        web.navigationDelegate = self
        // A real (offscreen-rendered) window so takeSnapshot has something to draw.
        window = NSWindow(contentRect: rect, styleMask: [.titled],
                          backing: .buffered, defer: false)
        window.contentView = web
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        web.load(URLRequest(url: URL(string: "mindful://localhost/\(page)")!))
    }

    func webView(_ w: WKWebView, didFinish nav: WKNavigation!) {
        // Let inline scripts / first render settle before poking the page.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            let js = mode == "eval" ? arg3 : shotJS
            w.callAsyncJavaScript(js.isEmpty ? "return true;" : js,
                                  arguments: [:], in: nil, in: .page) { result in
                if mode == "eval" {
                    switch result {
                    case .success(let v): print("RESULT: \(v ?? "nil")")
                    case .failure(let e): print("EVAL-ERROR: \(e.localizedDescription)")
                    }
                    exit(0)
                }
                // shot: give the DOM a beat to repaint, then snapshot.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                    w.takeSnapshot(with: WKSnapshotConfiguration()) { image, error in
                        guard let image = image, let tiff = image.tiffRepresentation,
                              let rep = NSBitmapImageRep(data: tiff),
                              let png = rep.representation(using: .png, properties: [:]) else {
                            FileHandle.standardError.write(Data("snapshot failed: \(error?.localizedDescription ?? "?")\n".utf8))
                            exit(1)
                        }
                        do {
                            try png.write(to: URL(fileURLWithPath: arg3))
                            print("wrote \(arg3)")
                            exit(0)
                        } catch {
                            FileHandle.standardError.write(Data("write failed: \(error)\n".utf8))
                            exit(1)
                        }
                    }
                }
            }
        }
    }
}

let app = NSApplication.shared
let delegate = Delegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
