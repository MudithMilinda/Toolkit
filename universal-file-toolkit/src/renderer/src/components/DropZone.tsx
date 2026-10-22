import { useRef, type DragEvent, type PropsWithChildren } from 'react'

interface DropZoneProps extends PropsWithChildren {
  isDragging: boolean
  onDismiss?: () => void
  dragHandlers: Record<string, (event: DragEvent<HTMLElement>) => void>
}
export default function DropZone({
  children,
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
      className="grid size-full cursor-default place-items-center"
      {...dragHandlers}
      onClick={(event) => {
        // The full window is the drop zone, but its transparent area is covered
        // by layout wrappers. Treat clicks outside an active panel as dismissal.
        const target = event.target
        const clickedPanel =
          target instanceof Element &&
          target.closest('.radial-menu, [data-panel]') !== null
        if (!clickedPanel) onDismiss?.()
      }}
    >
      <input ref={inputRef} className="hidden" type="file" onChange={selectFile} />
      {children}
    </div>
  )
}
