// devicon: makes the Debug-only dev variant of an Xcode app icon.
// Renders AppIcon.icon (via Icon Composer's ictool) or a PNG master, draws a yellow
// "DEV" corner ribbon on it and writes AppIcon-Dev.appiconset. One self-contained file
// so apps can vendor it: `swift devicon.swift --help`. Spec: README.md next to this file.

import AppKit
import CoreGraphics
import CoreText
import Foundation
import ImageIO

let toolVersion = "devicon 1 (ribbon w0.30 d0.22 text32, mac tile 824)"

let usage = """
  usage:
    swift devicon.swift --icon AppIcon.icon --platform macOS|iOS --out path/AppIcon-Dev.appiconset
    swift devicon.swift --png master.png --platform macOS|iOS --out path/AppIcon-Dev.appiconset

  options:
    --force   render even when the stamp says the set is fresh
    --check   exit 1 if the set is stale, 0 if fresh; renders nothing
  """

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("devicon: \(message)\n".utf8))
  exit(2)
}

enum Platform: String { case macOS, iOS }

struct Options {
  var icon: URL?
  var png: URL?
  var platform: Platform?
  var out: URL?
  var force = false
  var check = false
}

func parseOptions(_ args: [String]) -> Options {
  var o = Options()
  var i = 0
  func value() -> String {
    i += 1
    guard i < args.count else { fail("\(args[i - 1]) needs a value\n\(usage)") }
    return args[i]
  }
  while i < args.count {
    switch args[i] {
    case "--icon": o.icon = URL(fileURLWithPath: value()).standardizedFileURL
    case "--png": o.png = URL(fileURLWithPath: value()).standardizedFileURL
    case "--platform":
      let v = value()
      guard let p = Platform(rawValue: v) else { fail("--platform must be macOS or iOS, got \(v)") }
      o.platform = p
    case "--out": o.out = URL(fileURLWithPath: value()).standardizedFileURL
    case "--force": o.force = true
    case "--check": o.check = true
    case "-h", "--help":
      print(usage)
      exit(0)
    default: fail("unknown argument \(args[i])\n\(usage)")
    }
    i += 1
  }
  if (o.icon == nil) == (o.png == nil) { fail("pass exactly one of --icon or --png\n\(usage)") }
  if o.platform == nil { fail("--platform is required\n\(usage)") }
  if o.out == nil { fail("--out is required\n\(usage)") }
  return o
}

// MARK: Stamp

// FNV-1a 64: no CryptoKit needed, and only a staleness check depends on it.
struct Hasher64 {
  var h: UInt64 = 0xcbf2_9ce4_8422_2325
  mutating func add(_ data: Data) {
    data.withUnsafeBytes { raw in
      for b in raw {
        h ^= UInt64(b)
        h = h &* 0x0000_0100_0000_01b3
      }
    }
  }
  mutating func add(_ s: String) { add(Data((s + "\u{0}").utf8)) }
}

func inputFiles(_ o: Options) -> [(String, URL)] {
  if let png = o.png { return [(png.lastPathComponent, png)] }
  let root = o.icon!
  guard let e = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey])
  else { return [] }
  var files: [(String, URL)] = []
  for case let url as URL in e {
    guard (try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true else { continue }
    let rel = String(url.standardizedFileURL.path.dropFirst(root.path.count + 1))
    if rel.hasSuffix(".DS_Store") { continue }
    files.append((rel, url))
  }
  return files.sorted { $0.0 < $1.0 }
}

func inputStamp(_ o: Options) -> String {
  var h = Hasher64()
  h.add(toolVersion)
  h.add(o.platform!.rawValue)
  for (rel, url) in inputFiles(o) {
    guard let data = try? Data(contentsOf: url) else { fail("cannot read \(url.path)") }
    h.add(rel)
    h.add(data)
  }
  return "\(toolVersion)\n\(String(format: "%016llx", h.h))\n"
}

// MARK: Icon set layout

struct Entry {
  let size: Int
  let scale: Int
  var pixels: Int { size * scale }
  var file: String { "icon_\(size)x\(size)\(scale == 2 ? "@2x" : "").png" }
}

func entries(_ p: Platform) -> [Entry] {
  switch p {
  case .macOS: return [16, 32, 128, 256, 512].flatMap { s in [Entry(size: s, scale: 1), Entry(size: s, scale: 2)] }
  case .iOS: return [Entry(size: 1024, scale: 1)]
  }
}

func contentsJSON(_ p: Platform) -> String {
  let images: [String]
  switch p {
  case .macOS:
    images = entries(p).map {
      """
          {
            "filename" : "\($0.file)",
            "idiom" : "mac",
            "scale" : "\($0.scale)x",
            "size" : "\($0.size)x\($0.size)"
          }
      """
    }
  case .iOS:
    images = [
      """
          {
            "filename" : "\(entries(p)[0].file)",
            "idiom" : "universal",
            "platform" : "ios",
            "size" : "1024x1024"
          }
      """
    ]
  }
  return """
    {
      "images" : [
    \(images.joined(separator: ",\n"))
      ],
      "info" : {
        "author" : "xcode",
        "version" : 1
      }
    }

    """
}

// MARK: Sources

func run(_ path: String, _ args: [String]) -> (Int32, String) {
  let p = Process()
  p.executableURL = URL(fileURLWithPath: path)
  p.arguments = args
  let pipe = Pipe()
  p.standardOutput = pipe
  p.standardError = pipe
  do { try p.run() } catch { return (-1, "\(error)") }
  let out = pipe.fileHandleForReading.readDataToEndOfFile()
  p.waitUntilExit()
  return (p.terminationStatus, String(decoding: out, as: UTF8.self))
}

func findIctool() -> String {
  let tail = "Applications/Icon Composer.app/Contents/Executables/ictool"
  var candidates: [String] = []
  let (rc, dev) = run("/usr/bin/xcode-select", ["-p"])
  if rc == 0 {
    let developer = URL(fileURLWithPath: dev.trimmingCharacters(in: .whitespacesAndNewlines))
    candidates.append(developer.deletingLastPathComponent().appendingPathComponent(tail).path)
  }
  candidates.append("/Applications/Xcode.app/Contents/\(tail)")
  for c in candidates where FileManager.default.isExecutableFile(atPath: c) { return c }
  fail("ictool not found (looked at \(candidates.joined(separator: ", "))). Install Xcode 26 or pass --png.")
}

func loadImage(_ url: URL) -> CGImage {
  guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
    let img = CGImageSourceCreateImageAtIndex(src, 0, nil)
  else { fail("cannot decode image \(url.path)") }
  return img
}

func renderIcon(ictool: String, icon: URL, platform: Platform, pixels: Int, tmp: URL) -> CGImage {
  let out = tmp.appendingPathComponent("render-\(pixels).png")
  let (rc, log) = run(ictool, [
    icon.path, "--export-image", "--output-file", out.path, "--platform", platform.rawValue,
    "--rendition", "Default", "--width", "\(pixels)", "--height", "\(pixels)", "--scale", "1",
  ])
  guard rc == 0, FileManager.default.fileExists(atPath: out.path) else {
    fail("ictool failed on \(icon.path) at \(pixels) px (exit \(rc)):\n\(log)")
  }
  return loadImage(out)
}

// MARK: Drawing (see README "Spec")

let yellow = CGColor(srgbRed: 1, green: 0xd6 / 255.0, blue: 0x0a / 255.0, alpha: 1)
let ink = CGColor(srgbRed: 0x11 / 255.0, green: 0x11 / 255.0, blue: 0x11 / 255.0, alpha: 1)
let srgb = CGColorSpace(name: CGColorSpace.sRGB)!

struct Box { var x, y, s: Double }

// Square box around pixels with alpha > 128, in y-down pixel coordinates.
func tileBox(_ ctx: CGContext, _ n: Int) -> Box {
  guard let data = ctx.data else { return Box(x: 0, y: 0, s: Double(n)) }
  let px = data.bindMemory(to: UInt8.self, capacity: ctx.bytesPerRow * n)
  var x0 = n, y0 = n, x1 = -1, y1 = -1
  for y in 0..<n {
    let row = y * ctx.bytesPerRow
    for x in 0..<n where px[row + x * 4 + 3] > 128 {
      x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y)
    }
  }
  if x1 < 0 { return Box(x: 0, y: 0, s: Double(n)) }
  let w = x1 - x0 + 1, h = y1 - y0 + 1, s = max(w, h)
  return Box(x: Double(x0) - Double(s - w) / 2, y: Double(y0) - Double(s - h) / 2, s: Double(s))
}

func drawRibbon(_ ctx: CGContext, _ b: Box, _ n: Int) {
  let w = 0.30 * b.s
  let d = (n <= 20 ? 0.20 : 0.22) * b.s
  let e = max(1, b.s / 40)
  let L = 2 * b.s
  ctx.saveGState()
  // Work in y-down coordinates like the canvas reference.
  ctx.translateBy(x: 0, y: CGFloat(n))
  ctx.scaleBy(x: 1, y: -1)
  let tile = CGRect(x: b.x, y: b.y, width: b.s, height: b.s)
  ctx.addPath(CGPath(roundedRect: tile, cornerWidth: 0.225 * b.s, cornerHeight: 0.225 * b.s, transform: nil))
  ctx.clip()
  ctx.translateBy(x: b.x + b.s, y: b.y)
  ctx.rotate(by: .pi / 4)
  ctx.setFillColor(ink)
  ctx.fill(CGRect(x: -L, y: d - e, width: 2 * L, height: w + 2 * e))
  ctx.setFillColor(yellow)
  ctx.fill(CGRect(x: -L, y: d, width: 2 * L, height: w))
  if n >= 32 {
    let f = 0.62 * w
    let font = CTFontCreateUIFontForLanguage(.emphasizedSystem, f, nil)
      ?? CTFontCreateWithName("Helvetica-Bold" as CFString, f, nil)
    let attrs: [NSAttributedString.Key: Any] = [
      NSAttributedString.Key(kCTFontAttributeName as String): font,
      NSAttributedString.Key(kCTForegroundColorAttributeName as String): ink,
    ]
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: "DEV", attributes: attrs))
    let advance = CTLineGetTypographicBounds(line, nil, nil, nil)
    // Canvas textBaseline "middle" is the em box middle; Chrome splits the em by ascent : descent.
    let asc = CTFontGetAscent(font), desc = CTFontGetDescent(font)
    let middle = d + w / 2 + 0.04 * f
    let baseline = middle + f * (asc - desc) / (2 * (asc + desc))
    ctx.translateBy(x: -advance / 2, y: baseline)
    ctx.scaleBy(x: 1, y: -1)
    ctx.textPosition = .zero
    CTLineDraw(line, ctx)
  }
  ctx.restoreGState()
}

func makeIcon(source: CGImage, tile: Int, pixels n: Int, platform: Platform) -> CGImage {
  guard
    let ctx = CGContext(
      data: nil, width: n, height: n, bitsPerComponent: 8, bytesPerRow: n * 4, space: srgb,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
  else { fail("cannot make a \(n) px bitmap") }
  ctx.interpolationQuality = .high
  let full = CGRect(x: 0, y: 0, width: n, height: n)
  if platform == .iOS {
    ctx.setFillColor(CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 1))
    ctx.fill(full)
  }
  let inset = (n - tile) / 2
  ctx.draw(source, in: CGRect(x: inset, y: n - inset - tile, width: tile, height: tile))
  let box = platform == .iOS ? Box(x: 0, y: 0, s: Double(n)) : tileBox(ctx, n)
  drawRibbon(ctx, box, n)
  guard let img = ctx.makeImage() else { fail("cannot read back the \(n) px bitmap") }
  if platform == .macOS { return img }
  // iOS app icons must not carry an alpha channel.
  guard
    let flat = CGContext(
      data: nil, width: n, height: n, bitsPerComponent: 8, bytesPerRow: n * 4, space: srgb,
      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
  else { fail("cannot make a \(n) px bitmap") }
  flat.draw(img, in: full)
  return flat.makeImage()!
}

func writePNG(_ img: CGImage, _ url: URL) {
  guard let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else {
    fail("cannot write \(url.path)")
  }
  CGImageDestinationAddImage(dest, img, nil)
  if !CGImageDestinationFinalize(dest) { fail("cannot write \(url.path)") }
}

// MARK: Main

let opts = parseOptions(Array(CommandLine.arguments.dropFirst()))
let platform = opts.platform!
let outDir = opts.out!
let fm = FileManager.default

if let icon = opts.icon {
  var isDir: ObjCBool = false
  guard fm.fileExists(atPath: icon.path, isDirectory: &isDir), isDir.boolValue,
    fm.fileExists(atPath: icon.appendingPathComponent("icon.json").path)
  else { fail("\(icon.path) is not an Icon Composer .icon folder (no icon.json)") }
}
if let png = opts.png, !fm.fileExists(atPath: png.path) { fail("\(png.path) does not exist") }
if outDir.pathExtension != "appiconset" { fail("--out must be a folder ending in .appiconset") }

let stampURL = outDir.appendingPathComponent(".devicon-source")
let stamp = inputStamp(opts)
let setComplete = (entries(platform).map(\.file) + ["Contents.json"]).allSatisfy {
  fm.fileExists(atPath: outDir.appendingPathComponent($0).path)
}
let fresh = setComplete && (try? String(contentsOf: stampURL, encoding: .utf8)) == stamp

if opts.check {
  if fresh {
    print("devicon: \(outDir.lastPathComponent) is fresh")
    exit(0)
  }
  FileHandle.standardError.write(
    Data("devicon: \(outDir.path) is stale; run devicon again without --check\n".utf8))
  exit(1)
}
if fresh && !opts.force {
  print("devicon: \(outDir.lastPathComponent) is fresh, skipped")
  exit(0)
}

let pixelSizes = Array(Set(entries(platform).map(\.pixels))).sorted()
var rendered: [Int: CGImage] = [:]
if let icon = opts.icon {
  let ictool = findIctool()
  let tmp = fm.temporaryDirectory.appendingPathComponent("devicon-\(UUID().uuidString)")
  do { try fm.createDirectory(at: tmp, withIntermediateDirectories: true) } catch {
    fail("cannot make a temp folder: \(error)")
  }
  defer { try? fm.removeItem(at: tmp) }
  for n in pixelSizes {
    // ictool exports the shape full bleed; macOS icons keep Apple's 824/1024 tile with a clear margin.
    let tile = platform == .macOS ? Int((Double(n) * 824 / 1024).rounded()) : n
    let render = renderIcon(ictool: ictool, icon: icon, platform: platform, pixels: tile, tmp: tmp)
    rendered[n] = makeIcon(source: render, tile: tile, pixels: n, platform: platform)
  }
  try? fm.removeItem(at: tmp)
} else {
  let master = loadImage(opts.png!)
  if master.width != master.height { fail("\(opts.png!.path) must be square, got \(master.width)x\(master.height)") }
  for n in pixelSizes { rendered[n] = makeIcon(source: master, tile: n, pixels: n, platform: platform) }
}

do { try fm.createDirectory(at: outDir, withIntermediateDirectories: true) } catch {
  fail("cannot create \(outDir.path): \(error)")
}
let catalog = outDir.deletingLastPathComponent()
let catalogContents = catalog.appendingPathComponent("Contents.json")
if catalog.pathExtension == "xcassets", !fm.fileExists(atPath: catalogContents.path) {
  try? Data("{\n  \"info\" : {\n    \"author\" : \"xcode\",\n    \"version\" : 1\n  }\n}\n".utf8)
    .write(to: catalogContents)
}
let keep = Set(entries(platform).map(\.file))
for name in (try? fm.contentsOfDirectory(atPath: outDir.path)) ?? []
where name.hasPrefix("icon_") && name.hasSuffix(".png") && !keep.contains(name) {
  try? fm.removeItem(at: outDir.appendingPathComponent(name))
}
for entry in entries(platform) { writePNG(rendered[entry.pixels]!, outDir.appendingPathComponent(entry.file)) }
do {
  try Data(contentsJSON(platform).utf8).write(to: outDir.appendingPathComponent("Contents.json"))
  try Data(stamp.utf8).write(to: stampURL)
} catch { fail("cannot write \(outDir.path): \(error)") }
print("devicon: wrote \(entries(platform).count) images to \(outDir.path)")
