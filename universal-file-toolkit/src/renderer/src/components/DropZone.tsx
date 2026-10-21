import { useRef, type DragEvent, type PropsWithChildren } from 'react'

interface DropZoneProps extends PropsWithChildren {
  isDragging: boolean
  onDismiss?: () => void
  dragHandlers: Record<string, (event: DragEvent<HTMLElement>) => void>
}
export default function DropZone({
  children,
  isDragging,
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
      className={`drop-zone ${isDragging ? 'is-dragging' : ''}`}
      {...dragHandlers}
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss?.()
      }}
    >
      <input ref={inputRef} className="file-input" type="file" onChange={selectFile} />
      {children}
    </div>
  )
}
