import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { Circle, Highlighter, RotateCw, Square, Type, Undo2, X, ZoomIn } from 'lucide-react'
import { motion } from 'motion/react'

type Edits = {
  exposure: number
  brightness: number
  contrast: number
  highlights: number
  shadows: number
  whites: number
  blacks: number
  saturation: number
  vibrance: number
  hue: number
  temperature: number
  tint: number
  gamma: number
}
type Annotation = {
  kind: 'text' | 'rectangle' | 'circle' | 'pen' | 'step' | 'magnify'
  x: number
  y: number
  x2?: number
  y2?: number
  text?: string
  points?: string
}
const initial: Edits = {
  exposure: 0,
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  saturation: 0,
  vibrance: 0,
  hue: 0,
  temperature: 0,
  tint: 0,
  gamma: 0
}
const fields: { key: keyof Edits; label: string; min: number; max: number; unit?: string }[] = [
  { key: 'exposure', label: 'Exposure', min: -2, max: 2, unit: ' EV' },
  { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100 },
  { key: 'shadows', label: 'Shadows', min: -100, max: 100 },
  { key: 'whites', label: 'Whites', min: -100, max: 100 },
  { key: 'blacks', label: 'Blacks', min: -100, max: 100 },
  { key: 'gamma', label: 'Gamma', min: -80, max: 80 },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100 },
  { key: 'tint', label: 'Tint', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
  { key: 'vibrance', label: 'Vibrance', min: -100, max: 100 },
  { key: 'hue', label: 'Hue', min: -180, max: 180, unit: '°' }
]
export default function ImageEditPanel({
  file,
  onCancel,
  onSave,
  statusMessage
}: {
  file: File
  onCancel: () => void
  onSave: (edits: Edits & { rotation: number }) => void
  statusMessage?: string | null
}): React.JSX.Element {
  const [source, setSource] = useState('')
  const [edits, setEdits] = useState(initial)
  const [rotation, setRotation] = useState(0)
  const [tool, setTool] = useState<'pen' | 'text' | 'rectangle' | 'circle' | 'step' | 'magnify'>(
    'pen'
  )
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [draft, setDraft] = useState<Annotation | null>(null)
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSource(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const set = (key: keyof Edits, value: number): void =>
    setEdits((current) => ({ ...current, [key]: value }))
  const previewBrightness =
    Math.max(0, 1 + (edits.brightness + edits.whites * 0.35 + edits.blacks * 0.2) / 100) *
    2 ** edits.exposure
  const previewContrast = Math.max(
    0.1,
    1 + (edits.contrast + edits.highlights * 0.16 - edits.shadows * 0.22 + edits.gamma) / 100
  )
  const preview = {
    filter: `brightness(${previewBrightness}) contrast(${previewContrast}) saturate(${Math.max(0, 1 + (edits.saturation + edits.vibrance * 0.55) / 100)}) hue-rotate(${edits.hue + edits.tint * 0.12}deg)`
  }
  const temperatureWash = {
    background: edits.temperature >= 0 ? '#ff9c52' : '#4ca3ff',
    opacity: Math.abs(edits.temperature) / 520
  }
  const point = (
    event: Pick<MouseEvent<HTMLDivElement>, 'clientX' | 'clientY'>
  ): { x: number; y: number } => {
    const bounds = previewRef.current!.getBoundingClientRect()
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100
    }
  }
  const beginAnnotation = (event: PointerEvent<HTMLDivElement>): void => {
    const { x, y } = point(event)
    if (tool === 'text') {
      return
    }
    if (tool === 'step' || tool === 'magnify') {
      setAnnotations((items) => [
        ...items,
        {
          kind: tool,
          x,
          y,
          text:
            tool === 'step'
              ? String(items.filter((item) => item.kind === 'step').length + 1)
              : undefined
        }
      ])
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraft({ kind: tool, x, y, x2: x, y2: y, points: tool === 'pen' ? `${x},${y}` : undefined })
  }
  const moveAnnotation = (event: PointerEvent<HTMLDivElement>): void => {
    if (!draft) return
    const { x, y } = point(event)
    setDraft((item) =>
      item
        ? {
            ...item,
            x2: x,
            y2: y,
            points: item.kind === 'pen' ? `${item.points} ${x},${y}` : item.points
          }
        : null
    )
  }
  const endAnnotation = (): void => {
    if (draft) setAnnotations((items) => [...items, draft])
    setDraft(null)
  }
  return (
    <motion.section
      data-panel
      className="flex h-[min(480px,calc(100vh-20px))] w-[min(460px,calc(100vw-20px))] flex-col overflow-hidden rounded-[24px] border border-sky-200/22 bg-[#181818] text-[#f5f5f5] shadow-[0_18px_42px_rgba(0,0,0,.42)]"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
    >
      <header className="relative grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-sky-200/16 px-3">
        <button
          className="grid size-6 cursor-pointer place-items-center rounded-full border-0 bg-[#f1f1f1] p-0 text-[#181818] hover:bg-white [&>svg]:size-3"
          onClick={onCancel}
          aria-label="Close editor"
        >
          <X size={18} />
        </button>
        <h1 className="m-0 text-[15px]">Edit Photo</h1>
        <button
          className="justify-self-end cursor-pointer rounded-full border-0 bg-[#f1f1f1] px-1.5 py-1 text-[8px] text-[#181818] hover:bg-white"
          onClick={() => {
            setEdits(initial)
            setRotation(0)
            setAnnotations([])
            setDraft(null)
          }}
        >
          Reset
        </button>
      </header>
      <div
        className="relative grid h-[200px] shrink-0 place-items-center overflow-hidden bg-[#161616] touch-none"
        ref={previewRef}
        onPointerDown={beginAnnotation}
        onPointerMove={moveAnnotation}
        onPointerUp={endAnnotation}
        onClick={(event) => {
          if (tool === 'text') {
            const { x, y } = point(event)
            setTextDraft({ x, y, value: '' })
          }
        }}
      >
        {source && (
          <img
            src={source}
            className="size-full object-contain select-none"
            alt="Edit preview"
            draggable={false}
            style={{
              ...preview,
              transform: `rotate(${rotation}deg) scale(${rotation % 180 === 0 ? 1 : 0.62})`
            }}
          />
        )}
        <span className="pointer-events-none absolute inset-0 mix-blend-soft-light" style={temperatureWash} />
        {textDraft && (
          <input
            className="absolute z-3 min-w-[110px] -translate-y-full rounded border border-[#f1f1f1] bg-transparent px-1.5 py-1 text-[13px] font-medium text-white outline-none shadow-[0_0_0_2px_rgba(159,227,254,.2)] placeholder:text-white/82"
            autoFocus
            value={textDraft.value}
            style={{ left: `${textDraft.x}%`, top: `${textDraft.y}%` }}
            placeholder="Type text…"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setTextDraft({ ...textDraft, value: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && textDraft.value.trim()) {
                setAnnotations((items) => [
                  ...items,
                  { kind: 'text', x: textDraft.x, y: textDraft.y, text: textDraft.value.trim() }
                ])
                setTextDraft(null)
              }
              if (event.key === 'Escape') setTextDraft(null)
            }}
            onBlur={() => {
              if (textDraft.value.trim())
                setAnnotations((items) => [
                  ...items,
                  { kind: 'text', x: textDraft.x, y: textDraft.y, text: textDraft.value.trim() }
                ])
              setTextDraft(null)
            }}
          />
        )}
        <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {[...annotations, ...(draft ? [draft] : [])].map((item, index) => (
            <AnnotationShape key={index} item={item} />
          ))}
        </svg>
      </div>
      <nav className="flex shrink-0 gap-1.5 border-b border-sky-200/16 bg-[#181818] px-3 py-1.5" aria-label="Annotation tools">
        <button
          type="button"
          onClick={() => setAnnotations((items) => items.slice(0, -1))}
          className="grid size-6 cursor-pointer place-items-center rounded-full border-0 bg-[#f1f1f1] text-[#181818] hover:bg-white"
          title="Undo last annotation"
        >
          <Undo2 size={14} />
        </button>
        <button
          type="button"
          onClick={() => setRotation((value) => (value + 90) % 360)}
          className="grid size-6 cursor-pointer place-items-center rounded-full border-0 bg-[#f1f1f1] text-[#181818] hover:bg-white"
          title="Rotate 90 degrees"
        >
          <RotateCw size={14} />
        </button>
        <button
          type="button"
          className={`grid size-6 cursor-pointer place-items-center rounded-full border-0 text-[#181818] ${tool === 'text' ? 'bg-white' : 'bg-[#f1f1f1] hover:bg-white'}`}
          onClick={() => setTool('text')}
          title="Text"
        >
          <Type size={14} />
        </button>
        <button
          type="button"
          className={`grid size-6 cursor-pointer place-items-center rounded-full border-0 text-[#181818] ${tool === 'rectangle' ? 'bg-white' : 'bg-[#f1f1f1] hover:bg-white'}`}
          onClick={() => setTool('rectangle')}
          title="Rectangle"
        >
          <Square size={14} />
        </button>
        <button
          type="button"
          className={`grid size-6 cursor-pointer place-items-center rounded-full border-0 text-[#181818] ${tool === 'circle' ? 'bg-white' : 'bg-[#f1f1f1] hover:bg-white'}`}
          onClick={() => setTool('circle')}
          title="Circle"
        >
          <Circle size={14} />
        </button>
        <button
          type="button"
          className={`grid size-6 cursor-pointer place-items-center rounded-full border-0 text-[#181818] ${tool === 'pen' ? 'bg-white' : 'bg-[#f1f1f1] hover:bg-white'}`}
          onClick={() => setTool('pen')}
          title="Draw"
        >
          <Highlighter size={14} />
        </button>
        <button
          type="button"
          className={`grid size-6 cursor-pointer place-items-center rounded-full border-0 text-[#181818] ${tool === 'step' ? 'bg-white' : 'bg-[#f1f1f1] hover:bg-white'}`}
          onClick={() => setTool('step')}
          title="Numbered marker"
        >
          1
        </button>
        <button
          type="button"
          className={`grid size-6 cursor-pointer place-items-center rounded-full border-0 text-[#181818] ${tool === 'magnify' ? 'bg-white' : 'bg-[#f1f1f1] hover:bg-white'}`}
          onClick={() => setTool('magnify')}
          title="Magnifier"
        >
          <ZoomIn size={14} />
        </button>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto px-[18px] py-3">
        <h2 className="my-[5px] mb-2 text-xs text-white/64">Light</h2>
        {fields.slice(0, 8).map((field) => (
          <Control key={field.key} field={field} value={edits[field.key]} onChange={set} />
        ))}
        <h2 className="my-[5px] mb-2 text-xs text-white/64">Color</h2>
        {fields.slice(8).map((field) => (
          <Control key={field.key} field={field} value={edits[field.key]} onChange={set} />
        ))}
      </div>
      <footer className="flex min-h-12 shrink-0 items-center justify-end border-t border-sky-200/16 bg-[#181818] px-3 py-2">
        {statusMessage && <span className="mr-auto text-[8px] text-emerald-400">{statusMessage}</span>}
        <button className="cursor-pointer rounded-full border-0 bg-[#f1f1f1] px-1.5 py-1 text-[8px] font-semibold tracking-[-.02em] text-[#181818] hover:bg-white" onClick={() => onSave({ ...edits, rotation })}>Save Edited Copy</button>
      </footer>
    </motion.section>
  )
}
function Control({
  field,
  value,
  onChange
}: {
  field: (typeof fields)[number]
  value: number
  onChange: (key: keyof Edits, value: number) => void
}): React.JSX.Element {
  return (
    <label className="my-1 grid grid-cols-[105px_1fr_34px_18px] items-center gap-2 text-[10px]">
      <span>{field.label}</span>
      <input
        className="w-full accent-[#f1f1f1]"
        type="range"
        min={field.min}
        max={field.max}
        step={field.key === 'exposure' ? 0.1 : 1}
        value={value}
        onChange={(event) => onChange(field.key, Number(event.target.value))}
      />
      <output className="text-right text-[11px] text-white/64">
        {value > 0 ? '+' : ''}
        {value}
        {field.unit ?? ''}
      </output>
      <button
        className="cursor-pointer border-0 bg-transparent text-white hover:bg-[#252525]"
        onClick={() => onChange(field.key, 0)}
        aria-label={`Reset ${field.label}`}
      >
        ↻
      </button>
    </label>
  )
}
function AnnotationShape({ item }: { item: Annotation }): React.JSX.Element {
  const width = (item.x2 ?? item.x) - item.x
  const height = (item.y2 ?? item.y) - item.y
  const common = { stroke: '#ff5a24', strokeWidth: 0.6, fill: 'none' }
  if (item.kind === 'rectangle')
    return <rect x={item.x} y={item.y} width={width} height={height} {...common} />
  if (item.kind === 'circle')
    return (
      <ellipse
        cx={item.x + width / 2}
        cy={item.y + height / 2}
        rx={Math.abs(width / 2)}
        ry={Math.abs(height / 2)}
        {...common}
      />
    )
  if (item.kind === 'pen') return <polyline points={item.points} {...common} strokeWidth={0.8} />
  if (item.kind === 'text')
    return (
      <text x={item.x} y={item.y} fill="#ff5a24" fontSize="4">
        {item.text}
      </text>
    )
  if (item.kind === 'step')
    return (
      <>
        <circle cx={item.x} cy={item.y} r="3" fill="#ff5a24" />
        <text x={item.x} y={item.y + 1.3} fill="#fff" fontSize="3" textAnchor="middle">
          {item.text}
        </text>
      </>
    )
  return (
    <>
      <circle cx={item.x} cy={item.y} r="6" {...common} />
      <circle cx={item.x} cy={item.y} r="1" fill="#ff5a24" />
    </>
  )
}
