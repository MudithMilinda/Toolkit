declare global {
  interface Window {
    api: {
      closeRadialMenu: () => Promise<void>
      notifyDropReceived: () => void
      getPathForFile: (file: File) => string
      convertImage: (payload: {
        inputPath: string
        targetFormat: 'png' | 'jpg' | 'webp'
      }) => Promise<{
        outputPath: string
        originalSize: number
        outputSize: number
        savedPercent: number
      }>
      onRadialMenuOpened: (listener: () => void) => () => void
      onSettingsRequested: (listener: () => void) => () => void
    }
  }
}

export {}
