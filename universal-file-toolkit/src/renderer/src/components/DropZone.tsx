import { useRef, type DragEvent, type PropsWithChildren } from 'react'

interface DropZoneProps extends PropsWithChildren {
  isDragging: boolean
  hasFile: boolean
  onClear: () => void
  onDismiss?: () => void
  dragHandlers: Record<string, (event: DragEvent<HTMLElement>) => void>
}
export default function DropZone({
  children,
  isDragging,
  hasFile,
  onClear,
  onDismiss,
  dragHandlers
}: DropZoneProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const selectFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    if (file) {
      const transfer = new DataTransfer()
      transfer.items.add(file)
      dragHandlers.onDrop({
        preventDefault: () => undefined,
        dataTransfer: transfer
      } as unknown as DragEvent<HTMLElement>)
    }
    event.target.value = ''
  }
  return (
    <div
      className={`drop-zone ${isDragging ? 'is-dragging' : ''} ${hasFile ? 'has-file' : ''}`}
      {...dragHandlers}
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss?.()
      }}
    >
      <input ref={inputRef} className="file-input" type="file" onChange={selectFile} />
      {hasFile && (
        <button
          className="clear-button"
          onClick={(event) => {
            event.stopPropagation()
            onClear()
          }}
        >
          New file
        </button>
      )}
      {isDragging && <div className="drag-overlay">Release to add this file</div>}
      {children}
    </div>
  )
}
