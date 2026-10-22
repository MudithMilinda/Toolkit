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
  isProcessing = false,
  statusMessage
}: {
  file: File
  onCancel: () => void
  onApply: (area: CropArea) => void
  onNewFile: () => void
  isProcessing?: boolean
  statusMessage?: string | null
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
      data-panel
      className="w-[min(400px,calc(100vw-20px))] overflow-hidden rounded-[24px] border border-sky-200/22 bg-[#181818] text-[#f5f5f5] shadow-[0_18px_42px_rgba(0,0,0,.42)]"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, y: -5 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
    >
      <header className="relative grid h-11 place-items-center border-b border-sky-200/16">
        <button
          className="absolute left-3 grid size-6 place-items-center rounded-full border-0 bg-[#f1f1f1] p-0 text-[#181818] hover:bg-white [&>svg]:size-3"
          onClick={onCancel}
          aria-label="Close crop editor"
        >
          <X size={24} strokeWidth={2.4} />
        </button>
        <h1 className="m-0 text-[15px] font-bold tracking-[-.03em]">Crop Image</h1>
        <button className="absolute right-3 cursor-pointer rounded-full border-0 bg-[#f1f1f1] px-1.5 py-1 text-[8px] font-semibold text-[#181818] hover:bg-white disabled:cursor-default disabled:opacity-55" onClick={onNewFile} disabled={isProcessing}>
          New file
        </button>
      </header>
      <div className="relative h-[220px] overflow-hidden bg-[#252525] touch-none" ref={previewRef}>
        {source && (
          <img
            src={source}
            className="absolute inset-0 size-full object-contain select-none"
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
            className="absolute z-1 min-h-3 min-w-3 cursor-move border-[3px] border-[#f1f1f1] shadow-[0_0_0_100vmax_rgba(0,0,0,.42)] touch-none"
            style={frameStyle}
            onPointerDown={(event) => beginDrag(event, 'move')}
            onPointerMove={drag}
            onPointerUp={() => {
              dragRef.current = null
            }}
          >
            <span className="pointer-events-none absolute inset-y-0 left-1/3 right-1/3 border-x border-white/58" />
            <span className="pointer-events-none absolute inset-x-0 top-1/3 bottom-1/3 border-y border-white/58" />
            {(['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'] as Handle[]).map((handle) => (
              <button
                key={handle}
                className={`absolute z-2 size-[13px] rounded-[3px] border-0 bg-[#f1f1f1] p-0 shadow-[0_1px_2px_rgba(83,27,6,.28)] ${handle === 'n' ? 'left-1/2 top-[-8px] ml-[-6.5px] cursor-ns-resize' : handle === 's' ? 'bottom-[-8px] left-1/2 ml-[-6.5px] cursor-ns-resize' : handle === 'e' ? 'right-[-8px] top-1/2 mt-[-6.5px] cursor-ew-resize' : handle === 'w' ? 'left-[-8px] top-1/2 mt-[-6.5px] cursor-ew-resize' : handle === 'ne' ? 'right-[-8px] top-[-8px] cursor-nesw-resize' : handle === 'nw' ? 'left-[-8px] top-[-8px] cursor-nwse-resize' : handle === 'se' ? 'right-[-8px] bottom-[-8px] cursor-nwse-resize' : 'bottom-[-8px] left-[-8px] cursor-nesw-resize'}`}
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
      <div className="px-4 pt-4 pb-3.5">
        <span className="mb-[9px] ml-0.5 block text-xs font-semibold text-white/64">Aspect ratio</span>
        <div className="flex gap-1" role="group" aria-label="Aspect ratio">
          {ratios.map((item) => (
            <button
              key={item.label}
              className={`min-w-0 flex-1 cursor-pointer rounded-full border-0 px-0.5 py-1 text-[8px] font-semibold text-[#181818] ${ratio === item.value ? 'bg-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.3)]' : 'bg-[#f1f1f1] hover:bg-white'}`}
              onClick={() => selectRatio(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-[15px] flex items-end gap-2">
          <label className="grid grid-cols-[16px_1fr] items-center gap-[5px] text-xs font-semibold text-white/64">
            W
            <input
              className="h-7 w-20 rounded-[7px] border border-sky-200/22 bg-[#252525] px-2 py-1 text-[11px] font-semibold text-[#f5f5f5] outline-none focus:border-[#f1f1f1] focus:shadow-[0_0_0_2px_rgba(159,227,254,.2)]"
              inputMode="numeric"
              value={crop.width || ''}
              onChange={(event) => setDimension('width', event.target.value)}
            />
          </label>
          <label className="grid grid-cols-[16px_1fr] items-center gap-[5px] text-xs font-semibold text-white/64">
            H
            <input
              className="h-7 w-20 rounded-[7px] border border-sky-200/22 bg-[#252525] px-2 py-1 text-[11px] font-semibold text-[#f5f5f5] outline-none focus:border-[#f1f1f1] focus:shadow-[0_0_0_2px_rgba(159,227,254,.2)]"
              inputMode="numeric"
              value={crop.height || ''}
              onChange={(event) => setDimension('height', event.target.value)}
            />
          </label>
          <span className="pb-2 text-xs text-white/64">px</span>
        </div>
      </div>
      <footer className="flex items-center justify-between border-t border-sky-200/16 px-4 pt-[13px] pb-4">
        {statusMessage && <span className="text-[8px] text-emerald-400">{statusMessage}</span>}
        <button className="cursor-pointer rounded-full border-0 bg-[#f1f1f1] px-1.5 py-1 text-[8px] font-semibold text-[#181818] hover:bg-white" onClick={() => selectRatio(ratio)}>Reset</button>
        <button
          className="cursor-pointer rounded-full border-0 bg-[#f1f1f1] px-1.5 py-1 text-[8px] font-semibold text-[#181818] hover:bg-white disabled:cursor-default disabled:opacity-45"
          disabled={!crop.width || isProcessing}
          onClick={() => onApply(crop)}
        >
          {isProcessing ? 'Cropping…' : 'Apply'}
        </button>
      </footer>
    </motion.section>
  )
}
