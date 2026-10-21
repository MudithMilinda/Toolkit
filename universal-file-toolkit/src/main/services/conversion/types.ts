export type ConversionStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'

export type ImageTargetFormat = 'png' | 'jpg' | 'webp'

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

export interface ConversionResult {
  id: string
  status: 'completed'
  inputPath: string
  outputPath: string
  sourceFormat: string
  targetFormat: ImageTargetFormat
  originalSize: number
  outputSize: number
  savedPercent: number
  startedAt: number
  completedAt: number
}
