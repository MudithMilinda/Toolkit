import { useEffect, useRef, useState } from 'react'
import { Play, X } from 'lucide-react'
import { motion } from 'motion/react'

const time = (value: number): string =>
  `${Math.floor(value / 60)}:${(value % 60).toFixed(2).padStart(5, '0')}`

export default function AudioBleepPanel({
  file,
  onCancel,
  onSave
}: {
  file: File
  onCancel: () => void
  onSave: (range: { startSeconds: number; endSeconds: number }) => Promise<void>
}): React.JSX.Element {
  const timelineRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [source, setSource] = useState('')
  const [playing, setPlaying] = useState(false)
  const [withBleeps, setWithBleeps] = useState(true)
  const [current, setCurrent] = useState(0)
  const beepContext = useRef<AudioContext | null>(null)
  const lastBeep = useRef(0)
  const [duration] = useState(120)
  const [range, setRange] = useState({ startSeconds: 28, endSeconds: 52 })
  const [anchor, setAnchor] = useState<number | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [percent, setPercent] = useState(0)
  useEffect(() => {
    const inputPath = window.api.getPathForFile(file)
    if (inputPath) void window.api.getAudioSourceUrl(inputPath).then(setSource)
    return () => audioRef.current?.pause()
  }, [file])
  useEffect(() => {
    const pause = (): void => audioRef.current?.pause()
    window.addEventListener('blur', pause)
    return () => {
      window.removeEventListener('blur', pause)
      pause()
    }
  }, [])
  const closePanel = (): void => {
    audioRef.current?.pause()
    onCancel()
  }
  const position = (clientX: number): number => {
    const bounds = timelineRef.current?.getBoundingClientRect()
    if (!bounds) return 0
    return Math.min(duration, Math.max(0, ((clientX - bounds.left) / bounds.width) * duration))
  }
  const bars = Array.from({ length: 88 }, (_, index) => 0.25 + ((index * 19) % 62) / 100)
  const left = (range.startSeconds / duration) * 100
  const width = ((range.endSeconds - range.startSeconds) / duration) * 100
  const currentPercent = (current / duration) * 100
  useEffect(() => {
    const inBleep = withBleeps && current >= range.startSeconds && current <= range.endSeconds
    if (audioRef.current) audioRef.current.volume = inBleep ? 0 : 1
    if (!playing || !inBleep) return
    const now = performance.now()
    if (now - lastBeep.current < 360) return
    lastBeep.current = now
    const context = beepContext.current ?? new AudioContext()
    beepContext.current = context
    void context.resume()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 1000
    gain.gain.value = 0.16
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.11)
  }, [current, playing, range, withBleeps])
  return (
    <motion.form
      data-panel
      className="w-[min(510px,calc(100vw-20px))] overflow-hidden rounded-[20px] border border-sky-200/22 bg-[#181818] text-[#f5f5f5] shadow-[0_18px_42px_rgba(0,0,0,.42)]"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      onSubmit={(event) => {
        event.preventDefault()
        if (saveState === 'saving') return
        setSaveState('saving')
        setPercent(4)
        const timer = window.setInterval(() => setPercent((value) => Math.min(94, value + 6)), 250)
        void onSave(range)
          .then(() => {
            window.clearInterval(timer)
            setPercent(100)
            setSaveState('saved')
          })
          .catch(() => {
            window.clearInterval(timer)
            setPercent(0)
            setSaveState('idle')
          })
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
        <h1 className="m-0 text-[15px]">Bleep audio</h1>
      </header>
      <div className="p-4">
        <audio
          ref={audioRef}
          src={source}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        />
        <div className="mb-3 flex justify-between text-[11px] text-white/64">
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">{file.name}</span>
          <span>Bleeps&nbsp; 1</span>
        </div>
        <div className="mb-1 text-[10px] font-semibold text-white/70">Bleep</div>
        <div
          ref={timelineRef}
          className="relative h-[58px] cursor-crosshair overflow-hidden rounded-t-xl bg-[#252525]"
          onPointerDown={(event) => {
            setAnchor(position(event.clientX))
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            if (anchor === null) return
            const next = position(event.clientX)
            setRange({
              startSeconds: Math.min(anchor, next),
              endSeconds: Math.max(anchor + 0.2, next)
            })
          }}
          onPointerUp={() => setAnchor(null)}
        >
          <div
            className="absolute inset-y-0 rounded-lg bg-emerald-500/90 px-3 text-center text-[11px] font-semibold leading-[58px] text-[#181818]"
            style={{ left: `${left}%`, width: `${width}%` }}
          >
            Bleep
          </div>
        </div>
        <div className="mb-1 text-[10px] font-semibold text-white/70">Audio</div>
        <div className="relative h-[110px] overflow-hidden rounded-b-xl bg-[#252525]">
          <div className="absolute inset-0 flex items-center justify-between px-4">
            {bars.map((height, index) => (
              <i
                key={index}
                className="w-[3px] rounded-full bg-emerald-400/80"
                style={{ height: `${height * 78}px` }}
              />
            ))}
          </div>
          <div
            className="absolute inset-y-0 border-x-2 border-emerald-400/80"
            style={{ left: `${left}%`, right: `${100 - left - width}%` }}
          />
          <div
            className="absolute inset-y-0 z-2 w-px bg-white/80"
            style={{ left: `${currentPercent}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-white/64">
          <span>{time(0)}</span>
          <span>{time(duration)}</span>
        </div>
        <p className="mb-0 mt-4 text-[10px] leading-relaxed text-white/64">
          Drag across the Bleep layer to add or adjust the section. The selected part will be
          replaced with a bleep tone.
        </p>
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-sky-200/16 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setWithBleeps((enabled) => !enabled)}
          className="rounded-full border-0 bg-[#252525] px-2 py-1 text-[9px] text-white/75"
        >
          {withBleeps ? 'With bleeps' : 'Original'}
        </button>
        <button
          type="button"
          onClick={() => {
            const audio = audioRef.current
            if (!audio || !source) return
            if (audio.paused) void audio.play()
            else audio.pause()
          }}
          className="flex items-center gap-1 rounded-full border-0 bg-[#252525] px-2 py-1 text-[9px] text-white/75"
        >
          <Play size={10} fill="currentColor" /> {playing ? 'Pause' : 'Preview'}
        </button>
        <button
          type="submit"
          className="rounded-full border-0 bg-[#f1f1f1] px-2 py-1 text-[9px] font-semibold text-[#181818]"
        >
          {saveState === 'saving'
            ? `Saving ${percent}%`
            : saveState === 'saved'
              ? 'Saved'
              : 'Save bleeped copy'}
        </button>
      </footer>
    </motion.form>
  )
}
