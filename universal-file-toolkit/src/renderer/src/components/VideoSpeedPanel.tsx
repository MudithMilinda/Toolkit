import { useEffect, useRef, useState } from 'react'
import { Pause, Play, X } from 'lucide-react'

const speeds = [0.25, 0.5, 1, 1.5, 2, 4]
const formatTime = (seconds: number): string => {
  const safe = Number.isFinite(seconds) ? seconds : 0
  const minutes = Math.floor(safe / 60)
  return `${minutes}:${(safe - minutes * 60).toFixed(2).padStart(5, '0')}`
}

export default function VideoSpeedPanel({
  file,
  statusMessage,
  onCancel,
  onApply
}: {
  file: File
  statusMessage?: string | null
  onCancel: () => void
  onApply: (speed: number) => void
}): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [source, setSource] = useState('')
  const [poster, setPoster] = useState('')
  const [speedIndex, setSpeedIndex] = useState(2)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [slow, setSlow] = useState(false)
  const speed = speeds[speedIndex] ?? 1

  useEffect(() => {
    const inputPath = window.api.getPathForFile(file)
    if (!inputPath) return
    let cancelled = false
    const slowTimer = window.setTimeout(() => !cancelled && setSlow(true), 3000)
    // A poster requires decoding just one frame, whereas a playable browser
    // preview can require a full transcode for large HEVC videos.
    void window.api
      .getVideoPoster(inputPath)
      .then((nextPoster) => !cancelled && setPoster(nextPoster))
      .catch(() => undefined)
    void window.api
      .getVideoSourceUrl(inputPath)
      .then((url) => !cancelled && setSource(url))
      .catch((error: unknown) => {
        if (!cancelled)
          setPreviewError(error instanceof Error ? error.message : 'Unable to load video preview.')
      })
    return () => {
      cancelled = true
      window.clearTimeout(slowTimer)
    }
  }, [file])

  useEffect(() => {
    const video = videoRef.current
    if (video) video.playbackRate = speed
  }, [speed, source])

  const togglePlayback = (): void => {
    const video = videoRef.current
    if (!video) return
    if (video.paused)
      video.play().catch(() => setPreviewError('Unable to play this video preview.'))
    else video.pause()
  }

  return (
    <section
      data-panel
      className="w-[min(520px,calc(100vw-20px))] overflow-hidden rounded-[24px] border border-sky-200/22 bg-[#181818] text-[#f5f5f5] shadow-[0_18px_42px_rgba(0,0,0,.42)]"
    >
      <header className="relative grid h-11 place-items-center border-b border-sky-200/16">
        <button
          type="button"
          aria-label="Close video speed panel"
          className="absolute left-3 grid size-6 place-items-center rounded-full border-0 bg-[#f1f1f1] p-0 text-[#181818] hover:bg-white [&>svg]:size-3"
          onClick={onCancel}
        >
          <X strokeWidth={2.1} />
        </button>
        <h1 className="m-0 text-[15px] font-bold tracking-[-.03em]">Change Video Speed</h1>
      </header>
      <div className="relative flex h-[min(460px,58vh)] w-full items-center justify-center overflow-hidden bg-black">
        {poster && !source && (
          <img
            src={poster}
            className="block h-full max-w-full object-contain"
            alt="Video speed preview"
          />
        )}
        {source && (
          <video
            ref={videoRef}
            className="block h-full w-full object-contain"
            src={source}
            preload="metadata"
            playsInline
            onLoadedMetadata={(event) => {
              const video = event.currentTarget
              setDuration(video.duration)
              video.playbackRate = speed
            }}
            onError={() =>
              setPreviewError('This video format cannot be previewed (codec not supported).')
            }
            onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
        )}
        {!source && !previewError && (
          <span className="absolute bottom-3 rounded-full bg-black/65 px-2 py-1 text-[9px] text-white/64">
            {poster
              ? 'Preparing playable preview…'
              : slow
                ? 'Still preparing video preview, large file…'
                : 'Preparing video preview…'}
          </span>
        )}
        {previewError && (
          <span className="max-w-[80%] text-center text-[11px] text-red-200">{previewError}</span>
        )}
      </div>
      <div className="px-4 pt-4 pb-3.5">
        <div className="flex items-center justify-between text-xs font-semibold text-white/64">
          <span>Playback speed</span>
          <strong className="text-[#f5f5f5]">{speed}×</strong>
        </div>
        <div className="relative mt-3 pb-8">
          <input
            aria-label="Playback speed"
            className="speed-range w-full"
            type="range"
            min="0"
            max={speeds.length - 1}
            step="1"
            value={speedIndex}
            onChange={(event) => setSpeedIndex(Number(event.target.value))}
          />
          <div className="pointer-events-none absolute top-7 right-[9px] left-[9px] text-center text-[10px] text-white/64">
            {speeds.map((option, index) => (
              <span
                key={option}
                className="absolute -translate-x-1/2"
                style={{ left: `${(index / (speeds.length - 1)) * 100}%` }}
              >
                <i className="mx-auto mb-1 block size-1 rounded-full bg-white/45" />
                {option}×
              </span>
            ))}
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between text-white/64">
          <button
            type="button"
            aria-label={playing ? 'Pause preview' : 'Play preview'}
            className="grid size-8 place-items-center rounded-full border-0 bg-[#f1f1f1] p-0 text-[#181818] hover:bg-white [&>svg]:size-[14px]"
            onClick={togglePlayback}
          >
            {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
          </button>
          <span className="text-[10px]">
            {formatTime(current)} / {formatTime(duration)}
          </span>
        </div>
      </div>
      <footer className="flex items-center justify-between border-t border-sky-200/16 px-4 pt-[13px] pb-4">
        {statusMessage && <span className="text-[8px] text-emerald-400">{statusMessage}</span>}
        <button
          className="ml-auto cursor-pointer rounded-full border-0 bg-[#f1f1f1] px-2 py-1 text-[9px] font-semibold text-[#181818] hover:bg-white"
          type="button"
          onClick={() => onApply(speed)}
        >
          Apply
        </button>
      </footer>
    </section>
  )
}
