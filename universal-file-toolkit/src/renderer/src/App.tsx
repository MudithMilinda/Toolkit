import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import AppLayout from './components/AppLayout'
import DropZone from './components/DropZone'
import RadialMenu from './components/RadialMenu/RadialMenu'
import { useFileDrop } from './hooks/useFileDrop'
import { getOperationsForFile, type FileOperation } from './utils/fileFormats'

function App(): React.JSX.Element {
  const { file, isDragging, dragHandlers, reset } = useFileDrop()
  const [operation, setOperation] = useState<FileOperation | null>(null)
  const [isClosing, setIsClosing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const handleOperation = useCallback(
    (nextOperation: FileOperation) => {
      if (!file) {
        setNotice('Drop a file into the center first.')
        return
      }
      void window.api.simulateOperation({
        name: file.name,
        size: file.size,
        type: file.type,
        operationId: nextOperation.id
      })
      setOperation(nextOperation)
      setNotice(`${nextOperation.label} is simulated — no file was changed.`)
      window.setTimeout(() => void window.api.closeRadialMenu(), 650)
    },
    [file]
  )
  const dismiss = useCallback((): void => {
    setIsClosing(true)
    window.setTimeout(() => void window.api.closeRadialMenu(), 160)
  }, [])
  const resetMenu = useCallback((): void => {
    reset()
    setOperation(null)
    setNotice(null)
    setIsClosing(false)
  }, [reset])
  useEffect(() => window.api.onRadialMenuOpened(resetMenu), [resetMenu])
  useEffect(
    () =>
      window.api.onSettingsRequested(() => {
        setNotice('Settings will be available when conversion preferences are implemented.')
      }),
    []
  )
  const operations = file ? getOperationsForFile(file.name) : getOperationsForFile('sample.png')

  return (
    <AppLayout>
      <section className="radial-utility" aria-label="Universal File Toolkit">
        <DropZone
          dragHandlers={dragHandlers}
          isDragging={isDragging}
          hasFile={Boolean(file)}
          onClear={resetMenu}
          onDismiss={dismiss}
        >
          <AnimatePresence>
            {!isClosing && (
              <motion.div
                className="compact-stage"
                initial={{ opacity: 0, scale: 0.82 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.82 }}
                transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              >
                <RadialMenu
                  file={file}
                  operations={operations}
                  selectedOperation={operation}
                  onSelect={handleOperation}
                  onDismiss={dismiss}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </DropZone>
      </section>
      <AnimatePresence>
        {notice && (
          <motion.p
            className="utility-notice"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {notice}
          </motion.p>
        )}
      </AnimatePresence>
    </AppLayout>
  )
}

export default App
