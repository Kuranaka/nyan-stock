import AVFoundation
import Foundation

let arguments = CommandLine.arguments
guard arguments.count == 4 || arguments.count == 5 else {
  fputs("Usage: convert-app-preview.swift <source> <output> <max-seconds> [target-fps]\n", stderr)
  exit(64)
}

let sourceURL = URL(fileURLWithPath: arguments[1])
let outputURL = URL(fileURLWithPath: arguments[2])
let maximumDuration = Double(arguments[3]) ?? 30
let targetFPS = arguments.count == 5 ? (Int32(arguments[4]) ?? 30) : 30
let asset = AVURLAsset(url: sourceURL)

guard let sourceVideoTrack = asset.tracks(withMediaType: .video).first else {
  fputs("No video track found.\n", stderr)
  exit(65)
}

let duration = min(asset.duration, CMTime(seconds: maximumDuration, preferredTimescale: 600))
let composition = AVMutableComposition()
guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
  fputs("Unable to create video track.\n", stderr)
  exit(66)
}

do {
  try videoTrack.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: sourceVideoTrack, at: .zero)
  if let sourceAudioTrack = asset.tracks(withMediaType: .audio).first,
     let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
    try audioTrack.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: sourceAudioTrack, at: .zero)
  }
} catch {
  fputs("Unable to read source tracks: \(error)\n", stderr)
  exit(67)
}

let transformedSize = sourceVideoTrack.naturalSize.applying(sourceVideoTrack.preferredTransform)
let sourceWidth = abs(transformedSize.width)
let sourceHeight = abs(transformedSize.height)
let outputSize = CGSize(width: 886, height: 1920)
let scale = min(outputSize.width / sourceWidth, outputSize.height / sourceHeight)
let contentSize = CGSize(width: sourceWidth * scale, height: sourceHeight * scale)
let offset = CGPoint(x: (outputSize.width - contentSize.width) / 2, y: (outputSize.height - contentSize.height) / 2)

var transform = sourceVideoTrack.preferredTransform
transform = transform.concatenating(CGAffineTransform(scaleX: scale, y: scale))
transform = transform.concatenating(CGAffineTransform(translationX: offset.x / scale, y: offset.y / scale))

let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
layerInstruction.setTransform(transform, at: .zero)
let instruction = AVMutableVideoCompositionInstruction()
instruction.timeRange = CMTimeRange(start: .zero, duration: duration)
instruction.layerInstructions = [layerInstruction]
let videoComposition = AVMutableVideoComposition()
videoComposition.renderSize = outputSize
videoComposition.frameDuration = CMTime(value: 1, timescale: targetFPS)
videoComposition.instructions = [instruction]

try? FileManager.default.removeItem(at: outputURL)
guard let exportSession = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
  fputs("Unable to create export session.\n", stderr)
  exit(68)
}
exportSession.outputURL = outputURL
exportSession.outputFileType = .mp4
exportSession.videoComposition = videoComposition
exportSession.shouldOptimizeForNetworkUse = true

let semaphore = DispatchSemaphore(value: 0)
exportSession.exportAsynchronously { semaphore.signal() }
semaphore.wait()

guard exportSession.status == .completed else {
  let message = exportSession.error?.localizedDescription ?? "unknown error"
  fputs("Export failed: \(message)\n", stderr)
  exit(69)
}

print("Created \(outputURL.path)")
