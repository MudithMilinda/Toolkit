import AVFoundation
import Foundation
import ImageIO
import UniformTypeIdentifiers

enum ConverterError: LocalizedError {
  case usage
  case unsupported(String)
  case exportFailed(String)

  var errorDescription: String? {
    switch self {
    case .usage: return "Usage: video-converter <input> <output> <mp4|mov|mp3|gif>"
    case .unsupported(let message), .exportFailed(let message): return message
    }
  }
}

@main
struct VideoConverter {
  static func main() {
    do {
      let arguments = CommandLine.arguments
      guard arguments.count == 4 else { throw ConverterError.usage }

      let inputURL = URL(fileURLWithPath: arguments[1])
      let outputURL = URL(fileURLWithPath: arguments[2])
      let format = arguments[3].lowercased()
      if format == "mp3" {
        try convertToMP3(inputURL, outputURL)
        return
      }
      if format == "gif" {
        try convertToGIF(inputURL, outputURL)
        return
      }
      let outputType: AVFileType
      switch format {
      case "mp4": outputType = .mp4
      case "mov": outputType = .mov
      case "m4a": outputType = .m4a
      default: throw ConverterError.usage
      }

      let asset = AVURLAsset(url: inputURL)
      let presets = AVAssetExportSession.exportPresets(compatibleWith: asset)
      let preset = format == "m4a"
        ? AVAssetExportPresetAppleM4A
        : (presets.contains(AVAssetExportPresetHighestQuality)
            ? AVAssetExportPresetHighestQuality
            : AVAssetExportPresetMediumQuality)
      guard let session = AVAssetExportSession(asset: asset, presetName: preset) else {
        throw ConverterError.unsupported("This video format cannot be converted by macOS.")
      }
      guard session.supportedFileTypes.contains(outputType) else {
        throw ConverterError.unsupported("This video cannot be exported as \(format.uppercased()).")
      }

      try? FileManager.default.removeItem(at: outputURL)
      session.outputURL = outputURL
      session.outputFileType = outputType
      let semaphore = DispatchSemaphore(value: 0)
      session.exportAsynchronously { semaphore.signal() }
      semaphore.wait()
      guard session.status == .completed else {
        throw ConverterError.exportFailed(session.error?.localizedDescription ?? "Video export failed.")
      }
    } catch {
      FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
      exit(1)
    }
  }

  static func convertToMP3(_ inputURL: URL, _ outputURL: URL) throws {
    try? FileManager.default.removeItem(at: outputURL)
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/afconvert")
    process.arguments = ["-f", "MPG3", "-d", ".mp3", inputURL.path, outputURL.path]
    let errorPipe = Pipe()
    process.standardError = errorPipe
    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else {
      let details = String(data: errorPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
      throw ConverterError.exportFailed(details.isEmpty ? "MP3 export failed." : details)
    }
  }

  static func convertToGIF(_ inputURL: URL, _ outputURL: URL) throws {
    let asset = AVURLAsset(url: inputURL)
    let duration = CMTimeGetSeconds(asset.duration)
    guard duration.isFinite, duration > 0 else {
      throw ConverterError.unsupported("This video has no readable duration.")
    }
    guard let destination = CGImageDestinationCreateWithURL(
      outputURL as CFURL,
      UTType.gif.identifier as CFString,
      0,
      nil
    ) else { throw ConverterError.exportFailed("Unable to create the GIF file.") }
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.maximumSize = CGSize(width: 640, height: 640)
    let frameRate = 10.0
    let frameCount = min(Int(ceil(duration * frameRate)), 300)
    let delay = duration / Double(frameCount)
    let gifProperties: CFDictionary = [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFLoopCount: 0]] as CFDictionary
    CGImageDestinationSetProperties(destination, gifProperties)
    for index in 0..<frameCount {
      let time = CMTime(seconds: min(Double(index) / frameRate, duration - 0.001), preferredTimescale: 600)
      guard let frame = try? generator.copyCGImage(at: time, actualTime: nil) else { continue }
      let frameProperties: CFDictionary = [
        kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFDelayTime: delay]
      ] as CFDictionary
      CGImageDestinationAddImage(destination, frame, frameProperties)
    }
    guard CGImageDestinationFinalize(destination) else {
      throw ConverterError.exportFailed("GIF export failed.")
    }
  }
}
