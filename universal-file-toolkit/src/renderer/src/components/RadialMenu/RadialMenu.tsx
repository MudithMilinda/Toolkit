import { useCallback, useState } from 'react'
import { FileQuestion, FileText } from 'lucide-react'
import type { FileOperation } from '../../utils/fileFormats'
import { getFileCategory, getFileExtension } from '../../utils/fileFormats'
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation'
import RadialSegment from './RadialSegment'
import OperationTooltip from '../OperationTooltip'
import './radialMenu.css'

interface Props {
  file: File | null
  operations: FileOperation[]
  selectedOperation: FileOperation | null
  onSelect: (operation: FileOperation) => void
  onDismiss: () => void
}

export default function RadialMenu({
  file,
  operations,
  selectedOperation,
  onSelect,
  onDismiss
}: Props): React.JSX.Element {
  const [hovered, setHovered] = useState<number | null>(null)
  const selectIndex = useCallback(
    (index: number) => {
      if (operations[index]) onSelect(operations[index])
    },
    [onSelect, operations]
  )
  const keyboardIndex = useKeyboardNavigation(operations.length, selectIndex, onDismiss)
  const category = file ? getFileCategory(file.name) : 'image'

  if (file && !operations.length) {
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
          />
        ))}
      </svg>
      <div className="radial-center">
        <FileText size={26} />
        <span>{file ? getFileExtension(file.name).toUpperCase() : 'DROP FILE'}</span>
        <small>{file ? category : 'ready to convert'}</small>
      </div>
    </div>
  )
}
