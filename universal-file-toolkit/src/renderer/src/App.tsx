import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import AppLayout from './components/AppLayout'
import DropZone from './components/DropZone'
import RadialMenu from './components/RadialMenu/RadialMenu'
import ImageOptionsPanel from './components/ImageOptionsPanel'
import ImageCropPanel from './components/ImageCropPanel'
import { useFileDrop } from './hooks/useFileDrop'
import {
  getFileToolOperations,
  getOperationsForFile,
  type FileOperation
} from './utils/fileFormats'

function App(): React.JSX.Element {
  const { file, isDragging, dragHandlers, loadFile, reset, clearDragging } = useFileDrop()
  const [operation, setOperation] = useState<FileOperation | null>(null)
  const [isClosing, setIsClosing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [dragModifier, setDragModifier] = useState<'shift' | 'command'>('shift')
  const [optionsMode, setOptionsMode] = useState<'resize' | 'compress' | 'crop' | null>(null)
  const handleOperation = useCallback(
    (nextOperation: FileOperation, selectedFile: File | null = file) => {
      if (!selectedFile) {
        setNotice('Drop a file into the center first.')
        return
      }
      clearDragging()
      setOperation(nextOperation)
      if (
        nextOperation.id === 'resize' ||
        nextOperation.id === 'compress' ||
        nextOperation.id === 'crop'
      ) {
        setOptionsMode(nextOperation.id)
        return
      }
      if (
        !['png', 'jpg', 'webp', 'pdf', 'heic', 'tiff', 'avif', 'bmp'].includes(nextOperation.id)
      ) {
        setNotice(`${nextOperation.label} editor is coming in the next image milestone.`)
        return
      }
      const inputPath = window.api.getPathForFile(selectedFile)
      if (!inputPath) {
        setNotice('The dropped file path could not be read. Please drop the file again.')
        return
      }
      setIsProcessing(true)
      setIsClosing(true)
      setNotice(`Converting ${selectedFile.name} to ${nextOperation.label}…`)
      window.setTimeout(() => void window.api.closeRadialMenu(), 220)
      void window.api
        .convertImage({
          inputPath,
          targetFormat: nextOperation.id as
            'png' | 'jpg' | 'webp' | 'pdf' | 'heic' | 'tiff' | 'avif' | 'bmp'
        })
        .then((result) => {
          const sizeNote =
            result.savedPercent > 0
              ? ` ${result.savedPercent}% smaller.`
              : ' Output size may be larger.'
          setNotice(`Conversion successful — ${result.outputPath.split(/[\\/]/).pop()}.${sizeNote}`)
        })
        .catch((error: unknown) => {
          setIsClosing(false)
          const message = error instanceof Error ? error.message : 'Image conversion failed.'
          if (!message.includes('already')) setNotice(message)
        })
        .finally(() => setIsProcessing(false))
    },
    [clearDragging, file]
  )
  const runEdit = useCallback(
    (
      mode: 'resize' | 'compress',
      payload: Omit<Parameters<typeof window.api.resizeImage>[0], 'inputPath'> | number
    ) => {
      if (!file) return
      const inputPath = window.api.getPathForFile(file)
      setOptionsMode(null)
      setIsProcessing(true)
      setIsClosing(true)
      setNotice(`${mode === 'resize' ? 'Resizing' : 'Compressing'} ${file.name}…`)
      const job =
        mode === 'resize'
          ? window.api.resizeImage({
              inputPath,
              ...(payload as Omit<Parameters<typeof window.api.resizeImage>[0], 'inputPath'>)
            })
          : window.api.compressImage({
              inputPath,
              operation: 'compress',
              quality: payload as number
            })
      void job
        .then((result) => {
          setNotice(`Conversion successful — ${result.outputPath.split(/[\\/]/).pop()}.`)
          window.setTimeout(() => void window.api.closeRadialMenu(), 1400)
        })
        .catch((error: unknown) =>
          setNotice(error instanceof Error ? error.message : 'Image processing failed.')
        )
        .finally(() => setIsProcessing(false))
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
    setOptionsMode(null)
    setIsClosing(false)
    setDragModifier('shift')
  }, [reset])
  useEffect(() => window.api.onRadialMenuOpened(resetMenu), [resetMenu])
  useEffect(() => window.api.onRadialMenuModifier(setDragModifier), [])
  useEffect(
    () =>
      window.api.onSettingsRequested(() => {
        setNotice('Settings will be available when conversion preferences are implemented.')
      }),
    []
  )
  const operationFileName = file?.name ?? 'sample.png'
  const convertOperations = getOperationsForFile(operationFileName)
  const toolOperations = getFileToolOperations(operationFileName)

  return (
    <AppLayout>
      <section className="radial-utility" aria-label="Universal File Toolkit">
        <DropZone
          dragHandlers={dragHandlers}
          isDragging={!optionsMode && isDragging}
          onDismiss={dismiss}
        >
          <AnimatePresence>
            {!isClosing && !optionsMode && (
              <motion.div
                className="compact-stage"
                initial={{ opacity: 0, scale: 0.82 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.82 }}
                transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              >
                <RadialMenu
                  file={file}
                  convertOperations={convertOperations}
                  toolOperations={toolOperations}
                  activeModifier={dragModifier}
                  isDragging={isDragging}
                  selectedOperation={operation}
                  onSelect={isProcessing ? () => undefined : handleOperation}
                  onDirectFileDrop={(droppedFile, nextOperation) => {
                    window.api.notifyDropReceived()
                    loadFile(droppedFile)
                    handleOperation(nextOperation, droppedFile)
                  }}
                  onDismiss={dismiss}
                />
              </motion.div>
            )}
            {(optionsMode === 'resize' || optionsMode === 'compress') && file && (
              <ImageOptionsPanel
                mode={optionsMode}
                fileName={file.name}
                onCancel={() => setOptionsMode(null)}
                onResize={(payload) => runEdit('resize', { ...payload, operation: 'resize' })}
                onCompress={(quality) => runEdit('compress', quality)}
              />
            )}
            {optionsMode === 'crop' && file && !isClosing && (
              <ImageCropPanel
                file={file}
                onCancel={() => setOptionsMode(null)}
                onNewFile={resetMenu}
                isProcessing={isProcessing}
                onApply={(area) => {
                  const inputPath = window.api.getPathForFile(file)
                  clearDragging()
                  setIsProcessing(true)
                  setNotice(`Cropping ${file.name}…`)
                  void window.api
                    .cropImage({ inputPath, operation: 'crop', ...area })
                    .then((result) => {
                      setNotice(
                        `Conversion successful — ${result.outputPath.split(/[\\/]/).pop()}.`
                      )
                      setIsClosing(true)
                      window.setTimeout(() => void window.api.closeRadialMenu(), 240)
                    })
                    .catch((error: unknown) => {
                      setIsClosing(false)
                      setNotice(error instanceof Error ? error.message : 'Crop failed.')
                    })
                    .finally(() => setIsProcessing(false))
                }}
              />
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
