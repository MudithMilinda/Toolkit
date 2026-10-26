import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AudioCompressPanel({
  file,
  statusMessage,
  onCancel,
  onCompress
}: {
  file: File
  statusMessage?: string | null
  onCancel: () => void
  onCompress: (payload: { bitrateKbps: 96 | 192 }) => void
}): React.JSX.Element {
  const [bitrateKbps, setBitrateKbps] = useState<96 | 192>(192)
  const estimate = useMemo(() => {
    // Without decoding the source in the UI, this is necessarily approximate.
    const scale = bitrateKbps === 96 ? 0.42 : 0.68
    const bytes = Math.max(1, Math.round(file.size * scale))
    return { bytes, percent: Math.max(0, Math.round((1 - bytes / file.size) * 100)) }
  }, [bitrateKbps, file.size])

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
        onCompress({ bitrateKbps })
      }}
    >
      <header className="relative grid h-11 place-items-center border-b border-sky-200/16">
        <button
          type="button"
          className="absolute left-3 grid size-6 place-items-center rounded-full bg-[#f1f1f1] p-0 text-[#181818] hover:bg-white [&>svg]:size-3"
          onClick={onCancel}
          aria-label="Close audio compressor"
        >
          <X size={24} strokeWidth={2.4} />
        </button>
        <h1 className="m-0 text-[15px] tracking-[-.04em]">Compress audio</h1>
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
        <div className="flex w-fit gap-1" role="group" aria-label="Audio compression preset">
          <button
            type="button"
            className={`cursor-pointer rounded-full border-0 px-1.5 py-0.5 text-[8px] text-[#181818] ${bitrateKbps === 192 ? 'bg-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.32)]' : 'bg-[#f1f1f1] hover:bg-white'}`}
            onClick={() => setBitrateKbps(192)}
          >
            Balanced
          </button>
          <button
            type="button"
            className={`cursor-pointer rounded-full border-0 px-1.5 py-0.5 text-[8px] text-[#181818] ${bitrateKbps === 96 ? 'bg-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.32)]' : 'bg-[#f1f1f1] hover:bg-white'}`}
            onClick={() => setBitrateKbps(96)}
          >
            Strong
          </button>
        </div>
        <p className="my-2 mb-3 text-[10px] text-white/64">
          {bitrateKbps === 96 ? 'Smallest file at 96 kbps.' : 'Good quality at 192 kbps.'}
        </p>
        <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-2 text-[10px] font-semibold">
          <span>Output format</span>
          <span className="rounded-lg bg-[#252525] px-2 py-[7px] text-[#f5f5f5]">
            MP3 · {bitrateKbps} kbps
          </span>
        </div>
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
          <span
            className="mr-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[8px] text-emerald-400"
            title={statusMessage}
          >
            {statusMessage}
          </span>
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
