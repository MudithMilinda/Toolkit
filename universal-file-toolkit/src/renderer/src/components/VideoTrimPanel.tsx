import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, X } from 'lucide-react'
import { motion } from 'motion/react'

const time = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds - minutes * 60
  return `${minutes}:${remainder.toFixed(2).padStart(5, '0')}`
}

export default function VideoTrimPanel({
  file,
  statusMessage,
  onCancel,
  onApply
}: {
  file: File
  statusMessage?: string | null
  onCancel: () => void
  onApply: (range: { startSeconds: number; endSeconds: number }) => void
}): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const [source, setSource] = useState('')
  const [poster, setPoster] = useState('')
  const [duration, setDuration] = useState(0)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [frames, setFrames] = useState<string[]>([])
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [scrubbing, setScrubbing] = useState(false)
  // width / height of the video (default landscape 16:9)
  const [aspect, setAspect] = useState(16 / 9)

  useEffect(() => {
    const inputPath = window.api.getPathForFile(file)
    setSource('')
    setPoster('')
    setFrames([])
    setPreviewError(null)
    setDuration(0)
    setStart(0)
    setEnd(0)
    setAspect(16 / 9)
    if (!inputPath) return
    let cancelled = false
    // Poster and playable preview are prepared in parallel, so the preview
    // does not have to wait for the poster to finish.
    void window.api
      .getVideoPoster(inputPath)
      .then((nextPoster) => {
        if (cancelled) return
        setPoster(nextPoster)
        // Never overwrite real timeline frames if they were captured first.
        setFrames((previous) =>
          previous.length ? previous : Array.from({ length: 16 }, () => nextPoster)
        )
      })
      .catch(() => undefined)
    void window.api
      .getVideoSourceUrl(inputPath)
      .then((url) => {
        if (!cancelled) setSource(url)
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setPreviewError(error instanceof Error ? error.message : 'Unable to load video preview.')
      })
    return () => {
      cancelled = true
    }
  }, [file])

  const createTimelineFrames = (video: HTMLVideoElement, videoDuration: number): void => {
    const sampler = document.createElement('video')
    sampler.src = video.currentSrc
    sampler.muted = true
    sampler.preload = 'auto'
    const capture = async (): Promise<void> => {
      const canvas = document.createElement('canvas')
      const sourceWidth = sampler.videoWidth || video.videoWidth
      const sourceHeight = sampler.videoHeight || video.videoHeight
      const frameAspect = sourceWidth / sourceHeight
      canvas.height = 96
      canvas.width = Math.max(1, Math.round(96 * frameAspect))
      // enough frames to fill the strip without stretching them
      const stripWidth = timelineRef.current?.clientWidth ?? 440
      const count = Math.min(40, Math.max(6, Math.ceil(stripWidth / (52 * frameAspect))))
      const context = canvas.getContext('2d')
      if (!context) return
      const nextFrames: string[] = []
      for (let index = 0; index < count; index += 1) {
        const frameTime = Math.min(videoDuration - 0.03, (videoDuration * index) / count)
        await new Promise<void>((resolve) => {
          sampler.onseeked = () => resolve()
          sampler.currentTime = Math.max(0, frameTime)
        })
        context.drawImage(sampler, 0, 0, canvas.width, canvas.height)
        nextFrames.push(canvas.toDataURL('image/jpeg', 0.64))
      }
      setFrames(nextFrames)
    }
    sampler.onloadedmetadata = () => void capture()
  }

  const isPortrait = aspect < 1
  const previewBoxStyle = useMemo(
    () =>
      isPortrait
        ? { aspectRatio: String(aspect), height: 'min(52vh, 440px)', maxWidth: '100%' }
        : { aspectRatio: String(aspect), width: '100%', maxHeight: 'min(52vh, 440px)' },
    [aspect, isPortrait]
  )

  const selected = Math.max(0, end - start)
  const seek = (next: number): void => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.min(end || duration, Math.max(start, next))
    setCurrent(video.currentTime)
  }
  const togglePlayback = (): void => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      if (video.currentTime < start || video.currentTime >= end) video.currentTime = start
      video.play().catch(() => setPreviewError('Unable to play this video in the trim panel.'))
    } else video.pause()
  }

  // Smooth playhead: update every animation frame while playing
  // (the video's own timeupdate event only fires ~4 times per second).
  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = (): void => {
      const video = videoRef.current
      if (video) {
        if (end > 0 && video.currentTime >= end) {
          video.pause()
          video.currentTime = start
          setCurrent(start)
          return
        }
        setCurrent(video.currentTime)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, start, end])
  const scrubToPointer = (clientX: number): void => {
    const timeline = timelineRef.current
    if (!timeline || !duration) return
    const bounds = timeline.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
    seek(ratio * duration)
  }

  return (
    <motion.form
      data-panel
      className="w-[min(560px,calc(100vw-20px))] overflow-hidden rounded-[24px] border border-sky-200/22 bg-[#181818] text-[#f5f5f5] shadow-[0_18px_42px_rgba(0,0,0,.42)]"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, y: -5 }}
      onSubmit={(event) => {
        event.preventDefault()
        onApply({ startSeconds: start, endSeconds: end || duration })
      }}
    >
      <header className="relative grid h-11 place-items-center border-b border-sky-200/16">
        <button
          type="button"
          className="absolute left-3 grid size-6 place-items-center rounded-full bg-[#f1f1f1] p-0 text-[#181818] hover:bg-white [&>svg]:size-3"
          onClick={onCancel}
          aria-label="Close video trimmer"
        >
          <X size={24} strokeWidth={2.4} />
        </button>
        <h1 className="m-0 text-[15px] tracking-[-.04em]">Trim video</h1>
      </header>
      <div className="p-4">
        <div className="flex justify-center overflow-hidden rounded-[15px] bg-black">
          <div className="relative grid place-items-center" style={previewBoxStyle}>
            {!source && poster && (
              <img
                className="size-full"
                style={{ objectFit: 'contain' }}
                src={poster}
                alt="Video preview"
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget
                  if (naturalWidth && naturalHeight) setAspect(naturalWidth / naturalHeight)
                }}
              />
            )}
            {source && (
              <video
                ref={videoRef}
                className="size-full"
                style={{ objectFit: 'contain' }}
                src={source}
                onLoadedMetadata={(event) => {
                  const video = event.currentTarget
                  const next = video.duration
                  if (video.videoWidth && video.videoHeight) {
                    setAspect(video.videoWidth / video.videoHeight)
                  }
                  setDuration(next)
                  setEnd(next)
                  createTimelineFrames(video, next)
                }}
                onTimeUpdate={(event) => {
                  const next = event.currentTarget.currentTime
                  setCurrent(next)
                  if (next >= end && end > 0) {
                    event.currentTarget.pause()
                    event.currentTarget.currentTime = start
                  }
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onError={(event) => {
                  const detail = event.currentTarget.error
                  console.error('Video preview error', detail?.code, detail?.message, source)
                  setPreviewError(
                    `This video format cannot be previewed in the trim panel.${
                      detail?.message ? ` (${detail.message})` : ''
                    }`
                  )
                }}
              />
            )}
            {previewError && (
              <p className="absolute px-6 text-center text-[11px] text-rose-300">
                {previewError}
              </p>
            )}
            {!source && !previewError && poster && (
              <p className="absolute bottom-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] text-white/80">
                Preparing preview…
              </p>
            )}
            {!source && !previewError && !poster && (
              <p className="absolute px-6 text-center text-[11px] text-white/64">
                Loading video preview…
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 flex justify-between text-[10px] text-white/64">
          <span>Drag the ends to trim</span>
          <span>{time(selected)} selected</span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-[#f1f1f1] p-0 text-[#181818] hover:bg-white"
            onClick={togglePlayback}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <Pause size={16} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" />
            )}
          </button>
          <div className="relative min-w-0 flex-1 pt-2 pb-3">
            <div
              ref={timelineRef}
              className="relative h-14 overflow-hidden rounded-[10px] border-2 border-[#f1f1f1] bg-[#252525]"
            >
              <div className="absolute inset-0 flex overflow-hidden">
                {frames.map((frame, index) => (
                  <img
                    className="h-full min-w-0 flex-1 object-cover"
                    src={frame}
                    alt=""
                    key={`${index}-${frame.slice(-12)}`}
                  />
                ))}
              </div>
              {!frames.length && <div className="absolute inset-0 animate-pulse bg-white/8" />}
              <div
                className="pointer-events-none absolute inset-y-0 left-0 z-1 bg-black/55"
                style={{ width: `${duration ? (start / duration) * 100 : 0}%` }}
              />
              <div
                className="pointer-events-none absolute inset-y-0 right-0 z-1 bg-black/55"
                style={{
                  width: `${duration ? ((duration - (end || duration)) / duration) * 100 : 0}%`
                }}
              />
              <div
                className="absolute inset-0 z-2 cursor-ew-resize"
                onPointerDown={(event) => {
                  setScrubbing(true)
                  event.currentTarget.setPointerCapture(event.pointerId)
                  scrubToPointer(event.clientX)
                }}
                onPointerMove={(event) => {
                  if (scrubbing) scrubToPointer(event.clientX)
                }}
                onPointerUp={(event) => {
                  setScrubbing(false)
                  event.currentTarget.releasePointerCapture(event.pointerId)
                }}
              />
              <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-3 rounded-full bg-black/65 px-1.5 py-px text-[9px] font-semibold text-white">
                {Math.round(selected)}s
              </span>
              <input
                aria-label="Trim start"
                className="trim-range absolute inset-x-1 top-1/2 z-5 -translate-y-1/2"
                type="range"
                min="0"
                max={duration || 1}
                step="0.01"
                value={start}
                onChange={(event) => {
                  const next = Math.min(Number(event.target.value), end - 0.05)
                  setStart(Math.max(0, next))
                  seek(next)
                }}
              />
              <input
                aria-label="Trim end"
                className="trim-range absolute inset-x-1 top-1/2 z-6 -translate-y-1/2"
                type="range"
                min="0"
                max={duration || 1}
                step="0.01"
                value={end}
                onChange={(event) => {
                  const next = Math.max(Number(event.target.value), start + 0.05)
                  setEnd(Math.min(duration, next))
                  seek(next)
                }}
              />
            </div>
            <div
              className="pointer-events-none absolute inset-y-0 z-10 flex w-3 -translate-x-1/2 flex-col items-center"
              style={{ left: `${duration ? (current / duration) * 100 : 0}%` }}
            >
              <div className="h-2.5 w-3 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,.35)]" />
              <div className="w-[2px] flex-1 bg-white shadow-[0_0_0_1px_rgba(0,0,0,.35)]" />
            </div>
          </div>
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-white/64">
          <span>Start {time(start)}</span>
          <span>
            {time(current)} / {time(duration)}
          </span>
          <span>End {time(end || duration)}</span>
        </div>
      </div>
      <footer className="flex items-center justify-end gap-1.5 border-t border-sky-200/16 px-3 pt-2 pb-2.5">
        {statusMessage && (
          <span className="mr-auto text-[8px] text-emerald-400">{statusMessage}</span>
        )}
        <button
          className="cursor-pointer rounded-full border-0 bg-[#f1f1f1] px-2 py-1 text-[8px] font-semibold text-[#181818] hover:bg-white"
          type="button"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          className="cursor-pointer rounded-full border-0 bg-[#f1f1f1] px-2 py-1 text-[8px] font-semibold text-[#181818] hover:bg-white disabled:opacity-50"
          type="submit"
          disabled={selected < 0.05}
        >
          Apply
        </button>
      </footer>
    </motion.form>
  )
}