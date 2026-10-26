import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, X } from 'lucide-react'
import { motion } from 'motion/react'

const time = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, '0')}`
}

export default function AudioTrimPanel({
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
  const audioRef = useRef<HTMLAudioElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const [source, setSource] = useState('')
  const [duration, setDuration] = useState(0)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null)
  const bars = Array.from({ length: 84 }, (_, index) => 0.28 + ((index * 29) % 58) / 100)
  useEffect(() => {
    const path = window.api.getPathForFile(file)
    const audio = audioRef.current
    if (!path) return
    void window.api.getAudioSourceUrl(path).then(setSource)
    return () => audio?.pause()
  }, [file])
  useEffect(
    () => () => {
      audioRef.current?.pause()
    },
    []
  )
  useEffect(() => {
    const pausePreview = (): void => audioRef.current?.pause()
    const pauseWhenHidden = (): void => {
      if (document.hidden) pausePreview()
    }
    window.addEventListener('blur', pausePreview)
    document.addEventListener('visibilitychange', pauseWhenHidden)
    return () => {
      window.removeEventListener('blur', pausePreview)
      document.removeEventListener('visibilitychange', pauseWhenHidden)
    }
  }, [])
  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = (): void => {
      const audio = audioRef.current
      if (audio) {
        if (end && audio.currentTime >= end) {
          audio.pause()
          audio.currentTime = start
          setCurrent(start)
          return
        }
        setCurrent(audio.currentTime)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, start, end])
  const startPercent = duration ? (start / duration) * 100 : 0
  const endPercent = duration ? (end / duration) * 100 : 100
  const currentPercent = duration ? (current / duration) * 100 : 0
  const setHandleFromPointer = useCallback(
    (kind: 'start' | 'end', clientX: number): void => {
      const bounds = timelineRef.current?.getBoundingClientRect()
      if (!bounds || !duration) return
      const seconds = Math.min(
        duration,
        Math.max(0, ((clientX - bounds.left) / bounds.width) * duration)
      )
      if (kind === 'start') {
        const next = Math.min(seconds, Math.max(0, end - 0.1))
        setStart(next)
        if (current < next) {
          if (audioRef.current) audioRef.current.currentTime = next
          setCurrent(next)
        }
      } else {
        const next = Math.max(seconds, start + 0.1)
        setEnd(next)
        if (current > next) {
          if (audioRef.current) audioRef.current.currentTime = next
          setCurrent(next)
        }
      }
    },
    [current, duration, end, start]
  )
  useEffect(() => {
    if (!dragging) return
    const move = (event: PointerEvent): void => setHandleFromPointer(dragging, event.clientX)
    const up = (): void => setDragging(null)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [dragging, setHandleFromPointer])
  const toggle = (): void => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      if (audio.currentTime < start || audio.currentTime >= end) audio.currentTime = start
      void audio.play()
    } else audio.pause()
  }
  const closePanel = (): void => {
    audioRef.current?.pause()
    onCancel()
  }
  return (
    <motion.form
      data-panel
      className="w-[min(510px,calc(100vw-20px))] overflow-hidden rounded-[20px] border border-sky-200/22 bg-[#181818] text-[#f5f5f5] shadow-[0_18px_42px_rgba(0,0,0,.42)]"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      onSubmit={(event) => {
        event.preventDefault()
        onApply({ startSeconds: start, endSeconds: end || duration })
      }}
    >
      <header className="relative grid h-11 place-items-center border-b border-sky-200/16">
        <button
          type="button"
          onClick={closePanel}
          className="absolute left-3 grid size-6 place-items-center rounded-full border-0 bg-[#f1f1f1] text-[#181818]"
        >
          <X size={15} />
        </button>
        <h1 className="m-0 text-[15px]">Trim audio</h1>
      </header>
      <div className="p-4">
        <audio
          ref={audioRef}
          src={source}
          preload="metadata"
          onLoadedMetadata={(event) => {
            setDuration(event.currentTarget.duration)
            setEnd(event.currentTarget.duration)
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        />
        <div className="mb-2 flex justify-between text-[10px] text-white/64">
          <span>Drag the ends to trim</span>
          <span>{time(Math.max(0, end - start))} selected</span>
        </div>
        <div
          ref={timelineRef}
          className="relative h-[136px] overflow-hidden rounded-xl bg-[#252525]"
        >
          <div
            className="absolute inset-y-0 left-0 bg-black/45"
            style={{ width: `${startPercent}%` }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-black/45"
            style={{ left: `${endPercent}%` }}
          />
          <div
            className="absolute inset-y-3 flex w-full items-center justify-between px-4"
            aria-hidden="true"
          >
            {bars.map((height, index) => (
              <i
                key={index}
                className="w-[3px] rounded-full bg-emerald-400/80"
                style={{ height: `${height * 86}px` }}
              />
            ))}
          </div>
          <div
            className="absolute inset-y-0 border-x-[3px] border-emerald-400"
            style={{ left: `${startPercent}%`, right: `${100 - endPercent}%` }}
          />
          <div
            className="absolute inset-y-0 z-1 w-px bg-white/75"
            style={{ left: `${currentPercent}%` }}
          />
          <button
            type="button"
            aria-label="Trim start"
            onPointerDown={(event) => {
              event.preventDefault()
              setDragging('start')
              setHandleFromPointer('start', event.clientX)
            }}
            className="absolute inset-y-0 z-3 w-3 -translate-x-1/2 cursor-ew-resize rounded-l-md bg-emerald-500 shadow-[inset_-1px_0_0_rgba(255,255,255,.7)]"
            style={{ left: `${startPercent}%` }}
          >
            <i className="mx-auto block h-8 w-[2px] rounded-full bg-white" />
          </button>
          <button
            type="button"
            aria-label="Trim end"
            onPointerDown={(event) => {
              event.preventDefault()
              setDragging('end')
              setHandleFromPointer('end', event.clientX)
            }}
            className="absolute inset-y-0 z-3 w-3 -translate-x-1/2 cursor-ew-resize rounded-r-md bg-emerald-500 shadow-[inset_1px_0_0_rgba(255,255,255,.7)]"
            style={{ left: `${endPercent}%` }}
          >
            <i className="mx-auto block h-8 w-[2px] rounded-full bg-white" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-white/64">
          <button
            type="button"
            onClick={toggle}
            className="grid size-7 place-items-center rounded-full border-0 bg-[#f1f1f1] text-[#181818]"
          >
            {playing ? (
              <Pause size={14} fill="currentColor" />
            ) : (
              <Play size={14} fill="currentColor" />
            )}
          </button>
          <span>Start {time(start)}</span>
          <span>End {time(end)}</span>
        </div>
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-sky-200/16 px-3 py-2.5">
        {statusMessage && (
          <span className="mr-auto text-[8px] text-emerald-400">{statusMessage}</span>
        )}
        <button
          type="submit"
          className="rounded-full border-0 bg-[#f1f1f1] px-2 py-1 text-[9px] font-semibold text-[#181818]"
        >
          Trim audio
        </button>
      </footer>
    </motion.form>
  )
}
