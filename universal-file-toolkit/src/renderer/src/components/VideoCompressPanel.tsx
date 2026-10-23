import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'

type VideoSize = 'original' | '1920' | '1280' | '720'

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function VideoCompressPanel({
  file,
  statusMessage,
  onCancel,
  onCompress
}: {
  file: File
  statusMessage?: string | null
  onCancel: () => void
  onCompress: (payload: { quality: number; maxDimension?: number }) => void
}): React.JSX.Element {
  const [quality, setQuality] = useState(78)
  const [videoSize, setVideoSize] = useState<VideoSize>('original')
  const maxDimension = videoSize === 'original' ? undefined : Number(videoSize)
  const estimate = useMemo(() => {
    // The final bitrate depends on motion and source encoding. This gives a
    // useful directional estimate before FFmpeg performs the actual export.
    const qualityScale = quality === 55 ? 0.36 : 0.58
    const sizeScale =
      videoSize === 'original' ? 1 : videoSize === '1920' ? 0.72 : videoSize === '1280' ? 0.48 : 0.3
    const bytes = Math.max(1, Math.round(file.size * qualityScale * sizeScale))
    return { bytes, percent: Math.max(0, Math.round((1 - bytes / file.size) * 100)) }
  }, [file.size, quality, videoSize])

  return (
    <motion.form
      data-panel
      className="w-[min(340px,calc(100vw-20px))] overflow-hidden rounded-[20px] border border-sky-200/22 bg-[#181818] text-[#f5f5f5] shadow-[0_18px_42px_rgba(0,0,0,.42)]"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, y: -5 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      onSubmit={(event) => {
        event.preventDefault()
        onCompress({ quality, maxDimension })
      }}
    >
      <header className="relative grid h-11 place-items-center border-b border-sky-200/16">
        <button
          type="button"
          className="absolute left-3 grid size-6 place-items-center rounded-full bg-[#f1f1f1] p-0 text-[#181818] hover:bg-white [&>svg]:size-3"
          onClick={onCancel}
          aria-label="Close video compressor"
        >
          <X size={24} strokeWidth={2.4} />
        </button>
        <h1 className="m-0 text-[15px] tracking-[-.04em]">Compress video</h1>
      </header>
      <div className="px-4 pt-3 pb-2.5">
        <p
          className="m-0 mb-[15px] overflow-hidden text-[11px] text-white/64 text-ellipsis whitespace-nowrap"
          title={file.name}
        >
          {file.name}
        </p>
        <p className="m-0 mb-3 text-[13px] font-bold tracking-[-.025em]">
          Original size: {formatBytes(file.size)}
        </p>
        <h2 className="m-0 mb-2 text-xs tracking-[-.02em]">Compression preset</h2>
        <div className="flex w-fit gap-1" role="group" aria-label="Video compression preset">
          <button
            type="button"
            className={`cursor-pointer rounded-full border-0 px-1.5 py-0.5 text-[8px] text-[#181818] ${quality === 78 ? 'bg-white' : 'bg-[#f1f1f1] hover:bg-white'}`}
            onClick={() => setQuality(78)}
          >
            Balanced
          </button>
          <button
            type="button"
            className={`cursor-pointer rounded-full border-0 px-1.5 py-0.5 text-[8px] text-[#181818] ${quality === 55 ? 'bg-white' : 'bg-[#f1f1f1] hover:bg-white'}`}
            onClick={() => setQuality(55)}
          >
            Strong
          </button>
        </div>
        <p className="my-2 mb-3 text-[10px] text-white/64">
          {quality === 55
            ? 'Smaller file with more quality loss.'
            : 'Smaller file with less quality loss.'}
        </p>
        <label className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-2 text-[10px] font-semibold">
          <span>Video size</span>
          <select
            className="w-full min-w-0 rounded-lg border-0 bg-[#252525] px-2 py-[7px] pr-[25px] text-[10px] text-[#f5f5f5] outline-none"
            value={videoSize}
            onChange={(event) => setVideoSize(event.target.value as VideoSize)}
          >
            <option value="original">Keep original dimensions</option>
            <option value="1920">Large — longest edge 1920 px</option>
            <option value="1280">Medium — longest edge 1280 px</option>
            <option value="720">Small — longest edge 720 px</option>
          </select>
        </label>
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-[3px] rounded-[10px] bg-[#252525] p-2.5">
          <span className="text-[11px] text-white/64">Estimated output</span>
          <strong className="text-sm">{formatBytes(estimate.bytes)}</strong>
          <small className="col-span-full text-[11px] text-[#21815d]">
            About {estimate.percent}% smaller
          </small>
        </div>
      </div>
      <footer className="flex items-center justify-end gap-1.5 border-t border-sky-200/16 px-3 pt-2 pb-2.5">
        {statusMessage && (
          <span className="mr-auto text-[8px] text-emerald-400">{statusMessage}</span>
        )}
        <button
          className="cursor-pointer rounded-full border-0 bg-[#f1f1f1] px-1.5 py-1 text-[8px] font-semibold text-[#181818] hover:bg-white"
          type="button"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          className="cursor-pointer rounded-full border-0 bg-[#f1f1f1] px-1.5 py-1 text-[8px] font-semibold text-[#181818] hover:bg-white"
          type="submit"
        >
          Compress
        </button>
      </footer>
    </motion.form>
  )
}
