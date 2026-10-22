declare global {
  interface Window {
    api: {
      closeRadialMenu: () => Promise<void>
      notifyDropReceived: () => void
      composeEmail: (inputPath: string) => Promise<void>
      getPathForFile: (file: File) => string
      getImagePreview: (inputPath: string) => Promise<string>
      getImageMetadata: (inputPath: string) => Promise<Array<{ key: string; value: string }>>
      convertImage: (payload: {
        inputPath: string
        targetFormat: 'png' | 'jpg' | 'webp' | 'pdf' | 'heic' | 'tiff' | 'avif' | 'bmp'
      }) => Promise<{
        outputPath: string
        originalSize: number
        outputSize: number
        savedPercent: number
      }>
      convertImagesToPdf: (payload: { inputPaths: string[] }) => Promise<{
        outputPath: string
        originalSize: number
        outputSize: number
        savedPercent: number
      }>
      resizeImage: (payload: {
        inputPath: string
        operation: 'resize'
        width?: number
        height?: number
        fit: 'inside' | 'cover' | 'fill'
        withoutEnlargement: boolean
      }) => Promise<{ outputPath: string; savedPercent: number }>
      compressImage: (payload: {
        inputPath: string
        operation: 'compress'
        quality: number
        maxDimension?: number
      }) => Promise<{
        outputPath: string
        savedPercent: number
      }>
      cropImage: (payload: {
        inputPath: string
        operation: 'crop'
        left: number
        top: number
        width: number
        height: number
      }) => Promise<{ outputPath: string }>
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
      }) => Promise<{ outputPath: string }>
      removeBackground: (payload: {
        inputPath: string
        operation: 'remove-background'
      }) => Promise<{ outputPath: string }>
      onRadialMenuOpened: (listener: () => void) => () => void
      onRadialMenuModifier: (listener: (modifier: 'shift' | 'command') => void) => () => void
      onSettingsRequested: (listener: () => void) => () => void
    }
  }
}

export {}
