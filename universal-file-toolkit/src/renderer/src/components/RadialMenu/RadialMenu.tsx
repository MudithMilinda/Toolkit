import { useCallback, useEffect, useState } from 'react'
import { FileQuestion, FileText } from 'lucide-react'
import type { FileOperation } from '../../utils/fileFormats'
import { getFileCategory, getFileExtension } from '../../utils/fileFormats'
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation'
import RadialSegment from './RadialSegment'
import OperationTooltip from '../OperationTooltip'
import './radialMenu.css'

interface Props {
  file: File | null
  convertOperations: FileOperation[]
  toolOperations: FileOperation[]
  activeModifier?: 'shift' | 'command'
  selectedOperation: FileOperation | null
  isDragging?: boolean
  onSelect: (operation: FileOperation) => void
  onDirectFileDrop?: (file: File, operation: FileOperation) => void
  onDismiss: () => void
}

export default function RadialMenu({
  file,
  convertOperations,
  toolOperations,
  activeModifier,
  selectedOperation,
  isDragging = false,
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
      if (event.key === 'Tab') {
        event.preventDefault()
        setModifier('command')
      }
      else if (event.shiftKey || event.key === 'Shift') setModifier('shift')
    }
    const resetModifier = (event: KeyboardEvent): void => {
      if (event.key === 'Tab' || event.key === 'Shift') setModifier('shift')
    }
    window.addEventListener('keydown', updateModifier)
    window.addEventListener('keyup', resetModifier)
    return () => {
      window.removeEventListener('keydown', updateModifier)
      window.removeEventListener('keyup', resetModifier)
    }
  }, [])
  const operations = modifier === 'command' ? toolOperations : convertOperations
  useEffect(() => setHovered(null), [modifier])
  const selectIndex = useCallback(
    (index: number) => {
      if (operations[index]) onSelect(operations[index])
    },
    [onSelect, operations]
  )
  const keyboardIndex = useKeyboardNavigation(operations.length, selectIndex, onDismiss)
  const category = file ? getFileCategory(file.name) : 'image'
  const hoveredOperation = hovered !== null ? operations[hovered] : null
  const centerLabel =
    isDragging && hoveredOperation
      ? hoveredOperation.label
      : file
        ? getFileExtension(file.name).toUpperCase()
        : 'DROP FILE'
  const centerSubLabel =
    isDragging && hoveredOperation
      ? `release to convert as ${hoveredOperation.label.toLowerCase()}`
      : file
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
      <OperationTooltip
        label={hovered !== null ? operations[hovered].label : 'Use arrows + Enter'}
      />
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
            onFileDrop={(droppedFile) => onDirectFileDrop?.(droppedFile, operation)}
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
