import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { motion } from 'motion/react'

type Item = { key: string; value: string }

export default function VideoMetadataPanel({
  file,
  onCancel
}: {
  file: File
  onCancel: () => void
}): React.JSX.Element {
  const [items, setItems] = useState<Item[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const inputPath = window.api.getPathForFile(file)
    if (!inputPath) {
      setError('The video path could not be read.')
      return
    }
    void window.api
      .getVideoMetadata(inputPath)
      .then(setItems)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Unable to read metadata.')
      )
  }, [file])

  const filtered = useMemo(
    () =>
      items.filter((item) =>
        `${item.key} ${item.value}`.toLowerCase().includes(query.toLowerCase())
      ),
    [items, query]
  )
  const videoItems = filtered.filter((item) =>
    ['Duration', 'Bitrate', 'Video stream', 'Audio stream'].includes(item.key)
  )
  const fileItems = filtered.filter((item) => !videoItems.includes(item))
  const section = (title: string, rows: Item[]): React.JSX.Element => (
    <section>
      <h2 className="mt-[17px] mb-[6px] border-t border-sky-200/16 pt-[9px] text-[11px] text-white/64">
        {title}
      </h2>
      {rows.map((item) => (
        <div
          className="grid grid-cols-[130px_1fr] items-center gap-[9px] py-[5px] text-[11px]"
          key={`${item.key}-${item.value}`}
        >
          <strong>{item.key}:</strong>
          <input
            className="min-w-0 rounded-[7px] border-0 bg-[#252525] px-[7px] py-[5px] text-[#f5f5f5]"
            value={item.value}
            readOnly
          />
        </div>
      ))}
    </section>
  )

  return (
    <motion.section
      data-panel
      className="flex h-[min(470px,calc(100vh-20px))] w-[min(460px,calc(100vw-20px))] flex-col overflow-hidden rounded-[24px] border border-sky-200/22 bg-[#181818] text-[#f5f5f5] shadow-[0_18px_42px_rgba(0,0,0,.42)]"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
    >
      <header className="relative grid h-11 shrink-0 place-items-center border-b border-sky-200/16">
        <button
          className="absolute left-3 grid size-6 place-items-center rounded-full border-0 bg-[#f1f1f1] p-0 text-[#181818] hover:bg-white [&>svg]:size-3"
          onClick={onCancel}
          aria-label="Close video metadata"
        >
          <X size={31} />
        </button>
        <h1 className="m-0 text-[15px]">Video metadata</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-[18px] py-[14px]">
        <div className="flex justify-between gap-4 text-[11px] text-white/64">
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">{file.name}</span>
          <label className="flex shrink-0 items-center gap-1.5 rounded-lg border border-sky-200/22 bg-[#252525] px-2">
            <Search size={15} />
            <input
              className="w-[145px] border-0 bg-transparent py-1.5 text-inherit outline-none"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search metadata"
            />
          </label>
        </div>
        {error ? (
          <p className="mt-6 text-[11px] text-rose-300">{error}</p>
        ) : !items.length ? (
          <p className="mt-6 text-[11px] text-white/64">Reading metadata…</p>
        ) : (
          <>
            {section('Video', videoItems)}
            {section('File', fileItems)}
          </>
        )}
      </div>
      <footer className="flex shrink-0 items-center justify-end gap-[9px] border-t border-sky-200/16 px-[15px] py-2.5">
        <p className="m-0 flex-1 text-[9px] text-white/64">
          Video metadata is shown from the source file.
        </p>
        <button
          className="cursor-pointer rounded-full border-0 bg-[#f1f1f1] px-1.5 py-1 text-[8px] text-[#181818] hover:bg-white"
          onClick={onCancel}
        >
          Close
        </button>
      </footer>
    </motion.section>
  )
}
