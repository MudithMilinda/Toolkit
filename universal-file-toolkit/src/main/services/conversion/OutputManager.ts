import { constants } from 'node:fs'
import { access, link, mkdir, rm } from 'node:fs/promises'
import { basename, dirname, join, parse } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Keeps all output creation in the input directory and never overwrites a file. */
export class OutputManager {
  async createTemporaryPath(inputPath: string): Promise<string> {
    const directory = dirname(inputPath)
    await access(directory, constants.W_OK)
    return join(directory, `.${randomUUID()}.universal-file-toolkit.tmp`)
  }

  async publishTemporaryFile(
    temporaryPath: string,
    inputPath: string,
    targetExtension: string
  ): Promise<string> {
    const directory = dirname(inputPath)
    await mkdir(directory, { recursive: true })
    const sourceName = basename(inputPath)
    const safeName = this.sanitizeStem(parse(sourceName).name)
    const extension = targetExtension.replace(/^\./, '').toLowerCase()

    for (let index = 0; index < 10_000; index += 1) {
      const suffix = index === 0 ? '' : ` (${index})`
      const outputPath = join(directory, `${safeName}${suffix}.${extension}`)
      try {
        // A hard link is an atomic, exclusive publish operation on the same volume.
        // It avoids overwriting a file created by another process between existence checks.
        await link(temporaryPath, outputPath)
        await rm(temporaryPath, { force: true })
        return outputPath
      } catch (error: unknown) {
        if (this.isAlreadyExists(error)) continue
        throw error
      }
    }
    throw new Error('Unable to find an available output filename.')
  }

  async discardTemporaryFile(path: string): Promise<void> {
    await rm(path, { force: true }).catch(() => undefined)
  }

  private sanitizeStem(stem: string): string {
    const withoutControlCharacters = [...stem]
      .filter((character) => character.charCodeAt(0) >= 32)
      .join('')
    const cleaned = withoutControlCharacters.replace(/[\\/:*?"<>|]/g, '_').trim()
    return (cleaned || 'converted-file').slice(0, 180)
  }

  private isAlreadyExists(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')
  }
}
