import { useCallback, useRef, useState, type DragEvent } from 'react'
export function useFileDrop(): {
  file: File | null
  files: File[]
  isDragging: boolean
  loadFile: (file: File) => void
  loadFiles: (files: File[]) => void
  reset: () => void
  clearDragging: () => void
  dragHandlers: Record<string, (event: DragEvent<HTMLElement>) => void>
} {
  const [file, setFile] = useState<File | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const loadFile = useCallback((next: File): void => {
    setFile(next)
    setFiles([next])
  }, [])
  const loadFiles = useCallback((next: File[]): void => {
    setFile(next[0] ?? null)
    setFiles(next)
  }, [])
  const depth = useRef(0)
  const hasFiles = (event: DragEvent<HTMLElement>): boolean =>
    Array.from(event.dataTransfer.types).includes('Files')
  const onDragEnter = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    if (hasFiles(event)) {
      depth.current += 1
      // Chromium exposes the file name during a legitimate in-window drag.
      // Use it only to choose the matching radial actions; the actual file is
      // still accepted exclusively on drop.
      const previewFile = event.dataTransfer.files?.[0]
      if (previewFile?.name) loadFile(previewFile)
      setIsDragging(true)
    }
  }, [loadFile])
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
  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault()
      depth.current = 0
      setIsDragging(false)
      const next = Array.from(event.dataTransfer.files ?? [])
      if (next.length) {
        window.api.notifyDropReceived()
        loadFiles(next)
      }
    },
    [loadFiles]
  )
  return {
    file,
    files,
    isDragging,
    loadFile,
    loadFiles,
    reset: () => {
      setFile(null)
      setFiles([])
      setIsDragging(false)
      depth.current = 0
    },
    clearDragging: () => {
      setIsDragging(false)
      depth.current = 0
    },
    dragHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop }
  }
}
