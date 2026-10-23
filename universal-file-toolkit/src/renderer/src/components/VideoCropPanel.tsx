import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Pause, Play, X } from 'lucide-react'
import { motion } from 'motion/react'

type CropArea = { left: number; top: number; width: number; height: number }
type Handle = 'move' | 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const ratios = [
  { label: 'Free', value: 0 },
  { label: '1:1', value: 1 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 }
]
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)
const even = (value: number): number => Math.max(2, Math.floor(value / 2) * 2)
const formatTime = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`

function defaultCrop(width: number, height: number, ratio = 0): CropArea {
  if (!ratio)
    return {
      left: even(width * 0.1),
      top: even(height * 0.1),
      width: even(width * 0.8),
      height: even(height * 0.8)
    }
  let cropWidth = width * 0.8
  let cropHeight = cropWidth / ratio
  if (cropHeight > height * 0.8) {
    cropHeight = height * 0.8
    cropWidth = cropHeight * ratio
  }
  return {
    left: even((width - cropWidth) / 2),
    top: even((height - cropHeight) / 2),
    width: even(cropWidth),
    height: even(cropHeight)
  }
}

export default function VideoCropPanel({
  file,
  onCancel,
  onApply,
  isProcessing = false,
  statusMessage
}: {
  file: File
  onCancel: () => void
  onApply: (area: CropArea) => void
  isProcessing?: boolean
  statusMessage?: string | null
}): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ handle: Handle; startX: number; startY: number; crop: CropArea } | null>(
    null
  )
  const [source, setSource] = useState('')
  const [poster, setPoster] = useState('')
  const [frames, setFrames] = useState<string[]>([])
  const [previewFailed, setPreviewFailed] = useState(false)
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 })
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 })
  const [crop, setCrop] = useState<CropArea>({ left: 0, top: 0, width: 0, height: 0 })
  const [ratio, setRatio] = useState(0)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [isPreviewReady, setIsPreviewReady] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const isPreviewLoading = !poster && !isPreviewReady && !previewFailed

  useEffect(() => {
    const inputPath = window.api.getPathForFile(file)
    if (!inputPath) return
    void window.api
      .getVideoPoster(inputPath)
      .then((nextPoster) => {
        setPoster(nextPoster)
        setFrames(Array.from({ length: 14 }, () => nextPoster))
      })
      .catch(() => undefined)
    void window.api
      .getVideoSourceUrl(inputPath)
      .then(setSource)
      .catch(() => setPreviewFailed(true))
  }, [file])
  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return
    const update = (): void =>
      setPreviewSize({ width: preview.clientWidth, height: preview.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(preview)
    return () => observer.disconnect()
  }, [])
  const display = useMemo(() => {
    if (!videoSize.width || !previewSize.width) return { width: 0, height: 0, left: 0, top: 0 }
    const scale = Math.min(
      previewSize.width / videoSize.width,
      previewSize.height / videoSize.height
    )
    const width = videoSize.width * scale
    const height = videoSize.height * scale
    return {
      width,
      height,
      left: (previewSize.width - width) / 2,
      top: (previewSize.height - height) / 2
    }
  }, [videoSize, previewSize])
  const frameStyle = videoSize.width
    ? {
        left: `${display.left + (crop.left / videoSize.width) * display.width}px`,
        top: `${display.top + (crop.top / videoSize.height) * display.height}px`,
        width: `${(crop.width / videoSize.width) * display.width}px`,
        height: `${(crop.height / videoSize.height) * display.height}px`
      }
    : undefined
  const updateCrop = useCallback(
    (next: CropArea): void => {
      const width = even(clamp(next.width, 2, videoSize.width))
      const height = even(clamp(next.height, 2, videoSize.height))
      setCrop({
        left: even(clamp(next.left, 0, videoSize.width - width)),
        top: even(clamp(next.top, 0, videoSize.height - height)),
        width,
        height
      })
    },
    [videoSize]
  )
  const selectRatio = (nextRatio: number): void => {
    setRatio(nextRatio)
    if (videoSize.width) setCrop(defaultCrop(videoSize.width, videoSize.height, nextRatio))
  }
  const beginDrag = (event: PointerEvent<HTMLElement>, handle: Handle): void => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { handle, startX: event.clientX, startY: event.clientY, crop }
  }
  const drag = (event: PointerEvent<HTMLElement>): void => {
    const active = dragRef.current
    if (!active || !display.width) return
    const dx = ((event.clientX - active.startX) * videoSize.width) / display.width
    const dy = ((event.clientY - active.startY) * videoSize.height) / display.height
    const base = active.crop
    if (active.handle === 'move')
      return updateCrop({
        ...base,
        left: clamp(base.left + dx, 0, videoSize.width - base.width),
        top: clamp(base.top + dy, 0, videoSize.height - base.height)
      })
    let left = base.left,
      top = base.top,
      width = base.width,
      height = base.height
    if (active.handle.includes('e')) width = clamp(base.width + dx, 24, videoSize.width - base.left)
    if (active.handle.includes('s'))
      height = clamp(base.height + dy, 24, videoSize.height - base.top)
    if (active.handle.includes('w')) {
      left = clamp(base.left + dx, 0, base.left + base.width - 24)
      width = base.width + base.left - left
    }
    if (active.handle.includes('n')) {
      top = clamp(base.top + dy, 0, base.top + base.height - 24)
      height = base.height + base.top - top
    }
    if (ratio) {
      if (active.handle === 'e' || active.handle === 'w') height = width / ratio
      else width = height * ratio
      if (active.handle.includes('w')) left = base.left + base.width - width
      if (active.handle.includes('n')) top = base.top + base.height - height
      if (left < 0) {
        width += left
        height = width / ratio
        left = 0
      }
      if (top < 0) {
        height += top
        width = height * ratio
        top = 0
      }
      if (left + width > videoSize.width) {
        width = videoSize.width - left
        height = width / ratio
      }
      if (top + height > videoSize.height) {
        height = videoSize.height - top
        width = height * ratio
      }
    }
    updateCrop({ left, top, width, height })
  }
  const setDimension = (field: 'width' | 'height', raw: string): void => {
    const value = Number(raw.replace(/\D/g, ''))
    if (!value) return
    const next = { ...crop, [field]: value }
    if (ratio) {
      if (field === 'width') next.height = Math.round(value / ratio)
      else next.width = Math.round(value * ratio)
    }
    updateCrop(next)
  }
  const togglePlayback = (): void => {
    const video = videoRef.current
    if (!video || !isPreviewReady) return
    if (video.paused) void video.play()
    else video.pause()
  }
  const scrubToPointer = (clientX: number): void => {
    const timeline = timelineRef.current
    if (!timeline || !duration) return
    const bounds = timeline.getBoundingClientRect()
    const next = clamp((clientX - bounds.left) / bounds.width, 0, 1) * duration
    if (videoRef.current) videoRef.current.currentTime = next
    setCurrent(next)
  }

  return (
    <motion.section
      data-panel
      className="w-[min(520px,calc(100vw-20px))] overflow-hidden rounded-[24px] border border-sky-200/22 bg-[#181818] text-[#f5f5f5] shadow-[0_18px_42px_rgba(0,0,0,.42)]"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, y: -5 }}
    >
      <header className="relative grid h-11 place-items-center border-b border-sky-200/16">
        <button
          className="absolute left-3 grid size-6 place-items-center rounded-full border-0 bg-[#f1f1f1] p-0 text-[#181818] hover:bg-white [&>svg]:size-3"
          onClick={onCancel}
          aria-label="Close video crop editor"
        >
          <X size={24} strokeWidth={2.4} />
        </button>
        <h1 className="m-0 text-[15px] font-bold tracking-[-.03em]">Crop Video</h1>
      </header>
      <div ref={previewRef} className="relative h-[280px] overflow-hidden bg-black touch-none">
        {isPreviewLoading && (
          <div className="absolute inset-0 z-3 grid place-items-center bg-[#181818] text-center text-[11px] text-white/64">
            Preparing crop preview…
            <br />
            Please wait
          </div>
        )}
        {poster && (!source || previewFailed) && (
          <img
            src={poster}
            className="absolute inset-0 size-full object-contain"
            alt="Video crop preview"
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget
              setVideoSize({ width: naturalWidth, height: naturalHeight })
              setCrop(defaultCrop(naturalWidth, naturalHeight))
            }}
          />
        )}
        {source && !previewFailed && (
          <video
            ref={videoRef}
            src={source}
            className="absolute inset-0 size-full object-contain"
            onLoadedMetadata={(event) => {
              const video = event.currentTarget
              setVideoSize({ width: video.videoWidth, height: video.videoHeight })
              setCrop(defaultCrop(video.videoWidth, video.videoHeight))
              setDuration(video.duration)
            }}
            onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onCanPlay={() => setIsPreviewReady(true)}
            onError={() => setPreviewFailed(true)}
          />
        )}
        {crop.width > 0 && (
          <div
            className="absolute z-1 min-h-3 min-w-3 cursor-move border-[3px] border-white shadow-[0_0_0_100vmax_rgba(0,0,0,.46)] touch-none"
            style={frameStyle}
            onPointerDown={(event) => beginDrag(event, 'move')}
            onPointerMove={drag}
            onPointerUp={() => {
              dragRef.current = null
            }}
          >
            <span className="pointer-events-none absolute inset-y-0 left-1/3 right-1/3 border-x border-white/38" />
            <span className="pointer-events-none absolute inset-x-0 top-1/3 bottom-1/3 border-y border-white/38" />
            {(['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'] as Handle[]).map((handle) => (
              <button
                key={handle}
                className={`absolute z-2 size-[13px] rounded-[3px] border-0 bg-white p-0 ${handle === 'n' ? 'left-1/2 top-[-8px] ml-[-6.5px] cursor-ns-resize' : handle === 's' ? 'bottom-[-8px] left-1/2 ml-[-6.5px] cursor-ns-resize' : handle === 'e' ? 'right-[-8px] top-1/2 mt-[-6.5px] cursor-ew-resize' : handle === 'w' ? 'left-[-8px] top-1/2 mt-[-6.5px] cursor-ew-resize' : handle === 'ne' ? 'right-[-8px] top-[-8px] cursor-nesw-resize' : handle === 'nw' ? 'left-[-8px] top-[-8px] cursor-nwse-resize' : handle === 'se' ? 'right-[-8px] bottom-[-8px] cursor-nwse-resize' : 'bottom-[-8px] left-[-8px] cursor-nesw-resize'}`}
                aria-label={`Resize crop ${handle}`}
                onPointerDown={(event) => beginDrag(event, handle)}
                onPointerMove={drag}
                onPointerUp={() => {
                  dragRef.current = null
                }}
              />
            ))}
          </div>
        )}
      </div>
      <div className="px-4 pt-4 pb-3.5">
        <span className="mb-[9px] ml-0.5 block text-xs font-semibold text-white/64">
          Aspect ratio
        </span>
        <div className="flex gap-1" role="group" aria-label="Aspect ratio">
          {ratios.map((item) => (
            <button
              key={item.label}
              className={`min-w-0 flex-1 cursor-pointer rounded-full border-0 px-0.5 py-1 text-[9px] font-semibold text-[#181818] ${ratio === item.value ? 'bg-emerald-500 text-white' : 'bg-[#f1f1f1] hover:bg-white'}`}
              onClick={() => selectRatio(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-white/64">
          <label>
            W{' '}
            <input
              className="ml-1 h-7 w-20 rounded-[7px] border border-sky-200/22 bg-[#252525] px-2 text-[11px] text-[#f5f5f5]"
              inputMode="numeric"
              value={crop.width || ''}
              onChange={(event) => setDimension('width', event.target.value)}
            />
          </label>
          <label>
            H{' '}
            <input
              className="ml-1 h-7 w-20 rounded-[7px] border border-sky-200/22 bg-[#252525] px-2 text-[11px] text-[#f5f5f5]"
              inputMode="numeric"
              value={crop.height || ''}
              onChange={(event) => setDimension('height', event.target.value)}
            />
          </label>
          <span>px</span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            className="grid size-8 place-items-center rounded-full border-0 bg-[#f1f1f1] text-[#181818] disabled:cursor-wait disabled:opacity-45"
            onClick={togglePlayback}
            aria-label={playing ? 'Pause' : 'Play'}
            disabled={!isPreviewReady}
          >
            {playing ? (
              <Pause size={14} fill="currentColor" />
            ) : (
              <Play size={14} fill="currentColor" />
            )}
          </button>
          <div className="relative min-w-0 flex-1 pt-2 pb-3">
            <div
              ref={timelineRef}
              className={`relative h-12 overflow-hidden rounded-[9px] border-2 border-[#f1f1f1] bg-[#252525] ${isPreviewReady ? 'cursor-ew-resize' : 'cursor-wait opacity-60'}`}
              onPointerDown={(event) => {
                if (!isPreviewReady) return
                event.preventDefault()
                setIsScrubbing(true)
                event.currentTarget.setPointerCapture(event.pointerId)
                scrubToPointer(event.clientX)
              }}
              onPointerMove={(event) => {
                if (isScrubbing) scrubToPointer(event.clientX)
              }}
              onPointerUp={(event) => {
                setIsScrubbing(false)
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId)
                }
              }}
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
            </div>
            <div
              className="pointer-events-none absolute inset-y-0 z-2 flex w-3 -translate-x-1/2 flex-col items-center"
              style={{ left: `${duration ? (current / duration) * 100 : 0}%` }}
            >
              <div className="h-2.5 w-3 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,.35)]" />
              <div className="w-[2px] flex-1 bg-white shadow-[0_0_0_1px_rgba(0,0,0,.35)]" />
            </div>
          </div>
        </div>
        <div className="mt-[-6px] text-right text-[10px] text-white/64">
          {isPreviewReady
            ? `${formatTime(current)} / ${formatTime(duration)}`
            : 'Preparing video preview… Please wait'}
        </div>
      </div>
      <footer className="flex items-center justify-between border-t border-sky-200/16 px-4 pt-[13px] pb-4">
        {statusMessage && <span className="text-[8px] text-emerald-400">{statusMessage}</span>}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            className="cursor-pointer rounded-full border-0 bg-[#f1f1f1] px-2 py-1 text-[9px] font-semibold text-[#181818] hover:bg-white"
            onClick={() => selectRatio(ratio)}
          >
            Reset
          </button>
          <button
            className="cursor-pointer rounded-full border-0 bg-[#f1f1f1] px-2 py-1 text-[9px] font-semibold text-[#181818] hover:bg-white disabled:opacity-45"
            disabled={!crop.width || isProcessing || isPreviewLoading}
            onClick={() => onApply(crop)}
          >
            {isProcessing ? 'Cropping…' : 'Apply'}
          </button>
        </div>
      </footer>
    </motion.section>
  )
}
