import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Scissors, X } from 'lucide-react'

export default function PdfSplitPanel({
  file,
  statusMessage,
  isProcessing,
  onCancel,
  onSplit
}: {
  file: File
  statusMessage?: string | null
  isProcessing: boolean
  onCancel: () => void
  onSplit: (payload: { startPage: number; endPage: number; splitEveryPage: boolean }) => void
}): React.JSX.Element {
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [startPage, setStartPage] = useState(1)
  const [endPage, setEndPage] = useState(1)
  const [splitEveryPage, setSplitEveryPage] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const inputPath = window.api.getPathForFile(file)
    if (!inputPath) {
      setError('The PDF path could not be read.')
      return
    }
    void window.api
      .getPdfMetadata(inputPath)
      .then((items) => {
        const count = Number(items.find((item) => item.key === 'Pages')?.value)
        if (!Number.isInteger(count) || count < 1) throw new Error('Unable to read the page count.')
        setPageCount(count)
        setEndPage(count)
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Unable to read this PDF.')
      )
  }, [file])

  const updateStart = (value: number): void => {
    const next = Math.max(1, Math.min(pageCount ?? 1, value))
    setStartPage(next)
    if (next > endPage) setEndPage(next)
  }
  const updateEnd = (value: number): void => {
    const next = Math.max(startPage, Math.min(pageCount ?? startPage, value))
    setEndPage(next)
  }

  return (
    <motion.form
      data-panel
      className="w-[min(350px,calc(100vw-20px))] overflow-hidden rounded-[20px] border border-sky-200/22 bg-[#181818] text-[#f5f5f5] shadow-[0_18px_42px_rgba(0,0,0,.42)]"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, y: -5 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      onSubmit={(event) => {
        event.preventDefault()
        if (!pageCount) return
        onSplit({ startPage, endPage, splitEveryPage })
      }}
    >
      <header className="relative grid h-11 place-items-center border-b border-sky-200/16">
        <button type="button" className="absolute left-3 grid size-6 place-items-center rounded-full bg-[#f1f1f1] p-0 text-[#181818] hover:bg-white [&>svg]:size-3" onClick={onCancel} aria-label="Close PDF splitter">
          <X size={24} strokeWidth={2.4} />
        </button>
        <h1 className="m-0 text-[15px] tracking-[-.04em]">Split PDF</h1>
      </header>
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-center justify-between gap-3 text-[11px] text-white/64">
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" title={file.name}>{file.name}</span>
          <span className="shrink-0">{pageCount ? `${pageCount} pages` : 'Reading pages…'}</span>
        </div>
        {error ? (
          <p className="mt-5 text-[11px] text-rose-300">{error}</p>
        ) : (
          <>
            <div className="mt-3 flex items-center gap-3 rounded-[11px] bg-[#252525] p-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-white/10 text-emerald-400"><Scissors size={18} /></div>
              <div>
                <strong className="block text-[12px]">Pages to split</strong>
                <span className="text-[10px] text-white/64">Choose a page range below.</span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[10px] font-semibold">Start page
                <input className="mt-1 block w-full rounded-lg border-0 bg-[#252525] px-2 py-[7px] text-[11px] text-white outline-none" type="number" min="1" max={pageCount ?? 1} value={startPage} onChange={(event) => updateStart(Number(event.target.value))} disabled={!pageCount || isProcessing} />
              </label>
              <label className="text-[10px] font-semibold">End page
                <input className="mt-1 block w-full rounded-lg border-0 bg-[#252525] px-2 py-[7px] text-[11px] text-white outline-none" type="number" min={startPage} max={pageCount ?? 1} value={endPage} onChange={(event) => updateEnd(Number(event.target.value))} disabled={!pageCount || isProcessing} />
              </label>
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-[10px] border border-sky-200/12 bg-[#202020] p-2.5 text-[10px] text-white/76">
              <input className="accent-emerald-400" type="checkbox" checked={splitEveryPage} onChange={(event) => setSplitEveryPage(event.target.checked)} disabled={!pageCount || isProcessing} />
              Create one PDF for each page
            </label>
            <p className="mb-0 mt-2 text-[10px] leading-[1.45] text-white/55">
              {splitEveryPage ? 'Each page in the selected range becomes its own PDF file.' : 'The selected range becomes one new PDF file.'}
            </p>
          </>
        )}
      </div>
      <footer className="flex items-center justify-end gap-1.5 border-t border-sky-200/16 px-3 pt-2 pb-2.5">
        {statusMessage && <span className="mr-auto min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[8px] text-emerald-400" title={statusMessage}>{statusMessage}</span>}
        <button className="rounded-full border-0 bg-[#f1f1f1] px-1.5 py-1 text-[8px] font-semibold text-[#181818] hover:bg-white" type="button" onClick={onCancel} disabled={isProcessing}>Cancel</button>
        <button className="rounded-full border-0 bg-[#f1f1f1] px-1.5 py-1 text-[8px] font-semibold text-[#181818] hover:bg-white disabled:cursor-wait disabled:opacity-60" type="submit" disabled={!pageCount || Boolean(error) || isProcessing}>{isProcessing ? 'Splitting…' : 'Split PDF'}</button>
      </footer>
    </motion.form>
  )
}
