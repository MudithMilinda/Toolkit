import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { X } from 'lucide-react'
import { motion } from 'motion/react'

type CropArea = { left: number; top: number; width: number; height: number }
type Handle = 'move' | 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const ratios = [
  { label: 'Free', value: 0 },
  { label: '1:1', value: 1 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 }
]
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)
function defaultCrop(width: number, height: number, ratio = 0): CropArea {
  if (!ratio)
    return {
      left: Math.round(width * 0.1),
      top: Math.round(height * 0.1),
      width: Math.round(width * 0.8),
      height: Math.round(height * 0.8)
    }
  let cropWidth = width * 0.8
  let cropHeight = cropWidth / ratio
  if (cropHeight > height * 0.8) {
    cropHeight = height * 0.8
    cropWidth = cropHeight * ratio
  }
  return {
    left: Math.round((width - cropWidth) / 2),
    top: Math.round((height - cropHeight) / 2),
    width: Math.round(cropWidth),
    height: Math.round(cropHeight)
  }
}

export default function ImageCropPanel({
  file,
  onCancel,
  onApply,
  onNewFile,
  isProcessing = false
}: {
  file: File
  onCancel: () => void
  onApply: (area: CropArea) => void
  onNewFile: () => void
  isProcessing?: boolean
}): React.JSX.Element {
  const [source, setSource] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 })
  const [crop, setCrop] = useState<CropArea>({ left: 0, top: 0, width: 0, height: 0 })
  const [ratio, setRatio] = useState(0)
  const previewRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ handle: Handle; startX: number; startY: number; crop: CropArea } | null>(
    null
  )

  useEffect(() => {
    void window.api
      .getImagePreview(window.api.getPathForFile(file))
      .then(setSource)
      .catch(() => setSource(null))
  }, [file])
  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return
    const update = (): void =>
      setPreviewSize({ width: preview.clientWidth, height: preview.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(preview)
    return () => observer.disconnect()
  }, [])
  const display = useMemo(() => {
    if (!imageSize.width || !previewSize.width) return { width: 0, height: 0, left: 0, top: 0 }
    const scale = Math.min(
      previewSize.width / imageSize.width,
      previewSize.height / imageSize.height
    )
    const width = imageSize.width * scale
    const height = imageSize.height * scale
    return {
      width,
      height,
      left: (previewSize.width - width) / 2,
      top: (previewSize.height - height) / 2
    }
  }, [imageSize, previewSize])
  const selectRatio = (nextRatio: number): void => {
    setRatio(nextRatio)
    if (imageSize.width) setCrop(defaultCrop(imageSize.width, imageSize.height, nextRatio))
  }
  const updateCrop = useCallback(
    (next: CropArea): void => {
      const width = clamp(next.width, 1, imageSize.width)
      const height = clamp(next.height, 1, imageSize.height)
      setCrop({
        left: Math.round(clamp(next.left, 0, imageSize.width - width)),
        top: Math.round(clamp(next.top, 0, imageSize.height - height)),
        width: Math.round(width),
        height: Math.round(height)
      })
    },
    [imageSize]
  )
  const beginDrag = (event: PointerEvent<HTMLElement>, handle: Handle): void => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { handle, startX: event.clientX, startY: event.clientY, crop }
  }
  const drag = (event: PointerEvent<HTMLElement>): void => {
    const active = dragRef.current
    if (!active || !display.width || !display.height) return
    const dx = ((event.clientX - active.startX) * imageSize.width) / display.width
    const dy = ((event.clientY - active.startY) * imageSize.height) / display.height
    const base = active.crop
    if (active.handle === 'move') {
      updateCrop({
        ...base,
        left: clamp(base.left + dx, 0, imageSize.width - base.width),
        top: clamp(base.top + dy, 0, imageSize.height - base.height)
      })
      return
    }
    let left = base.left
    let top = base.top
    let width = base.width
    let height = base.height
    if (active.handle.includes('e')) width = clamp(base.width + dx, 24, imageSize.width - base.left)
    if (active.handle.includes('s'))
      height = clamp(base.height + dy, 24, imageSize.height - base.top)
    if (active.handle.includes('w')) {
      left = clamp(base.left + dx, 0, base.left + base.width - 24)
      width = base.width + base.left - left
    }
    if (active.handle.includes('n')) {
      top = clamp(base.top + dy, 0, base.top + base.height - 24)
      height = base.height + base.top - top
    }
    if (ratio) {
      if (active.handle === 'e' || active.handle === 'w') height = width / ratio
      else width = height * ratio
      if (active.handle.includes('w')) left = base.left + base.width - width
      if (active.handle.includes('n')) top = base.top + base.height - height
      if (left < 0) {
        width += left
        height = width / ratio
        left = 0
      }
      if (top < 0) {
        height += top
        width = height * ratio
        top = 0
      }
      if (left + width > imageSize.width) {
        width = imageSize.width - left
        height = width / ratio
      }
      if (top + height > imageSize.height) {
        height = imageSize.height - top
        width = height * ratio
      }
    }
    updateCrop({ left, top, width, height })
  }
  const setDimension = (field: 'width' | 'height', value: string): void => {
    const dimension = Number(value.replace(/\D/g, ''))
    if (!dimension) return
    const next = { ...crop, [field]: dimension }
    if (ratio) {
      if (field === 'width') next.height = Math.round(dimension / ratio)
      else next.width = Math.round(dimension * ratio)
    }
    updateCrop({
      ...next,
      width: Math.min(next.width, imageSize.width - next.left),
      height: Math.min(next.height, imageSize.height - next.top)
    })
  }
  const frameStyle = imageSize.width
    ? {
        left: `${display.left + (crop.left / imageSize.width) * display.width}px`,
        top: `${display.top + (crop.top / imageSize.height) * display.height}px`,
        width: `${(crop.width / imageSize.width) * display.width}px`,
        height: `${(crop.height / imageSize.height) * display.height}px`
      }
    : undefined
  return (
    <motion.section
      className="crop-panel"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, y: -5 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <header className="crop-header">
        <button className="crop-close" onClick={onCancel} aria-label="Close crop editor">
          <X size={24} strokeWidth={2.4} />
        </button>
        <h1>Crop Image</h1>
        <button className="crop-new-file" onClick={onNewFile} disabled={isProcessing}>
          New file
        </button>
      </header>
      <div className="crop-stage" ref={previewRef}>
        {source && (
          <img
            src={source}
            alt="Crop preview"
            draggable={false}
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget
              setImageSize({ width: naturalWidth, height: naturalHeight })
              setCrop(defaultCrop(naturalWidth, naturalHeight))
            }}
          />
        )}
        {crop.width > 0 && (
          <div
            className="crop-frame"
            style={frameStyle}
            onPointerDown={(event) => beginDrag(event, 'move')}
            onPointerMove={drag}
            onPointerUp={() => {
              dragRef.current = null
            }}
          >
            <span className="crop-grid crop-grid-a" />
            <span className="crop-grid crop-grid-b" />
            {(['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'] as Handle[]).map((handle) => (
              <button
                key={handle}
                className={`crop-handle crop-handle-${handle}`}
                aria-label={`Resize crop ${handle}`}
                onPointerDown={(event) => beginDrag(event, handle)}
                onPointerMove={drag}
                onPointerUp={() => {
                  dragRef.current = null
                }}
              />
            ))}
          </div>
        )}
      </div>
      <div className="crop-controls">
        <span className="crop-label">Aspect ratio</span>
        <div className="crop-ratios" role="group" aria-label="Aspect ratio">
          {ratios.map((item) => (
            <button
              key={item.label}
              className={ratio === item.value ? 'active' : ''}
              onClick={() => selectRatio(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="crop-dimensions">
          <label>
            W
            <input
              inputMode="numeric"
              value={crop.width || ''}
              onChange={(event) => setDimension('width', event.target.value)}
            />
          </label>
          <label>
            H
            <input
              inputMode="numeric"
              value={crop.height || ''}
              onChange={(event) => setDimension('height', event.target.value)}
            />
          </label>
          <span>px</span>
        </div>
      </div>
      <footer className="crop-footer">
        <button onClick={() => selectRatio(ratio)}>Reset</button>
        <button
          className="crop-apply"
          disabled={!crop.width || isProcessing}
          onClick={() => onApply(crop)}
        >
          {isProcessing ? 'Cropping…' : 'Apply'}
        </button>
      </footer>
    </motion.section>
  )
}
