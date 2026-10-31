export type ConversionStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'

export type ImageTargetFormat = 'png' | 'jpg' | 'webp' | 'pdf' | 'heic' | 'tiff' | 'avif' | 'bmp'
export type VideoTargetFormat =
  'mp4' | 'mov' | 'mp3' | 'gif' | 'webm' | 'mkv' | 'avi' | 'wav' | 'flac' | 'ogg' | 'opus' | 'aiff'
export type ArchiveTargetFormat = 'zip'
export type DocumentTargetFormat =
  'docx' | 'pages' | 'pptx' | 'xlsx' | 'epub' | 'txt' | 'md' | 'html'

export interface ImageConversionOptions {
  /** Preserve EXIF/XMP/ICC metadata only when the user explicitly asks for it. */
  preserveMetadata?: boolean
  /** JPEG/WEBP quality. Values are validated at the IPC boundary. */
  quality?: number
  /** Used only when transparency has to be flattened for JPEG. */
  flattenBackground?: { r: number; g: number; b: number; alpha?: number }
}

export interface ImageConversionRequest {
  inputPath: string
  targetFormat: ImageTargetFormat
  options?: ImageConversionOptions
}
export interface PdfConversionRequest {
  inputPath: string
  targetFormat: DocumentTargetFormat | 'jpg' | 'png'
}
export interface DocumentConversionRequest {
  inputPath: string
  targetFormat: 'pdf' | 'pages' | 'epub' | 'txt' | 'md' | 'html' | 'jpg' | 'png'
}
export interface PdfCompressionRequest {
  inputPath: string
  operation: 'pdf-compress'
}
export interface PdfSplitRequest {
  inputPath: string
  operation: 'pdf-split'
  startPage: number
  endPage: number
  splitEveryPage: boolean
}
export interface PdfOrganizeRequest {
  inputPath: string
  operation: 'pdf-organize'
  pageOrder: number[]
  pageRotations: Record<number, number>
}
export interface VideoConversionRequest {
  inputPath: string
  targetFormat: VideoTargetFormat
}
export interface VideoCompressionRequest {
  inputPath: string
  operation: 'video-compress'
  quality: number
  /** Longest output edge, preserving the video's aspect ratio. */
  maxDimension?: number
}
export interface AudioCompressionRequest {
  inputPath: string
  operation: 'audio-compress'
  bitrateKbps: 96 | 192
}
export interface AudioNormalizeRequest {
  inputPath: string
  operation: 'audio-normalize'
  targetLufs: number
  loudnessRange: number
  truePeak: number
}
export interface AudioTrimRequest {
  inputPath: string
  operation: 'audio-trim'
  startSeconds: number
  endSeconds: number
}
export interface AudioBleepRequest {
  inputPath: string
  operation: 'audio-bleep'
  startSeconds: number
  endSeconds: number
}
export interface VideoTrimRequest {
  inputPath: string
  operation: 'video-trim'
  startSeconds: number
  endSeconds: number
}
export interface VideoCropRequest {
  inputPath: string
  operation: 'video-crop'
  left: number
  top: number
  width: number
  height: number
}
export interface VideoSpeedRequest {
  inputPath: string
  operation: 'video-speed'
  speed: number
}

/** Creates one PDF page per input image, in the order supplied. */
export interface ImagesToPdfRequest {
  inputPaths: string[]
}

export interface ImageResizeRequest {
  inputPath: string
  operation: 'resize'
  width?: number
  height?: number
  fit: 'inside' | 'cover' | 'fill'
  withoutEnlargement: boolean
}

export interface ImageCompressionRequest {
  inputPath: string
  operation: 'compress'
  quality: number
  /** Longest output edge, preserving the original aspect ratio. */
  maxDimension?: number
}
export interface ImageCropRequest {
  inputPath: string
  operation: 'crop'
  left: number
  top: number
  width: number
  height: number
}
export interface ImageEditRequest {
  inputPath: string
  operation: 'edit'
  rotation: number
  exposure: number
  brightness: number
  contrast: number
  highlights: number
  shadows: number
  whites: number
  blacks: number
  saturation: number
  vibrance: number
  hue: number
  temperature: number
  tint: number
  gamma: number
}
export interface ImageBackgroundRemovalRequest {
  inputPath: string
  operation: 'remove-background'
}

export interface ConversionResult {
  id: string
  status: 'completed'
  inputPath: string
  outputPath: string
  sourceFormat: string
  targetFormat: ImageTargetFormat | VideoTargetFormat | ArchiveTargetFormat | DocumentTargetFormat
  originalSize: number
  outputSize: number
  savedPercent: number
  startedAt: number
  completedAt: number
}
