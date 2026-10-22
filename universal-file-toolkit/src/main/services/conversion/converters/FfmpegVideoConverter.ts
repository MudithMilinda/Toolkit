import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

/** FFmpeg-backed formats that macOS AVFoundation cannot encode. */
export class FfmpegVideoConverter {
  async convert(
    inputPath: string,
    outputPath: string,
    format: 'webm' | 'mkv' | 'avi' | 'mp3',
    onProgress?: (percent: number) => void
  ): Promise<void> {
    if (!ffmpegPath) throw new Error('The bundled FFmpeg binary is unavailable for this computer.')
    // Restrict output to the primary playable streams. Some screen recordings and
    // phone videos include timed metadata, data tracks, or a trailing stream that
    // can leave a WebM muxer waiting at the end of an otherwise complete export.
    const inputMapping = ['-map', '0:v:0?', '-map', '0:a:0?', '-sn', '-dn']
    const formatArguments =
      format === 'mp3'
        ? ['-vn', '-c:a', 'libmp3lame', '-q:a', '2']
        : format === 'webm'
          ? [
              '-c:v',
              'libvpx',
              '-deadline',
              'realtime',
              '-cpu-used',
              '8',
              '-b:v',
              '2M',
              '-c:a',
              'libopus'
            ]
          : format === 'mkv'
            ? ['-c:v', 'libx264', '-crf', '23', '-c:a', 'aac']
            : ['-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'libmp3lame']
    try {
      const durationMs = await this.readDuration(inputPath)
      await this.runWithProgress(
        [
          '-i',
          inputPath,
          ...inputMapping,
          ...formatArguments,
          '-shortest',
          '-progress',
          'pipe:2',
          '-nostats',
          '-y',
          outputPath
        ],
        durationMs,
        onProgress
      )
    } catch (error) {
      const details = error instanceof Error ? error.message : ''
      if (/timed out/i.test(details)) {
        throw new Error('WebM conversion timed out. Try converting the source to MP4 first.')
      }
      throw error
    }
  }

  private async readDuration(inputPath: string): Promise<number | null> {
    try {
      await execFileAsync(ffmpegPath!, ['-hide_banner', '-i', inputPath], { maxBuffer: 256 * 1024 })
      return null
    } catch (error) {
      const output =
        error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : ''
      const match = output.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/)
      if (!match) return null
      return (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000
    }
  }

  private runWithProgress(
    arguments_: string[],
    durationMs: number | null,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(ffmpegPath!, arguments_)
      let stderr = ''
      let lastPercent = 0
      const timeout = setTimeout(() => child.kill('SIGTERM'), 30 * 60 * 1000)
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        stderr = (stderr + text).slice(-64 * 1024)
        if (!durationMs) return
        for (const line of text.split(/\r?\n/)) {
          const match = line.match(/^out_time_ms=(\d+)$/)
          if (!match) continue
          const percent = Math.min(99, Math.floor((Number(match[1]) / 1000 / durationMs) * 100))
          if (percent > lastPercent) {
            lastPercent = percent
            onProgress?.(percent)
          }
        }
      })
      child.once('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.once('close', (code) => {
        clearTimeout(timeout)
        if (code === 0) resolve()
        else reject(new Error(stderr.trim() || `FFmpeg exited with code ${code ?? 'unknown'}.`))
      })
    })
  }
}
