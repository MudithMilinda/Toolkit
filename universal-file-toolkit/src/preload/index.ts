import { contextBridge, ipcRenderer, webUtils } from 'electron'

// The renderer receives only the two fixed, capability-scoped operations it needs.
const api = Object.freeze({
  closeRadialMenu: (): Promise<void> => ipcRenderer.invoke('radial-menu:close'),
  notifyDropReceived: (): void => ipcRenderer.send('radial-menu:drop-received'),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  convertImage: (payload: { inputPath: string; targetFormat: 'png' | 'jpg' | 'webp' }) =>
    ipcRenderer.invoke('conversion:image', payload) as Promise<{
      outputPath: string
      originalSize: number
      outputSize: number
      savedPercent: number
    }>,
  onRadialMenuOpened: (listener: () => void): (() => void) => {
    const handler = (): void => listener()
    ipcRenderer.on('radial-menu:opened', handler)
    return () => ipcRenderer.removeListener('radial-menu:opened', handler)
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
