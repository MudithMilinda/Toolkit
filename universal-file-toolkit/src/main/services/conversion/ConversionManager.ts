import { stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ImageConverter } from './converters/ImageConverter'
import { OutputManager } from './OutputManager'
import type { ConversionResult, ImageConversionRequest } from './types'

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

  private async performImageConversion(request: ImageConversionRequest): Promise<ConversionResult> {
    if (!isAbsolute(request.inputPath)) throw new Error('The input file path must be absolute.')
    if (!this.imageConverter.supportsOutput(request.targetFormat)) {
      throw new Error(
        `This installation cannot encode ${request.targetFormat.toUpperCase()} images.`
      )
    }
    const inputPath = resolve(request.inputPath)
    const source = await stat(inputPath)
    if (!source.isFile()) throw new Error('The selected input is not a regular file.')
    if (source.size === 0) throw new Error('The selected image is empty.')
    if (source.size > MAX_IMAGE_BYTES)
      throw new Error('The selected image exceeds the 512 MB safety limit.')

    const inspected = await this.imageConverter.inspect(inputPath)
    const normalizedSource = inspected.format === 'jpeg' ? 'jpg' : inspected.format
    if (normalizedSource === request.targetFormat) {
      throw new Error(
        `This image is already ${request.targetFormat.toUpperCase()}; no conversion was made.`
      )
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
      return {
        id: randomUUID(),
        status: 'completed',
        inputPath,
        outputPath,
        sourceFormat: normalizedSource,
        targetFormat: request.targetFormat,
        originalSize: source.size,
        outputSize: output.size,
        savedPercent: Number((((source.size - output.size) / source.size) * 100).toFixed(1)),
        startedAt,
        completedAt: Date.now()
      }
    } catch (error) {
      await this.outputManager.discardTemporaryFile(temporaryPath)
      throw error
    }
  }
}
