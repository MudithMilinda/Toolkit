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
  onCompress,
  statusMessage
}: {
  mode: 'resize' | 'compress'
  file: File
  onCancel: () => void
  onResize: (payload: ResizePayload) => void
  onCompress: (payload: CompressPayload) => void
  statusMessage?: string | null
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
        data-panel
        className="w-[min(340px,calc(100vw-20px))] overflow-hidden rounded-[20px] border border-sky-200/22 bg-[#181818] text-[#f5f5f5] shadow-[0_18px_42px_rgba(0,0,0,.42)]"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97, y: -5 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        onSubmit={(event) => {
          event.preventDefault()
          onCompress({ quality, maxDimension })
        }}
      >
        <header className="relative grid h-11 place-items-center border-b border-sky-200/16">
          <button
            type="button"
            className="absolute left-3 grid size-6 place-items-center rounded-full bg-[#f1f1f1] p-0 text-[#181818] hover:bg-white [&>svg]:size-3"
            onClick={onCancel}
            aria-label="Close compressor"
          >
            <X size={24} strokeWidth={2.4} />
          </button>
          <h1 className="m-0 text-[15px] tracking-[-.04em]">Compress</h1>
        </header>
        <div className="px-4 pt-3 pb-2.5">
          <p className="m-0 mb-[15px] overflow-hidden text-[11px] text-white/64 text-ellipsis whitespace-nowrap" title={file.name}>
            {file.name}
          </p>
          <p className="m-0 mb-3 text-[13px] font-bold tracking-[-.025em]">Original size: {formatBytes(file.size)}</p>
          <h2 className="m-0 mb-2 text-xs tracking-[-.02em]">Compression preset</h2>
          <div className="flex w-fit gap-1" role="group" aria-label="Compression preset">
            <button
              type="button"
              className={`cursor-pointer rounded-full border-0 px-1.5 py-0.5 text-[8px] text-[#181818] ${quality === 78 ? 'bg-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.32)]' : 'bg-[#f1f1f1] hover:bg-white'}`}
              onClick={() => setQuality(78)}
            >
              Balanced
            </button>
            <button
              type="button"
              className={`cursor-pointer rounded-full border-0 px-1.5 py-0.5 text-[8px] text-[#181818] ${quality === 55 ? 'bg-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.32)]' : 'bg-[#f1f1f1] hover:bg-white'}`}
              onClick={() => setQuality(55)}
            >
              Strong
            </button>
          </div>
          <p className="my-2 mb-3 text-[10px] text-white/64">
            {quality === 55
              ? 'Smaller file with more quality loss.'
              : 'Smaller file with less quality loss.'}
          </p>
          <label className="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-2 text-[10px] font-semibold">
            <span>Image size</span>
            <select
              className="w-full min-w-0 rounded-lg border-0 bg-[#252525] px-2 py-[7px] pr-[25px] text-[10px] text-[#f5f5f5] outline-none"
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
            <p className="m-0 mt-2 text-[10px] text-white/64">
              Original dimensions: {dimensions.width} × {dimensions.height} px
            </p>
          )}
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-[3px] rounded-[10px] bg-[#252525] p-2.5">
            <span className="text-[11px] text-white/64">Estimated output</span>
            <strong className="text-sm">{formatBytes(estimate.bytes)}</strong>
            <small className={`col-span-full text-[11px] ${estimate.percent >= 0 ? 'text-[#21815d]' : 'text-[#be4d35]'}`}>
              {estimate.percent >= 0
                ? `About ${estimate.percent}% smaller`
                : `About ${Math.abs(estimate.percent)}% larger`}
            </small>
          </div>
        </div>
        <footer className="flex items-center justify-end gap-1.5 border-t border-sky-200/16 px-3 pt-2 pb-2.5">
          {statusMessage && <span className="mr-auto text-[8px] text-emerald-400">{statusMessage}</span>}
          <button className="cursor-pointer rounded-full border-0 bg-[#f1f1f1] px-1.5 py-1 text-[8px] font-semibold text-[#181818] hover:bg-white" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="cursor-pointer rounded-full border-0 bg-[#f1f1f1] px-1.5 py-1 text-[8px] font-semibold text-[#181818] hover:bg-white" type="submit">
            Compress
          </button>
        </footer>
      </motion.form>
    )
  }

  return (
    <motion.form
      data-panel
      className="w-[292px] rounded-[22px] border border-sky-200/22 bg-[#181818] p-[15px] text-[#f5f5f5] shadow-[0_22px_55px_rgba(0,0,0,.46)]"
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
      <header className="mb-[15px] flex items-center gap-[9px]">
        <span className="grid size-[29px] place-items-center rounded-[10px] bg-cyan-400/12 text-cyan-200">
          <Minimize2 size={16} />
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <strong className="text-xs">Resize image</strong>
          <small className="overflow-hidden text-[9px] text-white/64 text-ellipsis whitespace-nowrap" title={file.name}>{file.name}</small>
        </div>
        <button
          type="button"
          className="grid size-[30px] cursor-pointer place-items-center rounded-full border-0 bg-[#f1f1f1] p-0 text-[#181818] hover:bg-white [&>svg]:size-[15px]"
          onClick={onCancel}
          aria-label="Cancel"
        >
          <X size={15} />
        </button>
      </header>
      <div className="grid grid-cols-[1fr_12px_1fr] items-end gap-1.5">
        <label className="grid gap-[5px] text-[9px] text-white/64">
          Width
          <input
            className="w-full rounded-[9px] border border-sky-200/22 bg-[#252525] p-[7px] text-[11px] text-[#f5f5f5] outline-none"
            inputMode="numeric"
            value={width}
            onChange={(event) => setWidth(event.target.value.replace(/\D/g, ''))}
            placeholder="auto"
          />
        </label>
        <span className="pb-[7px] text-center text-[#8290ac]">×</span>
        <label className="grid gap-[5px] text-[9px] text-white/64">
          Height
          <input
            className="w-full rounded-[9px] border border-sky-200/22 bg-[#252525] p-[7px] text-[11px] text-[#f5f5f5] outline-none"
            inputMode="numeric"
            value={height}
            onChange={(event) => setHeight(event.target.value.replace(/\D/g, ''))}
            placeholder="auto"
          />
        </label>
      </div>
      <label className="mt-[11px] grid gap-[5px] text-[9px] text-white/64">
        Fit
        <select
          className="w-full rounded-[9px] border border-sky-200/22 bg-[#252525] p-[7px] text-[11px] text-[#f5f5f5] outline-none"
          value={fit}
          onChange={(event) => setFit(event.target.value as ResizePayload['fit'])}
        >
          <option value="inside">Inside — keep ratio</option>
          <option value="cover">Cover</option>
          <option value="fill">Stretch</option>
        </select>
      </label>
      <label className="mt-[11px] flex items-center gap-1.5 text-[10px] text-white/64">
        <input
          className="w-auto accent-[#f1f1f1]"
          type="checkbox"
          checked={withoutEnlargement}
          onChange={(event) => setWithoutEnlargement(event.target.checked)}
        />{' '}
        Never enlarge
      </label>
      <footer className="mt-[15px] flex items-center justify-end gap-[7px]">
        {statusMessage && <span className="mr-auto text-[8px] text-emerald-400">{statusMessage}</span>}
        <button className="cursor-pointer rounded-full border-0 bg-[#f1f1f1] px-1.5 py-1 text-[8px] text-[#181818] hover:bg-white" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="cursor-pointer rounded-full border-0 bg-[#f1f1f1] px-1.5 py-1 text-[8px] text-[#181818] hover:bg-white" type="submit">
          Apply
        </button>
      </footer>
    </motion.form>
  )
}
