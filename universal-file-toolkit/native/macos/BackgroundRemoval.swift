import CoreImage
import Foundation
import Vision

enum BackgroundRemovalError: LocalizedError {
    case invalidArguments
    case imageUnreadable
    case noForegroundDetected

    var errorDescription: String? {
        switch self {
        case .invalidArguments: return "Usage: background-removal <input> <output>"
        case .imageUnreadable: return "The image could not be read."
        case .noForegroundDetected: return "No foreground subject was detected."
        }
    }
}

@available(macOS 14.0, *)
func removeBackground(inputURL: URL, outputURL: URL) throws {
    let handler = VNImageRequestHandler(url: inputURL, options: [:])
    let maskBuffer: CVPixelBuffer
    let foregroundRequest = VNGenerateForegroundInstanceMaskRequest()
    do {
        try handler.perform([foregroundRequest])
        guard let observation = foregroundRequest.results?.first,
              !observation.allInstances.isEmpty else {
            throw BackgroundRemovalError.noForegroundDetected
        }
        maskBuffer = try observation.generateScaledMaskForImage(
            forInstances: observation.allInstances,
            from: handler
        )
    } catch {
        // Some Macs cannot load the foreground-instance model through ANE.
        // Person segmentation is broadly available and preserves portrait subjects.
        let personRequest = VNGeneratePersonSegmentationRequest()
        personRequest.qualityLevel = .accurate
        let fallbackHandler = VNImageRequestHandler(url: inputURL, options: [:])
        try fallbackHandler.perform([personRequest])
        guard let observation = personRequest.results?.first else {
            throw BackgroundRemovalError.noForegroundDetected
        }
        maskBuffer = observation.pixelBuffer
    }
    guard let source = CIImage(contentsOf: inputURL) else {
        throw BackgroundRemovalError.imageUnreadable
    }
    let transparent = CIImage(color: .clear).cropped(to: source.extent)
    let output = source.applyingFilter("CIBlendWithMask", parameters: [
        kCIInputBackgroundImageKey: transparent,
        kCIInputMaskImageKey: CIImage(cvPixelBuffer: maskBuffer)
    ])
    try CIContext().writePNGRepresentation(
        of: output,
        to: outputURL,
        format: .RGBA8,
        colorSpace: CGColorSpaceCreateDeviceRGB()
    )
}

do {
    let arguments = CommandLine.arguments
    guard arguments.count == 3 else { throw BackgroundRemovalError.invalidArguments }
    guard #available(macOS 14.0, *) else {
        throw NSError(domain: "UniversalFileToolkit", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "Background removal requires macOS 14 or later."
        ])
    }
    try removeBackground(inputURL: URL(fileURLWithPath: arguments[1]), outputURL: URL(fileURLWithPath: arguments[2]))
} catch {
    FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
    exit(1)
}
