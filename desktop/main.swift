// Mindful — native macOS shell around the Mental Health Tracker web app.
// Serves the bundled web files over a custom scheme (mindful://localhost) so
// localStorage gets a stable origin and persists across launches.

import Cocoa
import WebKit

private let appName = "Mindful"
private let appScheme = "mindful"
private let startURL = URL(string: "\(appScheme)://localhost/index.html")!

private func mimeType(forExtension ext: String) -> String {
    switch ext.lowercased() {
    case "html": return "text/html"
    case "css": return "text/css"
    case "js": return "text/javascript"
    case "json": return "application/json"
    case "svg": return "image/svg+xml"
    case "png": return "image/png"
    case "jpg", "jpeg": return "image/jpeg"
    case "ico": return "image/x-icon"
    case "woff", "woff2": return "font/woff2"
    default: return "application/octet-stream"
    }
}

final class LocalSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL

    init(root: URL) { self.root = root }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else { return }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file) else {
            urlSchemeTask.didFailWithError(
                NSError(domain: NSURLErrorDomain, code: NSURLErrorFileDoesNotExist))
            return
        }
        let response = URLResponse(
            url: url,
            mimeType: mimeType(forExtension: file.pathExtension),
            expectedContentLength: data.count,
            textEncodingName: "utf-8")
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate,
    WKDownloadDelegate
{
    private var window: NSWindow!
    private var webView: WKWebView!
    private var downloadDestinations = [ObjectIdentifier: URL]()
    private let selfTest = CommandLine.arguments.contains("--selftest")
    // --page <file> overrides which bundled page the self-test loads.
    private var startPath: String {
        if let i = CommandLine.arguments.firstIndex(of: "--page"),
            i + 1 < CommandLine.arguments.count
        {
            return CommandLine.arguments[i + 1]
        }
        return "index.html"
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()

        let webRoot = Bundle.main.resourceURL!.appendingPathComponent("web")
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(LocalSchemeHandler(root: webRoot), forURLScheme: appScheme)
        config.websiteDataStore = .default()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        if selfTest {
            // Record the first uncaught error so the self-test can fail on it.
            let src = "window.addEventListener('error', e => " +
                "{ window.__selftestError = window.__selftestError || e.message; });"
            config.userContentController.addUserScript(
                WKUserScript(source: src, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsMagnification = true

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1150, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.title = appName
        window.minSize = NSSize(width: 640, height: 480)
        window.contentView = webView
        window.center()
        window.setFrameAutosaveName("MindfulMainWindow")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        let start = URL(string: "\(appScheme)://localhost/\(startPath)") ?? startURL
        webView.load(URLRequest(url: start))
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // MARK: - Menu

    private func buildMenu() {
        let mainMenu = NSMenu()

        let appMenu = NSMenu()
        appMenu.addItem(
            withTitle: "About \(appName)",
            action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(
            withTitle: "Hide \(appName)", action: #selector(NSApplication.hide(_:)),
            keyEquivalent: "h")
        appMenu.addItem(
            withTitle: "Quit \(appName)", action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q")
        let appItem = NSMenuItem()
        appItem.submenu = appMenu
        mainMenu.addItem(appItem)

        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(
            withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(
            withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        let editItem = NSMenuItem()
        editItem.submenu = editMenu
        mainMenu.addItem(editItem)

        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(withTitle: "Reload", action: #selector(reloadPage), keyEquivalent: "r")
        let viewItem = NSMenuItem()
        viewItem.submenu = viewMenu
        mainMenu.addItem(viewItem)

        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(
            withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)),
            keyEquivalent: "m")
        windowMenu.addItem(
            withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowMenu.addItem(
            withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        let windowItem = NSMenuItem()
        windowItem.submenu = windowMenu
        mainMenu.addItem(windowItem)

        NSApp.mainMenu = mainMenu
    }

    @objc private func reloadPage() { webView.reload() }

    // MARK: - Navigation

    func webView(
        _ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        // The app is local-only; anything pointing at the web opens in the browser.
        if let url = navigationAction.request.url,
            let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https"
        {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(
        _ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(
        _ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload
    ) {
        download.delegate = self
    }

    func webView(
        _ webView: WKWebView, navigationResponse: WKNavigationResponse,
        didBecome download: WKDownload
    ) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard selfTest else { return }
        let js = """
            (() => {
              try {
                localStorage.setItem('__selftest', 'ok');
                const v = localStorage.getItem('__selftest');
                localStorage.removeItem('__selftest');
                return ['storage=' + v, 'title=' + document.title,
                        'sections=' + document.querySelectorAll('section').length,
                        'cards=' + document.querySelectorAll('.card').length,
                        'media=' + !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
                        'jserr=' + (window.__selftestError || 'none')].join(' ');
              } catch (e) { return 'error=' + e.message; }
            })()
            """
        webView.evaluateJavaScript(js) { result, error in
            print(result as? String ?? "selftest failed: \(error?.localizedDescription ?? "unknown")")
            exit(result is String ? 0 : 1)
        }
    }

    // MARK: - JS dialogs (alert/confirm used for import results and deletions)

    func webView(
        _ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = appName
        alert.informativeText = message
        alert.runModal()
        completionHandler()
    }

    func webView(
        _ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = appName
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    // Camera permission for the stargazing page's motion sensing. The app
    // only ever sees the feed locally; granting here lets WKWebView expose
    // navigator.mediaDevices. macOS still shows its own TCC prompt once.
    func webView(
        _ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        decisionHandler(.grant)
    }

    // target=_blank links (e.g. Google AI Studio) open in the default browser.
    func webView(
        _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    // MARK: - Downloads (the "Export backup" button)

    func download(
        _ download: WKDownload, decideDestinationUsing response: URLResponse,
        suggestedFilename: String, completionHandler: @escaping (URL?) -> Void
    ) {
        let downloads = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        var dest = downloads.appendingPathComponent(suggestedFilename)
        let base = dest.deletingPathExtension().lastPathComponent
        let ext = dest.pathExtension
        var n = 2
        while FileManager.default.fileExists(atPath: dest.path) {
            dest = downloads.appendingPathComponent("\(base) \(n)").appendingPathExtension(ext)
            n += 1
        }
        downloadDestinations[ObjectIdentifier(download)] = dest
        completionHandler(dest)
    }

    func downloadDidFinish(_ download: WKDownload) {
        if let dest = downloadDestinations.removeValue(forKey: ObjectIdentifier(download)) {
            NSWorkspace.shared.activateFileViewerSelecting([dest])
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloadDestinations[ObjectIdentifier(download)] = nil
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
