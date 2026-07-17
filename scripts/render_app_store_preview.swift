import AVFoundation
import AppKit
import QuartzCore

struct Clip {
  let filename: String
  let start: Double
  let duration: Double
  let title: String
}

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let sourceDirectory = root.appendingPathComponent("artifacts/app-previews")
let outputDirectory = sourceDirectory.appendingPathComponent("app-store")
let outputURL = outputDirectory.appendingPathComponent("nyan-stock-app-store-preview.mp4")

let clips = [
  Clip(filename: "nyan-stock-preview-01.mp4", start: 0, duration: 6, title: "いつもの猫用品を\nかんたん登録"),
  Clip(filename: "nyan-stock-preview-01.mp4", start: 10, duration: 7, title: "残り日数を\n自動で見える化"),
  Clip(filename: "nyan-stock-preview-02.mp4", start: 0, duration: 6, title: "必要なとき、すぐ購入先を確認"),
  Clip(filename: "nyan-stock-preview-03.mp4", start: 0, duration: 7, title: "猫用品の費用も\nひと目で確認"),
  Clip(filename: "nyan-stock-preview-01.mp4", start: 22, duration: 4, title: "")
]

let renderSize = CGSize(width: 886, height: 1920)
let composition = AVMutableComposition()
let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
var instructions: [AVMutableVideoCompositionInstruction] = []
var cursor = CMTime.zero

func fittedTransform(for track: AVAssetTrack) async throws -> CGAffineTransform {
  let naturalSize = try await track.load(.naturalSize)
  let preferredTransform = try await track.load(.preferredTransform)
  let transformed = CGRect(origin: .zero, size: naturalSize).applying(preferredTransform)
  let displayedSize = CGSize(width: abs(transformed.width), height: abs(transformed.height))
  let scale = min(renderSize.width / displayedSize.width, renderSize.height / displayedSize.height)
  let scaledSize = CGSize(width: displayedSize.width * scale, height: displayedSize.height * scale)
  let origin = CGPoint(x: (renderSize.width - scaledSize.width) / 2, y: (renderSize.height - scaledSize.height) / 2)
  let transform = preferredTransform.concatenating(CGAffineTransform(scaleX: scale, y: scale))
  let transformedScaled = CGRect(origin: .zero, size: naturalSize).applying(transform)
  return CGAffineTransform(translationX: origin.x - transformedScaled.minX, y: origin.y - transformedScaled.minY).concatenating(transform)
}

for clip in clips {
  let asset = AVURLAsset(url: sourceDirectory.appendingPathComponent(clip.filename))
  let sourceTracks = try await asset.loadTracks(withMediaType: .video)
  guard let sourceVideoTrack = sourceTracks.first else { throw NSError(domain: "Preview", code: 1, userInfo: [NSLocalizedDescriptionKey: "Video track missing: \(clip.filename)"]) }
  let timeRange = CMTimeRange(start: CMTime(seconds: clip.start, preferredTimescale: 600), duration: CMTime(seconds: clip.duration, preferredTimescale: 600))
  try videoTrack.insertTimeRange(timeRange, of: sourceVideoTrack, at: cursor)
  if let sourceAudioTrack = try await asset.loadTracks(withMediaType: .audio).first, let audioTrack {
    try? audioTrack.insertTimeRange(timeRange, of: sourceAudioTrack, at: cursor)
  }
  let instruction = AVMutableVideoCompositionInstruction()
  instruction.timeRange = CMTimeRange(start: cursor, duration: timeRange.duration)
  let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
  layerInstruction.setTransform(try await fittedTransform(for: sourceVideoTrack), at: cursor)
  instruction.layerInstructions = [layerInstruction]
  instructions.append(instruction)
  cursor = cursor + timeRange.duration
}

let videoComposition = AVMutableVideoComposition()
videoComposition.renderSize = renderSize
videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
videoComposition.instructions = instructions

let parentLayer = CALayer()
parentLayer.frame = CGRect(origin: .zero, size: renderSize)
let videoLayer = CALayer()
videoLayer.frame = parentLayer.frame
parentLayer.addSublayer(videoLayer)

func titleImage(_ string: String, size: CGSize, fontSize: CGFloat, color: NSColor = .white) -> CGImage {
  let image = NSImage(size: size)
  image.lockFocus()
  let font = NSFont(name: "Hiragino Sans W6", size: fontSize) ?? .systemFont(ofSize: fontSize, weight: .semibold)
  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = .center
  paragraph.lineBreakMode = .byWordWrapping
  let text = NSAttributedString(string: string, attributes: [
    .font: font,
    .foregroundColor: color,
    .paragraphStyle: paragraph
  ])
  text.draw(in: CGRect(origin: .zero, size: size))
  image.unlockFocus()
  return image.cgImage(forProposedRect: nil, context: nil, hints: nil)!
}

var titleStart: Double = 0
for clip in clips {
  guard !clip.title.isEmpty else { continue }
  let group = CALayer()
  group.frame = CGRect(x: 42, y: 1280, width: renderSize.width - 84, height: 260)
  group.backgroundColor = NSColor(calibratedWhite: 0.12, alpha: 0.74).cgColor
  group.cornerRadius = 34
  let title = CALayer()
  title.frame = CGRect(x: 30, y: 38, width: group.bounds.width - 60, height: 184)
  title.contents = titleImage(clip.title, size: title.bounds.size, fontSize: 48)
  title.contentsGravity = .resizeAspect
  group.addSublayer(title)
  group.opacity = 0
  let fadeIn = CABasicAnimation(keyPath: "opacity")
  fadeIn.fromValue = 0
  fadeIn.toValue = 1
  fadeIn.beginTime = AVCoreAnimationBeginTimeAtZero + titleStart + 0.18
  fadeIn.duration = 0.28
  fadeIn.fillMode = .forwards
  fadeIn.isRemovedOnCompletion = false
  let fadeOut = CABasicAnimation(keyPath: "opacity")
  fadeOut.fromValue = 1
  fadeOut.toValue = 0
  fadeOut.beginTime = AVCoreAnimationBeginTimeAtZero + titleStart + clip.duration - 0.35
  fadeOut.duration = 0.25
  fadeOut.fillMode = .forwards
  fadeOut.isRemovedOnCompletion = false
  group.add(fadeIn, forKey: "fadeIn")
  group.add(fadeOut, forKey: "fadeOut")
  parentLayer.addSublayer(group)
  titleStart += clip.duration
}

func opacityAnimation(_ layer: CALayer, keyTimes: [NSNumber], values: [NSNumber], key: String) {
  let animation = CAKeyframeAnimation(keyPath: "opacity")
  animation.keyTimes = keyTimes
  animation.values = values
  animation.beginTime = AVCoreAnimationBeginTimeAtZero
  animation.duration = 30
  animation.fillMode = .forwards
  animation.isRemovedOnCompletion = false
  layer.opacity = 0
  layer.add(animation, forKey: key)
}

func imageLayer(imageAt url: URL, frame: CGRect) -> CALayer {
  let image = NSImage(contentsOf: url)!
  let layer = CALayer()
  layer.frame = frame
  layer.contents = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
  layer.contentsGravity = .resizeAspectFill
  layer.masksToBounds = true
  return layer
}

// End card: the generated cat photo softens into the actual app icon.
let endingStart = 26.0
let photoFadeStart = 27.9
let photoFadeEnd = 28.9
let endBackground = CALayer()
endBackground.frame = parentLayer.frame
endBackground.backgroundColor = NSColor(calibratedRed: 1.0, green: 0.969, blue: 0.91, alpha: 1).cgColor
opacityAnimation(endBackground, keyTimes: [0, NSNumber(value: endingStart / 30), NSNumber(value: (endingStart + 0.18) / 30), 1], values: [0, 0, 1, 1], key: "endBackground")
parentLayer.addSublayer(endBackground)

let catPhoto = imageLayer(
  imageAt: outputDirectory.appendingPathComponent("assets/nyan-stock-real-cat.png"),
  frame: CGRect(x: 73, y: 600, width: 740, height: 740)
)
catPhoto.cornerRadius = 66
opacityAnimation(catPhoto, keyTimes: [0, NSNumber(value: endingStart / 30), NSNumber(value: (endingStart + 0.18) / 30), NSNumber(value: photoFadeStart / 30), NSNumber(value: photoFadeEnd / 30), 1], values: [0, 0, 1, 1, 0, 0], key: "catPhoto")
parentLayer.addSublayer(catPhoto)

let catCaption = CALayer()
catCaption.frame = CGRect(x: 70, y: 1435, width: 746, height: 132)
catCaption.contents = titleImage("猫用品の管理を、もっと気軽に", size: catCaption.bounds.size, fontSize: 42, color: .black)
catCaption.contentsGravity = .resizeAspect
opacityAnimation(catCaption, keyTimes: [0, NSNumber(value: endingStart / 30), NSNumber(value: (endingStart + 0.18) / 30), NSNumber(value: photoFadeStart / 30), NSNumber(value: photoFadeEnd / 30), 1], values: [0, 0, 1, 1, 0, 0], key: "catCaption")
parentLayer.addSublayer(catCaption)

let appIcon = imageLayer(
  imageAt: root.appendingPathComponent("apps/mobile/assets/icon.png"),
  frame: CGRect(x: 203, y: 750, width: 480, height: 480)
)
appIcon.cornerRadius = 92
opacityAnimation(appIcon, keyTimes: [0, NSNumber(value: photoFadeStart / 30), NSNumber(value: photoFadeEnd / 30), 1], values: [0, 0, 1, 1], key: "appIcon")
parentLayer.addSublayer(appIcon)

let appName = CALayer()
appName.frame = CGRect(x: 70, y: 1350, width: 746, height: 132)
appName.contents = titleImage("にゃんストック", size: appName.bounds.size, fontSize: 58, color: .black)
appName.contentsGravity = .resizeAspect
opacityAnimation(appName, keyTimes: [0, NSNumber(value: photoFadeStart / 30), NSNumber(value: photoFadeEnd / 30), 1], values: [0, 0, 1, 1], key: "appName")
parentLayer.addSublayer(appName)

videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parentLayer)
try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
try? FileManager.default.removeItem(at: outputURL)

guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
  throw NSError(domain: "Preview", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unable to create exporter"])
}
exporter.outputURL = outputURL
exporter.outputFileType = .mp4
exporter.videoComposition = videoComposition
try await exporter.export(to: outputURL, as: .mp4)
print(outputURL.path)
