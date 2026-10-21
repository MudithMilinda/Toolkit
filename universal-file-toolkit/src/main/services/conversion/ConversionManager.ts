import { stat } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { ImageConverter } from './converters/ImageConverter'
import { OutputManager } from './OutputManager'
import type {
  ConversionResult,
  ImageCompressionRequest,
  ImageCropRequest,
  ImageEditRequest,
  ImageConversionRequest,
  ImagesToPdfRequest,
  ImageResizeRequest,
  ImageTargetFormat
} from './types'

const MAX_IMAGE_BYTES = 512 * 1024 * 1024

/** Main-process-only image conversion coordinator. Duplicate jobs share one promise. */
export class ConversionManager {
  private readonly imageConverter = new ImageConverter()
  private readonly outputManager = new OutputManager()
  private readonly activeJobs = new Map<string, Promise<ConversionResult>>()

  convertImage(request: ImageConversionRequest): Promise<ConversionResult> {
    const key = `${resolve(request.inputPath)}:${request.targetFormat}`
    const existing = this.activeJobs.get(key)
    if (existing) return existing
    const job = this.performImageConversion(request).finally(() => this.activeJobs.delete(key))
    this.activeJobs.set(key, job)
    return job
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

  private editTargetFormat(sourceFormat: string): ImageTargetFormat {
    return sourceFormat === 'jpg' || sourceFormat === 'png' || sourceFormat === 'webp'
      ? sourceFormat
      : 'webp'
  }

  private result(
    inputPath: string,
    outputPath: string,
    sourceFormat: string,
    targetFormat: ImageTargetFormat,
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
