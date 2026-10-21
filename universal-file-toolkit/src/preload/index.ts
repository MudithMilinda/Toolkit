import { contextBridge, ipcRenderer, webUtils } from 'electron'

// The renderer receives only the two fixed, capability-scoped operations it needs.
const api = Object.freeze({
  closeRadialMenu: (): Promise<void> => ipcRenderer.invoke('radial-menu:close'),
  notifyDropReceived: (): void => ipcRenderer.send('radial-menu:drop-received'),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  getImagePreview: (inputPath: string): Promise<string> =>
    ipcRenderer.invoke('image:preview', inputPath),
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
  compressImage: (payload: { inputPath: string; operation: 'compress'; quality: number }) =>
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
