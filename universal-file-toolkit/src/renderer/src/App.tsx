import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import AppLayout from './components/AppLayout'
import DropZone from './components/DropZone'
import RadialMenu from './components/RadialMenu/RadialMenu'
import ImageOptionsPanel from './components/ImageOptionsPanel'
import AudioCompressPanel from './components/AudioCompressPanel'
import AudioMetadataPanel from './components/AudioMetadataPanel'
import AudioNormalizePanel from './components/AudioNormalizePanel'
import AudioTrimPanel from './components/AudioTrimPanel'
import AudioBleepPanel from './components/AudioBleepPanel'
import PdfCompressPanel from './components/PdfCompressPanel'
import PdfMetadataPanel from './components/PdfMetadataPanel'
import VideoCompressPanel from './components/VideoCompressPanel'
import VideoMetadataPanel from './components/VideoMetadataPanel'
import VideoTrimPanel from './components/VideoTrimPanel'
import VideoCropPanel from './components/VideoCropPanel'
import VideoSpeedPanel from './components/VideoSpeedPanel'
import ImageCropPanel from './components/ImageCropPanel'
import ImageEditPanel from './components/ImageEditPanel'
import ImageMetadataPanel from './components/ImageMetadataPanel'
import { useFileDrop } from './hooks/useFileDrop'
import {
  getFileCategory,
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
  const [menuOpenVersion, setMenuOpenVersion] = useState(0)
  const [optionsMode, setOptionsMode] = useState<
    | 'resize'
    | 'compress'
    | 'audio-compress'
    | 'audio-metadata'
    | 'audio-normalize'
    | 'audio-trim'
    | 'audio-bleep'
    | 'pdf-compress'
    | 'pdf-metadata'
    | 'video-compress'
    | 'video-metadata'
    | 'video-trim'
    | 'video-crop'
    | 'video-speed'
    | 'crop'
    | 'edit'
    | 'metadata'
    | null
  >(null)
  useEffect(
    () =>
      window.api.onVideoConversionProgress((percent) => {
        setConversionProgress((current) =>
          typeof current === 'number' && percent > current ? percent : current
        )
        if (
          optionsMode === 'video-compress' ||
          optionsMode === 'video-trim' ||
          optionsMode === 'video-crop' ||
          optionsMode === 'video-speed' ||
          optionsMode === 'audio-compress' ||
          optionsMode === 'audio-normalize' ||
          optionsMode === 'audio-trim'
        ) {
          setPanelStatus(
            `${optionsMode === 'audio-compress' ? 'Compressing audio' : optionsMode === 'audio-normalize' ? 'Normalizing audio' : optionsMode === 'audio-trim' ? 'Trimming audio' : optionsMode === 'video-trim' ? 'Trimming' : optionsMode === 'video-crop' ? 'Cropping' : optionsMode === 'video-speed' ? 'Changing speed of' : 'Compressing'}${optionsMode === 'audio-compress' || optionsMode === 'audio-normalize' || optionsMode === 'audio-trim' ? '' : ' video'}… ${percent}%`
          )
        }
      }),
    [optionsMode]
  )
  const handleOperation = useCallback(
    (nextOperation: FileOperation, selectedFile: File | null = file, selectedFiles?: File[]) => {
      if (!selectedFile) {
        setNotice('Drop a file into the center first.')
        return
      }
      clearDragging()
      setOperation(nextOperation)
      if (nextOperation.id === 'zip') {
        const filesToArchive = selectedFiles ?? (selectedFile === file ? files : [selectedFile])
        const inputPaths = filesToArchive
          .map((video) => window.api.getPathForFile(video))
          .filter((inputPath): inputPath is string => Boolean(inputPath))
        if (inputPaths.length !== filesToArchive.length) {
          setNotice(
            'One or more dropped video paths could not be read. Please drop the files again.'
          )
          return
        }
        setIsProcessing(true)
        setConversionProgress(0)
        setNotice(null)
        let progress = 0
        const progressTimer = window.setInterval(() => {
          // macOS's ZIP utility does not report per-file progress. Keep an
          // estimate below 100%; a completed archive is the only true 100%.
          if (progress >= 95) {
            setConversionProgress('finalizing')
            return
          }
          progress = Math.min(95, progress + Math.max(1, Math.round((95 - progress) / 7)))
          setConversionProgress(progress)
        }, 350)
        void window.api
          .archiveFiles(inputPaths)
          .then(() => {
            window.clearInterval(progressTimer)
            setConversionProgress(100)
            window.setTimeout(() => void window.api.closeRadialMenu(), 1000)
          })
          .catch((error: unknown) => {
            window.clearInterval(progressTimer)
            setConversionProgress(null)
            setNotice(error instanceof Error ? error.message : 'Unable to create ZIP archive.')
          })
          .finally(() => setIsProcessing(false))
        return
      }
      if (nextOperation.id.startsWith('video-')) {
        if (nextOperation.id === 'video-compress') {
          setPanelStatus(null)
          setOptionsMode('video-compress')
          return
        }
        if (nextOperation.id === 'video-metadata') {
          setOptionsMode('video-metadata')
          return
        }
        if (nextOperation.id === 'video-mute') {
          const inputPath = window.api.getPathForFile(selectedFile)
          if (!inputPath) {
            setNotice('The video path could not be read. Please drop the file again.')
            return
          }
          setIsProcessing(true)
          setConversionProgress(0)
          setNotice(`Muting ${selectedFile.name}…`)
          void window.api
            .muteVideo(inputPath)
            .then((result) => {
              setConversionProgress(100)
              setNotice(`Muted video created — ${result.outputPath.split(/[\\/]/).pop()}.`)
              window.setTimeout(() => void window.api.closeRadialMenu(), 1000)
            })
            .catch((error: unknown) => {
              setConversionProgress(null)
              setNotice(error instanceof Error ? error.message : 'Unable to mute this video.')
            })
            .finally(() => setIsProcessing(false))
          return
        }
        if (nextOperation.id === 'video-trim') {
          setPanelStatus(null)
          setOptionsMode('video-trim')
          return
        }
        if (nextOperation.id === 'video-crop') {
          setPanelStatus(null)
          setOptionsMode('video-crop')
          return
        }
        if (nextOperation.id === 'video-speed') {
          setPanelStatus(null)
          setOptionsMode('video-speed')
          return
        }
        setNotice(`${nextOperation.label} for video is not available yet.`)
        return
      }
      if (nextOperation.id === 'audio-compress') {
        setPanelStatus(null)
        setOptionsMode('audio-compress')
        return
      }
      if (nextOperation.id === 'audio-metadata') {
        setOptionsMode('audio-metadata')
        return
      }
      if (nextOperation.id === 'audio-normalize') {
        setPanelStatus(null)
        setOptionsMode('audio-normalize')
        return
      }
      if (nextOperation.id === 'audio-trim') {
        setPanelStatus(null)
        setOptionsMode('audio-trim')
        return
      }
      if (nextOperation.id === 'audio-bleep') {
        setOptionsMode('audio-bleep')
        return
      }
      if (nextOperation.id === 'pdf-compress') {
        setPanelStatus(null)
        setOptionsMode('pdf-compress')
        return
      }
      if (nextOperation.id === 'pdf-metadata') {
        setOptionsMode('pdf-metadata')
        return
      }
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
      if (
        (nextOperation.id === 'docx' ||
          nextOperation.id === 'pages' ||
          nextOperation.id === 'pptx' ||
          nextOperation.id === 'xlsx' ||
          nextOperation.id === 'epub' ||
          nextOperation.id === 'txt' ||
          nextOperation.id === 'md' ||
          nextOperation.id === 'jpg' ||
          nextOperation.id === 'png') &&
        getFileCategory(selectedFile.name) === 'document'
      ) {
        const inputPath = window.api.getPathForFile(selectedFile)
        if (!inputPath) {
          setNotice('The selected PDF path could not be read. Please drop the file again.')
          return
        }
        setIsProcessing(true)
        setIsClosing(true)
        setNotice(`Converting ${selectedFile.name} to ${nextOperation.label}…`)
        window.setTimeout(() => void window.api.closeRadialMenu(), 220)
        void window.api
          .convertPdf({ inputPath, targetFormat: nextOperation.id })
          .then((result) =>
            setNotice(`${nextOperation.label} created — ${result.outputPath.split(/[\\/]/).pop()}.`)
          )
          .catch((error: unknown) => {
            setIsClosing(false)
            setNotice(
              error instanceof Error
                ? error.message
                : `PDF to ${nextOperation.label} conversion failed.`
            )
          })
          .finally(() => setIsProcessing(false))
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
      if (
        [
          'mp4',
          'mov',
          'mp3',
          'gif',
          'webm',
          'mkv',
          'avi',
          'wav',
          'flac',
          'ogg',
          'opus',
          'aiff'
        ].includes(nextOperation.id)
      ) {
        const inputPath = window.api.getPathForFile(selectedFile)
        if (!inputPath) {
          setNotice('The dropped file path could not be read. Please drop the file again.')
          return
        }
        const targetFormat = nextOperation.id as Parameters<
          typeof window.api.convertVideo
        >[0]['targetFormat']
        setIsProcessing(true)
        setConversionProgress(0)
        let progress = 0
        const reportsFrameProgress = [
          'webm',
          'mkv',
          'avi',
          'mp3',
          'wav',
          'flac',
          'ogg',
          'opus',
          'aiff'
        ].includes(targetFormat)
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
          .then(() => {
            if (progressTimer) window.clearInterval(progressTimer)
            setConversionProgress(100)
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
  const runVideoCompress = useCallback(
    (payload: { quality: number; maxDimension?: number }) => {
      if (!file) return
      const inputPath = window.api.getPathForFile(file)
      if (!inputPath) {
        setPanelStatus('The video path could not be read. Please drop the file again.')
        return
      }
      setIsProcessing(true)
      setConversionProgress(0)
      setPanelStatus('Compressing video… 0%')
      void window.api
        .compressVideo({ inputPath, operation: 'video-compress', ...payload })
        .then((result) => {
          setConversionProgress(100)
          setPanelStatus(`100% complete — ${result.outputPath.split(/[\\/]/).pop()}`)
          window.setTimeout(() => void window.api.closeRadialMenu(), 1400)
        })
        .catch((error: unknown) => {
          setConversionProgress(null)
          setPanelStatus(error instanceof Error ? error.message : 'Video compression failed.')
        })
        .finally(() => setIsProcessing(false))
    },
    [file]
  )
  const runAudioCompress = useCallback(
    (payload: { bitrateKbps: 96 | 192 }) => {
      if (!file) return
      const inputPath = window.api.getPathForFile(file)
      if (!inputPath) {
        setPanelStatus('The audio path could not be read. Please drop the file again.')
        return
      }
      setIsProcessing(true)
      setConversionProgress(0)
      setPanelStatus('Compressing audio… 0%')
      void window.api
        .compressAudio({ inputPath, operation: 'audio-compress', ...payload })
        .then(() => {
          setConversionProgress(100)
          setPanelStatus('Audio compressed successfully')
          window.setTimeout(() => void window.api.closeRadialMenu(), 1400)
        })
        .catch((error: unknown) => {
          setConversionProgress(null)
          setPanelStatus(error instanceof Error ? error.message : 'Audio compression failed.')
        })
        .finally(() => setIsProcessing(false))
    },
    [file]
  )
  const runAudioNormalize = useCallback(
    (payload: { targetLufs: number; loudnessRange: number; truePeak: number }) => {
      if (!file) return
      const inputPath = window.api.getPathForFile(file)
      if (!inputPath) {
        setPanelStatus('The audio path could not be read. Please drop the file again.')
        return
      }
      setIsProcessing(true)
      setConversionProgress(0)
      setPanelStatus('Normalizing audio… 0%')
      void window.api
        .normalizeAudio({ inputPath, operation: 'audio-normalize', ...payload })
        .then(() => {
          setConversionProgress(100)
          setPanelStatus('Audio normalized successfully')
          window.setTimeout(() => void window.api.closeRadialMenu(), 1400)
        })
        .catch((error: unknown) => {
          setConversionProgress(null)
          setPanelStatus(error instanceof Error ? error.message : 'Audio normalization failed.')
        })
        .finally(() => setIsProcessing(false))
    },
    [file]
  )
  const runAudioTrim = useCallback(
    (range: { startSeconds: number; endSeconds: number }) => {
      if (!file) return
      const inputPath = window.api.getPathForFile(file)
      if (!inputPath) return
      setIsProcessing(true)
      setConversionProgress(0)
      setPanelStatus('Trimming audio… 0%')
      void window.api
        .trimAudio({ inputPath, operation: 'audio-trim', ...range })
        .then(() => {
          setConversionProgress(100)
          setPanelStatus('Audio trimmed successfully')
          window.setTimeout(() => void window.api.closeRadialMenu(), 1400)
        })
        .catch((error: unknown) => {
          setConversionProgress(null)
          setPanelStatus(error instanceof Error ? error.message : 'Audio trimming failed.')
        })
        .finally(() => setIsProcessing(false))
    },
    [file]
  )
  const runVideoTrim = useCallback(
    (range: { startSeconds: number; endSeconds: number }) => {
      if (!file) return
      const inputPath = window.api.getPathForFile(file)
      if (!inputPath) {
        setPanelStatus('The video path could not be read. Please drop the file again.')
        return
      }
      setIsProcessing(true)
      setConversionProgress(0)
      setPanelStatus('Trimming video… 0%')
      void window.api
        .trimVideo({ inputPath, operation: 'video-trim', ...range })
        .then((result) => {
          setConversionProgress(100)
          setPanelStatus(`100% complete — ${result.outputPath.split(/[\\/]/).pop()}`)
          window.setTimeout(() => void window.api.closeRadialMenu(), 1400)
        })
        .catch((error: unknown) => {
          setConversionProgress(null)
          setPanelStatus(error instanceof Error ? error.message : 'Video trim failed.')
        })
        .finally(() => setIsProcessing(false))
    },
    [file]
  )
  const runVideoCrop = useCallback(
    (area: { left: number; top: number; width: number; height: number }) => {
      if (!file) return
      const inputPath = window.api.getPathForFile(file)
      if (!inputPath) {
        setPanelStatus('The video path could not be read. Please drop the file again.')
        return
      }
      setIsProcessing(true)
      setConversionProgress(0)
      setPanelStatus('Cropping video… 0%')
      void window.api
        .cropVideo({ inputPath, operation: 'video-crop', ...area })
        .then((result) => {
          setConversionProgress(100)
          setPanelStatus(`100% complete — ${result.outputPath.split(/[\\/]/).pop()}`)
          window.setTimeout(() => void window.api.closeRadialMenu(), 1400)
        })
        .catch((error: unknown) => {
          setConversionProgress(null)
          setPanelStatus(error instanceof Error ? error.message : 'Video crop failed.')
        })
        .finally(() => setIsProcessing(false))
    },
    [file]
  )
  const runVideoSpeed = useCallback(
    (speed: number) => {
      if (!file) return
      const inputPath = window.api.getPathForFile(file)
      if (!inputPath) {
        setPanelStatus('The video path could not be read. Please drop the file again.')
        return
      }
      setIsProcessing(true)
      setConversionProgress(0)
      setPanelStatus('Changing video speed… 0%')
      void window.api
        .changeVideoSpeed({ inputPath, operation: 'video-speed', speed })
        .then((result) => {
          setConversionProgress(100)
          setPanelStatus(`100% complete — ${result.outputPath.split(/[\\/]/).pop()}`)
          window.setTimeout(() => void window.api.closeRadialMenu(), 1400)
        })
        .catch((error: unknown) => {
          setConversionProgress(null)
          setPanelStatus(error instanceof Error ? error.message : 'Unable to change video speed.')
        })
        .finally(() => setIsProcessing(false))
    },
    [file]
  )
  const dismiss = useCallback((): void => {
    setIsClosing(true)
    window.setTimeout(() => void window.api.closeRadialMenu(), 160)
  }, [])
  const closeEditor = useCallback((): void => {
    setPanelStatus(null)
    setOperation(null)
    setOptionsMode(null)
    dismiss()
  }, [dismiss])
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
  useEffect(
    () =>
      window.api.onRadialMenuOpened(() => {
        resetMenu()
        setMenuOpenVersion((version) => version + 1)
      }),
    [resetMenu]
  )
  useEffect(() => {
    if (menuOpenVersion > 0) window.api.notifyRadialMenuReady()
  }, [menuOpenVersion])
  useEffect(() => {
    // The floating window is hidden as soon as Finder regains focus. Clear
    // the previous editor while it is hidden so a Q-drag never flashes that
    // stale panel before the fresh radial wheel is rendered.
    const clearHiddenPanel = (): void => {
      reset()
      setOptionsMode(null)
      setOperation(null)
      setPanelStatus(null)
      setConversionProgress(null)
      setIsClosing(true)
    }
    window.addEventListener('blur', clearHiddenPanel)
    return () => window.removeEventListener('blur', clearHiddenPanel)
  }, [reset])
  useEffect(() => window.api.onRadialMenuModifier(setDragModifier), [])
  useEffect(() => window.api.onRadialMenuDragFile(setDraggedFileName), [])
  useEffect(() => {
    // Start the shared proxy while a video is being dragged over the tools
    // wheel. Opening Crop, Trim or Speed can then reuse it immediately.
    if (!file || dragModifier !== 'command' || getFileCategory(file.name) !== 'video') return
    const inputPath = window.api.getPathForFile(file)
    if (inputPath) void window.api.getVideoSourceUrl(inputPath).catch(() => undefined)
  }, [file, dragModifier])
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
              <div className="grid size-full place-items-center">
                <RadialMenu
                  file={file}
                  draggedFileName={draggedFileName}
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
                    const droppedToolOperations = getFileToolOperations(droppedFile.name)
                    // RadialMenu falls back to the conversion wheel when a
                    // file type has no Q tools. Keep the drop resolver in
                    // sync; otherwise PDF slices are visible but resolve to
                    // an empty action list on release.
                    const droppedOperations =
                      dragModifier === 'command' && droppedToolOperations.length
                        ? droppedToolOperations
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
                    if (nextOperation.id === 'zip') {
                      handleOperation(nextOperation, droppedFile, droppedFiles)
                      return
                    }
                    droppedFiles.forEach((fileToConvert) =>
                      handleOperation(nextOperation, fileToConvert)
                    )
                  }}
                  onDismiss={dismiss}
                />
              </div>
            )}
            {(optionsMode === 'resize' || optionsMode === 'compress') && file && (
              <ImageOptionsPanel
                mode={optionsMode}
                file={file}
                statusMessage={panelStatus}
                onCancel={closeEditor}
                onResize={(payload) => runEdit('resize', { ...payload, operation: 'resize' })}
                onCompress={(payload) => runEdit('compress', payload)}
              />
            )}
            {optionsMode === 'audio-compress' && file && !isClosing && (
              <AudioCompressPanel
                file={file}
                statusMessage={panelStatus}
                onCancel={closeEditor}
                onCompress={runAudioCompress}
              />
            )}
            {optionsMode === 'audio-metadata' && file && !isClosing && (
              <AudioMetadataPanel file={file} onCancel={closeEditor} />
            )}
            {optionsMode === 'audio-normalize' && file && !isClosing && (
              <AudioNormalizePanel
                file={file}
                statusMessage={panelStatus}
                onCancel={closeEditor}
                onApply={runAudioNormalize}
              />
            )}
            {optionsMode === 'audio-trim' && file && !isClosing && (
              <AudioTrimPanel
                file={file}
                statusMessage={panelStatus}
                onCancel={closeEditor}
                onApply={runAudioTrim}
              />
            )}
            {optionsMode === 'audio-bleep' && file && !isClosing && (
              <AudioBleepPanel
                file={file}
                onCancel={closeEditor}
                onSave={(range) => {
                  const inputPath = window.api.getPathForFile(file)
                  if (!inputPath) return Promise.reject(new Error('Audio path unavailable.'))
                  return window.api
                    .bleepAudio({ inputPath, operation: 'audio-bleep', ...range })
                    .then(() => setPanelStatus('Bleeped copy created'))
                }}
              />
            )}
            {optionsMode === 'pdf-compress' && file && !isClosing && (
              <PdfCompressPanel
                file={file}
                isProcessing={isProcessing}
                statusMessage={panelStatus}
                onCancel={closeEditor}
                onCompress={() => {
                  const inputPath = window.api.getPathForFile(file)
                  if (!inputPath) {
                    setPanelStatus('The PDF path could not be read.')
                    return
                  }
                  setIsProcessing(true)
                  setPanelStatus('Optimizing PDF…')
                  void window.api
                    .compressPdf({ inputPath, operation: 'pdf-compress' })
                    .then((result) => {
                      const sizeNote =
                        result.savedPercent > 0 ? ` · ${result.savedPercent}% smaller` : ''
                      setPanelStatus(
                        `Saved — ${result.outputPath.split(/[\\/]/).pop()}${sizeNote}`
                      )
                    })
                    .catch((error: unknown) =>
                      setPanelStatus(error instanceof Error ? error.message : 'PDF compression failed.')
                    )
                    .finally(() => setIsProcessing(false))
                }}
              />
            )}
            {optionsMode === 'pdf-metadata' && file && !isClosing && (
              <PdfMetadataPanel file={file} onCancel={closeEditor} />
            )}
            {optionsMode === 'video-compress' && file && !isClosing && (
              <VideoCompressPanel
                file={file}
                statusMessage={panelStatus}
                onCancel={closeEditor}
                onCompress={runVideoCompress}
              />
            )}
            {optionsMode === 'video-metadata' && file && !isClosing && (
              <VideoMetadataPanel file={file} onCancel={closeEditor} />
            )}
            {optionsMode === 'video-trim' && file && !isClosing && (
              <VideoTrimPanel
                file={file}
                statusMessage={panelStatus}
                onCancel={closeEditor}
                onApply={runVideoTrim}
              />
            )}
            {optionsMode === 'video-crop' && file && !isClosing && (
              <VideoCropPanel
                key={`${file.name}-${file.lastModified}-${file.size}`}
                file={file}
                isProcessing={isProcessing}
                statusMessage={panelStatus}
                onCancel={closeEditor}
                onApply={runVideoCrop}
              />
            )}
            {optionsMode === 'video-speed' && file && !isClosing && (
              <VideoSpeedPanel
                key={`${file.name}-${file.lastModified}-${file.size}`}
                file={file}
                statusMessage={panelStatus}
                onCancel={closeEditor}
                onApply={runVideoSpeed}
              />
            )}
            {optionsMode === 'crop' && file && !isClosing && (
              <ImageCropPanel
                file={file}
                statusMessage={panelStatus}
                onCancel={closeEditor}
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
                onCancel={closeEditor}
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
              <ImageMetadataPanel file={file} onCancel={closeEditor} />
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
