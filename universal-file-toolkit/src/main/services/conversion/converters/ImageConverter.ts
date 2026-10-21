import sharp from 'sharp'
import type { ImageConversionOptions, ImageTargetFormat } from '../types'

const supportedInputFormats = new Set(['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif', 'heif'])

export class ImageConverter {
  async inspect(inputPath: string): Promise<{ format: string }> {
    const metadata = await sharp(inputPath, { animated: false, failOn: 'warning' }).metadata()
    if (!metadata.format || !supportedInputFormats.has(metadata.format)) {
      throw new Error('This file is not a supported image, or its image data is invalid.')
    }
    return { format: metadata.format }
  }

  async convert(
    inputPath: string,
    outputPath: string,
    targetFormat: ImageTargetFormat,
    options: ImageConversionOptions = {}
  ): Promise<void> {
    let pipeline = sharp(inputPath, { animated: false, failOn: 'warning' }).rotate()
    if (options.preserveMetadata) pipeline = pipeline.withMetadata()

    if (targetFormat === 'jpg') {
      pipeline = pipeline.flatten({
        background: options.flattenBackground ?? { r: 255, g: 255, b: 255 }
      })
      await pipeline.jpeg({ quality: options.quality ?? 90, mozjpeg: true }).toFile(outputPath)
      return
    }
    if (targetFormat === 'webp') {
      await pipeline.webp({ quality: options.quality ?? 85 }).toFile(outputPath)
      return
    }
    await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(outputPath)
  }

  supportsOutput(target: ImageTargetFormat): boolean {
    const formats = sharp.format as unknown as Record<string, { output?: { file?: boolean } }>
    const sharpName: Record<ImageTargetFormat, string> = {
      jpg: 'jpeg',
      png: 'png',
      webp: 'webp'
    }
    return formats[sharpName[target]]?.output?.file === true
  }
}
