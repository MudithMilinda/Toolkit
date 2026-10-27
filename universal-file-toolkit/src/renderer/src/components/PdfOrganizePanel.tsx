import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { ChevronLeft, ChevronRight, RotateCcw, RotateCw, Trash2, X } from 'lucide-react'

export default function PdfOrganizePanel({
  file,
  isProcessing,
  statusMessage,
  onCancel,
  onSave
}: {
  file: File
  isProcessing: boolean
  statusMessage?: string | null
  onCancel: () => void
  onSave: (payload: { pageOrder: number[]; pageRotations: Record<number, number> }) => void
}): React.JSX.Element {
  const [pageOrder, setPageOrder] = useState<number[]>([])
  const [originalPageOrder, setOriginalPageOrder] = useState<number[]>([])
  const [pageRotations, setPageRotations] = useState<Record<number, number>>({})
  const [thumbnails, setThumbnails] = useState<string[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const inputPath = window.api.getPathForFile(file)
    if (!inputPath) {
      setError('The PDF path could not be read.')
      return
    }
    void window.api
      .getPdfThumbnails(inputPath)
      .then(({ pageCount: count, thumbnails: previews }) => {
        if (!Number.isInteger(count) || count < 1) throw new Error('Unable to read the page count.')
        const original = Array.from({ length: count }, (_, index) => index + 1)
        setPageOrder(original)
        setOriginalPageOrder(original)
        setThumbnails(previews)
        setSelectedIndex(0)
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Unable to read this PDF.')
      )
  }, [file])

  const move = (direction: -1 | 1): void => {
    const nextIndex = selectedIndex + direction
    if (nextIndex < 0 || nextIndex >= pageOrder.length) return
    setPageOrder((current) => {
      const next = [...current]
      ;[next[selectedIndex], next[nextIndex]] = [next[nextIndex]!, next[selectedIndex]!]
      return next
    })
    setSelectedIndex(nextIndex)
  }
  const remove = (): void => {
    if (pageOrder.length <= 1) return
    setPageOrder((current) => current.filter((_, index) => index !== selectedIndex))
    setSelectedIndex((current) => Math.min(current, pageOrder.length - 2))
  }
  const reset = (): void => {
    setPageOrder(originalPageOrder)
    setPageRotations({})
    setSelectedIndex(0)
  }
  const rotate = (direction: -90 | 90): void => {
    const page = pageOrder[selectedIndex]
    if (!page) return
    setPageRotations((current) => {
      const nextRotation = ((current[page] ?? 0) + direction + 360) % 360
      if (nextRotation === 0) {
        const { [page]: _, ...rest } = current
        return rest
      }
      return { ...current, [page]: nextRotation }
    })
  }

  return (
    <motion.form
      data-panel
      className="w-[min(390px,calc(100vw-20px))] overflow-hidden rounded-[20px] border border-sky-200/22 bg-[#181818] text-[#f5f5f5] shadow-[0_18px_42px_rgba(0,0,0,.42)]"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, y: -5 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      onSubmit={(event) => {
        event.preventDefault()
        if (pageOrder.length) onSave({ pageOrder, pageRotations })
      }}
    >
      <header className="relative grid h-11 place-items-center border-b border-sky-200/16">
        <button type="button" className="absolute left-3 grid size-6 place-items-center rounded-full bg-[#f1f1f1] p-0 text-[#181818] hover:bg-white [&>svg]:size-3" onClick={onCancel} aria-label="Close PDF organizer"><X size={24} strokeWidth={2.4} /></button>
        <h1 className="m-0 text-[15px] tracking-[-.04em]">Organize PDF</h1>
      </header>
      <div className="px-4 pt-3 pb-3">
        <div className="flex justify-between gap-3 text-[11px] text-white/64">
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" title={file.name}>{file.name}</span>
          <span className="shrink-0">{pageOrder.length ? `${pageOrder.length} pages kept` : 'Reading pages…'}</span>
        </div>
        {error ? (
          <p className="mt-5 text-[11px] text-rose-300">{error}</p>
        ) : (
          <>
            <p className="mb-2 mt-3 text-[10px] text-white/64">Select a page, then move, rotate or remove it. The grid shows the final page order.</p>
            <div className="grid max-h-[188px] grid-cols-7 gap-1.5 overflow-y-auto rounded-[11px] bg-[#252525] p-2.5">
              {pageOrder.map((page, index) => (
                <button key={`${page}-${index}`} type="button" disabled={isProcessing} onClick={() => setSelectedIndex(index)} className={`relative isolate aspect-[.78] overflow-hidden rounded-md border text-[10px] font-semibold transition ${selectedIndex === index ? 'border-emerald-300 bg-emerald-400 text-[#11271f]' : 'border-white/10 bg-[#333] text-white/80 hover:bg-[#404040]'}`} title={`Original page ${page}${pageRotations[page] ? ` · rotated ${pageRotations[page]}°` : ''}`}>
                  {thumbnails[page - 1] ? <img className="absolute inset-1 h-[calc(100%-8px)] w-[calc(100%-8px)] object-contain transition-transform duration-200" style={{ transform: `rotate(${pageRotations[page] ?? 0}deg)` }} src={thumbnails[page - 1]} alt={`PDF page ${page}`} /> : null}
                  <span className="absolute left-1 top-1 rounded bg-black/65 px-1 text-[7px] text-white">{page}</span>
                  {pageRotations[page] ? <small className="absolute bottom-0.5 right-0.5 rounded bg-black/65 px-0.5 text-[6px] text-white">{pageRotations[page]}°</small> : null}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <button type="button" disabled={isProcessing || selectedIndex === 0} onClick={() => move(-1)} className="grid size-7 place-items-center rounded-full bg-[#f1f1f1] text-[#181818] hover:bg-white disabled:cursor-not-allowed disabled:opacity-35" aria-label="Move page left"><ChevronLeft size={15} /></button>
              <button type="button" disabled={isProcessing || selectedIndex >= pageOrder.length - 1} onClick={() => move(1)} className="grid size-7 place-items-center rounded-full bg-[#f1f1f1] text-[#181818] hover:bg-white disabled:cursor-not-allowed disabled:opacity-35" aria-label="Move page right"><ChevronRight size={15} /></button>
              <button type="button" disabled={isProcessing} onClick={() => rotate(-90)} className="grid size-7 place-items-center rounded-full bg-[#f1f1f1] text-[#181818] hover:bg-white disabled:cursor-not-allowed disabled:opacity-35" aria-label="Rotate page left"><RotateCcw size={13} /></button>
              <button type="button" disabled={isProcessing} onClick={() => rotate(90)} className="grid size-7 place-items-center rounded-full bg-[#f1f1f1] text-[#181818] hover:bg-white disabled:cursor-not-allowed disabled:opacity-35" aria-label="Rotate page right"><RotateCw size={13} /></button>
              <button type="button" disabled={isProcessing || pageOrder.length <= 1} onClick={remove} className="ml-1 flex items-center gap-1 rounded-full bg-[#312424] px-2 py-1 text-[9px] text-rose-200 hover:bg-[#442929] disabled:cursor-not-allowed disabled:opacity-35"><Trash2 size={12} /> Remove</button>
              <button type="button" disabled={isProcessing} onClick={reset} className="ml-auto flex items-center gap-1 rounded-full bg-[#252525] px-2 py-1 text-[9px] text-white/70 hover:bg-[#303030]"><RotateCcw size={11} /> Reset</button>
            </div>
          </>
        )}
      </div>
      <footer className="flex items-center justify-end gap-1.5 border-t border-sky-200/16 px-3 pt-2 pb-2.5">
        {statusMessage && <span className="mr-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[8px] text-emerald-400" title={statusMessage}>{statusMessage}</span>}
        <button className="rounded-full border-0 bg-[#f1f1f1] px-1.5 py-1 text-[8px] font-semibold text-[#181818] hover:bg-white" type="button" onClick={onCancel} disabled={isProcessing}>Cancel</button>
        <button className="rounded-full border-0 bg-[#f1f1f1] px-1.5 py-1 text-[8px] font-semibold text-[#181818] hover:bg-white disabled:cursor-wait disabled:opacity-60" type="submit" disabled={!pageOrder.length || Boolean(error) || isProcessing}>{isProcessing ? 'Saving…' : 'Save organized PDF'}</button>
      </footer>
    </motion.form>
  )
}
