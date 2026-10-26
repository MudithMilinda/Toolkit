import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  protocol,
  screen,
  shell,
  Tray
} from 'electron'
import { execFile } from 'node:child_process'
import { basename, join } from 'path'
import { readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { isAbsolute, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { promisify } from 'node:util'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createNativeIntegration } from './native-integration'
import { ConversionManager } from './services/conversion/ConversionManager'
import type {
  AudioCompressionRequest,
  AudioNormalizeRequest,
  AudioTrimRequest,
  AudioBleepRequest,
  ImageCompressionRequest,
  ImageBackgroundRemovalRequest,
  ImageCropRequest,
  ImageEditRequest,
  ImageConversionRequest,
  ImagesToPdfRequest,
  ImageResizeRequest,
  VideoConversionRequest
} from './services/conversion/types'

let radialWindow: BrowserWindow | null = null
let tray: Tray | null = null
const nativeIntegration = createNativeIntegration()
const conversionManager = new ConversionManager()
const execFileAsync = promisify(execFile)
let nativeDismissTimer: ReturnType<typeof setTimeout> | null = null
let nativeDragCandidateVisible = false
let pendingRadialMenuFocus: boolean | null = null
const localMediaSources = new Map<string, string>()
// The crop editor needs room for a comfortably sized preview and its controls.
const MENU_SIZE = 660
const shortcuts =
  process.platform === 'darwin'
    ? ['CommandOrControl+Shift+Space', 'Control+Shift+Space', 'CommandOrControl+Alt+Space']
    : ['CommandOrControl+Shift+Space', 'CommandOrControl+Alt+Space']

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'toolkit-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
      bypassCSP: true
    }
  }
])

const mediaMimeType = (inputPath: string): string => {
  const extension = inputPath.split('.').pop()?.toLowerCase()
  if (extension === 'mp3') return 'audio/mpeg'
  if (extension === 'wav') return 'audio/wav'
  if (extension === 'ogg') return 'audio/ogg'
  if (extension === 'opus') return 'audio/opus'
  if (extension === 'mov') return 'video/quicktime'
  if (extension === 'webm') return 'video/webm'
  if (extension === 'mkv') return 'video/x-matroska'
  if (extension === 'avi') return 'video/x-msvideo'
  return 'video/mp4'
}

function isImageConversionRequest(value: unknown): value is ImageConversionRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.inputPath === 'string' &&
    candidate.inputPath.length > 0 &&
    candidate.inputPath.length <= 16_384 &&
    !candidate.inputPath.includes('\0') &&
    ['png', 'jpg', 'webp', 'pdf', 'heic', 'tiff', 'avif', 'bmp'].includes(
      String(candidate.targetFormat)
    ) &&
    (candidate.options === undefined || typeof candidate.options === 'object')
  )
}
function isVideoConversionRequest(value: unknown): value is VideoConversionRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    hasSafeInputPath(candidate) &&
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
    ].includes(String(candidate.targetFormat))
  )
}
function isVideoCompressionRequest(value: unknown): value is {
  inputPath: string
  operation: 'video-compress'
  quality: number
  maxDimension?: number
} {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    hasSafeInputPath(candidate) &&
    candidate.operation === 'video-compress' &&
    typeof candidate.quality === 'number' &&
    Number.isInteger(candidate.quality) &&
    candidate.quality >= 1 &&
    candidate.quality <= 100 &&
    (candidate.maxDimension === undefined ||
      (typeof candidate.maxDimension === 'number' &&
        Number.isInteger(candidate.maxDimension) &&
        candidate.maxDimension >= 240 &&
        candidate.maxDimension <= 7680))
  )
}
function isAudioCompressionRequest(value: unknown): value is AudioCompressionRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    hasSafeInputPath(candidate) &&
    candidate.operation === 'audio-compress' &&
    (candidate.bitrateKbps === 96 || candidate.bitrateKbps === 192)
  )
}
function isAudioNormalizeRequest(value: unknown): value is AudioNormalizeRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  const numberInRange = (value: unknown, min: number, max: number): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
  return (
    hasSafeInputPath(candidate) &&
    candidate.operation === 'audio-normalize' &&
    numberInRange(candidate.targetLufs, -30, -5) &&
    numberInRange(candidate.loudnessRange, 1, 20) &&
    numberInRange(candidate.truePeak, -9, 0)
  )
}
function isAudioTrimRequest(value: unknown): value is AudioTrimRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    hasSafeInputPath(candidate) &&
    candidate.operation === 'audio-trim' &&
    typeof candidate.startSeconds === 'number' &&
    typeof candidate.endSeconds === 'number' &&
    Number.isFinite(candidate.startSeconds) &&
    Number.isFinite(candidate.endSeconds) &&
    candidate.startSeconds >= 0 &&
    candidate.endSeconds > candidate.startSeconds
  )
}
function isAudioBleepRequest(value: unknown): value is AudioBleepRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return candidate.operation === 'audio-bleep' && isAudioTrimRequest({ ...candidate, operation: 'audio-trim' })
}
function isVideoTrimRequest(value: unknown): value is {
  inputPath: string
  operation: 'video-trim'
  startSeconds: number
  endSeconds: number
} {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    hasSafeInputPath(candidate) &&
    candidate.operation === 'video-trim' &&
    typeof candidate.startSeconds === 'number' &&
    typeof candidate.endSeconds === 'number' &&
    Number.isFinite(candidate.startSeconds) &&
    Number.isFinite(candidate.endSeconds) &&
    candidate.startSeconds >= 0 &&
    candidate.endSeconds > candidate.startSeconds
  )
}
function isVideoCropRequest(value: unknown): value is {
  inputPath: string
  operation: 'video-crop'
  left: number
  top: number
  width: number
  height: number
} {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    hasSafeInputPath(candidate) &&
    candidate.operation === 'video-crop' &&
    ['left', 'top', 'width', 'height'].every(
      (key) =>
        typeof candidate[key] === 'number' &&
        Number.isInteger(candidate[key]) &&
        (candidate[key] as number) >= 0
    ) &&
    (candidate.width as number) > 0 &&
    (candidate.height as number) > 0
  )
}
function isVideoSpeedRequest(value: unknown): value is {
  inputPath: string
  operation: 'video-speed'
  speed: number
} {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    hasSafeInputPath(candidate) &&
    candidate.operation === 'video-speed' &&
    typeof candidate.speed === 'number' &&
    [0.25, 0.5, 1, 1.5, 2, 4].includes(candidate.speed)
  )
}

async function composeEmailWithAttachment(inputPath: string): Promise<void> {
  const attachmentName = basename(inputPath)
  if (process.platform !== 'darwin') {
    await shell.openExternal(
      `mailto:?subject=${encodeURIComponent(`Sharing ${attachmentName}`)}&body=${encodeURIComponent(`Please find ${attachmentName} attached.`)}`
    )
    return
  }
  const script = `on run argv
set attachmentPath to item 1 of argv
set attachmentName to item 2 of argv
tell application "Mail"
  set newMessage to make new outgoing message with properties {visible:true, subject:("Sharing " & attachmentName), content:("Please find " & attachmentName & " attached.")}
  tell newMessage
    make new attachment with properties {file name:POSIX file attachmentPath} at after the last paragraph
  end tell
  activate
end tell
end run`
  await execFileAsync('osascript', ['-e', script, '--', inputPath, attachmentName])
}

function isImagesToPdfRequest(value: unknown): value is ImagesToPdfRequest {
  if (!value || typeof value !== 'object') return false
  const inputPaths = (value as Record<string, unknown>).inputPaths
  return (
    Array.isArray(inputPaths) &&
    inputPaths.length >= 1 &&
    inputPaths.length <= 100 &&
    inputPaths.every(
      (inputPath) =>
        typeof inputPath === 'string' &&
        inputPath.length > 0 &&
        inputPath.length <= 16_384 &&
        !inputPath.includes('\0')
    )
  )
}

function hasSafeInputPath(value: Record<string, unknown>): value is Record<string, unknown> & {
  inputPath: string
} {
  return (
    typeof value.inputPath === 'string' &&
    value.inputPath.length > 0 &&
    value.inputPath.length <= 16_384 &&
    !value.inputPath.includes('\0')
  )
}

function isImageResizeRequest(value: unknown): value is ImageResizeRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  const dimension = (item: unknown): boolean =>
    item === undefined ||
    (typeof item === 'number' && Number.isInteger(item) && item >= 1 && item <= 16_384)
  return (
    hasSafeInputPath(candidate) &&
    candidate.operation === 'resize' &&
    dimension(candidate.width) &&
    dimension(candidate.height) &&
    (candidate.width !== undefined || candidate.height !== undefined) &&
    ['inside', 'cover', 'fill'].includes(String(candidate.fit)) &&
    typeof candidate.withoutEnlargement === 'boolean'
  )
}

function isImageCompressionRequest(value: unknown): value is ImageCompressionRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    hasSafeInputPath(candidate) &&
    candidate.operation === 'compress' &&
    typeof candidate.quality === 'number' &&
    Number.isInteger(candidate.quality) &&
    candidate.quality >= 1 &&
    candidate.quality <= 100 &&
    (candidate.maxDimension === undefined ||
      (typeof candidate.maxDimension === 'number' &&
        Number.isInteger(candidate.maxDimension) &&
        candidate.maxDimension >= 1 &&
        candidate.maxDimension <= 16_384))
  )
}
function isImageCropRequest(value: unknown): value is ImageCropRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    hasSafeInputPath(candidate) &&
    candidate.operation === 'crop' &&
    ['left', 'top', 'width', 'height'].every(
      (key) =>
        typeof candidate[key] === 'number' &&
        Number.isInteger(candidate[key]) &&
        (candidate[key] as number) >= 0
    ) &&
    (candidate.width as number) > 0 &&
    (candidate.height as number) > 0
  )
}
function isImageEditRequest(value: unknown): value is ImageEditRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    hasSafeInputPath(candidate) &&
    candidate.operation === 'edit' &&
    [
      'rotation',
      'exposure',
      'brightness',
      'contrast',
      'highlights',
      'shadows',
      'whites',
      'blacks',
      'saturation',
      'vibrance',
      'hue',
      'temperature',
      'tint',
      'gamma'
    ].every((key) => typeof candidate[key] === 'number' && Number.isFinite(candidate[key]))
  )
}
function isImageBackgroundRemovalRequest(value: unknown): value is ImageBackgroundRemovalRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return hasSafeInputPath(candidate) && candidate.operation === 'remove-background'
}

function showRadialMenu(focus = true): void {
  if (!radialWindow) return
  // A new drag can start during the old panel's close animation. Hide the
  // reused native window first so its previous React frame can never flash.
  radialWindow.hide()
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { x, y, width, height } = display.workArea
  const padding = 12
  radialWindow.setPosition(
    Math.round(
      Math.min(Math.max(cursor.x - MENU_SIZE / 2, x + padding), x + width - MENU_SIZE - padding)
    ),
    Math.round(
      Math.min(Math.max(cursor.y - MENU_SIZE / 2, y + padding), y + height - MENU_SIZE - padding)
    )
  )
  // Do not reveal the reused renderer before it has discarded the previous
  // editor. Otherwise a stale panel can flash briefly before the wheel.
  pendingRadialMenuFocus = focus
  radialWindow.webContents.send('radial-menu:opened')
}

function showNativeDragCandidate(modifier: 'shift' | 'command', fileName?: string): void {
  if (nativeDismissTimer) clearTimeout(nativeDismissTimer)
  nativeDragCandidateVisible = true
  // Experimental: a newly shown window may not join a Finder drag already in progress.
  showRadialMenu(false)
  radialWindow?.webContents.send('radial-menu:modifier', modifier)
  if (fileName) radialWindow?.webContents.send('radial-menu:drag-file', fileName)
}

function showSettings(): void {
  showRadialMenu()
  radialWindow?.webContents.send('radial-menu:settings')
}

function createWindow(): void {
  radialWindow = new BrowserWindow({
    width: MENU_SIZE,
    height: MENU_SIZE,
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    hasShadow: false,
    ...(process.platform === 'linux' ? { icon } : { icon }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  radialWindow.setAlwaysOnTop(true, 'floating')
  radialWindow.on('blur', () => {
    if (!nativeDragCandidateVisible) radialWindow?.hide()
  })
  radialWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    radialWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    radialWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  tray = new Tray(icon)
  tray.setToolTip('Universal File Toolkit')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open radial menu',
        accelerator: 'CommandOrControl+Shift+Space',
        click: () => showRadialMenu()
      },
      {
        label: 'Open radial menu (fallback)',
        accelerator: 'CommandOrControl+Alt+Space',
        click: () => showRadialMenu()
      },
      { label: 'Settings', click: showSettings },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
  tray.on('click', () => showRadialMenu())
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')
  protocol.handle('toolkit-media', async (request) => {
    const token = new URL(request.url).hostname
    const inputPath = localMediaSources.get(token)
    if (!inputPath) return new Response('Not found', { status: 404 })
    const details = await stat(inputPath)
    const total = details.size
    const range = request.headers.get('range')
    const match = range?.match(/^bytes=(\d*)-(\d*)$/)
    const start = match?.[1] ? Number(match[1]) : 0
    const end = match?.[2] ? Math.min(Number(match[2]), total - 1) : total - 1
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      start > end ||
      end >= total
    )
      return new Response('Invalid range', {
        status: 416,
        headers: { 'Content-Range': `bytes */${total}` }
      })
    const stream = Readable.toWeb(createReadStream(inputPath, { start, end }))
    return new Response(stream as unknown as BodyInit, {
      status: match ? 206 : 200,
      headers: {
        'Content-Type': mediaMimeType(inputPath),
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        ...(match ? { 'Content-Range': `bytes ${start}-${end}/${total}` } : {})
      }
    })
  })
  if (process.platform === 'darwin') app.dock?.hide()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  createTray()
  nativeIntegration.start({
    onModifierDragCandidate: showNativeDragCandidate,
    onModifierChanged: (modifier) =>
      radialWindow?.webContents.send('radial-menu:modifier', modifier),
    onOutsideClick: ({ x, y }) => {
      if (!radialWindow?.isVisible()) return
      const bounds = radialWindow.getBounds()
      const clickedInside =
        x >= bounds.x &&
        x <= bounds.x + bounds.width &&
        y >= bounds.y &&
        y <= bounds.y + bounds.height
      if (!clickedInside) {
        nativeDragCandidateVisible = false
        radialWindow.hide()
      }
    },
    onGestureEnded: () => {
      if (!nativeDragCandidateVisible) return
      if (nativeDismissTimer) clearTimeout(nativeDismissTimer)
      nativeDismissTimer = setTimeout(() => {
        nativeDragCandidateVisible = false
        radialWindow?.hide()
      }, 160)
    },
    onStatus: (status) => console.info(`[native integration] ${status.detail}`)
  })
  for (const shortcut of shortcuts) {
    if (!globalShortcut.register(shortcut, showRadialMenu)) {
      console.error(`Unable to register ${shortcut}; it may be used by another application.`)
    }
  }
  ipcMain.handle('radial-menu:close', () => {
    nativeDragCandidateVisible = false
    radialWindow?.hide()
  })
  ipcMain.handle('email:compose', async (_, inputPathValue: unknown) => {
    if (typeof inputPathValue !== 'string' || !isAbsolute(inputPathValue))
      throw new Error('Invalid attachment path.')
    const inputPath = resolve(inputPathValue)
    const details = await stat(inputPath)
    if (!details.isFile()) throw new Error('The selected attachment is not a regular file.')
    await composeEmailWithAttachment(inputPath)
  })
  ipcMain.on('radial-menu:drop-received', () => {
    if (nativeDismissTimer) clearTimeout(nativeDismissTimer)
    nativeDragCandidateVisible = false
    // The menu was deliberately shown inactive while Finder owned the drag.
    // Once the file is dropped, editor inputs (such as Text) must receive keys.
    radialWindow?.focus()
  })
  ipcMain.on('radial-menu:ready', () => {
    if (!radialWindow || pendingRadialMenuFocus === null) return
    const focus = pendingRadialMenuFocus
    pendingRadialMenuFocus = null
    if (focus) {
      radialWindow.show()
      radialWindow.focus()
    } else {
      radialWindow.showInactive()
    }
  })
  ipcMain.handle('conversion:image', async (_, payload: unknown) => {
    if (!isImageConversionRequest(payload)) throw new Error('Invalid image conversion request.')
    return conversionManager.convertImage(payload)
  })
  ipcMain.handle('conversion:video', async (event, payload: unknown) => {
    if (!isVideoConversionRequest(payload)) throw new Error('Invalid video conversion request.')
    return conversionManager.convertVideo(payload, (percent) =>
      event.sender.send('conversion:video-progress', percent)
    )
  })
  ipcMain.handle('conversion:video-compress', async (event, payload: unknown) => {
    if (!isVideoCompressionRequest(payload)) throw new Error('Invalid video compression request.')
    return conversionManager.compressVideo(payload, (percent) =>
      event.sender.send('conversion:video-progress', percent)
    )
  })
  ipcMain.handle('conversion:audio-compress', async (event, payload: unknown) => {
    if (!isAudioCompressionRequest(payload)) throw new Error('Invalid audio compression request.')
    return conversionManager.compressAudio(payload, (percent) =>
      event.sender.send('conversion:video-progress', percent)
    )
  })
  ipcMain.handle('conversion:audio-normalize', async (event, payload: unknown) => {
    if (!isAudioNormalizeRequest(payload)) throw new Error('Invalid audio normalization request.')
    return conversionManager.normalizeAudio(payload, (percent) =>
      event.sender.send('conversion:video-progress', percent)
    )
  })
  ipcMain.handle('conversion:audio-trim', async (event, payload: unknown) => {
    if (!isAudioTrimRequest(payload)) throw new Error('Invalid audio trim request.')
    return conversionManager.trimAudio(payload, (percent) =>
      event.sender.send('conversion:video-progress', percent)
    )
  })
  ipcMain.handle('conversion:audio-bleep', async (event, payload: unknown) => { if (!isAudioBleepRequest(payload)) throw new Error('Invalid audio bleep request.'); return conversionManager.bleepAudio(payload, (percent) => event.sender.send('conversion:video-progress', percent)) })
  ipcMain.handle('conversion:video-mute', async (event, inputPath: unknown) => {
    if (typeof inputPath !== 'string' || !isAbsolute(inputPath) || inputPath.includes('\0'))
      throw new Error('Invalid video path.')
    return conversionManager.muteVideo(inputPath, (percent) =>
      event.sender.send('conversion:video-progress', percent)
    )
  })
  ipcMain.handle('conversion:video-trim', async (event, payload: unknown) => {
    if (!isVideoTrimRequest(payload)) throw new Error('Invalid video trim request.')
    return conversionManager.trimVideo(payload, (percent) =>
      event.sender.send('conversion:video-progress', percent)
    )
  })
  ipcMain.handle('conversion:video-crop', async (event, payload: unknown) => {
    if (!isVideoCropRequest(payload)) throw new Error('Invalid video crop request.')
    return conversionManager.cropVideo(payload, (percent) =>
      event.sender.send('conversion:video-progress', percent)
    )
  })
  ipcMain.handle('conversion:video-speed', async (event, payload: unknown) => {
    if (!isVideoSpeedRequest(payload)) throw new Error('Invalid video speed request.')
    return conversionManager.changeVideoSpeed(payload, (percent) =>
      event.sender.send('conversion:video-progress', percent)
    )
  })
  ipcMain.handle('video:metadata', async (_, inputPath: unknown) => {
    if (typeof inputPath !== 'string' || !isAbsolute(inputPath) || inputPath.includes('\0'))
      throw new Error('Invalid video path.')
    return conversionManager.getVideoMetadata(inputPath)
  })
  ipcMain.handle('video:source-url', async (_, inputPath: unknown) => {
    if (typeof inputPath !== 'string' || !isAbsolute(inputPath) || inputPath.includes('\0'))
      throw new Error('Invalid video path.')
    const path = await conversionManager.createVideoPreview(resolve(inputPath))
    const details = await stat(path)
    if (!details.isFile()) throw new Error('The selected video is not a regular file.')
    const token = randomUUID()
    localMediaSources.set(token, path)
    return `toolkit-media://${token}/${encodeURIComponent(basename(path))}`
  })
  ipcMain.handle('video:poster', async (_, inputPath: unknown) => {
    if (typeof inputPath !== 'string' || !isAbsolute(inputPath) || inputPath.includes('\0'))
      throw new Error('Invalid video path.')
    return conversionManager.createVideoPoster(inputPath)
  })
  ipcMain.handle('audio:source-url', async (_, inputPath: unknown) => {
    if (typeof inputPath !== 'string' || !isAbsolute(inputPath) || inputPath.includes('\0'))
      throw new Error('Invalid audio path.')
    const path = await conversionManager.createAudioPreview(resolve(inputPath))
    const token = randomUUID()
    localMediaSources.set(token, path)
    return `toolkit-media://${token}/${encodeURIComponent(basename(path))}`
  })
  ipcMain.handle('conversion:archive', async (_, inputPaths: unknown) => {
    if (
      !Array.isArray(inputPaths) ||
      inputPaths.length < 1 ||
      inputPaths.length > 100 ||
      !inputPaths.every(
        (inputPath) =>
          typeof inputPath === 'string' && isAbsolute(inputPath) && !inputPath.includes('\0')
      )
    )
      throw new Error('Invalid archive input path.')
    return conversionManager.archiveFiles(inputPaths)
  })
  ipcMain.handle('conversion:images-to-pdf', async (_, payload: unknown) => {
    if (!isImagesToPdfRequest(payload)) throw new Error('Invalid PDF conversion request.')
    return conversionManager.convertImagesToPdf(payload)
  })
  ipcMain.handle('conversion:image-resize', async (_, payload: unknown) => {
    if (!isImageResizeRequest(payload)) throw new Error('Invalid image resize request.')
    return conversionManager.resizeImage(payload)
  })
  ipcMain.handle('conversion:image-compress', async (_, payload: unknown) => {
    if (!isImageCompressionRequest(payload)) throw new Error('Invalid image compression request.')
    return conversionManager.compressImage(payload)
  })
  ipcMain.handle('conversion:image-crop', async (_, payload: unknown) => {
    if (!isImageCropRequest(payload)) throw new Error('Invalid image crop request.')
    return conversionManager.cropImage(payload)
  })
  ipcMain.handle('conversion:image-edit', async (_, payload: unknown) => {
    if (!isImageEditRequest(payload)) throw new Error('Invalid image edit request.')
    return conversionManager.editImage(payload)
  })
  ipcMain.handle('conversion:image-remove-background', async (_, payload: unknown) => {
    if (!isImageBackgroundRemovalRequest(payload))
      throw new Error('Invalid background removal request.')
    return conversionManager.removeBackground(payload)
  })
  ipcMain.handle('image:preview', async (_, inputPath: unknown) => {
    if (typeof inputPath !== 'string' || !isAbsolute(inputPath))
      throw new Error('Invalid preview path.')
    const path = resolve(inputPath)
    const details = await stat(path)
    if (!details.isFile() || details.size > 20 * 1024 * 1024)
      throw new Error('Preview is unavailable for this file.')
    const metadata = await sharp(path, { failOn: 'warning' }).metadata()
    if (!metadata.format) throw new Error('Preview is not a valid image.')
    const bytes = await readFile(path)
    const mime = metadata.format === 'jpeg' ? 'image/jpeg' : `image/${metadata.format}`
    return `data:${mime};base64,${bytes.toString('base64')}`
  })
  ipcMain.handle('image:metadata', async (_, inputPath: unknown) => {
    if (typeof inputPath !== 'string' || !isAbsolute(inputPath))
      throw new Error('Invalid metadata path.')
    const metadata = await sharp(resolve(inputPath), { failOn: 'warning' }).metadata()
    return Object.entries({
      Format: metadata.format?.toUpperCase(),
      Width: metadata.width,
      Height: metadata.height,
      'Color space': metadata.space,
      'Bits per sample': metadata.depth,
      Orientation: metadata.orientation,
      Density: metadata.density,
      'Has alpha': metadata.hasAlpha ? 'Yes' : 'No',
      'ICC profile': metadata.icc ? 'Present' : undefined,
      EXIF: metadata.exif ? 'Present' : undefined
    })
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => ({ key, value: String(value) }))
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    showRadialMenu()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // The tray utility remains active without an open radial window.
})

app.on('will-quit', () => {
  nativeIntegration.stop()
  if (nativeDismissTimer) clearTimeout(nativeDismissTimer)
  globalShortcut.unregisterAll()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
