import AVFoundation
import AppKit

let arguments = CommandLine.arguments.dropFirst()
guard let outputDirectory = arguments.first else {
  fputs("Usage: inspect_preview.swift OUTPUT_DIR INPUT...\n", stderr)
  exit(1)
}

let directoryURL = URL(fileURLWithPath: outputDirectory)
try FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true)

for path in arguments.dropFirst() {
  let asset = AVURLAsset(url: URL(fileURLWithPath: path))
  let duration = try await asset.load(.duration)
  let tracks = try await asset.loadTracks(withMediaType: .video)
  guard let track = tracks.first else { continue }
  let size = try await track.load(.naturalSize)
  let transform = try await track.load(.preferredTransform)
  let displaySize = size.applying(transform)
  print("\(path): \(abs(displaySize.width))x\(abs(displaySize.height)), \(CMTimeGetSeconds(duration))s")

  let generator = AVAssetImageGenerator(asset: asset)
  generator.appliesPreferredTrackTransform = true
  generator.maximumSize = CGSize(width: 720, height: 1280)
  for (index, fraction) in [0.15, 0.5, 0.85, 0.91, 0.96].enumerated() {
    let time = CMTime(seconds: CMTimeGetSeconds(duration) * fraction, preferredTimescale: 600)
    let image = try generator.copyCGImage(at: time, actualTime: nil)
    let name = URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
    let output = directoryURL.appendingPathComponent("\(name)-\(index + 1).jpg")
    let bitmap = NSBitmapImageRep(cgImage: image)
    try bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.85])?.write(to: output)
  }
}
