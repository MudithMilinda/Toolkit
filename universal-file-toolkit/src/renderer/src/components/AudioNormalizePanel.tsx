import { useEffect, useRef, useState } from 'react'
import { Pause, Play, X } from 'lucide-react'
import { motion } from 'motion/react'

const waveformFallback = Array.from({ length: 96 }, () => 0.035)

const Control = ({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix: string
  onChange: (value: number) => void
}): React.JSX.Element => (
  <label className="mt-3 block">
    <span className="mb-1.5 flex justify-between text-[10px] font-semibold text-white/80">
      <span>{label}</span>
      <span>
        {value}
        {suffix}
      </span>
    </span>
    <input
      className="audio-slider block w-full"
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </label>
)

export default function AudioNormalizePanel({
  file,
  statusMessage,
  onCancel,
  onApply
}: {
  file: File
  statusMessage?: string | null
  onCancel: () => void
  onApply: (payload: { targetLufs: number; loudnessRange: number; truePeak: number }) => void
}): React.JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [waveform, setWaveform] = useState<number[]>(waveformFallback)
  const [waveformReady, setWaveformReady] = useState(false)
  const [targetLufs, setTargetLufs] = useState(-16)
  const [loudnessRange, setLoudnessRange] = useState(11)
  const [truePeak, setTruePeak] = useState(-1.5)
  useEffect(() => {
    const inputPath = window.api.getPathForFile(file)
    if (!inputPath) return
    void window.api
      .getAudioSourceUrl(inputPath)
      .then((url) => {
        setAudioUrl(url)
        setIsPreviewLoading(true)
      })
      .catch(() => {
        setPreviewError('Audio preview could not be prepared.')
        setIsPreviewLoading(false)
      })
  }, [file])
  useEffect(() => {
    if (!audioUrl) return
    let cancelled = false
    const readWaveform = async (): Promise<void> => {
      try {
        const response = await fetch(audioUrl)
        const encoded = await response.arrayBuffer()
        const decoder = new OfflineAudioContext(1, 1, 44_100)
        const audioBuffer = await decoder.decodeAudioData(encoded)
        // Every displayed bar represents the same slice of the entire file,
        // so the visual and playhead remain aligned from start to finish.
        const bars = 96
        const samplesPerBar = Math.max(1, Math.floor(audioBuffer.length / bars))
        const peaks = Array.from({ length: bars }, (_, bar) => {
          let sum = 0
          let count = 0
          // Sampling each block is sufficient for the small display while
          // preserving the track's real quiet/loud structure.
          for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
            const channelData = audioBuffer.getChannelData(channel)
            const end = Math.min(channelData.length, (bar + 1) * samplesPerBar)
            for (let sample = bar * samplesPerBar; sample < end; sample += 128) {
              sum += channelData[sample] ** 2
              count += 1
            }
          }
          return Math.sqrt(sum / Math.max(1, count))
        })
        const maximum = Math.max(...peaks, 0.001)
        if (!cancelled) {
          setWaveform(peaks.map((peak) => Math.max(0.035, Math.pow(peak / maximum, 0.6))))
          setWaveformReady(true)
        }
      } catch {
        // Keep the lightweight fallback waveform if decoding is unavailable.
        if (!cancelled) setWaveformReady(true)
      }
    }
    void readWaveform()
    return () => {
      cancelled = true
    }
  }, [audioUrl])
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
    const audio = audioRef.current
    if (!audio) return
    // Native media output is the most reliable preview path in Electron.
    // Negative targets preview quieter; positive gain is applied on export.
    audio.muted = false
    audio.volume = Math.min(1, Math.pow(10, Math.min(0, targetLufs + 16) / 20))
  }, [targetLufs])
  const formatTime = (seconds: number): string => {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
    const minutes = Math.floor(safeSeconds / 60)
    return `${minutes}:${(safeSeconds % 60).toFixed(2).padStart(5, '0')}`
  }
  const togglePlayback = async (): Promise<void> => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return
    audio.muted = false
    audio.volume = Math.min(1, Math.pow(10, Math.min(0, targetLufs + 16) / 20))
    if (audio.paused) await audio.play().catch(() => setIsPlaying(false))
    else audio.pause()
  }
  const closePanel = (): void => {
    audioRef.current?.pause()
    onCancel()
  }
  const playhead = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
  const seekPreview = (event: React.MouseEvent<HTMLDivElement>): void => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const position = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    audio.currentTime = duration * position
    setCurrentTime(audio.currentTime)
  }
  return (
    <motion.form
      data-panel
      className="w-[min(430px,calc(100vw-20px))] overflow-hidden rounded-[20px] border border-sky-200/22 bg-[#181818] text-[#f5f5f5] shadow-[0_18px_42px_rgba(0,0,0,.42)]"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, y: -5 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      onSubmit={(event) => {
        event.preventDefault()
        onApply({ targetLufs, loudnessRange, truePeak })
      }}
    >
      <header className="relative grid h-11 place-items-center border-b border-sky-200/16">
        <button
          type="button"
          className="absolute left-3 grid size-6 place-items-center rounded-full bg-[#f1f1f1] p-0 text-[#181818] hover:bg-white [&>svg]:size-3"
          onClick={closePanel}
          aria-label="Close normalizer"
        >
          <X size={24} strokeWidth={2.4} />
        </button>
        <h1 className="m-0 text-[15px] tracking-[-.04em]">Normalize volume</h1>
      </header>
      <div className="px-4 pt-3 pb-2.5">
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onCanPlay={() => setIsPreviewLoading(false)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onError={() => {
            setPreviewError('Audio preview could not be played.')
            setIsPreviewLoading(false)
          }}
        />
        <div className="flex justify-between gap-3 text-[11px] text-white/64">
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">{file.name}</span>
          <span>Audio</span>
        </div>
        <div
          className="relative mt-3 grid h-[145px] cursor-pointer place-items-center overflow-hidden rounded-xl bg-[#252525]"
          onClick={seekPreview}
          role="slider"
          aria-label="Audio timeline"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
          tabIndex={0}
        >
          <div
            className="flex h-[96px] w-full items-center justify-between px-5"
            aria-hidden="true"
          >
            {waveform.map((peak, index) => (
              <span
                key={index}
                className={`w-[3px] rounded-full transition-[height,opacity] duration-700 ease-out ${waveformReady ? 'opacity-100' : 'opacity-55'} ${index / Math.max(1, waveform.length - 1) <= playhead / 100 ? 'bg-emerald-400' : 'bg-emerald-400/55'}`}
                style={{
                  height: `${Math.round(4 + peak * 86)}px`,
                  transitionDelay: waveformReady ? `${Math.min(index * 7, 420)}ms` : '0ms'
                }}
              />
            ))}
          </div>
          <div
            className="absolute inset-y-0 w-px bg-white/70 shadow-[1px_0_3px_rgba(255,255,255,.4)]"
            style={{ left: `${playhead}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-white/64">
          {isPreviewLoading && !previewError && (
            <span className="flex items-center gap-1.5 text-[9px] text-white/58">
              <i className="size-2 animate-spin rounded-full border border-emerald-400 border-t-transparent" />
              Preparing audio preview…
            </span>
          )}
          {!isPreviewLoading && (
            <button
              type="button"
              className="grid size-6 cursor-pointer place-items-center rounded-full border-0 bg-[#f1f1f1] p-0 text-[#181818] hover:bg-white"
              onClick={() => void togglePlayback()}
              disabled={!audioUrl}
              aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
            >
              {isPlaying ? (
                <Pause size={13} fill="currentColor" />
              ) : (
                <Play size={13} fill="currentColor" />
              )}
            </button>
          )}
          <span className={isPreviewLoading ? 'ml-auto' : ''}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
        {previewError && <p className="m-0 mt-1 text-[9px] text-rose-300">{previewError}</p>}
        <Control
          label="Target loudness"
          value={targetLufs}
          min={-30}
          max={-5}
          suffix=" LUFS"
          onChange={setTargetLufs}
        />
        <Control
          label="Loudness range"
          value={loudnessRange}
          min={1}
          max={20}
          suffix=" LU"
          onChange={setLoudnessRange}
        />
        <Control
          label="True peak limit"
          value={truePeak}
          min={-9}
          max={0}
          step={0.5}
          suffix=" dBTP"
          onChange={setTruePeak}
        />
        <p className="mb-0 mt-4 text-[10px] leading-relaxed text-white/64">
          −16 LUFS is a balanced default for spoken audio and music. The true peak limit helps
          prevent clipping after encoding.
        </p>
      </div>
      <footer className="flex items-center justify-end gap-1.5 border-t border-sky-200/16 px-3 pt-2 pb-2.5">
        {statusMessage && (
          <span className="mr-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[8px] text-emerald-400">
            {statusMessage}
          </span>
        )}
        <button
          type="submit"
          className="cursor-pointer rounded-full border-0 bg-[#f1f1f1] px-2 py-1 text-[9px] font-semibold text-[#181818] hover:bg-white"
        >
          Normalize audio
        </button>
      </footer>
    </motion.form>
  )
}
