import { useEffect, useState } from 'react'
export function useKeyboardNavigation(
  length: number,
  onSelect: (index: number) => void,
  onDismiss: () => void
): number {
  const [activeIndex, setActiveIndex] = useState(0)
  useEffect(() => {
    const keydown = (event: KeyboardEvent): void => {
      if (!length) return
      if (event.key === 'Escape') onDismiss()
      if (['ArrowRight', 'ArrowDown'].includes(event.key)) {
        event.preventDefault()
        setActiveIndex((value) => (value + 1) % length)
      }
      if (['ArrowLeft', 'ArrowUp'].includes(event.key)) {
        event.preventDefault()
        setActiveIndex((value) => (value - 1 + length) % length)
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onSelect(activeIndex)
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [activeIndex, length, onDismiss, onSelect])
  return activeIndex
}
