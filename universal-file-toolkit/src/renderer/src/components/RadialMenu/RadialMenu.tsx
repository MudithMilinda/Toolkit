import { useCallback, useEffect, useState } from 'react'
import { FileQuestion, FileText } from 'lucide-react'
import type { FileOperation } from '../../utils/fileFormats'
import { getFileCategory, getFileExtension } from '../../utils/fileFormats'
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation'
import RadialSegment from './RadialSegment'
import './radialMenu.css'

interface Props {
  file: File | null
  draggedFileName?: string | null
  convertOperations: FileOperation[]
  toolOperations: FileOperation[]
  activeModifier?: 'shift' | 'command'
  selectedOperation: FileOperation | null
  isDragging?: boolean
  processingProgress?: number | 'finalizing' | null
  onSelect: (operation: FileOperation) => void
  onDirectFileDrop?: (files: File[], index: number) => void
  onDismiss: () => void
}

export default function RadialMenu({
  file,
  draggedFileName,
  convertOperations,
  toolOperations,
  activeModifier,
  selectedOperation,
  isDragging = false,
  processingProgress = null,
  onSelect,
  onDirectFileDrop,
  onDismiss
}: Props): React.JSX.Element {
  const [hovered, setHovered] = useState<number | null>(null)
  const [modifier, setModifier] = useState<'shift' | 'command'>('shift')
  useEffect(() => {
    if (activeModifier) setModifier(activeModifier)
  }, [activeModifier])
  useEffect(() => {
    const updateModifier = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === 'q') {
        event.preventDefault()
        setModifier('command')
      } else if (event.shiftKey || event.key === 'Shift') setModifier('shift')
    }
    const resetModifier = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === 'q' || event.key === 'Shift') setModifier('shift')
    }
    window.addEventListener('keydown', updateModifier)
    window.addEventListener('keyup', resetModifier)
    return () => {
      window.removeEventListener('keydown', updateModifier)
      window.removeEventListener('keyup', resetModifier)
    }
  }, [])
  // Audio has conversion formats but no Q-only tool actions. If a modifier
  // event arrives late during a Finder drag, retain its conversion wheel
  // rather than rendering an empty ring.
  const operations =
    modifier === 'command' && toolOperations.length ? toolOperations : convertOperations
  useEffect(() => setHovered(null), [modifier])
  const selectIndex = useCallback(
    (index: number) => {
      if (operations[index]) onSelect(operations[index])
    },
    [onSelect, operations]
  )
  const keyboardIndex = useKeyboardNavigation(operations.length, selectIndex, onDismiss)
  const previewFileName = file?.name ?? draggedFileName ?? null
  const category = previewFileName ? getFileCategory(previewFileName) : 'image'
  const hoveredOperation = hovered !== null ? operations[hovered] : null
  const centerLabel =
    processingProgress !== null
      ? processingProgress === 'finalizing'
        ? 'Finalizing'
        : processingProgress >= 100
          ? 'Done'
          : 'Converting'
      : isDragging && hoveredOperation
        ? hoveredOperation.label
        : previewFileName
          ? getFileExtension(previewFileName).toUpperCase()
          : 'DROP FILE'
  const centerSubLabel =
    processingProgress !== null
      ? processingProgress === 'finalizing'
        ? 'almost there…'
        : `${processingProgress}%`
      : isDragging && hoveredOperation
        ? 'release to convert'
        : previewFileName
          ? category
          : 'ready to convert'

  if (file && !convertOperations.length) {
    return (
      <div className="unsupported">
        <FileQuestion size={34} />
        <h2>Unsupported format</h2>
        <p>
          <b>{getFileExtension(file.name).toUpperCase() || 'This file'}</b> can be inspected, but it
          has no prototype operations yet.
        </p>
      </div>
    )
  }

  return (
    <div className="radial-menu" aria-label="File operation menu">
      <svg viewBox="0 0 300 300" className="radial-svg">
        {operations.map((operation, index) => (
          <RadialSegment
            key={operation.id}
            operation={operation}
            index={index}
            total={operations.length}
            active={hovered === index || (hovered === null && keyboardIndex === index)}
            selected={selectedOperation?.id === operation.id}
            onHover={() => setHovered(index)}
            onSelect={() => selectIndex(index)}
            onFileDrop={(droppedFiles) => onDirectFileDrop?.(droppedFiles, index)}
          />
        ))}
      </svg>
      <div className="radial-center">
        <FileText size={26} />
        <span>{centerLabel}</span>
        <small>{centerSubLabel}</small>
      </div>
    </div>
  )
}
