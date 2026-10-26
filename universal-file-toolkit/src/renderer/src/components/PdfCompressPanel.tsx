import { motion } from 'motion/react'
import { FileDown, ShieldCheck, X } from 'lucide-react'

const formatBytes = (bytes: number): string =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`

export default function PdfCompressPanel({
  file,
  statusMessage,
  isProcessing,
  onCancel,
  onCompress
}: {
  file: File
  statusMessage?: string | null
  isProcessing: boolean
  onCancel: () => void
  onCompress: () => void
}): React.JSX.Element {
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
        onCompress()
      }}
    >
      <header className="relative grid h-11 place-items-center border-b border-sky-200/16">
        <button
          type="button"
          className="absolute left-3 grid size-6 place-items-center rounded-full bg-[#f1f1f1] p-0 text-[#181818] hover:bg-white [&>svg]:size-3"
          onClick={onCancel}
          aria-label="Close PDF compressor"
        >
          <X size={24} strokeWidth={2.4} />
        </button>
        <h1 className="m-0 text-[15px] tracking-[-.04em]">Compress PDF</h1>
      </header>
      <div className="px-4 pt-3 pb-3">
        <p className="m-0 overflow-hidden text-[11px] text-white/64 text-ellipsis whitespace-nowrap" title={file.name}>
          {file.name}
        </p>
        <div className="mt-3 flex items-center gap-3 rounded-[11px] bg-[#252525] p-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-white/10 text-emerald-400">
            <FileDown size={19} />
          </div>
          <div className="min-w-0">
            <strong className="block text-[12px]">Optimize PDF</strong>
            <span className="text-[10px] text-white/64">Original size: {formatBytes(file.size)}</span>
          </div>
        </div>
        <div className="mt-3 flex gap-2 rounded-[10px] border border-sky-200/12 bg-[#202020] p-2.5 text-[10px] text-white/64">
          <ShieldCheck className="mt-px shrink-0 text-emerald-400" size={15} />
          <p className="m-0 leading-[1.45]">
            Creates an optimized copy locally. All PDF pages and selectable text are kept; the final size depends on the source file.
          </p>
        </div>
      </div>
      <footer className="flex items-center justify-end gap-1.5 border-t border-sky-200/16 px-3 pt-2 pb-2.5">
        {statusMessage && (
          <span className="mr-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[8px] text-emerald-400" title={statusMessage}>
            {statusMessage}
          </span>
        )}
        <button className="rounded-full border-0 bg-[#f1f1f1] px-1.5 py-1 text-[8px] font-semibold text-[#181818] hover:bg-white" type="button" onClick={onCancel} disabled={isProcessing}>
          Cancel
        </button>
        <button className="rounded-full border-0 bg-[#f1f1f1] px-1.5 py-1 text-[8px] font-semibold text-[#181818] hover:bg-white disabled:cursor-wait disabled:opacity-60" type="submit" disabled={isProcessing}>
          {isProcessing ? 'Compressing…' : 'Compress PDF'}
        </button>
      </footer>
    </motion.form>
  )
}
