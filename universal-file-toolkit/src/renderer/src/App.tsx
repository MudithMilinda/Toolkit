import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import AppLayout from './components/AppLayout'
import DropZone from './components/DropZone'
import RadialMenu from './components/RadialMenu/RadialMenu'
import ImageOptionsPanel from './components/ImageOptionsPanel'
import ImageCropPanel from './components/ImageCropPanel'
import ImageEditPanel from './components/ImageEditPanel'
import ImageMetadataPanel from './components/ImageMetadataPanel'
import { useFileDrop } from './hooks/useFileDrop'
import {
  getFileToolOperations,
  getOperationsForFile,
  type FileOperation
} from './utils/fileFormats'

function App(): React.JSX.Element {
  const { file, files, isDragging, dragHandlers, loadFile, reset, clearDragging } = useFileDrop()
  const [operation, setOperation] = useState<FileOperation | null>(null)
  const [isClosing, setIsClosing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [panelStatus, setPanelStatus] = useState<string | null>(null)
  const [conversionProgress, setConversionProgress] = useState<number | 'finalizing' | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [dragModifier, setDragModifier] = useState<'shift' | 'command'>('shift')
  const [draggedFileName, setDraggedFileName] = useState<string | null>(null)
  const [optionsMode, setOptionsMode] = useState<
    'resize' | 'compress' | 'crop' | 'edit' | 'metadata' | null
  >(null)
  useEffect(
    () =>
      window.api.onVideoConversionProgress((percent) => {
        setConversionProgress((current) =>
          typeof current === 'number' && percent > current ? percent : current
        )
      }),
    []
  )
  const handleOperation = useCallback(
    (nextOperation: FileOperation, selectedFile: File | null = file) => {
      if (!selectedFile) {
        setNotice('Drop a file into the center first.')
        return
      }
      clearDragging()
      setOperation(nextOperation)
      if (nextOperation.id === 'send-email') {
        const inputPath = window.api.getPathForFile(selectedFile)
        if (!inputPath) {
          setNotice('The selected file path could not be read. Please try again.')
          return
        }
        setNotice(`Opening an email for ${selectedFile.name}…`)
        void window.api
          .composeEmail(inputPath)
          .then(() => setNotice(`Email composer opened with ${selectedFile.name} attached.`))
          .catch((error: unknown) =>
            setNotice(error instanceof Error ? error.message : 'Unable to open an email composer.')
          )
        return
      }
      if (nextOperation.id === 'pdf' && selectedFile === file && files.length > 1) {
        const inputPaths = files
          .map((droppedFile) => window.api.getPathForFile(droppedFile))
          .filter((inputPath): inputPath is string => Boolean(inputPath))
        if (inputPaths.length !== files.length) {
          setNotice('One or more dropped file paths could not be read. Please try again.')
          return
        }
        setIsProcessing(true)
        setIsClosing(true)
        setNotice(`Creating one PDF with ${inputPaths.length} pages…`)
        window.setTimeout(() => void window.api.closeRadialMenu(), 220)
        void window.api
          .convertImagesToPdf({ inputPaths })
          .then((result) =>
            setNotice(
              `PDF created — ${result.outputPath.split(/[\\/]/).pop()} (${inputPaths.length} pages).`
            )
          )
          .catch((error: unknown) => {
            setIsClosing(false)
            setNotice(error instanceof Error ? error.message : 'PDF creation failed.')
          })
          .finally(() => setIsProcessing(false))
        return
      }
      if (
        nextOperation.id === 'resize' ||
        nextOperation.id === 'compress' ||
        nextOperation.id === 'crop' ||
        nextOperation.id === 'edit' ||
        nextOperation.id === 'metadata'
      ) {
        setPanelStatus(null)
        setOptionsMode(nextOperation.id)
        return
      }
      if (nextOperation.id === 'remove-background') {
        const inputPath = window.api.getPathForFile(selectedFile)
        if (!inputPath) {
          setNotice('The dropped file path could not be read. Please drop the file again.')
          return
        }
        setIsProcessing(true)
        setIsClosing(true)
        setNotice(`Removing the background from ${selectedFile.name}…`)
        window.setTimeout(() => void window.api.closeRadialMenu(), 220)
        void window.api
          .removeBackground({ inputPath, operation: 'remove-background' })
          .then((result) =>
            setNotice(`Background removed — ${result.outputPath.split(/[\\/]/).pop()}.`)
          )
          .catch((error: unknown) => {
            setIsClosing(false)
            setNotice(error instanceof Error ? error.message : 'Background removal failed.')
          })
          .finally(() => setIsProcessing(false))
        return
      }
      if (['mp4', 'mov', 'mp3', 'gif', 'webm', 'mkv', 'avi'].includes(nextOperation.id)) {
        const inputPath = window.api.getPathForFile(selectedFile)
        if (!inputPath) {
          setNotice('The dropped file path could not be read. Please drop the file again.')
          return
        }
        const targetFormat: 'mp4' | 'mov' | 'mp3' | 'gif' | 'webm' | 'mkv' | 'avi' =
          nextOperation.id === 'mp4'
            ? 'mp4'
            : nextOperation.id === 'mov'
              ? 'mov'
              : nextOperation.id === 'mp3'
                ? 'mp3'
                : nextOperation.id === 'gif'
                  ? 'gif'
                  : nextOperation.id === 'webm'
                    ? 'webm'
                    : nextOperation.id === 'mkv'
                      ? 'mkv'
                      : 'avi'
        setIsProcessing(true)
        setConversionProgress(0)
        let progress = 0
        const reportsFrameProgress = ['webm', 'mkv', 'avi', 'mp3'].includes(targetFormat)
        const progressTimer = reportsFrameProgress
          ? undefined
          : window.setInterval(() => {
              // Native export does not provide frame-level progress. Keep its
              // estimate below 100%; only a completed export reaches 100%.
              if (progress >= 95) {
                setConversionProgress('finalizing')
                return
              }
              progress = Math.min(95, progress + Math.max(1, Math.round((95 - progress) / 7)))
              setConversionProgress(progress)
            }, 350)
        void window.api
          .convertVideo({ inputPath, targetFormat })
          .then((result) => {
            if (progressTimer) window.clearInterval(progressTimer)
            setConversionProgress(100)
            setNotice(`Conversion successful — ${result.outputPath.split(/[\\/]/).pop()}.`)
            window.setTimeout(() => void window.api.closeRadialMenu(), 1000)
          })
          .catch((error: unknown) => {
            if (progressTimer) window.clearInterval(progressTimer)
            setConversionProgress(null)
            const message = error instanceof Error ? error.message : 'Video conversion failed.'
            setNotice(message.replace(/^Error invoking remote method '[^']+': Error: /, ''))
          })
          .finally(() => setIsProcessing(false))
        return
      }
      if (
        !['png', 'jpg', 'webp', 'pdf', 'heic', 'tiff', 'avif', 'bmp'].includes(nextOperation.id)
      ) {
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
    [clearDragging, file, files]
  )
  const runEdit = useCallback(
    (
      mode: 'resize' | 'compress',
      payload:
        | Omit<Parameters<typeof window.api.resizeImage>[0], 'inputPath'>
        | Omit<Parameters<typeof window.api.compressImage>[0], 'inputPath' | 'operation'>
    ) => {
      if (!file) return
      const inputPath = window.api.getPathForFile(file)
      setIsProcessing(true)
      setPanelStatus(`${mode === 'resize' ? 'Resizing' : 'Compressing'}…`)
      const job =
        mode === 'resize'
          ? window.api.resizeImage({
              inputPath,
              ...(payload as Omit<Parameters<typeof window.api.resizeImage>[0], 'inputPath'>)
            })
          : window.api.compressImage({
              inputPath,
              operation: 'compress',
              ...(payload as Omit<
                Parameters<typeof window.api.compressImage>[0],
                'inputPath' | 'operation'
              >)
            })
      void job
        .then((result) => {
          setPanelStatus(`Success — ${result.outputPath.split(/[\\/]/).pop()}`)
          window.setTimeout(() => void window.api.closeRadialMenu(), 1400)
        })
        .catch((error: unknown) =>
          setPanelStatus(error instanceof Error ? error.message : 'Image processing failed.')
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
    setPanelStatus(null)
    setConversionProgress(null)
    setOptionsMode(null)
    setIsClosing(false)
    setDragModifier('shift')
    setDraggedFileName(null)
  }, [reset])
  useEffect(() => window.api.onRadialMenuOpened(resetMenu), [resetMenu])
  useEffect(() => window.api.onRadialMenuModifier(setDragModifier), [])
  useEffect(() => window.api.onRadialMenuDragFile(setDraggedFileName), [])
  useEffect(
    () =>
      window.api.onSettingsRequested(() => {
        setNotice('Settings will be available when conversion preferences are implemented.')
      }),
    []
  )
  const operationFileName = file?.name ?? draggedFileName ?? 'sample.png'
  const convertOperations = getOperationsForFile(operationFileName)
  const toolOperations = getFileToolOperations(operationFileName)

  return (
    <AppLayout>
      <section
        className="relative z-1 grid size-full place-items-center"
        aria-label="Universal File Toolkit"
      >
        <DropZone
          dragHandlers={dragHandlers}
          isDragging={!optionsMode && isDragging}
          onDismiss={dismiss}
        >
          <AnimatePresence>
            {!isClosing && !optionsMode && (
              <motion.div
                className="grid size-full place-items-center"
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
                  processingProgress={conversionProgress}
                  selectedOperation={operation}
                  onSelect={isProcessing ? () => undefined : handleOperation}
                  onDirectFileDrop={(droppedFiles, index) => {
                    window.api.notifyDropReceived()
                    const droppedFile = droppedFiles[0]
                    if (!droppedFile) return
                    loadFile(droppedFile)
                    // The window can appear before macOS lets Chromium expose a
                    // drag's file name. Resolve the target from the dropped file
                    // rather than the image placeholder displayed beforehand.
                    const droppedOperations =
                      dragModifier === 'command'
                        ? getFileToolOperations(droppedFile.name)
                        : getOperationsForFile(droppedFile.name)
                    const nextOperation = droppedOperations[index]
                    if (!nextOperation) {
                      setNotice('That action is not available for this file type.')
                      return
                    }
                    if (nextOperation.id === 'pdf' && droppedFiles.length > 1) {
                      const inputPaths = droppedFiles
                        .map((droppedFile) => window.api.getPathForFile(droppedFile))
                        .filter((inputPath): inputPath is string => Boolean(inputPath))
                      if (inputPaths.length !== droppedFiles.length) {
                        setNotice(
                          'One or more dropped file paths could not be read. Please try again.'
                        )
                        return
                      }
                      clearDragging()
                      setOperation(nextOperation)
                      setIsProcessing(true)
                      setIsClosing(true)
                      setNotice(`Creating one PDF with ${inputPaths.length} pages…`)
                      window.setTimeout(() => void window.api.closeRadialMenu(), 220)
                      void window.api
                        .convertImagesToPdf({ inputPaths })
                        .then((result) =>
                          setNotice(
                            `PDF created — ${result.outputPath.split(/[\\/]/).pop()} (${inputPaths.length} pages).`
                          )
                        )
                        .catch((error: unknown) => {
                          setIsClosing(false)
                          setNotice(error instanceof Error ? error.message : 'PDF creation failed.')
                        })
                        .finally(() => setIsProcessing(false))
                      return
                    }
                    droppedFiles.forEach((fileToConvert) =>
                      handleOperation(nextOperation, fileToConvert)
                    )
                  }}
                  onDismiss={dismiss}
                />
              </motion.div>
            )}
            {(optionsMode === 'resize' || optionsMode === 'compress') && file && (
              <ImageOptionsPanel
                mode={optionsMode}
                file={file}
                statusMessage={panelStatus}
                onCancel={() => {
                  setPanelStatus(null)
                  setOptionsMode(null)
                }}
                onResize={(payload) => runEdit('resize', { ...payload, operation: 'resize' })}
                onCompress={(payload) => runEdit('compress', payload)}
              />
            )}
            {optionsMode === 'crop' && file && !isClosing && (
              <ImageCropPanel
                file={file}
                statusMessage={panelStatus}
                onCancel={() => {
                  setPanelStatus(null)
                  setOptionsMode(null)
                }}
                onNewFile={resetMenu}
                isProcessing={isProcessing}
                onApply={(area) => {
                  const inputPath = window.api.getPathForFile(file)
                  clearDragging()
                  setIsProcessing(true)
                  setPanelStatus('Cropping…')
                  void window.api
                    .cropImage({ inputPath, operation: 'crop', ...area })
                    .then((result) => {
                      setPanelStatus(`Success — ${result.outputPath.split(/[\\/]/).pop()}`)
                      window.setTimeout(() => void window.api.closeRadialMenu(), 1400)
                    })
                    .catch((error: unknown) => {
                      setPanelStatus(error instanceof Error ? error.message : 'Crop failed.')
                    })
                    .finally(() => setIsProcessing(false))
                }}
              />
            )}
            {optionsMode === 'edit' && file && !isClosing && (
              <ImageEditPanel
                file={file}
                statusMessage={panelStatus}
                onCancel={() => {
                  setPanelStatus(null)
                  setOptionsMode(null)
                }}
                onSave={(edits) => {
                  const inputPath = window.api.getPathForFile(file)
                  setIsProcessing(true)
                  setPanelStatus('Saving…')
                  void window.api
                    .editImage({ inputPath, operation: 'edit', ...edits })
                    .then((result) => {
                      setPanelStatus(`Success — ${result.outputPath.split(/[\\/]/).pop()}`)
                      window.setTimeout(() => void window.api.closeRadialMenu(), 1400)
                    })
                    .catch((error: unknown) =>
                      setPanelStatus(error instanceof Error ? error.message : 'Edit failed.')
                    )
                    .finally(() => setIsProcessing(false))
                }}
              />
            )}
            {optionsMode === 'metadata' && file && !isClosing && (
              <ImageMetadataPanel file={file} onCancel={() => setOptionsMode(null)} />
            )}
          </AnimatePresence>
        </DropZone>
      </section>
      <AnimatePresence>
        {notice && (
          <motion.p
            className="absolute top-[calc(50%+158px)] z-5 m-0 max-w-[228px] rounded-full border border-white/15 bg-[#171719]/92 px-3 py-1.5 text-center text-[9px] leading-[1.35] text-zinc-200 shadow-[0_7px_18px_rgba(0,0,0,0.3)] backdrop-blur-[18px]"
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
