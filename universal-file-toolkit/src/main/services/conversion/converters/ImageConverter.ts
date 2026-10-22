import sharp, { type Sharp } from 'sharp'
import { app } from 'electron'
import { writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { platform } from 'node:process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { ImageConversionOptions, ImageTargetFormat } from '../types'
import type { ImageCompressionRequest, ImageEditRequest } from '../types'

const supportedInputFormats = new Set(['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif', 'heif'])
const execFileAsync = promisify(execFile)

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
    if (targetFormat === 'tiff') {
      await pipeline.tiff({ quality: options.quality ?? 90, compression: 'lzw' }).toFile(outputPath)
      return
    }
    if (targetFormat === 'avif') {
      await pipeline.avif({ quality: options.quality ?? 60 }).toFile(outputPath)
      return
    }
    if (targetFormat === 'heic') {
      await this.writeHeic(inputPath, outputPath)
      return
    }
    if (targetFormat === 'bmp') {
      await this.writeBmp(pipeline, outputPath)
      return
    }
    if (targetFormat === 'pdf') {
      await this.writePdf(pipeline, outputPath)
      return
    }
    await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(outputPath)
  }

  async convertToPdf(inputPaths: string[], outputPath: string): Promise<void> {
    const pages = await Promise.all(
      inputPaths.map(async (inputPath) => {
        const { data: jpeg, info } = await sharp(inputPath, {
          animated: false,
          failOn: 'warning'
        })
          .rotate()
          .flatten({ background: 'white' })
          .jpeg({ quality: 90, mozjpeg: true })
          .toBuffer({ resolveWithObject: true })
        return { jpeg, width: info.width, height: info.height }
      })
    )
    await this.writePdfPages(pages, outputPath)
  }

  async resize(
    inputPath: string,
    outputPath: string,
    targetFormat: ImageTargetFormat,
    options: {
      width?: number
      height?: number
      fit: 'inside' | 'cover' | 'fill'
      withoutEnlargement: boolean
    }
  ): Promise<void> {
    let pipeline = sharp(inputPath, { animated: false, failOn: 'warning' }).rotate().resize({
      width: options.width,
      height: options.height,
      fit: options.fit,
      withoutEnlargement: options.withoutEnlargement
    })
    if (targetFormat === 'jpg') {
      pipeline = pipeline.flatten({ background: { r: 255, g: 255, b: 255 } })
      await pipeline.jpeg({ quality: 90, mozjpeg: true }).toFile(outputPath)
      return
    }
    if (targetFormat === 'webp') {
      await pipeline.webp({ quality: 85 }).toFile(outputPath)
      return
    }
    await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(outputPath)
  }

  async compress(
    inputPath: string,
    outputPath: string,
    targetFormat: ImageTargetFormat,
    options: Pick<ImageCompressionRequest, 'quality' | 'maxDimension'>
  ): Promise<void> {
    let pipeline = sharp(inputPath, { animated: false, failOn: 'warning' }).rotate()
    if (options.maxDimension) {
      pipeline = pipeline.resize({
        width: options.maxDimension,
        height: options.maxDimension,
        fit: 'inside',
        withoutEnlargement: true
      })
    }
    if (targetFormat === 'jpg') {
      pipeline = pipeline.flatten({ background: { r: 255, g: 255, b: 255 } })
      await pipeline.jpeg({ quality: options.quality, mozjpeg: true }).toFile(outputPath)
      return
    }
    if (targetFormat === 'webp') {
      await pipeline.webp({ quality: options.quality }).toFile(outputPath)
      return
    }
    await pipeline
      .png({ compressionLevel: options.quality < 70 ? 9 : options.quality < 90 ? 7 : 5 })
      .toFile(outputPath)
  }

  async crop(
    inputPath: string,
    outputPath: string,
    targetFormat: ImageTargetFormat,
    area: { left: number; top: number; width: number; height: number }
  ): Promise<void> {
    let pipeline = sharp(inputPath, { animated: false, failOn: 'warning' }).rotate().extract(area)
    if (targetFormat === 'jpg') {
      pipeline = pipeline.flatten({ background: 'white' })
      await pipeline.jpeg({ quality: 90, mozjpeg: true }).toFile(outputPath)
    } else if (targetFormat === 'webp') await pipeline.webp({ quality: 85 }).toFile(outputPath)
    else await pipeline.png({ compressionLevel: 9 }).toFile(outputPath)
  }
  async edit(
    inputPath: string,
    outputPath: string,
    targetFormat: ImageTargetFormat,
    options: ImageEditRequest
  ): Promise<void> {
    const clamp = (value: number): number => Math.max(0, Math.min(255, value))
    const tonalOffset = options.brightness + options.whites * 0.35 + options.blacks * 0.2
    const tonalGamma = Math.max(
      0.1,
      1 + (options.gamma - options.shadows * 0.22 + options.highlights * 0.16) / 100
    )
    let pipeline = sharp(inputPath, { animated: false, failOn: 'warning' })
      .rotate(options.rotation)
      .linear(2 ** options.exposure * (1 + options.contrast / 100), tonalOffset)
      .modulate({
        saturation: Math.max(0, 1 + (options.saturation + options.vibrance * 0.55) / 100),
        hue: options.hue
      })
    if (options.temperature || options.tint)
      pipeline = pipeline.tint({
        r: clamp(255 + options.temperature),
        g: clamp(255 + options.tint),
        b: clamp(255 - options.temperature)
      })
    if (options.gamma || options.shadows || options.highlights)
      pipeline = pipeline.gamma(tonalGamma)
    if (targetFormat === 'jpg') {
      pipeline = pipeline.flatten({ background: 'white' })
      await pipeline.jpeg({ quality: 90, mozjpeg: true }).toFile(outputPath)
    } else if (targetFormat === 'webp') await pipeline.webp({ quality: 85 }).toFile(outputPath)
    else await pipeline.png({ compressionLevel: 9 }).toFile(outputPath)
  }

  /** Uses macOS Vision's foreground instance mask to preserve the image subject. */
  async removeBackground(inputPath: string, outputPath: string): Promise<void> {
    if (platform !== 'darwin')
      throw new Error('Background removal is currently available on macOS only.')
    const helperPath = app.isPackaged
      ? join(process.resourcesPath, 'native', 'background-removal')
      : join(app.getAppPath(), 'native', 'macos', 'bin', 'background-removal')
    await execFileAsync(helperPath, [inputPath, outputPath])
  }

  supportsOutput(target: ImageTargetFormat): boolean {
    const formats = sharp.format as unknown as Record<string, { output?: { file?: boolean } }>
    const sharpName: Record<ImageTargetFormat, string> = {
      jpg: 'jpeg',
      png: 'png',
      webp: 'webp',
      tiff: 'tiff',
      avif: 'heif',
      heic: 'heif',
      pdf: 'pdf',
      bmp: 'bmp'
    }
    if (target === 'pdf' || target === 'bmp') return true
    if (target === 'heic') return platform === 'darwin'
    return formats[sharpName[target]]?.output?.file === true
  }

  private async writeHeic(inputPath: string, outputPath: string): Promise<void> {
    if (platform !== 'darwin') throw new Error('HEIC export is available on macOS only.')
    await execFileAsync('sips', ['-s', 'format', 'heic', inputPath, '--out', outputPath])
  }

  private async writeBmp(pipeline: Sharp, outputPath: string): Promise<void> {
    const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const pixelData = Buffer.alloc(data.length)
    const stride = info.width * 4
    for (let row = 0; row < info.height; row += 1) {
      for (let column = 0; column < info.width; column += 1) {
        const source = row * stride + column * 4
        const target = (info.height - row - 1) * stride + column * 4
        pixelData[target] = data[source + 2]
        pixelData[target + 1] = data[source + 1]
        pixelData[target + 2] = data[source]
        pixelData[target + 3] = data[source + 3]
      }
    }
    const header = Buffer.alloc(54)
    header.write('BM')
    header.writeUInt32LE(header.length + pixelData.length, 2)
    header.writeUInt32LE(54, 10)
    header.writeUInt32LE(40, 14)
    header.writeInt32LE(info.width, 18)
    header.writeInt32LE(info.height, 22)
    header.writeUInt16LE(1, 26)
    header.writeUInt16LE(32, 28)
    header.writeUInt32LE(pixelData.length, 34)
    await writeFile(outputPath, Buffer.concat([header, pixelData]))
  }

  private async writePdf(pipeline: Sharp, outputPath: string): Promise<void> {
    const { data: jpeg, info } = await pipeline
      .flatten({ background: 'white' })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })
    await this.writePdfPages([{ jpeg, width: info.width, height: info.height }], outputPath)
  }

  private async writePdfPages(
    pages: Array<{ jpeg: Buffer; width: number; height: number }>,
    outputPath: string
  ): Promise<void> {
    if (!pages.length) throw new Error('Select at least one image to create a PDF.')
    const pageObjectNumbers = pages.map((_, index) => 3 + index * 3)
    const objects: Buffer[] = [
      Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
      Buffer.from(
        `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(' ')}] /Count ${pages.length} >>`
      )
    ]
    for (const [index, page] of pages.entries()) {
      const pageObject = pageObjectNumbers[index]
      const imageObject = pageObject + 1
      const contentObject = pageObject + 2
      const content = Buffer.from(`q\n${page.width} 0 0 ${page.height} 0 0 cm\n/Im0 Do\nQ\n`)
      objects.push(
        Buffer.from(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`
        ),
        Buffer.concat([
          Buffer.from(
            `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`
          ),
          page.jpeg,
          Buffer.from('\nendstream')
        ]),
        Buffer.concat([
          Buffer.from(`<< /Length ${content.length} >>\nstream\n`),
          content,
          Buffer.from('endstream')
        ])
      )
    }
    const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n')]
    const offsets = [0]
    for (let index = 0; index < objects.length; index += 1) {
      offsets.push(Buffer.concat(chunks).length)
      chunks.push(Buffer.from(`${index + 1} 0 obj\n`), objects[index], Buffer.from('\nendobj\n'))
    }
    const xrefOffset = Buffer.concat(chunks).length
    chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`))
    for (const offset of offsets.slice(1))
      chunks.push(Buffer.from(`${offset.toString().padStart(10, '0')} 00000 n \n`))
    chunks.push(
      Buffer.from(
        `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
      )
    )
    await writeFile(outputPath, Buffer.concat(chunks))
  }
}
