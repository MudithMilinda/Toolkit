import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { ImageConverter } from './converters/ImageConverter'
import { FfmpegVideoConverter } from './converters/FfmpegVideoConverter'
import { OutputManager } from './OutputManager'
import type {
  ConversionResult,
  DocumentTargetFormat,
  DocumentConversionRequest,
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
  PdfConversionRequest,
  PdfCompressionRequest,
  PdfSplitRequest,
  PdfOrganizeRequest,
  VideoCompressionRequest,
  VideoCropRequest,
  VideoSpeedRequest,
  VideoTargetFormat,
  VideoTrimRequest,
  VideoConversionRequest
} from './types'

const MAX_IMAGE_BYTES = 512 * 1024 * 1024
const execFileAsync = promisify(execFile)

// PDFKit is built into macOS and exposes the same text that Preview can select.
// Keeping the script inline means Electron's production bundle has no loose
// script asset to locate at runtime.
const pdfTextExtractionScript = String.raw`
ObjC.import('Foundation')
ObjC.import('PDFKit')
function run(argv) {
  const filePath = $(argv[0])
  const document = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(filePath))
  if (!document) throw new Error('The PDF could not be opened.')
  const pages = Number(document.pageCount)
  const text = []
  for (let index = 0; index < pages; index += 1) {
    const page = document.pageAtIndex(index)
    const pageText = page ? ObjC.unwrap(page.string) : ''
    if (pageText) text.push(pageText)
  }
  return JSON.stringify(text)
}
`

const escapeXml = (value: string): string =>
  value.replace(/[<>&'\"]/g, (character) => {
    const entities: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;'
    }
    return entities[character] ?? character
  })

const docxToPagesScript = String.raw`
on run argv
  set sourceFile to POSIX file (item 1 of argv)
  set destinationFile to POSIX file (item 2 of argv)
  tell application "Pages"
    open sourceFile
    delay 0.5
    save front document in destinationFile
    close front document saving no
  end tell
end run
`

const documentToPdfScript = String.raw`
on run argv
  set sourceFile to POSIX file (item 1 of argv)
  set destinationFile to POSIX file (item 2 of argv)
  tell application "Pages"
    open sourceFile
    delay 0.5
    export front document to destinationFile as PDF
    close front document saving no
  end tell
end run
`

const documentToEpubScript = String.raw`
on run argv
  set sourceFile to POSIX file (item 1 of argv)
  set destinationFile to POSIX file (item 2 of argv)
  tell application "Pages"
    open sourceFile
    delay 0.5
    export front document to destinationFile as EPUB
    close front document saving no
  end tell
end run
`

const presentationToPdfScript = String.raw`
on run argv
  set sourceFile to POSIX file (item 1 of argv)
  set destinationFile to POSIX file (item 2 of argv)
  tell application "Keynote"
    open sourceFile
    delay 0.5
    export front document to destinationFile as PDF
    close front document saving no
  end tell
end run
`

const pdfOptimizationScript = String.raw`
ObjC.import('Foundation')
ObjC.import('PDFKit')
function run(argv) {
  const document = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath($(argv[0])))
  if (!document) throw new Error('The PDF could not be opened.')
  if (!document.writeToURL($.NSURL.fileURLWithPath($(argv[1]))))
    throw new Error('The optimized PDF could not be saved.')
}
`

const pdfMetadataScript = String.raw`
ObjC.import('Foundation')
ObjC.import('PDFKit')
function run(argv) {
  const document = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath($(argv[0])))
  if (!document) throw new Error('The PDF could not be opened.')
  const attributes = document.documentAttributes
  const value = (attribute) => {
    const item = attributes ? attributes.objectForKey(attribute) : null
    const unwrapped = ObjC.unwrap(item)
    return unwrapped === null || unwrapped === undefined ? '' : String(unwrapped)
  }
  return JSON.stringify({
    pages: Number(document.pageCount),
    encrypted: Boolean(document.isEncrypted),
    title: value($.PDFDocumentTitleAttribute),
    author: value($.PDFDocumentAuthorAttribute),
    subject: value($.PDFDocumentSubjectAttribute),
    creator: value($.PDFDocumentCreatorAttribute),
    keywords: value($.PDFDocumentKeywordsAttribute),
    producer: value($.PDFDocumentProducerAttribute),
    created: value($.PDFDocumentCreationDateAttribute),
    modified: value($.PDFDocumentModificationDateAttribute)
  })
}
`

const pdfThumbnailScript = String.raw`
ObjC.import('Foundation')
ObjC.import('PDFKit')
ObjC.import('AppKit')
function run(argv) {
  const document = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath($(argv[0])))
  if (!document) throw new Error('The PDF could not be opened.')
  const directory = argv[1]
  const limit = Math.min(Number(document.pageCount), Number(argv[2]))
  const names = []
  for (let index = 0; index < limit; index += 1) {
    const image = document.pageAtIndex(index).thumbnailOfSizeForBox($.NSMakeSize(140, 180), $.kPDFDisplayBoxCropBox)
    const bitmap = $.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation)
    const data = bitmap.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({}))
    const name = 'page-' + (index + 1) + '.png'
    if (!data.writeToURLAtomically($.NSURL.fileURLWithPath($(directory + '/' + name)), true))
      throw new Error('A PDF preview could not be created.')
    names.push(name)
  }
  return JSON.stringify({ pageCount: Number(document.pageCount), names: names })
}
`

const pdfSplitScript = String.raw`
ObjC.import('Foundation')
ObjC.import('PDFKit')
function run(argv) {
  const input = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath($(argv[0])))
  if (!input) throw new Error('The PDF could not be opened.')
  const start = Number(argv[1]) - 1
  const end = Number(argv[2]) - 1
  if (start < 0 || end < start || end >= Number(input.pageCount))
    throw new Error('Choose a valid page range.')
  const output = $.PDFDocument.alloc.init
  for (let index = start; index <= end; index += 1) output.insertPageAtIndex(input.pageAtIndex(index), Number(output.pageCount))
  if (!output.writeToURL($.NSURL.fileURLWithPath($(argv[3]))))
    throw new Error('The split PDF could not be saved.')
}
`

const pdfOrganizeScript = String.raw`
ObjC.import('Foundation')
ObjC.import('PDFKit')
function run(argv) {
  const input = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath($(argv[0])))
  if (!input) throw new Error('The PDF could not be opened.')
  const pageOrder = JSON.parse(argv[1])
  const pageRotations = JSON.parse(argv[2])
  if (!Array.isArray(pageOrder) || !pageOrder.length) throw new Error('Keep at least one page.')
  const seen = {}
  for (const pageNumber of pageOrder) {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > Number(input.pageCount) || seen[pageNumber])
      throw new Error('The PDF page order is invalid.')
    seen[pageNumber] = true
  }
  const output = $.PDFDocument.alloc.init
  for (const pageNumber of pageOrder) {
    const rotation = Number(pageRotations[String(pageNumber)] || 0)
    if (![0, 90, 180, 270].includes(rotation)) throw new Error('The PDF page rotation is invalid.')
    const page = input.pageAtIndex(pageNumber - 1)
    if (rotation) page.rotation = (Number(page.rotation) + rotation) % 360
    output.insertPageAtIndex(page, Number(output.pageCount))
  }
  if (!output.writeToURL($.NSURL.fileURLWithPath($(argv[3]))))
    throw new Error('The organized PDF could not be saved.')
}
`

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

  convertPdf(request: PdfConversionRequest): Promise<ConversionResult> {
    return this.startJob(`${resolve(request.inputPath)}:pdf:${request.targetFormat}`, () =>
      this.performPdfToDocx(request)
    )
  }

  convertDocument(request: DocumentConversionRequest): Promise<ConversionResult> {
    return this.startJob(`${resolve(request.inputPath)}:document:${request.targetFormat}`, () =>
      this.performDocumentConversion(request)
    )
  }

  compressPdf(request: PdfCompressionRequest): Promise<ConversionResult> {
    return this.startJob(`${resolve(request.inputPath)}:pdf-compress`, () =>
      this.performPdfCompression(request)
    )
  }

  async splitPdf(request: PdfSplitRequest): Promise<{ outputPaths: string[] }> {
    if (process.platform !== 'darwin')
      throw new Error('PDF splitting is currently available on macOS.')
    if (!isAbsolute(request.inputPath)) throw new Error('The input file path must be absolute.')
    if (!Number.isInteger(request.startPage) || !Number.isInteger(request.endPage))
      throw new Error('Choose whole page numbers.')
    if (request.startPage < 1 || request.endPage < request.startPage || request.endPage > 10_000)
      throw new Error('Choose a valid page range.')
    const inputPath = resolve(request.inputPath)
    const source = await stat(inputPath)
    if (!source.isFile() || inputPath.split('.').pop()?.toLowerCase() !== 'pdf')
      throw new Error('Select a valid PDF file.')
    const ranges = request.splitEveryPage
      ? Array.from({ length: request.endPage - request.startPage + 1 }, (_, index) => {
          const page = request.startPage + index
          return [page, page] as const
        })
      : [[request.startPage, request.endPage] as const]
    const outputPaths: string[] = []
    for (const [startPage, endPage] of ranges) {
      const temporaryPath = `${await this.outputManager.createTemporaryPath(inputPath)}.pdf`
      try {
        await execFileAsync('/usr/bin/osascript', [
          '-l',
          'JavaScript',
          '-e',
          pdfSplitScript,
          inputPath,
          String(startPage),
          String(endPage),
          temporaryPath
        ])
        outputPaths.push(
          await this.outputManager.publishTemporaryFile(
            temporaryPath,
            inputPath,
            'pdf',
            startPage === endPage ? `-page-${startPage}` : `-pages-${startPage}-${endPage}`
          )
        )
      } finally {
        await this.outputManager.discardTemporaryFile(temporaryPath)
      }
    }
    return { outputPaths }
  }

  async organizePdf(request: PdfOrganizeRequest): Promise<ConversionResult> {
    if (process.platform !== 'darwin')
      throw new Error('PDF organization is currently available on macOS.')
    if (!isAbsolute(request.inputPath)) throw new Error('The input file path must be absolute.')
    if (
      !Array.isArray(request.pageOrder) ||
      !request.pageOrder.length ||
      request.pageOrder.length > 10_000
    )
      throw new Error('Keep between 1 and 10,000 PDF pages.')
    if (
      !request.pageRotations ||
      typeof request.pageRotations !== 'object' ||
      !Object.entries(request.pageRotations).every(
        ([page, rotation]) => Number.isInteger(Number(page)) && [0, 90, 180, 270].includes(rotation)
      )
    )
      throw new Error('The PDF page rotations are invalid.')
    const inputPath = resolve(request.inputPath)
    const source = await stat(inputPath)
    if (!source.isFile() || inputPath.split('.').pop()?.toLowerCase() !== 'pdf')
      throw new Error('Select a valid PDF file.')
    const startedAt = Date.now()
    const temporaryPath = `${await this.outputManager.createTemporaryPath(inputPath)}.pdf`
    try {
      await execFileAsync('/usr/bin/osascript', [
        '-l',
        'JavaScript',
        '-e',
        pdfOrganizeScript,
        inputPath,
        JSON.stringify(request.pageOrder),
        JSON.stringify(request.pageRotations),
        temporaryPath
      ])
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        inputPath,
        'pdf',
        '-organized'
      )
      const output = await stat(outputPath)
      return this.result(inputPath, outputPath, 'pdf', 'pdf', source.size, output.size, startedAt)
    } catch (error) {
      const detail = error instanceof Error ? error.message : ''
      throw new Error(detail || 'Unable to organize this PDF.', { cause: error })
    } finally {
      await this.outputManager.discardTemporaryFile(temporaryPath)
    }
  }

  async getPdfMetadata(inputPathValue: string): Promise<Array<{ key: string; value: string }>> {
    if (!isAbsolute(inputPathValue)) throw new Error('The PDF path must be absolute.')
    const inputPath = resolve(inputPathValue)
    const source = await stat(inputPath)
    if (!source.isFile() || inputPath.split('.').pop()?.toLowerCase() !== 'pdf')
      throw new Error('Select a valid PDF file.')
    const { stdout } = await execFileAsync('/usr/bin/osascript', [
      '-l',
      'JavaScript',
      '-e',
      pdfMetadataScript,
      inputPath
    ])
    try {
      const metadata = JSON.parse(stdout) as Record<string, unknown>
      const items: Array<{ key: string; value: string }> = [
        { key: 'Pages', value: String(metadata.pages ?? '') },
        { key: 'Encrypted', value: metadata.encrypted ? 'Yes' : 'No' },
        { key: 'File size', value: this.formatFileSize(source.size) }
      ]
      const names: Array<[string, string]> = [
        ['Title', 'title'],
        ['Author', 'author'],
        ['Subject', 'subject'],
        ['Keywords', 'keywords'],
        ['Creator', 'creator'],
        ['Producer', 'producer'],
        ['Created', 'created'],
        ['Modified', 'modified']
      ]
      names.forEach(([key, name]) => {
        const value = metadata[name]
        if (typeof value === 'string' && value.trim()) items.push({ key, value })
      })
      return items
    } catch (error) {
      throw new Error('Unable to read metadata from this PDF.', { cause: error })
    }
  }

  async getPdfThumbnails(
    inputPathValue: string
  ): Promise<{ pageCount: number; thumbnails: string[] }> {
    if (!isAbsolute(inputPathValue)) throw new Error('The PDF path must be absolute.')
    const inputPath = resolve(inputPathValue)
    const source = await stat(inputPath)
    if (!source.isFile() || inputPath.split('.').pop()?.toLowerCase() !== 'pdf')
      throw new Error('Select a valid PDF file.')
    const directory = join(app.getPath('temp'), `universal-file-toolkit-pdf-${randomUUID()}`)
    await mkdir(directory, { recursive: true })
    try {
      const { stdout } = await execFileAsync(
        '/usr/bin/osascript',
        ['-l', 'JavaScript', '-e', pdfThumbnailScript, inputPath, directory, '120'],
        { maxBuffer: 4 * 1024 * 1024 }
      )
      const result = JSON.parse(stdout) as { pageCount?: unknown; names?: unknown }
      if (
        !Number.isInteger(result.pageCount) ||
        (result.pageCount as number) < 1 ||
        !Array.isArray(result.names) ||
        !result.names.every((name) => typeof name === 'string' && /^page-\d+\.png$/.test(name))
      )
        throw new Error('Invalid PDF preview response.')
      const thumbnails = await Promise.all(
        result.names.map(async (name) => {
          const bytes = await readFile(join(directory, name))
          return `data:image/png;base64,${bytes.toString('base64')}`
        })
      )
      return { pageCount: result.pageCount as number, thumbnails }
    } catch (error) {
      throw new Error('Unable to create PDF page previews.', { cause: error })
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    }
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
  bleepAudio(
    request: AudioBleepRequest,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult> {
    return this.startJob(
      `${resolve(request.inputPath)}:audio-bleep:${request.startSeconds}:${request.endSeconds}`,
      () => this.performAudioBleep(request, onProgress)
    )
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
  private async performAudioBleep(
    request: AudioBleepRequest,
    onProgress?: (percent: number) => void
  ): Promise<ConversionResult> {
    const { inputPath, source, normalizedSource } = await this.prepareMediaInput(request.inputPath)
    const startedAt = Date.now()
    const temporaryPath = `${await this.outputManager.createTemporaryPath(inputPath)}.mp3`
    try {
      await this.ffmpegVideoConverter.bleepAudio(
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
        '-bleeped'
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

  private async performDocumentConversion(
    request: DocumentConversionRequest
  ): Promise<ConversionResult> {
    if (process.platform !== 'darwin')
      throw new Error('DOC and DOCX to PDF conversion is currently available on macOS.')
    if (!isAbsolute(request.inputPath)) throw new Error('The input file path must be absolute.')
    const inputPath = resolve(request.inputPath)
    const source = await stat(inputPath)
    if (!source.isFile()) throw new Error('The selected document is not a regular file.')
    if (source.size === 0) throw new Error('The selected document is empty.')
    if (source.size > 512 * 1024 * 1024)
      throw new Error('The selected document exceeds the 512 MB limit.')
    const sourceFormat = inputPath.split('.').pop()?.toLowerCase() ?? ''
    if (!['doc', 'docx', 'ppt', 'pptx'].includes(sourceFormat))
      throw new Error('Select a DOC, DOCX, PPT, or PPTX file to convert.')
    const startedAt = Date.now()
    const temporaryBasePath = await this.outputManager.createTemporaryPath(inputPath)
    const requiresPages = ['pages', 'epub'].includes(request.targetFormat)
    if (requiresPages) {
      try {
        const pagesApp = await stat('/Applications/Pages.app')
        if (!pagesApp.isDirectory()) throw new Error('Apple Pages is not installed.')
      } catch (error) {
        const detail = error instanceof Error ? error.message : ''
        throw new Error(
          detail === 'Apple Pages is not installed.'
            ? detail
            : `Apple Pages is required to create ${request.targetFormat.toUpperCase()} from this document. Install Pages and try again.`
        )
      }
    }
    const textPath = `${temporaryBasePath}.txt`
    const htmlPath = `${temporaryBasePath}.html`
    const pagesPath = `${temporaryBasePath}.pages`
    const epubPath = `${temporaryBasePath}.epub`
    const pdfPath = `${temporaryBasePath}.pdf`
    const imagePath = `${temporaryBasePath}.${request.targetFormat}`
    try {
      if (
        ['ppt', 'pptx'].includes(sourceFormat) &&
        !['pdf', 'png', 'jpg'].includes(request.targetFormat)
      ) {
        throw new Error('Presentations can be converted to PDF, PNG, or JPG.')
      }
      if (request.targetFormat === 'txt' || request.targetFormat === 'md') {
        await execFileAsync('/usr/bin/textutil', [
          '-convert',
          'txt',
          '-output',
          textPath,
          inputPath
        ])
        if (request.targetFormat === 'md') {
          const text = await readFile(textPath, 'utf8')
          await writeFile(
            textPath,
            text.trim() ? `# ${basename(inputPath, `.${sourceFormat}`)}\n\n${text.trim()}\n` : '',
            'utf8'
          )
        }
      } else if (request.targetFormat === 'html') {
        await execFileAsync('/usr/bin/textutil', [
          '-convert',
          'html',
          '-output',
          htmlPath,
          inputPath
        ])
      } else if (request.targetFormat === 'pages') {
        await execFileAsync('/usr/bin/osascript', [
          '-l',
          'AppleScript',
          '-e',
          docxToPagesScript,
          inputPath,
          pagesPath
        ])
      } else if (request.targetFormat === 'epub') {
        await execFileAsync('/usr/bin/osascript', [
          '-l',
          'AppleScript',
          '-e',
          documentToEpubScript,
          inputPath,
          epubPath
        ])
      } else {
        await this.exportDocumentPdf(inputPath, pdfPath, temporaryBasePath, sourceFormat)
        if (request.targetFormat === 'jpg' || request.targetFormat === 'png') {
          await execFileAsync('/usr/bin/sips', [
            '-s',
            'format',
            request.targetFormat === 'jpg' ? 'jpeg' : 'png',
            pdfPath,
            '--out',
            imagePath
          ])
        }
      }
      const temporaryPath =
        request.targetFormat === 'txt' || request.targetFormat === 'md'
          ? textPath
          : request.targetFormat === 'html'
            ? htmlPath
            : request.targetFormat === 'pages'
              ? pagesPath
              : request.targetFormat === 'epub'
                ? epubPath
                : request.targetFormat === 'pdf'
                  ? pdfPath
                  : imagePath
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        inputPath,
        request.targetFormat,
        '-converted'
      )
      const output = await stat(outputPath)
      return this.result(
        inputPath,
        outputPath,
        sourceFormat,
        request.targetFormat,
        source.size,
        output.size,
        startedAt
      )
    } catch (error) {
      const detail = error instanceof Error ? error.message : ''
      throw new Error(
        detail || `Unable to convert the document to ${request.targetFormat.toUpperCase()}.`,
        { cause: error }
      )
    } finally {
      await Promise.all(
        [textPath, htmlPath, pagesPath, epubPath, pdfPath, imagePath].map((path) =>
          this.outputManager.discardTemporaryFile(path)
        )
      )
    }
  }

  /** Uses Pages when available, otherwise renders textutil's HTML in Electron. */
  private async exportDocumentPdf(
    inputPath: string,
    pdfPath: string,
    temporaryBasePath: string,
    sourceFormat: string
  ): Promise<void> {
    if (sourceFormat === 'ppt' || sourceFormat === 'pptx') {
      try {
        const keynoteApp = await stat('/Applications/Keynote.app')
        if (!keynoteApp.isDirectory()) throw new Error('Apple Keynote is not installed.')
        await execFileAsync('/usr/bin/osascript', [
          '-l',
          'AppleScript',
          '-e',
          presentationToPdfScript,
          inputPath,
          pdfPath
        ])
        return
      } catch {
        const previewDirectory = `${temporaryBasePath}-presentation-preview`
        await mkdir(previewDirectory, { recursive: true })
        try {
          await execFileAsync('/usr/bin/qlmanage', ['-p', '-o', previewDirectory, inputPath])
          const previewPath = (await readdir(previewDirectory, { recursive: true })).find((path) =>
            path.toLowerCase().endsWith('.html')
          )
          if (!previewPath) {
            throw new Error('Quick Look did not create a presentation preview.')
          }
          const renderer = new BrowserWindow({
            show: false,
            webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
          })
          try {
            await renderer.loadFile(join(previewDirectory, previewPath))
            await writeFile(
              pdfPath,
              await renderer.webContents.printToPDF({ printBackground: true })
            )
          } finally {
            renderer.destroy()
          }
          return
        } catch (error) {
          const detail = error instanceof Error ? error.message : ''
          throw new Error(detail || 'Install Apple Keynote to convert this presentation to PDF.', {
            cause: error
          })
        } finally {
          await rm(previewDirectory, { force: true, recursive: true }).catch(() => undefined)
        }
      }
    }
    try {
      const pagesApp = await stat('/Applications/Pages.app')
      if (!pagesApp.isDirectory()) throw new Error('Apple Pages is not installed.')
      await execFileAsync('/usr/bin/osascript', [
        '-l',
        'AppleScript',
        '-e',
        documentToPdfScript,
        inputPath,
        pdfPath
      ])
      return
    } catch {
      const htmlPath = `${temporaryBasePath}.pdf-render.html`
      const renderer = new BrowserWindow({
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
      })
      try {
        await execFileAsync('/usr/bin/textutil', [
          '-convert',
          'html',
          '-output',
          htmlPath,
          inputPath
        ])
        await renderer.loadFile(htmlPath)
        await writeFile(pdfPath, await renderer.webContents.printToPDF({ printBackground: true }))
      } finally {
        renderer.destroy()
        await this.outputManager.discardTemporaryFile(htmlPath)
      }
    }
  }

  private async performPdfToDocx(request: PdfConversionRequest): Promise<ConversionResult> {
    if (process.platform !== 'darwin')
      throw new Error('PDF to DOCX conversion is currently available on macOS.')
    if (!isAbsolute(request.inputPath)) throw new Error('The input file path must be absolute.')
    const inputPath = resolve(request.inputPath)
    const source = await stat(inputPath)
    if (!source.isFile()) throw new Error('The selected PDF is not a regular file.')
    if (source.size === 0) throw new Error('The selected PDF is empty.')
    if (source.size > 512 * 1024 * 1024)
      throw new Error('The selected PDF exceeds the 512 MB limit.')
    if (inputPath.split('.').pop()?.toLowerCase() !== 'pdf')
      throw new Error('Select a PDF file to convert to DOCX.')

    const startedAt = Date.now()
    const temporaryBasePath = await this.outputManager.createTemporaryPath(inputPath)
    if (request.targetFormat === 'png' || request.targetFormat === 'jpg') {
      const imagePath = `${temporaryBasePath}.${request.targetFormat}`
      try {
        await execFileAsync('/usr/bin/sips', [
          '-s',
          'format',
          request.targetFormat === 'jpg' ? 'jpeg' : 'png',
          inputPath,
          '--out',
          imagePath
        ])
        const outputPath = await this.outputManager.publishTemporaryFile(
          imagePath,
          inputPath,
          request.targetFormat,
          '-page-1'
        )
        const output = await stat(outputPath)
        return this.result(
          inputPath,
          outputPath,
          'pdf',
          request.targetFormat,
          source.size,
          output.size,
          startedAt
        )
      } catch (error) {
        const detail = error instanceof Error ? error.message : ''
        throw new Error(
          detail || `Unable to convert the first PDF page to ${request.targetFormat}.`,
          {
            cause: error
          }
        )
      } finally {
        await this.outputManager.discardTemporaryFile(imagePath)
      }
    }
    const textPath = `${temporaryBasePath}.txt`
    const markdownPath = `${temporaryBasePath}.md`
    const docxPath = `${temporaryBasePath}.docx`
    const pagesPath = `${temporaryBasePath}.pages`
    const pptxPath = `${temporaryBasePath}.pptx`
    const pptxDirectory = `${temporaryBasePath}.pptx-package`
    const xlsxPath = `${temporaryBasePath}.xlsx`
    const xlsxDirectory = `${temporaryBasePath}.xlsx-package`
    const epubPath = `${temporaryBasePath}.epub`
    const epubDirectory = `${temporaryBasePath}.epub-package`
    try {
      const extractedPages = await this.extractPdfTextPages(inputPath)
      const extractedText = extractedPages.join('\n\n').trim()
      if (!extractedText)
        throw new Error(
          'This PDF has no selectable text. Scanned PDFs need OCR before DOCX export.'
        )
      await writeFile(textPath, extractedText, 'utf8')
      if (request.targetFormat === 'txt') {
        const outputPath = await this.outputManager.publishTemporaryFile(
          textPath,
          inputPath,
          'txt',
          '-converted'
        )
        const output = await stat(outputPath)
        return this.result(inputPath, outputPath, 'pdf', 'txt', source.size, output.size, startedAt)
      }
      if (request.targetFormat === 'md') {
        const markdown = extractedPages
          .map((page, index) => `# Page ${index + 1}\n\n${page.trim()}`)
          .join('\n\n---\n\n')
        await writeFile(markdownPath, markdown, 'utf8')
        const outputPath = await this.outputManager.publishTemporaryFile(
          markdownPath,
          inputPath,
          'md',
          '-converted'
        )
        const output = await stat(outputPath)
        return this.result(inputPath, outputPath, 'pdf', 'md', source.size, output.size, startedAt)
      }
      await execFileAsync('/usr/bin/textutil', ['-convert', 'docx', '-output', docxPath, textPath])
      if (request.targetFormat === 'pages') {
        try {
          const pagesApp = await stat('/Applications/Pages.app')
          if (!pagesApp.isDirectory()) throw new Error('Apple Pages is not installed.')
        } catch (error) {
          const detail = error instanceof Error ? error.message : ''
          throw new Error(
            detail === 'Apple Pages is not installed.'
              ? detail
              : 'Apple Pages is required to create a .pages document. Install Pages and try again.'
          )
        }
        await execFileAsync('/usr/bin/osascript', [
          '-l',
          'AppleScript',
          '-e',
          docxToPagesScript,
          docxPath,
          pagesPath
        ])
        const outputPath = await this.outputManager.publishTemporaryFile(
          pagesPath,
          inputPath,
          'pages',
          '-converted'
        )
        const output = await stat(outputPath)
        return this.result(
          inputPath,
          outputPath,
          'pdf',
          'pages',
          source.size,
          output.size,
          startedAt
        )
      }
      if (request.targetFormat === 'pptx') {
        await this.createTextPresentation(extractedPages, pptxDirectory, pptxPath)
        const outputPath = await this.outputManager.publishTemporaryFile(
          pptxPath,
          inputPath,
          'pptx',
          '-converted'
        )
        const output = await stat(outputPath)
        return this.result(
          inputPath,
          outputPath,
          'pdf',
          'pptx',
          source.size,
          output.size,
          startedAt
        )
      }
      if (request.targetFormat === 'xlsx') {
        await this.createTextSpreadsheet(extractedPages, xlsxDirectory, xlsxPath)
        const outputPath = await this.outputManager.publishTemporaryFile(
          xlsxPath,
          inputPath,
          'xlsx',
          '-converted'
        )
        const output = await stat(outputPath)
        return this.result(
          inputPath,
          outputPath,
          'pdf',
          'xlsx',
          source.size,
          output.size,
          startedAt
        )
      }
      if (request.targetFormat === 'epub') {
        await this.createEpub(extractedPages, epubDirectory, epubPath)
        const outputPath = await this.outputManager.publishTemporaryFile(
          epubPath,
          inputPath,
          'epub',
          '-converted'
        )
        const output = await stat(outputPath)
        return this.result(
          inputPath,
          outputPath,
          'pdf',
          'epub',
          source.size,
          output.size,
          startedAt
        )
      }
      const outputPath = await this.outputManager.publishTemporaryFile(
        docxPath,
        inputPath,
        'docx',
        '-converted'
      )
      const output = await stat(outputPath)
      return this.result(inputPath, outputPath, 'pdf', 'docx', source.size, output.size, startedAt)
    } catch (error) {
      const detail = error instanceof Error ? error.message : ''
      throw new Error(detail || 'Unable to convert this PDF to DOCX.', { cause: error })
    } finally {
      await this.outputManager.discardTemporaryFile(textPath)
      await this.outputManager.discardTemporaryFile(markdownPath)
      await this.outputManager.discardTemporaryFile(docxPath)
      await this.outputManager.discardTemporaryFile(pagesPath)
      await this.outputManager.discardTemporaryFile(pptxPath)
      await this.outputManager.discardTemporaryFile(pptxDirectory)
      await this.outputManager.discardTemporaryFile(xlsxPath)
      await this.outputManager.discardTemporaryFile(xlsxDirectory)
      await this.outputManager.discardTemporaryFile(epubPath)
      await this.outputManager.discardTemporaryFile(epubDirectory)
    }
  }

  private async performPdfCompression(request: PdfCompressionRequest): Promise<ConversionResult> {
    if (process.platform !== 'darwin')
      throw new Error('PDF compression is currently available on macOS.')
    if (!isAbsolute(request.inputPath)) throw new Error('The input file path must be absolute.')
    const inputPath = resolve(request.inputPath)
    const source = await stat(inputPath)
    if (!source.isFile()) throw new Error('The selected PDF is not a regular file.')
    if (source.size === 0) throw new Error('The selected PDF is empty.')
    if (source.size > 512 * 1024 * 1024)
      throw new Error('The selected PDF exceeds the 512 MB limit.')
    if (inputPath.split('.').pop()?.toLowerCase() !== 'pdf')
      throw new Error('Select a PDF file to compress.')
    const startedAt = Date.now()
    const temporaryPath = `${await this.outputManager.createTemporaryPath(inputPath)}.pdf`
    try {
      await execFileAsync('/usr/bin/osascript', [
        '-l',
        'JavaScript',
        '-e',
        pdfOptimizationScript,
        inputPath,
        temporaryPath
      ])
      const outputPath = await this.outputManager.publishTemporaryFile(
        temporaryPath,
        inputPath,
        'pdf',
        '-compressed'
      )
      const output = await stat(outputPath)
      return this.result(inputPath, outputPath, 'pdf', 'pdf', source.size, output.size, startedAt)
    } catch (error) {
      const detail = error instanceof Error ? error.message : ''
      throw new Error(detail || 'Unable to optimize this PDF.', { cause: error })
    } finally {
      await this.outputManager.discardTemporaryFile(temporaryPath)
    }
  }

  private async extractPdfTextPages(inputPath: string): Promise<string[]> {
    const { stdout } = await execFileAsync(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '-e', pdfTextExtractionScript, inputPath],
      { maxBuffer: 32 * 1024 * 1024 }
    )
    try {
      const pages: unknown = JSON.parse(stdout)
      if (!Array.isArray(pages) || !pages.every((page) => typeof page === 'string'))
        throw new Error('Invalid PDF text output.')
      return pages.filter((page) => page.trim())
    } catch (error) {
      throw new Error('Unable to read text from this PDF.', { cause: error })
    }
  }

  private async createTextPresentation(
    pages: string[],
    packageDirectory: string,
    outputPath: string
  ): Promise<void> {
    await mkdir(join(packageDirectory, '_rels'), { recursive: true })
    await mkdir(join(packageDirectory, 'ppt', '_rels'), { recursive: true })
    await mkdir(join(packageDirectory, 'ppt', 'slides'), { recursive: true })
    const slideIds = pages
      .map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`)
      .join('')
    const slideRelationships = pages
      .map(
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`
      )
      .join('')
    const contentOverrides = pages
      .map(
        (_, index) =>
          `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
      )
      .join('')
    await Promise.all([
      writeFile(
        join(packageDirectory, '[Content_Types].xml'),
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${contentOverrides}</Types>`
      ),
      writeFile(
        join(packageDirectory, '_rels', '.rels'),
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`
      ),
      writeFile(
        join(packageDirectory, 'ppt', 'presentation.xml'),
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`
      ),
      writeFile(
        join(packageDirectory, 'ppt', '_rels', 'presentation.xml.rels'),
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slideRelationships}</Relationships>`
      )
    ])
    await Promise.all(
      pages.map((page, index) =>
        writeFile(
          join(packageDirectory, 'ppt', 'slides', `slide${index + 1}.xml`),
          this.pptxSlide(page, index + 1)
        )
      )
    )
    await execFileAsync('/usr/bin/zip', ['-q', '-r', outputPath, '.'], { cwd: packageDirectory })
  }

  private pptxSlide(pageText: string, pageNumber: number): string {
    const paragraphs = pageText
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(0, 80)
      .map(
        (line) =>
          `<a:p><a:r><a:rPr lang="en-US" sz="1800"/><a:t>${escapeXml(line)}</a:t></a:r></a:p>`
      )
      .join('')
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="457200"/><a:ext cx="10820400" cy="685800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3000" b="1"/><a:t>PDF page ${pageNumber}</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="1371600"/><a:ext cx="10820400" cy="5029200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${paragraphs}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  }

  private async createTextSpreadsheet(
    pages: string[],
    packageDirectory: string,
    outputPath: string
  ): Promise<void> {
    await mkdir(join(packageDirectory, '_rels'), { recursive: true })
    await mkdir(join(packageDirectory, 'xl', '_rels'), { recursive: true })
    await mkdir(join(packageDirectory, 'xl', 'worksheets'), { recursive: true })
    const sheets = pages
      .map(
        (_, index) =>
          `<sheet name="Page ${index + 1}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
      )
      .join('')
    const relationships = pages
      .map(
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
      )
      .join('')
    const contentOverrides = pages
      .map(
        (_, index) =>
          `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join('')
    await Promise.all([
      writeFile(
        join(packageDirectory, '[Content_Types].xml'),
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${contentOverrides}</Types>`
      ),
      writeFile(
        join(packageDirectory, '_rels', '.rels'),
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
      ),
      writeFile(
        join(packageDirectory, 'xl', 'workbook.xml'),
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`
      ),
      writeFile(
        join(packageDirectory, 'xl', '_rels', 'workbook.xml.rels'),
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`
      )
    ])
    await Promise.all(
      pages.map((page, index) => {
        const rows = page
          .split(/\r?\n/)
          .filter(Boolean)
          .slice(0, 100_000)
          .map(
            (line, lineIndex) =>
              `<row r="${lineIndex + 1}"><c r="A${lineIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(line)}</t></is></c></row>`
          )
          .join('')
        return writeFile(
          join(packageDirectory, 'xl', 'worksheets', `sheet${index + 1}.xml`),
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols><col min="1" max="1" width="80" customWidth="1"/></cols><sheetData>${rows}</sheetData></worksheet>`
        )
      })
    )
    await execFileAsync('/usr/bin/zip', ['-q', '-r', outputPath, '.'], { cwd: packageDirectory })
  }

  private async createEpub(
    pages: string[],
    packageDirectory: string,
    outputPath: string
  ): Promise<void> {
    await mkdir(join(packageDirectory, 'META-INF'), { recursive: true })
    await mkdir(join(packageDirectory, 'OEBPS', 'text'), { recursive: true })
    const manifest = pages
      .map(
        (_, index) =>
          `<item id="chapter-${index + 1}" href="text/chapter-${index + 1}.xhtml" media-type="application/xhtml+xml"/>`
      )
      .join('')
    const spine = pages.map((_, index) => `<itemref idref="chapter-${index + 1}"/>`).join('')
    const navigation = pages
      .map((_, index) => `<li><a href="text/chapter-${index + 1}.xhtml">Page ${index + 1}</a></li>`)
      .join('')
    await Promise.all([
      writeFile(join(packageDirectory, 'mimetype'), 'application/epub+zip'),
      writeFile(
        join(packageDirectory, 'META-INF', 'container.xml'),
        `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
      ),
      writeFile(
        join(packageDirectory, 'OEBPS', 'content.opf'),
        `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="en"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:${randomUUID()}</dc:identifier><dc:title>Converted PDF</dc:title><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${manifest}</manifest><spine>${spine}</spine></package>`
      ),
      writeFile(
        join(packageDirectory, 'OEBPS', 'nav.xhtml'),
        `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Contents</title></head><body><nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops"><h1>Contents</h1><ol>${navigation}</ol></nav></body></html>`
      )
    ])
    await Promise.all(
      pages.map((page, index) => {
        const paragraphs = page
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => `<p>${escapeXml(line)}</p>`)
          .join('')
        return writeFile(
          join(packageDirectory, 'OEBPS', 'text', `chapter-${index + 1}.xhtml`),
          `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Page ${index + 1}</title></head><body><h1>Page ${index + 1}</h1>${paragraphs}</body></html>`
        )
      })
    )
    // EPUB requires an uncompressed mimetype file as the first ZIP entry.
    await execFileAsync('/usr/bin/zip', ['-X0q', outputPath, 'mimetype'], { cwd: packageDirectory })
    await execFileAsync('/usr/bin/zip', ['-Xrq', outputPath, 'META-INF', 'OEBPS'], {
      cwd: packageDirectory
    })
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
    targetFormat:
      ImageTargetFormat | VideoTargetFormat | ArchiveTargetFormat | DocumentTargetFormat,
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

  private formatFileSize(bytes: number): string {
    return bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / 1024 ** 2).toFixed(1)} MB`
  }
}
