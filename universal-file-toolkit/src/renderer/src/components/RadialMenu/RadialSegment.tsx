import type { DragEvent } from 'react'
import type { FileOperation } from '../../utils/fileFormats'
import {
  Archive,
  FileOutput,
  Image,
  Info,
  Mail,
  Music2,
  Scissors,
  SlidersHorizontal
} from 'lucide-react'
import { motion } from 'motion/react'

interface Props {
  operation: FileOperation
  index: number
  total: number
  active: boolean
  selected: boolean
  onHover: () => void
  onSelect: () => void
  onFileDrop?: (files: File[]) => void
}

const CX = 150
const CY = 150
const R_IN = 60
const R_OUT = 128
const GAP = 9
const C_OUT = 18
const C_IN = 13
type Point = [number, number]

const radians = (degrees: number): number => (degrees * Math.PI) / 180
const fixed = (value: number): string => value.toFixed(2)
const angleOf = (point: Point): number => Math.atan2(point[1] - CY, point[0] - CX)
const circlePoint = (radius: number, angle: number): Point => [
  CX + radius * Math.cos(angle),
  CY + radius * Math.sin(angle)
]
const edgePoint = (angle: number, radius: number, side: 1 | -1): Point => {
  const distance = GAP / 2
  const tangent = Math.sqrt(radius * radius - distance * distance)
  return [
    CX + tangent * Math.cos(angle) - distance * Math.sin(angle) * side,
    CY + tangent * Math.sin(angle) + distance * Math.cos(angle) * side
  ]
}

/** Builds a rounded annular segment with quadratic curves at all four corners. */
function roundedSegmentPath(index: number, total: number): string {
  const step = 360 / total
  const start = radians(-90 + index * step - step / 2)
  const end = radians(-90 + index * step + step / 2)
  const outerCorner = Math.min(C_OUT, (R_OUT * radians(step)) / 4)
  const innerCorner = Math.min(C_IN, (R_IN * radians(step)) / 4)
  const innerStart = edgePoint(start, R_IN, 1)
  const outerStart = edgePoint(start, R_OUT, 1)
  const outerEnd = edgePoint(end, R_OUT, -1)
  const innerEnd = edgePoint(end, R_IN, -1)
  const startUnit: Point = [Math.cos(start), Math.sin(start)]
  const endUnit: Point = [Math.cos(end), Math.sin(end)]
  const a = [
    innerStart[0] + startUnit[0] * innerCorner,
    innerStart[1] + startUnit[1] * innerCorner
  ] as Point
  const b = [
    outerStart[0] - startUnit[0] * outerCorner,
    outerStart[1] - startUnit[1] * outerCorner
  ] as Point
  const c = circlePoint(R_OUT, angleOf(outerStart) + outerCorner / R_OUT)
  const d = circlePoint(R_OUT, angleOf(outerEnd) - outerCorner / R_OUT)
  const e = [
    outerEnd[0] - endUnit[0] * outerCorner,
    outerEnd[1] - endUnit[1] * outerCorner
  ] as Point
  const f = [
    innerEnd[0] + endUnit[0] * innerCorner,
    innerEnd[1] + endUnit[1] * innerCorner
  ] as Point
  const g = circlePoint(R_IN, angleOf(innerEnd) - innerCorner / R_IN)
  const h = circlePoint(R_IN, angleOf(innerStart) + innerCorner / R_IN)
  // Every menu slice is smaller than a semicircle. Comparing atan2 values here
  // breaks at the -π/π boundary and turns the left-hand slice into a giant arc.
  const outerLarge = step > 180 ? 1 : 0
  return [
    `M ${fixed(a[0])} ${fixed(a[1])}`,
    `L ${fixed(b[0])} ${fixed(b[1])}`,
    `Q ${fixed(outerStart[0])} ${fixed(outerStart[1])} ${fixed(c[0])} ${fixed(c[1])}`,
    `A ${R_OUT} ${R_OUT} 0 ${outerLarge} 1 ${fixed(d[0])} ${fixed(d[1])}`,
    `Q ${fixed(outerEnd[0])} ${fixed(outerEnd[1])} ${fixed(e[0])} ${fixed(e[1])}`,
    `L ${fixed(f[0])} ${fixed(f[1])}`,
    `Q ${fixed(innerEnd[0])} ${fixed(innerEnd[1])} ${fixed(g[0])} ${fixed(g[1])}`,
    `A ${R_IN} ${R_IN} 0 ${outerLarge} 0 ${fixed(h[0])} ${fixed(h[1])}`,
    `Q ${fixed(innerStart[0])} ${fixed(innerStart[1])} ${fixed(a[0])} ${fixed(a[1])}`,
    'Z'
  ].join(' ')
}

export default function RadialSegment({
  operation,
  index,
  total,
  active,
  selected,
  onHover,
  onSelect,
  onFileDrop
}: Props): React.JSX.Element {
  const labelAngle = radians(-90 + index * (360 / total))
  const [x, y] = circlePoint((R_IN + R_OUT) / 2 + 3, labelAngle)
  const Icon =
    operation.id === 'compress'
      ? Archive
      : operation.id === 'send-email'
        ? Mail
        : operation.id === 'edit'
          ? SlidersHorizontal
          : operation.id === 'crop' || operation.id === 'trim'
            ? Scissors
            : operation.id === 'metadata'
              ? Info
              : operation.id === 'audio' ||
                  operation.id === 'mp3' ||
                  operation.id === 'wav' ||
                  operation.id === 'aac'
                ? Music2
                : operation.id === 'png' || operation.id === 'jpg' || operation.id === 'webp'
                  ? Image
                  : FileOutput
  return (
    <motion.g
      className="radial-segment-group"
      role="button"
      aria-label={operation.label}
      onMouseEnter={onHover}
      onClick={(event) => {
        event.stopPropagation()
        onSelect()
      }}
      onDrop={(event: DragEvent<SVGGElement>) => {
        const files = Array.from(event.dataTransfer.files ?? [])
        if (!files.length) return
        event.preventDefault()
        event.stopPropagation()
        onFileDrop?.(files)
      }}
      onDragEnter={(event: DragEvent<SVGGElement>) => {
        event.preventDefault()
        onHover()
      }}
      onDragOver={(event: DragEvent<SVGGElement>) => {
        event.preventDefault()
        onHover()
      }}
      animate={{ scale: active ? 1.035 : 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
      style={{ transformOrigin: '150px 150px' }}
    >
      <path
        className={`radial-segment${active ? ' active' : ''}${selected ? ' selected' : ''}`}
        d={roundedSegmentPath(index, total)}
      />
      <Icon className="radial-icon" x={x - 6} y={y - 14} size={12} strokeWidth={1.8} />
      <text
        className="radial-label"
        x={x}
        y={y + 11}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {operation.label}
      </text>
    </motion.g>
  )
}
