// Renders the Lumen app icon — a glowing gradient orb on a dark squircle — to a PNG.
// Usage: swift makeicon.swift <output.png> [size]   (size defaults to 1024)

import AppKit

let out = CommandLine.arguments[1]
let size = CGFloat(CommandLine.arguments.count > 2 ? (Double(CommandLine.arguments[2]) ?? 1024) : 1024)

let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()

// Dark rounded-square backdrop so the orb reads as a light source.
let bg = NSBezierPath(
    roundedRect: NSRect(x: 0, y: 0, width: size, height: size),
    xRadius: size * 0.22, yRadius: size * 0.22)
NSGradient(
    starting: NSColor(srgbRed: 0.07, green: 0.16, blue: 0.13, alpha: 1),
    ending: NSColor(srgbRed: 0.03, green: 0.09, blue: 0.08, alpha: 1))!
    .draw(in: bg, angle: -90)

let cx = size / 2, cy = size / 2

// Soft outer glow.
let glowR = size * 0.42
let glow = NSGradient(colors: [
    NSColor(srgbRed: 0.37, green: 0.84, blue: 0.70, alpha: 0.45),
    NSColor(srgbRed: 0.37, green: 0.84, blue: 0.70, alpha: 0.0)])!
glow.draw(
    in: NSBezierPath(ovalIn: NSRect(x: cx - glowR, y: cy - glowR, width: glowR * 2, height: glowR * 2)),
    relativeCenterPosition: NSPoint(x: 0, y: 0))

// The orb: radial gradient, brighter toward the upper-left.
let orbR = size * 0.30
let orb = NSGradient(colors: [
    NSColor(srgbRed: 0.95, green: 1.00, blue: 0.98, alpha: 1),
    NSColor(srgbRed: 0.50, green: 0.90, blue: 0.77, alpha: 1),
    NSColor(srgbRed: 0.17, green: 0.55, blue: 0.45, alpha: 1)])!
orb.draw(
    in: NSBezierPath(ovalIn: NSRect(x: cx - orbR, y: cy - orbR, width: orbR * 2, height: orbR * 2)),
    relativeCenterPosition: NSPoint(x: -0.35, y: 0.40))

// Glossy highlight near the top.
NSColor(white: 1, alpha: 0.30).setFill()
NSBezierPath(ovalIn: NSRect(
    x: cx - orbR * 0.32, y: cy + orbR * 0.20,
    width: orbR * 0.62, height: orbR * 0.40)).fill()

image.unlockFocus()

guard let tiff = image.tiffRepresentation,
    let rep = NSBitmapImageRep(data: tiff),
    let png = rep.representation(using: .png, properties: [:])
else {
    FileHandle.standardError.write(Data("could not render icon\n".utf8))
    exit(1)
}
try png.write(to: URL(fileURLWithPath: out))
