import { useState } from 'react'
import { Minimize2, SlidersHorizontal, X } from 'lucide-react'
import { motion } from 'motion/react'

type ResizePayload = {
  width?: number
  height?: number
  fit: 'inside' | 'cover' | 'fill'
  withoutEnlargement: boolean
}

export default function ImageOptionsPanel({
  mode,
  fileName,
  onCancel,
  onResize,
  onCompress
}: {
  mode: 'resize' | 'compress'
  fileName: string
  onCancel: () => void
  onResize: (payload: ResizePayload) => void
  onCompress: (quality: number) => void
}): React.JSX.Element {
  const [width, setWidth] = useState('1920')
  const [height, setHeight] = useState('')
  const [fit, setFit] = useState<ResizePayload['fit']>('inside')
  const [withoutEnlargement, setWithoutEnlargement] = useState(true)
  const [quality, setQuality] = useState(78)
  const resize = mode === 'resize'

  return (
    <motion.form
      className="image-options glass-panel"
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.88 }}
      transition={{ type: 'spring', stiffness: 360, damping: 27 }}
      onSubmit={(event) => {
        event.preventDefault()
        if (resize) {
          onResize({
            width: width ? Number(width) : undefined,
            height: height ? Number(height) : undefined,
            fit,
            withoutEnlargement
          })
        } else onCompress(quality)
      }}
    >
      <header>
        <span className="image-options-icon">
          {resize ? <Minimize2 size={16} /> : <SlidersHorizontal size={16} />}
        </span>
        <div>
          <strong>{resize ? 'Resize image' : 'Compress image'}</strong>
          <small title={fileName}>{fileName}</small>
        </div>
        <button
          type="button"
          className="image-options-close"
          onClick={onCancel}
          aria-label="Cancel"
        >
          <X size={15} />
        </button>
      </header>
      {resize ? (
        <>
          <div className="dimension-fields">
            <label>
              Width
              <input
                inputMode="numeric"
                value={width}
                onChange={(event) => setWidth(event.target.value.replace(/\D/g, ''))}
                placeholder="auto"
              />
            </label>
            <span>×</span>
            <label>
              Height
              <input
                inputMode="numeric"
                value={height}
                onChange={(event) => setHeight(event.target.value.replace(/\D/g, ''))}
                placeholder="auto"
              />
            </label>
          </div>
          <label className="select-field">
            Fit
            <select
              value={fit}
              onChange={(event) => setFit(event.target.value as ResizePayload['fit'])}
            >
              <option value="inside">Inside — keep ratio</option>
              <option value="cover">Cover</option>
              <option value="fill">Stretch</option>
            </select>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={withoutEnlargement}
              onChange={(event) => setWithoutEnlargement(event.target.checked)}
            />{' '}
            Never enlarge
          </label>
        </>
      ) : (
        <>
          <label className="quality-field">
            Quality <b>{quality}</b>
            <input
              type="range"
              min="1"
              max="100"
              value={quality}
              onChange={(event) => setQuality(Number(event.target.value))}
            />
          </label>
          <div className="quality-presets">
            <button type="button" onClick={() => setQuality(60)}>
              Small
            </button>
            <button type="button" onClick={() => setQuality(78)}>
              Balanced
            </button>
            <button type="button" onClick={() => setQuality(90)}>
              High
            </button>
          </div>
        </>
      )}
      <footer>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="apply-button" type="submit">
          Apply
        </button>
      </footer>
    </motion.form>
  )
}
