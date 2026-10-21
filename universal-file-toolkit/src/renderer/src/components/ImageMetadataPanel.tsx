import { useEffect, useMemo, useState } from 'react'
import { MinusCircle, Search, X } from 'lucide-react'
import { motion } from 'motion/react'

type Item = { key: string; value: string }
export default function ImageMetadataPanel({
  file,
  onCancel
}: {
  file: File
  onCancel: () => void
}): React.JSX.Element {
  const [items, setItems] = useState<Item[]>([])
  const [query, setQuery] = useState('')
  useEffect(() => {
    void window.api
      .getImageMetadata(window.api.getPathForFile(file))
      .then(setItems)
      .catch(() => setItems([]))
  }, [file])
  const filtered = useMemo(
    () =>
      items.filter((item) =>
        `${item.key} ${item.value}`.toLowerCase().includes(query.toLowerCase())
      ),
    [items, query]
  )
  const imageItems = filtered.filter((item) =>
    ['Width', 'Height', 'Color space', 'Orientation'].includes(item.key)
  )
  const fileItems = filtered.filter((item) => !imageItems.includes(item))
  const section = (title: string, rows: Item[]): React.JSX.Element => (
    <section className="metadata-section">
      <h2>{title}</h2>
      {rows.map((item) => (
        <div className="metadata-row" key={item.key}>
          <strong>{item.key}:</strong>
          <input value={item.value} readOnly />
          <button
            title={`Remove ${item.key}`}
            onClick={() => setItems((current) => current.filter((row) => row.key !== item.key))}
          >
            <MinusCircle size={18} />
          </button>
        </div>
      ))}
    </section>
  )
  return (
    <motion.section
      className="metadata-panel"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
    >
      <header>
        <button onClick={onCancel}>
          <X size={31} />
        </button>
        <h1>Metadata</h1>
      </header>
      <div className="metadata-content">
        <div className="metadata-top">
          <span>{file.name}</span>
          <label>
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search metadata"
            />
          </label>
        </div>
        {section('ExifIFD', imageItems)}
        {section('File', fileItems)}
      </div>
      <footer>
        <p>Remove All clears camera and processing metadata from the saved copy.</p>
        <button onClick={() => setItems([])}>Remove All</button>
        <button className="metadata-save">Save</button>
      </footer>
    </motion.section>
  )
}
