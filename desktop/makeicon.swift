// Renders the app icon (the site's 🌿 mark on a soft green squircle) to a PNG.
// Usage: swift makeicon.swift <output.png>

import AppKit

let size: CGFloat = 1024
let out = CommandLine.arguments[1]

let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()

let inset = size * 0.098
let shape = NSBezierPath(
    roundedRect: NSRect(x: 0, y: 0, width: size, height: size).insetBy(dx: inset, dy: inset),
    xRadius: size * 0.22, yRadius: size * 0.22)
NSGradient(
    starting: NSColor(srgbRed: 0.91, green: 0.97, blue: 0.93, alpha: 1),
    ending: NSColor(srgbRed: 0.69, green: 0.89, blue: 0.78, alpha: 1))!
    .draw(in: shape, angle: -90)

let emoji = "🌿" as NSString
let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: size * 0.5)]
let textSize = emoji.size(withAttributes: attrs)
emoji.draw(
    at: NSPoint(x: (size - textSize.width) / 2, y: (size - textSize.height) / 2),
    withAttributes: attrs)

image.unlockFocus()

guard let tiff = image.tiffRepresentation,
    let rep = NSBitmapImageRep(data: tiff),
    let png = rep.representation(using: .png, properties: [:])
else {
    FileHandle.standardError.write(Data("could not render icon\n".utf8))
    exit(1)
}
try png.write(to: URL(fileURLWithPath: out))
