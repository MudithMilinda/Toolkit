import { readFile, rm, stat } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { ImageConverter } from './converters/ImageConverter'
import { FfmpegVideoConverter } from './converters/FfmpegVideoConverter'
import { OutputManager } from './OutputManager'
import type {
  ConversionResult,
  AudioCompressionRequest,
  AudioNormalizeRequest,
  AudioTrimRequest,
  AudioBleepRequest,
  ArchiveTargetFormat,
  ImageBackgroundRemovalRequest,
  ImageCompressionRequest,
  ImageCropRequest,
  ImageEditRequest,
  ImageConversionRequest,
  ImagesToPdfRequest,
  ImageResizeRequest,
  ImageTargetFormat,
  VideoCompressionRequest,
  VideoCropRequest,
  VideoSpeedRequest,
  VideoTargetFormat,
  VideoTrimRequest,
  VideoConversionRequest
} from './types'

const MAX_IMAGE_BYTES = 512 * 1024 * 1024
const execFileAsync = promisify(execFile)

/** Main-process-only image conversion coordinator. Duplicate jobs share one promise. */
export class ConversionManager {
  private readonly imageConverter = new ImageConverter()
  private readonly ffmpegVideoConverter = new FfmpegVideoConverter()
  private readonly outputManager = new OutputManager()
  private readonly activeJobs = new Map<string, Promise<ConversionResult>>()
  /** Browser-preview proxies are reused by Crop, Trim and Speed panels. */
  private readonly videoPreviews = new Map<string, Promise<string>>()
  private readonly audioPreviews = new Map<string, Promise<string>>()

  convertImage(request: ImageConversionRequest): Promise<ConversionResult> {
    const key = `${resolve(request.inputPath)}:${request.targetFormat}`
    const existing = this.activeJobs.get(key)
    if (existing) return existing
    const job = this.performImageConversion(request).finally(() => this.activeJobs.delete(key))
    this.activeJobs.set(key, job)
    return job
  }

  convertVideo(
    request: VideoConversionRequest,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult> {
    return this.startJob(`${resolve(request.inputPath)}:video:${request.targetFormat}`, () =>
      this.performVideoConversion(request, onProgress)
    )
  }

  compressVideo(
    request: VideoCompressionRequest,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult> {
    return this.startJob(
      `${resolve(request.inputPath)}:video-compress:${request.quality}:${request.maxDimension ?? ''}`,
      () => this.performVideoCompression(request, onProgress)
    )
  }

  compressAudio(
    request: AudioCompressionRequest,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult> {
    return this.startJob(
      `${resolve(request.inputPath)}:audio-compress:${request.bitrateKbps}`,
      () => this.performAudioCompression(request, onProgress)
    )
  }

  normalizeAudio(
    request: AudioNormalizeRequest,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult> {
    return this.startJob(
      `${resolve(request.inputPath)}:audio-normalize:${request.targetLufs}:${request.loudnessRange}:${request.truePeak}`,
      () => this.performAudioNormalize(request, onProgress)
    )
  }

  trimAudio(
    request: AudioTrimRequest,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult> {
    return this.startJob(
      `${resolve(request.inputPath)}:audio-trim:${request.startSeconds}:${request.endSeconds}`,
      () => this.performAudioTrim(request, onProgress)
    )
  }
  bleepAudio(request: AudioBleepRequest, onProgress?: (percent: number) => void): Promise<ConversionResult> {
    return this.startJob(`${resolve(request.inputPath)}:audio-bleep:${request.startSeconds}:${request.endSeconds}`, () => this.performAudioBleep(request, onProgress))
  }

  async getVideoMetadata(inputPathValue: string): Promise<Array<{ key: string; value: string }>> {
    const { inputPath } = await this.prepareMediaInput(inputPathValue)
    return this.ffmpegVideoConverter.inspect(inputPath)
  }

  async createVideoPreview(inputPathValue: string): Promise<string> {
    const { inputPath, source } = await this.prepareMediaInput(inputPathValue)
    const cacheKey = `${inputPath}:${source.size}:${source.mtimeMs}`
    const existing = this.videoPreviews.get(cacheKey)
    if (existing) return existing
    const previewPath = join(
      app.getPath('temp'),
      `${randomUUID()}.universal-file-toolkit-preview.mp4`
    )
    const preview = this.ffmpegVideoConverter
      .createPreview(inputPath, previewPath)
      .then(() => previewPath)
      .catch(async (error: unknown) => {
        this.videoPreviews.delete(cacheKey)
        await rm(previewPath, { force: true }).catch(() => undefined)
        throw error
      })
    this.videoPreviews.set(cacheKey, preview)
    return preview
  }

  async createVideoPoster(inputPathValue: string): Promise<string> {
    const { inputPath } = await this.prepareMediaInput(inputPathValue)
    const posterPath = join(
      app.getPath('temp'),
      `${randomUUID()}.universal-file-toolkit-poster.jpg`
    )
    try {
      await this.ffmpegVideoConverter.createPoster(inputPath, posterPath)
      const bytes = await readFile(posterPath)
      return `data:image/jpeg;base64,${bytes.toString('base64')}`
    } finally {
      await rm(posterPath, { force: true }).catch(() => undefined)
    }
  }

  async createAudioPreview(inputPathValue: string): Promise<string> {
    const { inputPath, source } = await this.prepareMediaInput(inputPathValue)
    const cacheKey = `${inputPath}:${source.size}:${source.mtimeMs}`
    const existing = this.audioPreviews.get(cacheKey)
    if (existing) return existing
    const previewPath = join(
      app.getPath('temp'),
      `${randomUUID()}.universal-file-toolkit-audio.mp3`
    )
    const preview = this.ffmpegVideoConverter
      .createAudioPreview(inputPath, previewPath)
      .then(() => previewPath)
      .catch(async (error: unknown) => {
        this.audioPreviews.delete(cacheKey)
        await rm(previewPath, { force: true }).catch(() => undefined)
        throw error
      })
    this.audioPreviews.set(cacheKey, preview)
    return preview
  }

  trimVideo(
    request: VideoTrimRequest,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult> {
    return this.startJob(
      `${resolve(request.inputPath)}:video-trim:${request.startSeconds}:${request.endSeconds}`,
      () => this.performVideoTrim(request, onProgress)
    )
  }

  cropVideo(
    request: VideoCropRequest,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult> {
    return this.startJob(
      `${resolve(request.inputPath)}:video-crop:${request.left},${request.top},${request.width},${request.height}`,
      () => this.performVideoCrop(request, onProgress)
    )
  }

  changeVideoSpeed(
    request: VideoSpeedRequest,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult> {
    return this.startJob(`${resolve(request.inputPath)}:video-speed:${request.speed}`, () =>
      this.performVideoSpeed(request, onProgress)
    )
  }

  muteVideo(inputPath: string, onProgress?: (percent: number) => void): Promise<ConversionResult> {
    return this.startJob(`${resolve(inputPath)}:video-mute`, () =>
      this.performVideoMute(inputPath, onProgress)
    )
  }

  archiveFiles(inputPaths: string[]): Promise<ConversionResult> {
    return this.startJob(
      `${inputPaths.map((inputPath) => resolve(inputPath)).join(':')}:archive:zip`,
      () => this.performZipArchive(inputPaths)
    )
  }

  convertImagesToPdf(request: ImagesToPdfRequest): Promise<ConversionResult> {
    const key = `pdf:${request.inputPaths.map((path) => resolve(path)).join(':')}`
    return this.startJob(key, () => this.performPdfConversion(request))
  }

  resizeImage(request: ImageResizeRequest): Promise<ConversionResult> {
    const key = `${resolve(request.inputPath)}:resize:${request.width ?? ''}x${request.height ?? ''}`
    return this.startJob(key, () => this.performResize(request))
  }

  compressImage(request: ImageCompressionRequest): Promise<ConversionResult> {
    const key = `${resolve(request.inputPath)}:compress:${request.quality}:${request.maxDimension ?? ''}`
    return this.startJob(key, () => this.performCompression(request))
  }
  cropImage(request: ImageCropRequest): Promise<ConversionResult> {
    return this.startJob(
      `${resolve(request.inputPath)}:crop:${request.left},${request.top},${request.width},${request.height}`,
      () => this.performCrop(request)
    )
  }
  editImage(request: ImageEditRequest): Promise<ConversionResult> {
    return this.startJob(
      `${resolve(request.inputPath)}:edit:${Object.values(request).join(':')}`,
      () => this.performEdit(request)
    )
  }
  removeBackground(request: ImageBackgroundRemovalRequest): Promise<ConversionResult> {
    return this.startJob(`${resolve(request.inputPath)}:remove-background`, () =>
      this.performBackgroundRemoval(request)
    )
  }

  private async performImageConversion(request: ImageConversionRequest): Promise<ConversionResult> {
    if (!this.imageConverter.supportsOutput(request.targetFormat)) {
      throw new Error(
        `This installation cannot encode ${request.targetFormat.toUpperCase()} images.`
      )
    }
    const { inputPath, source, normalizedSource } = await this.prepareInput(request.inputPath)
    if (normalizedSource === request.targetFormat) {
      throw new Error(`This image is already ${request.targetFormat.toUpperCase()}.`)
    }
    const startedAt = Date.now()
    const temporaryPath = await this.outputManager.createTemporaryPath(inputPath)
    try {
      await this.imageConverter.convert(
        inputPath,
        temporaryPath,
        request.targetFormat,
        request.options
      )
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        inputPath,
        request.targetFormat
      )
      const output = await stat(outputPath)
      return this.result(
        inputPath,
        outputPath,
        normalizedSource,
        request.targetFormat,
        source.size,
        output.size,
        startedAt
      )
    } catch (error) {
      await this.outputManager.discardTemporaryFile(temporaryPath)
      throw error
    }
  }

  private async performVideoConversion(
    request: VideoConversionRequest,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult> {
    const { inputPath, source, normalizedSource } = await this.prepareMediaInput(request.inputPath)
    if (normalizedSource === request.targetFormat) {
      throw new Error(`This video is already ${request.targetFormat.toUpperCase()}.`)
    }
    if (process.platform !== 'darwin')
      throw new Error('Video conversion is currently available on macOS.')
    const startedAt = Date.now()
    const temporaryPath = `${await this.outputManager.createTemporaryPath(inputPath)}.${request.targetFormat}`
    const helperPath = app.isPackaged
      ? join(process.resourcesPath, 'native', 'video-converter')
      : join(app.getAppPath(), 'native', 'macos', 'bin', 'video-converter')
    try {
      if (
        ['webm', 'mkv', 'avi', 'mp3', 'wav', 'flac', 'ogg', 'opus', 'aiff'].includes(
          request.targetFormat
        )
      ) {
        await this.ffmpegVideoConverter.convert(
          inputPath,
          temporaryPath,
          request.targetFormat as
            'webm' | 'mkv' | 'avi' | 'mp3' | 'wav' | 'flac' | 'ogg' | 'opus' | 'aiff',
          onProgress
        )
      } else {
        await execFileAsync(helperPath, [inputPath, temporaryPath, request.targetFormat])
      }
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        inputPath,
        request.targetFormat,
        ['mp3', 'wav', 'flac', 'ogg', 'opus', 'aiff'].includes(request.targetFormat)
          ? '-audio'
          : request.targetFormat === 'gif'
            ? '-animated'
            : '-converted'
      )
      const output = await stat(outputPath)
      return this.result(
        inputPath,
        outputPath,
        normalizedSource,
        request.targetFormat,
        source.size,
        output.size,
        startedAt
      )
    } catch (error) {
      await this.outputManager.discardTemporaryFile(temporaryPath)
      const target = request.targetFormat.toUpperCase()
      const detail = error instanceof Error ? error.message : ''
      throw new Error(
        request.targetFormat === 'mp3'
          ? 'Unable to extract MP3 audio from this video.'
          : detail || `Unable to convert this video to ${target}.`
      )
    }
  }

  private async performVideoCompression(
    request: VideoCompressionRequest,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult> {
    const { inputPath, source, normalizedSource } = await this.prepareMediaInput(request.inputPath)
    const startedAt = Date.now()
    const temporaryPath = `${await this.outputManager.createTemporaryPath(inputPath)}.mp4`
    try {
      await this.ffmpegVideoConverter.compress(
        inputPath,
        temporaryPath,
        request.quality,
        request.maxDimension,
        onProgress
      )
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        inputPath,
        'mp4',
        '-compressed'
      )
      const output = await stat(outputPath)
      return this.result(
        inputPath,
        outputPath,
        normalizedSource,
        'mp4',
        source.size,
        output.size,
        startedAt
      )
    } catch (error) {
      await this.outputManager.discardTemporaryFile(temporaryPath)
      const detail = error instanceof Error ? error.message : ''
      throw new Error(detail || 'Unable to compress this video.')
    }
  }

  private async performAudioCompression(
    request: AudioCompressionRequest,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult> {
    const { inputPath, source, normalizedSource } = await this.prepareMediaInput(request.inputPath)
    const startedAt = Date.now()
    const temporaryPath = `${await this.outputManager.createTemporaryPath(inputPath)}.mp3`
    try {
      await this.ffmpegVideoConverter.compressAudio(
        inputPath,
        temporaryPath,
        request.bitrateKbps,
        onProgress
      )
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        inputPath,
        'mp3',
        '-compressed'
      )
      const output = await stat(outputPath)
      return this.result(
        inputPath,
        outputPath,
        normalizedSource,
        'mp3',
        source.size,
        output.size,
        startedAt
      )
    } catch (error) {
      await this.outputManager.discardTemporaryFile(temporaryPath)
      const detail = error instanceof Error ? error.message : ''
      throw new Error(detail || 'Unable to compress this audio file.')
    }
  }

  private async performAudioNormalize(
    request: AudioNormalizeRequest,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult> {
    const { inputPath, source, normalizedSource } = await this.prepareMediaInput(request.inputPath)
    const startedAt = Date.now()
    const temporaryPath = `${await this.outputManager.createTemporaryPath(inputPath)}.mp3`
    try {
      await this.ffmpegVideoConverter.normalizeAudio(inputPath, temporaryPath, request, onProgress)
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        inputPath,
        'mp3',
        '-normalized'
      )
      const output = await stat(outputPath)
      return this.result(
        inputPath,
        outputPath,
        normalizedSource,
        'mp3',
        source.size,
        output.size,
        startedAt
      )
    } catch (error) {
      await this.outputManager.discardTemporaryFile(temporaryPath)
      const detail = error instanceof Error ? error.message : ''
      throw new Error(detail || 'Unable to normalize this audio file.')
    }
  }

  private async performAudioTrim(
    request: AudioTrimRequest,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult> {
    const { inputPath, source, normalizedSource } = await this.prepareMediaInput(request.inputPath)
    const startedAt = Date.now()
    const temporaryPath = `${await this.outputManager.createTemporaryPath(inputPath)}.mp3`
    try {
      await this.ffmpegVideoConverter.trimAudio(
        inputPath,
        temporaryPath,
        request.startSeconds,
        request.endSeconds,
        onProgress
      )
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        inputPath,
        'mp3',
        '-trimmed'
      )
      const output = await stat(outputPath)
      return this.result(
        inputPath,
        outputPath,
        normalizedSource,
        'mp3',
        source.size,
        output.size,
        startedAt
      )
    } catch (error) {
      await this.outputManager.discardTemporaryFile(temporaryPath)
      throw error
    }
  }
  private async performAudioBleep(request: AudioBleepRequest, onProgress?: (percent: number) => void): Promise<ConversionResult> {
    const { inputPath, source, normalizedSource } = await this.prepareMediaInput(request.inputPath)
    const startedAt = Date.now(); const temporaryPath = `${await this.outputManager.createTemporaryPath(inputPath)}.mp3`
    try { await this.ffmpegVideoConverter.bleepAudio(inputPath, temporaryPath, request.startSeconds, request.endSeconds, onProgress); const outputPath = await this.outputManager.publishTemporaryFile(temporaryPath, inputPath, 'mp3', '-bleeped'); const output = await stat(outputPath); return this.result(inputPath, outputPath, normalizedSource, 'mp3', source.size, output.size, startedAt) } catch (error) { await this.outputManager.discardTemporaryFile(temporaryPath); throw error }
  }

  private async performVideoMute(
    inputPathValue: string,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult> {
    const { inputPath, source, normalizedSource } = await this.prepareMediaInput(inputPathValue)
    const startedAt = Date.now()
    const temporaryPath = `${await this.outputManager.createTemporaryPath(inputPath)}.mp4`
    try {
      await this.ffmpegVideoConverter.mute(inputPath, temporaryPath, onProgress)
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        inputPath,
        'mp4',
        '-muted'
      )
      const output = await stat(outputPath)
      return this.result(
        inputPath,
        outputPath,
        normalizedSource,
        'mp4',
        source.size,
        output.size,
        startedAt
      )
    } catch (error) {
      await this.outputManager.discardTemporaryFile(temporaryPath)
      const detail = error instanceof Error ? error.message : ''
      throw new Error(detail || 'Unable to mute this video.')
    }
  }

  private async performVideoTrim(
    request: VideoTrimRequest,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult> {
    const { inputPath, source, normalizedSource } = await this.prepareMediaInput(request.inputPath)
    const startedAt = Date.now()
    const temporaryPath = `${await this.outputManager.createTemporaryPath(inputPath)}.mp4`
    try {
      await this.ffmpegVideoConverter.trim(
        inputPath,
        temporaryPath,
        request.startSeconds,
        request.endSeconds,
        onProgress
      )
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        inputPath,
        'mp4',
        '-trimmed'
      )
      const output = await stat(outputPath)
      return this.result(
        inputPath,
        outputPath,
        normalizedSource,
        'mp4',
        source.size,
        output.size,
        startedAt
      )
    } catch (error) {
      await this.outputManager.discardTemporaryFile(temporaryPath)
      const detail = error instanceof Error ? error.message : ''
      throw new Error(detail || 'Unable to trim this video.')
    }
  }

  private async performVideoCrop(
    request: VideoCropRequest,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult> {
    const { inputPath, source, normalizedSource } = await this.prepareMediaInput(request.inputPath)
    const startedAt = Date.now()
    const temporaryPath = `${await this.outputManager.createTemporaryPath(inputPath)}.mp4`
    try {
      await this.ffmpegVideoConverter.crop(inputPath, temporaryPath, request, onProgress)
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        inputPath,
        'mp4',
        '-cropped'
      )
      const output = await stat(outputPath)
      return this.result(
        inputPath,
        outputPath,
        normalizedSource,
        'mp4',
        source.size,
        output.size,
        startedAt
      )
    } catch (error) {
      await this.outputManager.discardTemporaryFile(temporaryPath)
      const detail = error instanceof Error ? error.message : ''
      throw new Error(detail || 'Unable to crop this video.')
    }
  }

  private async performVideoSpeed(
    request: VideoSpeedRequest,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult> {
    const { inputPath, source, normalizedSource } = await this.prepareMediaInput(request.inputPath)
    const startedAt = Date.now()
    const temporaryPath = `${await this.outputManager.createTemporaryPath(inputPath)}.mp4`
    try {
      await this.ffmpegVideoConverter.changeSpeed(
        inputPath,
        temporaryPath,
        request.speed,
        onProgress
      )
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        inputPath,
        'mp4',
        `-${request.speed}x`
      )
      const output = await stat(outputPath)
      return this.result(
        inputPath,
        outputPath,
        normalizedSource,
        'mp4',
        source.size,
        output.size,
        startedAt
      )
    } catch (error) {
      await this.outputManager.discardTemporaryFile(temporaryPath)
      const detail = error instanceof Error ? error.message : ''
      throw new Error(detail || 'Unable to change this video speed.', { cause: error })
    }
  }

  private async performZipArchive(inputPathValues: string[]): Promise<ConversionResult> {
    if (!inputPathValues.length)
      throw new Error('Select at least one file to create a ZIP archive.')
    const inputs = await Promise.all(
      inputPathValues.map((inputPath) => this.prepareArchiveInput(inputPath))
    )
    const firstInput = inputs[0]!
    const names = inputs.map(({ inputPath }) => basename(inputPath).toLowerCase())
    if (names.some((name, index) => names.indexOf(name) !== index))
      throw new Error('Files with the same name cannot be added to one ZIP archive.')
    if (process.platform !== 'darwin')
      throw new Error('ZIP export is currently available on macOS.')
    const startedAt = Date.now()
    const temporaryPath = await this.outputManager.createTemporaryPath(firstInput.inputPath)
    try {
      // Store mode is fast for already-compressed media, while still creating
      // a standard ZIP archive for every supported file type.
      // -j stores only names, not local source paths, inside the archive.
      await execFileAsync('/usr/bin/zip', [
        '-0',
        '-q',
        '-j',
        temporaryPath,
        ...inputs.map(({ inputPath }) => inputPath)
      ])
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        firstInput.inputPath,
        'zip',
        '-archive'
      )
      const output = await stat(outputPath)
      return this.result(
        firstInput.inputPath,
        outputPath,
        firstInput.normalizedSource,
        'zip',
        inputs.reduce((total, { source }) => total + source.size, 0),
        output.size,
        startedAt
      )
    } catch (error) {
      await this.outputManager.discardTemporaryFile(temporaryPath)
      const detail = error instanceof Error ? error.message : ''
      throw new Error(detail || 'Unable to create ZIP archive.')
    }
  }

  private async performPdfConversion(request: ImagesToPdfRequest): Promise<ConversionResult> {
    if (!request.inputPaths.length) throw new Error('Select at least one image to create a PDF.')
    const inputs = await Promise.all(
      request.inputPaths.map((inputPath) => this.prepareInput(inputPath))
    )
    const firstInput = inputs[0]
    const startedAt = Date.now()
    const temporaryPath = await this.outputManager.createTemporaryPath(firstInput.inputPath)
    try {
      await this.imageConverter.convertToPdf(
        inputs.map(({ inputPath }) => inputPath),
        temporaryPath
      )
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        firstInput.inputPath,
        'pdf',
        inputs.length > 1 ? '-combined' : ''
      )
      const output = await stat(outputPath)
      return this.result(
        firstInput.inputPath,
        outputPath,
        firstInput.normalizedSource,
        'pdf',
        inputs.reduce((total, { source }) => total + source.size, 0),
        output.size,
        startedAt
      )
    } catch (error) {
      await this.outputManager.discardTemporaryFile(temporaryPath)
      throw error
    }
  }

  private async performResize(request: ImageResizeRequest): Promise<ConversionResult> {
    if (!request.width && !request.height)
      throw new Error('Enter a width or height before resizing.')
    const { inputPath, source, normalizedSource } = await this.prepareInput(request.inputPath)
    const targetFormat = this.editTargetFormat(normalizedSource)
    const startedAt = Date.now()
    const temporaryPath = await this.outputManager.createTemporaryPath(inputPath)
    try {
      await this.imageConverter.resize(inputPath, temporaryPath, targetFormat, request)
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        inputPath,
        targetFormat,
        '-resized'
      )
      const output = await stat(outputPath)
      return this.result(
        inputPath,
        outputPath,
        normalizedSource,
        targetFormat,
        source.size,
        output.size,
        startedAt
      )
    } catch (error) {
      await this.outputManager.discardTemporaryFile(temporaryPath)
      throw error
    }
  }

  private async performCompression(request: ImageCompressionRequest): Promise<ConversionResult> {
    const { inputPath, source, normalizedSource } = await this.prepareInput(request.inputPath)
    const targetFormat = this.editTargetFormat(normalizedSource)
    const startedAt = Date.now()
    const temporaryPath = await this.outputManager.createTemporaryPath(inputPath)
    try {
      await this.imageConverter.compress(inputPath, temporaryPath, targetFormat, request)
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        inputPath,
        targetFormat,
        '-compressed'
      )
      const output = await stat(outputPath)
      return this.result(
        inputPath,
        outputPath,
        normalizedSource,
        targetFormat,
        source.size,
        output.size,
        startedAt
      )
    } catch (error) {
      await this.outputManager.discardTemporaryFile(temporaryPath)
      throw error
    }
  }

  private async performCrop(request: ImageCropRequest): Promise<ConversionResult> {
    const { inputPath, source, normalizedSource } = await this.prepareInput(request.inputPath)
    const metadata = await sharp(inputPath).rotate().metadata()
    if (
      !metadata.width ||
      !metadata.height ||
      request.left + request.width > metadata.width ||
      request.top + request.height > metadata.height
    )
      throw new Error('The crop area is outside the image bounds.')
    const targetFormat = this.editTargetFormat(normalizedSource)
    const startedAt = Date.now()
    const temporaryPath = await this.outputManager.createTemporaryPath(inputPath)
    try {
      await this.imageConverter.crop(inputPath, temporaryPath, targetFormat, request)
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        inputPath,
        targetFormat,
        '-cropped'
      )
      const output = await stat(outputPath)
      return this.result(
        inputPath,
        outputPath,
        normalizedSource,
        targetFormat,
        source.size,
        output.size,
        startedAt
      )
    } catch (error) {
      await this.outputManager.discardTemporaryFile(temporaryPath)
      throw error
    }
  }
  private async performEdit(request: ImageEditRequest): Promise<ConversionResult> {
    const { inputPath, source, normalizedSource } = await this.prepareInput(request.inputPath)
    const targetFormat = this.editTargetFormat(normalizedSource)
    const startedAt = Date.now()
    const temporaryPath = await this.outputManager.createTemporaryPath(inputPath)
    try {
      await this.imageConverter.edit(inputPath, temporaryPath, targetFormat, request)
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        inputPath,
        targetFormat,
        '-edited'
      )
      const output = await stat(outputPath)
      return this.result(
        inputPath,
        outputPath,
        normalizedSource,
        targetFormat,
        source.size,
        output.size,
        startedAt
      )
    } catch (error) {
      await this.outputManager.discardTemporaryFile(temporaryPath)
      throw error
    }
  }
  private async performBackgroundRemoval(
    request: ImageBackgroundRemovalRequest
  ): Promise<ConversionResult> {
    const { inputPath, source, normalizedSource } = await this.prepareInput(request.inputPath)
    const startedAt = Date.now()
    const temporaryPath = await this.outputManager.createTemporaryPath(inputPath)
    try {
      await this.imageConverter.removeBackground(inputPath, temporaryPath)
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        inputPath,
        'png',
        '-no-background'
      )
      const output = await stat(outputPath)
      return this.result(
        inputPath,
        outputPath,
        normalizedSource,
        'png',
        source.size,
        output.size,
        startedAt
      )
    } catch (error) {
      await this.outputManager.discardTemporaryFile(temporaryPath)
      throw error
    }
  }

  private startJob(
    key: string,
    create: () => Promise<ConversionResult>
  ): Promise<ConversionResult> {
    const existing = this.activeJobs.get(key)
    if (existing) return existing
    const job = create().finally(() => this.activeJobs.delete(key))
    this.activeJobs.set(key, job)
    return job
  }

  private async prepareInput(inputPathValue: string): Promise<{
    inputPath: string
    source: Stats
    normalizedSource: string
  }> {
    if (!isAbsolute(inputPathValue)) throw new Error('The input file path must be absolute.')
    const inputPath = resolve(inputPathValue)
    const source = await stat(inputPath)
    if (!source.isFile()) throw new Error('The selected input is not a regular file.')
    if (source.size === 0) throw new Error('The selected image is empty.')
    if (source.size > MAX_IMAGE_BYTES)
      throw new Error('The selected image exceeds the 512 MB safety limit.')
    const inspected = await this.imageConverter.inspect(inputPath)
    return {
      inputPath,
      source,
      normalizedSource:
        inspected.format === 'jpeg'
          ? 'jpg'
          : inspected.format === 'heif'
            ? 'heic'
            : inspected.format
    }
  }

  private async prepareMediaInput(inputPathValue: string): Promise<{
    inputPath: string
    source: Stats
    normalizedSource: string
  }> {
    if (!isAbsolute(inputPathValue)) throw new Error('The input file path must be absolute.')
    const inputPath = resolve(inputPathValue)
    const source = await stat(inputPath)
    if (!source.isFile()) throw new Error('The selected input is not a regular file.')
    if (source.size === 0) throw new Error('The selected video is empty.')
    if (source.size > 4 * 1024 * 1024 * 1024)
      throw new Error('The selected video exceeds the 4 GB safety limit.')
    const extension = inputPath.split('.').pop()?.toLowerCase()
    if (
      !extension ||
      ![
        'mp4',
        'mov',
        'webm',
        'mkv',
        'avi',
        'mp3',
        'wav',
        'aac',
        'flac',
        'ogg',
        'opus',
        'aif',
        'aiff'
      ].includes(extension)
    )
      throw new Error('Unsupported media format.')
    return { inputPath, source, normalizedSource: extension }
  }

  private async prepareArchiveInput(inputPathValue: string): Promise<{
    inputPath: string
    source: Stats
    normalizedSource: string
  }> {
    if (!isAbsolute(inputPathValue)) throw new Error('The input file path must be absolute.')
    const inputPath = resolve(inputPathValue)
    const source = await stat(inputPath)
    if (!source.isFile()) throw new Error('The selected input is not a regular file.')
    if (source.size === 0) throw new Error('The selected file is empty.')
    if (source.size > 4 * 1024 * 1024 * 1024)
      throw new Error('The selected file exceeds the 4 GB safety limit.')
    return {
      inputPath,
      source,
      normalizedSource: inputPath.split('.').pop()?.toLowerCase() ?? 'file'
    }
  }

  private editTargetFormat(sourceFormat: string): ImageTargetFormat {
    return sourceFormat === 'jpg' || sourceFormat === 'png' || sourceFormat === 'webp'
      ? sourceFormat
      : 'webp'
  }

  private result(
    inputPath: string,
    outputPath: string,
    sourceFormat: string,
    targetFormat: ImageTargetFormat | VideoTargetFormat | ArchiveTargetFormat,
    originalSize: number,
    outputSize: number,
    startedAt: number
  ): ConversionResult {
    return {
      id: randomUUID(),
      status: 'completed',
      inputPath,
      outputPath,
      sourceFormat,
      targetFormat,
      originalSize,
      outputSize,
      savedPercent: Number((((originalSize - outputSize) / originalSize) * 100).toFixed(1)),
      startedAt,
      completedAt: Date.now()
    }
  }
}
