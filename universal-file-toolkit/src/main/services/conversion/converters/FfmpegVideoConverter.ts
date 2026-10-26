import { execFile, spawn } from 'node:child_process'
import { rename, rm } from 'node:fs/promises'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

/** FFmpeg-backed formats that macOS AVFoundation cannot encode. */
export class FfmpegVideoConverter {
  async createPoster(inputPath: string, outputPath: string): Promise<void> {
    await this.writeAtomically(outputPath, (target) => this.encodePoster(inputPath, target))
  }

  async createPreview(inputPath: string, outputPath: string): Promise<void> {
    await this.writeAtomically(outputPath, (target) => this.encodePreview(inputPath, target))
  }

  async createAudioPreview(inputPath: string, outputPath: string): Promise<void> {
    if (!ffmpegPath) throw new Error('The bundled FFmpeg binary is unavailable for this computer.')
    await this.runWithProgress(
      [
        '-i',
        inputPath,
        '-map',
        '0:a:0?',
        '-vn',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '128k',
        '-y',
        outputPath
      ],
      null
    )
  }

  private async encodePoster(inputPath: string, outputPath: string): Promise<void> {
    if (!ffmpegPath) throw new Error('The bundled FFmpeg binary is unavailable for this computer.')
    // FFmpeg auto-rotates by default (phone videos with rotation metadata come out upright),
    // so no manual transpose / -noautorotate is needed here.
    await this.runWithProgress(
      [
        '-ss',
        '0.1',
        '-i',
        inputPath,
        '-frames:v',
        '1',
        '-vf',
        this.previewFilters(),
        '-q:v',
        '4',
        '-y',
        outputPath
      ],
      null
    )
  }

  private async encodePreview(inputPath: string, outputPath: string): Promise<void> {
    if (!ffmpegPath) throw new Error('The bundled FFmpeg binary is unavailable for this computer.')
    const info = await this.probe(inputPath)
    const streams = ['-map', '0:v:0?', '-map', '0:a:0?', '-sn', '-dn']
    const audio = info.audio === 'aac' ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '96k']
    const output = ['-movflags', '+faststart', '-y', outputPath]

    // 1) Fastest path: browser-friendly H.264 only needs re-wrapping into MP4 (no re-encode).
    //    Rotation metadata is kept, so Chromium shows portrait videos upright.
    if (info.video === 'h264' && info.yuv420p) {
      try {
        await this.runWithProgress(
          ['-i', inputPath, ...streams, '-c:v', 'copy', ...audio, ...output],
          null
        )
        return
      } catch {
        // fall through to a real transcode
      }
    }

    // 2) Other codecs (HEVC, ProRes, VP9, ...): small preview transcode.
    //    On macOS try the hardware encoder first (many times faster than libx264).
    const filters = this.previewFilters(true)
    if (process.platform === 'darwin') {
      try {
        await this.runWithProgress(
          [
            '-hwaccel',
            'videotoolbox',
            '-i',
            inputPath,
            ...streams,
            '-vf',
            filters,
            '-c:v',
            'h264_videotoolbox',
            '-b:v',
            '900k',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '96k',
            ...output
          ],
          null
        )
        return
      } catch {
        // hardware encoder unavailable in this FFmpeg build; use software below
      }
    }
    await this.runWithProgress(
      [
        '-i',
        inputPath,
        ...streams,
        '-vf',
        filters,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-crf',
        '28',
        '-preset',
        'ultrafast',
        '-c:a',
        'aac',
        '-b:a',
        '96k',
        ...output
      ],
      null
    )
  }

  /**
   * Cuts [startSeconds, endSeconds] out of the source.
   *
   * Speed strategy (fastest first):
   *  1) Start is at 0 -> stream copy. No re-encode, finishes almost instantly, and it is still
   *     exact because the very first frame is always a keyframe.
   *  2) macOS -> hardware H.264 encoder (videotoolbox), bitrate matched to the source.
   *  3) Everything else -> libx264 `veryfast` (about 3-4x faster than `medium`).
   *
   * `-ss` is placed before `-i` so FFmpeg seeks directly instead of decoding from the start,
   * and the re-encode paths stay frame-accurate.
   */
  async trim(
    inputPath: string,
    outputPath: string,
    startSeconds: number,
    endSeconds: number,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    if (!ffmpegPath) throw new Error('The bundled FFmpeg binary is unavailable for this computer.')
    const length = endSeconds - startSeconds
    if (!(length > 0)) throw new Error('The selected trim range is empty.')
    const durationMs = length * 1000
    const streams = ['-map', '0:v:0?', '-map', '0:a:0?', '-sn', '-dn']
    const seekInput = ['-ss', startSeconds.toFixed(3), '-i', inputPath, '-t', length.toFixed(3)]
    const tail = ['-movflags', '+faststart', '-progress', 'pipe:2', '-nostats', '-y', outputPath]

    // 1) Only the end is being cut: copy the streams, no re-encode needed.
    if (startSeconds <= 0.05) {
      try {
        await this.runWithProgress(
          [...seekInput, ...streams, '-c', 'copy', '-avoid_negative_ts', 'make_zero', ...tail],
          durationMs,
          onProgress
        )
        onProgress?.(100)
        return
      } catch {
        // some containers cannot be copied into MP4; fall through to a real encode
      }
    }

    // 2) macOS hardware encoder, with the source bitrate so quality stays close to the original.
    if (process.platform === 'darwin') {
      try {
        const { bitrateKbps } = await this.readMediaInfo(inputPath)
        const target = Math.min(20000, Math.max(1500, bitrateKbps ?? 6000))
        await this.runWithProgress(
          [
            '-hwaccel',
            'videotoolbox',
            ...seekInput,
            ...streams,
            '-c:v',
            'h264_videotoolbox',
            '-b:v',
            `${target}k`,
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            ...tail
          ],
          durationMs,
          onProgress
        )
        onProgress?.(100)
        return
      } catch {
        // hardware encoder unavailable in this FFmpeg build; use software below
      }
    }

    // 3) Software encode, tuned for speed.
    await this.runWithProgress(
      [
        ...seekInput,
        ...streams,
        '-c:v',
        'libx264',
        '-crf',
        '20',
        '-preset',
        'veryfast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        ...tail
      ],
      durationMs,
      onProgress
    )
    onProgress?.(100)
  }

  async crop(
    inputPath: string,
    outputPath: string,
    area: { left: number; top: number; width: number; height: number },
    onProgress?: (percent: number) => void
  ): Promise<void> {
    if (!ffmpegPath) throw new Error('The bundled FFmpeg binary is unavailable for this computer.')
    const durationMs = await this.readDuration(inputPath)
    await this.runWithProgress(
      [
        '-i',
        inputPath,
        '-map',
        '0:v:0?',
        '-map',
        '0:a:0?',
        '-sn',
        '-dn',
        '-vf',
        `crop=${area.width}:${area.height}:${area.left}:${area.top}`,
        '-c:v',
        'libx264',
        '-crf',
        '20',
        '-preset',
        'medium',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        '-progress',
        'pipe:2',
        '-nostats',
        '-y',
        outputPath
      ],
      durationMs,
      onProgress
    )
  }

  async mute(
    inputPath: string,
    outputPath: string,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    if (!ffmpegPath) throw new Error('The bundled FFmpeg binary is unavailable for this computer.')
    const durationMs = await this.readDuration(inputPath)
    await this.runWithProgress(
      [
        '-i',
        inputPath,
        '-map',
        '0:v:0?',
        '-c:v',
        'copy',
        '-an',
        '-movflags',
        '+faststart',
        '-progress',
        'pipe:2',
        '-nostats',
        '-y',
        outputPath
      ],
      durationMs,
      onProgress
    )
  }

  async changeSpeed(
    inputPath: string,
    outputPath: string,
    speed: number,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    if (!ffmpegPath) throw new Error('The bundled FFmpeg binary is unavailable for this computer.')
    const durationMs = await this.readDuration(inputPath)
    const outputDurationMs = durationMs ? durationMs / speed : null
    const streams = ['-map', '0:v:0?', '-map', '0:a:0?', '-sn', '-dn']

    // The default 1× option changes nothing. Avoid a full decode/re-encode in
    // this case and copy the streams directly, which is normally near-instant.
    if (speed === 1) {
      try {
        await this.runWithProgress(
          [
            '-i',
            inputPath,
            ...streams,
            '-c',
            'copy',
            '-movflags',
            '+faststart',
            '-progress',
            'pipe:2',
            '-nostats',
            '-y',
            outputPath
          ],
          durationMs,
          onProgress
        )
        onProgress?.(100)
        return
      } catch {
        // Some source codecs cannot be copied into MP4. Use the normal
        // compatible re-encode route below in that case.
      }
    }

    const tempos: number[] = []
    let remaining = speed
    while (remaining < 0.5) {
      tempos.push(0.5)
      remaining /= 0.5
    }
    while (remaining > 2) {
      tempos.push(2)
      remaining /= 2
    }
    tempos.push(remaining)
    const filters = [
      '-filter:v',
      `setpts=PTS/${speed}`,
      '-filter:a',
      tempos.map((tempo) => `atempo=${tempo}`).join(',')
    ]
    const tail = [
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:2',
      '-nostats',
      '-y',
      outputPath
    ]

    // VideoToolbox encodes on the Mac GPU/media engine and is dramatically
    // faster than libx264 for phone footage. Preserve a sensible source-like
    // bitrate; if an older Mac or FFmpeg build cannot use it, fall back below.
    if (process.platform === 'darwin') {
      try {
        const { bitrateKbps } = await this.readMediaInfo(inputPath)
        const target = Math.min(20000, Math.max(1500, bitrateKbps ?? 6000))
        await this.runWithProgress(
          [
            '-hwaccel',
            'videotoolbox',
            '-i',
            inputPath,
            ...streams,
            ...filters,
            '-c:v',
            'h264_videotoolbox',
            '-b:v',
            `${target}k`,
            '-pix_fmt',
            'yuv420p',
            ...tail
          ],
          outputDurationMs,
          onProgress
        )
        return
      } catch {
        // Fall back to the portable software encoder below.
      }
    }

    await this.runWithProgress(
      [
        '-i',
        inputPath,
        ...streams,
        ...filters,
        '-c:v',
        'libx264',
        '-crf',
        '20',
        '-preset',
        'veryfast',
        ...tail
      ],
      outputDurationMs,
      onProgress
    )
  }

  async inspect(inputPath: string): Promise<Array<{ key: string; value: string }>> {
    if (!ffmpegPath) throw new Error('The bundled FFmpeg binary is unavailable for this computer.')
    let output = ''
    try {
      await execFileAsync(ffmpegPath, ['-hide_banner', '-i', inputPath], { maxBuffer: 256 * 1024 })
    } catch (error) {
      output = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : ''
    }
    if (!output) throw new Error('Unable to read video metadata.')
    const rows: Array<{ key: string; value: string }> = []
    const duration = output.match(/Duration:\s+([^,]+)/)?.[1]
    const bitrate = output.match(/bitrate:\s+([^\n]+)/)?.[1]
    const video = output.match(/Stream #\d+(?::\d+)?(?:\[[^\]]+\])?: Video:\s*([^\n]+)/)?.[1]
    const audio = output.match(/Stream #\d+(?::\d+)?(?:\[[^\]]+\])?: Audio:\s*([^\n]+)/)?.[1]
    if (duration) rows.push({ key: 'Duration', value: duration.trim() })
    if (bitrate) rows.push({ key: 'Bitrate', value: bitrate.trim() })
    if (video) rows.push({ key: 'Video stream', value: video.trim() })
    if (audio) rows.push({ key: 'Audio stream', value: audio.trim() })
    for (const line of output.split(/\r?\n/)) {
      const match = line.match(/^\s{4}([\w -]+)\s*:\s*(.+)$/)
      if (
        !match ||
        !['title', 'artist', 'comment', 'creation_time', 'location'].includes(match[1].trim())
      )
        continue
      rows.push({ key: match[1].trim(), value: match[2].trim() })
    }
    return rows.length ? rows : [{ key: 'Details', value: 'No readable metadata found.' }]
  }

  async compress(
    inputPath: string,
    outputPath: string,
    quality: number,
    maxDimension: number | undefined,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    if (!ffmpegPath) throw new Error('The bundled FFmpeg binary is unavailable for this computer.')
    const durationMs = await this.readDuration(inputPath)
    // CRF is inversely related to quality: 18 is visually near-lossless, while
    // 32 trades more detail for a substantially smaller file.
    const crf = Math.round(32 - (quality / 100) * 14)
    const scale = maxDimension
      ? [
          '-vf',
          `scale=w='min(iw,${maxDimension})':h='min(ih,${maxDimension})':force_original_aspect_ratio=decrease`
        ]
      : []
    await this.runWithProgress(
      [
        '-i',
        inputPath,
        '-map',
        '0:v:0?',
        '-map',
        '0:a:0?',
        '-sn',
        '-dn',
        ...scale,
        '-c:v',
        'libx264',
        '-crf',
        String(crf),
        '-preset',
        'medium',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        '-progress',
        'pipe:2',
        '-nostats',
        '-y',
        outputPath
      ],
      durationMs,
      onProgress
    )
  }

  async compressAudio(
    inputPath: string,
    outputPath: string,
    bitrateKbps: 96 | 192,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    if (!ffmpegPath) throw new Error('The bundled FFmpeg binary is unavailable for this computer.')
    const durationMs = await this.readDuration(inputPath)
    await this.runWithProgress(
      [
        '-i',
        inputPath,
        '-map',
        '0:a:0?',
        '-vn',
        '-sn',
        '-dn',
        '-c:a',
        'libmp3lame',
        '-b:a',
        `${bitrateKbps}k`,
        '-progress',
        'pipe:2',
        '-nostats',
        '-y',
        outputPath
      ],
      durationMs,
      onProgress
    )
  }

  async normalizeAudio(
    inputPath: string,
    outputPath: string,
    options: { targetLufs: number; loudnessRange: number; truePeak: number },
    onProgress?: (percent: number) => void
  ): Promise<void> {
    if (!ffmpegPath) throw new Error('The bundled FFmpeg binary is unavailable for this computer.')
    const durationMs = await this.readDuration(inputPath)
    const baseFilter = `loudnorm=I=${options.targetLufs}:LRA=${options.loudnessRange}:TP=${options.truePeak}`
    const measured = await this.analyzeLoudness(inputPath, baseFilter)
    // A measured second pass makes the three controls precise rather than only
    // estimating their effect from the audio as it is being encoded.
    const filter = measured
      ? `${baseFilter}:measured_I=${measured.input_i}:measured_LRA=${measured.input_lra}:measured_TP=${measured.input_tp}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`
      : baseFilter
    await this.runWithProgress(
      [
        '-i',
        inputPath,
        '-map',
        '0:a:0?',
        '-vn',
        '-sn',
        '-dn',
        '-af',
        filter,
        '-c:a',
        'libmp3lame',
        '-q:a',
        '2',
        '-progress',
        'pipe:2',
        '-nostats',
        '-y',
        outputPath
      ],
      durationMs,
      onProgress
    )
  }

  async trimAudio(
    inputPath: string,
    outputPath: string,
    startSeconds: number,
    endSeconds: number,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    if (!ffmpegPath) throw new Error('The bundled FFmpeg binary is unavailable for this computer.')
    const outputDuration = endSeconds - startSeconds
    await this.runWithProgress(
      [
        '-ss',
        String(startSeconds),
        '-i',
        inputPath,
        '-map',
        '0:a:0?',
        '-vn',
        '-t',
        String(outputDuration),
        '-c:a',
        'libmp3lame',
        '-q:a',
        '2',
        '-progress',
        'pipe:2',
        '-nostats',
        '-y',
        outputPath
      ],
      outputDuration * 1000,
      onProgress
    )
  }
  async bleepAudio(inputPath: string, outputPath: string, start: number, end: number, onProgress?: (percent: number) => void): Promise<void> {
    if (!ffmpegPath) throw new Error('The bundled FFmpeg binary is unavailable for this computer.')
    const durationMs = await this.readDuration(inputPath)
    const between = `between(t\\,${start}\\,${end})`
    const filter = `[0:a]volume=enable='${between}':volume=0[base];[1:a]volume=enable='not(${between})':volume=0[tone];[base][tone]amix=inputs=2:normalize=0[out]`
    await this.runWithProgress(['-i', inputPath, '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=44100', '-filter_complex', filter, '-map', '[out]', '-t', String((durationMs ?? 0) / 1000), '-c:a', 'libmp3lame', '-q:a', '2', '-progress', 'pipe:2', '-nostats', '-y', outputPath], durationMs, onProgress)
  }

  private async analyzeLoudness(
    inputPath: string,
    filter: string
  ): Promise<
    | {
        input_i: string
        input_lra: string
        input_tp: string
        input_thresh: string
        target_offset: string
      }
    | undefined
  > {
    if (!ffmpegPath) return undefined
    try {
      const { stderr } = await execFileAsync(
        ffmpegPath,
        [
          '-hide_banner',
          '-i',
          inputPath,
          '-map',
          '0:a:0?',
          '-vn',
          '-af',
          `${filter}:print_format=json`,
          '-f',
          'null',
          '-'
        ],
        { maxBuffer: 512 * 1024 }
      )
      const report = stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0]
      if (!report) return undefined
      const values = JSON.parse(report) as Record<string, unknown>
      const required = [
        'input_i',
        'input_lra',
        'input_tp',
        'input_thresh',
        'target_offset'
      ] as const
      if (!required.every((key) => typeof values[key] === 'string')) return undefined
      return {
        input_i: values.input_i as string,
        input_lra: values.input_lra as string,
        input_tp: values.input_tp as string,
        input_thresh: values.input_thresh as string,
        target_offset: values.target_offset as string
      }
    } catch {
      // Some unusual media streams cannot be analysed, but FFmpeg's one-pass
      // loudnorm remains safe and is preferable to rejecting the export.
      return undefined
    }
  }

  async convert(
    inputPath: string,
    outputPath: string,
    format: 'webm' | 'mkv' | 'avi' | 'mp3' | 'wav' | 'flac' | 'ogg' | 'opus' | 'aiff',
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
        : format === 'wav'
          ? ['-vn', '-c:a', 'pcm_s16le']
          : format === 'flac'
            ? ['-vn', '-c:a', 'flac']
            : format === 'ogg'
              ? ['-vn', '-c:a', 'libvorbis', '-q:a', '5']
              : format === 'opus'
                ? ['-vn', '-c:a', 'libopus', '-b:a', '128k']
                : format === 'aiff'
                  ? ['-vn', '-c:a', 'pcm_s16be']
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

  /**
   * Writes to a temporary file and renames it only when FFmpeg finished successfully, so an
   * interrupted run (app closed, crash, timeout) can never leave a half-written file that a
   * cache check would later treat as a finished preview or poster.
   */
  private async writeAtomically(
    outputPath: string,
    build: (temporaryPath: string) => Promise<void>
  ): Promise<void> {
    const temporaryPath = outputPath.replace(/(\.[^./\\]+)$/, '.part$1')
    try {
      await build(temporaryPath)
      await rename(temporaryPath, outputPath)
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  /** Reads the first video/audio codec so the preview can skip re-encoding when possible. */
  private async probe(
    inputPath: string
  ): Promise<{ video?: string; audio?: string; yuv420p: boolean }> {
    let output = ''
    try {
      await execFileAsync(ffmpegPath!, ['-hide_banner', '-i', inputPath], { maxBuffer: 256 * 1024 })
    } catch (error) {
      output = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : ''
    }
    const videoLine = output.match(
      /Stream #\d+(?::\d+)?(?:\[[^\]]+\])?(?:\([^)]*\))?: Video:\s*([^\n]+)/
    )?.[1]
    const audioLine = output.match(
      /Stream #\d+(?::\d+)?(?:\[[^\]]+\])?(?:\([^)]*\))?: Audio:\s*([^\n]+)/
    )?.[1]
    return {
      video: videoLine?.match(/^(\w+)/)?.[1]?.toLowerCase(),
      audio: audioLine?.match(/^(\w+)/)?.[1]?.toLowerCase(),
      yuv420p: videoLine ? /\byuv420p\b/.test(videoLine) : false
    }
  }

  /** Duration (ms) and overall bitrate (kb/s) parsed from FFmpeg's banner output. */
  private async readMediaInfo(
    inputPath: string
  ): Promise<{ durationMs: number | null; bitrateKbps: number | null }> {
    let output = ''
    try {
      await execFileAsync(ffmpegPath!, ['-hide_banner', '-i', inputPath], { maxBuffer: 256 * 1024 })
    } catch (error) {
      output = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : ''
    }
    const duration = output.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/)
    const bitrate = output.match(/bitrate:\s+(\d+)\s*kb\/s/)
    return {
      durationMs: duration
        ? (Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])) * 1000
        : null,
      bitrateKbps: bitrate ? Number(bitrate[1]) : null
    }
  }

  private async readDuration(inputPath: string): Promise<number | null> {
    return (await this.readMediaInfo(inputPath)).durationMs
  }

  private previewFilters(lightweight = false): string {
    // Interactive tools need a responsive proxy, not an export-quality movie.
    // Reducing a HEVC/4K source to 360px at 15fps dramatically shortens the
    // first preview transcode while preserving enough detail for crop/trim UI.
    return lightweight ? `fps=15,scale=w='min(iw,360)':h=-2` : `scale=w='min(iw,960)':h=-2`
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
