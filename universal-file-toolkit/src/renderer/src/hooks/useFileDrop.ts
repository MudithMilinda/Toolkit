import { useCallback, useRef, useState, type DragEvent } from 'react'
export function useFileDrop(): {
  file: File | null
  isDragging: boolean
  reset: () => void
  dragHandlers: Record<string, (event: DragEvent<HTMLElement>) => void>
} {
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const depth = useRef(0)
  const hasFiles = (event: DragEvent<HTMLElement>): boolean =>
    Array.from(event.dataTransfer.types).includes('Files')
  const onDragEnter = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    if (hasFiles(event)) {
      depth.current += 1
      setIsDragging(true)
    }
  }, [])
  const onDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    if (hasFiles(event)) {
      depth.current -= 1
      if (depth.current <= 0) {
        depth.current = 0
        setIsDragging(false)
      }
    }
  }, [])
  const onDragOver = useCallback((event: DragEvent<HTMLElement>) => event.preventDefault(), [])
  const onDrop = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    depth.current = 0
    setIsDragging(false)
    const next = event.dataTransfer.files?.[0]
    if (next) setFile(next)
  }, [])
  return {
    file,
    isDragging,
    reset: () => {
      setFile(null)
      setIsDragging(false)
      depth.current = 0
    },
    dragHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop }
  }
}
