declare global {
  interface Window {
    api: {
      getOnboardingStatus: () => Promise<boolean>
      completeOnboarding: () => Promise<void>
      hideOnboarding: () => Promise<void>
      closeRadialMenu: () => Promise<void>
      notifyRadialMenuReady: () => void
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
      convertPdf: (payload: {
        inputPath: string
        targetFormat: 'docx' | 'pages' | 'pptx' | 'xlsx' | 'epub' | 'txt' | 'md' | 'jpg' | 'png'
      }) => Promise<{
        outputPath: string
        originalSize: number
        outputSize: number
        savedPercent: number
      }>
      convertDocument: (payload: {
        inputPath: string
        targetFormat: 'pdf' | 'pages' | 'epub' | 'txt' | 'md' | 'html' | 'jpg' | 'png'
      }) => Promise<{
        outputPath: string
        originalSize: number
        outputSize: number
        savedPercent: number
      }>
      compressPdf: (payload: { inputPath: string; operation: 'pdf-compress' }) => Promise<{
        outputPath: string
        originalSize: number
        outputSize: number
        savedPercent: number
      }>
      getPdfMetadata: (inputPath: string) => Promise<Array<{ key: string; value: string }>>
      getPdfThumbnails: (inputPath: string) => Promise<{
        pageCount: number
        thumbnails: string[]
      }>
      splitPdf: (payload: {
        inputPath: string
        operation: 'pdf-split'
        startPage: number
        endPage: number
        splitEveryPage: boolean
      }) => Promise<{ outputPaths: string[] }>
      organizePdf: (payload: {
        inputPath: string
        operation: 'pdf-organize'
        pageOrder: number[]
        pageRotations: Record<number, number>
      }) => Promise<{
        outputPath: string
        originalSize: number
        outputSize: number
        savedPercent: number
      }>
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
      }) => Promise<{
        outputPath: string
        originalSize: number
        outputSize: number
        savedPercent: number
      }>
      compressVideo: (payload: {
        inputPath: string
        operation: 'video-compress'
        quality: number
        maxDimension?: number
      }) => Promise<{
        outputPath: string
        originalSize: number
        outputSize: number
        savedPercent: number
      }>
      compressAudio: (payload: {
        inputPath: string
        operation: 'audio-compress'
        bitrateKbps: 96 | 192
      }) => Promise<{
        outputPath: string
        originalSize: number
        outputSize: number
        savedPercent: number
      }>
      normalizeAudio: (payload: {
        inputPath: string
        operation: 'audio-normalize'
        targetLufs: number
        loudnessRange: number
        truePeak: number
      }) => Promise<{
        outputPath: string
        originalSize: number
        outputSize: number
        savedPercent: number
      }>
      trimAudio: (payload: {
        inputPath: string
        operation: 'audio-trim'
        startSeconds: number
        endSeconds: number
      }) => Promise<{
        outputPath: string
        originalSize: number
        outputSize: number
        savedPercent: number
      }>
      bleepAudio: (payload: {
        inputPath: string
        operation: 'audio-bleep'
        startSeconds: number
        endSeconds: number
      }) => Promise<{ outputPath: string }>
      getVideoMetadata: (inputPath: string) => Promise<Array<{ key: string; value: string }>>
      getVideoSourceUrl: (inputPath: string) => Promise<string>
      getVideoPoster: (inputPath: string) => Promise<string>
      getAudioSourceUrl: (inputPath: string) => Promise<string>
      muteVideo: (inputPath: string) => Promise<{
        outputPath: string
        originalSize: number
        outputSize: number
        savedPercent: number
      }>
      trimVideo: (payload: {
        inputPath: string
        operation: 'video-trim'
        startSeconds: number
        endSeconds: number
      }) => Promise<{
        outputPath: string
        originalSize: number
        outputSize: number
        savedPercent: number
      }>
      cropVideo: (payload: {
        inputPath: string
        operation: 'video-crop'
        left: number
        top: number
        width: number
        height: number
      }) => Promise<{
        outputPath: string
        originalSize: number
        outputSize: number
        savedPercent: number
      }>
      changeVideoSpeed: (payload: {
        inputPath: string
        operation: 'video-speed'
        speed: number
      }) => Promise<{
        outputPath: string
        originalSize: number
        outputSize: number
        savedPercent: number
      }>
      archiveFiles: (inputPaths: string[]) => Promise<{
        outputPath: string
        originalSize: number
        outputSize: number
        savedPercent: number
      }>
      onVideoConversionProgress: (listener: (percent: number) => void) => () => void
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
      onRadialMenuDragFile: (listener: (fileName: string) => void) => () => void
      onSettingsRequested: (listener: () => void) => () => void
      onOnboardingRequested: (listener: () => void) => () => void
    }
  }
}

export {}
