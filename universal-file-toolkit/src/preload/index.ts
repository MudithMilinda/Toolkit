import { contextBridge, ipcRenderer, webUtils } from 'electron'

// The renderer receives only the two fixed, capability-scoped operations it needs.
const api = Object.freeze({
  closeRadialMenu: (): Promise<void> => ipcRenderer.invoke('radial-menu:close'),
  notifyRadialMenuReady: (): void => ipcRenderer.send('radial-menu:ready'),
  notifyDropReceived: (): void => ipcRenderer.send('radial-menu:drop-received'),
  composeEmail: (inputPath: string): Promise<void> =>
    ipcRenderer.invoke('email:compose', inputPath),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  getImagePreview: (inputPath: string): Promise<string> =>
    ipcRenderer.invoke('image:preview', inputPath),
  getImageMetadata: (inputPath: string) =>
    ipcRenderer.invoke('image:metadata', inputPath) as Promise<
      Array<{ key: string; value: string }>
    >,
  convertImage: (payload: {
    inputPath: string
    targetFormat: 'png' | 'jpg' | 'webp' | 'pdf' | 'heic' | 'tiff' | 'avif' | 'bmp'
  }) =>
    ipcRenderer.invoke('conversion:image', payload) as Promise<{
      outputPath: string
      originalSize: number
      outputSize: number
      savedPercent: number
    }>,
  convertPdf: (payload: {
    inputPath: string
    targetFormat: 'docx' | 'pages' | 'pptx' | 'xlsx' | 'epub' | 'txt' | 'md' | 'jpg' | 'png'
  }) =>
    ipcRenderer.invoke('conversion:pdf', payload) as Promise<{
      outputPath: string
      originalSize: number
      outputSize: number
      savedPercent: number
    }>,
  compressPdf: (payload: { inputPath: string; operation: 'pdf-compress' }) =>
    ipcRenderer.invoke('conversion:pdf-compress', payload) as Promise<{
      outputPath: string
      originalSize: number
      outputSize: number
      savedPercent: number
    }>,
  getPdfMetadata: (inputPath: string) =>
    ipcRenderer.invoke('pdf:metadata', inputPath) as Promise<Array<{ key: string; value: string }>>,
  convertVideo: (payload: {
    inputPath: string
    targetFormat:
      | 'mp4'
      | 'mov'
      | 'mp3'
      | 'gif'
      | 'webm'
      | 'mkv'
      | 'avi'
      | 'wav'
      | 'flac'
      | 'ogg'
      | 'opus'
      | 'aiff'
  }) =>
    ipcRenderer.invoke('conversion:video', payload) as Promise<{
      outputPath: string
      originalSize: number
      outputSize: number
      savedPercent: number
    }>,
  compressVideo: (payload: {
    inputPath: string
    operation: 'video-compress'
    quality: number
    maxDimension?: number
  }) =>
    ipcRenderer.invoke('conversion:video-compress', payload) as Promise<{
      outputPath: string
      originalSize: number
      outputSize: number
      savedPercent: number
    }>,
  compressAudio: (payload: {
    inputPath: string
    operation: 'audio-compress'
    bitrateKbps: 96 | 192
  }) =>
    ipcRenderer.invoke('conversion:audio-compress', payload) as Promise<{
      outputPath: string
      originalSize: number
      outputSize: number
      savedPercent: number
    }>,
  normalizeAudio: (payload: {
    inputPath: string
    operation: 'audio-normalize'
    targetLufs: number
    loudnessRange: number
    truePeak: number
  }) =>
    ipcRenderer.invoke('conversion:audio-normalize', payload) as Promise<{
      outputPath: string
      originalSize: number
      outputSize: number
      savedPercent: number
    }>,
  trimAudio: (payload: {
    inputPath: string
    operation: 'audio-trim'
    startSeconds: number
    endSeconds: number
  }) =>
    ipcRenderer.invoke('conversion:audio-trim', payload) as Promise<{
      outputPath: string
      originalSize: number
      outputSize: number
      savedPercent: number
    }>,
  bleepAudio: (payload: { inputPath: string; operation: 'audio-bleep'; startSeconds: number; endSeconds: number }) => ipcRenderer.invoke('conversion:audio-bleep', payload) as Promise<{ outputPath: string }>,
  getVideoMetadata: (inputPath: string) =>
    ipcRenderer.invoke('video:metadata', inputPath) as Promise<
      Array<{ key: string; value: string }>
    >,
  getVideoSourceUrl: (inputPath: string) =>
    ipcRenderer.invoke('video:source-url', inputPath) as Promise<string>,
  getVideoPoster: (inputPath: string) =>
    ipcRenderer.invoke('video:poster', inputPath) as Promise<string>,
  getAudioSourceUrl: (inputPath: string) =>
    ipcRenderer.invoke('audio:source-url', inputPath) as Promise<string>,
  muteVideo: (inputPath: string) =>
    ipcRenderer.invoke('conversion:video-mute', inputPath) as Promise<{
      outputPath: string
      originalSize: number
      outputSize: number
      savedPercent: number
    }>,
  trimVideo: (payload: {
    inputPath: string
    operation: 'video-trim'
    startSeconds: number
    endSeconds: number
  }) =>
    ipcRenderer.invoke('conversion:video-trim', payload) as Promise<{
      outputPath: string
      originalSize: number
      outputSize: number
      savedPercent: number
    }>,
  cropVideo: (payload: {
    inputPath: string
    operation: 'video-crop'
    left: number
    top: number
    width: number
    height: number
  }) =>
    ipcRenderer.invoke('conversion:video-crop', payload) as Promise<{
      outputPath: string
      originalSize: number
      outputSize: number
      savedPercent: number
    }>,
  changeVideoSpeed: (payload: { inputPath: string; operation: 'video-speed'; speed: number }) =>
    ipcRenderer.invoke('conversion:video-speed', payload) as Promise<{
      outputPath: string
      originalSize: number
      outputSize: number
      savedPercent: number
    }>,
  archiveFiles: (inputPaths: string[]) =>
    ipcRenderer.invoke('conversion:archive', inputPaths) as Promise<{
      outputPath: string
      originalSize: number
      outputSize: number
      savedPercent: number
    }>,
  onVideoConversionProgress: (listener: (percent: number) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, percent: number): void => listener(percent)
    ipcRenderer.on('conversion:video-progress', handler)
    return () => ipcRenderer.removeListener('conversion:video-progress', handler)
  },
  convertImagesToPdf: (payload: { inputPaths: string[] }) =>
    ipcRenderer.invoke('conversion:images-to-pdf', payload) as Promise<{
      outputPath: string
      originalSize: number
      outputSize: number
      savedPercent: number
    }>,
  resizeImage: (payload: {
    inputPath: string
    operation: 'resize'
    width?: number
    height?: number
    fit: 'inside' | 'cover' | 'fill'
    withoutEnlargement: boolean
  }) =>
    ipcRenderer.invoke('conversion:image-resize', payload) as Promise<{
      outputPath: string
      savedPercent: number
    }>,
  compressImage: (payload: {
    inputPath: string
    operation: 'compress'
    quality: number
    maxDimension?: number
  }) =>
    ipcRenderer.invoke('conversion:image-compress', payload) as Promise<{
      outputPath: string
      savedPercent: number
    }>,
  cropImage: (payload: {
    inputPath: string
    operation: 'crop'
    left: number
    top: number
    width: number
    height: number
  }) => ipcRenderer.invoke('conversion:image-crop', payload) as Promise<{ outputPath: string }>,
  editImage: (payload: {
    inputPath: string
    operation: 'edit'
    rotation: number
    exposure: number
    brightness: number
    contrast: number
    highlights: number
    shadows: number
    whites: number
    blacks: number
    saturation: number
    vibrance: number
    hue: number
    temperature: number
    tint: number
    gamma: number
  }) => ipcRenderer.invoke('conversion:image-edit', payload) as Promise<{ outputPath: string }>,
  removeBackground: (payload: { inputPath: string; operation: 'remove-background' }) =>
    ipcRenderer.invoke('conversion:image-remove-background', payload) as Promise<{
      outputPath: string
    }>,
  onRadialMenuOpened: (listener: () => void): (() => void) => {
    const handler = (): void => listener()
    ipcRenderer.on('radial-menu:opened', handler)
    return () => ipcRenderer.removeListener('radial-menu:opened', handler)
  },
  onRadialMenuModifier: (listener: (modifier: 'shift' | 'command') => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, modifier: 'shift' | 'command'): void =>
      listener(modifier)
    ipcRenderer.on('radial-menu:modifier', handler)
    return () => ipcRenderer.removeListener('radial-menu:modifier', handler)
  },
  onRadialMenuDragFile: (listener: (fileName: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, fileName: string): void => listener(fileName)
    ipcRenderer.on('radial-menu:drag-file', handler)
    return () => ipcRenderer.removeListener('radial-menu:drag-file', handler)
  },
  onSettingsRequested: (listener: () => void): (() => void) => {
    const handler = (): void => listener()
    ipcRenderer.on('radial-menu:settings', handler)
    return () => ipcRenderer.removeListener('radial-menu:settings', handler)
  }
})

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
