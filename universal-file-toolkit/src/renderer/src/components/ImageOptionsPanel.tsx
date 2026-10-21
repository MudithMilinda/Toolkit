import { useEffect, useMemo, useState } from 'react'
import { Minimize2, X } from 'lucide-react'
import { motion } from 'motion/react'

type ResizePayload = {
  width?: number
  height?: number
  fit: 'inside' | 'cover' | 'fill'
  withoutEnlargement: boolean
}
type CompressPayload = { quality: number; maxDimension?: number }
type ImageSize = 'original' | '2048' | '1280' | '800'

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ImageOptionsPanel({
  mode,
  file,
  onCancel,
  onResize,
  onCompress
}: {
  mode: 'resize' | 'compress'
  file: File
  onCancel: () => void
  onResize: (payload: ResizePayload) => void
  onCompress: (payload: CompressPayload) => void
}): React.JSX.Element {
  const [width, setWidth] = useState('1920')
  const [height, setHeight] = useState('')
  const [fit, setFit] = useState<ResizePayload['fit']>('inside')
  const [withoutEnlargement, setWithoutEnlargement] = useState(true)
  const [quality, setQuality] = useState(78)
  const [imageSize, setImageSize] = useState<ImageSize>('original')
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)
  const resize = mode === 'resize'

  useEffect(() => {
    if (resize) return
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)
    image.onload = () => {
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight })
      URL.revokeObjectURL(objectUrl)
    }
    image.onerror = () => URL.revokeObjectURL(objectUrl)
    image.src = objectUrl
    return () => URL.revokeObjectURL(objectUrl)
  }, [file, resize])

  const estimate = useMemo(() => {
    const maxDimension = imageSize === 'original' ? undefined : Number(imageSize)
    const dimensionScale =
      maxDimension && dimensions
        ? Math.min(1, maxDimension / Math.max(dimensions.width, dimensions.height))
        : 1
    // Encoders and image content determine the final size, so this is only an estimate.
    const qualityScale = 0.18 + (quality / 100) * 0.65
    const bytes = Math.max(1, Math.round(file.size * dimensionScale ** 2 * qualityScale))
    return { bytes, percent: Math.round((1 - bytes / file.size) * 100) }
  }, [dimensions, file.size, imageSize, quality])

  if (!resize) {
    const maxDimension = imageSize === 'original' ? undefined : Number(imageSize)
    return (
      <motion.form
        className="compress-panel"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97, y: -5 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        onSubmit={(event) => {
          event.preventDefault()
          onCompress({ quality, maxDimension })
        }}
      >
        <header className="compress-header">
          <button
            type="button"
            className="compress-close"
            onClick={onCancel}
            aria-label="Close compressor"
          >
            <X size={24} strokeWidth={2.4} />
          </button>
          <h1>Compress</h1>
        </header>
        <div className="compress-content">
          <p className="compress-file" title={file.name}>
            {file.name}
          </p>
          <p className="compress-original">Original size: {formatBytes(file.size)}</p>
          <h2>Compression preset</h2>
          <div className="compress-presets" role="group" aria-label="Compression preset">
            <button
              type="button"
              className={quality === 78 ? 'active' : ''}
              onClick={() => setQuality(78)}
            >
              Balanced
            </button>
            <button
              type="button"
              className={quality === 55 ? 'active' : ''}
              onClick={() => setQuality(55)}
            >
              Strong
            </button>
          </div>
          <p className="compress-description">
            {quality === 55
              ? 'Smaller file with more quality loss.'
              : 'Smaller file with less quality loss.'}
          </p>
          <label className="compress-image-size">
            <span>Image size</span>
            <select
              value={imageSize}
              onChange={(event) => setImageSize(event.target.value as ImageSize)}
            >
              <option value="original">Keep original dimensions</option>
              <option value="2048">Large — longest edge 2048 px</option>
              <option value="1280">Medium — longest edge 1280 px</option>
              <option value="800">Small — longest edge 800 px</option>
            </select>
          </label>
          {dimensions && (
            <p className="compress-dimensions">
              Original dimensions: {dimensions.width} × {dimensions.height} px
            </p>
          )}
          <div className={`compress-estimate ${estimate.percent >= 0 ? 'saving' : 'increase'}`}>
            <span>Estimated output</span>
            <strong>{formatBytes(estimate.bytes)}</strong>
            <small>
              {estimate.percent >= 0
                ? `About ${estimate.percent}% smaller`
                : `About ${Math.abs(estimate.percent)}% larger`}
            </small>
          </div>
        </div>
        <footer className="compress-footer">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="compress-apply" type="submit">
            Compress
          </button>
        </footer>
      </motion.form>
    )
  }

  return (
    <motion.form
      className="image-options glass-panel"
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.88 }}
      transition={{ type: 'spring', stiffness: 360, damping: 27 }}
      onSubmit={(event) => {
        event.preventDefault()
        onResize({
          width: width ? Number(width) : undefined,
          height: height ? Number(height) : undefined,
          fit,
          withoutEnlargement
        })
      }}
    >
      <header>
        <span className="image-options-icon">
          <Minimize2 size={16} />
        </span>
        <div>
          <strong>Resize image</strong>
          <small title={file.name}>{file.name}</small>
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
